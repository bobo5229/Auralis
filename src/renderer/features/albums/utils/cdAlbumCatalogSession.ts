import type { AuralisApi } from '@shared/ipc/api'
import type { AlbumSummary } from '../types'
import { groupAlbums } from './albumGrouping'

type CatalogLibrary = Pick<AuralisApi['library'], 'getTracks' | 'onChanged'>

/** One album snapshot for both CD views while the user stays in the CD area. */
export function createCdAlbumCatalogSession(library: CatalogLibrary) {
  let albums: AlbumSummary[] | null = null
  let pending: Promise<AlbumSummary[]> | null = null
  let revision = 0
  let session = 0
  let unsubscribe: (() => void) | null = null
  const listeners = new Set<() => void>()

  function ensureSubscription(): void {
    if (unsubscribe) return
    unsubscribe = library.onChanged((event) => {
      if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
      revision += 1
      albums = null
      for (const listener of listeners) listener()
    })
  }

  async function load(): Promise<AlbumSummary[]> {
    ensureSubscription()
    if (albums) return albums
    if (pending) return pending

    const currentSession = session
    const request = (async () => {
      while (true) {
        const requestRevision = revision
        let tracks: Awaited<ReturnType<CatalogLibrary['getTracks']>>
        try {
          tracks = await library.getTracks()
        } catch (error) {
          if (currentSession !== session) return []
          if (requestRevision !== revision) continue
          throw error
        }
        if (currentSession !== session) return []
        if (requestRevision !== revision) continue
        albums = groupAlbums(tracks)
        return albums
      }
    })()
    pending = request
    try {
      return await request
    } finally {
      if (pending === request) pending = null
    }
  }

  function subscribe(listener: () => void): () => void {
    ensureSubscription()
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function clear(): void {
    session += 1
    revision += 1
    albums = null
    pending = null
    unsubscribe?.()
    unsubscribe = null
    listeners.clear()
  }

  return { load, subscribe, clear }
}
