import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getRouteUser } from "@/lib/supabase/server"

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
    const { user } = await getRouteUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Parse the client payload from the second arg (may be null/undefined)
        const c = clientPayload ? JSON.parse(clientPayload) : {}

        // Only allow logged-in users to upload into their per-user prefix
        const allowedPrefix = `users/${userId}/videos/`
        if (!pathname.startsWith(allowedPrefix)) {
          throw new Error("Invalid upload path")
        }

        return {
          allowedContentTypes: ["video/mp4"],
          maximumSizeInBytes: 1_500_000_000, // ~1.5 GB
          tokenPayload: JSON.stringify({
            userId,
            projectId: c.projectId ?? null,
            quality: c.quality ?? "1080p",
            duration: c.duration ?? 60,
          }),
        }
      },

      onUploadCompleted: async () => {
        // Database insert handled by the separate authenticated /api/video/record route.
      },
    })

    // Hand the token back to the client
    return NextResponse.json(jsonResponse)
  } catch (e) {
    console.error("Video upload route error:", e)
    return NextResponse.json({ error: "Upload route failed" }, { status: 400 })
  }
}
