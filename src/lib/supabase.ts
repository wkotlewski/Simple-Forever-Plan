import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the app is connected to a backend, so family on other devices can see the plan. */
export const cloudEnabled = Boolean(url && key)

let client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient | null {
  if (!cloudEnabled) return null
  client ??= createClient(url!, key!)
  return client
}
