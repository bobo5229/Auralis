import { effectScope, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { AnnualSummary } from '@shared/types/listeningArchive'
import type { AuralisApi } from '@shared/ipc/api'
import { useAnnualSummaryActions } from './useAnnualSummaryActions'
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
function fixture() {
  const scope = effectScope()
  const selection = [
    {
      id: 1,
      title: 'One',
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Artist',
      durationSeconds: 180,
      artworkCacheKey: null,
    },
  ]
  const summary = ref({ year: 2026, selection } as AnnualSummary)
  const create = vi.fn(async () => ({ id: 7 }))
  const rename = vi.fn(async () => ({ id: 7 }))
  const addTracks = vi.fn(async () => ({
    playlistExists: true,
    addedCount: 1,
    unavailableCount: 0,
    alreadyPresentCount: 0,
  }))
  const playTrackFromQueue = vi.fn(async () => {})
  const actions = scope.run(() =>
    useAnnualSummaryActions(
      summary,
      { create, rename, addTracks } as unknown as AuralisApi['playlists'],
      { playTrackFromQueue },
      (year) => `${year} selection`,
    ),
  )!
  return {
    scope,
    summary,
    selection,
    create,
    rename,
    addTracks,
    playTrackFromQueue,
    actions,
  }
}
describe('annual selection actions', () => {
  it('hands the selection to shared playback and saves its exact order, once', async () => {
    const f = fixture()
    await f.actions.play(f.selection)
    expect(f.playTrackFromQueue).toHaveBeenCalledExactlyOnceWith(f.selection, 1, {
      shufflePool: f.selection,
    })
    await f.actions.save()
    await f.actions.save()
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.rename).toHaveBeenCalledExactlyOnceWith(7, '2026 selection')
    expect(f.addTracks).toHaveBeenCalledExactlyOnceWith(7, [1])
    expect(f.actions.savedPlaylistId.value).toBe(7)
    f.scope.stop()
  })
  it('retries the same draft after a partial failure and reports tracks that disappeared', async () => {
    const f = fixture()
    f.addTracks.mockRejectedValueOnce(new Error('failed'))
    await f.actions.save()
    expect(f.actions.actionError.value).toBe('save')
    f.addTracks.mockResolvedValueOnce({
      playlistExists: true,
      addedCount: 0,
      unavailableCount: 1,
      alreadyPresentCount: 0,
    })
    await f.actions.save()
    expect(f.create).toHaveBeenCalledOnce()
    expect(f.actions.savedPlaylistId.value).toBe(7)
    expect(f.actions.unavailableCount.value).toBe(1)
    f.scope.stop()
  })
  it('keeps an in-flight save attached to its original year', async () => {
    const f = fixture()
    let resolve!: (value: { id: number }) => void
    f.create.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = f.actions.save()
    f.summary.value = { ...f.summary.value, year: 2025 }
    resolve({ id: 7 })
    await pending
    expect(f.rename).toHaveBeenCalledWith(7, '2026 selection')
    expect(f.actions.savedPlaylistId.value).toBeNull()
    f.scope.stop()
  })
})
