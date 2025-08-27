import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Ensure we run on the Node.js runtime so cookie-based SSR works reliably.
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  let body: HandleUploadBody
  try {
    // Read the body exactly once
    body = (await request.json()) as HandleUploadBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    // Build a cookie-aware Supabase server client
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {
            /* not needed for this route */
          },
          remove() {
            /* not needed for this route */
          },
        },
      },
    )

    // Check auth once here. Do not throw, return 401 JSON instead.
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = userData.user.id

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async ({ clientPayload }) => {
        // Accept whatever the client sent and enrich with server truth
        // If clientPayload is missing, fall back to an empty object
        const c = clientPayload ? JSON.parse(clientPayload as string) : {}

        // Only allow logged-in users to upload into a per-user prefix
        const allowedPrefix = `users/${userId}/videos/`

        return {
          // Restrict path so users cannot write outside their folder
          // The filename from the client is still honored within this prefix
          allowedContentTypes: ["video/mp4"],
          maximumSizeInBytes: 1_500_000_000, // ~1.5 GB, adjust if you like
          tokenPayload: JSON.stringify({
            userId,
            projectId: c.projectId ?? null,
            quality: c.quality ?? "1080p",
            duration: c.duration ?? 60,
          }),
          // Vercel Blob SDK v2 will honor this for the token
          // If you are using a custom pathname on the client, omit this
          // and let the client filename decide the tail
          pathname: allowedPrefix,
        }
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Database insert moved to separate authenticated route
        // This callback now only handles upload completion
        console.log("Upload completed:", blob.url)
      },
    })

    // Hand the token back to the client
    return NextResponse.json(jsonResponse)
  } catch (e) {
    console.error("Video upload route error:", e)
    // Returning 400/500 JSON prevents the vague "Failed to retrieve client token"
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload route failed" }, { status: 400 })
  }
}
