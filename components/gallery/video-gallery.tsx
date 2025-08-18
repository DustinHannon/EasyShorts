"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { VideoPlayer } from "./video-player"
import { VideoActions } from "./video-actions"
import { Search, Filter, Grid, List, Calendar, Clock } from "lucide-react"

interface Video {
  id: string
  filename: string
  file_path: string
  file_size: number
  duration: number | null
  thumbnail_path: string | null
  created_at: string
  background_url: string | null
  background_type: string | null
  projects: {
    title: string
    description: string | null
    status: string
  } | null
}

interface VideoGalleryProps {
  videos: Video[]
}

export function VideoGallery({ videos }: VideoGalleryProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [sortBy, setSortBy] = useState("newest")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [failedBackgrounds, setFailedBackgrounds] = useState<Set<string>>(new Set())

  const getVideoBackground = (video: Video): string | null => {
    if (!video.background_url || failedBackgrounds.has(video.background_url)) {
      return null
    }

    if (video.background_type === "preset") {
      return video.background_url
    } else if (video.background_type?.startsWith("saved-")) {
      return video.background_url
    } else if (video.background_type === "custom") {
      return video.background_url
    }

    return video.background_url
  }

  const handleBackgroundError = (backgroundUrl: string) => {
    setFailedBackgrounds((prev) => new Set([...prev, backgroundUrl]))
  }

  const filteredVideos = videos
    .filter((video) => {
      if (!searchTerm) return true
      const searchLower = String(searchTerm || "").toLowerCase()
      return (
        String(video.projects?.title || "")
          .toLowerCase()
          .includes(searchLower) ||
        String(video.projects?.description || "")
          .toLowerCase()
          .includes(searchLower) ||
        String(video.filename || "")
          .toLowerCase()
          .includes(searchLower)
      )
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case "name":
          const aName = (a.projects?.title || a.filename || "").toString()
          const bName = (b.projects?.title || b.filename || "").toString()
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

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "Unknown"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  if (videos.length === 0) {
    return (
      <Card className="bg-white/10 backdrop-blur-sm border-white/20">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="text-6xl mb-4">🎬</div>
          <h3 className="text-lg font-medium text-white mb-2">No videos yet</h3>
          <p className="text-gray-400 text-center mb-4">Create your first video project to see it here</p>
          <Button
            asChild
            className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
          >
            <a href="/create">Create Video</a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search videos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-gray-500"
            />
          </div>
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

      {/* Videos Grid/List */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredVideos.map((video) => {
            const backgroundImage = getVideoBackground(video)

            return (
              <Card
                key={video.id}
                className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Video Thumbnail */}
                    <div
                      className="aspect-[9/16] rounded-lg flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity relative overflow-hidden"
                      onClick={() => setSelectedVideo(video)}
                      style={{
                        backgroundColor: backgroundImage ? "transparent" : "#000000",
                      }}
                    >
                      {backgroundImage && (
                        <img
                          src={backgroundImage || "/placeholder.svg"}
                          alt="Video background"
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={() => handleBackgroundError(backgroundImage)}
                        />
                      )}

                      <div className="relative z-10 text-center">
                        <div className="text-4xl mb-2">🎬</div>
                        <p className="text-white text-sm">Click to play</p>
                      </div>
                    </div>

                    {/* Video Info */}
                    <div className="space-y-2">
                      <h3 className="text-white font-medium truncate">{video.projects?.title || video.filename}</h3>
                      {video.projects?.description && (
                        <p className="text-gray-400 text-sm line-clamp-2">{video.projects.description}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Calendar className="w-3 h-3" />
                        {new Date(video.created_at).toLocaleDateString()}
                        <Clock className="w-3 h-3 ml-2" />
                        {formatDuration(video.duration)}
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">
                          {formatFileSize(video.file_size)}
                        </Badge>
                        <VideoActions video={video} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVideos.map((video) => {
            const backgroundImage = getVideoBackground(video)

            return (
              <Card
                key={video.id}
                className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Thumbnail */}
                    <div
                      className="w-24 h-16 rounded-lg flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0 relative overflow-hidden"
                      onClick={() => setSelectedVideo(video)}
                      style={{
                        backgroundColor: backgroundImage ? "transparent" : "#000000",
                      }}
                    >
                      {backgroundImage && (
                        <img
                          src={backgroundImage || "/placeholder.svg"}
                          alt="Video background"
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={() => handleBackgroundError(backgroundImage)}
                        />
                      )}

                      <div className="relative z-10 text-white text-lg">🎬</div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate">{video.projects?.title || video.filename}</h3>
                      {video.projects?.description && (
                        <p className="text-gray-400 text-sm truncate">{video.projects.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                        <span>{new Date(video.created_at).toLocaleDateString()}</span>
                        <span>{formatDuration(video.duration)}</span>
                        <span>{formatFileSize(video.file_size)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <VideoActions video={video} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Video Player Modal */}
      {selectedVideo && <VideoPlayer video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
    </div>
  )
}
