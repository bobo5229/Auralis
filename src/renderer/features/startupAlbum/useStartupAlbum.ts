import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  type Component,
} from 'vue'
import type { RandomAlbumTracksResult } from '@shared/types/playback'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import {
  APP_FAILED_EVENT,
  APP_READY_EVENT,
  SPLASH_FINISHED_EVENT,
} from '@renderer/shared/startup/startupSignals'
import {
  startupAlbumStorage,
  readStartupAlbumHistory,
  rememberStartupAlbum,
  useStartupAlbumPreference,
} from './startupAlbumPreference'
import { startStartupAlbum } from './startupAlbumCoordinator'
import type { createCardScene } from './rendering/scene'
import { startupAlbumActionsKey, type StartupAlbumDrawResult } from './startupAlbumActions'

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
  const preparing = ref(false)
  const busy = computed(() => preparing.value || active.value)
  let manualRequest: AbortController | undefined
  let manualReturnFocus: HTMLElement | undefined
  let startupAlbumQuery: Promise<unknown> | undefined
  let stop: (() => void) | undefined
  let nativeVisible = false

  async function prepare(signal: AbortSignal, manual = false) {
    if (signal.aborted) return null
    const request = { recentAlbums: readStartupAlbumHistory(startupAlbumStorage()) }
    const query = manual
      ? auralis.app.drawStartupAlbum(request)
      : auralis.app.claimStartupAlbum(request)
    if (!manual) startupAlbumQuery = query
    const albumTask = query.then(
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
  }

  function show(value: NonNullable<Awaited<ReturnType<typeof prepare>>>): void {
    overlay.value = value.component
    presentation.value = value
    active.value = true
  }

  async function draw(
    signal: AbortSignal,
    returnFocusTo?: HTMLElement,
  ): Promise<StartupAlbumDrawResult> {
    if (signal.aborted || busy.value) return 'cancelled'
    stop?.()
    const request = new AbortController()
    manualRequest = request
    const cancel = () => request.abort()
    signal.addEventListener('abort', cancel, { once: true })
    preparing.value = true
    try {
      // A dismissed startup query may still own the read worker until it exits.
      await startupAlbumQuery?.catch(() => undefined)
      if (request.signal.aborted) return 'cancelled'
      const value = await prepare(request.signal, true)
      if (request.signal.aborted) return 'cancelled'
      if (!value) return 'empty'
      manualReturnFocus = returnFocusTo
      show(value)
      return 'shown'
    } catch (cause) {
      if (request.signal.aborted) return 'cancelled'
      rendererDiagnostics.warn({
        scope: 'startup.album.draw',
        message: 'Could not prepare a manually drawn album',
        cause,
      })
      return 'failed'
    } finally {
      signal.removeEventListener('abort', cancel)
      if (manualRequest === request) manualRequest = undefined
      preparing.value = false
    }
  }

  provide(startupAlbumActionsKey, { busy, draw })
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
      prepare,
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
      show,
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
    const returnFocusTo = manualReturnFocus
    manualReturnFocus = undefined
    active.value = false
    presentation.value = null
    overlay.value = null
    // The settings dialog stays mounted below the card and resumes its focus trap.
    void nextTick(() => {
      if (returnFocusTo?.isConnected && !returnFocusTo.closest('[inert], [disabled]'))
        returnFocusTo.focus({ preventScroll: true })
    })
  }
  onBeforeUnmount(() => {
    stop?.()
    manualRequest?.abort()
  })
  return { active, presentation, overlay, shown, close }
}
