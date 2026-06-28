import { NextResponse, type NextRequest } from "next/server"
import { getRouteUser } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getRouteUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: { url?: unknown; name?: unknown; size?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const { url, name, size } = body

    // Validate url: must be an https Vercel Blob URL.
    if (typeof url !== "string") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".public.blob.vercel-storage.com")) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // Validate name: non-empty string, capped at 200 chars, fallback "background".
    let safeName = typeof name === "string" ? name.trim() : ""
    if (!safeName) safeName = "background"
    if (safeName.length > 200) safeName = safeName.slice(0, 200)

    // Validate size: non-negative integer, or null.
    let safeSize: number | null
    if (size === null || size === undefined) {
      safeSize = null
    } else if (typeof size === "number" && Number.isInteger(size) && size >= 0) {
      safeSize = size
    } else {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const { data: inserted, error: insErr } = await supabase
      .from("backgrounds")
      .insert({
        user_id: user.id,
        name: safeName,
        url,
        type: "image",
        size: safeSize,
      })
      .select()
      .single()

    if (insErr) {
      console.error("Background record insert error:", insErr)
      return NextResponse.json({ error: "Failed to save background" }, { status: 500 })
    }

    return NextResponse.json({ background: inserted })
  } catch (e) {
    console.error("Background record route error:", e)
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
}
