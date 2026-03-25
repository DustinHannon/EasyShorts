import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { validateFileType, validateFileSize } from "@/lib/security"
import { put } from "@vercel/blob"

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
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

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if (!validateFileType(file, allowedTypes)) {
      return NextResponse.json({ error: "Invalid file type. Only images are allowed." }, { status: 400 })
    }

    if (!validateFileSize(file, 10)) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 })
    }

    const fileName = `backgrounds/${user.id}-${Date.now()}-${file.name}`
    const fileBuffer = await file.arrayBuffer()

    const blob = await put(fileName, fileBuffer, {
      access: "public",
      contentType: file.type,
    })

    const { data: background, error: dbError } = await supabase
      .from("backgrounds")
      .insert({
        user_id: user.id,
        name: file.name,
        url: blob.url,
        type: "image", // Always set to image since we only allow images
        size: file.size,
      })
      .select()
      .single()

    if (dbError) {
      console.error("Database error:", dbError)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    return NextResponse.json({
      id: background.id,
      filename: background.name,
      url: background.url,
      mime_type: file.type,
      created_at: background.created_at,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
