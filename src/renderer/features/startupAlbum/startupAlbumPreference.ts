import { readonly, ref } from 'vue'
import {
  STARTUP_ALBUM_HISTORY_LIMIT,
  type StartupAlbumKey,
  type StartupAlbumHistory,
} from '@shared/types/startupAlbum'

export const STARTUP_ALBUM_ENABLED_KEY = 'auralis-startup-album-enabled'
export const LAST_STARTUP_ALBUM_KEY = 'auralis-last-startup-album'
export const STARTUP_ALBUM_HISTORY_KEY = 'auralis-startup-album-history'
export type AlbumKey = StartupAlbumKey
export function startupAlbumStorage(): Storage | undefined {
  try {
    return localStorage
  } catch {
    return undefined
  }
}

export function readStartupAlbumEnabled(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(STARTUP_ALBUM_ENABLED_KEY) !== 'false'
  } catch {
    return true
  }
}
export function readLastStartupAlbum(
  storage: Pick<Storage, 'getItem'> | undefined,
): AlbumKey | undefined {
  try {
    const value: unknown = JSON.parse(storage?.getItem(LAST_STARTUP_ALBUM_KEY) ?? 'null')
    if (
      value &&
      typeof value === 'object' &&
      'albumArtist' in value &&
      'album' in value &&
      typeof value.albumArtist === 'string' &&
      typeof value.album === 'string' &&
      value.albumArtist.length <= 8192 &&
      value.album.length <= 8192
    ) {
      return { albumArtist: value.albumArtist, album: value.album }
    }
  } catch {
    /* An unavailable or stale preference must not block startup. */
  }
  return undefined
}
export function rememberStartupAlbum(
  storage: (Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem'>>) | undefined,
  album: AlbumKey,
): void {
  try {
    // Callers may pass an album result containing tracks and local file paths.
    // Persist the identity explicitly at this boundary, including the legacy key.
    const identity: AlbumKey = { albumArtist: album.albumArtist, album: album.album }
    const history = storage?.getItem
      ? readStartupAlbumHistory({ getItem: storage.getItem.bind(storage) })
      : []
    const previous = history.filter(
      (entry) => entry.albumArtist !== album.albumArtist || entry.album !== album.album,
    )
    storage?.setItem(
      STARTUP_ALBUM_HISTORY_KEY,
      JSON.stringify([identity, ...previous].slice(0, STARTUP_ALBUM_HISTORY_LIMIT)),
    )
    // Retained for older app versions and migration from their single-entry preference.
    storage?.setItem(LAST_STARTUP_ALBUM_KEY, JSON.stringify(identity))
  } catch {
    /* Session remains usable. */
  }
}
export function readStartupAlbumHistory(
  storage: Pick<Storage, 'getItem'> | undefined,
): StartupAlbumHistory {
  try {
    const value: unknown = JSON.parse(storage?.getItem(STARTUP_ALBUM_HISTORY_KEY) ?? 'null')
    if (Array.isArray(value)) {
      const result: StartupAlbumHistory = []
      for (const item of value.slice(0, STARTUP_ALBUM_HISTORY_LIMIT)) {
        if (
          item &&
          typeof item === 'object' &&
          typeof item.albumArtist === 'string' &&
          typeof item.album === 'string' &&
          item.albumArtist.length <= 8192 &&
          item.album.length <= 8192 &&
          !result.some(
            (entry) => entry.albumArtist === item.albumArtist && entry.album === item.album,
          )
        ) {
          result.push({ albumArtist: item.albumArtist, album: item.album })
        }
      }
      if (result.length) return result
    }
  } catch {
    /* Recover from unavailable or stale local preferences. */
  }
  const previous = readLastStartupAlbum(storage)
  return previous ? [previous] : []
}
const enabled = ref(readStartupAlbumEnabled(startupAlbumStorage()))
const persistFailed = ref(false)
export function useStartupAlbumPreference() {
  return {
    enabled: readonly(enabled),
    persistFailed: readonly(persistFailed),
    setEnabled(value: boolean) {
      enabled.value = value
      try {
        localStorage.setItem(STARTUP_ALBUM_ENABLED_KEY, String(value))
        persistFailed.value = false
      } catch {
        persistFailed.value = true
      }
    },
  }
}
