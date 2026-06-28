import { NextResponse, type NextRequest } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { createRouteClient } from "@/lib/supabase/server"

// Ensure we run on the Node.js runtime so cookie-based SSR works reliably.
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      // Auth happens here: the first request from the client still carries the
      // session cookies, so we can verify the user before issuing a token.
      onBeforeGenerateToken: async () => {
        const supabase = await createRouteClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          throw new Error("Unauthorized")
        }

        return {
          // Vercel Blob enforces the real content-type server-side via this list.
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
          tokenPayload: JSON.stringify({ userId: user.id }),
        }
      },
      // The DB row is created by the authenticated /api/background/record route.
      // This cookieless completion callback only acknowledges the upload.
      onUploadCompleted: async () => {
        console.log("Background upload completed")
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error("Background upload route error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    )
  }
}
