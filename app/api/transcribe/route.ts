import { type NextRequest, NextResponse } from "next/server"
import { getRouteUser } from "@/lib/supabase/server"
import type { WordTiming } from "@/lib/captions"

export const runtime = "nodejs"

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions"
const TIMEOUT_MS = 45000
const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // OpenAI's hard limit

// Transcribe a voiceover into word-level timestamps for audio-synced captions.
// Always returns 200 with a `words` array (possibly empty) so the client can
// gracefully fall back to estimated timing — caption sync must never block
// video generation.
export async function POST(request: NextRequest) {
  try {
    const { user } = await getRouteUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      // Not configured — client falls back to estimated caption timing.
      return NextResponse.json({ words: [], configured: false })
    }

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 })
    }
    if (file.size === 0 || file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ words: [], configured: true, error: "invalid_size" })
    }

    const upstream = new FormData()
    upstream.append("file", file, "audio.mp3")
    upstream.append("model", "whisper-1")
    upstream.append("response_format", "verbose_json")
    upstream.append("timestamp_granularities[]", "word")

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let resp: Response
    try {
      resp = await fetch(OPENAI_TRANSCRIBE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstream,
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return NextResponse.json({ words: [], configured: true, error: "timeout" })
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!resp.ok) {
      const detail = await resp.text()
      console.error("Transcription failed:", resp.status, detail.slice(0, 300))
      return NextResponse.json({ words: [], configured: true, error: "transcription_failed" })
    }

    const data: unknown = await resp.json()
    const rawWords =
      data && typeof data === "object" && "words" in data ? (data as { words?: unknown }).words : null
    const words: WordTiming[] = Array.isArray(rawWords)
      ? rawWords.flatMap((w) => {
          if (w && typeof w === "object" && "word" in w && "start" in w && "end" in w) {
            const o = w as { word: unknown; start: unknown; end: unknown }
            if (typeof o.word === "string" && typeof o.start === "number" && typeof o.end === "number") {
              return [{ word: o.word, start: o.start, end: o.end }]
            }
          }
          return []
        })
      : []

    const duration =
      data && typeof data === "object" && "duration" in data && typeof (data as { duration: unknown }).duration === "number"
        ? (data as { duration: number }).duration
        : null

    return NextResponse.json({ words, duration, configured: true })
  } catch (error) {
    console.error("Transcribe route error:", error)
    // Still 200 so the client falls back to estimated timing.
    return NextResponse.json({ words: [], error: "Transcription failed" })
  }
}
