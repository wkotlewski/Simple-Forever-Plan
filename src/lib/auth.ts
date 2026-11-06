import { cloudEnabled, getSupabase } from './supabase'
import { cloudStore, localStore, type Store } from './store'
import type { Member, Session } from './types'

export interface Access {
  session: Session
  store: Store
}

const LOCAL_KEY = 'sfp-local-session'

export const isEmail = (s: string) => s.includes('@')

/** Turns "(555) 123-4567" into "+15551234567"; leaves numbers that already have a country code alone. */
export function normalizePhone(s: string) {
  const digits = s.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

export const normalizeContact = (s: string) => (isEmail(s) ? s.trim().toLowerCase() : normalizePhone(s))

/** Easy-to-read codes: no 0/O or 1/I so they survive being read aloud over the phone. */
export function makeAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = () => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length]
  return `${Array.from({ length: 4 }, pick).join('')}-${Array.from({ length: 4 }, pick).join('')}`
}

// ---------- This-device mode ----------

export function restoreLocal(): Access | null {
  if (cloudEnabled) return null
  const raw = localStorage.getItem(LOCAL_KEY)
  if (!raw) return null
  try {
    return { session: JSON.parse(raw) as Session, store: localStore }
  } catch {
    return null
  }
}

export function startLocalOwner(name: string): Access {
  const session: Session = { role: 'owner', name, canViewMedical: true }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(session))
  return { session, store: localStore }
}

export async function enterLocalFamilyCode(code: string): Promise<Access | null> {
  const clean = code.trim().toUpperCase().replace(/\s/g, '')
  const members = (await localStore.list('members')) as Member[]
  const m = members.find((x) => x.accessCode?.replace('-', '') === clean.replace('-', ''))
  if (!m) return null
  const session: Session = { role: 'family', name: m.name, canViewMedical: m.canViewMedical }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(session))
  return { session, store: localStore }
}

// ---------- Cloud mode: the code arrives by email or text ----------

export async function sendCode(contact: string) {
  const sb = getSupabase()!
  const c = normalizeContact(contact)
  const { error } = isEmail(c)
    ? await sb.auth.signInWithOtp({ email: c })
    : await sb.auth.signInWithOtp({ phone: c })
  if (error) throw error
}

export async function verifyCode(contact: string, code: string) {
  const sb = getSupabase()!
  const c = normalizeContact(contact)
  const token = code.replace(/\D/g, '')
  const { error } = isEmail(c)
    ? await sb.auth.verifyOtp({ email: c, token, type: 'email' })
    : await sb.auth.verifyOtp({ phone: c, token, type: 'sms' })
  if (error) throw error
}

/** Finds the plan this signed-in person can open: their own, or one they were invited to. */
export async function resolveCloudAccess(opts: { createIfMissing?: string } = {}): Promise<Access | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data: auth } = await sb.auth.getSession()
  if (!auth.session) return null
  const { data, error } = await sb.rpc('my_vault')
  if (error) throw error
  let row = (data as any[])?.[0]
  if (!row && opts.createIfMissing) {
    const { error: e2 } = await sb.rpc('create_vault', { storyteller: opts.createIfMissing })
    if (e2) throw e2
    row = ((await sb.rpc('my_vault')).data as any[])?.[0]
  }
  if (!row) return null
  return {
    session: { role: row.role, name: row.display_name, canViewMedical: row.can_view_medical },
    store: cloudStore(row.vault_id),
  }
}

export async function signOut() {
  localStorage.removeItem(LOCAL_KEY)
  await getSupabase()?.auth.signOut()
}
