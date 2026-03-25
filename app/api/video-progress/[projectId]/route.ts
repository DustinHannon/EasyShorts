import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function GET(request: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { projectId } = params

    // Get project with progress information
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("status, progress, progress_stage, progress_message")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Return progress information from database
    const progress = {
      progress: project.progress || 0,
      stage: project.progress_stage || "waiting",
      message: project.progress_message || "Waiting to start...",
    }

    return NextResponse.json(progress)
  } catch (error) {
    console.error("Progress check error:", error)
    return NextResponse.json({ error: "Failed to get progress" }, { status: 500 })
  }
}

// Helper function to update progress in database
export async function updateProgress(projectId: string, progress: number, stage: string, message: string) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      },
    )

    const { error } = await supabase
      .from("projects")
      .update({
        progress,
        progress_stage: stage,
        progress_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)

    if (error) {
      console.error("Failed to update progress:", error)
    }
  } catch (error) {
    console.error("Progress update error:", error)
  }
}
