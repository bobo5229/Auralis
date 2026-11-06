import { afterEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowRef, type EffectScope } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { RecentAddedLibraryRange } from '../utils/recentAddedLibrary'
import { useRecentAddedJournal } from './useRecentAddedJournal'

const scopes: EffectScope[] = []
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()))
const now = new Date(2026, 10, 8).getTime()
const rows = (id: number) =>
  [
    {
      id,
      title: String(id),
      album: 'Album',
      artist: 'Artist',
      availability: 'available',
      createdAt: new Date(now - 86400000).toISOString(),
    },
  ] as TrackListItem[]
function setup() {
  const pending: (() => void)[] = []
  const yieldToMain = vi.fn(() => new Promise<void>((resolve) => pending.push(resolve)))
  const tracks = shallowRef(rows(1)),
    range = ref<RecentAddedLibraryRange>('all'),
    active = ref(true)
  const report = vi.fn()
  let clock = 0
  const scope = effectScope()
  scopes.push(scope)
  const state = scope.run(() =>
    useRecentAddedJournal(tracks, range, ref(now), active, report, {
      yieldToMain,
      now: () => clock++,
      chunkBudgetMs: 1,
    }),
  )!
  const settle = async () => {
    while (pending.length) {
      pending.shift()!()
      await new Promise((resolve) => setImmediate(resolve))
    }
    await nextTick()
  }
  return { tracks, range, active, report, scope, state, pending, settle, yieldToMain }
}

it('publishes one complete view and preserves it during a background rebuild', async () => {
  const s = setup()
  expect(s.state.loaded.value).toBe(false)
  expect(s.state.journal.value).toEqual([])
  await s.settle()
  const first = s.state.journal.value
  expect(first[0].albums[0].tracks[0].id).toBe(1)
  s.tracks.value = rows(2)
  expect(s.state.isBuilding.value).toBe(true)
  expect(s.state.journal.value).toBe(first)
  await s.settle()
  expect(s.state.journal.value[0].albums[0].tracks[0].id).toBe(2)
  expect(s.state.loaded.value).toBe(true)
  expect(s.state.isBuilding.value).toBe(false)
})
it('discards superseded tracks, range changes and work completed after leaving', async () => {
  const s = setup()
  s.tracks.value = rows(2)
  s.range.value = 7
  s.tracks.value = rows(3)
  await s.settle()
  expect(s.state.journal.value[0].albums[0].tracks.map((t) => t.id)).toEqual([3])
  s.tracks.value = rows(4)
  s.active.value = false
  await s.settle()
  expect(s.state.journal.value[0].albums[0].tracks[0].id).toBe(3)
  expect(s.report).not.toHaveBeenCalled()
  s.active.value = true
  await s.settle()
  expect(s.state.journal.value[0].albums[0].tracks[0].id).toBe(4)
})
it('ends pending work on disposal and reports actual build failures', async () => {
  const s = setup()
  s.scope.stop()
  await s.settle()
  expect(s.state.loaded.value).toBe(false)
  const failure = new Error('scheduler failed')
  const other = setup()
  other.yieldToMain.mockRejectedValueOnce(failure)
  other.tracks.value = rows(5)
  await other.settle()
  expect(other.state.error.value).toBe(failure)
  expect(other.report).toHaveBeenCalledExactlyOnceWith(failure)
  expect(other.state.isBuilding.value).toBe(false)
})
