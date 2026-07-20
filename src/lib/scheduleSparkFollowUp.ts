/**
 * After a cold list paint (sync top-N sparks), silently re-pull so background
 * bar enrich / spark cache can fill the remaining curves without a loading flash.
 */
export function scheduleSparkFollowUp(refresh: () => void): () => void {
  const t1 = window.setTimeout(refresh, 900)
  const t2 = window.setTimeout(refresh, 2400)
  return () => {
    window.clearTimeout(t1)
    window.clearTimeout(t2)
  }
}
