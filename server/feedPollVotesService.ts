import fs from 'node:fs/promises'
import { dataFilePath } from './dataDir.ts'
import { invalidateJsonFileCache, readJsonWithMtimeCache } from './jsonFileCache'

const VOTES_PATH = dataFilePath('feed-poll-votes.json')

type VotesFile = { votes: Record<string, string> }

function key(postId: string, userId: string): string {
  return `${postId}:::${userId}`
}

async function readFile(): Promise<VotesFile> {
  return readJsonWithMtimeCache<VotesFile>(VOTES_PATH, (raw) => {
    if (!raw) return { votes: {} }
    try {
      const parsed = JSON.parse(raw) as VotesFile
      if (parsed && parsed.votes && typeof parsed.votes === 'object') return parsed
    } catch {
      /* corrupt — fall through */
    }
    return { votes: {} }
  })
}

async function writeFile(data: VotesFile): Promise<void> {
  await fs.mkdir(path.dirname(VOTES_PATH), { recursive: true })
  await fs.writeFile(VOTES_PATH, JSON.stringify(data, null, 2), 'utf8')
  invalidateJsonFileCache(VOTES_PATH)
}

// Hot path: every feed hydration calls this; return the cached object directly (read-only view).
export async function loadAllPollVotes(): Promise<Record<string, string>> {
  const { votes } = await readFile()
  return votes
}

export function tallyPollFromMap(
  votesMap: Record<string, string>,
  postId: string,
  optionIds: string[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const id of optionIds) counts[id] = 0
  const prefix = `${postId}:::`
  for (const [k, optionId] of Object.entries(votesMap)) {
    if (!k.startsWith(prefix)) continue
    if (counts[optionId] === undefined) continue
    counts[optionId]!++
  }
  return counts
}

export function getPollVoteFromMap(
  votesMap: Record<string, string>,
  postId: string,
  userId: string,
): string | null {
  if (!postId || !userId || userId.length < 8) return null
  const v = votesMap[key(postId, userId)]
  return typeof v === 'string' && v.length > 0 ? v : null
}

export async function getPollVote(postId: string, userId: string): Promise<string | null> {
  const m = await loadAllPollVotes()
  return getPollVoteFromMap(m, postId, userId)
}

export async function getPollTallies(postId: string, optionIds: string[]): Promise<Record<string, number>> {
  const m = await loadAllPollVotes()
  return tallyPollFromMap(m, postId, optionIds)
}

export async function castPollVote(
  postId: string,
  userId: string,
  optionId: string,
  validOptionIds: Set<string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!postId || !userId || userId.length < 8) return { ok: false, error: 'Invalid request' }
  if (!validOptionIds.has(optionId)) return { ok: false, error: 'Invalid option' }
  const cached = await readFile()
  const k = key(postId, userId)
  if (cached.votes[k]) return { ok: false, error: 'You already voted on this poll' }
  const next: VotesFile = { votes: { ...cached.votes, [k]: optionId } }
  await writeFile(next)
  return { ok: true }
}
