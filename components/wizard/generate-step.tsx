"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useWizard } from "./wizard-provider"
import { updateProject } from "@/lib/supabase/actions"
import { Loader2, Play, Download, Share, RefreshCw, CheckCircle } from "lucide-react"
import { ClientVideoProcessor, type ProcessingProgress } from "@/lib/client-video-processor"
import { createClient } from "@/lib/supabase/client"
import { upload } from "@vercel/blob/client" // Import client upload function
import { useRouter } from "next/navigation"

interface VideoProgress {
  progress: number
  stage: string
  message: string
}

export function GenerateStep() {
  const { state, dispatch } = useWizard()
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState<ProcessingProgress>({
    progress: 0,
    stage: "waiting",
    message: "Ready to generate",
  })
  const [isComplete, setIsComplete] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [localVideoBlob, setLocalVideoBlob] = useState<Blob | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  const generateFullAudio = async (): Promise<string> => {
    console.log("🎵 Starting audio generation with settings:", {
      text: state.project.script?.substring(0, 100) + "...",
      voice: state.project.voice_settings?.voice || "alloy",
      speed: state.project.voice_settings?.speed || 1.0,
      scriptLength: state.project.script?.length,
    })

    try {
      const response = await fetch("/api/generate-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: state.project.script,
          voice: state.project.voice_settings?.voice || "alloy",
          speed: state.project.voice_settings?.speed || 1.0,
        }),
      })

      console.log("🎵 Audio generation API response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("❌ Audio generation failed:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })
        throw new Error(`Audio generation failed (${response.status}): ${errorText || response.statusText}`)
      }

      const audioBlob = await response.blob()
      console.log("✅ Audio generation successful:", {
        blobSize: audioBlob.size,
        blobType: audioBlob.type,
      })

      return URL.createObjectURL(audioBlob)
    } catch (error) {
      console.error("❌ Audio generation error:", error)
      throw new Error(`Failed to generate audio: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  const getBackgroundUrl = async (): Promise<string> => {
    const videoSettings = state.project.video_settings || {}
    const background = videoSettings.background || "default"

    console.log("🖼️ Resolving background URL for:", background)

    if (background.startsWith("saved-")) {
      const savedId = background.substring(6) // Remove "saved-" prefix (6 characters)
      if (!savedId || savedId.trim() === "") {
        console.warn("⚠️ Invalid saved background ID, using default")
        return "/abstract-background.png"
      }

      try {
        const supabase = createClient()
        const { data, error } = await supabase.from("backgrounds").select("url").eq("id", savedId).single()

        console.log("🔍 Database query result:", { data, error, savedId })

        if (!error && data) {
          const resolvedUrl = data.url
          if (resolvedUrl && resolvedUrl.trim() !== "") {
            console.log("✅ Found saved background URL:", resolvedUrl)
            return resolvedUrl
          } else {
            console.warn("⚠️ Saved background record exists but has no valid URL:", {
              data,
              url: data.url,
            })
          }
        } else {
          console.warn("⚠️ Database query failed or returned no data:", { error, data, savedId })
        }

        console.warn("⚠️ Falling back to default background due to invalid saved background")
        return "/abstract-background.png"
      } catch (error) {
        console.error("❌ Error fetching saved background:", error)
        return "/abstract-background.png"
      }
    }

    if (background.startsWith("generated-")) {
      const backgroundParts = background.split("-")
      const indexStr = backgroundParts[1]
      if (!indexStr || indexStr.trim() === "" || isNaN(Number(indexStr))) {
        console.warn("⚠️ Invalid generated background index, using default")
        return "/abstract-background.png"
      }
      const index = Number.parseInt(indexStr, 10)
      const generatedUrl = videoSettings.customBackgrounds?.[index]
      if (generatedUrl) {
        console.log("✅ Found generated background URL:", generatedUrl)
        return generatedUrl
      } else {
        console.warn("⚠️ Generated background not found at index", index)
      }
    }

    const backgroundMap: Record<string, string> = {
      default: "/abstract-background.png",
      "abstract-gradient": "/abstract-background.png",
      nature: "/serene-mountain-lake.png",
      "mountain-lake": "/serene-mountain-lake.png",
      city: "/vibrant-city-skyline.png",
      "city-skyline": "/vibrant-city-skyline.png",
      space: "/space-stars.png",
      "space-stars": "/space-stars.png",
    }

    const resolvedUrl = backgroundMap[background] || "/abstract-background.png"
    console.log("✅ Resolved preset background URL:", resolvedUrl)
    return resolvedUrl
  }

  const handleDownload = () => {
    if (localVideoBlob) {
      const url = URL.createObjectURL(localVideoBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${state.project.title || "video"}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else if (videoUrl) {
      const a = document.createElement("a")
      a.href = videoUrl
      a.download = `${state.project.title || "video"}.mp4`
      a.target = "_blank"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const handleShare = async () => {
    if (!videoUrl) {
      console.error("No video URL available for sharing")
      return
    }

    setIsSharing(true)
    try {
      await navigator.clipboard.writeText(videoUrl)
      console.log("Video URL copied to clipboard:", videoUrl)

      if (navigator.share) {
        await navigator.share({
          title: state.project.title || "My Video",
          text: "Check out this video I created!",
          url: videoUrl,
        })
      }
    } catch (error) {
      console.error("Failed to share video:", error)
      try {
        await navigator.clipboard.writeText(videoUrl)
      } catch (clipboardError) {
        console.error("Failed to copy to clipboard:", clipboardError)
      }
    } finally {
      setIsSharing(false)
    }
  }

  const handleGenerate = async () => {
    if (!state.project.id || !state.project.script) {
      const missingData = []
      if (!state.project.id) missingData.push("project ID")
      if (!state.project.script) missingData.push("script")

      console.error("❌ Missing required project data:", {
        missingData,
        projectId: state.project.id,
        hasScript: !!state.project.script,
      })
      dispatch({ type: "SET_ERROR", error: `Missing required data: ${missingData.join(", ")}` })
      return
    }

    console.log("🚀 Starting video generation process for project:", {
      projectId: state.project.id,
      title: state.project.title,
      scriptLength: state.project.script.length,
      voiceSettings: state.project.voice_settings,
      videoSettings: state.project.video_settings,
    })

    setIsGenerating(true)
    setGenerationProgress({ progress: 0, stage: "starting", message: "Starting video generation..." })
    dispatch({ type: "SET_ERROR", error: null })

    try {
      console.log("📝 Updating project status to processing...")
      await updateProject(state.project.id, { status: "processing" })
      console.log("✅ Project status updated successfully")

      console.log("🎵 Step 1: Generating audio...")
      setGenerationProgress({ progress: 10, stage: "audio", message: "Generating full audio..." })
      const fullAudioUrl = await generateFullAudio()
      setAudioUrl(fullAudioUrl)
      console.log("✅ Audio generation completed, URL created")

      console.log("🖼️ Step 2: Resolving background URL...")
      setGenerationProgress({ progress: 20, stage: "background", message: "Resolving background..." })
      const backgroundUrl = await getBackgroundUrl()
      console.log("✅ Background URL resolved:", backgroundUrl)

      console.log("🎬 Step 3: Starting client-side video processing...")
      const processor = new ClientVideoProcessor()

      const captionsEnabled = state.project.video_settings?.captions !== false
      console.log("📝 Video processing options:", {
        audioUrl: fullAudioUrl,
        backgroundUrl,
        script: state.project.script.substring(0, 100) + "...",
        format: state.project.video_settings?.format || "vertical",
        quality: state.project.video_settings?.quality || "1080p",
        captions: captionsEnabled,
        projectId: state.project.id,
      })

      const videoBlob = await processor.processVideo(
        {
          audioUrl: fullAudioUrl,
          backgroundUrl,
          script: state.project.script,
          format: state.project.video_settings?.format || "vertical",
          quality: state.project.video_settings?.quality || "1080p",
          captions: captionsEnabled,
          projectId: state.project.id,
          voiceSpeed: state.project.voice_settings?.speed || 1.0,
        },
        (progress) => {
          setGenerationProgress(progress)
        },
      )

      console.log("✅ Client-side video processing completed")
      setLocalVideoBlob(videoBlob)

      console.log("📤 Starting direct upload to Vercel Blob...")
      setGenerationProgress({ progress: 85, stage: "uploading", message: "Uploading directly to cloud storage..." })

      const filename = `${state.project.id}_${Date.now()}.mp4`

      try {
        console.log("[v0] 🚀 Starting client upload with:", {
          filename,
          blobSize: videoBlob.size,
          blobType: videoBlob.type,
          handleUploadUrl: "/api/video/upload",
          clientPayload: {
            projectId: state.project.id,
            quality: state.project.video_settings?.quality || "1080p",
            duration: 60,
          },
        })

        const blob = await upload(filename, videoBlob, {
          access: "public",
          handleUploadUrl: "/api/video/upload",
          clientPayload: JSON.stringify({
            projectId: state.project.id,
            quality: state.project.video_settings?.quality || "1080p",
            duration: 60,
          }),
        })

        console.log("[v0] ✅ Client upload completed successfully:", { url: blob.url, size: blob.size })

        console.log("[v0] 📝 Recording video metadata to database...")
        setGenerationProgress({ progress: 95, stage: "recording", message: "Saving video to gallery..." })

        const recordResponse = await fetch("/api/video/record", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: blob.url,
            size: videoBlob.size, // Use original blob size instead of upload response size
            projectId: state.project.id,
            quality: state.project.video_settings?.quality || "1080p",
            duration: 60,
          }),
        })

        if (!recordResponse.ok) {
          const errorText = await recordResponse.text()
          console.error("[v0] ❌ Failed to record video metadata:", errorText)
          throw new Error(`Failed to save video to gallery: ${errorText}`)
        }

        console.log("[v0] ✅ Video metadata recorded successfully")

        setGenerationProgress({ progress: 100, stage: "complete", message: "Video ready!" })

        setVideoUrl(blob.url)
        setIsComplete(true)

        await updateProject(state.project.id, { status: "completed" })
      } catch (uploadError) {
        console.error("[v0] ❌ Client upload failed with error:", {
          error: uploadError,
          message: uploadError instanceof Error ? uploadError.message : "Unknown error",
          stack: uploadError instanceof Error ? uploadError.stack : undefined,
          filename,
          blobSize: videoBlob.size,
        })
        throw new Error(`Direct upload failed: ${uploadError instanceof Error ? uploadError.message : "Unknown error"}`)
      }
    } catch (error) {
      console.error("❌ Video generation process failed:", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        projectId: state.project.id,
        currentStage: generationProgress.stage,
        currentProgress: generationProgress.progress,
      })

      let errorMessage = "Failed to generate video"
      if (error instanceof Error) {
        if (error.message.includes("Audio generation failed")) {
          errorMessage = `Audio Generation Error: ${error.message}`
        } else if (error.message.includes("Video processing failed")) {
          errorMessage = `Video Processing Error: ${error.message}`
        } else if (error.message.includes("Direct upload failed")) {
          errorMessage = `Upload Error: ${error.message}`
        } else if (error.message.includes("Missing required data")) {
          errorMessage = `Configuration Error: ${error.message}`
        } else {
          errorMessage = `Generation Error: ${error.message}`
        }
      }

      dispatch({ type: "SET_ERROR", error: errorMessage })
      setIsGenerating(false)

      if (state.project.id) {
        try {
          console.log("📝 Updating project status to failed...")
          await updateProject(state.project.id, { status: "failed" })
          console.log("✅ Project status updated to failed")
        } catch (updateError) {
          console.error("❌ Failed to update project status to failed:", updateError)
        }
      }
    }
  }

  const handleRetry = () => {
    setIsGenerating(false)
    setIsComplete(false)
    setVideoUrl(null)
    setAudioUrl(null)
    setLocalVideoBlob(null)
    setGenerationProgress({ progress: 0, stage: "waiting", message: "Ready to generate" })
    dispatch({ type: "SET_ERROR", error: null })
  }

  const handleFinish = () => {
    router.push("/dashboard")
  }

  return (
    <Card className="bg-white/10 backdrop-blur-sm border-white/20">
      <CardHeader>
        <CardTitle className="text-2xl text-white">Generate Video</CardTitle>
        <CardDescription className="text-gray-300">Review your settings and generate your video.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {state.error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded">
            {state.error}
            <Button onClick={handleRetry} size="sm" className="ml-4 bg-red-600 hover:bg-red-700">
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          </div>
        )}

        <div className="bg-white/5 rounded-lg p-4 space-y-3">
          <h3 className="text-lg font-semibold text-white">Project Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Title:</span>
              <span className="text-white ml-2">{state.project.title}</span>
            </div>
            <div>
              <span className="text-gray-400">Voice:</span>
              <span className="text-white ml-2">{state.project.voice_settings?.voice || "alloy"}</span>
            </div>
            <div>
              <span className="text-gray-400">Format:</span>
              <span className="text-white ml-2">{state.project.video_settings?.format || "vertical"}</span>
            </div>
            <div>
              <span className="text-gray-400">Quality:</span>
              <span className="text-white ml-2">{state.project.video_settings?.quality || "1080p"}</span>
            </div>
            <div>
              <span className="text-gray-400">Captions:</span>
              <span className="text-white ml-2">
                {state.project.video_settings?.captions !== false ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Background:</span>
              <span className="text-white ml-2">
                {state.project.video_settings?.background?.startsWith("generated-") ? "Custom AI" : "Preset"}
              </span>
            </div>
          </div>
        </div>

        {isGenerating && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-white">{generationProgress.message}</span>
              <span className="text-purple-400">{Math.round(generationProgress.progress)}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-pink-500 to-purple-600 h-3 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                style={{ width: `${Math.round(generationProgress.progress)}%` }}
              >
                {generationProgress.progress > 10 && <div className="w-2 h-2 bg-white rounded-full animate-pulse" />}
              </div>
            </div>
            <div className="text-sm text-gray-400">
              {generationProgress.stage === "starting" && "Step 1 of 7: Initializing video processor..."}
              {generationProgress.stage === "audio" && "Step 2 of 7: Generating audio track..."}
              {generationProgress.stage === "initializing" && "Step 3 of 7: Loading video processing tools..."}
              {generationProgress.stage === "preparing" && "Step 4 of 7: Downloading and preparing assets..."}
              {generationProgress.stage === "captions" && "Step 5 of 7: Creating captions with font..."}
              {generationProgress.stage === "processing" && "Step 6 of 7: Rendering final video..."}
              {generationProgress.stage === "uploading" && "Step 7 of 7: Uploading to cloud storage..."}
              {generationProgress.stage === "recording" && "Final Step: Saving to your gallery..."}
              {![
                "starting",
                "audio",
                "initializing",
                "preparing",
                "captions",
                "processing",
                "uploading",
                "recording",
              ].includes(generationProgress.stage) &&
                `Stage: ${generationProgress.stage} • Processing video in your browser using WebAssembly.`}
            </div>
          </div>
        )}

        {isComplete && (videoUrl || localVideoBlob) && (
          <div className="bg-white/5 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Your Video is Ready! 🎉</h3>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-shrink-0">
                <div className="aspect-[9/16] w-48 mx-auto bg-black rounded-lg overflow-hidden border border-white/20">
                  {videoUrl ? (
                    <video
                      src={videoUrl}
                      controls
                      className="w-full h-full object-cover"
                      poster={
                        state.project.video_settings?.background?.startsWith("saved-")
                          ? undefined
                          : state.project.video_settings?.background
                      }
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : localVideoBlob ? (
                    <video
                      src={URL.createObjectURL(localVideoBlob)}
                      controls
                      className="w-full h-full object-cover"
                      poster={
                        state.project.video_settings?.background?.startsWith("saved-")
                          ? undefined
                          : state.project.video_settings?.background
                      }
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <Play className="w-12 h-12 text-white mx-auto mb-2" />
                        <p className="text-white text-sm">Video Preview</p>
                        <p className="text-gray-400 text-xs mt-1">
                          {state.project.video_settings?.format || "vertical"} •{" "}
                          {state.project.video_settings?.quality || "1080p"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleDownload}
                    className="bg-green-600 hover:bg-green-700"
                    disabled={!videoUrl && !localVideoBlob}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    onClick={handleShare}
                    disabled={!videoUrl || isSharing}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10 bg-transparent"
                  >
                    <Share className="w-4 h-4 mr-2" />
                    {isSharing ? "Sharing..." : "Share"}
                  </Button>
                </div>
                <div className="text-sm text-gray-300">
                  <p>✅ Video generated successfully</p>
                  <p>✅ Audio synchronized</p>
                  {state.project.video_settings?.captions !== false && <p>✅ Captions added</p>}
                  <p>✅ Ready for download and sharing</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "SET_STEP", step: 4 })}
            className="border-white/20 text-white hover:bg-white/10"
            disabled={isGenerating}
          >
            Back
          </Button>
          {!isComplete && (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Video...
                </>
              ) : (
                "Generate Video"
              )}
            </Button>
          )}
          {isComplete && (
            <Button
              onClick={handleFinish}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Finish
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
