import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { put } from "@vercel/blob"

export async function POST(request: NextRequest) {
  try {
    console.log("📤 Video upload API called")

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
    } = await supabase.auth.getUser()

    if (!user) {
      console.error("❌ Unauthorized video upload request")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const videoFile = formData.get("video") as File
    const projectId = formData.get("projectId") as string
    const quality = formData.get("quality") as string
    const duration = Number.parseInt(formData.get("duration") as string) || 60

    if (!videoFile || !projectId) {
      console.error("❌ Missing required parameters")
      return NextResponse.json({ error: "Missing video file or project ID" }, { status: 400 })
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single()

    if (projectError || !project) {
      console.error("❌ Project not found or access denied:", { projectId, userId: user.id })
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    console.log("✅ Project verified, uploading video...")

    // Upload to Vercel Blob storage
    const filename = `${projectId}_${Date.now()}.mp4`
    const videoBuffer = await videoFile.arrayBuffer()

    const blob = await put(filename, videoBuffer, {
      access: "public",
      contentType: "video/mp4",
    })

    console.log(`✅ Video uploaded to Blob storage: ${blob.url}`)

    const getBackgroundInfo = async () => {
      const videoSettings = project.video_settings || {}
      const background = videoSettings.background || "default"

      console.log("🖼️ Resolving background for database storage:", background)

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

      // Preset backgrounds
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

    // Save video record to database
    await supabase.from("generated_videos").insert({
      project_id: projectId,
      user_id: user.id,
      url: blob.url,
      format: "mp4",
      quality: quality || "1080p",
      duration: duration,
      size: videoFile.size,
      background_url: backgroundInfo.url,
      background_type: backgroundInfo.type,
    })

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

    return NextResponse.json({ success: true, videoUrl: blob.url })
  } catch (error) {
    console.error("❌ Video upload error:", error)
    return NextResponse.json({ error: "Failed to upload video" }, { status: 500 })
  }
}
