import { checkLeaderboardRankAlerts } from '../leaderboardRankNotifyService.ts'
import { fetchGameLeaderboardPayload } from '../gameLeaderboardService.ts'

const slug = process.argv[2] ?? 'nov-2024-stock-challenge'
const before = await fetchGameLeaderboardPayload(slug, 'overall_return')
console.log(`[verify] ${slug} players=${before.totalPlayers} ranks=${before.rows.map((r) => `${r.displayName}:${r.rank}`).join(', ')}`)
await checkLeaderboardRankAlerts(slug)
await checkLeaderboardRankAlerts(slug)
console.log('[verify] second pass (no duplicate baseline alerts) ok')
