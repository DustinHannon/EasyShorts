import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { del } from "@vercel/blob"

export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const backgroundId = searchParams.get("id")

    if (!backgroundId) {
      return NextResponse.json({ error: "Background ID required" }, { status: 400 })
    }

    const { data: background, error: fetchError } = await supabase
      .from("backgrounds")
      .select("*")
      .eq("id", backgroundId)
      .eq("user_id", user.id)
      .single()

    if (fetchError || !background) {
      return NextResponse.json({ error: "Background not found" }, { status: 404 })
    }

    // Delete from Vercel Blob storage
    try {
      await del(background.url)
    } catch (storageError) {
      console.error("Blob deletion error:", storageError)
      // Continue with database deletion even if blob deletion fails
    }

    const { error: dbError } = await supabase.from("backgrounds").delete().eq("id", backgroundId).eq("user_id", user.id)

    if (dbError) {
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
