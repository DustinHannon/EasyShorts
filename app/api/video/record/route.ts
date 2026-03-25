import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log("[v0] Record route received data:", body)

    const { url, size, projectId, quality, duration, background } = body

    if (!url || !size) {
      console.log("[v0] Missing required fields:", { url: !!url, size: !!size, receivedKeys: Object.keys(body) })
      return NextResponse.json({ error: "Missing url or size" }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set() {},
          remove() {},
        },
      },
    )

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Optional enrichment from project
    let background_url: string | null = null
    let background_type: string | null = null

    if (projectId) {
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .select("video_settings")
        .eq("id", projectId)
        .single()

      if (!projErr && project?.video_settings?.background) {
        const bg = project.video_settings.background
        if (bg.type === "preset" && bg.value) {
          background_url = `/backgrounds/${bg.value}.jpg`
          background_type = "preset"
        } else if ((bg.type === "upload" || bg.type === "generated") && bg.url) {
          background_url = bg.url
          background_type = bg.type
        }
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
      return NextResponse.json({ error: insErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[v0] Record route error:", e)
    return NextResponse.json({ error: e?.message ?? "Bad request" }, { status: 400 })
  }
}
