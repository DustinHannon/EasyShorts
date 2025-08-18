"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, TrendingUp, Clock, Users } from "lucide-react"
import Link from "next/link"
import { signUp } from "@/lib/actions"

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
          Creating account...
        </>
      ) : (
        "Start Creating Free"
      )}
    </Button>
  )
}

export default function SignUpForm() {
  // Initialize with null as the initial state
  const [state, formAction] = useActionState(signUp, null)

  return (
    <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
      {/* Left side - Benefits showcase */}
      <div className="hidden lg:block space-y-8">
        <div className="space-y-4">
          <h2 className="text-5xl font-bold text-white leading-tight">
            Join the Future of
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
              Content Creation
            </span>
          </h2>
          <p className="text-xl text-gray-300 leading-relaxed">
            Start creating viral videos today with our AI-powered platform
          </p>
        </div>

        <div className="grid gap-4">
          <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-2 rounded-lg">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-white font-medium">Create videos in under 5 minutes</span>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-600 p-2 rounded-lg">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-white font-medium">AI-optimized for viral content</span>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-2 rounded-lg">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-white font-medium">Perfect for personal projects</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Signup form */}
      <div className="w-full max-w-md mx-auto lg:mx-0">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20 space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
              Get started
            </h1>
            <p className="text-lg text-gray-300">Create your free account</p>
          </div>

          <form action={formAction} className="space-y-6">
            {state?.error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg backdrop-blur-sm">
                {state.error}
              </div>
            )}

            {state?.success && (
              <div className="bg-green-500/20 border border-green-500/50 text-green-200 px-4 py-3 rounded-lg backdrop-blur-sm">
                {state.success}
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
              Already have an account?{" "}
              <Link
                href="/auth/login"
                className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 hover:from-pink-300 hover:to-purple-300 font-medium"
              >
                Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
