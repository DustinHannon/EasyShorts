import type { NextRequest } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function POST(request: NextRequest): Promise<Response> {
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
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
        if (!allowedTypes.includes(clientPayload?.type || "")) {
          throw new Error("Invalid file type. Only images are allowed.")
        }

        return {
          allowedContentTypes: allowedTypes,
          tokenPayload: JSON.stringify({
            userId: user.id,
            uploadType: "background",
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const payload = JSON.parse(tokenPayload || "{}")

          const { error: dbError } = await supabase.from("backgrounds").insert({
            user_id: payload.userId,
            name: blob.pathname.split("/").pop() || "background",
            url: blob.url,
            type: "image",
            size: blob.size,
          })

          if (dbError) {
            console.error("Database error:", dbError)
            throw new Error("Failed to save background metadata")
          }
        } catch (error) {
          console.error("Error in onUploadCompleted:", error)
          throw error
        }
      },
    })

    return Response.json(jsonResponse)
  } catch (error) {
    console.error("Background upload error:", error)
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 })
  }
}
