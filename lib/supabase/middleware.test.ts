import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextRequest } from "next/server"

// `isSupabaseConfigured` is evaluated when middleware.ts is first imported, so
// the env must exist before that import (vi.hoisted runs before the imports).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://testproj.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key"
})

// Default to the REAL @supabase/ssr + supabase-js (only `fetch` is stubbed, so
// no network). The last describe block swaps in a fake client for one call to
// pin the exact setAll(cookies, headers) sequences the library is allowed to
// produce, including ones that are hard to trigger for real.
vi.mock("@supabase/ssr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/ssr")>()
  return { ...actual, createServerClient: vi.fn(actual.createServerClient) }
})

import { updateSession } from "./middleware"

const ORIGIN = "https://app.test"
const SESSION_COOKIE = "sb-testproj-auth-token"
const VERIFIER_COOKIE = "sb-testproj-auth-token-code-verifier"

const user = {
  id: "user-1",
  aud: "authenticated",
  role: "authenticated",
  email: "a@b.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
}
const nowSeconds = () => Math.floor(Date.now() / 1000)
const makeSession = (expiresAt: number, refreshToken = "rt-old") => ({
  access_token: "header.payload.signature",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: expiresAt,
  refresh_token: refreshToken,
  user,
})
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

// Cookie values are written exactly as @supabase/ssr writes them: auth-js
// JSON-stringifies the stored item and ssr base64url-encodes it with a
// "base64-" prefix. A raw value would not be read back.
const encodeCookieValue = (value: unknown) => `base64-${Buffer.from(JSON.stringify(value)).toString("base64url")}`
const VERIFIER = `${VERIFIER_COOKIE}=${encodeCookieValue("verifier-value/email")}`
const sessionCookie = (expiresAt: number) => `${SESSION_COOKIE}=${encodeCookieValue(makeSession(expiresAt))}`

type Routes = {
  pkce?: () => Response
  refresh?: () => Response
  user?: () => Response
}

/** Stubs `fetch` for the three Supabase auth endpoints; anything else fails loudly. */
function stubSupabase(routes: Routes) {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("grant_type=pkce") && routes.pkce) return routes.pkce()
      if (url.includes("grant_type=refresh_token") && routes.refresh) return routes.refresh()
      if (url.endsWith("/auth/v1/user") && routes.user) return routes.user()
      throw new Error(`unexpected Supabase call: ${url}`)
    }),
  )
  return calls
}

function req(path: string, cookie?: string) {
  return new NextRequest(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined)
}

/** The raw Set-Cookie header for `name` — what the browser actually receives. */
function setCookieHeader(res: Response, name: string) {
  return res.headers.getSetCookie().find((header) => header.startsWith(`${name}=`))
}

function expectNoStore(res: Response) {
  expect(res.headers.get("cache-control")).toContain("no-store")
  expect(res.headers.get("pragma")).toBe("no-cache")
}

