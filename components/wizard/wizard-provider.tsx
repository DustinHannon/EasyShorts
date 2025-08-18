"use client"

import type React from "react"

import { createContext, useContext, useReducer, type ReactNode } from "react"

interface Project {
  id?: string
  title: string
  description?: string
  script?: string
  voice_settings?: any
  video_settings?: any
  status?: string
}

interface WizardState {
  currentStep: number
  project: Project
  isLoading: boolean
  error: string | null
}

type WizardAction =
  | { type: "SET_STEP"; step: number }
  | { type: "UPDATE_PROJECT"; updates: Partial<Project> }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "RESET" }

const initialState: WizardState = {
  currentStep: 0,
  project: {
    title: "",
    description: "",
    script: "",
    voice_settings: {
      voice: "alloy",
      speed: 1.0,
    },
    video_settings: {
      format: "vertical",
      quality: "720p",
      duration: "auto",
      captions: true,
      background: "default",
    },
    status: "draft",
  },
  isLoading: false,
  error: null,
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, currentStep: action.step }
    case "UPDATE_PROJECT":
      return {
        ...state,
        project: { ...state.project, ...action.updates },
      }
    case "SET_LOADING":
      return { ...state, isLoading: action.loading }
    case "SET_ERROR":
      return { ...state, error: action.error }
    case "RESET":
      return initialState
    default:
      return state
  }
}

const WizardContext = createContext<{
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
} | null>(null)

interface WizardProviderProps {
  children: ReactNode
  initialProject?: Project
}

export function WizardProvider({ children, initialProject }: WizardProviderProps) {
  const [state, dispatch] = useReducer(wizardReducer, {
    ...initialState,
    project: initialProject || initialState.project,
    currentStep: initialProject ? 1 : 0, // Start at step 1 if editing existing project
  })

  return <WizardContext.Provider value={{ state, dispatch }}>{children}</WizardContext.Provider>
}

export function useWizard() {
  const context = useContext(WizardContext)
  if (!context) {
    throw new Error("useWizard must be used within a WizardProvider")
  }
  return context
}
