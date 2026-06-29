"use client"

import { useEffect } from "react"

// Multi-threaded video rendering needs SharedArrayBuffer, which requires the page
// to be cross-origin isolated. The /create routes send COOP/COEP headers, but a
// soft (client-side) navigation into /create does NOT re-evaluate those headers,
// so isolation can be missing. One hard reload re-fetches the /create document
// WITH the headers and makes it isolated. A sessionStorage flag prevents any loop
// (if isolation still isn't achieved after one reload, we stop and let the video
// processor surface the failure rather than reload forever).
export function CrossOriginIsolationGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.crossOriginIsolated) {
      window.sessionStorage.removeItem("coi-reloaded")
      return
    }
    if (window.sessionStorage.getItem("coi-reloaded")) return
    window.sessionStorage.setItem("coi-reloaded", "1")
    window.location.reload()
  }, [])

  return null
}
