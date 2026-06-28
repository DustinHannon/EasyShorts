import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { SupabaseClient, User } from "@supabase/supabase-js"

// Check if Supabase environment variables are available
export const isSupabaseConfigured =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0

function assertConfigured() {
  if (!isSupabaseConfigured) {
    // Fail fast and loud instead of returning an `as any` dummy that throws an
    // opaque "supabase.from is not a function" deep in a request handler.
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing.",
    )
  }
}

// Supabase client for Server Components / pages. Cookie writes are best-effort
// (they throw when called from a Server Component render — the middleware
// refreshes the session, so that is safe to ignore).
export async function createClient(): Promise<SupabaseClient> {
  // Read cookies first: in a statically-prerendered context this opts the route
  // into dynamic rendering (so auth pages are never prerendered at build time,
  // where the Supabase env is absent) before we assert configuration.
  const cookieStore = await cookies()
  assertConfigured()

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component — ignore; middleware refreshes the session.
        }
      },
    },
  })
}

// Supabase client for Route Handlers (app/api/**). Reads the session from
// cookies and does NOT redirect — routes must return JSON 401, not HTML.
export async function createRouteClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  assertConfigured()

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      // Route handlers don't refresh the session cookie; the middleware does.
      setAll() {},
    },
  })
}

// Convenience for route handlers: returns the route client plus the verified
// user (null when unauthenticated). Caller returns 401 JSON on a null user.
export async function getRouteUser(): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const supabase = await createRouteClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}
