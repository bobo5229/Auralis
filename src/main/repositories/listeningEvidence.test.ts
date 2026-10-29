import { expect, it } from 'vitest'
import { mergeListeningIntervals, sampleDailySeconds } from './listeningEvidence'
it('unions repeated, overlapping and adjacent content without inventing unheard sections', () => {
  expect(
    mergeListeningIntervals([
      [0, 50],
      [0, 50],
      [45, 60],
      [80, 90],
    ]),
  ).toEqual([
    [0, 60],
    [80, 90],
  ])
})
it('splits actual time across local midnight', () => {
  const started = new Date(2026, 9, 28, 23, 59, 59)
  expect(
    sampleDailySeconds({
      startedAtIso: started.toISOString(),
      startSeconds: 0,
      endSeconds: 2,
      playedSeconds: 2,
    }),
  ).toEqual([
    ['2026-10-28', 1],
    ['2026-10-29', 1],
  ])
})
