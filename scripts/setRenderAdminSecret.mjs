#!/usr/bin/env node
/**
 * Set SIMVEST_ADMIN_SECRET on Render service `simvest-api`.
 * Requires: RENDER_API_KEY from https://dashboard.render.com/u/settings#api-keys
 *
 * Usage:
 *   $env:RENDER_API_KEY="rnd_..."; node scripts/setRenderAdminSecret.mjs
 * Optional: pass secret as argv[2], else reads SIMVEST_ADMIN_SECRET from .env
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVICE_NAME = 'simvest-api'
const ENV_KEY = 'SIMVEST_ADMIN_SECRET'

function loadDotEnvSecret() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return null
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^SIMVEST_ADMIN_SECRET=(.+)$/)
    if (m) return m[1].trim()
  }
  return null
}

const apiKey = process.env.RENDER_API_KEY?.trim()
if (!apiKey) {
  console.error('Missing RENDER_API_KEY. Create one at https://dashboard.render.com/u/settings#api-keys')
  process.exit(1)
}

const secret = (process.argv[2] ?? process.env.SIMVEST_ADMIN_SECRET ?? loadDotEnvSecret())?.trim()
if (!secret || secret.length < 8) {
  console.error('Missing admin secret (argv, SIMVEST_ADMIN_SECRET, or .env)')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

async function api(path, init) {
  const res = await fetch(`https://api.render.com/v1${path}`, { ...init, headers: { ...headers, ...init?.headers } })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  }
  return body
}

const services = await api('/services?limit=100')
const list = Array.isArray(services) ? services : services?.items ?? []
const row = list.find((s) => {
  const svc = s.service ?? s
  return svc?.name === SERVICE_NAME || svc?.slug === SERVICE_NAME
})
const service = row?.service ?? row
if (!service?.id) {
  console.error(`Service "${SERVICE_NAME}" not found. Services:`, list.map((s) => (s.service ?? s).name))
  process.exit(1)
}

const serviceId = service.id
console.log(`Found service ${SERVICE_NAME} (${serviceId})`)

await api(`/services/${serviceId}/env-vars`, {
  method: 'PUT',
  body: JSON.stringify([{ key: ENV_KEY, value: secret }]),
})
console.log(`Set ${ENV_KEY} on ${SERVICE_NAME}`)

await api(`/services/${serviceId}/deploys`, {
  method: 'POST',
  body: JSON.stringify({ clearCache: 'do_not_clear' }),
})
console.log('Triggered redeploy so the new env var is picked up.')
