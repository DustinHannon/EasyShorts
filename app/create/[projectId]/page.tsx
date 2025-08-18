import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { WizardProvider } from "@/components/wizard/wizard-provider"
import { WizardLayout } from "@/components/wizard/wizard-layout"
import { WizardSteps } from "@/components/wizard/wizard-steps"

interface CreateProjectPageProps {
  params: {
    projectId: string
  }
}

export default async function CreateProjectPage({ params }: CreateProjectPageProps) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Fetch the project
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.projectId)
    .eq("user_id", user.id)
    .single()

  if (error || !project) {
    notFound()
  }

  return (
    <WizardProvider initialProject={project}>
      <WizardLayout>
        <WizardSteps />
      </WizardLayout>
    </WizardProvider>
  )
}
