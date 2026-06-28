"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export type AuthState = { error?: string; success?: boolean | string }

// Handle sign-in. On success this redirects server-side (full navigation);
// callers should render the {error} state and let the action navigate.
export async function signIn(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  // Check if formData is valid
  if (!formData) {
    return { error: "Form data is missing" }
  }

  const email = formData.get("email")
  const password = formData.get("password")

  // Validate required fields
  if (!email || !password) {
    return { error: "Email and password are required" }
  }

  const supabase = await createClient()

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.toString(),
      password: password.toString(),
    })

    if (error) {
      // Log the real reason server-side; never echo enumerable auth messages.
      console.error("Sign in error:", error.message)
      return { error: "Invalid email or password." }
    }
  } catch (error) {
    console.error("Login error:", error)
    return { error: "An unexpected error occurred. Please try again." }
  }

  // Full server-side redirect so the new session is reflected immediately.
  redirect("/dashboard")
}

export async function signUp(prevState: AuthState | null, formData: FormData): Promise<AuthState> {
  // Check if formData is valid
  if (!formData) {
    return { error: "Form data is missing" }
  }

  const email = formData.get("email")
  const password = formData.get("password")
  const confirmPassword = formData.get("confirmPassword")?.toString() ?? ""

  // Validate required fields
  if (!email || !password) {
    return { error: "Email and password are required" }
  }

  const passwordStr = password.toString()

  if (passwordStr.length < 8) {
    return { error: "Password must be at least 8 characters." }
  }

  if (confirmPassword !== passwordStr) {
    return { error: "Passwords do not match." }
  }

  const supabase = await createClient()

  let hasSession = false

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.toString(),
      password: passwordStr,
    })

    if (error) {
      // Log the real reason server-side; never echo enumerable messages
      // like "User already registered".
      console.error("Sign up error:", error.message)
      return { error: "Could not create account." }
    }

    // When email confirmation is disabled, signUp returns an active session.
    hasSession = Boolean(data.session)
  } catch (error) {
    console.error("Sign up error:", error)
    return { error: "An unexpected error occurred. Please try again." }
  }

  // Immediate session (autoconfirm) — go straight to the app.
  if (hasSession) {
    redirect("/dashboard")
  }

  return { success: "Check your email to confirm your account." }
}

export async function signOut() {
  const supabase = await createClient()

  try {
    await supabase.auth.signOut()
  } catch (error) {
    // Best-effort: log, but still clear the route and send the user to login.
    console.error("Sign out error:", error)
  }

  // redirect() throws NEXT_REDIRECT — keep it OUTSIDE the try/catch so it propagates.
  redirect("/auth/login")
}
