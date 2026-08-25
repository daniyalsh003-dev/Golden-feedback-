import { AdminAuthForm } from '@/components/admin-auth-form'
import { AdminAuthShell } from '@/components/admin-auth-shell'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AdminSignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/admin')

  return (
    <AdminAuthShell
      title="Create Admin Account"
      subtitle="Set up access for a Golden Feedback manager."
    >
      <AdminAuthForm mode="sign-up" />
    </AdminAuthShell>
  )
}
