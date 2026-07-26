import { FFmpeg } from "@ffmpeg/ffmpeg"
import { toBlobURL } from "@ffmpeg/util"
import { buildCaptionFiltersFromTimings, type WordTiming } from "@/lib/captions"

export interface VideoProcessingOptions {
  audioUrl: string
  backgroundUrl: string
  script: string
  format: "vertical" | "square" | "horizontal"
  quality: "720p" | "1080p" | "4k"
  captions: boolean
  projectId: string
  voiceSpeed?: number
  // Real word-level timings from transcription; when present, captions are
  // aligned to the audio instead of estimated from words-per-second.
  wordTimings?: WordTiming[]
  // Ken Burns background animation; defaults to static ("none").
  animation?: "none" | "zoom-in" | "zoom-out" | "pan"
  // Measured length of the voiceover in seconds (the clip's real length, since
  // the encode loops a still image and ends on -shortest). Used to normalise the
  // Ken Burns motion so it completes exactly at the end of the clip. When
  // absent, the animation falls back to fixed per-frame rates.
  durationSeconds?: number
}

export interface ProcessingProgress {
  stage: string
  progress: number
  message: string
}

const formatDimensions = {
  vertical: { width: 1080, height: 1920 }, // 9:16 for TikTok/Shorts
  square: { width: 1080, height: 1080 }, // 1:1 for Instagram
  horizontal: { width: 1920, height: 1080 }, // 16:9 for YouTube
}

// scale = resolution multiplier; preset/crf make the tiers genuinely differ in
// speed and quality. 720p uses a faster preset (the common/fast tier); higher
// tiers trade speed for quality via a lower CRF. (We intentionally do NOT pass
// -level: the libx264 auto-selected level fits tall vertical frames, whereas a
// hard-coded landscape level can make encoding fail.)
const qualitySettings = {
  "720p": { scale: 0.67, profile: "baseline", preset: "veryfast", crf: 24 },
  "1080p": { scale: 1, profile: "high", preset: "fast", crf: 21 },
  "4k": { scale: 2, profile: "high", preset: "fast", crf: 20 },
}

// Reuse one FFmpeg instance (and its ~30MB WASM core) across generations so a
// second video does not re-download/re-init the core. The single-threaded UMD
// core is loaded once; per-generation progress is wired via add/remove listener
// in createVideo so handlers never stack on the shared instance.
let sharedFFmpeg: FFmpeg | null = null
let baseListenersBound = false
// One in-flight core load shared by every caller: `ffmpeg.loaded` only flips
// true after load() resolves, so without this a second initFFmpeg during the
// ~30MB core download would call load() again on the same instance and hang the
// worker. Reset to null on failure so a later attempt can retry.
let loadPromise: Promise<void> | null = null
// Only one generation at a time. The FFmpeg virtual filesystem is global, so
// concurrent runs would overwrite each other's fixed filenames ("audio.mp3",
// "background.jpg", "output.mp4") and one run's cleanup would delete the
// other's inputs mid-encode. The per-instance `filesInVFS` Set cannot see that.
let generationInFlight = false

// Bound every asset fetch: an unbounded stall would leave Promise.all pending
// forever, so processVideo never settles and the caller's finally never runs.
const ASSET_TIMEOUT_MS = 60000

export class ClientVideoProcessor {
  private ffmpeg: FFmpeg
  private filesInVFS: Set<string> = new Set()

  constructor() {
    sharedFFmpeg = sharedFFmpeg ?? new FFmpeg()
    this.ffmpeg = sharedFFmpeg
  }

