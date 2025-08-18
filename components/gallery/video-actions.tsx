"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Download, Share, Trash2, Copy } from "lucide-react"
import { deleteVideo } from "@/lib/supabase/actions"
import { toast } from "@/hooks/use-toast"

interface Video {
  id: string
  filename: string
  file_path: string
  projects: {
    title: string
    description: string | null
    status: string
  } | null
}

interface VideoActionsProps {
  video: Video
  showLabels?: boolean
}

export function VideoActions({ video, showLabels = false }: VideoActionsProps) {
  const [isPending, startTransition] = useTransition()

  const handleDownload = () => {
    // Create a temporary link to download the video
    const link = document.createElement("a")
    link.href = video.file_path
    link.download = video.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: video.projects?.title || video.filename,
          text: video.projects?.description || "Check out this video!",
          url: video.file_path,
        })
      } catch (error) {
        // User cancelled sharing
      }
    } else {
      // Fallback: copy link to clipboard
      await navigator.clipboard.writeText(video.file_path)
      toast({
        title: "Link copied",
        description: "Video link copied to clipboard",
      })
    }
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(video.file_path)
    toast({
      title: "Link copied",
      description: "Video link copied to clipboard",
    })
  }

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this video? This action cannot be undone.")) {
      startTransition(async () => {
        try {
          await deleteVideo(video.id)
          toast({
            title: "Video deleted",
            description: "The video has been successfully deleted",
          })
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to delete video",
            variant: "destructive",
          })
        }
      })
    }
  }

  if (showLabels) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={handleDownload} className="bg-green-600 hover:bg-green-700">
          <Download className="w-3 h-3 mr-1" />
          Download
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleShare}
          className="border-white/20 text-white hover:bg-white/10 bg-transparent"
        >
          <Share className="w-3 h-3 mr-1" />
          Share
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopyLink}
          className="border-white/20 text-white hover:bg-white/10 bg-transparent"
        >
          <Copy className="w-3 h-3 mr-1" />
          Copy Link
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={isPending}
          className="bg-red-600 hover:bg-red-700"
        >
          <Trash2 className="w-3 h-3 mr-1" />
          Delete
        </Button>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-white" disabled={isPending}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
        <DropdownMenuItem onClick={handleDownload} className="text-white">
          <Download className="mr-2 h-4 w-4" />
          Download
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleShare} className="text-white">
          <Share className="mr-2 h-4 w-4" />
          Share
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyLink} className="text-white">
          <Copy className="mr-2 h-4 w-4" />
          Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} disabled={isPending} className="text-red-400">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
