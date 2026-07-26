// Audio-synced captions: build FFmpeg drawtext filters from real word-level
// timestamps (from transcription) instead of guessing words-per-second. Pure
// functions, no FFmpeg/browser deps, so both the API route (types) and the
// client video processor can import it.

export interface WordTiming {
  word: string
  start: number // seconds from start of audio
  end: number // seconds
}

// Must match the font filename the processor writes into the FFmpeg virtual FS.
const FONT_FILE = "Roboto_Condensed-Medium.ttf"

function cleanForDrawtext(text: string): string {
  return text
    .replace(/['"]/g, "") // drawtext quoting is fragile — drop quotes
    .replace(/[:]/g, " ") // ':' is a drawtext option separator
    .replace(/[%]/g, " percent ")
    .replace(/[\\]/g, "")
    .replace(/[\n\r\t]/g, " ")
    // Unicode-aware: bare \w is [A-Za-z0-9_], which would delete accents
    // ("años" -> "aos") and strip non-Latin scripts to nothing at all.
    .replace(/[^\p{L}\p{N}\s.,!?-]/gu, "")
    .replace(/\s+/g, " ")
    .substring(0, 120)
    .trim()
}

export interface CaptionLayout {
  width: number
  height: number
  wordsPerGroup?: number
  pauseSplitSeconds?: number
}

// Group words into short on-screen phrases timed to when they're actually
// spoken. A new phrase starts at the group-size limit OR after a natural pause,
// so captions track speech phrasing instead of a fixed cadence.
export function buildCaptionFiltersFromTimings(words: WordTiming[], layout: CaptionLayout): string[] {
  const valid = words.filter(
    (w) =>
      w &&
      typeof w.start === "number" &&
      typeof w.end === "number" &&
      w.end >= w.start &&
      (w.word || "").trim().length > 0,
  )
  if (valid.length === 0) return []

  const fontSize = Math.max(48, Math.floor(layout.height * 0.062))
  const yPosition = Math.floor(layout.height * 0.78)
  const groupSize = Math.max(1, layout.wordsPerGroup ?? 3)
  const pauseSplit = layout.pauseSplitSeconds ?? 0.55

  const phrases: { text: string; start: number; end: number }[] = []
  let group: WordTiming[] = []

  const flush = () => {
    if (group.length === 0) return
    const text = cleanForDrawtext(group.map((w) => w.word).join(" "))
    const start = group[0].start
    const end = group[group.length - 1].end
    group = []
    if (!text || !(end > start)) return
    phrases.push({ text, start, end })
  }

  for (let i = 0; i < valid.length; i++) {
    group.push(valid[i])
    const next = valid[i + 1]
    const reachedSize = group.length >= groupSize
    const bigPause = !!next && next.start - valid[i].end > pauseSplit
    if (reachedSize || bigPause || !next) flush()
  }

  if (phrases.length === 0) return []

  // Clamp by WIDTH as well as height, then apply ONE size to every phrase.
  // drawtext never wraps, so at the height-derived size a long phrase renders
  // wider than the frame and x=(w-text_w)/2 goes negative, clipping it at both
  // edges. Sizing each phrase independently would fix that but make the caption
  // resize 2-3 times a second, which reads as broken; taking the minimum keeps
  // every phrase on-screen at a stable size. 0.5em is a deliberately
  // conservative average advance for Roboto Condensed; 36px is the readable floor.
  const widthBudget = layout.width * 0.9
  const fitted = phrases.reduce(
    (size, p) => Math.min(size, Math.floor(widthBudget / (p.text.length * 0.5))),
    fontSize,
  )
  const finalSize = Math.max(36, fitted)

  return phrases.map(
    (p) =>
      `drawtext=fontfile=${FONT_FILE}:text='${p.text}':fontcolor=white:fontsize=${finalSize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=black@0.55:boxborderw=12:enable='between(t,${p.start.toFixed(2)},${p.end.toFixed(2)})'`,
  )
}
