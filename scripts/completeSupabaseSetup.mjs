#!/usr/bin/env node
/**
 * Automate Simvest → Supabase cutover.
 *
 * Prerequisites:
 *   setup-input/supabase-access-token.txt
 * Optional:
 *   setup-input/render-api-key.txt
 *   setup-input/supabase-database-url.txt (if you have the Postgres URI)
 *
 * Usage: node scripts/completeSupabaseSetup.mjs
 */
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const setupDir = path.join(root, 'setup-input')
const migrationSqlPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260719000000_simvest_core.sql',
)

const PROJECT_NAME = 'SimvestSummerGO'
const REGION = 'us-east-1'

const STORE_NAMES = [
  'user-accounts.json',
  'user-profiles.json',
  'user-setup-profiles.json',
  'user-game-membership.json',
  'game-join-requests.json',
  'game-runtime-rules.json',
  'game-definitions.json',
  'user-game-state.json',
  'holdings.json',
  'follows.json',
  'game-feed.json',
  'feed-post-social.json',
  'feed-poll-votes.json',
  'activity-author-notify-preferences.json',
  'game-networth-snapshots.json',
  'game-final-snapshots.json',
  'perform-rank-streaks.json',
  'leaderboard-rank-cache.json',
  'push-alert-dedup.json',
  'user-finished-game-home-views.json',
  'user-web-push-subscriptions.json',
  'user-native-push-tokens.json',
  'vapid-keys.json',
]

function readLineFile(name) {
  const p = path.join(setupDir, name)
  if (!fs.existsSync(p)) return null
  return fs.readFileSync(p, 'utf8').trim().replace(/^\uFEFF/, '')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function api(token, method, apiPath, body) {
  const res = await fetch(`https://api.supabase.com/v1${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${apiPath} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`,
    )
  }
  return json
}

async function runSql(token, ref, query) {
  return api(token, 'POST', `/projects/${ref}/database/query`, { query })
}

async function setRenderEnv(renderKey, key, value) {
  const headers = {
    Authorization: `Bearer ${renderKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const services = await fetch('https://api.render.com/v1/services?limit=100', { headers }).then((r) =>
    r.json(),
  )
  const list = Array.isArray(services) ? services : []
  let svc = null
  for (const row of list) {
    const c = row.service ?? row
    if (c.name === 'simvest-api' || c.slug === 'simvest-api') {
      svc = c
      break
    }
  }
  if (!svc?.id) {
    console.warn('[render] simvest-api not found — skip env update')
    return
  }
  const existingRes = await fetch(`https://api.render.com/v1/services/${svc.id}/env-vars?limit=100`, {
    headers,
  })
  const existing = await existingRes.json()
  const map = new Map()
  for (const row of Array.isArray(existing) ? existing : []) {
    const e = row.envVar ?? row
    if (e?.key) map.set(e.key, e.value)
  }
  map.set(key, value)
  const payload = [...map.entries()].map(([k, v]) => ({ key: k, value: String(v) }))
  const put = await fetch(`https://api.render.com/v1/services/${svc.id}/env-vars`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  })
  if (!put.ok) throw new Error(`Render env update failed: ${put.status} ${await put.text()}`)
  console.log(`[render] Set ${key} on simvest-api`)
}

async function triggerRenderDeploy(renderKey) {
  const headers = {
    Authorization: `Bearer ${renderKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const services = await fetch('https://api.render.com/v1/services?limit=100', { headers }).then((r) =>
    r.json(),
  )
  let svc = null
  for (const row of Array.isArray(services) ? services : []) {
    const c = row.service ?? row
    if (c.name === 'simvest-api') {
      svc = c
      break
    }
  }
  if (!svc?.id) return
  const res = await fetch(`https://api.render.com/v1/services/${svc.id}/deploys`, {
    method: 'POST',
    headers,
    body: '{}',
  })
  if (res.ok) console.log('[render] Redeploy triggered')
  else console.warn('[render] Redeploy failed:', res.status, await res.text())
}

function mergeEnvFile(envText) {
  const envPath = path.join(root, '.env')
  let envExisting = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  for (const line of envText.split('\n')) {
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const k = line.slice(0, eq)
    const re = new RegExp(`^${k}=.*$`, 'm')
    if (re.test(envExisting)) envExisting = envExisting.replace(re, line)
    else envExisting = envExisting.trimEnd() + '\n' + line + '\n'
  }
  fs.writeFileSync(envPath, envExisting, 'utf8')
}

