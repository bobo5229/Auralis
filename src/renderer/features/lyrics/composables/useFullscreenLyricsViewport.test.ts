import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clampFullscreenLyricsScroll,
  resolveFullscreenLyricsAnimationDuration,
  resolveFullscreenLyricsScrollTarget,
  useFullscreenLyricsViewport,
} from './useFullscreenLyricsViewport'
import type { LyricsStatus } from './useTrackLyrics'

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []

  readonly observe = vi.fn()
  readonly disconnect = vi.fn()

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this)
  }

  emit(height: number): void {
    this.callback(
      [{ contentRect: { height } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
}

function createViewportElements() {
  const lines = [
    { offsetTop: 80, offsetHeight: 20 },
    { offsetTop: 180, offsetHeight: 30 },
  ] as HTMLElement[]
  const container = {
    clientHeight: 100,
    scrollTop: 0,
  } as HTMLElement
  const animation = {
    cancel: vi.fn(),
    finished: new Promise<void>(() => undefined),
  } as unknown as Animation
  const track = {
    style: { transform: '' },
    scrollHeight: 400,
    querySelectorAll: vi.fn(() => lines),
    querySelector: vi.fn(() => null),
    animate: vi.fn(() => animation),
  } as unknown as HTMLElement
  return { container, track, animation }
}

async function flushViewport(): Promise<void> {
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('fullscreen lyrics viewport helpers', () => {
  it('clamps targets and preserves the existing 30 percent focal line', () => {
    expect(clampFullscreenLyricsScroll(-20, 200)).toBe(0)
    expect(clampFullscreenLyricsScroll(250, 200)).toBe(200)
    expect(resolveFullscreenLyricsScrollTarget({ offset: 80, height: 20 }, 100, 300)).toBe(60)
  })

  it('clamps animation duration to the existing range', () => {
    expect(resolveFullscreenLyricsAnimationDuration(0)).toBe(420)
    expect(resolveFullscreenLyricsAnimationDuration(100)).toBe(445)
    expect(resolveFullscreenLyricsAnimationDuration(1000)).toBe(650)
  })
})

describe('useFullscreenLyricsViewport', () => {
  function setup() {
    const { container, track, animation } = createViewportElements()
    const scrollRef = ref<HTMLElement | null>(container)
    const trackRef = ref<HTMLElement | null>(track)
    const currentTrackId = ref<number | null>(1)
    const lyricsStatus = ref<LyricsStatus>('lrc')
    const lineCount = ref(2)
    const activeIndex = ref(0)
    const isPrelude = ref(false)
    const showPrelude = ref(false)
    const isOpen = ref(true)
    const reducedMotion = ref(false)
    const viewport = useFullscreenLyricsViewport({
      scrollRef,
      trackRef,
      currentTrackId,
      lyricsStatus,
      lineCount,
      activeIndex,
      isPrelude,
      showPrelude,
      isOpen,
      reducedMotion,
    })
    return {
      container,
      track,
      animation,
      scrollRef,
      currentTrackId,
      activeIndex,
      isOpen,
      reducedMotion,
      lyricsStatus,
      viewport,
    }
  }

  it('measures and positions the current lyric on first attachment', async () => {
    const { track, viewport } = setup()
    await flushViewport()

    expect(viewport.containerHeight.value).toBe(100)
    expect(viewport.topPadding.value).toBe(30)
    expect(viewport.bottomPadding.value).toBe(70)
    expect(track.style.transform).toBe('translate3d(0, -60px, 0)')
    expect(FakeResizeObserver.instances).toHaveLength(1)
  })

  it('remeasures after resize and resets position when the track changes', async () => {
    const { currentTrackId, track, viewport } = setup()
    await flushViewport()

    FakeResizeObserver.instances[0].emit(200)
    await flushViewport()
    expect(viewport.containerHeight.value).toBe(200)
    expect(track.style.transform).toBe('translate3d(0, -30px, 0)')

    currentTrackId.value = 2
    await nextTick()
    expect(track.style.transform).toBe('translate3d(0, 0px, 0)')
  })

  it('animates toward the newly active lyric line', async () => {
    const { activeIndex, track } = setup()
    await flushViewport()

    activeIndex.value = 1
    await flushViewport()

    expect(track.animate).toHaveBeenCalledOnce()
    expect(track.style.transform).toBe('translate3d(0, -165px, 0)')
  })

  it('preserves manual reading for eight seconds before resuming auto-follow', async () => {
    vi.useFakeTimers()
    const { container, track, viewport } = setup()
    await flushViewport()

    viewport.pauseAutoFollow()
    expect(viewport.isUserScrolling.value).toBe(true)
    expect(container.scrollTop).toBe(60)
    expect(track.style.transform).toBe('translate3d(0, 0px, 0)')

    container.scrollTop = 90
    vi.advanceTimersByTime(7999)
    expect(viewport.isUserScrolling.value).toBe(true)
    expect(container.scrollTop).toBe(90)
    vi.advanceTimersByTime(1)
    expect(viewport.isUserScrolling.value).toBe(false)
    expect(container.scrollTop).toBe(0)
    expect(track.style.transform).toBe('translate3d(0, -60px, 0)')
  })

  it('ignores navigation and ordinary keys but pauses for scrolling inputs', async () => {
    vi.useFakeTimers()
    const { viewport } = setup()
    await flushViewport()
    const keyboard = (key: string, ctrlKey = false) => ({
      key,
      ctrlKey,
      altKey: false,
      metaKey: false,
    })
    for (const key of ['Tab', 'Escape', 'Enter', 'a', 'ArrowLeft', 'ArrowRight']) {
      viewport.onKeydown(keyboard(key))
      expect(viewport.isUserScrolling.value).toBe(false)
    }
    viewport.onKeydown(keyboard('Home', true))
    viewport.onWheel({ deltaY: 0 })
    expect(viewport.isUserScrolling.value).toBe(false)
    viewport.onKeydown(keyboard('PageDown'))
    expect(viewport.isUserScrolling.value).toBe(true)
    vi.advanceTimersByTime(7000)
    viewport.onWheel({ deltaY: 100 })
    vi.advanceTimersByTime(7000)
    expect(viewport.isUserScrolling.value).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(viewport.isUserScrolling.value).toBe(false)
    viewport.dispose()
  })

  it('jumps to the active lyric without animation when reduced motion is enabled', async () => {
    const { activeIndex, reducedMotion, track } = setup()
    await flushViewport()

    reducedMotion.value = true
    activeIndex.value = 1
    await flushViewport()

    expect(track.style.transform).toBe('translate3d(0, -165px, 0)')
    expect(track.animate).not.toHaveBeenCalled()
  })

  it('cancels an in-flight follow animation when reduced motion is enabled', async () => {
    const { activeIndex, reducedMotion, track, animation } = setup()
    await flushViewport()
    activeIndex.value = 1
    await flushViewport()
    expect(track.animate).toHaveBeenCalledOnce()

    reducedMotion.value = true
    await flushViewport()

    expect(animation.cancel).toHaveBeenCalled()
    expect(track.style.transform).toBe('translate3d(0, -165px, 0)')
    expect(track.animate).toHaveBeenCalledOnce()
  })

  it('resets timed follow and preserves manual reading when lyrics become plain text', async () => {
    const { lyricsStatus, activeIndex, container, track, viewport } = setup()
    await flushViewport()
    lyricsStatus.value = 'plain'
    await flushViewport()

    expect(track.style.transform).toBe('translate3d(0, 0px, 0)')
    expect(viewport.topPadding.value).toBe(15)
    expect(viewport.bottomPadding.value).toBe(18)
    container.scrollTop = 90
    viewport.pauseAutoFollow()
    activeIndex.value = 1
    await flushViewport()

    expect(container.scrollTop).toBe(90)
    expect(viewport.isUserScrolling.value).toBe(false)
    expect(track.animate).not.toHaveBeenCalled()
  })

  it('keeps plain text edge spacing outside the fade after resize', async () => {
    const { lyricsStatus, viewport } = setup()
    lyricsStatus.value = 'plain'
    await flushViewport()
    FakeResizeObserver.instances[0].emit(800)
    await flushViewport()
    expect(viewport.topPadding.value).toBe(64)
    expect(viewport.bottomPadding.value).toBe(88)
    viewport.dispose()
  })

  it('disconnects while closed, rebinds once on reopen, and cleans resources on dispose', async () => {
    const { isOpen, viewport } = setup()
    await flushViewport()
    const firstObserver = FakeResizeObserver.instances[0]

    isOpen.value = false
    await flushViewport()
    expect(firstObserver.disconnect).toHaveBeenCalled()

    isOpen.value = true
    await flushViewport()
    expect(FakeResizeObserver.instances).toHaveLength(2)

    viewport.dispose()
    expect(FakeResizeObserver.instances[1].disconnect).toHaveBeenCalled()
  })
})
