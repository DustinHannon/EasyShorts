import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob"
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
        // Only attempt DB write when the upload fully finishes
        // If the generation fails, your client should not call upload at all
        try {
          const payload = tokenPayload ? JSON.parse(tokenPayload) : {}
          const uid: string | undefined = payload.userId
          if (!uid) throw new Error("Missing userId in token payload")

          // Optional: derive project settings here if you need them
          let backgroundUrl: string | null = null
          let backgroundType: string | null = null

          if (payload.projectId) {
            const { data: project, error: projErr } = await supabase
              .from("projects")
              .select("video_settings")
              .eq("id", payload.projectId)
              .single()

            if (!projErr && project?.video_settings?.background) {
              const bg = project.video_settings.background
              if (bg.type === "preset" && bg.value) {
                backgroundUrl = `/backgrounds/${bg.value}.jpg`
                backgroundType = "preset"
              } else if ((bg.type === "upload" || bg.type === "generated") && bg.url) {
                backgroundUrl = bg.url
                backgroundType = bg.type
              }
            }
          }

          const { error: dbError } = await supabase.from("generated_videos").insert({
            user_id: uid,
            url: blob.url,
            format: "mp4",
            quality: payload.quality ?? "1080p",
            duration: payload.duration ?? 60,
            size: blob.size,
            project_id: payload.projectId ?? null,
            background_url: backgroundUrl,
            background_type: backgroundType,
          })

          if (dbError) {
            // Log server-side so the client still gets a 200 for the token step
            console.error("Video insert error:", dbError)
            // Rethrow so it shows up in logs
            throw dbError
          }
        } catch (e) {
          console.error("onUploadCompleted error:", e)
          // Swallow here so token flow is not broken. The upload has already succeeded.
        }
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
