import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseBackend, getDatabaseUrl } from './backend.ts'
import { getPgPool } from './client.ts'

let sb: SupabaseClient | null = null

/** True when we can talk to Supabase (Postgres URL and/or service role REST). */
export function canUseSupabaseStorage(): boolean {
  if (getDatabaseUrl() && getPgPool()) return true
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  if (!sb) {
    sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return sb
}

export function storageBackendLabel(): 'supabase' | 'json' {
  return canUseSupabaseStorage() ? 'supabase' : 'json'
}

/** Prefer DATABASE_URL; service-role REST alone also counts as supabase backend for health. */
export function isSupabaseBackendForHealth(): boolean {
  return canUseSupabaseStorage()
}

export { isSupabaseBackend, getDatabaseUrl }
