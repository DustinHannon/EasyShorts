"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useWizard } from "./wizard-provider"
import { updateProject } from "@/lib/supabase/actions"
import { Loader2 } from "lucide-react"

export function SettingsStep() {
  const { state, dispatch } = useWizard()
  const [isSaving, setIsSaving] = useState(false)

  const defaultSettings = {
    format: "vertical",
    quality: "720p",
    duration: "auto",
    captions: true,
    background: "default",
  }

  const videoSettings = { ...defaultSettings, ...state.project.video_settings }

  useEffect(() => {
    if (!state.project.video_settings || Object.keys(state.project.video_settings).length === 0) {
      dispatch({ type: "UPDATE_PROJECT", updates: { video_settings: defaultSettings } })
    }
  }, [])

  const handleSettingChange = (key: string, value: any) => {
    const newSettings = { ...videoSettings, [key]: value }
    dispatch({ type: "UPDATE_PROJECT", updates: { video_settings: newSettings } })
  }

  const handleNext = async () => {
    setIsSaving(true)
    try {
      if (state.project.id) {
        await updateProject(state.project.id, { video_settings: videoSettings })
      }
      dispatch({ type: "SET_STEP", step: 5 })
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: "Failed to save video settings" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="bg-white/10 backdrop-blur-sm border-white/20">
      <CardHeader>
        <CardTitle className="text-2xl text-white">Video Settings</CardTitle>
        <CardDescription className="text-gray-300">Configure the final video output settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {state.error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded">{state.error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Video Format</label>
            <Select value={videoSettings.format} onValueChange={(value) => handleSettingChange("format", value)}>
              <SelectTrigger className="bg-white/5 border-white/20 text-white">
                <SelectValue placeholder="Vertical (9:16) - TikTok/Shorts" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="vertical" className="text-white">
                  Vertical (9:16) - TikTok/Shorts
                </SelectItem>
                <SelectItem value="square" className="text-white">
                  Square (1:1) - Instagram
                </SelectItem>
                <SelectItem value="horizontal" className="text-white">
                  Horizontal (16:9) - YouTube
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Quality</label>
            <Select value={videoSettings.quality} onValueChange={(value) => handleSettingChange("quality", value)}>
              <SelectTrigger className="bg-white/5 border-white/20 text-white">
                <SelectValue placeholder="720p HD" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="720p" className="text-white">
                  720p HD
                </SelectItem>
                <SelectItem value="1080p" className="text-white">
                  1080p Full HD
                </SelectItem>
                <SelectItem value="4k" className="text-white">
                  4K Ultra HD
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Duration</label>
            <Select value={videoSettings.duration} onValueChange={(value) => handleSettingChange("duration", value)}>
              <SelectTrigger className="bg-white/5 border-white/20 text-white">
                <SelectValue placeholder="Auto (Based on script)" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="auto" className="text-white">
                  Auto (Based on script)
                </SelectItem>
                <SelectItem value="15" className="text-white">
                  15 seconds
                </SelectItem>
                <SelectItem value="30" className="text-white">
                  30 seconds
                </SelectItem>
                <SelectItem value="60" className="text-white">
                  60 seconds
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">Auto Captions</label>
              <Switch
                checked={videoSettings.captions}
                onCheckedChange={(checked) => handleSettingChange("captions", checked)}
              />
            </div>
            <p className="text-xs text-gray-400">Automatically generate captions from your script</p>
          </div>
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "SET_STEP", step: 3 })}
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
              "Continue to Generate"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
