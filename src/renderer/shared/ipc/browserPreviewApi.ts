import type { AuralisApi } from '@shared/ipc/api'

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

function mockResponse(group: string, method: string): unknown {
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
    case 'playback.recordEffectivePlay':
      return { ok: false, recorded: false }
    case 'playback.acquireReadLease':
      return { leaseId: 'browser-preview' }
    case 'playback.releaseReadLease':
      return { ok: true }
    case 'window.control':
    case 'window.getMaximized':
      return { isMaximized: false }
    case 'window.getVisibility':
      return { isVisible: true }
    case 'database.exportBackup':
    case 'database.restoreBackup':
      return { status: 'cancelled' }
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
      return () => {
        if (method.startsWith('on')) return () => undefined
        if (
          (group === 'app' && ['rendererReady', 'splashReady'].includes(method)) ||
          (group === 'systemMedia' && method === 'updateThumbarState')
        ) {
          return undefined
        }
        return Promise.resolve(mockResponse(group, method))
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
