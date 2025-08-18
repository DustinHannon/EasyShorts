"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useWizard } from "./wizard-provider"
import { createProject } from "@/lib/supabase/actions"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export function ProjectSetupStep() {
  const { state, dispatch } = useWizard()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!state.project.title.trim()) {
      dispatch({ type: "SET_ERROR", error: "Project title is required" })
      return
    }

    setIsSubmitting(true)
    dispatch({ type: "SET_ERROR", error: null })

    try {
      const project = await createProject(state.project.title, state.project.description)
      dispatch({ type: "UPDATE_PROJECT", updates: { id: project.id } })
      router.push(`/create/${project.id}`)
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: "Failed to create project" })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="bg-white/10 backdrop-blur-sm border-white/20">
      <CardHeader>
        <CardTitle className="text-2xl text-white">Create New Project</CardTitle>
        <CardDescription className="text-gray-300">
          Let's start by setting up your video project with some basic information.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {state.error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded">{state.error}</div>
          )}

          <div className="space-y-2">
            <label htmlFor="title" className="block text-sm font-medium text-gray-300">
              Project Title *
            </label>
            <Input
              id="title"
              value={state.project.title}
              onChange={(e) => dispatch({ type: "UPDATE_PROJECT", updates: { title: e.target.value } })}
              placeholder="e.g., My Viral TikTok Video"
              className="bg-white/5 border-white/20 text-white placeholder:text-gray-500"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="block text-sm font-medium text-gray-300">
              Description (Optional)
            </label>
            <Textarea
              id="description"
              value={state.project.description || ""}
              onChange={(e) => dispatch({ type: "UPDATE_PROJECT", updates: { description: e.target.value } })}
              placeholder="Brief description of your video concept..."
              className="bg-white/5 border-white/20 text-white placeholder:text-gray-500 min-h-[100px]"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isSubmitting || !state.project.title.trim()}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Project"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
