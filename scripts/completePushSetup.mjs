#!/usr/bin/env node
/**
 * One-shot push setup: copies Firebase files, uploads secret to Render, rebuilds Android bundle.
 *
 * Put these in setup-input/ (see setup-input/README.txt):
 *   google-services.json
 *   firebase-service-account.json   (from Firebase → Service accounts → Generate key)
 *   render-api-key.txt              (one line: rnd_... from Render dashboard)
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const inputDir = path.join(root, 'setup-input')

function need(file) {
  const p = path.join(inputDir, file)
  if (!fs.existsSync(p)) return null
  return p
}

function fail(msg) {
  console.error('\n[simvest] ' + msg)
  process.exit(1)
}

console.log('Simvest push setup — checking setup-input/ …\n')

const gsPath = need('google-services.json')
const saPath = need('firebase-service-account.json')
const renderKeyPath = need('render-api-key.txt')

if (!gsPath) fail('Missing setup-input/google-services.json — see PUSH_SETUP_START_HERE.md')
if (!saPath) fail('Missing setup-input/firebase-service-account.json')
if (!renderKeyPath) fail('Missing setup-input/render-api-key.txt')

const gs = JSON.parse(fs.readFileSync(gsPath, 'utf8'))
const pkg = gs?.client?.[0]?.client_info?.android_client_info?.package_name
if (pkg && pkg !== 'com.simvest.myapp') {
  fail(`google-services.json is for package "${pkg}", expected com.simvest.myapp`)
}

const androidDest = path.join(root, 'android', 'app', 'google-services.json')
fs.copyFileSync(gsPath, androidDest)
console.log('✓ Copied google-services.json → android/app/')

const renderKey = fs.readFileSync(renderKeyPath, 'utf8').trim()
if (!renderKey.startsWith('rnd_')) {
  fail('render-api-key.txt should contain your Render API key (starts with rnd_)')
}

const setEnv = spawnSync(
  process.execPath,
  [path.join(__dirname, 'setRenderEnvVar.mjs'), 'FIREBASE_SERVICE_ACCOUNT_JSON', `@${saPath}`],
  {
    cwd: root,
    env: { ...process.env, RENDER_API_KEY: renderKey },
    stdio: 'inherit',
  },
)
if (setEnv.status !== 0) fail('Render env update failed')

console.log('\n✓ FIREBASE_SERVICE_ACCOUNT_JSON set on Render (redeploying API)')

console.log('\nBuilding release app + Play bundle (may take a few minutes)…\n')
const ps1 = path.join(__dirname, 'build-play-aab.ps1')
const build = spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', ps1], {
  cwd: root,
  stdio: 'inherit',
})
if (build.status !== 0) fail('Android bundle build failed')

const aab = path.join(root, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
console.log('\n════════════════════════════════════════════════════════')
console.log('Push setup complete.')
console.log('Upload this file in Google Play Console:')
console.log('  ' + aab)
console.log('Privacy policy URL (Play Console):')
console.log('  https://simvest-api.onrender.com/legal/privacy-policy.html')
console.log('════════════════════════════════════════════════════════\n')
