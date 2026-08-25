import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { auth } from '@/lib/auth'
import {
  getAutomationOverviewAction,
  getCustomers,
  getDailyAppointments,
  getFeedback,
  getFeedbackStats,
} from './actions'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/sign-in')

  const [initialFeedback, stats, customers, automation, initialDaily] =
    await Promise.all([
      getFeedback(),
      getFeedbackStats(),
      getCustomers(),
      getAutomationOverviewAction(),
      getDailyAppointments(),
    ])

  return (
    <AdminDashboard
      adminName={session.user.name || session.user.email}
      initialFeedback={initialFeedback}
      stats={stats}
      initialCustomers={customers}
      automation={automation}
      initialDaily={initialDaily}
    />
  )
}
