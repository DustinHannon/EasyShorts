"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VideoGallery } from "@/components/gallery/video-gallery"
import { BackgroundGallery } from "@/components/gallery/background-gallery"

interface GalleryContentProps {
  initialVideos: any[]
  initialBackgrounds: any[]
}

export function GalleryContent({ initialVideos, initialBackgrounds }: GalleryContentProps) {
  const [backgrounds, setBackgrounds] = useState(initialBackgrounds)

  useEffect(() => {
    console.log("[v0] Gallery Content - Initial Videos:", initialVideos)
    console.log("[v0] Gallery Content - Videos count:", initialVideos?.length || 0)
    console.log("[v0] Gallery Content - Initial Backgrounds:", initialBackgrounds)
    console.log("[v0] Gallery Content - Backgrounds count:", initialBackgrounds?.length || 0)
  }, [initialVideos, initialBackgrounds])

  useEffect(() => {
    setBackgrounds(initialBackgrounds)
  }, [initialBackgrounds])

  const handleBackgroundUpload = async () => {
    const response = await fetch("/api/backgrounds")
    if (response.ok) {
      const newBackgrounds = await response.json()
      setBackgrounds(newBackgrounds)
    } else {
      // Fallback: reload the page
      window.location.reload()
    }
  }

  return (
    <Tabs defaultValue="videos" className="space-y-6">
      <TabsList className="bg-white/10 border-white/20">
        <TabsTrigger value="videos" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
          Videos ({initialVideos?.length || 0})
        </TabsTrigger>
        <TabsTrigger value="backgrounds" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
          Backgrounds ({backgrounds?.length || 0})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="videos">
        <VideoGallery videos={initialVideos || []} />
      </TabsContent>

      <TabsContent value="backgrounds">
        <BackgroundGallery backgrounds={backgrounds || []} onUpload={handleBackgroundUpload} />
      </TabsContent>
    </Tabs>
  )
}
