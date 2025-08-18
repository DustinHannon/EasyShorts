"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Edit, Trash2, Play } from "lucide-react"
import Link from "next/link"
import { deleteProject } from "@/lib/supabase/actions"
import { useTransition } from "react"

interface Project {
  id: string
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this project?")) {
      startTransition(async () => {
        await deleteProject(project.id)
      })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "processing":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      case "failed":
        return "bg-red-500/20 text-red-400 border-red-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
    }
  }

  return (
    <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1 flex-1">
          <CardTitle className="text-white text-lg">{project.title}</CardTitle>
          {project.description && <CardDescription className="text-gray-300">{project.description}</CardDescription>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-white">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
            <DropdownMenuItem asChild>
              <Link href={`/create/${project.id}`} className="flex items-center">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} disabled={isPending} className="text-red-400">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
          <div className="flex gap-2">
            {project.status === "completed" && (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10 bg-transparent"
              >
                <Link href="/gallery">
                  <Play className="w-3 h-3 mr-1" />
                  View
                </Link>
              </Button>
            )}
            {project.status !== "completed" && (
              <Button asChild size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                <Link href={`/create/${project.id}`}>Continue</Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
