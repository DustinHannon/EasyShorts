import { describe, expect, it } from "vitest"

import { buildCaptionFiltersFromTimings, type CaptionLayout, type WordTiming } from "@/lib/captions"

// 1080x1920 is the real portrait output size used by the video processor.
const LAYOUT: CaptionLayout = { width: 1080, height: 1920 }

// Deliberately does NOT assert on `fontsize=` — that value is tuned
// independently of segmentation. These helpers pull out only the two things
// the grouping algorithm actually decides: the phrase text and its time window.
function windowOf(filter: string): { start: number; end: number } {
  const match = filter.match(/enable='between\(t,([0-9.]+),([0-9.]+)\)'/)
  if (!match) throw new Error(`filter has no enable window: ${filter}`)
  return { start: Number(match[1]), end: Number(match[2]) }
}

function textOf(filter: string): string {
  const match = filter.match(/:text='([^']*)':fontcolor=/)
  if (!match) throw new Error(`filter has no text: ${filter}`)
  return match[1]
}

// Evenly spaced back-to-back words: word i spans [i*step, i*step + step].
function evenWords(count: number, step = 0.3): WordTiming[] {
  return Array.from({ length: count }, (_, i) => ({
    word: `w${i}`,
    start: Number((i * step).toFixed(2)),
    end: Number(((i + 1) * step).toFixed(2)),
  }))
}

