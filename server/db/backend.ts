/**
 * Simvest persistence backend detection.
 * Prefer DATABASE_URL (direct Postgres). Also accept SUPABASE_URL + SERVICE_ROLE_KEY
 * (PostgREST) so existing projects work without rediscovering the DB password.
 */
export function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim() || null
}

export function hasSupabaseServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

export function isSupabaseBackend(): boolean {
  return Boolean(getDatabaseUrl() || hasSupabaseServiceRole())
}

export function storageBackendLabel(): 'supabase' | 'json' {
  return isSupabaseBackend() ? 'supabase' : 'json'
}
