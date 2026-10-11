import { onBeforeUnmount, onMounted, ref, shallowRef, type Component } from 'vue'
import type { RandomAlbumTracksResult } from '@shared/types/playback'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import {
  APP_FAILED_EVENT,
  APP_READY_EVENT,
  SPLASH_FINISHED_EVENT,
} from '@renderer/app/splash/startupSignals'
import {
  startupAlbumStorage,
  readStartupAlbumHistory,
  rememberStartupAlbum,
  useStartupAlbumPreference,
} from './startupAlbumPreference'
import { startStartupAlbum } from './startupAlbumCoordinator'
import type { createCardScene } from './rendering/scene'

export interface StartupAlbumPresentation {
  album: RandomAlbumTracksResult
  cover: HTMLImageElement | null
  createScene: typeof createCardScene | null
}

function loadCover(url: string | null, signal: AbortSignal): Promise<HTMLImageElement | null> {
  if (!url || signal.aborted) return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    // A slow cover uses the local placeholder rather than consuming the whole startup budget.
    const timer = setTimeout(() => finish(null), 700)
    function finish(value: HTMLImageElement | null): void {
      clearTimeout(timer)
      image.onload = image.onerror = null
      signal.removeEventListener('abort', cancel)
      if (!value) image.src = ''
      resolve(value)
    }
    function cancel(): void {
      finish(null)
    }
    image.onload = () => finish(image)
    image.onerror = () => finish(null)
    signal.addEventListener('abort', cancel, { once: true })
    image.src = url
  })
}

export function useStartupAlbum() {
  const active = ref(false)
  const presentation = shallowRef<StartupAlbumPresentation | null>(null)
  const overlay = shallowRef<Component | null>(null)
  const enabledAtStartup = useStartupAlbumPreference().enabled.value
  let stop: (() => void) | undefined
  let nativeVisible = false
  onMounted(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    if (
      !enabledAtStartup ||
      navigation?.type === 'reload' ||
      new URLSearchParams(location.search).get('splash') === '0'
    )
      return
    const subscribe = (names: string[], listener: () => void) => {
      names.forEach((name) => window.addEventListener(name, listener))
      return () => names.forEach((name) => window.removeEventListener(name, listener))
    }
    stop = startStartupAlbum({
      async prepare(signal) {
        const albumTask = auralis.app
          .claimStartupAlbum({ recentAlbums: readStartupAlbumHistory(startupAlbumStorage()) })
          .then(
            async ({ album }) =>
              album && {
                album,
                cover: await loadCover(
                  getArtworkUrl(
                    album.tracks.find((track) => track.artworkCacheKey)?.artworkCacheKey ?? null,
                  ),
                  signal,
                ),
              },
          )
        const [data, component, rendering, typography] = await Promise.all([
          albumTask,
          import('./StartupAlbumOverlay.vue'),
          import('./rendering/scene').catch(() => null),
          import('./rendering/cardTypography'),
        ])
        if (!data || !data.album.tracks.length || signal.aborted) return null
        await typography.loadCardFonts(data.album.album, data.album.albumArtist)
        if (signal.aborted) return null
        return {
          ...data,
          component: component.default,
          createScene: rendering?.createCardScene ?? null,
        }
      },
      isReady: () =>
        window.__auralisAppReady === true &&
        !window.__auralisAppFailed &&
        window.__auralisSplashFinished === true,
      canShow: () => nativeVisible && !document.hidden,
      onReady: (listener) => {
        const unsubscribe = subscribe([APP_READY_EVENT, SPLASH_FINISHED_EVENT], listener)
        let revision = 0
        let disposed = false
        const unsubscribeWindow = auralis.window.onVisibilityChanged(({ isVisible }) => {
          revision++
          nativeVisible = isVisible
          listener()
        })
        const requestRevision = revision
        void auralis.window
          .getVisibility()
          .then(({ isVisible }) => {
            if (disposed || revision !== requestRevision) return
            nativeVisible = isVisible
            listener()
          })
          .catch(() => {
            if (disposed || revision !== requestRevision) return
            nativeVisible = !document.hidden
            listener()
          })
        document.addEventListener('visibilitychange', listener)
        return () => {
          disposed = true
          unsubscribeWindow()
          unsubscribe()
          document.removeEventListener('visibilitychange', listener)
        }
      },
      onInteract: (listener) => {
        document.addEventListener('pointerdown', listener, true)
        document.addEventListener('keydown', listener, true)
        document.addEventListener('wheel', listener, true)
        return () => {
          document.removeEventListener('pointerdown', listener, true)
          document.removeEventListener('keydown', listener, true)
          document.removeEventListener('wheel', listener, true)
        }
      },
      onFailed: (listener) => subscribe([APP_FAILED_EVENT, 'pagehide'], listener),
      show(value) {
        overlay.value = value.component
        presentation.value = value
        active.value = true
      },
      reportError: (cause) =>
        rendererDiagnostics.warn({
          scope: 'startup.album',
          message: 'Could not prepare startup album',
          cause,
        }),
    })
  })
  function shown(): void {
    if (presentation.value) rememberStartupAlbum(startupAlbumStorage(), presentation.value.album)
  }
  function close(): void {
    active.value = false
    presentation.value = null
    overlay.value = null
  }
  onBeforeUnmount(() => stop?.())
  return { active, presentation, overlay, shown, close }
}
