#!/usr/bin/env node
/**
 * After `npx firebase-tools login`, creates Firebase project + Android app + config files.
 * Run: node scripts/firebaseAutoSetup.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const inputDir = path.join(root, 'setup-input')
const PROJECT_ID = `simvest-push-${Date.now().toString(36)}`
const PACKAGE = 'com.simvest.myapp'

function runFirebase(args) {
  const r = spawnSync('npx', ['--yes', 'firebase-tools@13', ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })
  return r.status === 0
}

function runFirebaseCapture(args) {
  const r = spawnSync('npx', ['--yes', 'firebase-tools@13', ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  })
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') }
}

console.log('Checking Firebase login…')
const loginCheck = runFirebaseCapture(['projects:list'])
if (!loginCheck.ok || loginCheck.out.includes('Failed to authenticate')) {
  console.error('\nNot logged in. Run this first, then sign in in the browser:\n')
  console.error('  npx firebase-tools@13 login\n')
  process.exit(1)
}

fs.mkdirSync(inputDir, { recursive: true })

console.log(`Creating project ${PROJECT_ID}…`)
if (!runFirebase(['projects:create', PROJECT_ID, '--display-name', 'Simvest'])) {
  process.exit(1)
}

console.log('Creating Android app…')
const createApp = runFirebaseCapture([
  'apps:create',
  'android',
  PACKAGE,
  '--package-name',
  PACKAGE,
  '--project',
  PROJECT_ID,
])
if (!createApp.ok) {
  console.error(createApp.out)
  process.exit(1)
}

const appIdMatch = createApp.out.match(/App ID:\s*(\S+)/i) || createApp.out.match(/(1:\d+:android:\S+)/)
const appId = appIdMatch?.[1]
if (!appId) {
  console.error('Could not parse Firebase App ID from output. Use PUSH_SETUP_START_HERE.md manually.')
  process.exit(1)
}

const gsOut = path.join(inputDir, 'google-services.json')
console.log('Downloading google-services.json…')
if (
  !runFirebase(['apps:sdkconfig', 'android', appId, '--out', gsOut, '--project', PROJECT_ID])
) {
  process.exit(1)
}

fs.copyFileSync(gsOut, path.join(root, 'android', 'app', 'google-services.json'))
console.log('\n✓ google-services.json ready in setup-input/ and android/app/')
console.log('\nYou still need firebase-service-account.json (manual):')
console.log('  Firebase console → Project settings → Service accounts → Generate new private key')
console.log(`  Project: https://console.firebase.google.com/project/${PROJECT_ID}/settings/serviceaccounts/adminsdk`)
console.log('  Save as setup-input/firebase-service-account.json')
console.log('\nThen add setup-input/render-api-key.txt and run: npm run push:complete-setup')
