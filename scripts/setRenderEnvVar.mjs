#!/usr/bin/env node
/**
 * Set one env var on Render service `simvest-api`.
 * Usage:
 *   $env:RENDER_API_KEY="rnd_..."; node scripts/setRenderEnvVar.mjs FIREBASE_SERVICE_ACCOUNT_JSON "@path/to/file.json"
 *   node scripts/setRenderEnvVar.mjs KEY "plain-value"
 * For JSON files, prefix value with @ to read file contents.
 */
import fs from 'node:fs'
import path from 'node:path'

const SERVICE_NAME = 'simvest-api'
const key = process.argv[2]?.trim()
let value = process.argv[3]
if (!key || value == null) {
  console.error('Usage: node scripts/setRenderEnvVar.mjs KEY VALUE')
  console.error('  VALUE can be @path/to/file.json to load file contents')
  process.exit(1)
}

if (typeof value === 'string' && value.startsWith('@')) {
  const filePath = path.resolve(value.slice(1))
  value = fs.readFileSync(filePath, 'utf8').trim()
}

const apiKey = process.env.RENDER_API_KEY?.trim()
if (!apiKey) {
  console.error('Missing RENDER_API_KEY — create at https://dashboard.render.com/u/settings#api-keys')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

async function api(p, init) {
  const res = await fetch(`https://api.render.com/v1${p}`, {
    ...init,
    headers: { ...headers, ...init?.headers },
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    throw new Error(`${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
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
  console.error(`Service "${SERVICE_NAME}" not found`)
  process.exit(1)
}

await api(`/services/${service.id}/env-vars`, {
  method: 'PUT',
  body: JSON.stringify([{ key, value: String(value) }]),
})

console.log(`Set ${key} on ${SERVICE_NAME} (${service.id}). Render will redeploy.`)
