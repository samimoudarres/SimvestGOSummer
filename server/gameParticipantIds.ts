import { listUserIdsJoinedGame } from './gameMembershipService'
import { getRuntimeRules } from './gameRuntimeRulesService'
import { listUserIdsWithLedgerForGame } from './userGameStateService'
import { loadAllSetupProfilesByKey } from './userSetupProfileService'

/**
 * Canonical participant list for standings, roster-adjacent APIs, and snapshots.
 *
 * Membership rows can lag or have been trimmed historically; ledger rows and
 * per-game setup profiles are authoritative evidence that someone belongs in
 * this challenge alongside the runtime host id.
 */
export async function listParticipantIdsForGame(gameSlug: string): Promise<string[]> {
  const slug = String(gameSlug ?? '').trim()
  const ids = new Set<string>()
  const rules = await getRuntimeRules(slug)
  if (rules?.hostUserId && rules.hostUserId.length >= 8) ids.add(rules.hostUserId)
  for (const uid of await listUserIdsJoinedGame(slug)) {
    if (uid.length >= 8) ids.add(uid)
  }
  for (const uid of await listUserIdsWithLedgerForGame(slug)) {
    if (uid.length >= 8) ids.add(uid)
  }
  const setups = await loadAllSetupProfilesByKey()
  const suffix = `:::${slug}`
  for (const key of setups.keys()) {
    if (!key.endsWith(suffix)) continue
    const uid = key.slice(0, key.length - suffix.length)
    if (uid.length >= 8) ids.add(uid)
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}
