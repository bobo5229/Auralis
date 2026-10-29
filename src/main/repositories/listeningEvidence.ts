import type { ListeningSample } from '@shared/types/listeningEvidence'
export type ListeningInterval = [number, number]
export function mergeListeningIntervals(intervals: ListeningInterval[]): ListeningInterval[] {
  const merged: ListeningInterval[] = []
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue
    const previous = merged.at(-1)
    if (previous && start <= previous[1] + 0.001) previous[1] = Math.max(previous[1], end)
    else merged.push([start, end])
  }
  return merged
}
/** Split real elapsed time at local midnight, including DST-length days. */
export function sampleDailySeconds(sample: ListeningSample): Array<[string, number]> {
  const result: Array<[string, number]> = []
  let start = Date.parse(sample.startedAtIso)
  const end = start + sample.playedSeconds * 1000
  while (start < end) {
    const date = new Date(start)
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
    const stop = Math.min(next, end)
    result.push([day, (stop - start) / 1000])
    start = stop
  }
  return result
}