async function importJsonDocuments(supabaseUrl, serviceRole) {
  const client = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const dataDir = path.join(root, 'server', 'data')
  let imported = 0
  for (const name of STORE_NAMES) {
    const filePath = path.join(dataDir, name)
    if (!fs.existsSync(filePath)) continue
    let payload
    try {
      payload = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (err) {
      console.warn(`Skip ${name}:`, err.message)
      continue
    }
    const { error } = await client.from('json_documents').upsert(
      { name, payload, updated_at: new Date().toISOString() },
      { onConflict: 'name' },
    )
    if (error) throw new Error(`Import ${name}: ${error.message}`)
    imported++
    console.log(`Imported ${name}`)
  }
  return imported
}

async function main() {
  const token = readLineFile('supabase-access-token.txt')
  if (!token) {
    console.error('Missing setup-input/supabase-access-token.txt')
    process.exit(1)
  }
  if (!fs.existsSync(migrationSqlPath)) {
    console.error('Missing SQL migration at', migrationSqlPath)
    process.exit(1)
  }
  const sql = fs.readFileSync(migrationSqlPath, 'utf8')

  console.log('Listing projects…')
  const projects = await api(token, 'GET', '/projects')
  const projectList = Array.isArray(projects) ? projects : []
  let project =
    projectList.find((p) => p.name === PROJECT_NAME) ||
    projectList.find((p) => String(p.name).toLowerCase().includes('simvest')) ||
    projectList.find((p) => String(p.status).toUpperCase().includes('ACTIVE'))

  if (!project) {
    const orgs = await api(token, 'GET', '/organizations')
    const orgList = Array.isArray(orgs) ? orgs : []
    if (!orgList.length) {
      console.error('No organizations found.')
      process.exit(1)
    }
    const orgId = orgList[0].id
    const dbPass = crypto.randomBytes(24).toString('base64url')
    console.log(`Creating project "${PROJECT_NAME}"…`)
    try {
      project = await api(token, 'POST', '/projects', {
        name: PROJECT_NAME,
        organization_id: orgId,
        region: REGION,
        db_pass: dbPass,
      })
    } catch {
      project = await api(token, 'POST', '/projects', {
        name: PROJECT_NAME,
        organization_id: orgId,
        region: REGION,
        password: dbPass,
      })
    }
    fs.writeFileSync(path.join(setupDir, 'supabase-db-password.txt'), dbPass + '\n', 'utf8')
  } else {
    console.log(`Using project: ${project.name} (${project.ref})`)
    /* Rename default project to SimvestSummerGO when possible */
    if (project.name !== PROJECT_NAME) {
      try {
        await api(token, 'PATCH', `/projects/${project.ref}`, { name: PROJECT_NAME })
        console.log(`Renamed project to ${PROJECT_NAME}`)
        project.name = PROJECT_NAME
      } catch (err) {
        console.warn('Could not rename project (ok):', err.message)
      }
    }
  }

  const ref = project.ref || project.id
  console.log('Waiting for ACTIVE_HEALTHY…')
  for (let i = 0; i < 36; i++) {
    const p = await api(token, 'GET', `/projects/${ref}`)
    console.log(`  status=${p.status}`)
    if (String(p.status).toUpperCase().includes('ACTIVE')) break
    await sleep(8_000)
  }

  console.log('Fetching API keys…')
  const keys = await api(token, 'GET', `/projects/${ref}/api-keys`)
  const keyList = Array.isArray(keys) ? keys : []
  const serviceRole =
    keyList.find((k) => k.name === 'service_role')?.api_key ||
    keyList.find((k) => k.type === 'service_role')?.api_key
  const anon =
    keyList.find((k) => k.name === 'anon')?.api_key || keyList.find((k) => k.type === 'anon')?.api_key
  if (!serviceRole) {
    console.error('Missing service_role key', keyList)
    process.exit(1)
  }
  const supabaseUrl = `https://${ref}.supabase.co`

  console.log('Applying SQL schema via Management API…')
  await runSql(token, ref, sql)
  await runSql(token, ref, "notify pgrst, 'reload schema'")
  console.log('Schema applied + PostgREST cache reloaded.')
  await sleep(2000)

  let databaseUrl = readLineFile('supabase-database-url.txt')
  const dbPassFile = path.join(setupDir, 'supabase-db-password.txt')
  const dbPass = fs.existsSync(dbPassFile) ? fs.readFileSync(dbPassFile, 'utf8').trim() : null
  if (!databaseUrl && dbPass) {
    databaseUrl = `postgresql://postgres:${encodeURIComponent(dbPass)}@db.${ref}.supabase.co:5432/postgres`
  }

  const envLines = [
    `SUPABASE_URL=${supabaseUrl}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRole}`,
    anon ? `SUPABASE_ANON_KEY=${anon}` : '',
  ]
  if (databaseUrl) {
    envLines.push(`DATABASE_URL=${databaseUrl}`, `SUPABASE_DB_URL=${databaseUrl}`)
  }
  const envText = envLines.filter(Boolean).join('\n')
  fs.writeFileSync(path.join(setupDir, 'supabase-env.txt'), envText + '\n', 'utf8')
  mergeEnvFile(envText)
  console.log('Wrote setup-input/supabase-env.txt and merged into .env')

  console.log('Importing local server/data JSON into json_documents…')
  const imported = await importJsonDocuments(supabaseUrl, serviceRole)
  console.log(`Imported ${imported} store(s).`)

  if (databaseUrl) {
    console.log('Syncing normalized tables via migrate script…')
    spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'server/scripts/migrateJsonToSupabase.ts'],
      {
        cwd: root,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'inherit',
        shell: process.platform === 'win32',
      },
    )
  } else {
    console.log(
      'No DATABASE_URL — runtime uses service-role REST. Normalized Table Editor sync skipped (json_documents is populated).',
    )
    console.log(
      'Optional: paste Postgres URI into setup-input/supabase-database-url.txt and re-run for full normalized sync.',
    )
  }

  const renderKey = readLineFile('render-api-key.txt')
  if (renderKey) {
    await setRenderEnv(renderKey, 'SUPABASE_URL', supabaseUrl)
    await setRenderEnv(renderKey, 'SUPABASE_SERVICE_ROLE_KEY', serviceRole)
    if (databaseUrl) {
      await setRenderEnv(renderKey, 'DATABASE_URL', databaseUrl)
      await setRenderEnv(renderKey, 'SUPABASE_DB_URL', databaseUrl)
    }
    await triggerRenderDeploy(renderKey)
  } else {
    console.log('No render-api-key.txt — set SUPABASE_* on Render from supabase-env.txt')
  }

  console.log(`
✅ Supabase setup complete
  Project: ${project.name} (${ref})
  URL:     ${supabaseUrl}
  Tables:  https://supabase.com/dashboard/project/${ref}/editor

Restart local API (npm run dev) so it loads SUPABASE_URL / SERVICE_ROLE from .env.
`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
