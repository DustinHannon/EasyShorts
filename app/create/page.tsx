import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { WizardProvider } from "@/components/wizard/wizard-provider"
import { WizardLayout } from "@/components/wizard/wizard-layout"
import { ProjectSetupStep } from "@/components/wizard/project-setup-step"

export default async function CreatePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <WizardProvider>
      <WizardLayout>
        <ProjectSetupStep />
      </WizardLayout>
    </WizardProvider>
  )
}
