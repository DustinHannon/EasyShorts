"use client"

import { useWizard } from "./wizard-provider"
import { ScriptStep } from "./script-step"
import { VoiceStep } from "./voice-step"
import { BackgroundStep } from "./background-step"
import { SettingsStep } from "./settings-step"
import { GenerateStep } from "./generate-step"

export function WizardSteps() {
  const { state } = useWizard()

  switch (state.currentStep) {
    case 1:
      return <ScriptStep />
    case 2:
      return <VoiceStep />
    case 3:
      return <BackgroundStep />
    case 4:
      return <SettingsStep />
    case 5:
      return <GenerateStep />
    default:
      return <ScriptStep />
  }
}
