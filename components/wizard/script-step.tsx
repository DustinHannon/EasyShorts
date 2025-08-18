"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useWizard } from "./wizard-provider"
import { updateProject } from "@/lib/supabase/actions"
import { Loader2, Wand2, Settings } from "lucide-react"
import { useRouter } from "next/navigation"

export function ScriptStep() {
  const { state, dispatch } = useWizard()
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Script generation settings with safe defaults
  const [topic, setTopic] = useState("")
  const [style, setStyle] = useState("engaging")
  const [duration, setDuration] = useState("60")
  const [audience, setAudience] = useState("general")

  // Safe value getters to prevent undefined values
  const safeStyle = String(style || "engaging")
  const safeDuration = String(duration || "60")
  const safeAudience = String(audience || "general")

  const handleGenerateScript = async () => {
    const safeTopic = String(topic || "").trim()
    if (!safeTopic) {
      dispatch({ type: "SET_ERROR", error: "Please enter a topic for script generation" })
      return
    }

    setIsGenerating(true)
    dispatch({ type: "SET_ERROR", error: null })

    try {
      const requestBody = {
        topic: safeTopic,
        style: safeStyle,
        duration: safeDuration,
        audience: safeAudience,
      }

      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error("Failed to generate script")
      }

      const { script } = await response.json()
      dispatch({ type: "UPDATE_PROJECT", updates: { script } })
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: "Failed to generate script. Please try again." })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleNext = async () => {
    if (!state.project.script?.trim()) {
      dispatch({ type: "SET_ERROR", error: "Please add a script before continuing" })
      return
    }

    setIsSaving(true)
    try {
      if (state.project.id) {
        await updateProject(state.project.id, { script: state.project.script })
      }
      dispatch({ type: "SET_STEP", step: 2 })
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: "Failed to save script" })
    } finally {
      setIsSaving(false)
    }
  }

  // Safe change handlers for select components
  const handleStyleChange = (value: string) => {
    setStyle(String(value || "engaging"))
  }

  const handleDurationChange = (value: string) => {
    setDuration(String(value || "60"))
  }

  const handleAudienceChange = (value: string) => {
    setAudience(String(value || "general"))
  }

  const handleBack = () => {
    router.push("/dashboard")
  }

  return (
    <Card className="bg-white/10 backdrop-blur-sm border-white/20">
      <CardHeader>
        <CardTitle className="text-2xl text-white">Script Generation</CardTitle>
        <CardDescription className="text-gray-300">
          Create or generate an engaging script for your video. This will be converted to speech later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {state.error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded">{state.error}</div>
        )}

        {/* AI Script Generation */}
        <div className="bg-white/5 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">AI Script Generator</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-gray-400 hover:text-white"
            >
              <Settings className="w-4 h-4 mr-2" />
              {showAdvanced ? "Hide" : "Show"} Options
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="topic" className="block text-sm font-medium text-gray-300">
                Video Topic *
              </label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., 5 amazing facts about space, How to make perfect coffee, etc."
                className="bg-white/5 border-white/20 text-white placeholder:text-gray-500"
              />
            </div>

            {showAdvanced && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Style</label>
                  <Select value={safeStyle} onValueChange={handleStyleChange}>
                    <SelectTrigger className="bg-white/5 border-white/20 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="engaging" className="text-white">
                        Engaging & Fun
                      </SelectItem>
                      <SelectItem value="educational" className="text-white">
                        Educational
                      </SelectItem>
                      <SelectItem value="dramatic" className="text-white">
                        Dramatic
                      </SelectItem>
                      <SelectItem value="casual" className="text-white">
                        Casual & Friendly
                      </SelectItem>
                      <SelectItem value="professional" className="text-white">
                        Professional
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Duration</label>
                  <Select value={safeDuration} onValueChange={handleDurationChange}>
                    <SelectTrigger className="bg-white/5 border-white/20 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="15" className="text-white">
                        15 seconds
                      </SelectItem>
                      <SelectItem value="30" className="text-white">
                        30 seconds
                      </SelectItem>
                      <SelectItem value="60" className="text-white">
                        60 seconds
                      </SelectItem>
                      <SelectItem value="90" className="text-white">
                        90 seconds
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">Audience</label>
                  <Select value={safeAudience} onValueChange={handleAudienceChange}>
                    <SelectTrigger className="bg-white/5 border-white/20 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="general" className="text-white">
                        General Audience
                      </SelectItem>
                      <SelectItem value="tiktok" className="text-white">
                        TikTok/Gen Z
                      </SelectItem>
                      <SelectItem value="professional" className="text-white">
                        Professional
                      </SelectItem>
                      <SelectItem value="educational" className="text-white">
                        Students/Learners
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <Button
              onClick={handleGenerateScript}
              disabled={isGenerating || !topic.trim()}
              className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Script...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Script
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Script Editor */}
        <div className="space-y-2">
          <label htmlFor="script" className="block text-sm font-medium text-gray-300">
            Video Script
          </label>
          <Textarea
            id="script"
            value={state.project.script || ""}
            onChange={(e) => dispatch({ type: "UPDATE_PROJECT", updates: { script: e.target.value } })}
            placeholder="Write your script here or use the AI generator above..."
            className="bg-white/5 border-white/20 text-white placeholder:text-gray-500 min-h-[300px]"
          />
          <p className="text-xs text-gray-400">
            Tip: Keep your script engaging and under 60 seconds for best results on social media.
          </p>
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            className="border-white/20 text-white hover:bg-white/10 bg-transparent"
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={isSaving || !state.project.script?.trim()}
            className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Continue to Voice"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
