import { NextResponse, type NextRequest } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getRouteUser } from "@/lib/supabase/server"

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
    // Auth up front (the first request from the client still carries the session
    // cookies) so an unauthenticated caller gets a JSON 401 like every other
    // route, instead of a 400 from a thrown error inside handleUpload.
    const { user } = await getRouteUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Scope every background to the caller's own prefix, exactly as
        // /api/video/upload does. Without this the signed token is valid for
        // ANY key in the shared store, so a caller could squat (or reserve)
        // paths inside another tenant's prefix, and background URLs were
        // guessable enough to be claimed via /api/background/record.
        const allowedPrefix = `users/${userId}/backgrounds/`
        if (!pathname.startsWith(allowedPrefix)) {
          throw new Error("Invalid upload path")
        }

        return {
          // Vercel Blob enforces the real content-type server-side via this list.
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
          maximumSizeInBytes: 25_000_000,
          // The store's pathname namespace is global and flat, and overwrite is
          // off by default — without a random suffix the second user to upload
          // "photo.png" gets an unrecoverable hard failure.
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId }),
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
    // Fixed message — never echo internals (Supabase config, blob token details)
    // back to the browser.
    return NextResponse.json({ error: "Upload failed" }, { status: 400 })
  }
}
