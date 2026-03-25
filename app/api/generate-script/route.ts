import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function POST(request: NextRequest) {
  try {
    console.log("🔍 DEBUG: Starting script generation request")

    const cookieStore = await cookies()
    console.log("🔍 DEBUG: Got cookie store")

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    console.log("🔍 DEBUG: Environment variables check", {
      hasUrl: !!supabaseUrl,
      hasAnon: !!supabaseAnon,
      urlType: typeof supabaseUrl,
      anonType: typeof supabaseAnon,
    })

    if (!supabaseUrl || !supabaseAnon) {
      console.error("Missing Supabase envs", { hasUrl: !!supabaseUrl, hasAnon: !!supabaseAnon })
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    console.log("🔍 DEBUG: Creating Supabase client")
    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        get(name: string) {
          console.log("🔍 DEBUG: Getting cookie", { name, type: typeof name })
          return cookieStore.get(name)?.value
        },
      },
    })

    console.log("🔍 DEBUG: Getting user from Supabase")
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("🔍 DEBUG: Parsing request body")
    let body
    try {
      body = await request.json()
      console.log("🔍 DEBUG: Request body parsed", {
        bodyType: typeof body,
        hasBody: !!body,
        keys: body ? Object.keys(body) : [],
      })
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError)
      return NextResponse.json({ error: "Invalid request format" }, { status: 400 })
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    console.log("🔍 DEBUG: Converting body parameters to strings")
    const topic = String(body.topic || "").trim()
    const style = String(body.style || "engaging").trim()
    const duration = String(body.duration || "60").trim()
    const audience = String(body.audience || "general audience").trim()

    console.log("🔍 DEBUG: Converted parameters", {
      topic: topic,
      topicLength: topic.length,
      style: style,
      duration: duration,
      audience: audience,
    })

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 })
    }

    console.log("🔍 DEBUG: Checking OpenAI API key")
    const apiKey = process.env.OPENAI_API_KEY
    console.log("�� DEBUG: API key check", {
      hasApiKey: !!apiKey,
      apiKeyType: typeof apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
    })

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
      console.error("Missing or invalid OPENAI_API_KEY")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const cleanApiKey = apiKey.trim()
    if (cleanApiKey.length < 10) {
      console.error("OPENAI_API_KEY appears to be invalid")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    console.log("🔍 DEBUG: Building prompt")
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

    console.log("🔍 DEBUG: Prompt built, length:", prompt.length)
    console.log("🔍 DEBUG: Making direct OpenAI API call via fetch")

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cleanApiKey}`,
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
        console.error("OpenAI API error:", response.status, errorText)
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const completion = await response.json()
      console.log("🔍 DEBUG: OpenAI API call successful")

      const script = completion.choices?.[0]?.message?.content

      if (!script || script.trim() === "") {
        console.error("Empty or invalid response from OpenAI")

        // Try fallback with simpler prompt
        console.log("🔍 DEBUG: Attempting fallback with simpler prompt...")
        const fallbackResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cleanApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "user",
                content: `Write a 60-second video script about: ${topic}. Make it engaging and conversational.`,
              },
            ],
            max_tokens: 2000,
          }),
        })

        if (fallbackResponse.ok) {
          const fallbackCompletion = await fallbackResponse.json()
          const fallbackScript = fallbackCompletion.choices?.[0]?.message?.content

          if (fallbackScript && fallbackScript.trim()) {
            return NextResponse.json({ script: fallbackScript.trim() })
          }
        }

        return NextResponse.json({ error: "Received empty response from AI service" }, { status: 500 })
      }

      const finalScript = script.trim()
      console.log("🔍 DEBUG: Script generation completed successfully")

      return NextResponse.json({ script: finalScript })
    } catch (fetchError) {
      console.error("🔍 DEBUG: Direct API call failed:", fetchError)
      return NextResponse.json({ error: "Failed to generate script" }, { status: 500 })
    }
  } catch (error) {
    console.error("🔍 DEBUG: Error caught in main try/catch:", error)
    console.error("Script generation error:", error)
    if (error instanceof Error) {
      console.error("Error message:", error.message)
      console.error("Error stack:", error.stack)
    }
    return NextResponse.json({ error: "Failed to generate script" }, { status: 500 })
  }
}
