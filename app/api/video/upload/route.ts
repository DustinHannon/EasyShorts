import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
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

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string) => {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          throw new Error("Not authorized - user not authenticated")
        }

        console.log("✅ User authenticated for video upload:", user.id)

        return {
          allowedContentTypes: ["video/mp4"],
          tokenPayload: JSON.stringify({
            userId: user.id,
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload, clientPayload }) => {
        console.log("📤 Video upload completed:", blob.url)
        console.log("[v0] Upload payload debug:", { tokenPayload, clientPayload })

        try {
          const tokenData = JSON.parse(tokenPayload || "{}")
          const userId = tokenData.userId

          const clientData = JSON.parse(clientPayload || "{}")
          const projectId = clientData.projectId
          const quality = clientData.quality || "1080p"
          const duration = clientData.duration || 60

          console.log("[v0] Parsed upload data:", { userId, projectId, quality, duration })

          if (!userId || !projectId) {
            console.error("❌ Missing required payload data:", { userId, projectId })
            throw new Error("Missing required upload payload data")
          }

          // Get background info from project
          console.log("[v0] Looking up project:", { projectId, userId })
          const { data: project, error: projectError } = await supabase
            .from("projects")
            .select("*")
            .eq("id", projectId)
            .eq("user_id", userId)
            .single()

          console.log("[v0] Project lookup result:", { project, projectError })

          if (projectError || !project) {
            console.error("❌ Project not found:", { projectId, userId, projectError })
            throw new Error("Project not found")
          }

          const getBackgroundInfo = async () => {
            const videoSettings = project.video_settings || {}
            const background = videoSettings.background || "default"

            if (background.startsWith("saved-")) {
              const savedId = background.substring(6)
              if (savedId && savedId.trim() !== "") {
                try {
                  const { data, error } = await supabase.from("backgrounds").select("url").eq("id", savedId).single()
                  if (!error && data && data.url) {
                    return { url: data.url, type: "saved" }
                  }
                } catch (error) {
                  console.warn("⚠️ Error fetching saved background:", error)
                }
              }
            }

            if (background.startsWith("generated-")) {
              const index = Number.parseInt(background.split("-")[1], 10)
              const generatedUrl = videoSettings.customBackgrounds?.[index]
              if (generatedUrl) {
                return { url: generatedUrl, type: "generated" }
              }
            }

            const backgroundMap: Record<string, string> = {
              default: "/abstract-background.png",
              nature: "/serene-mountain-lake.png",
              city: "/vibrant-city-skyline.png",
              space: "/space-stars.png",
            }

            const resolvedUrl = backgroundMap[background] || "/abstract-background.png"
            return { url: resolvedUrl, type: "preset" }
          }

          const backgroundInfo = await getBackgroundInfo()
          console.log("[v0] Background info resolved:", backgroundInfo)

          // Save video record to database
          const videoData = {
            project_id: projectId,
            user_id: userId,
            url: blob.url,
            format: "mp4",
            quality: quality,
            duration: duration,
            size: blob.size,
            background_url: backgroundInfo.url,
            background_type: backgroundInfo.type,
          }

          console.log("💾 Attempting to save video metadata:", videoData)

          const { data: insertedVideo, error: insertError } = await supabase
            .from("generated_videos")
            .insert(videoData)
            .select()

          console.log("[v0] Database insert result:", { insertedVideo, insertError })

          if (insertError) {
            console.error("❌ Database insert error:", insertError)
            throw new Error(`Database insert failed: ${insertError.message}`)
          }

          console.log("✅ Video metadata saved successfully:", insertedVideo)

          // Update project status to completed
          await supabase
            .from("projects")
            .update({
              status: "completed",
              progress: 100,
              progress_stage: "complete",
              progress_message: "Video created successfully!",
            })
            .eq("id", projectId)

          console.log("✅ Video metadata saved to database")
        } catch (error) {
          console.error("❌ Error saving video metadata:", error)
          console.error("[v0] Full error details:", error)
          throw new Error("Could not save video metadata")
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error("❌ Client upload error:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
