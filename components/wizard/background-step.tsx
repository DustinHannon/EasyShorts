"use client"

import type React from "react"
import { upload } from "@vercel/blob/client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useWizard } from "./wizard-provider"
import { updateProject } from "@/lib/supabase/actions"
import { createClient } from "@/lib/supabase/client"
import { Loader2, Upload, Wand2, Trash2, Bookmark } from "lucide-react"

interface SavedBackground {
  id: string
  name: string
  url: string
  type: string
  created_at: string
}

export function BackgroundStep() {
  const { state, dispatch } = useWizard()
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingSaved, setIsLoadingSaved] = useState(true)
  const [selectedBackground, setSelectedBackground] = useState(state.project.video_settings?.background || "default")
  const [customPrompt, setCustomPrompt] = useState("")
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
  const [savedBackgrounds, setSavedBackgrounds] = useState<SavedBackground[]>([])
  const [saveToGallery, setSaveToGallery] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const backgrounds = [
    { id: "default", name: "Abstract Gradient", preview: "/abstract-background.png" },
    { id: "nature", name: "Mountain Lake", preview: "/serene-mountain-lake.png" },
    { id: "city", name: "City Skyline", preview: "/vibrant-city-skyline.png" },
    { id: "space", name: "Space Stars", preview: "/space-stars.png" },
  ]

  useEffect(() => {
    const loadSavedBackgrounds = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const { data, error } = await supabase
            .from("backgrounds")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(12) // Limit to recent backgrounds

          if (!error && data) {
            setSavedBackgrounds(data)
          }
        }
      } catch (error) {
        console.error("Error loading saved backgrounds:", error)
      } finally {
        setIsLoadingSaved(false)
      }
    }

    loadSavedBackgrounds()

    if (state.project.video_settings?.customBackgrounds) {
      setGeneratedImages(state.project.video_settings.customBackgrounds)
    }
  }, [state.project.video_settings])

  const handleGenerateBackground = async () => {
    if (!customPrompt.trim()) {
      dispatch({ type: "SET_ERROR", error: "Please enter a description for the background" })
      return
    }

    setIsGenerating(true)
    dispatch({ type: "SET_ERROR", error: null })

    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: customPrompt,
          style: "digital art",
          size: "1024x1792", // Vertical format for social media
          saveToGallery, // Pass save option to API
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate image")
      }

      const { imageUrl, saved } = await response.json()
      setGeneratedImages((prev) => [...prev, imageUrl])
      setSelectedBackground(`generated-${generatedImages.length}`)

      if (saved && saveToGallery) {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const { data } = await supabase
            .from("backgrounds")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(12)

          if (data) {
            setSavedBackgrounds(data)
          }
        }
      }
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: "Failed to generate background. Please try again." })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Only allow image files
    if (!file.type.startsWith("image/")) {
      dispatch({ type: "SET_ERROR", error: "Please select an image file (JPG, PNG, WebP, etc.)" })
      return
    }

    setIsUploading(true)
    dispatch({ type: "SET_ERROR", error: null })

    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/background/upload",
      })

      // Add to saved backgrounds and select it
      const newBackground: SavedBackground = {
        id: crypto.randomUUID(), // Temporary ID until we refresh
        name: file.name,
        url: blob.url,
        type: file.type,
        created_at: new Date().toISOString(),
      }

      setSavedBackgrounds((prev) => [newBackground, ...prev])
      setSelectedBackground(`saved-${newBackground.id}`)

      // Refresh saved backgrounds from database to get correct ID
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from("backgrounds")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(12)

        if (data) {
          setSavedBackgrounds(data)
        }
      }
    } catch (error) {
      console.error("Upload error:", error)
      dispatch({ type: "SET_ERROR", error: "Failed to upload background. Please try again." })
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleNext = async () => {
    setIsSaving(true)
    try {
      if (state.project.id) {
        const videoSettings = {
          ...state.project.video_settings,
          background: selectedBackground,
          customBackgrounds: generatedImages,
        }
        await updateProject(state.project.id, { video_settings: videoSettings })
        dispatch({ type: "UPDATE_PROJECT", updates: { video_settings: videoSettings } })
      }
      dispatch({ type: "SET_STEP", step: 4 })
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: "Failed to save background settings" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="bg-white/10 backdrop-blur-sm border-white/20">
      <CardHeader>
        <CardTitle className="text-2xl text-white">Background Selection</CardTitle>
        <CardDescription className="text-gray-300">
          Choose a background for your video or generate a custom one with AI.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {state.error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded">{state.error}</div>
        )}

        {/* AI Background Generator */}
        <div className="bg-white/5 rounded-lg p-4 space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center">
            <Wand2 className="w-5 h-5 mr-2" />
            AI Background Generator
          </h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-300">
                Describe your ideal background
              </label>
              <Input
                id="prompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="e.g., futuristic cityscape at sunset, peaceful forest with sunlight, abstract geometric patterns..."
                className="bg-white/5 border-white/20 text-white placeholder:text-gray-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="save-to-gallery"
                checked={saveToGallery}
                onCheckedChange={(checked) => setSaveToGallery(checked as boolean)}
                className="border-white/20 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
              />
              <label htmlFor="save-to-gallery" className="text-sm text-gray-300 cursor-pointer">
                Save to gallery for future use
              </label>
            </div>

            <Button
              onClick={handleGenerateBackground}
              disabled={isGenerating || !customPrompt.trim()}
              className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Background...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Background
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Upload Custom Background */}
        <div className="border-t border-white/20 pt-6">
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            <Button
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 bg-transparent"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? "Uploading..." : "Upload Custom Background"}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Upload your own image background (JPG, PNG, WebP)</p>
        </div>

        {/* Preset Backgrounds */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Preset Backgrounds</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {backgrounds.map((bg) => (
              <div
                key={bg.id}
                className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
                  selectedBackground === bg.id ? "border-purple-500" : "border-white/20 hover:border-white/40"
                }`}
                onClick={() => setSelectedBackground(bg.id)}
              >
                <img src={bg.preview || "/placeholder.svg"} alt={bg.name} className="w-full h-32 object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-white text-sm font-medium">{bg.name}</span>
                </div>
                {selectedBackground === bg.id && (
                  <div className="absolute top-2 right-2">
                    <div className="w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {!isLoadingSaved && savedBackgrounds.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Bookmark className="w-5 h-5 mr-2" />
              Your Saved Backgrounds
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {savedBackgrounds.map((bg) => (
                <div
                  key={bg.id}
                  className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedBackground === `saved-${bg.id}`
                      ? "border-purple-500"
                      : "border-white/20 hover:border-white/40"
                  }`}
                  onClick={() => setSelectedBackground(`saved-${bg.id}`)}
                >
                  <img
                    src={bg.url || "/placeholder.svg"}
                    alt={bg.name}
                    className="w-full h-32 object-contain bg-black/20"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-white text-xs font-medium text-center px-2">{bg.name}</span>
                  </div>
                  {String(bg.name).startsWith("AI Generated:") && (
                    <div className="absolute top-2 left-2">
                      <div className="bg-purple-500/80 text-white text-xs px-1.5 py-0.5 rounded">AI</div>
                    </div>
                  )}
                  {selectedBackground === `saved-${bg.id}` && (
                    <div className="absolute top-2 right-2">
                      <div className="w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generated Backgrounds */}
        {generatedImages.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Generated Backgrounds</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {generatedImages.map((imageUrl, index) => (
                <div
                  key={`generated-${index}`}
                  className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedBackground === `generated-${index}`
                      ? "border-purple-500"
                      : "border-white/20 hover:border-white/40"
                  }`}
                  onClick={() => setSelectedBackground(`generated-${index}`)}
                >
                  <img
                    src={imageUrl || "/placeholder.svg"}
                    alt={`Generated ${index + 1}`}
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setGeneratedImages((prev) => prev.filter((_, i) => i !== index))
                        if (selectedBackground === `generated-${index}`) {
                          setSelectedBackground("default")
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  {selectedBackground === `generated-${index}` && (
                    <div className="absolute top-2 right-2">
                      <div className="w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "SET_STEP", step: 2 })}
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
              "Continue to Settings"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
