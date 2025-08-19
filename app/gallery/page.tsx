import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Plus, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { GalleryContent } from "@/components/gallery/gallery-content"

export default async function GalleryPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: videosData } = await supabase
    .from("generated_videos")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  const videos =
    videosData?.map((video) => {
      const fallbackTitle = `Video-${video.created_at.split("T")[0]}`
      const filename = `${fallbackTitle}.${video.format || "mp4"}`

      return {
        id: video.id,
        filename,
        file_path: video.url,
        file_size: video.size || 0,
        duration: video.duration,
        thumbnail_path: null,
        created_at: video.created_at,
        background_url: video.background_url,
        background_type: video.background_type,
      }
    }) || []

  const { data: backgroundsData } = await supabase
    .from("backgrounds")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  const backgrounds =
    backgroundsData?.map((bg) => ({
      id: bg.id,
      filename: bg.name,
      file_path: bg.url,
      file_size: bg.size || 0,
      mime_type: bg.type === "image" ? "image/png" : null, // Removed video support
      created_at: bg.created_at,
    })) || []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild className="text-gray-300 hover:text-white">
              <Link href="/dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
            <div className="h-6 w-px bg-white/20" />
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Gallery</h1>
              <p className="text-gray-300">Manage your videos and backgrounds</p>
            </div>
          </div>
          <Button
            asChild
            className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
          >
            <Link href="/create">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Link>
          </Button>
        </div>

        <GalleryContent initialVideos={videos} initialBackgrounds={backgrounds} />
      </div>
    </div>
  )
}
