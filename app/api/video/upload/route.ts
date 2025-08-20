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
    } = await supabase.auth.getUser()

    if (!user) {
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
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload, clientPayload }) => {
        const tokenData = JSON.parse(tokenPayload || "{}")
        const clientData = JSON.parse(clientPayload || "{}")

        await supabase.from("generated_videos").insert({
          user_id: tokenData.userId,
          url: blob.url,
          format: "mp4",
          quality: clientData.quality || "1080p",
          duration: clientData.duration || 60,
          size: blob.size,
          project_id: clientData.projectId,
        })
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: "Upload failed" }, { status: 400 })
  }
}
