import { NextResponse, type NextRequest } from "next/server"
import { getRouteUser } from "@/lib/supabase/server"
import { resolveBackgroundUrl, backgroundKindOf } from "@/lib/backgrounds"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getRouteUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { url, size, projectId, quality, duration, background } = body

    // Validate url: must be a parseable URL scoped to this user's storage prefix.
    let parsedPathname: string
    try {
      parsedPathname = new URL(url).pathname
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    if (!parsedPathname.startsWith(`/users/${user.id}/`)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // Validate size: must be a positive integer.
    if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // Optional enrichment from project (scoped to the owning user).
    let background_url: string | null = null
    let background_type: string | null = null

    if (projectId) {
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .select("video_settings")
        .eq("id", projectId)
        .eq("user_id", user.id)
        .single()

      if (!projErr && project?.video_settings) {
        background_url = await resolveBackgroundUrl(project.video_settings, async (id) => {
          const { data } = await supabase
            .from("backgrounds")
            .select("url")
            .eq("id", id)
            .eq("user_id", user.id)
            .single()
          return data?.url ?? null
        })
        background_type = backgroundKindOf(project.video_settings?.background)
      }
    }

    // Allow override via supplied 'background' if you send one
    if (background?.url) {
      background_url = background.url
      background_type = background.type ?? background_type
    }

    const { error: insErr } = await supabase.from("generated_videos").insert({
      user_id: user.id,
      url,
      format: "mp4",
      quality: quality ?? "1080p",
      duration: duration ?? 60,
      size,
      project_id: projectId ?? null,
      background_url,
      background_type,
    })

    if (insErr) {
      console.error("Record route insert error:", insErr)
      return NextResponse.json({ error: "Failed to save video" }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("Record route error:", e)
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
}
