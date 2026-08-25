import { AdminAuthForm } from '@/components/admin-auth-form'
import { AdminAuthShell } from '@/components/admin-auth-shell'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AdminSignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/admin')

  return (
    <AdminAuthShell
      title="Admin Sign In"
      subtitle="Access the Golden Feedback dashboard."
    >
      <AdminAuthForm mode="sign-in" />
    </AdminAuthShell>
  )
}
