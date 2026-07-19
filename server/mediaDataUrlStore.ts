import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { getDataDir } from './dataDir.ts'
import { getSupabaseAdmin } from './db/supabaseAdmin.ts'

/** Durable media dir — uses SIMVEST_DATA_DIR when set (Render disk / shared volume). */
function mediaDir(): string {
  return path.join(getDataDir(), 'media')
}

function mediaBucket(): string {
  return process.env.SIMVEST_MEDIA_BUCKET?.trim() || 'simvest-media'
}

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/i

const extByMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const mimeByExt: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

const inflight = new Map<string, Promise<string>>()
let bucketReady: Promise<boolean> | null = null

function mediaPublicPath(hash: string, ext: string): string {
  return `/api/media/${hash}.${ext}`
}

async function ensureMediaBucket(): Promise<boolean> {
  const admin = getSupabaseAdmin()
  if (!admin) return false
  if (!bucketReady) {
    bucketReady = (async () => {
      const name = mediaBucket()
      const { data: buckets, error: listErr } = await admin.storage.listBuckets()
      if (listErr) {
        console.warn('[simvest] media storage listBuckets:', listErr.message)
        return false
      }
      if (buckets?.some((b) => b.name === name)) return true
      const { error: createErr } = await admin.storage.createBucket(name, {
        public: false,
        fileSizeLimit: 8 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      })
      if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
        console.warn('[simvest] media storage createBucket:', createErr.message)
        return false
      }
      return true
    })().catch((err) => {
      console.warn('[simvest] media storage bucket setup failed:', (err as Error).message)
      bucketReady = null
      return false
    })
  }
  return bucketReady
}

/** Best-effort upload to Supabase Storage; local disk remains source of truth for `/api/media`. */
async function uploadToSupabaseStorage(
  fileName: string,
  buf: Buffer,
  contentType: string,
): Promise<void> {
  const admin = getSupabaseAdmin()
  if (!admin) return
  const ok = await ensureMediaBucket()
  if (!ok) return
  const { error } = await admin.storage.from(mediaBucket()).upload(fileName, buf, {
    contentType,
    upsert: true,
  })
  if (error) {
    console.warn('[simvest] media storage upload failed:', error.message)
  }
}

async function downloadFromSupabaseStorage(fileName: string): Promise<Buffer | null> {
  const admin = getSupabaseAdmin()
  if (!admin) return null
  const ok = await ensureMediaBucket()
  if (!ok) return null
  const { data, error } = await admin.storage.from(mediaBucket()).download(fileName)
  if (error || !data) return null
  const ab = await data.arrayBuffer()
  return Buffer.from(ab)
}

/** Persist a data: URL once and return a short `/api/media/…` path for JSON payloads. */
export async function materializeDataUrlImage(dataUrl: string): Promise<string | null> {
  const t = dataUrl.trim()
  const m = DATA_URL_RE.exec(t)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const ext = extByMime[mime]
  if (!ext) return null
  const b64 = m[2].replace(/\s+/g, '')
  const hash = createHash('sha1').update(b64).digest('hex').slice(0, 32)
  const publicPath = mediaPublicPath(hash, ext)
  const pending = inflight.get(hash)
  if (pending) return pending

  const job = (async () => {
    const dir = mediaDir()
    await mkdir(dir, { recursive: true })
    const fileName = `${hash}.${ext}`
    const filePath = path.join(dir, fileName)
    try {
      await access(filePath)
      return publicPath
    } catch {
      /* write below */
    }
    const buf = Buffer.from(b64, 'base64')
    if (buf.length < 32) return null
    await writeFile(filePath, buf)
    void uploadToSupabaseStorage(fileName, buf, mime).catch(() => {})
    return publicPath
  })().finally(() => inflight.delete(hash))

  inflight.set(hash, job as Promise<string>)
  return job
}

/** Replace oversized data: URLs with `/api/media/…` (or fallback). */
export async function compactImageUrlForApi(
  url: string | null | undefined,
  fallback = '',
): Promise<string> {
  const t = typeof url === 'string' ? url.trim() : ''
  if (!t) return fallback
  if (!t.startsWith('data:')) return t
  if (t.length < 4_000) return t
  const materialized = await materializeDataUrlImage(t)
  return materialized || fallback
}

export async function readMediaFile(
  fileName: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  const safe = path.basename(fileName)
  if (!/^[a-f0-9]{16,64}\.(jpg|jpeg|png|webp|gif)$/i.test(safe)) return null
  const filePath = path.join(mediaDir(), safe)
  const ext = path.extname(safe).slice(1).toLowerCase()
  const contentType = mimeByExt[ext] ?? 'image/jpeg'
  try {
    const buf = await readFile(filePath)
    return { buf, contentType }
  } catch {
    /* try Supabase Storage, then cache locally */
  }
  const remote = await downloadFromSupabaseStorage(safe)
  if (!remote) return null
  try {
    await mkdir(mediaDir(), { recursive: true })
    await writeFile(filePath, remote)
  } catch {
    /* serving without local cache is fine */
  }
  return { buf: remote, contentType }
}

/** Exposed for health / diagnostics. */
export function mediaStoragePaths(): { localDir: string; bucket: string } {
  return { localDir: mediaDir(), bucket: mediaBucket() }
}
