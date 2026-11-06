import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** A Supabase project is connected (used for the answer mailbox). */
export const supabaseConfigured = Boolean(url && key)

/**
 * Full accounts mode: sign-in by code, the plan stored in Supabase, and family opening it on their own
 * phones. Off unless switched on, so connecting Supabase for the mailbox doesn't change how plans are saved.
 */
export const cloudEnabled = supabaseConfigured && import.meta.env.VITE_ENABLE_ACCOUNTS === 'true'

let client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null
  client ??= createClient(url!, key!, { auth: { persistSession: cloudEnabled, autoRefreshToken: cloudEnabled } })
  return client
}
