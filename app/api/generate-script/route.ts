import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const AZURE_ENDPOINT = "https://AZ-UTIL-AI.openai.azure.com/openai/v1/chat/completions"

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnon) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

    const topic = String(body.topic || "").trim()
    const style = String(body.style || "engaging").trim()
    const duration = String(body.duration || "60").trim()
    const audience = String(body.audience || "general audience").trim()

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 })
    }

    const apiKey = process.env.AZURE_AI_KEY
    if (!apiKey) {
      console.error("Missing AZURE_AI_KEY")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const prompt = `Create an engaging ${duration}-second video script for ${audience} about: ${topic}

Style: ${style}

Requirements:
- Hook viewers in the first 3 seconds
- Keep it conversational and engaging
- Include a clear call-to-action
- Optimize for ${audience === "tiktok" ? "TikTok/Shorts" : "social media"}
- Use simple, clear language
- End with engagement (like, share, follow)

IMPORTANT: Generate ONLY the spoken narration text that will be converted to audio.
DO NOT include:
- Stage directions in brackets like [Opening shot...]
- Production notes like [PAUSE] or [Cut to...]
- Timestamps like [00:00 - 00:03]
- Any bracketed text or instructions
- Visual descriptions or camera directions

Output should be pure spoken dialogue that flows naturally when read aloud.`

    const response = await fetch(AZURE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Azure AI API error:", response.status, errorText)
      return NextResponse.json({ error: "Failed to generate script" }, { status: 500 })
    }

    const completion = await response.json()
    const script = completion.choices?.[0]?.message?.content

    if (!script || script.trim() === "") {
      return NextResponse.json({ error: "Received empty response from AI service" }, { status: 500 })
    }

    return NextResponse.json({ script: script.trim() })
  } catch (error) {
    console.error("Script generation error:", error)
    return NextResponse.json({ error: "Failed to generate script" }, { status: 500 })
  }
}
