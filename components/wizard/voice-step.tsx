"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { useWizard } from "./wizard-provider"
import { updateProject } from "@/lib/supabase/actions"
import { Loader2, Play, Pause, Volume2 } from "lucide-react"

const voices = [
  { id: "alloy", name: "Alloy", description: "Neutral, balanced voice" },
  { id: "echo", name: "Echo", description: "Clear, professional voice" },
  { id: "fable", name: "Fable", description: "Warm, storytelling voice" },
  { id: "onyx", name: "Onyx", description: "Deep, authoritative voice" },
  { id: "nova", name: "Nova", description: "Energetic, youthful voice" },
  { id: "shimmer", name: "Shimmer", description: "Bright, engaging voice" },
]

export function VoiceStep() {
  const { state, dispatch } = useWizard()
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const voiceSettings = state.project.voice_settings || {
    voice: "alloy",
    speed: 1.0,
  }

  useEffect(() => {
    if (!state.project.voice_settings) {
      const defaultSettings = {
        voice: "alloy",
        speed: 1.0,
      }
      dispatch({ type: "UPDATE_PROJECT", updates: { voice_settings: defaultSettings } })
    }
  }, [state.project.voice_settings, dispatch])

  const handleVoiceChange = async (voice: string) => {
    const newSettings = { ...voiceSettings, voice }

    dispatch({ type: "UPDATE_PROJECT", updates: { voice_settings: newSettings } })

    if (state.project.id) {
      try {
        await updateProject(state.project.id, { voice_settings: newSettings })
        console.log("Voice settings saved successfully:", newSettings)
      } catch (error) {
        console.error("Failed to save voice settings:", error)
        dispatch({ type: "SET_ERROR", error: "Failed to save voice settings" })
      }
    }

    // Clear previous audio when voice changes
    setAudioUrl(null)
  }

  const handleSpeedChange = async (speed: number[]) => {
    const newSettings = { ...voiceSettings, speed: speed[0] }

    dispatch({ type: "UPDATE_PROJECT", updates: { voice_settings: newSettings } })

    if (state.project.id) {
      try {
        await updateProject(state.project.id, { voice_settings: newSettings })
        console.log("Speed settings saved successfully:", newSettings)
      } catch (error) {
        console.error("Failed to save speed settings:", error)
        dispatch({ type: "SET_ERROR", error: "Failed to save speed settings" })
      }
    }

    // Clear previous audio when speed changes
    setAudioUrl(null)
  }

  const handleGeneratePreview = async () => {
    if (!voiceSettings.voice || voiceSettings.voice === "") {
      dispatch({ type: "SET_ERROR", error: "Please select a voice first" })
      return
    }

    if (!state.project.script?.trim()) {
      dispatch({ type: "SET_ERROR", error: "Please add a script first" })
      return
    }

    setIsGenerating(true)
    dispatch({ type: "SET_ERROR", error: null })

    try {
      // Generate a preview with first 200 characters of script
      const previewText = state.project.script.substring(0, 200) + "..."

      const response = await fetch("/api/generate-speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: previewText,
          voice: voiceSettings.voice,
          speed: voiceSettings.speed,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate speech")
      }

      const audioBlob = await response.blob()
      const url = URL.createObjectURL(audioBlob)
      setAudioUrl(url)
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: "Failed to generate voice preview. Please try again." })
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePlayPause = () => {
    if (!audioRef.current || !audioUrl) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleNext = async () => {
    setIsSaving(true)
    try {
      if (state.project.id) {
        await updateProject(state.project.id, { voice_settings: voiceSettings })
      }
      dispatch({ type: "SET_STEP", step: 3 })
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: "Failed to save voice settings" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="bg-white/10 backdrop-blur-sm border-white/20">
      <CardHeader>
        <CardTitle className="text-2xl text-white">Voice Settings</CardTitle>
        <CardDescription className="text-gray-300">
          Choose the voice and settings for your video narration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {state.error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded">{state.error}</div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">Voice Selection</label>
          <Select value={voiceSettings.voice} onValueChange={handleVoiceChange}>
            <SelectTrigger className="bg-white/5 border-white/20 text-white">
              <SelectValue>
                {voiceSettings.voice
                  ? voices.find((v) => v.id === voiceSettings.voice)?.name || voiceSettings.voice
                  : "Select a voice"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id} className="text-white">
                  <div>
                    <div className="font-medium">{voice.name}</div>
                    <div className="text-sm text-gray-400">{voice.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Speed: {voiceSettings.speed?.toFixed(1) || "1.0"}x
            </label>
            <Slider
              value={[voiceSettings.speed || 1.0]}
              onValueChange={handleSpeedChange}
              min={0.5}
              max={2.0}
              step={0.1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>0.5x (Slower)</span>
              <span>2.0x (Faster)</span>
            </div>
          </div>
        </div>

        {/* Voice Preview */}
        <div className="bg-white/5 rounded-lg p-4 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center">
            <Volume2 className="w-5 h-5 mr-2" />
            Voice Preview
          </h3>

          <div className="flex gap-4">
            <Button
              onClick={handleGeneratePreview}
              disabled={isGenerating || !state.project.script || !voiceSettings.voice}
              variant="outline"
              className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10 bg-transparent"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Preview"
              )}
            </Button>

            {audioUrl && (
              <Button
                onClick={handlePlayPause}
                variant="outline"
                className="border-green-500/50 text-green-400 hover:bg-green-500/10 bg-transparent"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Play Preview
                  </>
                )}
              </Button>
            )}
          </div>

          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              onLoadStart={() => setIsPlaying(false)}
              className="hidden"
            />
          )}

          <p className="text-xs text-gray-400">
            Preview uses the first 200 characters of your script. The full audio will be generated during video
            creation.
          </p>
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "SET_STEP", step: 1 })}
            className="border-white/20 text-white hover:bg-white/10"
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={isSaving}
            className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Continue to Background"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
