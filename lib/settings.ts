import 'server-only'

import { db } from '@/lib/db'
import { appSetting } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Persisted, system-level settings that must survive redeploys. Stored as rows
 * in the `app_setting` table (one row per key) so nothing here is reset by a
 * deployment or process restart.
 */

export const SETTING_KEYS = {
  automationStartAt: 'automation_start_at',
  automationStatus: 'automation_status',
  // Master switch for AUTOMATIC Twilio SMS. Defaults OFF so no real customer is
  // ever messaged automatically until an admin explicitly enables it.
  smsAutoSend: 'sms_auto_send',
  // Durable heartbeat: JSON of the last reconcile cron run (timestamp + result
  // summary). Written on every run so the schedule can be verified from the DB.
  lastReconcile: 'last_reconcile',
  // Durable heartbeat: JSON of the last dedicated SMS cron run. Written on every
  // run so the SMS schedule can be verified from the DB independently of the
  // reconcile heartbeat.
  lastSmsCron: 'last_sms_cron',
} as const

export type AutomationStatus = 'active' | 'paused'

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appSetting)
    .where(eq(appSetting.key, key))
    .limit(1)
  return row?.value ?? null
}

/** Insert or update a single setting row. */
async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSetting)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value, updatedAt: new Date() },
    })
}

/** The activation timestamp, or null if automation has never been started. */
export async function getAutomationStartAt(): Promise<Date | null> {
  const raw = await getSetting(SETTING_KEYS.automationStartAt)
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Active/paused; defaults to 'paused' until automation is first activated. */
export async function getAutomationStatus(): Promise<AutomationStatus> {
  const raw = await getSetting(SETTING_KEYS.automationStatus)
  return raw === 'active' ? 'active' : 'paused'
}

export interface AutomationConfig {
  startAt: Date | null
  status: AutomationStatus
}

export async function getAutomationConfig(): Promise<AutomationConfig> {
  const [startAt, status] = await Promise.all([
    getAutomationStartAt(),
    getAutomationStatus(),
  ])
  return { startAt, status }
}

/**
 * "Start From Now": set the activation timestamp to the current server time,
 * but ONLY if it has never been set. This is intentionally idempotent — calling
 * it again (e.g. after a redeploy or a double click) never moves the start
 * point. Also flips status to 'active'. Returns the effective config.
 */
export async function activateAutomationFromNow(): Promise<{
  config: AutomationConfig
  alreadyActivated: boolean
}> {
  const existing = await getAutomationStartAt()
  if (existing) {
    // Never reset an existing start point; just ensure it is active.
    await setSetting(SETTING_KEYS.automationStatus, 'active')
    return {
      config: { startAt: existing, status: 'active' },
      alreadyActivated: true,
    }
  }

  const now = new Date()
  await setSetting(SETTING_KEYS.automationStartAt, now.toISOString())
  await setSetting(SETTING_KEYS.automationStatus, 'active')
  return {
    config: { startAt: now, status: 'active' },
    alreadyActivated: false,
  }
}

/** Pause or resume automation without touching the activation timestamp. */
export async function setAutomationStatus(
  status: AutomationStatus,
): Promise<void> {
  await setSetting(SETTING_KEYS.automationStatus, status)
}

/**
 * Whether AUTOMATIC Twilio SMS is enabled. Defaults to false (OFF) until an
 * admin explicitly turns it on, so connecting Twilio never starts messaging
 * real customers on its own.
 */
export async function getSmsAutoSendEnabled(): Promise<boolean> {
  const raw = await getSetting(SETTING_KEYS.smsAutoSend)
  return raw === 'on'
}

/** Enable or disable AUTOMATIC Twilio SMS. */
export async function setSmsAutoSendEnabled(enabled: boolean): Promise<void> {
  await setSetting(SETTING_KEYS.smsAutoSend, enabled ? 'on' : 'off')
}

export interface ReconcileHeartbeat {
  at: string
  ok: boolean
  ingested?: number
  autoDue?: number
  autoSent?: number
  autoFailed?: number
  error?: string
}

/**
 * Record a durable heartbeat for the reconcile cron. Called on every run
 * (success or failure) so the schedule is verifiable directly from the DB
 * without relying on ephemeral log streams.
 */
export async function recordReconcileHeartbeat(
  beat: ReconcileHeartbeat,
): Promise<void> {
  await setSetting(SETTING_KEYS.lastReconcile, JSON.stringify(beat))
}

/** Read the last reconcile heartbeat, or null if the cron has never run. */
export async function getReconcileHeartbeat(): Promise<ReconcileHeartbeat | null> {
  const raw = await getSetting(SETTING_KEYS.lastReconcile)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ReconcileHeartbeat
  } catch {
    return null
  }
}

export interface SmsCronHeartbeat {
  at: string
  ok: boolean
  enabled?: boolean
  due?: number
  sent?: number
  failed?: number
  skipped?: number
  error?: string
}

/**
 * Record a durable heartbeat for the dedicated SMS cron. Called on every run
 * (success or failure) so the SMS schedule is verifiable directly from the DB,
 * separately from the reconcile heartbeat.
 */
export async function recordSmsCronHeartbeat(
  beat: SmsCronHeartbeat,
): Promise<void> {
  await setSetting(SETTING_KEYS.lastSmsCron, JSON.stringify(beat))
}

/** Read the last SMS cron heartbeat, or null if it has never run. */
export async function getSmsCronHeartbeat(): Promise<SmsCronHeartbeat | null> {
  const raw = await getSetting(SETTING_KEYS.lastSmsCron)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SmsCronHeartbeat
  } catch {
    return null
  }
}

/**
 * Reset the activation timestamp to the current server time and set status to
 * 'active'. Unlike `activateAutomationFromNow`, this ALWAYS moves the start
 * point — used only by the admin "Reset Golden Feedback Data" flow so the
 * system restarts cleanly from now. Returns the new config.
 */
export async function resetAutomationStartAtToNow(): Promise<AutomationConfig> {
  const now = new Date()
  await setSetting(SETTING_KEYS.automationStartAt, now.toISOString())
  await setSetting(SETTING_KEYS.automationStatus, 'active')
  return { startAt: now, status: 'active' }
}
