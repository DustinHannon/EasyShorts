"use client"

import { useWizard } from "./wizard-provider"
import { CheckCircle, Circle } from "lucide-react"

const steps = [
  { id: 0, name: "Project Setup", description: "Basic information" },
  { id: 1, name: "Script", description: "Generate or write script" },
  { id: 2, name: "Voice", description: "Choose voice settings" },
  { id: 3, name: "Background", description: "Select background" },
  { id: 4, name: "Settings", description: "Video configuration" },
  { id: 5, name: "Generate", description: "Create your video" },
]

export function WizardProgress() {
  const { state } = useWizard()

  return (
    <div className="border-b border-white/10 bg-black/10 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 mb-2">
                  {state.currentStep > step.id ? (
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  ) : state.currentStep === step.id ? (
                    <Circle className="w-6 h-6 text-purple-400 fill-purple-400" />
                  ) : (
                    <Circle className="w-6 h-6 text-gray-500" />
                  )}
                </div>
                <div className="text-center">
                  <div
                    className={`text-sm font-medium ${state.currentStep >= step.id ? "text-white" : "text-gray-500"}`}
                  >
                    {step.name}
                  </div>
                  <div className="text-xs text-gray-400">{step.description}</div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-px mx-4 ${state.currentStep > step.id ? "bg-green-400" : "bg-gray-600"}`} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
