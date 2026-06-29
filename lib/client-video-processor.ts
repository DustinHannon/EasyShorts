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
// Shared so concurrent generations await ONE load (racing load() calls hang the
// multi-thread core). isMultiThread is global because the core instance is shared.
let sharedLoadPromise: Promise<void> | null = null
let sharedIsMultiThread = false

export class ClientVideoProcessor {
  private ffmpeg: FFmpeg
  private filesInVFS: Set<string> = new Set()

  constructor() {
    sharedFFmpeg = sharedFFmpeg ?? new FFmpeg()
    this.ffmpeg = sharedFFmpeg
  }

  private async initFFmpeg() {
    if (this.ffmpeg.loaded) return
    // Share one load across concurrent generations — racing load() calls on the
    // shared instance hang the multi-thread core.
    if (sharedLoadPromise) {
      await sharedLoadPromise
      return
    }
    sharedLoadPromise = this.loadCore()
    try {
      await sharedLoadPromise
    } catch (error) {
      sharedLoadPromise = null // allow a retry after a failed/timed-out load
      throw error
    }
  }

  private async loadCore(): Promise<void> {
    if (!baseListenersBound) {
      this.ffmpeg.on("log", ({ message }) => {
        console.log("FFmpeg WebAssembly:", message)
      })
      baseListenersBound = true
    }

    // Multi-thread needs SharedArrayBuffer, which requires the page to be
    // cross-origin isolated (COOP/COEP on /create). The MT core is self-hosted
    // same-origin (/public/ffmpeg) so COEP doesn't block it.
    sharedIsMultiThread =
      typeof SharedArrayBuffer !== "undefined" &&
      typeof self !== "undefined" &&
      self.crossOriginIsolated === true

    const loadConfig = sharedIsMultiThread
      ? {
          coreURL: "/ffmpeg/ffmpeg-core.js",
          wasmURL: "/ffmpeg/ffmpeg-core.wasm",
          workerURL: "/ffmpeg/ffmpeg-core.worker.js",
        }
      : {
          // Stage A fallback: single-thread core from unpkg (page not isolated).
          coreURL: await toBlobURL("https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js", "text/javascript"),
          wasmURL: await toBlobURL("https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm", "application/wasm"),
        }

    console.log(
      sharedIsMultiThread
        ? "🔧 Loading FFmpeg multi-thread core (crossOriginIsolated)..."
        : "⚠️ Not crossOriginIsolated — loading single-thread core (fallback)",
    )

    // Fail loud: a hung load() (a known multi-thread failure mode) rejects after
    // the timeout instead of leaving the UI stuck at 5% forever.
    const LOAD_TIMEOUT_MS = 90_000
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.ffmpeg.load(loadConfig),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`FFmpeg core load timed out after ${LOAD_TIMEOUT_MS / 1000}s`)),
            LOAD_TIMEOUT_MS,
          )
        }),
      ])
      console.log(`✅ FFmpeg loaded (${sharedIsMultiThread ? "multi-thread" : "single-thread"})`)
    } catch (error) {
      console.error("❌ Failed to load FFmpeg core:", error)
      throw new Error(`FFmpeg core load failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (timer) clearTimeout(timer)
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

  private async safeReadFile(filename: string): Promise<Uint8Array> {
    try {
      if (!this.filesInVFS.has(filename)) {
        throw new Error(`File ${filename} not found in virtual filesystem`)
      }
      const data = await this.ffmpeg.readFile(filename)
      console.log(`✅ Successfully read ${filename} from virtual filesystem`)
      return data as Uint8Array
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
    const { format, quality, projectId } = options
    const captions = options.captions // Re-enable captions by using the original captions setting
    const dimensions = formatDimensions[format]
    const qualityConfig = qualitySettings[quality]

    console.log("🎬 Starting video processing with options:", {
      audioUrl: options.audioUrl,
      backgroundUrl: options.backgroundUrl,
      scriptLength: options.script.length,
      scriptPreview: options.script.substring(0, 200) + "...",
      format,
      quality,
      captions: captions, // Show the actual value
      projectId,
      dimensions,
      qualityConfig,
    })

    this.filesInVFS.clear()

    try {
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

      if (captions && fontData && fontData.byteLength > 0) {
        await this.safeWriteFile("Roboto_Condensed-Medium.ttf", new Uint8Array(fontData))
        console.log("✅ Font file written to virtual filesystem")
      }

      let drawtextFilters: string[] = []
      if (captions && fontData) {
        onProgress?.({ stage: "captions", progress: 35, message: "Generating captions..." })
        const captionDims = {
          width: dimensions.width * qualityConfig.scale,
          height: dimensions.height * qualityConfig.scale,
        }
        if (options.wordTimings && options.wordTimings.length > 0) {
          // Real audio-aligned captions from transcription word timestamps.
          drawtextFilters = buildCaptionFiltersFromTimings(options.wordTimings, captionDims)
          console.log("📝 Audio-synced captions:", drawtextFilters.length, "phrases from", options.wordTimings.length, "words")
        }
        if (drawtextFilters.length === 0) {
          // Fallback: estimate timing from word count x voice speed (legacy).
          const voiceSpeed = options.voiceSpeed || 1.0
          drawtextFilters = this.generateCaptionFilters(options.script, captionDims, voiceSpeed)
          console.log("📝 Estimated caption timing (no word timestamps):", drawtextFilters.length, "filters")
        }
      } else {
        console.log("📝 Skipping caption generation - captions:", captions, "fontData:", !!fontData)
      }

      onProgress?.({ stage: "processing", progress: 50, message: "Creating video..." })
      const videoBlob = await this.createVideo({
        dimensions,
        qualityConfig,
        drawtextFilters,
        onProgress,
      })

      onProgress?.({ stage: "complete", progress: 100, message: "Video created successfully!" })
      return videoBlob
    } catch (error) {
      console.error("❌ Video processing error:", error)
      throw new Error(`Video processing failed: ${error}`)
    } finally {
      console.log("🧹 Cleaning up virtual filesystem...")
      await this.safeDeleteFile("audio.mp3")
      await this.safeDeleteFile("background.jpg")
      await this.safeDeleteFile("Roboto_Condensed-Medium.ttf")
      await this.safeDeleteFile("output.mp4")
      this.filesInVFS.clear()
    }
  }

  private async downloadAsset(url: string): Promise<ArrayBuffer> {
    try {
      console.log(`📥 Downloading asset: ${url}`)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.arrayBuffer()
      console.log(`✅ Downloaded ${data.byteLength} bytes from ${url}`)
      return data
    } catch (error) {
      console.error("❌ Failed to download asset:", url, error)
      throw new Error(`Failed to download asset from ${url}: ${error}`)
    }
  }

  private generateCaptionFilters(
    script: string,
    dimensions: { width: number; height: number },
    voiceSpeed = 1.0,
  ): string[] {
    const words = script.trim().split(/\s+/)
    const fontSize = Math.max(48, Math.floor(dimensions.height * 0.06))
    const yPosition = Math.floor(dimensions.height * 0.85)

    const baseWordsPerSecond = 2.5
    const adjustedWordsPerSecond = baseWordsPerSecond * voiceSpeed
    const timePerWord = 1 / adjustedWordsPerSecond

    console.log(`📝 Caption timing calculation:`, {
      voiceSpeed,
      baseWordsPerSecond,
      adjustedWordsPerSecond,
      timePerWord: timePerWord.toFixed(2),
    })

    const drawtextFilters: string[] = []

    // Group words into 1-3 word segments for better readability
    for (let i = 0; i < words.length; i += 2) {
      const wordGroup = words.slice(i, i + 2).join(" ") // Take 2 words at a time
      const cleanText = this.cleanTextForDrawtext(wordGroup)

      const startTime = i * timePerWord
      const endTime = (i + 2) * timePerWord

      const drawtextFilter = `drawtext=fontfile=Roboto_Condensed-Medium.ttf:text='${cleanText}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:box=1:boxcolor=black@0.5:boxborderw=5:enable='between(t,${startTime.toFixed(1)},${endTime.toFixed(1)})'`

      drawtextFilters.push(drawtextFilter)
    }

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
      .replace(/[^\w\s.,!?-]/g, "") // Keep only safe characters
      .replace(/\s+/g, " ") // Normalize whitespace
      .substring(0, 200) // Limit length to avoid filter complexity
      .trim()
  }

  private async createVideo(options: {
    dimensions: { width: number; height: number }
    qualityConfig: { scale: number; profile: string; preset: string; crf: number }
    drawtextFilters: string[]
    onProgress?: (progress: ProcessingProgress) => void
  }): Promise<Blob> {
    const { dimensions, qualityConfig, drawtextFilters, onProgress } = options

    const scaledWidth = Math.round(dimensions.width * qualityConfig.scale)
    const scaledHeight = Math.round(dimensions.height * qualityConfig.scale)

    console.log("🎬 Creating video with parameters:", {
      originalDimensions: dimensions,
      scaledDimensions: { width: scaledWidth, height: scaledHeight },
      qualityConfig,
      captionFiltersCount: drawtextFilters.length,
    })

    // 24fps: a static-background video only changes when captions pop in, so
    // 24fps looks identical to 30fps while encoding ~20% fewer frames (faster).
    const baseFilter = `[0:v]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase,crop=${scaledWidth}:${scaledHeight},fps=24[video]`

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
      // Multi-thread encode: cap threads at 4 (libx264-in-wasm gets unstable higher).
      ...(sharedIsMultiThread
        ? ["-threads", String(Math.min(typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4, 4))]
        : []),
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

    try {
      console.log("🎬 Starting FFmpeg execution...")
      await this.ffmpeg.exec(ffmpegArgs)
      console.log("✅ FFmpeg execution completed successfully")

      try {
        // Try to read a small portion to verify the file exists and is accessible
        const testRead = await this.ffmpeg.readFile("output.mp4")
        if (!testRead || (testRead as Uint8Array).length === 0) {
          throw new Error("Output file exists but is empty")
        }
        this.filesInVFS.add("output.mp4")
        console.log("✅ Output file verified and added to VFS tracking")
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

    const outputData = await this.safeReadFile("output.mp4")
    if (!outputData || outputData.length === 0) {
      throw new Error("FFmpeg produced empty output file")
    }

    console.log(`✅ Video processing complete: ${outputData.length} bytes`)
    return new Blob([outputData], { type: "video/mp4" })
  }
}
