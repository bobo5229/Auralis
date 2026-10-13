import type { AuralisApi } from '@shared/ipc/api'
import { isWindowCloseBehavior, type WindowCloseBehavior } from '@shared/types/windowBehavior'

let previewCloseBehavior: WindowCloseBehavior = 'quit'

const emptyTrackPage = {
  snapshotId: 'browser-preview',
  totalTracks: 0,
  tracks: [],
  nextCursor: null,
  diagnostics: {
    snapshotBuildMs: null,
    pageSliceMs: 0,
  },
}

function mockResponse(group: string, method: string, args: unknown[]): unknown {
  switch (`${group}.${method}`) {
    case 'app.getInfo':
      return { name: 'Auralis', version: 'Browser preview', databasePath: 'Browser preview' }
    case 'app.claimCdStartupEntry':
      return { firstEntry: false }
    case 'library.getStats':
      return { trackCount: 0, albumCount: 0 }
    case 'library.getTrackPage':
      return emptyTrackPage
    case 'library.selectRoot':
      return { canceled: true }
    case 'library.getScanStatus':
      return null
    case 'library.startScan':
      return { jobId: 0 }
    case 'library.cancelScan':
      return { ok: false }
    case 'playback.nativeAvailability':
      return { available: false, reason: 'Unavailable in browser preview' }
    case 'playback.subscribeSpectrum':
    case 'playback.nativeCommand':
      return { accepted: false }
    case 'playback.getAudioUrl':
    case 'playback.getRandomTrack':
    case 'playback.getRandomAlbumTracks':
    case 'playback.getAlbumTracks':
    case 'lyrics.getByTrackId':
    case 'metadata.getTrackMetadata':
    case 'metadata.getRefreshStatus':
    case 'smartPlaylists.getDetail':
    case 'playlists.getDetail':
      return null
    case 'lyrics.openLrcEditor':
    case 'lyrics.saveLrcEditor':
      return { ok: false, code: 'track-unavailable' }
    case 'lyrics.closeLrcEditor':
      return { ok: true, value: null }
    case 'playback.recordEffectivePlay':
      return { ok: false, recorded: false }
    case 'archive.getAnnualPlayCounts':
    case 'archive.getDayTopTracks':
      return []
    case 'playback.acquireReadLease':
      return { leaseId: 'browser-preview' }
    case 'playback.releaseReadLease':
      return { ok: true }
    case 'window.control':
    case 'window.getMaximized':
      return { isMaximized: false }
    case 'window.getVisibility':
      return { isVisible: true }
    case 'window.getCloseBehavior':
      return { behavior: previewCloseBehavior, trayAvailable: false }
    case 'window.setCloseBehavior':
      if (!isWindowCloseBehavior(args[0]) || args[0] === 'tray')
        throw new Error('Unavailable in browser preview')
      previewCloseBehavior = args[0]
      return { behavior: previewCloseBehavior, trayAvailable: false }
    case 'database.exportBackup':
    case 'database.restoreBackup':
      return { status: 'cancelled' }
    case 'app.claimStartupAlbum':
      return { album: null }
    case 'app.setLocale':
      return undefined
  }

  if (
    method.startsWith('list') ||
    ['getRoots', 'getTracks', 'getTrackCounts', 'listRefreshFailures'].includes(method)
  ) {
    return []
  }

  return {}
}

function createGroup(group: string): Record<PropertyKey, unknown> {
  return new Proxy(Object.create(null) as Record<PropertyKey, unknown>, {
    get(_target, method) {
      if (typeof method !== 'string') return undefined
      return (...args: unknown[]) => {
        if (method.startsWith('on')) return () => undefined
        if (
          (group === 'app' && ['rendererReady', 'splashReady'].includes(method)) ||
          (group === 'systemMedia' && method === 'updateThumbarState')
        ) {
          return undefined
        }
        return Promise.resolve().then(() => mockResponse(group, method, args))
      }
    },
  })
}

export const browserPreviewApi = new Proxy(Object.create(null) as Record<PropertyKey, unknown>, {
  get(_target, group) {
    if (typeof group !== 'string') return undefined
    return createGroup(group)
  },
}) as unknown as AuralisApi
