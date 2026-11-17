import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Check if Supabase environment variables are available
export const isSupabaseConfigured =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Routes reachable without a session: the marketing landing page plus the
  // auth screens. Everything else requires an authenticated user.
  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/auth/login") ||
    pathname.startsWith("/auth/sign-up") ||
    pathname === "/auth/callback"

  // If Supabase is not configured, fail closed in production (block protected
  // routes) but stay out of the way during local dev so the app still boots.
  if (!isSupabaseConfigured) {
    if (process.env.NODE_ENV === "production" && !isPublicRoute) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }
    return NextResponse.next({
      request,
    })
  }

  // Everything @supabase/ssr asked us to write to the response (session cookies,
  // cookie clears, no-store headers), accumulated across setAll calls and
  // replayed onto EVERY response this function returns. Two reasons:
  //  1. Redirects and JSON 401s are brand-new response objects. A bare
  //     NextResponse.redirect() silently drops what setAll wrote, e.g. the
  //     session cookies from the OAuth/PKCE code exchange (the user lands
  //     signed out and the single-use code is burned) or the cookie clears
  //     after a failed refresh.
  //  2. The library hands over the `Cache-Control: private, no-store…` headers
  //     only on its FIRST setAll call per client (later calls get `{}`), and one
  //     request can call setAll more than once (e.g. a refresh that succeeds,
  //     then a /user failure that clears the session). Rebuilding the response
  //     per call, which is required so Server Components see the refreshed
  //     request cookies, would otherwise discard the earlier cookies and
  //     headers. Those headers MUST accompany any response carrying auth cookies
  //     so a CDN can never serve one user's session token to another.
  const authCookies = new Map<string, { value: string; options: CookieOptions }>()
  const authHeaders: Record<string, string> = {}
  const withAuthState = (response: NextResponse): NextResponse => {
    authCookies.forEach(({ value, options }, name) => response.cookies.set(name, value, options))
    Object.entries(authHeaders).forEach(([key, value]) => response.headers.set(key, value))
    return response
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            authCookies.set(name, { value, options })
          })
          Object.assign(authHeaders, headers)
          supabaseResponse = withAuthState(
            NextResponse.next({
              request,
            }),
          )
        },
      },
    },
  )

  // Handle the OAuth/PKCE code exchange only on the dedicated callback route.
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")

  if (code && pathname === "/auth/callback") {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error("Auth code exchange failed:", error.message)
      return withAuthState(NextResponse.redirect(new URL("/auth/login", request.url)))
    }
    // Honor a `next` param only when it resolves to this same origin. Prefix
    // blacklisting is not sufficient here: the WHATWG URL parser treats "\"
    // like "/" for http(s), so "/\evil.com" would slip past a "//" check and
    // resolve to https://evil.com/. Resolving and comparing origins catches that.
    //
    // Redirect to the validated URL object ITSELF, never to a string rebuilt from
    // its parts. The parser also collapses dot-segments, so "/.//evil.com" has
    // origin === ours but pathname "//evil.com"; re-resolving that pathname
    // against the base is a scheme-relative reference that lands on evil.com.
    const nextParam = requestUrl.searchParams.get("next")
    let destination = new URL("/", requestUrl.origin)
    if (nextParam) {
      try {
        const candidate = new URL(nextParam, requestUrl.origin)
        if (candidate.origin === requestUrl.origin) {
          destination = candidate
        }
      } catch {
        // Malformed `next` — fall through to "/".
      }
    }
    // A new redirect response: it must carry the session cookies the exchange
    // just wrote, or the user is sent onward signed out.
    return withAuthState(NextResponse.redirect(destination))
  }

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes - block if not authenticated. APIs get a JSON 401 instead
  // of a 307 redirect to the HTML login page.
  if (!isPublicRoute && !user) {
    if (pathname.startsWith("/api")) {
      return withAuthState(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }
    const redirectUrl = new URL("/auth/login", request.url)
    return withAuthState(NextResponse.redirect(redirectUrl))
  }

  return supabaseResponse
}
