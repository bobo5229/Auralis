import { expect, it } from 'vitest'
import type { LyricsAssignment, LyricsEditorLine } from '@shared/types/lyricsEditor'
import { groupSimultaneousLyrics } from './groupSimultaneousLyrics'

const line = (
  id: string,
  assignment: LyricsAssignment,
  start: number,
  end?: number,
): LyricsEditorLine => ({
  id,
  assignment,
  text: id,
  timeSeconds: start,
  endTimeSeconds: end ?? null,
  editable: true,
})
const summary = (lines: LyricsEditorLine[]) =>
  groupSimultaneousLyrics(lines).map((group) => ({
    simultaneous: group.simultaneous,
    ids: group.lines.map(({ id }) => id),
  }))

it('groups opposite performers with different start times and retains each independent identity', () => {
  expect(summary([line('b', 'performer-2', 1.5, 3), line('a', 'performer-1', 1, 2)])).toEqual([
    { simultaneous: true, ids: ['a', 'b'] },
  ])
})

it('keeps touching endpoints, same-performer overlaps, chorus and missing endpoints separate', () => {
  for (const lines of [
    [line('a', 'performer-1', 1, 2), line('b', 'performer-2', 2, 3)],
    [line('a', 'performer-1', 1, 3), line('b', 'performer-1', 2, 4)],
    [line('a', 'together', 1, 3), line('b', 'performer-2', 2, 4)],
    [line('a', 'performer-1', 1), line('b', 'performer-2', 2, 4)],
    [line('a', 'performer-1', 1, 1), line('b', 'performer-2', 1, 4)],
  ])
    expect(summary(lines)).toEqual([
      { simultaneous: false, ids: ['a'] },
      { simultaneous: false, ids: ['b'] },
    ])
})

it('connects chained cross-performer overlaps without merging separate groups through same-performer overlaps', () => {
  expect(
    summary([
      line('a', 'performer-1', 0, 5),
      line('c', 'performer-1', 4, 10),
      line('b', 'performer-2', 1, 2),
      line('d', 'performer-2', 9, 11),
    ]),
  ).toEqual([
    { simultaneous: true, ids: ['a', 'b'] },
    { simultaneous: true, ids: ['c', 'd'] },
  ])
  expect(
    summary([
      line('a', 'performer-1', 0, 2),
      line('c', 'performer-1', 3, 5),
      line('b', 'performer-2', 1, 4),
    ]),
  ).toEqual([{ simultaneous: true, ids: ['a', 'b', 'c'] }])
})

it('preserves same-time order and puts every row in exactly one group', () => {
  const lines = Array.from({ length: 500 }, (_, index) =>
    line(`line-${index}`, index % 2 ? 'performer-1' : 'performer-2', 1, 3),
  )
  const groups = groupSimultaneousLyrics(lines)
  expect(groups).toHaveLength(1)
  expect(groups[0].lines.map(({ id }) => id)).toEqual(lines.map(({ id }) => id))
  expect(new Set(groups.flatMap((group) => group.lines.map(({ id }) => id))).size).toBe(
    lines.length,
  )
})
