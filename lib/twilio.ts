import 'server-only'

/**
 * Minimal server-only Twilio SMS client. Talks directly to the Twilio REST API
 * with fetch + Basic Auth so no SDK dependency is required. Credentials
 * (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are read from the
 * environment and NEVER returned to the client or logged.
 */

export interface TwilioSendResult {
  ok: boolean
  sid?: string
  /** Twilio error code (numeric, as string) when the send failed. */
  errorCode?: string
  /** Safe, human-readable error message for admin troubleshooting. */
  errorMessage?: string
}

/** Whether all required Twilio env vars are present. */
export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER,
  )
}

/** The configured sender phone number (safe to surface to the admin). */
export function twilioSenderNumber(): string | null {
  return process.env.TWILIO_PHONE_NUMBER ?? null
}

/**
 * Send an SMS from the configured TWILIO_PHONE_NUMBER. Returns a structured
 * result rather than throwing so callers can record failures without marking a
 * message as sent. A network/exception is reported as ok:false.
 */
export async function sendSms(input: {
  to: string
  body: string
}): Promise<TwilioSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !from) {
    return {
      ok: false,
      errorMessage: 'Twilio is not configured (missing credentials).',
    }
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid,
  )}/Messages.json`

  const form = new URLSearchParams()
  form.set('To', input.to)
  form.set('From', from)
  form.set('Body', input.body)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      cache: 'no-store',
    })

    const data = (await res.json().catch(() => ({}))) as {
      sid?: string
      status?: string
      code?: number | string
      message?: string
    }

    if (!res.ok) {
      return {
        ok: false,
        errorCode: data.code != null ? String(data.code) : String(res.status),
        errorMessage: data.message || `Twilio request failed (${res.status}).`,
      }
    }

    return { ok: true, sid: data.sid }
  } catch (e) {
    return {
      ok: false,
      errorMessage:
        e instanceof Error ? e.message : 'Unexpected error contacting Twilio.',
    }
  }
}
