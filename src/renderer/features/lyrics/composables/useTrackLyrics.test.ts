import { afterEach, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { LibraryChangedEvent } from '@shared/types/libraryEvents'

const mocks = vi.hoisted(() => ({
  getByTrackId: vi.fn(),
  onChanged: vi.fn<(listener: (event: LibraryChangedEvent) => void) => () => void>(() => () => {}),
  usePlayback: vi.fn(),
}))

vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: {
    lyrics: { getByTrackId: mocks.getByTrackId },
    library: { onChanged: mocks.onChanged },
  },
}))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: mocks.usePlayback,
}))

afterEach(() => vi.restoreAllMocks())

it('protects shared lyrics deeply while playback and library changes still update every consumer', async () => {
  const playback = reactive({ currentTrackId: 1 as number | null, currentTime: 0 })
  mocks.usePlayback.mockReturnValue({ state: playback })
  const original = '[00:01.00]<00:01.00>Hello <00:02.00>world\n[00:04.00]Next'
  mocks.getByTrackId.mockResolvedValue({ lyricsText: original, lyricsFormat: 'lrc' })
  const { useTrackLyrics } = await import('./useTrackLyrics')
  await nextTick()
  const state = useTrackLyrics()
  const other = useTrackLyrics()
  expect(state.status.value).toBe('lrc')
  expect(state.parsedLines.value).toHaveLength(2)
  expect(state.parsedLines.value[0].segments).toHaveLength(2)
  expect(mocks.getByTrackId).toHaveBeenCalledExactlyOnceWith(1)
  expect(mocks.onChanged).toHaveBeenCalledTimes(1)

  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  // @ts-expect-error Public status is read-only.
  state.status.value = 'empty'
  // @ts-expect-error Public failure state is read-only.
  state.loadFailed.value = true
  // @ts-expect-error Public source text is read-only.
  state.rawLyrics.value = 'Changed outside owner'
  // @ts-expect-error Public arrays cannot be replaced.
  state.parsedLines.value = []
  // @ts-expect-error Public arrays cannot be mutated.
  state.parsedLines.value.push({ id: 'injected', timeSeconds: 0, text: 'Injected' })
  // @ts-expect-error Public lyric lines are deeply read-only.
  state.parsedLines.value[0].text = 'Changed outside owner'
  // @ts-expect-error Public word segments are deeply read-only.
  state.parsedLines.value[0].segments![0].text = 'Changed outside owner'
  warning.mockRestore()
  expect(other.status.value).toBe('lrc')
  expect(other.loadFailed.value).toBe(false)
  expect(other.rawLyrics.value).toBe(original)
  expect(other.parsedLines.value).toHaveLength(2)
  expect(other.parsedLines.value[0].text).toBe('Hello world')
  expect(other.parsedLines.value[0].segments![0].text).toBe('Hello ')

  playback.currentTime = 4
  expect(other.activeIndex.value).toBe(1)
  mocks.getByTrackId.mockResolvedValue({ lyricsText: 'Refreshed', lyricsFormat: 'plain' })
  mocks.onChanged.mock.calls[0][0]({ reason: 'metadata-refresh', trackIds: [1], filePaths: [] })
  await nextTick()
  expect(other.status.value).toBe('plain')
  expect(other.rawLyrics.value).toBe('Refreshed')
  expect(other.parsedLines.value).toEqual([])

  playback.currentTrackId = null
  await nextTick()
  expect(other.status.value).toBe('no-track')
  expect(other.rawLyrics.value).toBeNull()
})
