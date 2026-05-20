/**
 * All player/game persistence lives under this directory (JSON stores).
 *
 * Local dev: `server/data/` (in the repo).
 * Render/production: set `SIMVEST_DATA_DIR` to a persistent disk mount (e.g. `/var/data`)
 * so redeploys do not wipe accounts, games, ledgers, or activity feeds.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Default bundled data (shipped in the Docker image / repo). */
export const BUNDLED_DATA_DIR = path.join(__dirname, 'data')

let cachedDir: string | null = null

export function getDataDir(): string {
  if (cachedDir) return cachedDir
  const raw = process.env.SIMVEST_DATA_DIR?.trim()
  cachedDir = raw ? path.resolve(raw) : BUNDLED_DATA_DIR
  return cachedDir
}

export function dataFilePath(fileName: string): string {
  return path.join(getDataDir(), fileName)
}

/** Files copied from the repo only when missing on the persistent volume (static seeds). */
const SEED_IF_MISSING = ['game-definitions.json'] as const

export async function ensureDataDirReady(): Promise<void> {
  const dir = getDataDir()
  await fs.mkdir(dir, { recursive: true })

  for (const name of SEED_IF_MISSING) {
    const dest = path.join(dir, name)
    try {
      await fs.access(dest)
    } catch {
      try {
        await fs.copyFile(path.join(BUNDLED_DATA_DIR, name), dest)
        console.log(`[simvest] Seeded ${name} into data directory`)
      } catch {
        /* bundled file optional in minimal checkouts */
      }
    }
  }

  const persistent = dir !== BUNDLED_DATA_DIR
  console.log(
    `[simvest] Data directory: ${dir}${persistent ? ' (SIMVEST_DATA_DIR — survives redeploy)' : ' (ephemeral — set SIMVEST_DATA_DIR on Render)'}`,
  )
}
