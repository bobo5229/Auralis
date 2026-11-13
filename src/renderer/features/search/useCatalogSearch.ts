import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '@shared/types/albumSummary'
import { getAlbumCatalogIndex } from '@renderer/shared/catalog/albumCatalogIndex'
import { createDisplaySearchKeys } from '@renderer/shared/search/displaySearchKeys'
import { normalizeSearchText } from '@renderer/shared/search/normalizeSearchText'
import { createLibrarySearchIndexIncrementally } from '@renderer/features/library/utils/librarySearchIndex'
import type { LibrarySearchRecord } from '@renderer/features/library/utils/librarySearchScan'

export function matchesCatalogRecord(record: LibrarySearchRecord, query: string): boolean {
  return [record.title, record.artist, record.albumArtist, record.album,
    ...record.artistParts, ...record.albumArtistParts, ...(record.displayAliases ?? [])]
    .some((key) => key.includes(query))
}

export function useCatalogSearch(tracks: Readonly<Ref<TrackListItem[]>>, query: Ref<string>) {
  const songs = shallowRef<TrackListItem[]>([])
  const albums = shallowRef<AlbumSummary[]>([])
  const busy = ref(false)
  const failed = ref(false)
  let generation = 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let indexedTracks: TrackListItem[] | null = null
  let records: readonly LibrarySearchRecord[] = []
  let albumRecords: { album: AlbumSummary; keys: readonly string[] }[] = []
  const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

  async function run(): Promise<void> {
    const revision = ++generation
    const source = tracks.value
    const normalized = normalizeSearchText(query.value.trim())
    const current = () => !disposed && generation === revision && source === tracks.value
    songs.value = []
    albums.value = []
    failed.value = false
    busy.value = !!normalized
    if (!normalized) return
    try {
      if (indexedTracks !== source) {
        const nextRecords = await createLibrarySearchIndexIncrementally(source, { isCurrent: current })
        const nextAlbums: typeof albumRecords = []
        const catalog = getAlbumCatalogIndex(source)
        for (let i = 0; i < catalog.albums.length; i++) {
          if (i % 128 === 0) { await yieldTask(); if (!current()) return }
          const album = catalog.albums[i]
          nextAlbums.push({ album, keys: [
            ...createDisplaySearchKeys(album.title),
            ...createDisplaySearchKeys(album.albumArtist, true),
            ...createDisplaySearchKeys(album.indexArtist, true),
          ] })
        }
        if (!current()) return
        records = nextRecords
        albumRecords = nextAlbums
        indexedTracks = source
      }
      const foundSongs: TrackListItem[] = []
      const foundAlbums: AlbumSummary[] = []
      for (let i = 0; i < records.length; i++) {
        if (i % 512 === 0) { await yieldTask(); if (!current()) return }
        if (matchesCatalogRecord(records[i], normalized)) foundSongs.push(source[i])
      }
      for (let i = 0; i < albumRecords.length; i++) {
        if (i % 512 === 0) { await yieldTask(); if (!current()) return }
        if (albumRecords[i].keys.some((key) => key.includes(normalized)))
          foundAlbums.push(albumRecords[i].album)
      }
      if (current()) { songs.value = foundSongs; albums.value = foundAlbums }
    } catch {
      if (current()) failed.value = true
    } finally {
      if (current()) busy.value = false
    }
  }
  watch([tracks, query], () => {
    generation++
    clearTimeout(timer)
    songs.value = []
    albums.value = []
    busy.value = !!query.value.trim()
    timer = setTimeout(() => void run(), 160)
  }, { immediate: true })
  onScopeDispose(() => { disposed = true; generation++; clearTimeout(timer) })
  return { songs, albums, busy, failed, retry: run }
}
