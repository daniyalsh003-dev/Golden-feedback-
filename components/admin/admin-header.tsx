'use client'

import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth-client'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function AdminHeader({ adminName }: { adminName: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    await signOut()
    router.push('/admin/sign-in')
    router.refresh()
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border pb-5">
      <div className="flex items-center gap-3">
        <img
          src="/toronto-golden-barbers-logo-trimmed.png"
          alt="Toronto Golden Barbers"
          width={1017}
          height={952}
          className="h-11 w-auto select-none"
          draggable={false}
        />
        <div>
          <h1 className="font-serif text-lg leading-tight text-foreground sm:text-xl">
            Golden Feedback
          </h1>
          <p className="text-xs text-muted-foreground">
            Signed in as {adminName}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        onClick={handleSignOut}
        disabled={loading}
        className="gap-2 border-border bg-transparent text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-4" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </header>
  )
}
