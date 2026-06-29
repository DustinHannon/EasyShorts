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
    .replace(/[^\w\s.,!?-]/g, "")
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

  const filters: string[] = []
  let group: WordTiming[] = []

  const flush = () => {
    if (group.length === 0) return
    const text = cleanForDrawtext(group.map((w) => w.word).join(" "))
    const start = group[0].start
    const end = group[group.length - 1].end
    group = []
    if (!text || !(end > start)) return
    filters.push(
      `drawtext=fontfile=${FONT_FILE}:text='${text}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=black@0.55:boxborderw=12:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`,
    )
  }

  for (let i = 0; i < valid.length; i++) {
    group.push(valid[i])
    const next = valid[i + 1]
    const reachedSize = group.length >= groupSize
    const bigPause = !!next && next.start - valid[i].end > pauseSplit
    if (reachedSize || bigPause || !next) flush()
  }

  return filters
}
