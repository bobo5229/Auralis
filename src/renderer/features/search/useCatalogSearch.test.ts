import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowRef } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { useCatalogSearch } from './useCatalogSearch'

const track = (id: number, patch: Partial<TrackListItem> = {}): TrackListItem => ({
  id, title: `Song ${id}`, artist: 'Artist', albumArtist: 'Artist', album: 'Album',
  trackNo: id, discNo: 1, releaseDate: null, copyright: null, composer: null,
  bitrateBps: null, durationSeconds: 180, artworkCacheKey: null, genre: null,
  availability: 'available', playCount: 0, lastPlayedAt: null, createdAt: '2026-01-01', ...patch,
})
let scope: ReturnType<typeof effectScope>
beforeEach(() => { vi.useFakeTimers(); scope = effectScope() })
afterEach(() => { scope.stop(); vi.useRealTimers() })
function setup(source: TrackListItem[], text: string) {
  const tracks = shallowRef(source)
  const query = ref(text)
  const search = scope.run(() => useCatalogSearch(tracks, query))!
  return { ...search, tracks, query }
}
async function settle() { await nextTick(); await vi.runAllTimersAsync(); await nextTick() }

it('does not search or return the entire catalog for blank input', async () => {
  const result = setup([track(1)], '  ')
  await settle()
  expect(result.songs.value).toEqual([])
  expect(result.albums.value).toEqual([])
  expect(result.busy.value).toBe(false)
})
it('matches substrings, case and displayed Chinese scripts without altering metadata', async () => {
  const result = setup([track(1, { title: '夜曲回憶', album: 'A', artist: 'Singer' }), track(2, { title: 'Keep Going', album: 'B' })], '回忆')
  await settle()
  expect(result.songs.value.map((song) => song.id)).toEqual([1])
  expect(result.songs.value[0].title).toBe('夜曲回憶')
  result.query.value = 'GOING'
  await settle()
  expect(result.songs.value.map((song) => song.id)).toEqual([2])
})
it('matches album artists in both categories and keeps same-name albums separate', async () => {
  const result = setup([track(1, { albumArtist: 'Alpha', artist: 'Guest' }), track(2, { albumArtist: 'Beta' })], 'Album')
  await settle()
  expect(result.albums.value).toHaveLength(2)
  result.query.value = 'alpha'
  await settle()
  expect(result.albums.value.map((album) => album.albumArtist)).toEqual(['Alpha'])
  expect(result.songs.value.map((song) => song.id)).toEqual([1])
})
it('commits only the latest query and latest snapshot', async () => {
  const result = setup([track(1)], 'Song 1')
  await nextTick()
  await vi.advanceTimersByTimeAsync(160)
  result.query.value = 'replacement'
  result.tracks.value = [track(2, { title: 'replacement' })]
  await settle()
  expect(result.songs.value.map((song) => song.id)).toEqual([2])
  result.query.value = 'missing'
  await settle()
  expect(result.songs.value).toEqual([])
})
it('keeps all matching results for playback and category pagination', async () => {
  const result = setup(Array.from({ length: 120 }, (_, i) => track(i + 1)), 'Song')
  await settle()
  expect(result.songs.value).toHaveLength(120)
  expect(result.songs.value.at(-1)?.id).toBe(120)
})
it('cancels pending work when the page scope leaves', async () => {
  const result = setup([track(1)], 'Song')
  scope.stop()
  await settle()
  expect(result.songs.value).toEqual([])
})
