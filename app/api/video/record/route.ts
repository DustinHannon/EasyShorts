import { NextResponse, type NextRequest } from "next/server"
import { getRouteUser } from "@/lib/supabase/server"
import { resolveBackgroundUrl, backgroundKindOf } from "@/lib/backgrounds"

export const runtime = "nodejs"

// A blob URL is only acceptable if it is https on the Vercel Blob store host.
// Checking the pathname alone is not enough: `new URL("javascript:/users/x/;alert(1)")`
// yields the pathname "/users/x/;alert(1)", and the stored URL is later used as
// an anchor href in the gallery.
function isVercelBlobUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".public.blob.vercel-storage.com")) {
    return null
  }
  return parsed
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getRouteUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { url, size, projectId, quality, duration, background } = body

    // Validate url: must be an https Vercel Blob URL scoped to this user's prefix.
    const parsed = isVercelBlobUrl(url)
    if (!parsed || !parsed.pathname.startsWith(`/users/${user.id}/`)) {
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

    // Allow override via supplied 'background' — but only when it is itself a
    // valid https blob URL. Anything else is ignored (the derived value stands).
    if (background?.url) {
      const parsedBg = isVercelBlobUrl(background.url)
      if (parsedBg) {
        background_url = parsedBg.href
        if (typeof background.type === "string" && background.type.length > 0 && background.type.length <= 50) {
          background_type = background.type
        }
      }
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
