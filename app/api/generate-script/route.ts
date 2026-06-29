import { type NextRequest, NextResponse } from "next/server"
import { getRouteUser } from "@/lib/supabase/server"
import { getNicheGuidance } from "@/lib/niches"

const AZURE_ENDPOINT = "https://AZ-UTIL-AI.openai.azure.com/openai/v1/chat/completions"
const AZURE_TIMEOUT_MS = 30000

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getRouteUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: allowed, error: quotaErr } = await supabase.rpc("consume_ai_quota", {
      p_kind: "script",
      p_limit: 50,
    })
    if (quotaErr) {
      console.error("Quota check error (script):", quotaErr)
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

    if (body.topic !== undefined && typeof body.topic !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    if (body.style !== undefined && typeof body.style !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    if (body.audience !== undefined && typeof body.audience !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const topic = String(body.topic || "").trim()
    const style = String(body.style || "engaging").trim()
    const duration = String(body.duration || "60").trim()
    const audience = String(body.audience || "general audience").trim()
    const nicheGuidance = getNicheGuidance(body.niche)
    const nicheLine = nicheGuidance ? `\n\nFormat: ${nicheGuidance}` : ""

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 })
    }
    if (topic.length > 500) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    if (style.length > 100 || audience.length > 100) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const apiKey = process.env.AZURE_AI_KEY
    if (!apiKey) {
      console.error("Missing AZURE_AI_KEY")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const targetWords = Math.round((Number.parseInt(duration, 10) || 60) * 2.5)
    const prompt = `You are an elite short-form video scriptwriter. Write the SPOKEN NARRATION for a ${duration}-second vertical video (TikTok / YouTube Shorts / Instagram Reels) about: ${topic}

Audience: ${audience}. Tone/style: ${style}.${nicheLine}

Write for maximum retention and watch-time:
- HOOK (first 3 seconds): open with a scroll-stopping hook — a bold claim, a surprising/counterintuitive fact, a sharp question, or a pattern interrupt. NEVER open with "Welcome", "Hey guys", "In this video", "Today I'm going to", or any greeting/intro.
- Build curiosity fast and WITHHOLD the payoff so viewers stay to the end.
- Keep sentences short, punchy, and conversational — easy to say out loud, no jargon.
- Deliver real value or a satisfying payoff in the back half.
- End the LAST line with a strong call-to-action (e.g. follow for more, comment your take).
- Length: about ${targetWords} words so it runs ~${duration} seconds when spoken at a natural pace.

OUTPUT RULES — return ONLY the spoken words, nothing else:
- No stage directions, brackets, production notes, timestamps, emojis, headings, hashtags, speaker labels, or markdown.
- No "[Opening shot]", "[PAUSE]", "(music)", "Narrator:", or similar.
- Just clean, natural narration text that flows when read aloud.`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AZURE_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(AZURE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-5.4",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          // gpt-5.x (Azure AI Foundry) requires max_completion_tokens, not
          // max_tokens, and only supports the default temperature.
          max_completion_tokens: 2000,
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
