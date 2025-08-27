import { handleUpload, type HandleUploadBody } from "@vercel/blob"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      },
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string, clientPayload) => {
        return {
          allowedContentTypes: ["video/mp4"],
          tokenPayload: JSON.stringify({
            userId: user.id,
            uploadType: "video",
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload, clientPayload }) => {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          const cookieUserId = user?.id ?? null

          const tokenData = tokenPayload ? JSON.parse(tokenPayload) : {}
          const userId = cookieUserId || tokenData.userId
          if (!userId) throw new Error("Missing user id for video insert")

          const clientData = JSON.parse(clientPayload || "{}")

          let backgroundUrl = null
          let backgroundType = null

          if (clientData.projectId) {
            const { data: project } = await supabase
              .from("projects")
              .select("video_settings")
              .eq("id", clientData.projectId)
              .single()

            if (project?.video_settings?.background) {
              const background = project.video_settings.background
              if (background.type === "preset") {
                backgroundUrl = `/backgrounds/${background.value}.jpg`
                backgroundType = "preset"
              } else if (background.type === "upload" && background.url) {
                backgroundUrl = background.url
                backgroundType = "upload"
              } else if (background.type === "generated" && background.url) {
                backgroundUrl = background.url
                backgroundType = "generated"
              }
            }
          }

          const { error: dbError } = await supabase.from("generated_videos").insert({
            user_id: userId,
            url: blob.url,
            format: "mp4",
            quality: clientData.quality || "1080p",
            duration: clientData.duration || 60,
            size: blob.size,
            project_id: clientData.projectId,
            background_url: backgroundUrl,
            background_type: backgroundType,
          })

          if (dbError) {
            console.error("Database error:", dbError)
            throw new Error("Failed to save video metadata")
          }

          console.log("✅ Video metadata saved successfully")
        } catch (error) {
          console.error("Error in onUploadCompleted:", error)
          throw error
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error("Video upload error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 })
  }
}
