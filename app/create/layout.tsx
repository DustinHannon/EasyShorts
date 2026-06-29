import type { ReactNode } from "react"
import { CrossOriginIsolationGuard } from "@/components/cross-origin-isolation-guard"

// Wraps all /create routes so the cross-origin isolation guard runs regardless of
// how the user enters the wizard (the COOP/COEP headers are scoped to /create).
export default function CreateLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CrossOriginIsolationGuard />
      {children}
    </>
  )
}
