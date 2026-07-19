/**
 * Short-lived durable store for multi-step signup state.
 *
 * Step 1 of signup ("What is your full name?") commits the name to the
 * backend before the user has chosen a password or contact, so we can't
 * write to the real accounts file yet — that would leak partial PII for
 * users who abandon. Instead we mint an opaque `draftId`, hand it to the
 * client, and store the in-flight data in `signup-drafts.json` (survives
 * restarts + multi-instance via persistedJson).
 *
 * Drafts live for 30 minutes and are pruned on read/write.
 */
import { randomBytes } from 'node:crypto'
import { dataFilePath } from './dataDir.ts'
import { mutateDataJsonStore, readDataJsonObject } from './db/persistedJson.ts'

const DRAFT_TTL_MS = 30 * 60 * 1000
const DRAFTS_PATH = dataFilePath('signup-drafts.json')

export type SignupNameDraft = {
  draftId: string
  firstName: string
  lastName: string
  createdAt: number
  expiresAt: number
}

type DraftsFile = { drafts: Record<string, SignupNameDraft> }

function emptyDrafts(): DraftsFile {
  return { drafts: {} }
}

function newDraftId(): string {
  /* 24 bytes ≈ 192 bits of entropy in URL-safe form — plenty for a 30-min token. */
  return randomBytes(24).toString('base64url')
}

function pruneExpired(file: DraftsFile, now = Date.now()): DraftsFile {
  const next: DraftsFile = { drafts: {} }
  for (const [id, d] of Object.entries(file.drafts ?? {})) {
    if (d.expiresAt >= now) next.drafts[id] = d
  }
  return next
}

export async function createNameDraft(firstName: string, lastName: string): Promise<SignupNameDraft> {
  const now = Date.now()
  const draft: SignupNameDraft = {
    draftId: newDraftId(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    createdAt: now,
    expiresAt: now + DRAFT_TTL_MS,
  }
  await mutateDataJsonStore(DRAFTS_PATH, emptyDrafts(), (cur) => {
    const pruned = pruneExpired(cur, now)
    pruned.drafts[draft.draftId] = draft
    return pruned
  })
  return draft
}

export async function consumeNameDraft(draftId: string): Promise<SignupNameDraft | null> {
  if (!draftId) return null
  let found: SignupNameDraft | null = null
  await mutateDataJsonStore(DRAFTS_PATH, emptyDrafts(), (cur) => {
    const pruned = pruneExpired(cur)
    const draft = pruned.drafts[draftId]
    if (!draft) return pruned
    /* Single-use: clear immediately so a complete can't be replayed. */
    delete pruned.drafts[draftId]
    found = draft
    return pruned
  })
  return found
}

export async function peekNameDraft(draftId: string): Promise<SignupNameDraft | null> {
  if (!draftId) return null
  const file = (await readDataJsonObject<DraftsFile>(DRAFTS_PATH)) ?? emptyDrafts()
  const draft = pruneExpired(file).drafts[draftId]
  return draft ?? null
}
