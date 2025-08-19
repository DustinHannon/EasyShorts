"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VideoGallery } from "@/components/gallery/video-gallery"
import { BackgroundGallery } from "@/components/gallery/background-gallery"

interface GalleryContentProps {
  initialVideos: any[]
  initialBackgrounds: any[]
}

export function GalleryContent({ initialVideos, initialBackgrounds }: GalleryContentProps) {
  const [backgrounds, setBackgrounds] = useState(initialBackgrounds)

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

  const handleBackgroundDelete = async () => {
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
        <BackgroundGallery
          backgrounds={backgrounds || []}
          onUpload={handleBackgroundUpload}
          onDelete={handleBackgroundDelete}
        />
      </TabsContent>
    </Tabs>
  )
}
