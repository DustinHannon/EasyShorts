"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useWizard } from "./wizard-provider"
import { updateProject } from "@/lib/supabase/actions"
import { Loader2, Play, Download, Share, RefreshCw, CheckCircle } from "lucide-react"
import { ClientVideoProcessor, type ProcessingProgress } from "@/lib/client-video-processor"
import { createClient } from "@/lib/supabase/client"
import { backgroundKindOf, resolveBackgroundUrl, type BackgroundKind } from "@/lib/backgrounds"
import type { WordTiming } from "@/lib/captions"
import { upload } from "@vercel/blob/client" // Import client upload function
import { useRouter } from "next/navigation"

// How each background kind is described on the review screen.
const BACKGROUND_KIND_LABELS: Record<BackgroundKind, string> = {
  saved: "Uploaded",
  generated: "Custom AI",
  preset: "Preset",
}

// A stuck/undecodable audio element must never hold up a render.
const AUDIO_MEASURE_TIMEOUT_MS = 10000
// Last-resort clip length when neither transcription nor the browser can
// measure the voiceover.
const FALLBACK_DURATION_SECONDS = 60

// Measure the generated voiceover directly in the browser. This is the fallback
// source of truth for how long the video actually is: the encode loops a still
// image (`-loop 1`) and ends on `-shortest`, so the audio decides the length.
// HTMLAudioElement.duration can be NaN or Infinity, so every path is guarded and
// a stalled element resolves null on a timer instead of hanging generation.
const measureAudioDuration = (blob: Blob): Promise<number | null> =>
  new Promise((resolve) => {
    let url: string | null = null
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = (v: number | null) => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      if (url) URL.revokeObjectURL(url)
      resolve(v)
    }
    // Resolves, never rejects: createObjectURL/new Audio run synchronously in
    // this executor, so an unguarded throw here would reject and fail the whole
    // render over a duration probe.
    try {
      url = URL.createObjectURL(blob)
      const audio = new Audio()
      timer = setTimeout(() => done(null), AUDIO_MEASURE_TIMEOUT_MS)
      audio.addEventListener("loadedmetadata", () => {
        const d = audio.duration
        done(Number.isFinite(d) && d > 0 ? d : null)
      })
      audio.addEventListener("error", () => done(null))
      audio.preload = "metadata"
      audio.src = url
    } catch (error) {
      console.warn("Could not measure the voiceover length; using the fallback duration", error)
      done(null)
    }
  })

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
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  // Guards handleGenerate against re-entry within a single render tick, before
  // the isGenerating state update has disabled the button.
  const generationLock = useRef(false)

  const backgroundKind = backgroundKindOf(state.project.video_settings?.background)

  // Create a single object URL for the local video blob and revoke it on cleanup
  // (previously a new blob URL was created on every render inside JSX, leaking memory).
  useEffect(() => {
    if (!localVideoBlob) {
      setLocalVideoUrl(null)
      return
    }
    const url = URL.createObjectURL(localVideoBlob)
    setLocalVideoUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [localVideoBlob])

  const generateFullAudio = async (): Promise<Blob> => {
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

      if (!response.ok) {
        const errorText = await response.text()
        console.error("Audio generation failed:", response.status, response.statusText)
        throw new Error(`Audio generation failed (${response.status}): ${errorText || response.statusText}`)
      }

      return await response.blob()
    } catch (error) {
      console.error("Audio generation error:", error)
      throw new Error(`Failed to generate audio: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  // Transcribe the voiceover for real word-level caption timing, and pick up the
  // audio duration the same response reports. Graceful: returns undefined on any
  // failure (no key, error, timeout) so the processor falls back to estimated
  // timing and video generation is never blocked.
  const fetchWordTimings = async (
    audioBlob: Blob,
  ): Promise<{ words?: WordTiming[]; duration?: number } | undefined> => {
    try {
      const fd = new FormData()
      fd.append("file", audioBlob, "audio.mp3")
      const res = await fetch("/api/transcribe", { method: "POST", body: fd })
      if (!res.ok) return undefined
      const data = await res.json()
      const words =
        Array.isArray(data?.words) && data.words.length > 0 ? (data.words as WordTiming[]) : undefined
      const rawDuration: unknown = data?.duration
      const duration =
        typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration > 0
          ? rawDuration
          : undefined
      if (!words && duration === undefined) return undefined
      return { words, duration }
    } catch (error) {
      console.warn("Caption sync unavailable; using estimated timing", error)
      return undefined
    }
  }

  const getBackgroundUrl = async (): Promise<string> => {
    const supabase = createClient()
    return resolveBackgroundUrl(state.project.video_settings, async (id) => {
      const { data } = await supabase.from("backgrounds").select("url").eq("id", id).single()
      return data?.url ?? null
    })
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

    // Synchronous re-entry guard. setIsGenerating is async, so a fast double
    // click can enter twice before the button disables; without this the second
    // call reaches processVideo's module-level mutex and is rejected down the
    // failure path below, which would mark the project failed while the FIRST
    // run is still encoding.
    if (generationLock.current) return
    generationLock.current = true

    setIsGenerating(true)
    setGenerationProgress({ progress: 0, stage: "starting", message: "Starting video generation..." })
    dispatch({ type: "SET_ERROR", error: null })

    try {
      await updateProject(state.project.id, { status: "processing" })

      setGenerationProgress({ progress: 10, stage: "audio", message: "Generating full audio..." })
      const audioBlob = await generateFullAudio()
      const fullAudioUrl = URL.createObjectURL(audioBlob)
      setAudioUrl(fullAudioUrl)

      const captionsEnabled = state.project.video_settings?.captions !== false

      // Real audio-synced captions from word timestamps (graceful fallback inside).
      let wordTimings: WordTiming[] | undefined
      let transcribedDuration: number | undefined
      if (captionsEnabled) {
        setGenerationProgress({ progress: 18, stage: "captions", message: "Syncing captions to the audio..." })
        const transcription = await fetchWordTimings(audioBlob)
        wordTimings = transcription?.words
        transcribedDuration = transcription?.duration
      }

      // The real clip length. The renderer never enforces the `duration` video
      // setting (nothing trims or pads, and the setting defaults to the string
      // "auto"), so the voiceover is the video's length. Prefer the length
      // transcription measured, else measure the audio blob in the browser.
      // Used for the Ken Burns motion rate AND for the stored gallery duration.
      if (transcribedDuration === undefined) {
        // Own progress stage: measuring can take a moment (and is bounded at
        // AUDIO_MEASURE_TIMEOUT_MS), so the bar must not sit on a stale message.
        setGenerationProgress({ progress: 20, stage: "measuring", message: "Checking the voiceover length..." })
      }
      const measured = transcribedDuration ?? (await measureAudioDuration(audioBlob)) ?? undefined
      const durationSeconds =
        typeof measured === "number" && Number.isFinite(measured) && measured > 0 ? measured : undefined
      const duration = durationSeconds ? Math.max(1, Math.round(durationSeconds)) : FALLBACK_DURATION_SECONDS

      setGenerationProgress({ progress: 25, stage: "background", message: "Resolving background..." })
      const backgroundUrl = await getBackgroundUrl()

      const processor = new ClientVideoProcessor()

      const videoBlob = await processor.processVideo(
        {
          audioUrl: fullAudioUrl,
          backgroundUrl,
          script: state.project.script,
          format: state.project.video_settings?.format || "vertical",
          quality: state.project.video_settings?.quality || "720p",
          captions: captionsEnabled,
          projectId: state.project.id,
          voiceSpeed: state.project.voice_settings?.speed || 1.0,
          wordTimings,
          animation: state.project.video_settings?.animation,
          durationSeconds,
        },
        (progress) => {
          setGenerationProgress(progress)
        },
      )

      // The audio blob URL is fully consumed by the processor; release it.
      URL.revokeObjectURL(fullAudioUrl)

      setLocalVideoBlob(videoBlob)

      setGenerationProgress({ progress: 85, stage: "uploading", message: "Uploading directly to cloud storage..." })

      const quality = state.project.video_settings?.quality || "720p"

      // Upload under the per-user prefix the /api/video/upload route enforces.
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error("Direct upload failed: not authenticated")
      }
      const filename = `users/${user.id}/videos/${state.project.id}_${Date.now()}.mp4`

      try {
        const blob = await upload(filename, videoBlob, {
          access: "public",
          handleUploadUrl: "/api/video/upload",
          clientPayload: JSON.stringify({
            projectId: state.project.id,
            quality,
            duration,
          }),
        })

        setGenerationProgress({ progress: 95, stage: "recording", message: "Saving video to gallery..." })

        const recordResponse = await fetch("/api/video/record", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: blob.url,
            size: videoBlob.size, // Use original blob size instead of upload response size
            projectId: state.project.id,
            quality,
            duration,
          }),
        })

        if (!recordResponse.ok) {
          console.error("Failed to record video metadata:", recordResponse.status)
          throw new Error("Failed to save video to gallery")
        }

        setGenerationProgress({ progress: 100, stage: "complete", message: "Video ready!" })

        setVideoUrl(blob.url)
        setIsComplete(true)

        await updateProject(state.project.id, { status: "completed" })
      } catch (uploadError) {
        console.error("Client upload failed:", uploadError)
        throw new Error(`Direct upload failed: ${uploadError instanceof Error ? uploadError.message : "Unknown error"}`)
      }
    } catch (error) {
      console.error("Video generation process failed:", error)

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

      // A re-entry rejection means ANOTHER generation is still running for this
      // project. Surface the message, but never write "failed" — that would
      // mislabel a run that is still encoding successfully.
      const isBusyRejection = error instanceof Error && error.message.includes("already being generated")

      if (state.project.id && !isBusyRejection) {
        try {
          await updateProject(state.project.id, { status: "failed" })
        } catch (updateError) {
          console.error("Failed to update project status to failed:", updateError)
        }
      }
    } finally {
      generationLock.current = false
      setIsGenerating(false)
    }
  }

  const handleRetry = () => {
    setIsGenerating(false)
    setIsComplete(false)
    setVideoUrl(null)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
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

        {!isGenerating && !isComplete && (
          <div className="bg-white/5 rounded-lg p-4 space-y-2">
            <label htmlFor="final-script" className="block text-sm font-medium text-gray-300">
              Review &amp; edit script
            </label>
            <Textarea
              id="final-script"
              value={state.project.script || ""}
              onChange={(e) => dispatch({ type: "UPDATE_PROJECT", updates: { script: e.target.value } })}
              className="bg-white/5 border-white/20 text-white min-h-[140px]"
            />
            <p className="text-xs text-gray-400">
              Edit the narration here before generating — your changes apply to this render.
            </p>
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
              <span className="text-white ml-2">{state.project.video_settings?.quality || "720p"}</span>
            </div>
            <div>
              <span className="text-gray-400">Captions:</span>
              <span className="text-white ml-2">
                {state.project.video_settings?.captions !== false ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Background:</span>
              <span className="text-white ml-2">{BACKGROUND_KIND_LABELS[backgroundKind]}</span>
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
              {generationProgress.stage === "measuring" && "Checking how long the voiceover runs..."}
              {generationProgress.stage === "processing" && "Step 6 of 7: Rendering final video..."}
              {generationProgress.stage === "uploading" && "Step 7 of 7: Uploading to cloud storage..."}
              {generationProgress.stage === "recording" && "Final Step: Saving to your gallery..."}
              {![
                "starting",
                "audio",
                "initializing",
                "preparing",
                "captions",
                "measuring",
                "processing",
                "uploading",
                "recording",
              ].includes(generationProgress.stage) &&
                `Stage: ${generationProgress.stage} • Processing video in your browser using WebAssembly.`}
            </div>
          </div>
        )}

        {isComplete && (videoUrl || localVideoUrl) && (
          <div className="bg-white/5 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Your Video is Ready! 🎉</h3>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-shrink-0">
                <div className="aspect-[9/16] w-48 mx-auto bg-black rounded-lg overflow-hidden border border-white/20">
                  {videoUrl ? (
                    <video src={videoUrl} controls className="w-full h-full object-cover">
                      Your browser does not support the video tag.
                    </video>
                  ) : localVideoUrl ? (
                    <video src={localVideoUrl} controls className="w-full h-full object-cover">
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <Play className="w-12 h-12 text-white mx-auto mb-2" />
                        <p className="text-white text-sm">Video Preview</p>
                        <p className="text-gray-400 text-xs mt-1">
                          {state.project.video_settings?.format || "vertical"} •{" "}
                          {state.project.video_settings?.quality || "720p"}
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
