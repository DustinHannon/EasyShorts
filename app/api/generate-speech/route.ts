import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const AZURE_ENDPOINT = "https://AZ-UTIL-AI.openai.azure.com/openai/v1/audio/speech"

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.AZURE_AI_KEY
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

    const { text, voice = "alloy", speed = 1.0 } = await request.json()

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 })
    }

    const response = await fetch(AZURE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: voice,
        input: text,
        speed: speed,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("Azure AI API error:", errorData)
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
