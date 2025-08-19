"use client"

import type React from "react"
import { useRef } from "react"
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { BackgroundActions } from "./background-actions"
import { Search, Filter, Grid, List, Upload, X } from "lucide-react"
import { upload } from "@vercel/blob/client"

interface Background {
  id: string
  filename: string
  file_path: string
  file_size: number
  mime_type: string | null
  created_at: string
}

interface BackgroundGalleryProps {
  backgrounds: Background[]
  onUpload?: () => void
}

export function BackgroundGallery({ backgrounds, onUpload }: BackgroundGalleryProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState("newest")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [filterType, setFilterType] = useState("all")
  const [selectedBackground, setSelectedBackground] = useState<Background | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredBackgrounds = backgrounds
    .filter((bg) => {
      if (!searchTerm) return true
      const searchLower = String(searchTerm || "").toLowerCase()
      const matchesSearch = String(bg.filename || "")
        .toLowerCase()
        .includes(searchLower)
      const matchesType =
        filterType === "all" ||
        (filterType === "image" && bg.mime_type?.startsWith("image/")) ||
        (filterType === "video" && bg.mime_type?.startsWith("video/"))
      return matchesSearch && matchesType
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case "name":
          const aName = (a.filename || "").toString()
          const bName = (b.filename || "").toString()
          return aName.localeCompare(bName)
        case "size":
          return b.file_size - a.file_size
        default:
          return 0
      }
    })

  const formatFileSize = (bytes: number): string => {
    const sizes = ["Bytes", "KB", "MB", "GB"]
    if (bytes === 0) return "0 Bytes"
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i]
  }

  const getFileType = (mimeType: string | null): string => {
    if (!mimeType) return "Unknown"
    if (mimeType.startsWith("image/")) return "Image"
    if (mimeType.startsWith("video/")) return "Video"
    return "File"
  }

  const isAIGenerated = (filename: string): boolean => {
    return filename ? filename.startsWith("AI Generated:") || filename.includes("ai-generated") : false
  }

  const closeModal = () => {
    setSelectedBackground(null)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeModal()
    }
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file (JPG, PNG, WebP, etc.)")
      return
    }

    setIsUploading(true)
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/background/upload",
      })

      console.log("Background uploaded successfully:", blob)

      if (onUpload) {
        onUpload()
      }
    } catch (error) {
      console.error("Error uploading background:", error)
      alert(`Failed to upload background: ${error instanceof Error ? error.message : "Please try again."}`)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  if (backgrounds.length === 0) {
    return (
      <Card className="bg-white/10 backdrop-blur-sm border-white/20">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="text-6xl mb-4">🖼️</div>
          <h3 className="text-lg font-medium text-white mb-2">No backgrounds yet</h3>
          <p className="text-gray-400 text-center mb-4">Upload custom image backgrounds to get started</p>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            <Button
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 bg-transparent"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? "Uploading..." : "Upload Background"}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search backgrounds..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-gray-500"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32 bg-white/5 border-white/20 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="all" className="text-white">
                All Types
              </SelectItem>
              <SelectItem value="image" className="text-white">
                Images
              </SelectItem>
              <SelectItem value="video" className="text-white">
                Videos
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40 bg-white/5 border-white/20 text-white">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="newest" className="text-white">
                Newest First
              </SelectItem>
              <SelectItem value="oldest" className="text-white">
                Oldest First
              </SelectItem>
              <SelectItem value="name" className="text-white">
                Name A-Z
              </SelectItem>
              <SelectItem value="size" className="text-white">
                Largest First
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("grid")}
            className={
              viewMode === "grid"
                ? "bg-purple-600 hover:bg-purple-700"
                : "border-white/20 text-white hover:bg-white/10 bg-transparent"
            }
          >
            <Grid className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
            className={
              viewMode === "list"
                ? "bg-purple-600 hover:bg-purple-700"
                : "border-white/20 text-white hover:bg-white/10 bg-transparent"
            }
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          <Button
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10 bg-transparent"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {isUploading ? "Uploading..." : "Upload Background"}
          </Button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {filteredBackgrounds.map((background) => (
            <Card
              key={background.id}
              className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors"
            >
              <CardContent className="p-3">
                <div className="space-y-3">
                  <div
                    className="aspect-square bg-black rounded-lg overflow-hidden cursor-pointer"
                    onClick={() => setSelectedBackground(background)}
                  >
                    <img
                      src={background.file_path || "/placeholder.svg"}
                      alt={background.filename}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-white text-sm font-medium truncate">{background.filename}</h3>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {getFileType(background.mime_type)}
                        </Badge>
                        {isAIGenerated(background.filename) && (
                          <Badge variant="outline" className="text-xs border-purple-400 text-purple-300">
                            AI
                          </Badge>
                        )}
                      </div>
                      <BackgroundActions background={background} />
                    </div>
                    <p className="text-gray-400 text-xs">{formatFileSize(background.file_size)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBackgrounds.map((background) => (
            <Card
              key={background.id}
              className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 bg-black rounded-lg overflow-hidden flex-shrink-0 cursor-pointer"
                    onClick={() => setSelectedBackground(background)}
                  >
                    <img
                      src={background.file_path || "/placeholder.svg"}
                      alt={background.filename}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-medium truncate">{background.filename}</h3>
                      {isAIGenerated(background.filename) && (
                        <Badge variant="outline" className="text-xs border-purple-400 text-purple-300">
                          AI
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                      <span>{getFileType(background.mime_type)}</span>
                      <span>{formatFileSize(background.file_size)}</span>
                      <span>{new Date(background.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <BackgroundActions background={background} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedBackground && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleBackdropClick}
        >
          <div className="relative max-w-4xl max-h-full">
            <Button
              variant="outline"
              size="sm"
              className="absolute -top-12 right-0 bg-white/10 border-white/20 text-white hover:bg-white/20 z-10"
              onClick={closeModal}
            >
              <X className="w-4 h-4" />
            </Button>
            <img
              src={selectedBackground.file_path || "/placeholder.svg"}
              alt={selectedBackground.filename}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-4 rounded-b-lg">
              <h3 className="text-white font-medium mb-1">{selectedBackground.filename}</h3>
              <div className="flex items-center gap-4 text-sm text-gray-300">
                <span>{getFileType(selectedBackground.mime_type)}</span>
                <span>{formatFileSize(selectedBackground.file_size)}</span>
                <span>{new Date(selectedBackground.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
