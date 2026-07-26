import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"

// Renamed from the deprecated `middleware` file convention (Next 16). The file
// is `proxy.ts` and the export is `proxy`; the `config.matcher` contract below
// is unchanged. This is still the app's only auth gate — see lib/supabase/middleware.ts.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - fonts/ (public font files fetched by the client video processor)
     * - static asset extensions (images + fonts)
     * Dots are escaped so they match literally instead of acting as regex
     * wildcards (an unescaped "." made the auth-bypass wider than intended).
     */
    "/((?!_next/static|_next/image|favicon\\.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff|woff2)$).*)",
  ],
}
