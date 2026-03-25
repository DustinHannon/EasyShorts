"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { del } from "@vercel/blob"

// Project management actions
export async function createProject(title: string, description?: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title,
      description,
      status: "draft",
    })
    .select()
    .single()

  if (error) {
    // Added specific error handling for missing tables
    if (error.code === "42P01") {
      throw new Error("Database not set up. Please run the database setup scripts first.")
    }
    throw error
  }

  revalidatePath("/dashboard")
  return data
}

export async function updateProject(
  projectId: string,
  updates: {
    title?: string
    description?: string
    script?: string
    voice_settings?: any
    video_settings?: any
    status?: string
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data, error } = await supabase
    .from("projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) throw error

  revalidatePath("/dashboard")
  revalidatePath(`/project/${projectId}`)
  return data
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase.from("projects").delete().eq("id", projectId).eq("user_id", user.id)

  if (error) throw error

  revalidatePath("/dashboard")
}

// Background management actions
export async function deleteBackground(backgroundId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: background, error: fetchError } = await supabase
    .from("backgrounds")
    .select("url")
    .eq("id", backgroundId)
    .eq("user_id", user.id)
    .single()

  if (fetchError) throw fetchError

  if (background?.url) {
    try {
      await del(background.url)
    } catch (blobError) {
      console.warn("Failed to delete blob file:", blobError)
    }
  }

  const { error } = await supabase.from("backgrounds").delete().eq("id", backgroundId).eq("user_id", user.id)

  if (error) throw error

  revalidatePath("/dashboard")
  revalidatePath("/gallery")
}

// Video management actions
export async function deleteVideo(videoId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: video, error: fetchError } = await supabase
    .from("generated_videos")
    .select("url")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single()

  if (fetchError) throw fetchError

  if (video?.url) {
    try {
      await del(video.url)
    } catch (blobError) {
      console.warn("Failed to delete blob file:", blobError)
    }
  }

  const { error } = await supabase.from("generated_videos").delete().eq("id", videoId).eq("user_id", user.id)

  if (error) throw error

  revalidatePath("/dashboard")
  revalidatePath("/gallery")
}
