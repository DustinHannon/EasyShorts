"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { ArrowLeft, Home } from "lucide-react"
import Link from "next/link"
import { useWizard } from "./wizard-provider"
import { WizardProgress } from "./wizard-progress"

interface WizardLayoutProps {
  children: React.ReactNode
}

export function WizardLayout({ children }: WizardLayoutProps) {
  const { state } = useWizard()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" asChild className="text-gray-300 hover:text-white">
                <Link href="/dashboard">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Link>
              </Button>
              <div className="h-6 w-px bg-white/20" />
              <h1 className="text-xl font-semibold text-white">{state.project.title || "New Project"}</h1>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-gray-300 hover:text-white">
              <Link href="/dashboard">
                <Home className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <WizardProgress />

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">{children}</div>
      </div>
    </div>
  )
}
