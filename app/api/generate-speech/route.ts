import { type NextRequest, NextResponse } from "next/server"
import { getRouteUser } from "@/lib/supabase/server"

const AZURE_ENDPOINT = "https://AZ-UTIL-AI.openai.azure.com/openai/v1/audio/speech"
const AZURE_TIMEOUT_MS = 30000
const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.AZURE_AI_KEY
    if (!apiKey) {
      console.error("Missing AZURE_AI_KEY")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const { supabase, user } = await getRouteUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: allowed, error: quotaErr } = await supabase.rpc("consume_ai_quota", {
      p_kind: "speech",
      p_limit: 50,
    })
    if (quotaErr) {
      console.error("Quota check error (speech):", quotaErr)
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

    const { text, voice = "alloy", speed = 1.0 } = body as {
      text?: unknown
      voice?: unknown
      speed?: unknown
    }

    if (typeof text !== "string" || !text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 })
    }
    if (text.length > 5000) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const safeVoice = typeof voice === "string" && VALID_VOICES.includes(voice) ? voice : "alloy"
    const parsedSpeed = Number(speed)
    const safeSpeed = Number.isFinite(parsedSpeed) ? Math.min(4, Math.max(0.25, parsedSpeed)) : 1.0

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AZURE_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(AZURE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: safeVoice,
          input: text,
          speed: safeSpeed,
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

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("Azure AI API error:", response.status, errorData)
      return NextResponse.json({ error: "Failed to generate speech" }, { status: 500 })
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error("Speech generation error:", error)
    return NextResponse.json({ error: "Failed to generate speech" }, { status: 500 })
  }
}
