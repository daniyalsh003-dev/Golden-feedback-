'use client'

import { Button } from '@/components/ui/button'
import { signIn, signUp } from '@/lib/auth-client'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function AdminAuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isSignUp) {
        const { error } = await signUp.email({ email, password, name })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await signIn.email({ email, password })
        if (error) throw new Error(error.message)
      }
      router.push('/admin')
      router.refresh()
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Something went wrong. Please try again.',
      )
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {isSignUp && (
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-sm text-muted-foreground">
            Full name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-border bg-input/40 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-gold"
            placeholder="Jane Doe"
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm text-muted-foreground">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border bg-input/40 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-gold"
          placeholder="manager@torontogoldenbarbers.com"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm text-muted-foreground">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border bg-input/40 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-gold"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="mt-2 h-12 rounded-full bg-gradient-to-b from-gold to-gold-soft text-base font-semibold text-primary-foreground hover:from-gold hover:to-gold disabled:opacity-70"
      >
        {loading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : isSignUp ? (
          'Create admin account'
        ) : (
          'Sign in'
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? (
          <>
            Already have an account?{' '}
            <Link href="/admin/sign-in" className="text-gold hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Need to create the first admin?{' '}
            <Link href="/admin/sign-up" className="text-gold hover:underline">
              Sign up
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
