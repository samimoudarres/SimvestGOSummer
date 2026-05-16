/**
 * Short-lived in-memory store for multi-step signup state.
 *
 * Step 1 of signup ("What is your full name?") commits the name to the
 * backend before the user has chosen a password or contact, so we can't
 * write to the real accounts file yet — that would leak partial PII for
 * users who abandon. Instead we mint an opaque `draftId`, hand it to the
 * client, and store the in-flight data in memory keyed by that id.
 *
 * Drafts live for 30 minutes (more than enough for an actual signup) and are
 * swept periodically. A successful complete consumes the draft, so the
 * happy-path footprint is zero.
 *
 * Single-process only — fine for the demo server. A production rewrite would
 * point this at Redis or a short-TTL DB table.
 */

import { randomBytes } from 'node:crypto'

const DRAFT_TTL_MS = 30 * 60 * 1000
const SWEEP_INTERVAL_MS = 5 * 60 * 1000

export type SignupNameDraft = {
  draftId: string
  firstName: string
  lastName: string
  createdAt: number
  expiresAt: number
}

const drafts = new Map<string, SignupNameDraft>()

function newDraftId(): string {
  /* 24 bytes ≈ 192 bits of entropy in URL-safe form — plenty for a 30-min token. */
  return randomBytes(24).toString('base64url')
}

export function createNameDraft(firstName: string, lastName: string): SignupNameDraft {
  const now = Date.now()
  const draft: SignupNameDraft = {
    draftId: newDraftId(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    createdAt: now,
    expiresAt: now + DRAFT_TTL_MS,
  }
  drafts.set(draft.draftId, draft)
  return draft
}

export function consumeNameDraft(draftId: string): SignupNameDraft | null {
  if (!draftId) return null
  const draft = drafts.get(draftId)
  if (!draft) return null
  if (draft.expiresAt < Date.now()) {
    drafts.delete(draftId)
    return null
  }
  /* Single-use: clear immediately so a complete can't be replayed. */
  drafts.delete(draftId)
  return draft
}

export function peekNameDraft(draftId: string): SignupNameDraft | null {
  if (!draftId) return null
  const draft = drafts.get(draftId)
  if (!draft) return null
  if (draft.expiresAt < Date.now()) {
    drafts.delete(draftId)
    return null
  }
  return draft
}

/* Background sweep — keeps the map from growing unbounded under churn. */
setInterval(() => {
  const now = Date.now()
  for (const [id, d] of drafts) {
    if (d.expiresAt < now) drafts.delete(id)
  }
}, SWEEP_INTERVAL_MS).unref?.()
