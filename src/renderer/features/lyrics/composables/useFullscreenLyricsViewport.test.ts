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
    })
    return {
      container,
      track,
      animation,
      scrollRef,
      currentTrackId,
      activeIndex,
      isOpen,
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

  it('pauses auto-follow for manual scrolling and resumes after three seconds', async () => {
    vi.useFakeTimers()
    const { container, track, viewport } = setup()
    await flushViewport()

    viewport.pauseAutoFollow()
    expect(viewport.isUserScrolling.value).toBe(true)
    expect(container.scrollTop).toBe(60)
    expect(track.style.transform).toBe('translate3d(0, 0px, 0)')

    container.scrollTop = 90
    vi.advanceTimersByTime(3000)
    expect(viewport.isUserScrolling.value).toBe(false)
    expect(container.scrollTop).toBe(0)
    expect(track.style.transform).toBe('translate3d(0, -60px, 0)')
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
