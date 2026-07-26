import { createServerClient } from "@supabase/ssr"
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
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
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
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }
    // Honor a `next` param only when it resolves to this same origin. Prefix
    // blacklisting is not sufficient here: the WHATWG URL parser treats "\"
    // like "/" for http(s), so "/\evil.com" would slip past a "//" check and
    // resolve to https://evil.com/. Resolving and comparing origins is exact.
    const nextParam = requestUrl.searchParams.get("next")
    let redirectTo = "/"
    if (nextParam) {
      try {
        const candidate = new URL(nextParam, requestUrl.origin)
        if (candidate.origin === requestUrl.origin) {
          redirectTo = candidate.pathname + candidate.search + candidate.hash
        }
      } catch {
        // Malformed `next` — fall through to "/".
      }
    }
    return NextResponse.redirect(new URL(redirectTo, request.url))
  }

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes - block if not authenticated. APIs get a JSON 401 instead
  // of a 307 redirect to the HTML login page.
  if (!isPublicRoute && !user) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const redirectUrl = new URL("/auth/login", request.url)
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}