  private async initFFmpeg() {
    if (!this.ffmpeg.loaded) {
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"

      if (!baseListenersBound) {
        this.ffmpeg.on("log", ({ message }) => {
          console.log("FFmpeg WebAssembly:", message)
        })
        baseListenersBound = true
      }

      try {
        console.log("🔧 Loading FFmpeg WebAssembly core...")
        // Assigned synchronously (the IIFE returns its promise before the first
        // await), so a concurrent caller joins this load instead of starting a
        // second one while the core/wasm is still downloading.
        loadPromise ??= (async () => {
          await this.ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
          })
        })().catch((error) => {
          loadPromise = null
          throw error
        })
        await loadPromise
        console.log("✅ FFmpeg WebAssembly loaded successfully")
      } catch (error) {
        console.error("❌ Failed to load FFmpeg WebAssembly:", error)
        throw new Error(`FFmpeg WebAssembly initialization failed: ${error}`)
      }
    }
  }

  private async safeWriteFile(filename: string, data: Uint8Array): Promise<void> {
    try {
      await this.ffmpeg.writeFile(filename, data)
      this.filesInVFS.add(filename)
      console.log(`✅ Successfully wrote ${filename} to virtual filesystem`)
    } catch (error) {
      console.error(`❌ Failed to write ${filename} to virtual filesystem:`, error)
      throw new Error(`Failed to write ${filename} to virtual filesystem: ${error}`)
    }
  }

  // Returns Uint8Array<ArrayBuffer> (not the wider ArrayBufferLike) so the
  // result is directly usable as a BlobPart. The narrowing is sound here: a
  // SharedArrayBuffer-backed view would require cross-origin isolation, and this
  // app deliberately runs the single-threaded core WITHOUT COEP (see the CSP
  // notes in next.config.mjs), so ffmpeg.wasm never hands back a shared buffer.
  private async safeReadFile(filename: string): Promise<Uint8Array<ArrayBuffer>> {
    try {
      if (!this.filesInVFS.has(filename)) {
        throw new Error(`File ${filename} not found in virtual filesystem`)
      }
      const data = await this.ffmpeg.readFile(filename)
      console.log(`✅ Successfully read ${filename} from virtual filesystem`)
      return data as Uint8Array<ArrayBuffer>
    } catch (error) {
      console.error(`❌ Failed to read ${filename} from virtual filesystem:`, error)
      throw new Error(`Failed to read ${filename} from virtual filesystem: ${error}`)
    }
  }

  private async safeDeleteFile(filename: string): Promise<void> {
    try {
      if (this.filesInVFS.has(filename)) {
        await this.ffmpeg.deleteFile(filename)
        this.filesInVFS.delete(filename)
        console.log(`✅ Successfully deleted ${filename} from virtual filesystem`)
      } else {
        console.log(`ℹ️ File ${filename} not in virtual filesystem, skipping deletion`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("ErrnoError")) {
        console.warn(`⚠️ Filesystem error deleting ${filename} (file may not exist):`, error.message)
      } else {
        console.warn(`⚠️ Could not delete ${filename} from virtual filesystem:`, error)
      }
      // Remove from tracking even if deletion failed
      this.filesInVFS.delete(filename)
    }
  }

  async processVideo(
    options: VideoProcessingOptions,
    onProgress?: (progress: ProcessingProgress) => void,
  ): Promise<Blob> {
    // Set before the first await; cleared in the finally below (success AND
    // throw). See `generationInFlight` above for why this must be serialized.
    if (generationInFlight) {
      throw new Error("A video is already being generated. Please wait for it to finish.")
    }
    generationInFlight = true

    // Everything below lives inside the try so the finally ALWAYS releases
    // `generationInFlight`. Nothing may sit between the flag and the try — a
    // throw there would strand the flag true for the lifetime of the page and
    // permanently block every later run. (The early-throw above is deliberately
    // OUTSIDE the try: it must not clear the in-flight run's flag.)
    try {
      const { format, quality, projectId } = options
      const captions = options.captions // Re-enable captions by using the original captions setting
      const dimensions = formatDimensions[format]
      const qualityConfig = qualitySettings[quality]

      console.log("🎬 Starting video processing with options:", {
        audioUrl: options.audioUrl,
        backgroundUrl: options.backgroundUrl,
        scriptLength: options.script?.length ?? 0,
        scriptPreview: (options.script ?? "").substring(0, 200) + "...",
        format,
        quality,
        captions: captions, // Show the actual value
        projectId,
        dimensions,
        qualityConfig,
      })

      this.filesInVFS.clear()

      onProgress?.({ stage: "initializing", progress: 5, message: "Initializing video processor..." })
      await this.initFFmpeg()

      onProgress?.({ stage: "preparing", progress: 15, message: "Downloading assets..." })

      // Fetch audio, background, and (optionally) the caption font concurrently.
      const [audioData, backgroundData, fontData] = await Promise.all([
        this.downloadAsset(options.audioUrl),
        this.downloadAsset(options.backgroundUrl),
        captions
          ? this.downloadAsset("/fonts/Roboto_Condensed-Medium.ttf").catch((error) => {
              console.warn("⚠️ Could not download caption font; captions will be skipped:", error)
              return null as ArrayBuffer | null
            })
          : Promise.resolve<ArrayBuffer | null>(null),
      ])
      console.log("✅ Assets downloaded:", { audio: audioData.byteLength, background: backgroundData.byteLength })

      if (!audioData || audioData.byteLength === 0) {
        throw new Error("Audio file download failed or is empty")
      }
      if (!backgroundData || backgroundData.byteLength === 0) {
        throw new Error("Background image download failed or is empty")
      }

      onProgress?.({ stage: "preparing", progress: 25, message: "Preparing assets..." })
      await this.safeWriteFile("audio.mp3", new Uint8Array(audioData))
      await this.safeWriteFile("background.jpg", new Uint8Array(backgroundData))

      // Normalise ONCE: a zero-length ArrayBuffer is truthy, so checking only
      // `fontData` below would skip writing the font yet still build drawtext
      // filters that hard-code fontfile=... — ffmpeg then aborts and the whole
      // generation fails instead of degrading to a caption-less video.
      const usableFont = fontData && fontData.byteLength > 0 ? fontData : null

      if (captions && usableFont) {
        await this.safeWriteFile("Roboto_Condensed-Medium.ttf", new Uint8Array(usableFont))
        console.log("✅ Font file written to virtual filesystem")
      }

      let drawtextFilters: string[] = []
      if (captions && usableFont) {
        onProgress?.({ stage: "captions", progress: 35, message: "Generating captions..." })
        // Rounded exactly like createVideo's scaledWidth/scaledHeight so the
        // caption sizer measures against the REAL encoded frame — the new
        // width clamp divides by this, so a fractional width would quietly
        // shift the budget it is supposed to guarantee.
        const captionDims = {
          width: Math.round(dimensions.width * qualityConfig.scale),
          height: Math.round(dimensions.height * qualityConfig.scale),
        }
        if (options.wordTimings && options.wordTimings.length > 0) {
          // Real audio-aligned captions from transcription word timestamps.
          drawtextFilters = buildCaptionFiltersFromTimings(options.wordTimings, captionDims)
          console.log("📝 Audio-synced captions:", drawtextFilters.length, "phrases from", options.wordTimings.length, "words")
        }
        if (drawtextFilters.length === 0) {
          // Fallback: estimate timing from word count x voice speed (legacy).
          const voiceSpeed = options.voiceSpeed || 1.0
          drawtextFilters = this.generateCaptionFilters(
            options.script,
            captionDims,
            voiceSpeed,
            options.durationSeconds,
          )
          console.log("📝 Estimated caption timing (no word timestamps):", drawtextFilters.length, "filters")
        }
      } else {
        console.log("📝 Skipping caption generation - captions:", captions, "usableFont:", !!usableFont)
      }

      onProgress?.({ stage: "processing", progress: 50, message: "Creating video..." })
      const videoBlob = await this.createVideo({
        dimensions,
        qualityConfig,
        drawtextFilters,
        animation: options.animation,
        durationSeconds: options.durationSeconds,
        onProgress,
      })

      onProgress?.({ stage: "complete", progress: 100, message: "Video created successfully!" })
      return videoBlob
    } catch (error) {
      console.error("❌ Video processing error:", error)
      throw new Error(`Video processing failed: ${error}`)
    } finally {
      // Release FIRST. safeDeleteFile swallows rejections, but it cannot
      // survive a promise that never settles: @ffmpeg/ffmpeg resolves
      // deleteFile from a worker postMessage reply, so if the WASM core aborts
      // (e.g. OOM on the 4k tier, which upscales 2160x3840 further for Ken
      // Burns) no reply ever arrives and the await hangs forever. Releasing
      // after the awaits would strand the flag true for the life of the page
      // and make every later run fail with "already being generated".
      generationInFlight = false

      console.log("🧹 Cleaning up virtual filesystem...")
      await this.safeDeleteFile("audio.mp3")
      await this.safeDeleteFile("background.jpg")
      await this.safeDeleteFile("Roboto_Condensed-Medium.ttf")
      await this.safeDeleteFile("output.mp4")
      this.filesInVFS.clear()
    }
  }

  private async downloadAsset(url: string): Promise<ArrayBuffer> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ASSET_TIMEOUT_MS)
    try {
      console.log(`📥 Downloading asset: ${url}`)
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      // An expired session can redirect a static asset request to the HTML
      // login page; writing that HTML into the FFmpeg VFS as a font/image
      // fails later in a way that is impossible to diagnose from ffmpeg's error.
      const contentType = (response.headers.get("content-type") || "").toLowerCase()
      if (contentType.startsWith("text/html")) {
        throw new Error("Expected a binary asset but received an HTML page (session may have expired)")
      }
      const data = await response.arrayBuffer()
      console.log(`✅ Downloaded ${data.byteLength} bytes from ${url}`)
      return data
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error("❌ Timed out downloading asset:", url)
        throw new Error(`Timed out downloading asset from ${url}`)
      }
      console.error("❌ Failed to download asset:", url, error)
      throw new Error(`Failed to download asset from ${url}: ${error}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  private generateCaptionFilters(
    script: string,
    dimensions: { width: number; height: number },
    voiceSpeed = 1.0,
    durationSeconds?: number,
  ): string[] {
    const words = script.trim().split(/\s+/)
    const fontSize = Math.max(48, Math.floor(dimensions.height * 0.06))
    const yPosition = Math.floor(dimensions.height * 0.85)

    // Prefer the REAL audio length when we have it: spreading the script evenly
    // across the measured duration keeps the last caption aligned with the last
    // spoken word. The 2.5 words/sec guess is only a fallback, and it drifts
    // further the longer the script runs.
    const hasDuration = typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0
    const timePerWord = hasDuration
      ? durationSeconds! / Math.max(1, words.length)
      : 1 / (2.5 * voiceSpeed)

    console.log(`📝 Caption timing calculation:`, {
      source: hasDuration ? "measured audio duration" : "estimated 2.5 words/sec",
      durationSeconds,
      wordCount: words.length,
      voiceSpeed,
      timePerWord: timePerWord.toFixed(3),
    })

    // Build the phrases first so one uniform size can be chosen for all of them
    // (sizing each phrase independently makes the caption visibly resize several
    // times a second). Mirrors lib/captions.ts.
    const phrases: { text: string; start: number; end: number }[] = []
    for (let i = 0; i < words.length; i += 2) {
      const wordGroup = words.slice(i, i + 2).join(" ") // Take 2 words at a time
      const cleanText = this.cleanTextForDrawtext(wordGroup)
      // An emoji-only group sanitizes to "", and text='' with box=1 draws a
      // bare black box on screen. Skip it (mirrors the Whisper path's guard).
      if (!cleanText) continue

      // The final slice may hold only ONE word; i+2 would keep that caption on
      // screen for double its share.
      phrases.push({
        text: cleanText,
        start: i * timePerWord,
        end: Math.min(i + 2, words.length) * timePerWord,
      })
    }

    if (phrases.length === 0) return []

    // Same width clamp as the audio-synced path: drawtext never wraps, so a long
    // group at the height-derived size overflows the frame and x=(w-text_w)/2
    // goes negative, clipping it at both edges.
    const widthBudget = dimensions.width * 0.9
    const fitted = phrases.reduce(
      (size, p) => Math.min(size, Math.floor(widthBudget / (p.text.length * 0.5))),
      fontSize,
    )
    const finalSize = Math.max(36, fitted)

    const drawtextFilters = phrases.map(
      (p) =>
        `drawtext=fontfile=Roboto_Condensed-Medium.ttf:text='${p.text}':fontcolor=white:fontsize=${finalSize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=black@0.5:boxborderw=5:enable='between(t,${p.start.toFixed(1)},${p.end.toFixed(1)})'`,
    )

    console.log(
      `📝 Generated ${drawtextFilters.length} time-synchronized caption filters with voice speed ${voiceSpeed}x`,
    )
    console.log("📝 First caption filter:", drawtextFilters[0]?.substring(0, 150) + "...")
    return drawtextFilters
  }

  private cleanTextForDrawtext(text: string): string {
    return text
      .replace(/['"]/g, "") // Remove quotes entirely
      .replace(/[:]/g, " ") // Replace colons with spaces
      .replace(/[%]/g, "percent") // Replace % with word
      .replace(/[\\]/g, "") // Remove backslashes
      .replace(/[\n\r\t]/g, " ") // Replace newlines/tabs with spaces
      // Unicode-aware: bare \w is [A-Za-z0-9_], which would delete accents
      // ("años" -> "aos") and strip non-Latin scripts entirely.
      .replace(/[^\p{L}\p{N}\s.,!?-]/gu, "") // Keep only safe characters
      .replace(/\s+/g, " ") // Normalize whitespace
      .substring(0, 200) // Limit length to avoid filter complexity
      .trim()
  }

  private async createVideo(options: {
    dimensions: { width: number; height: number }
    qualityConfig: { scale: number; profile: string; preset: string; crf: number }
    drawtextFilters: string[]
    animation?: "none" | "zoom-in" | "zoom-out" | "pan"
    durationSeconds?: number
    onProgress?: (progress: ProcessingProgress) => void
  }): Promise<Blob> {
    const { dimensions, qualityConfig, drawtextFilters, animation, durationSeconds, onProgress } = options

    const scaledWidth = Math.round(dimensions.width * qualityConfig.scale)
    const scaledHeight = Math.round(dimensions.height * qualityConfig.scale)

    console.log("🎬 Creating video with parameters:", {
      originalDimensions: dimensions,
      scaledDimensions: { width: scaledWidth, height: scaledHeight },
      qualityConfig,
      captionFiltersCount: drawtextFilters.length,
    })

    // Base video filter at 24fps. For Ken Burns (zoom/pan), upscale first with
    // lanczos so zoompan's integer-pixel motion becomes smooth sub-pixel motion,
    // then zoompan downsamples to the output size. d=99999 + -shortest gives one
    // continuous move for the whole clip (no per-image reset). Static otherwise.
    const kenBurns = animation && animation !== "none" ? animation : null
    let baseFilter: string
    if (kenBurns) {
      // Keep the upscale buffer modest (WASM memory); smaller factor for 4K.
      const factor = scaledWidth * scaledHeight > 2_500_000 ? 2 : 3
      const even = (n: number) => {
        const v = Math.round(n)
        return v % 2 === 0 ? v : v + 1
      }
      const upW = even(scaledWidth * factor)
      const upH = even(scaledHeight * factor)
      const centered = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
      // Normalise the motion to the clip's length so the move finishes exactly
      // at the end. With fixed per-frame rates the 1.0->1.5 zoom took 833 frames
      // (~35s at 24fps) and the pan a hard-coded 1500 (~62s) regardless of the
      // video: a 15s short only performed ~43% of the zoom, and a 60s video froze
      // for its last 25s. Falls back to the old constants when the length is
      // unknown, so behaviour is unchanged in that case.
      const totalFrames =
        typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0
          ? Math.max(1, Math.round(durationSeconds * 24))
          : null
      // Clamped away from zero: toFixed(6) on an absurdly long clip would
      // otherwise round the step to "0.000000" and freeze the zoom entirely.
      const zoomStep = totalFrames ? Math.max(0.000001, 0.5 / totalFrames).toFixed(6) : "0.0006"
      const panFrames = totalFrames ?? 1500
      const zoompan =
        kenBurns === "zoom-out"
          ? `z='if(eq(on,1),1.5,max(zoom-${zoomStep},1.0))':${centered}`
          : kenBurns === "pan"
            ? `z='1.2':x='(iw-iw/zoom)*on/${panFrames}':y='ih/2-(ih/zoom/2)'`
            : `z='min(zoom+${zoomStep},1.5)':${centered}`
      baseFilter = `[0:v]scale=${upW}:${upH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${upW}:${upH},setsar=1,zoompan=${zoompan}:d=99999:s=${scaledWidth}x${scaledHeight}:fps=24[video]`
    } else {
      // Static: a still background only changes when captions pop in, so 24fps
      // looks identical to 30fps while encoding ~20% fewer frames (faster).
      baseFilter = `[0:v]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase,crop=${scaledWidth}:${scaledHeight},fps=24[video]`
    }

    let filterComplex: string
    let mapVideo: string

    if (drawtextFilters.length > 0) {
      const combinedDrawtext = drawtextFilters.join(",")
      filterComplex = `${baseFilter};[video]${combinedDrawtext}[final]`
      mapVideo = "[final]"
      console.log("🎬 Using time-synchronized captions with", drawtextFilters.length, "filters")
    } else {
      filterComplex = baseFilter
      mapVideo = "[video]"
      console.log("🎬 Using base filter only (no captions):", filterComplex)
    }

    const ffmpegArgs = [
      "-loop",
      "1",
      "-framerate",
      "24",
      "-i",
      "background.jpg",
      "-i",
      "audio.mp3",
      "-filter_complex",
      filterComplex,
      "-map",
      mapVideo,
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      qualityConfig.profile,
      "-preset",
      qualityConfig.preset,
      "-crf",
      String(qualityConfig.crf),
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-shortest",
      "-y",
      "output.mp4",
    ]

    console.log("🎬 Executing FFmpeg with args:", ffmpegArgs)

    let lastProgress = 50
    // Named handler so it can be removed after this run — the FFmpeg instance is
    // shared across generations, so an anonymous listener would stack each time.
    const progressHandler = ({ progress }: { progress: number; time: number }) => {
      const currentProgress = Math.min(95, 50 + progress * 45)
      if (currentProgress > lastProgress + 5) {
        lastProgress = currentProgress
        onProgress?.({
          stage: "processing",
          progress: currentProgress,
          message: `Processing video... ${Math.round(progress * 100)}%`,
        })
      }
    }
    this.ffmpeg.on("progress", progressHandler)

    // Uint8Array<ArrayBuffer> (not the wider ArrayBufferLike) so it is a valid
    // BlobPart below — see the note on safeReadFile.
    let outputData: Uint8Array<ArrayBuffer> | null = null

    try {
      console.log("🎬 Starting FFmpeg execution...")
      await this.ffmpeg.exec(ffmpegArgs)
      console.log("✅ FFmpeg execution completed successfully")

      // Read the encoded output exactly ONCE and reuse it for the Blob: the
      // file is tens of MB, so a separate "verify" read doubled the amount
      // pulled out of WASM memory for no benefit.
      try {
        // Tracked before the read so the finally-block cleanup deletes it even
        // if the read itself fails.
        this.filesInVFS.add("output.mp4")
        const data = await this.safeReadFile("output.mp4")
        if (!data || data.length === 0) {
          throw new Error("Output file exists but is empty")
        }
        outputData = data
        console.log(`✅ Output file verified (${data.length} bytes) and tracked in VFS`)
      } catch (verifyError) {
        console.error("❌ Output file verification failed:", verifyError)
        // List all files in VFS for debugging
        try {
          const files = await this.ffmpeg.listDir("/")
          console.log("📁 Files in virtual filesystem:", files)
        } catch (listError) {
          console.error("❌ Could not list VFS files:", listError)
        }
        throw new Error(`FFmpeg completed but output file is not accessible: ${verifyError}`)
      }
    } catch (error) {
      console.error("❌ FFmpeg execution failed:", error)
      console.error("❌ FFmpeg args that failed:", ffmpegArgs)
      throw new Error(`FFmpeg execution failed: ${error}`)
    } finally {
      this.ffmpeg.off("progress", progressHandler)
    }

    if (!outputData || outputData.length === 0) {
      throw new Error("FFmpeg produced empty output file")
    }

    console.log(`✅ Video processing complete: ${outputData.length} bytes`)
    return new Blob([outputData], { type: "video/mp4" })
  }
}
