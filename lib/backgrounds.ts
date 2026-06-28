// Single source of truth for how a project's background is resolved to a real
// URL. `video_settings.background` is stored as a STRING with one of three
// shapes: a preset key ("default"/"nature"/"city"/"space" + aliases), a saved
// background reference ("saved-<uuid>", looked up in the `backgrounds` table),
// or a generated reference ("generated-<index>" into video_settings.customBackgrounds).
// Both the client wizard (generate-step) and the server (/api/video/record)
// must resolve identically — hence this shared module.

export const DEFAULT_BACKGROUND_URL = "/abstract-background.png"

export const PRESET_BACKGROUND_MAP: Record<string, string> = {
  default: "/abstract-background.png",
  "abstract-gradient": "/abstract-background.png",
  nature: "/serene-mountain-lake.png",
  "mountain-lake": "/serene-mountain-lake.png",
  city: "/vibrant-city-skyline.png",
  "city-skyline": "/vibrant-city-skyline.png",
  space: "/space-stars.png",
  "space-stars": "/space-stars.png",
}

export type BackgroundKind = "saved" | "generated" | "preset"

export interface VideoSettings {
  background?: string
  customBackgrounds?: string[]
  format?: "vertical" | "square" | "horizontal"
  quality?: "720p" | "1080p" | "4k"
  captions?: boolean
  // The wizard stores duration as a Select string ("auto"/"15"/"30"/"60"); the
  // record route coerces it to an integer. Allow both shapes.
  duration?: string | number
  [key: string]: unknown
}

export function backgroundKindOf(background: string | undefined | null): BackgroundKind {
  if (typeof background === "string" && background.startsWith("saved-")) return "saved"
  if (typeof background === "string" && background.startsWith("generated-")) return "generated"
  return "preset"
}

// Resolve a background string to a concrete URL.
// `lookupSavedUrl(id)` resolves a "saved-<id>" reference against the backgrounds
// table; the caller injects it (client passes a Supabase-backed fn scoped to the
// user; the server route does the same) so this module stays storage-agnostic.
export async function resolveBackgroundUrl(
  videoSettings: VideoSettings | null | undefined,
  lookupSavedUrl?: (id: string) => Promise<string | null>,
): Promise<string> {
  const background = (videoSettings?.background ?? "default").toString()

  if (background.startsWith("saved-")) {
    const savedId = background.slice("saved-".length).trim()
    if (savedId && lookupSavedUrl) {
      try {
        const url = await lookupSavedUrl(savedId)
        if (url && url.trim() !== "") return url
      } catch {
        // fall through to default
      }
    }
    return DEFAULT_BACKGROUND_URL
  }

  if (background.startsWith("generated-")) {
    const indexStr = background.slice("generated-".length)
    const index = Number.parseInt(indexStr, 10)
    if (!Number.isNaN(index)) {
      const url = videoSettings?.customBackgrounds?.[index]
      if (url && url.trim() !== "") return url
    }
    return DEFAULT_BACKGROUND_URL
  }

  return PRESET_BACKGROUND_MAP[background] || DEFAULT_BACKGROUND_URL
}
