/** @type {import('next').NextConfig} */

// Supabase origin for connect-src (realtime/auth/storage). Falls back to the
// wildcard so a missing build-time env var never produces a broken CSP.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseConnect = supabaseUrl ? `${supabaseUrl} ${supabaseUrl.replace("https://", "wss://")}` : ""

// CSP is scoped to what the app actually loads. IMPORTANT: it intentionally
// allows the FFmpeg.wasm pipeline — script/worker from blob: + unpkg CDN and
// 'wasm-unsafe-eval' — and must NOT use COEP require-corp (single-threaded UMD
// core needs cross-origin fetches), or browser-side video generation breaks.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://unpkg.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  // `blob:` is REQUIRED: FFmpeg.wasm's toBlobURL turns the core/wasm into blob:
  // URLs that ffmpeg.load() (and the audio download) then fetch — without it,
  // browser-side video generation fails with "Failed to fetch".
  // The @vercel/blob client upload() routes through https://vercel.com/api/blob/
  // (the upload proxy) and serves/finalizes via *.vercel-storage.com — BOTH are
  // REQUIRED in connect-src or the final video upload is blocked and hangs at 85%.
  `connect-src 'self' blob: https://unpkg.com https://vercel.com https://*.vercel-storage.com https://*.supabase.co wss://*.supabase.co ${supabaseConnect}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .join("; ")
  .replace(/\s+/g, " ")
  .trim()

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

const nextConfig = {
  typescript: {
    // The codebase is type-clean; let the build enforce it (was hiding 11 errors).
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
