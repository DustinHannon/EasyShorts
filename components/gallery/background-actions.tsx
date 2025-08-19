"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Download, Trash2, Copy, Eye } from "lucide-react"
import { deleteBackground } from "@/lib/supabase/actions"
import { toast } from "@/hooks/use-toast"

interface Background {
  id: string
  filename: string
  file_path: string
  file_size: number
  mime_type: string | null
}

interface BackgroundActionsProps {
  background: Background
  onDelete?: () => void // Added callback for deletion
}

export function BackgroundActions({ background, onDelete }: BackgroundActionsProps) {
  const [isPending, startTransition] = useTransition()

  const handleDownload = () => {
    const link = document.createElement("a")
    link.href = background.file_path
    link.download = background.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(background.file_path)
    toast({
      title: "Link copied",
      description: "Background link copied to clipboard",
    })
  }

  const handlePreview = () => {
    window.open(background.file_path, "_blank")
  }

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this background? This action cannot be undone.")) {
      startTransition(async () => {
        try {
          await deleteBackground(background.id)
          toast({
            title: "Background deleted",
            description: "The background has been successfully deleted",
          })
          if (onDelete) {
            onDelete()
          }
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to delete background",
            variant: "destructive",
          })
        }
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-white" disabled={isPending}>
          <MoreHorizontal className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
        <DropdownMenuItem onClick={handlePreview} className="text-white">
          <Eye className="mr-2 h-4 w-4" />
          Preview
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownload} className="text-white">
          <Download className="mr-2 h-4 w-4" />
          Download
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
