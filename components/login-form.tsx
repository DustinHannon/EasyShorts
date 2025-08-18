"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Zap, Mic, Sparkles } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { signIn } from "@/lib/actions"

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white py-6 text-lg font-medium rounded-lg h-[60px] border-0"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Signing in...
        </>
      ) : (
        "Sign In"
      )}
    </Button>
  )
}

export default function LoginForm() {
  const router = useRouter()
  const [state, formAction] = useActionState(signIn, null)

  // Handle successful login by redirecting
  useEffect(() => {
    if (state?.success) {
      router.push("/")
    }
  }, [state, router])

  return (
    <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
      {/* Left side - Platform showcase */}
      <div className="hidden lg:block space-y-8">
        <div className="space-y-4">
          <h2 className="text-5xl font-bold text-white leading-tight">
            Create Viral Videos
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
              In Minutes
            </span>
          </h2>
          <p className="text-xl text-gray-300 leading-relaxed">
            Transform your ideas into engaging TikTok and YouTube Shorts with AI-powered tools
          </p>
        </div>

        <div className="grid gap-6">
          <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <div className="bg-gradient-to-r from-pink-500 to-purple-600 p-3 rounded-lg">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">AI Script Generation</h3>
              <p className="text-gray-400">Generate engaging scripts tailored for viral content</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <div className="bg-gradient-to-r from-pink-500 to-purple-600 p-3 rounded-lg">
              <Mic className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Voice Synthesis</h3>
              <p className="text-gray-400">Convert scripts to natural-sounding speech</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <div className="bg-gradient-to-r from-pink-500 to-purple-600 p-3 rounded-lg">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Instant Videos</h3>
              <p className="text-gray-400">Combine backgrounds, audio, and effects automatically</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="w-full max-w-md mx-auto lg:mx-0">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20 space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
              Welcome back
            </h1>
            <p className="text-lg text-gray-300">Continue creating amazing videos</p>
          </div>

          <form action={formAction} className="space-y-6">
            {state?.error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg backdrop-blur-sm">
                {state.error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-200">
                  Email
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-gray-400 backdrop-blur-sm focus:border-purple-400 focus:ring-purple-400/20"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-200">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="bg-white/10 border-white/20 text-white backdrop-blur-sm focus:border-purple-400 focus:ring-purple-400/20"
                />
              </div>
            </div>

            <SubmitButton />

            <div className="text-center text-gray-300">
              Don't have an account?{" "}
              <Link
                href="/auth/sign-up"
                className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 hover:from-pink-300 hover:to-purple-300 font-medium"
              >
                Sign up
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
