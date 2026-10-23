import type { MpvClient } from './mpvClient'

const FILTER_LABEL = 'auralis-soft-transition'

/** Initial --start seeking drops queued device audio. Trim decoded input instead,
 * preserving its original timestamps and the bridge's buffered tail.
 */
export function softTransitionContinuationOptions(position: number): { af: string } {
  return { af: `@${FILTER_LABEL}:lavfi=[atrim=start=${position}]` }
}

/** A user seek may return to the intro previously consumed by the bridge. */
export async function clearSoftTransitionContinuation(
  client: MpvClient,
  isCurrent: () => boolean,
): Promise<void> {
  const filters = await client.command('get_property', 'af')
  if (!isCurrent()) return
  if (
    Array.isArray(filters) &&
    filters.some(
      (filter: unknown) =>
        filter !== null &&
        typeof filter === 'object' &&
        'label' in filter &&
        filter.label === FILTER_LABEL,
    )
  )
    await client.command('af', 'remove', `@${FILTER_LABEL}`)
}
