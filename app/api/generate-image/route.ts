import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { put } from "@vercel/blob"

export async function POST(request: NextRequest) {
  try {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim()
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 })
    }

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

    const { prompt, style = "digital art", size = "1024x1792", saveToGallery = false } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `${style} style: ${prompt}. Vertical format suitable for social media video background. High quality, vibrant colors, engaging visual.`,
        size: size as "1024x1024" | "1024x1792" | "1792x1024",
        quality: "standard",
        n: 1,
      }),
    })

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json().catch(() => ({}))
      console.error("OpenAI API error:", errorData)
      return NextResponse.json({ error: "Failed to generate image" }, { status: 502 })
    }

    const responseData = await openaiResponse.json()
    const imageUrl = responseData.data?.[0]?.url

    if (!imageUrl) {
      return NextResponse.json({ error: "No image generated" }, { status: 502 })
    }

    if (saveToGallery) {
      try {
        // Download the generated image
        const imageResponse = await fetch(imageUrl)
        if (!imageResponse.ok) {
          throw new Error("Failed to download generated image")
        }

        const imageBuffer = await imageResponse.arrayBuffer()
        const filename = `ai-generated-${Date.now()}.png`

        // Upload to Vercel Blob
        const blob = await put(filename, imageBuffer, {
          access: "public",
          contentType: "image/png",
        })

        // Save to database
        const { error: dbError } = await supabase.from("backgrounds").insert({
          user_id: user.id,
          name: `AI Generated: ${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""}`,
          url: blob.url,
          type: "image",
          size: imageBuffer.byteLength,
        })

        if (dbError) {
          console.error("Database error:", dbError)
          // Continue anyway, return the permanent URL
        }

        return NextResponse.json({
          imageUrl: blob.url, // Return the permanent blob URL instead
          saved: !dbError,
        })
      } catch (error) {
        console.error("Error saving to blob:", error)
        return NextResponse.json({ error: "Failed to save image to gallery" }, { status: 500 })
      }
    }

    return NextResponse.json({ imageUrl, saved: false })
  } catch (error) {
    console.error("Image generation error:", error)
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 })
  }
}
