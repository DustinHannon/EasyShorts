"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VideoGallery } from "@/components/gallery/video-gallery"
import { BackgroundGallery } from "@/components/gallery/background-gallery"

interface GalleryVideo {
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

interface GalleryBackground {
  id: string
  filename: string
  file_path: string
  file_size: number
  mime_type: string | null
  created_at: string
}

interface GalleryContentProps {
  initialVideos: GalleryVideo[]
  initialBackgrounds: GalleryBackground[]
}

export function GalleryContent({ initialVideos, initialBackgrounds }: GalleryContentProps) {
  const router = useRouter()
  const [backgrounds, setBackgrounds] = useState(initialBackgrounds)

  useEffect(() => {
    setBackgrounds(initialBackgrounds)
  }, [initialBackgrounds])

  // BackgroundGallery already shows the new row optimistically. Re-fetch the
  // server data so the authoritative list (and any other client) stays in sync.
  const handleBackgroundUpload = () => {
    router.refresh()
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
