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

  const isAuthRoute =
    pathname.startsWith("/auth/login") ||
    pathname.startsWith("/auth/sign-up") ||
    pathname === "/auth/callback"

  // If Supabase is not configured, fail closed in production (block protected
  // routes) but stay out of the way during local dev so the app still boots.
  if (!isSupabaseConfigured) {
    if (process.env.NODE_ENV === "production" && !isAuthRoute) {
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
    // Honor a validated relative `next` param; reject anything that isn't an
    // in-app path (including protocol-relative "//host" open-redirect attempts).
    const nextParam = requestUrl.searchParams.get("next")
    const redirectTo = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/"
    return NextResponse.redirect(new URL(redirectTo, request.url))
  }

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes - block if not authenticated. APIs get a JSON 401 instead
  // of a 307 redirect to the HTML login page.
  if (!isAuthRoute && !user) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const redirectUrl = new URL("/auth/login", request.url)
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}
