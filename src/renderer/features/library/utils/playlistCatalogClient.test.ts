import { describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { Playlist } from '@shared/types/playlist'
import type { PlaylistMembership } from '@shared/types/playlistMembership'
import { SharedLibraryCatalogLoad } from './sharedLibraryCatalogLoad'
import { PlaylistCatalogClient } from './playlistCatalogClient'

const playlist = { id: 1, name: 'Ordered', viewMode: 'flat' } as Playlist
function setup() {
  let revision = '1'
  let rows = [
    { id: 1, title: 'One' },
    { id: 2, title: 'Two' },
  ] as TrackListItem[]
  let ids = [2, 1]
  const page = vi.fn(async () => ({
    snapshotId: revision,
    libraryRevision: revision,
    totalTracks: rows.length,
    tracks: rows,
    nextCursor: null,
    diagnostics: { snapshotBuildMs: 0, pageSliceMs: 0 },
  }))
  const catalog = new SharedLibraryCatalogLoad(page)
  const membership = vi.fn(
    async (): Promise<PlaylistMembership<Playlist> | null> => ({
      playlist,
      trackIds: ids,
      libraryRevision: revision,
    }),
  )
  const client = new PlaylistCatalogClient(catalog, { playlist: membership, smart: vi.fn() })
  return {
    client,
    catalog,
    membership,
    page,
    change: () => {
      revision = '2'
      rows = [{ id: 2, title: 'Updated' }] as TrackListItem[]
      ids = [2]
    },
    reorder: () => {
      ids = [1, 2]
    },
  }
}

describe('playlist catalog membership', () => {
  it('uses the already loaded catalog, retains ordering and reuses immutable presentation on return', async () => {
    const state = setup()
    await state.catalog.load(() => true)
    const first = await state.client.getPlaylistDetail(1)
    const next = await state.client.getPlaylistDetail(1)
    expect(first!.tracks.map((t) => t.id)).toEqual([2, 1])
    expect(next!.tracks).toBe(first!.tracks)
    expect(Object.isFrozen(first!.tracks)).toBe(true)
    expect(state.page).toHaveBeenCalledOnce()
    expect(state.membership).toHaveBeenCalledTimes(2)
  })
  it('refreshes changed metadata and membership and observes reorder without a catalog reload', async () => {
    const state = setup()
    const first = await state.client.getPlaylistDetail(1)
    state.reorder()
    const reordered = await state.client.getPlaylistDetail(1)
    expect(reordered!.tracks.map((t) => t.id)).toEqual([1, 2])
    expect(reordered!.tracks).not.toBe(first!.tracks)
    expect(state.page).toHaveBeenCalledOnce()
    state.change()
    expect((await state.client.getPlaylistDetail(1))!.tracks).toEqual([{ id: 2, title: 'Updated' }])
    expect(state.page).toHaveBeenCalledTimes(2)
  })
  it('re-reads membership if the catalog advanced while loading and handles deleted playlists', async () => {
    const state = setup()
    const old = await state.membership()
    state.change()
    state.membership.mockResolvedValueOnce(old)
    const result = await state.client.getPlaylistDetail(1)
    expect(result!.tracks).toEqual([{ id: 2, title: 'Updated' }])
    expect(state.membership).toHaveBeenCalledTimes(3)
    state.membership.mockResolvedValueOnce(null)
    expect(await state.client.getPlaylistDetail(1)).toBeNull()
  })
  it('fails instead of silently dropping members absent from the matching catalog', async () => {
    const state = setup()
    state.membership.mockResolvedValueOnce({ playlist, trackIds: [999], libraryRevision: '1' })
    await expect(state.client.getPlaylistDetail(1)).rejects.toThrow('missing')
  })
})
