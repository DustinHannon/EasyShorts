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
    voice_settings?: Record<string, unknown>
    video_settings?: Record<string, unknown>
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
  revalidatePath(`/create/${projectId}`)
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

// BLOB_READ_WRITE_TOKEN is store-wide, not user-scoped, so `del()` will happily
// delete ANY blob in the store. Before deleting we re-check that the URL really
// sits under the caller's own prefix — defence in depth behind the ownership
// checks in /api/background/record and /api/video/record, so that a row which
// somehow points elsewhere can never destroy another tenant's file.
// NOTE: rows created BEFORE per-user prefixes existed point at store-root keys
// (verified 2026-07-26: all 6 rows then in `backgrounds` were root-level
// `ai-generated-*.png`). Those blobs are deliberately left behind — an orphaned
// blob is recoverable, deleting someone else's file is not. Every write path
// now emits a `users/<uid>/` key (client uploads AND /api/generate-image), so
// this only affects that pre-existing set, which will not grow.
function isOwnedBlobUrl(url: string, userId: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".public.blob.vercel-storage.com") &&
      parsed.pathname.startsWith(`/users/${userId}/`)
    )
  } catch {
    return false
  }
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

  // Row first, blob second: if the blob delete fails we leak a file (invisible,
  // recoverable). The other order leaves a row pointing at a deleted blob, which
  // the user sees as a permanently broken background.
  const { error } = await supabase.from("backgrounds").delete().eq("id", backgroundId).eq("user_id", user.id)

  if (error) throw error

  if (background?.url && isOwnedBlobUrl(background.url, user.id)) {
    try {
      await del(background.url)
    } catch (blobError) {
      console.warn("Failed to delete background blob:", backgroundId, blobError)
    }
  }

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

  // Row first, blob second — see the note in deleteBackground.
  const { error } = await supabase.from("generated_videos").delete().eq("id", videoId).eq("user_id", user.id)

  if (error) throw error

  if (video?.url && isOwnedBlobUrl(video.url, user.id)) {
    try {
      await del(video.url)
    } catch (blobError) {
      console.warn("Failed to delete video blob:", videoId, blobError)
    }
  }

  revalidatePath("/dashboard")
  revalidatePath("/gallery")
}