beforeEach(() => {
  // mockReset (not mockClear) also drains any unconsumed mockImplementationOnce,
  // so a fake installed by a failing test can never leak into the next one.
  vi.mocked(createServerClient).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("updateSession /auth/callback (real @supabase/ssr, stubbed token endpoint)", () => {
  const tokenOk = () => json(200, makeSession(nowSeconds() + 3600, "rt-new"))

  it("a successful exchange redirects WITH the session cookie, correct attributes and no-store headers", async () => {
    const calls = stubSupabase({ pkce: tokenOk })

    const res = await updateSession(req("/auth/callback?code=abc123&next=/dashboard", VERIFIER))

    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain("/auth/v1/token?grant_type=pkce")
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`)
    // The whole point: the new session must ride on the redirect response...
    const session = setCookieHeader(res, SESSION_COOKIE)
    expect(session).toMatch(/^sb-testproj-auth-token=base64-/)
    expect(session).toContain("Path=/")
    expect(session).toContain("SameSite=lax")
    expect(session).toMatch(/Max-Age=\d{6,}/)
    // ...and a CDN must be told never to cache a response that carries it.
    expectNoStore(res)
  })

  it("a failed exchange redirects to login and sets no session cookie", async () => {
    stubSupabase({ pkce: () => json(400, { error: "invalid_grant", error_description: "bad code" }) })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await updateSession(req("/auth/callback?code=bad", VERIFIER))

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(`${ORIGIN}/auth/login`)
    expect(setCookieHeader(res, SESSION_COOKIE)).toBeUndefined()
    errorSpy.mockRestore()
  })

  it("keeps a same-origin `next` including its query string and fragment", async () => {
    stubSupabase({ pkce: tokenOk })

    const res = await updateSession(req(`/auth/callback?code=abc123&next=${encodeURIComponent("/gallery?tab=a#top")}`, VERIFIER))

    expect(res.headers.get("location")).toBe(`${ORIGIN}/gallery?tab=a#top`)
  })

  // Every one of these must stay on our own origin. The dot-segment cases are
  // the regression: the URL parser collapses "/.//evil.com" to the pathname
  // "//evil.com", which the old code re-resolved against the base URL as a
  // scheme-relative reference, i.e. https://evil.com/.
  it.each([
    "/.//evil.com",
    "/a/..//evil.com",
    "//evil.com",
    "https://evil.com",
    "http://evil.com/x",
    "/\\evil.com",
    "/%5Cevil.com",
    "javascript:alert(1)",
  ])("never redirects off-origin for next=%s", async (next) => {
    stubSupabase({ pkce: tokenOk })

    const res = await updateSession(req(`/auth/callback?code=abc123&next=${encodeURIComponent(next)}`, VERIFIER))

    expect(res.status).toBe(307)
    expect(new URL(res.headers.get("location") ?? "").origin).toBe(ORIGIN)
  })
})

describe("updateSession session handling (real @supabase/ssr, stubbed auth endpoints)", () => {
  const refreshOk = () => json(200, makeSession(nowSeconds() + 3600, "rt-new"))
  const refreshDead = () =>
    json(400, { error: "invalid_grant", error_description: "Invalid Refresh Token: Already Used", code: "refresh_token_already_used" })

  it("anonymous request to a protected page: plain redirect, nothing set", async () => {
    const calls = stubSupabase({})

    const res = await updateSession(req("/dashboard"))

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(`${ORIGIN}/auth/login`)
    expect(res.headers.getSetCookie()).toHaveLength(0)
    expect(res.headers.get("cache-control")).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("anonymous request to a public page passes straight through", async () => {
    stubSupabase({})

    const res = await updateSession(req("/"))

    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie()).toHaveLength(0)
    expect(res.headers.get("cache-control")).toBeNull()
  })

  it("an expired session is refreshed: new cookie + no-store on the response, and forwarded to Server Components", async () => {
    stubSupabase({ refresh: refreshOk, user: () => json(200, user) })
    const stale = sessionCookie(nowSeconds() - 10)

    const res = await updateSession(req("/dashboard", stale))

    expect(res.status).toBe(200)
    expect(setCookieHeader(res, SESSION_COOKIE)).toMatch(/^sb-testproj-auth-token=base64-/)
    expectNoStore(res)
    // request.cookies.set must reach the downstream request, otherwise route
    // handlers would re-use the already-rotated refresh token.
    const forwarded = res.headers.get("x-middleware-request-cookie") ?? ""
    expect(forwarded).toContain(`${SESSION_COOKIE}=base64-`)
    expect(forwarded).not.toContain(stale.split("=")[1])
  })

  it("a dead refresh token on a page redirect clears the stale cookie and sends no-store", async () => {
    stubSupabase({ refresh: refreshDead, user: () => json(401, { msg: "unauthorized" }) })

    const res = await updateSession(req("/dashboard", sessionCookie(nowSeconds() - 10)))

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(`${ORIGIN}/auth/login`)
    expect(setCookieHeader(res, SESSION_COOKIE)).toContain("Max-Age=0")
    expectNoStore(res)
  })

  it("a dead refresh token on an API call returns a JSON 401 that also clears the cookie", async () => {
    stubSupabase({ refresh: refreshDead, user: () => json(401, { msg: "unauthorized" }) })

    const res = await updateSession(req("/api/generate-script", sessionCookie(nowSeconds() - 10)))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized" })
    expect(setCookieHeader(res, SESSION_COOKIE)).toContain("Max-Age=0")
    expectNoStore(res)
  })

  it("a refresh that succeeds but is followed by a /user failure still delivers the rotated tokens on the redirect", async () => {
    // The refresh token was consumed upstream; dropping the new session here
    // would leave the browser holding a token that no longer works.
    stubSupabase({ refresh: refreshOk, user: () => json(500, { msg: "boom" }) })

    const res = await updateSession(req("/dashboard", sessionCookie(nowSeconds() - 10)))

    expect(res.status).toBe(307)
    expect(setCookieHeader(res, SESSION_COOKIE)).toMatch(/^sb-testproj-auth-token=base64-/)
    expectNoStore(res)
  })
})

describe("updateSession cookie/header carry-over (fake client)", () => {
  type SetAll = (
    cookies: { name: string; value: string; options: CookieOptions }[],
    headers: Record<string, string>,
  ) => Promise<void> | void

  const CACHE_HEADERS = {
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Expires: "0",
    Pragma: "no-cache",
  }
  const SET_OPTIONS: CookieOptions = { path: "/", maxAge: 400 * 24 * 60 * 60, sameSite: "lax" }
  const CLEAR_OPTIONS: CookieOptions = { path: "/", maxAge: 0, sameSite: "lax" }

  /** Installs a fake Supabase client for exactly one `createServerClient` call. */
  function useFakeClient(handlers: {
    exchange?: (setAll: SetAll) => Promise<{ error: { message: string } | null }>
    getUser?: (setAll: SetAll) => Promise<{ id: string } | null>
  }) {
    vi.mocked(createServerClient).mockImplementationOnce(((_url: string, _key: string, options?: { cookies?: unknown }) => {
      const cookies = options?.cookies as { setAll?: SetAll } | undefined
      const setAll = cookies?.setAll
      if (!setAll) throw new Error("updateSession must pass a setAll cookie method")
      return {
        auth: {
          exchangeCodeForSession: async () => (handlers.exchange ? handlers.exchange(setAll) : { error: null }),
          getUser: async () => ({ data: { user: handlers.getUser ? await handlers.getUser(setAll) : null } }),
        },
      }
    }) as unknown as typeof createServerClient)
  }

  it("keeps cookies, attributes AND cache headers from EVERY setAll call on the callback redirect", async () => {
    // @supabase/ssr hands over the cache headers only on the FIRST setAll call
    // of a client; a later call gets `{}`. Both calls' cookies must survive.
    useFakeClient({
      exchange: async (setAll) => {
        await setAll([{ name: "sb-x-auth-token-code-verifier", value: "", options: CLEAR_OPTIONS }], CACHE_HEADERS)
        await setAll([{ name: "sb-x-auth-token", value: "session-value", options: SET_OPTIONS }], {})
        return { error: null }
      },
    })

    const res = await updateSession(req("/auth/callback?code=abc"))

    expect(res.status).toBe(307)
    expect(setCookieHeader(res, "sb-x-auth-token")).toMatch(/^sb-x-auth-token=session-value; .*Path=\/.*SameSite=lax/)
    expect(setCookieHeader(res, "sb-x-auth-token-code-verifier")).toContain("Max-Age=0")
    expect(res.headers.get("cache-control")).toBe(CACHE_HEADERS["Cache-Control"])
    expect(res.headers.get("expires")).toBe("0")
    expect(res.headers.get("pragma")).toBe("no-cache")
  })

  it("a failed exchange still delivers cookie clears and no-store on the login redirect", async () => {
    useFakeClient({
      exchange: async (setAll) => {
        await setAll([{ name: "sb-x-auth-token-code-verifier", value: "", options: CLEAR_OPTIONS }], CACHE_HEADERS)
        return { error: { message: "invalid grant" } }
      },
    })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await updateSession(req("/auth/callback?code=abc"))

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(`${ORIGIN}/auth/login`)
    expect(setCookieHeader(res, "sb-x-auth-token-code-verifier")).toContain("Max-Age=0")
    expectNoStore(res)
    errorSpy.mockRestore()
  })

  it("keeps cookies AND cache headers from every setAll call on a normal pass-through", async () => {
    useFakeClient({
      getUser: async (setAll) => {
        await setAll([{ name: "a", value: "1", options: SET_OPTIONS }], CACHE_HEADERS)
        await setAll([{ name: "b", value: "2", options: SET_OPTIONS }], {})
        return { id: "user-1" }
      },
    })

    const res = await updateSession(req("/dashboard"))

    expect(res.status).toBe(200)
    expect(setCookieHeader(res, "a")).toMatch(/^a=1;/)
    expect(setCookieHeader(res, "b")).toMatch(/^b=2;/)
    expect(res.headers.get("cache-control")).toBe(CACHE_HEADERS["Cache-Control"])
  })

  it("a later setAll for the same cookie name wins", async () => {
    useFakeClient({
      getUser: async (setAll) => {
        await setAll([{ name: "a", value: "old", options: SET_OPTIONS }], CACHE_HEADERS)
        await setAll([{ name: "a", value: "new", options: SET_OPTIONS }], {})
        return { id: "user-1" }
      },
    })

    const res = await updateSession(req("/dashboard"))

    expect(res.headers.getSetCookie().filter((header) => header.startsWith("a="))).toHaveLength(1)
    expect(setCookieHeader(res, "a")).toMatch(/^a=new;/)
  })

  it("a chunked cookie that shrinks across two setAll calls ends with the dropped chunk cleared", async () => {
    // Large sessions are split into name.0, name.1, ... A later write with fewer
    // chunks clears the surplus one; accumulating must not resurrect it.
    useFakeClient({
      getUser: async (setAll) => {
        await setAll(
          [
            { name: "a.0", value: "x0", options: SET_OPTIONS },
            { name: "a.1", value: "x1", options: SET_OPTIONS },
            { name: "a.2", value: "x2", options: SET_OPTIONS },
          ],
          CACHE_HEADERS,
        )
        await setAll(
          [
            { name: "a.2", value: "", options: CLEAR_OPTIONS },
            { name: "a.0", value: "y0", options: SET_OPTIONS },
            { name: "a.1", value: "y1", options: SET_OPTIONS },
          ],
          {},
        )
        return { id: "user-1" }
      },
    })

    const res = await updateSession(req("/dashboard"))

    expect(setCookieHeader(res, "a.0")).toMatch(/^a\.0=y0;/)
    expect(setCookieHeader(res, "a.1")).toMatch(/^a\.1=y1;/)
    expect(setCookieHeader(res, "a.2")).toMatch(/^a\.2=;.*Max-Age=0/)
    expect(res.headers.get("cache-control")).toBe(CACHE_HEADERS["Cache-Control"])
  })
})
