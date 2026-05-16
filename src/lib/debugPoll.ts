/** Set `localStorage.setItem('SIMVEST_DEBUG_POLL', '1')` then reload to log failed background polls. */
export function isSimvestPollDebugEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('SIMVEST_DEBUG_POLL') === '1'
  } catch {
    return false
  }
}
