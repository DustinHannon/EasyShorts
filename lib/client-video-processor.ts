import { FFmpeg } from "@ffmpeg/ffmpeg"
import { toBlobURL } from "@ffmpeg/util"

export interface VideoProcessingOptions {
  audioUrl: string
  backgroundUrl: string
  script: string
  format: "vertical" | "square" | "horizontal"
  quality: "720p" | "1080p" | "4k"
  captions: boolean
  projectId: string
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

const qualitySettings = {
  "720p": { scale: 0.67, bitrate: "2M", profile: "baseline", level: "3.0" },
  "1080p": { scale: 1, bitrate: "4M", profile: "high", level: "4.0" },
  "4k": { scale: 2, bitrate: "20M", profile: "high", level: "5.1" },
}

export class ClientVideoProcessor {
  private ffmpeg: FFmpeg
  private filesInVFS: Set<string> = new Set()

  constructor() {
    this.ffmpeg = new FFmpeg()
  }

  private async initFFmpeg() {
    if (!this.ffmpeg.loaded) {
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"

      this.ffmpeg.on("log", ({ message }) => {
        console.log("FFmpeg WebAssembly:", message)
      })

      this.ffmpeg.on("progress", ({ progress, time }) => {
        console.log("FFmpeg Progress:", { progress: Math.round(progress * 100), time })
      })

      try {
        console.log("🔧 Loading FFmpeg WebAssembly core...")
        await this.ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        })
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
      }
    } catch (error) {
      console.warn(`⚠️ Could not delete ${filename} from virtual filesystem:`, error)
    }
  }

  async processVideo(
    options: VideoProcessingOptions,
    onProgress?: (progress: ProcessingProgress) => void,
  ): Promise<Blob> {
    const { format, quality, captions, projectId } = options
    const dimensions = formatDimensions[format]
    const qualityConfig = qualitySettings[quality]

    console.log("🎬 Starting video processing with options:", {
      audioUrl: options.audioUrl,
      backgroundUrl: options.backgroundUrl,
      scriptLength: options.script.length,
      scriptPreview: options.script.substring(0, 200) + "...",
      format,
      quality,
      captions,
      projectId,
      dimensions,
      qualityConfig,
    })

    this.filesInVFS.clear()

    try {
      onProgress?.({ stage: "initializing", progress: 5, message: "Initializing video processor..." })
      await this.initFFmpeg()

      onProgress?.({ stage: "preparing", progress: 15, message: "Downloading assets..." })

      console.log("📥 Downloading audio from:", options.audioUrl)
      const audioData = await this.downloadAsset(options.audioUrl)
      console.log("✅ Audio downloaded:", audioData.byteLength, "bytes")

      console.log("📥 Downloading background from:", options.backgroundUrl)
      const backgroundData = await this.downloadAsset(options.backgroundUrl)
      console.log("✅ Background downloaded:", backgroundData.byteLength, "bytes")

      let fontData: ArrayBuffer | null = null
      if (captions) {
        try {
          console.log("📥 Downloading font for captions...")
          fontData = await this.downloadAsset("/fonts/Roboto_Condensed-Medium.ttf")
          console.log("✅ Font downloaded:", fontData.byteLength, "bytes")
        } catch (error) {
          console.warn("⚠️ Could not download font file, captions will be disabled:", error)
        }
      } else {
        console.log("📝 Captions disabled, skipping font download")
      }

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
        drawtextFilters = this.generateCaptionFilters(options.script, {
          width: dimensions.width * qualityConfig.scale,
          height: dimensions.height * qualityConfig.scale,
        })
        console.log("📝 Generated caption filters:", drawtextFilters.length, "filters")
        console.log("📝 First few caption filters:", drawtextFilters.slice(0, 3))
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

  private generateCaptionFilters(script: string, dimensions: { width: number; height: number }): string[] {
    const drawtextFilters: string[] = []

    // Split script into shorter, manageable chunks
    const words = script.split(" ").filter((word) => word.trim().length > 0)
    const wordsPerChunk = 4 // Smaller chunks for better reliability
    const wordsPerSecond = 2 // Slower pace for better readability
    let currentTime = 0

    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const chunk = words.slice(i, i + wordsPerChunk).join(" ")
      const duration = chunk.split(" ").length / wordsPerSecond
      const startTime = currentTime
      const endTime = currentTime + duration
      currentTime = endTime

      // Simple text cleaning - remove problematic characters
      const cleanText = this.cleanTextForDrawtext(chunk)

      // Basic, reliable drawtext settings with font file
      const fontSize = Math.max(32, Math.floor(dimensions.height * 0.05))
      const yPosition = Math.floor(dimensions.height * 0.8)

      drawtextFilters.push(
        `drawtext=fontfile=Roboto_Condensed-Medium.ttf:text=${cleanText}:fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPosition}:enable=between(t\\,${startTime}\\,${endTime})`,
      )
    }

    return drawtextFilters
  }

  private cleanTextForDrawtext(text: string): string {
    return (
      text
        // Remove or replace problematic characters
        .replace(/['"]/g, "") // Remove quotes entirely
        .replace(/[:]/g, " ") // Replace colons with spaces
        .replace(/[%]/g, "percent") // Replace % with word
        .replace(/[\\]/g, "") // Remove backslashes
        .replace(/[\n\r\t]/g, " ") // Replace newlines/tabs with spaces
        .replace(/[^\w\s.,!?-]/g, "") // Keep only safe characters
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim()
    )
  }

  private async createVideo(options: {
    dimensions: { width: number; height: number }
    qualityConfig: { scale: number; bitrate: string; profile: string; level: string }
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

    const baseFilter = `[0:v]scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase,crop=${scaledWidth}:${scaledHeight},fps=30[video]`

    let filterComplex: string
    if (drawtextFilters.length > 0) {
      // Build a proper filter chain where each drawtext filter is applied to the previous result
      let currentLabel = "video"
      let filterChain = baseFilter

      drawtextFilters.forEach((filter, index) => {
        const nextLabel = index === drawtextFilters.length - 1 ? "final" : `caption${index}`
        filterChain += `;[${currentLabel}]${filter}[${nextLabel}]`
        currentLabel = nextLabel
      })

      filterComplex = filterChain
      console.log("🎬 Caption filter chain created with", drawtextFilters.length, "filters")
      console.log("🎬 Full filter complex:", filterComplex)
    } else {
      filterComplex = baseFilter
      console.log("🎬 Using base filter only (no captions):", filterComplex)
    }

    const ffmpegArgs = [
      "-loop",
      "1",
      "-framerate",
      "30",
      "-i",
      "background.jpg",
      "-i",
      "audio.mp3",
      "-filter_complex",
      filterComplex,
      "-map",
      drawtextFilters.length > 0 ? "[final]" : "[video]",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      qualityConfig.profile,
      "-preset",
      "fast",
      "-crf",
      "23",
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
    this.ffmpeg.on("progress", ({ progress }) => {
      const currentProgress = Math.min(95, 50 + progress * 45)
      if (currentProgress > lastProgress + 5) {
        lastProgress = currentProgress
        onProgress?.({
          stage: "processing",
          progress: currentProgress,
          message: `Processing video... ${Math.round(progress * 100)}%`,
        })
      }
    })

    try {
      console.log("🎬 Starting FFmpeg execution...")
      await this.ffmpeg.exec(ffmpegArgs)
      console.log("✅ FFmpeg execution completed successfully")
      this.filesInVFS.add("output.mp4")
    } catch (error) {
      console.error("❌ FFmpeg execution failed:", error)
      console.error("❌ FFmpeg args that failed:", ffmpegArgs)
      throw new Error(`FFmpeg execution failed: ${error}`)
    }

    const outputData = await this.safeReadFile("output.mp4")
    if (!outputData || outputData.length === 0) {
      throw new Error("FFmpeg produced empty output file")
    }

    console.log(`✅ Video processing complete: ${outputData.length} bytes`)
    return new Blob([outputData], { type: "video/mp4" })
  }

  private parseBitrateToKbps(bitrate: string): number {
    const match = bitrate.match(/^(\d+)([MK]?)$/i)
    if (!match) throw new Error(`Invalid bitrate format: ${bitrate}`)

    const value = Number.parseInt(match[1])
    const unit = match[2]?.toUpperCase() || ""

    switch (unit) {
      case "M":
        return value * 1000
      case "K":
      case "":
        return value
      default:
        throw new Error(`Unknown bitrate unit: ${unit}`)
    }
  }
}
