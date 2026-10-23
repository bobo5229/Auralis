import type { LyricsEditorLine } from '@shared/types/lyricsEditor'

export interface LyricsEditorGroup {
  id: string
  simultaneous: boolean
  lines: LyricsEditorLine[]
}
interface Entry {
  line: LyricsEditorLine
  index: number
}
interface WorkingGroup {
  entries: Entry[]
  ends: [number, number]
}
const compare = (a: Entry, b: Entry) =>
  (a.line.timeSeconds ?? Infinity) - (b.line.timeSeconds ?? Infinity) || a.index - b.index

/** Connected overlaps between opposite solo performers. Touching endpoints do not overlap. */
export function groupSimultaneousLyrics(lines: readonly LyricsEditorLine[]): LyricsEditorGroup[] {
  const ordered = lines.map((line, index) => ({ line, index })).sort(compare)
  const groups = new Set<WorkingGroup>()
  const active: [Set<WorkingGroup>, Set<WorkingGroup>] = [new Set(), new Set()]
  for (const entry of ordered) {
    const { line } = entry
    let group: WorkingGroup = { entries: [entry], ends: [-Infinity, -Infinity] }
    groups.add(group)
    const performer =
      line.assignment === 'performer-1' ? 0 : line.assignment === 'performer-2' ? 1 : null
    const start = line.timeSeconds
    const end = line.endTimeSeconds
    if (
      performer === null ||
      start == null ||
      end == null ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    )
      continue
    group.ends[performer] = end
    const opposite = performer === 0 ? 1 : 0
    const overlapping: WorkingGroup[] = []
    for (const candidate of active[opposite]) {
      if (candidate.ends[opposite] <= start) active[opposite].delete(candidate)
      else overlapping.push(candidate)
    }
    for (const candidate of overlapping) {
      active[0].delete(candidate)
      active[1].delete(candidate)
      // Merge into the larger group to avoid repeatedly copying long lyric sections.
      const larger = candidate.entries.length > group.entries.length ? candidate : group
      const smaller = larger === candidate ? group : candidate
      for (const member of smaller.entries) larger.entries.push(member)
      larger.ends = [
        Math.max(larger.ends[0], smaller.ends[0]),
        Math.max(larger.ends[1], smaller.ends[1]),
      ]
      groups.delete(smaller)
      group = larger
    }
    for (const slot of [0, 1] as const) if (group.ends[slot] > start) active[slot].add(group)
  }
  return [...groups]
    .map((group) => ({ ...group, entries: group.entries.sort(compare) }))
    .sort((a, b) => compare(a.entries[0], b.entries[0]))
    .map((group) => ({
      id: group.entries[0].line.id,
      simultaneous: group.entries.length > 1,
      lines: group.entries.map(({ line }) => line),
    }))
}
