import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { put } from "@vercel/blob"

const AZURE_ENDPOINT = "https://AZ-UTIL-AI.openai.azure.com/openai/v1/images/generations"
const MODEL = "gpt-image-1.5"

export async function POST(request: NextRequest) {
  try {
    const apiKey = String(process.env.AZURE_AI_KEY || "").trim()
    if (!apiKey) {
      return NextResponse.json({ error: "Azure AI key not configured" }, { status: 500 })
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
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { prompt, style = "digital art", size = "1024x1792", saveToGallery = false } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const azureResponse = await fetch(AZURE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: `${style} style: ${prompt}. Vertical format suitable for social media video background. High quality, vibrant colors, engaging visual.`,
        size: size,
        quality: "medium",
        output_format: "png",
        output_compression: 100,
        n: 1,
      }),
    })

    if (!azureResponse.ok) {
      const errorData = await azureResponse.json().catch(() => ({}))
      console.error("Azure AI API error:", errorData)
      return NextResponse.json({ error: "Failed to generate image" }, { status: 502 })
    }

    const responseData = await azureResponse.json()

    // Azure gpt-image-1.5 returns base64 data, not a URL
    const b64Data = responseData.data?.[0]?.b64_json
    // Also handle URL response format for compatibility
    const imageUrl = responseData.data?.[0]?.url

    if (!b64Data && !imageUrl) {
      return NextResponse.json({ error: "No image generated" }, { status: 502 })
    }

    // Convert base64 to buffer, or download from URL
    let imageBuffer: ArrayBuffer
    if (b64Data) {
      imageBuffer = Buffer.from(b64Data, "base64").buffer
    } else {
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        return NextResponse.json({ error: "Failed to download generated image" }, { status: 502 })
      }
      imageBuffer = await imageResponse.arrayBuffer()
    }

    // Always upload to Vercel Blob to get a permanent URL
    const filename = `ai-generated-${Date.now()}.png`
    const blob = await put(filename, imageBuffer, {
      access: "public",
      contentType: "image/png",
    })

    if (saveToGallery) {
      const { error: dbError } = await supabase.from("backgrounds").insert({
        user_id: user.id,
        name: `AI Generated: ${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""}`,
        url: blob.url,
        type: "image",
        size: imageBuffer.byteLength,
      })

      if (dbError) {
        console.error("Database error:", dbError)
      }

      return NextResponse.json({
        imageUrl: blob.url,
        saved: !dbError,
      })
    }

    return NextResponse.json({ imageUrl: blob.url, saved: false })
  } catch (error) {
    console.error("Image generation error:", error)
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 })
  }
}
