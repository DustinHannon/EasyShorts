import { type NextRequest, NextResponse } from "next/server"
import { getRouteUser } from "@/lib/supabase/server"
import { put } from "@vercel/blob"

const AZURE_ENDPOINT = "https://AZ-UTIL-AI.openai.azure.com/openai/v1/images/generations"
const MODEL = "gpt-image-1.5"
const AZURE_TIMEOUT_MS = 30000
// gpt-image-1.5 supported sizes (NOT the DALL-E set). 1024x1536 = vertical 2:3,
// the closest portrait fit for short-form video backgrounds.
const VALID_SIZES = ["1024x1024", "1024x1536", "1536x1024", "auto"]
const DEFAULT_SIZE = "1024x1536"

function isAllowedImageHost(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== "https:") return false
    const host = parsed.hostname.toLowerCase()
    return host.endsWith(".openai.azure.com") || host.endsWith(".public.blob.vercel-storage.com")
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = String(process.env.AZURE_AI_KEY || "").trim()
    if (!apiKey) {
      console.error("Missing AZURE_AI_KEY")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const { supabase, user } = await getRouteUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: allowed, error: quotaErr } = await supabase.rpc("consume_ai_quota", {
      p_kind: "image",
      p_limit: 20,
    })
    if (quotaErr) {
      console.error("Quota check error (image):", quotaErr)
    } else if (allowed === false) {
      return NextResponse.json(
        { error: "Daily generation limit reached. Try again tomorrow." },
        { status: 429 },
      )
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid request format" }, { status: 400 })
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const {
      prompt,
      style = "digital art",
      size = DEFAULT_SIZE,
      saveToGallery = false,
    } = body as {
      prompt?: unknown
      style?: unknown
      size?: unknown
      saveToGallery?: unknown
    }

    if (typeof prompt !== "string" || !prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }
    if (prompt.length > 1000) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const safeStyle = typeof style === "string" ? style.slice(0, 100) : "digital art"
    const safeSize = typeof size === "string" && VALID_SIZES.includes(size) ? size : DEFAULT_SIZE

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AZURE_TIMEOUT_MS)
    let azureResponse: Response
    try {
      azureResponse = await fetch(AZURE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          prompt: `${safeStyle} style: ${prompt}. Vertical format suitable for social media video background. High quality, vibrant colors, engaging visual.`,
          size: safeSize,
          quality: "medium",
          output_format: "png",
          output_compression: 100,
          n: 1,
        }),
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return NextResponse.json({ error: "Request timed out. Please try again." }, { status: 504 })
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!azureResponse.ok) {
      const errorData = await azureResponse.json().catch(() => ({}))
      console.error("Azure AI API error:", azureResponse.status, errorData)
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
    let imageBuffer: ArrayBuffer | Buffer
    if (b64Data) {
      imageBuffer = Buffer.from(b64Data, "base64")
    } else {
      if (typeof imageUrl !== "string" || !isAllowedImageHost(imageUrl)) {
        console.error("Rejected image URL host for server-side fetch")
        return NextResponse.json({ error: "Failed to generate image" }, { status: 502 })
      }

      const dlController = new AbortController()
      const dlTimeout = setTimeout(() => dlController.abort(), AZURE_TIMEOUT_MS)
      let imageResponse: Response
      try {
        imageResponse = await fetch(imageUrl, { signal: dlController.signal })
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return NextResponse.json({ error: "Request timed out. Please try again." }, { status: 504 })
        }
        throw err
      } finally {
        clearTimeout(dlTimeout)
      }

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