describe("buildCaptionFiltersFromTimings", () => {
  it("returns an empty array for empty input", () => {
    expect(buildCaptionFiltersFromTimings([], LAYOUT)).toEqual([])
  })

  it("returns an empty array when every word is invalid", () => {
    // Malformed shapes on purpose — this is exactly the transcription payload
    // the runtime guards exist for, so the cast is the point of the test.
    const words = [
      null,
      undefined,
      { word: "missing-start", end: 1 },
      { word: "missing-end", start: 1 },
      { word: "nan-start", start: Number.NaN, end: 1 },
      { word: "nan-end", start: 1, end: Number.NaN },
      { word: "string-times", start: "1", end: "2" },
      { word: "end-before-start", start: 2, end: 1 },
      { word: "   ", start: 0, end: 1 },
      { word: "", start: 0, end: 1 },
    ] as unknown as WordTiming[]

    expect(buildCaptionFiltersFromTimings(words, LAYOUT)).toEqual([])
  })

  it("drops invalid words but still groups the valid ones around them", () => {
    const words = [
      { word: "alpha", start: 0, end: 0.3 },
      { word: "bad", start: Number.NaN, end: 0.6 },
      { word: "beta", start: 0.3, end: 0.6 },
      { word: "   ", start: 0.6, end: 0.9 },
      { word: "gamma", start: 0.6, end: 0.9 },
    ] as unknown as WordTiming[]

    const filters = buildCaptionFiltersFromTimings(words, LAYOUT)

    expect(filters).toHaveLength(1)
    expect(textOf(filters[0])).toBe("alpha beta gamma")
  })

  it("groups words three at a time by default", () => {
    const filters = buildCaptionFiltersFromTimings(evenWords(6), LAYOUT)

    expect(filters).toHaveLength(2)
    expect(textOf(filters[0])).toBe("w0 w1 w2")
    expect(textOf(filters[1])).toBe("w3 w4 w5")
  })

  it("spans each phrase window from the first word's start to the last word's end", () => {
    // w0 0.00-0.30, w1 0.30-0.60, w2 0.60-0.90 | w3 0.90-1.20, w4 1.20-1.50, w5 1.50-1.80
    const filters = buildCaptionFiltersFromTimings(evenWords(6), LAYOUT)

    expect(windowOf(filters[0]).start).toBeCloseTo(0.0, 2)
    expect(windowOf(filters[0]).end).toBeCloseTo(0.9, 2)
    expect(windowOf(filters[1]).start).toBeCloseTo(0.9, 2)
    expect(windowOf(filters[1]).end).toBeCloseTo(1.8, 2)
  })

  it("splits early on a pause longer than pauseSplitSeconds even when the group is not full", () => {
    const words: WordTiming[] = [
      { word: "one", start: 0.0, end: 0.3 },
      { word: "two", start: 0.3, end: 0.6 },
      // 1.40s of silence — well past the 0.55s default.
      { word: "three", start: 2.0, end: 2.3 },
      { word: "four", start: 2.3, end: 2.6 },
    ]

    const filters = buildCaptionFiltersFromTimings(words, LAYOUT)

    expect(filters).toHaveLength(2)
    expect(textOf(filters[0])).toBe("one two")
    expect(windowOf(filters[0])).toEqual({ start: 0, end: 0.6 })
    expect(textOf(filters[1])).toBe("three four")
    expect(windowOf(filters[1])).toEqual({ start: 2, end: 2.6 })
  })

  it("does not split on a gap at or below pauseSplitSeconds", () => {
    const words: WordTiming[] = [
      { word: "one", start: 0.0, end: 0.3 },
      // exactly 0.55 — the check is `> pauseSplit`, so this must NOT split.
      { word: "two", start: 0.85, end: 1.15 },
      { word: "three", start: 1.15, end: 1.45 },
    ]

    const filters = buildCaptionFiltersFromTimings(words, LAYOUT)

    expect(filters).toHaveLength(1)
    expect(textOf(filters[0])).toBe("one two three")
  })

  it("honours a custom wordsPerGroup", () => {
    const filters = buildCaptionFiltersFromTimings(evenWords(5), { ...LAYOUT, wordsPerGroup: 2 })

    expect(filters.map(textOf)).toEqual(["w0 w1", "w2 w3", "w4"])
  })

  it("honours a custom pauseSplitSeconds", () => {
    const words: WordTiming[] = [
      { word: "one", start: 0.0, end: 0.3 },
      // 0.2s gap: under the 0.55s default, over a 0.1s custom threshold.
      { word: "two", start: 0.5, end: 0.8 },
      { word: "three", start: 0.8, end: 1.1 },
    ]

    expect(buildCaptionFiltersFromTimings(words, LAYOUT).map(textOf)).toEqual(["one two three"])
    expect(
      buildCaptionFiltersFromTimings(words, { ...LAYOUT, pauseSplitSeconds: 0.1 }).map(textOf),
    ).toEqual(["one", "two three"])
  })

  it("emits the trailing partial group instead of dropping it", () => {
    // 7 words at the default group size of 3 -> 3 + 3 + 1.
    const filters = buildCaptionFiltersFromTimings(evenWords(7), LAYOUT)

    expect(filters).toHaveLength(3)
    expect(textOf(filters[2])).toBe("w6")
    expect(windowOf(filters[2]).start).toBeCloseTo(1.8, 2)
    expect(windowOf(filters[2]).end).toBeCloseTo(2.1, 2)
  })

  it("produces non-overlapping, monotonically increasing windows", () => {
    const words: WordTiming[] = [
      { word: "a", start: 0.0, end: 0.4 },
      { word: "b", start: 0.4, end: 0.8 },
      { word: "c", start: 0.8, end: 1.2 },
      { word: "d", start: 1.2, end: 1.6 },
      // long pause -> forces a split mid-group
      { word: "e", start: 3.0, end: 3.4 },
      { word: "f", start: 3.4, end: 3.8 },
      { word: "g", start: 3.8, end: 4.2 },
      { word: "h", start: 4.2, end: 4.6 },
      { word: "i", start: 4.6, end: 5.0 },
    ]

    const windows = buildCaptionFiltersFromTimings(words, LAYOUT).map(windowOf)

    expect(windows.length).toBeGreaterThan(1)
    for (const w of windows) {
      expect(w.end).toBeGreaterThan(w.start)
    }
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].start).toBeGreaterThanOrEqual(windows[i - 1].end)
      expect(windows[i].start).toBeGreaterThan(windows[i - 1].start)
    }
  })

  it("strips drawtext metacharacters (quotes and colons) from the rendered text", () => {
    const words: WordTiming[] = [
      { word: `don't`, start: 0.0, end: 0.3 },
      { word: `time:`, start: 0.3, end: 0.6 },
      { word: `"quoted"`, start: 0.6, end: 0.9 },
    ]

    const text = textOf(buildCaptionFiltersFromTimings(words, LAYOUT)[0])

    expect(text).not.toMatch(/['":]/)
    expect(text).toBe("dont time quoted")
  })

  it("also strips backslashes and newlines, and spells out percent signs", () => {
    const words: WordTiming[] = [
      { word: "50%", start: 0.0, end: 0.3 },
      { word: "back\\slash", start: 0.3, end: 0.6 },
      { word: "new\nline", start: 0.6, end: 0.9 },
    ]

    const text = textOf(buildCaptionFiltersFromTimings(words, LAYOUT)[0])

    expect(text).not.toMatch(/[\\\n\r\t%]/)
    expect(text).toBe("50 percent backslash new line")
  })

  it("keeps accented and non-Latin characters (Unicode-aware sanitisation)", () => {
    const words: WordTiming[] = [
      { word: "años", start: 0.0, end: 0.3 },
      { word: "café", start: 0.3, end: 0.6 },
      { word: "日本語", start: 0.6, end: 0.9 },
    ]

    const text = textOf(buildCaptionFiltersFromTimings(words, LAYOUT)[0])

    expect(text).toBe("años café 日本語")
  })

  it("keeps sentence punctuation that drawtext tolerates", () => {
    const words: WordTiming[] = [
      { word: "Wait,", start: 0.0, end: 0.3 },
      { word: "really?", start: 0.3, end: 0.6 },
      { word: "well-timed!", start: 0.6, end: 0.9 },
    ]

    expect(textOf(buildCaptionFiltersFromTimings(words, LAYOUT)[0])).toBe(
      "Wait, really? well-timed!",
    )
  })

  it("emits no filter for a group whose text sanitises to empty", () => {
    const words: WordTiming[] = [
      { word: "@@@", start: 0.0, end: 0.3 },
      { word: "###", start: 0.3, end: 0.6 },
      { word: "***", start: 0.6, end: 0.9 },
    ]

    expect(buildCaptionFiltersFromTimings(words, LAYOUT)).toEqual([])
  })

  it("skips only the empty-after-sanitising group and keeps its neighbours", () => {
    const words: WordTiming[] = [
      { word: "hello", start: 0.0, end: 0.3 },
      { word: "there", start: 0.3, end: 0.6 },
      { word: "friend", start: 0.6, end: 0.9 },
      { word: "@@@", start: 0.9, end: 1.2 },
      { word: "###", start: 1.2, end: 1.5 },
      { word: "***", start: 1.5, end: 1.8 },
      { word: "goodbye", start: 1.8, end: 2.1 },
      { word: "for", start: 2.1, end: 2.4 },
      { word: "now", start: 2.4, end: 2.7 },
    ]

    expect(buildCaptionFiltersFromTimings(words, LAYOUT).map(textOf)).toEqual([
      "hello there friend",
      "goodbye for now",
    ])
  })

  // DOCUMENTS CURRENT BEHAVIOUR (not a bug report): a word passes the validity
  // filter when `end >= start`, but `flush()` requires `end > start` before it
  // emits. So a zero-duration group is silently dropped — a caption with a
  // zero-length `between(t,x,x)` window would never render anyway.
  it("drops a group whose window has zero duration", () => {
    const words: WordTiming[] = [{ word: "blip", start: 1, end: 1 }]

    expect(buildCaptionFiltersFromTimings(words, LAYOUT)).toEqual([])
  })

  it("treats wordsPerGroup below 1 as 1 (one word per phrase)", () => {
    const filters = buildCaptionFiltersFromTimings(evenWords(3), { ...LAYOUT, wordsPerGroup: 0 })

    expect(filters.map(textOf)).toEqual(["w0", "w1", "w2"])
  })

  it("emits filters that carry the drawtext font, centring and enable window", () => {
    const [filter] = buildCaptionFiltersFromTimings(evenWords(3), LAYOUT)

    expect(filter.startsWith("drawtext=")).toBe(true)
    expect(filter).toContain("fontfile=Roboto_Condensed-Medium.ttf")
    expect(filter).toContain("x=(w-text_w)/2")
    expect(filter).toMatch(/enable='between\(t,0\.00,0\.90\)'/)
  })
})
