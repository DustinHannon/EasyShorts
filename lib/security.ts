import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export async function getAuthenticatedUser() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  return user
}

// Vercel Blob URLs are already public and don't need signed URL generation
// If signed URLs are needed in the future, they should use Vercel Blob's signed URL functionality

export function validateFileType(file: File, allowedTypes: string[]) {
  return allowedTypes.includes(file.type)
}

export function validateFileSize(file: File, maxSizeInMB: number) {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024
  return file.size <= maxSizeInBytes
}
