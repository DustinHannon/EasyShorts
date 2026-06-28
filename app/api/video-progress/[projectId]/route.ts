import { type NextRequest, NextResponse } from "next/server"
import { getRouteUser } from "@/lib/supabase/server"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const { supabase, user } = await getRouteUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("status, progress, progress_stage, progress_message")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    return NextResponse.json({
      progress: project.progress || 0,
      stage: project.progress_stage || "waiting",
      message: project.progress_message || "Waiting to start...",
    })
  } catch (error) {
    console.error("Progress check error:", error)
    return NextResponse.json({ error: "Failed to get progress" }, { status: 500 })
  }
}
