import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountArchiveStage, type StageAlbum } from './archiveStage.js'

function makeCanvas(fillTextCalls: ReturnType<typeof vi.fn>[]) {
  const contextMethods = {
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
  }
  fillTextCalls.push(contextMethods.fillText)
  const context = new Proxy(contextMethods, {
    get(target, property) {
      return property in target ? target[property as keyof typeof target] : vi.fn()
    },
    set(target, property, value) {
      Reflect.set(target, property, value)
      return true
    },
  })
  return {
    width: 0,
    height: 0,
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 800, height: 480, left: 0, top: 0 }),
    addEventListener: vi.fn(),
    hasPointerCapture: () => false,
    releasePointerCapture: vi.fn(),
    setPointerCapture: vi.fn(),
    focus: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn() },
  }
}

function makeElement() {
  return {
    textContent: '',
    disabled: false,
    tabIndex: 0,
    className: '',
    style: { setProperty: vi.fn() },
    classList: { add: vi.fn(), remove: vi.fn() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setAttribute: vi.fn(),
    appendChild: vi.fn(),
    replaceChildren: vi.fn(),
    contains: () => false,
    getBoundingClientRect: () => ({ width: 800, height: 480, left: 0, top: 0 }),
  }
}

function makeStageHarness(reducedMotion = false) {
  let clock = 0
  let nextFrame = 0
  const pendingFrames = new Map<number, FrameRequestCallback>()
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const placeholderTextCalls: ReturnType<typeof vi.fn>[] = []
  const captionTextCalls: ReturnType<typeof vi.fn>[] = []
  const elements = new Map<string, ReturnType<typeof makeElement>>()
  const canvas = makeCanvas([])
  const captionFace = makeCanvas(captionTextCalls)
  const stageContainer = makeElement()
  const selectors = makeElement()
  const auto = makeElement()
  elements.set('album-stage', canvas as unknown as ReturnType<typeof makeElement>)
  elements.set('stage-caption-face', captionFace as unknown as ReturnType<typeof makeElement>)
  elements.set('stage-selectors', selectors)
  elements.set('stage-auto', auto)
  for (const id of [
    'stage-title',
    'stage-artist',
    'stage-caption',
    'stage-position',
    'stage-prev',
    'stage-next',
  ]) {
    elements.set(id, makeElement())
  }

  const fontResolvers: (() => void)[] = []
  const fontLoads = vi.fn(() => new Promise<void>((resolve) => fontResolvers.push(resolve)))
  const documentStub = {
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    createElement: (tagName: string) =>
      tagName === 'canvas' ? makeCanvas(placeholderTextCalls) : makeElement(),
    fonts: {
      load: fontLoads,
    },
  }
  const windowStub = {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      pendingFrames.set(++nextFrame, callback)
      return nextFrame
    }),
    cancelAnimationFrame: vi.fn((id: number) => pendingFrames.delete(id)),
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const root = {
    host: {},
    getElementById: (id: string) => elements.get(id),
    querySelector: () => stageContainer,
  }
  const tokenValues: Record<string, string> = {
    '--archive-color-accent-secondary': '#f72585',
    '--archive-color-bg-card': '#131720',
    '--archive-color-border-control': '#334155',
    '--archive-color-text-primary': '#f8fafc',
    '--archive-color-text-secondary': '#94a3b8',
    '--archive-font-display': "'Plus Jakarta Sans', 'Auralis Archive CJK', sans-serif",
    '--archive-font-data': "'Plus Jakarta Sans', 'Auralis Archive CJK', monospace",
    '--archive-font-ui': "'Plus Jakarta Sans', 'Auralis Archive CJK', sans-serif",
  }

  class ResizeObserverStub {
    observe = vi.fn()
    disconnect = vi.fn()
  }

  vi.stubGlobal('document', documentStub)
  vi.stubGlobal('window', windowStub)
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  vi.stubGlobal('devicePixelRatio', 1)
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => tokenValues[name] ?? '',
  }))
  vi.stubGlobal('matchMedia', () => ({
    matches: reducedMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

  return {
    stage: mountArchiveStage(root as unknown as ShadowRoot),
    fontResolvers,
    fontLoads,
    placeholderTextCalls,
    captionFace,
    captionTextCalls,
    pendingFrames,
    advance: (time: number) => {
      clock = time
      const callbacks = [...pendingFrames.values()]
      pendingFrames.clear()
      callbacks.forEach((callback) => callback(time))
    },
  }
}

function album(title: string): StageAlbum {
  return { title, artist: '测试艺术家', artworkUrl: null, playCount: 1, durationSeconds: 60 }
}

function countPlaceholderText(calls: ReturnType<typeof vi.fn>[]): number {
  return calls.reduce((count, fillText) => count + fillText.mock.calls.length, 0)
}

async function flushFontCallbacks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('mountArchiveStage hologram lifecycle', () => {
  it('animates a single sleeve and stops requesting frames after completion', () => {
    const { stage, advance, pendingFrames } = makeStageHarness()
    stage.setAlbums([album('单张专辑')])
    advance(600)
    expect(pendingFrames.size).toBe(1)
    advance(1500)
    expect(pendingFrames.size).toBe(0)
    stage.dispose()
  })

  it('restarts for a replacement date and cancels rendering on disposal', () => {
    const { stage, advance, pendingFrames } = makeStageHarness()
    stage.setAlbums([album('旧日期')])
    advance(600)
    stage.setAlbums([album('新日期')])
    advance(1500)
    expect(pendingFrames.size).toBe(1)
    stage.dispose()
    expect(pendingFrames.size).toBe(0)
  })

  it('renders immediately with reduced motion or an empty date', () => {
    const { stage, advance, pendingFrames } = makeStageHarness(true)
    stage.setAlbums([album('减少动态效果')])
    advance(16)
    expect(pendingFrames.size).toBe(0)
    stage.setAlbums([])
    advance(32)
    expect(pendingFrames.size).toBe(0)
    stage.dispose()
  })

  it('reveals the placeholder after a bounded wait and animates a late real cover', () => {
    const images: ImageStub[] = []
    class ImageStub {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 512
      naturalHeight = 512
      src = ''
      removeAttribute = vi.fn()
      constructor() {
        images.push(this)
      }
    }
    vi.stubGlobal('Image', ImageStub)
    const { stage, advance, pendingFrames } = makeStageHarness()
    stage.setAlbums([{ ...album('慢速封面'), artworkUrl: 'auralis-artwork://test' }])
    advance(500)
    expect(pendingFrames.size).toBe(1)
    advance(2000)
    expect(pendingFrames.size).toBe(0)
    images[0].onload!()
    advance(2300)
    expect(pendingFrames.size).toBe(1)
    advance(3500)
    expect(pendingFrames.size).toBe(0)
    stage.dispose()
  })
})

describe('mountArchiveStage font redraw lifecycle', () => {
  it('loads English, numerals and Chinese through the resolved role families', () => {
    const { stage, fontLoads } = makeStageHarness()
    stage.setAlbums([album('Archive 2026 中文专辑名')])

    expect(fontLoads).toHaveBeenCalledWith(
      "700 28px 'Plus Jakarta Sans', 'Auralis Archive CJK', sans-serif",
      'Album 2026 中文专辑名',
    )
    expect(fontLoads).toHaveBeenCalledWith(
      "600 18px 'Plus Jakarta Sans', 'Auralis Archive CJK', sans-serif",
      'Artist 123 暂无封面',
    )
    expect(fontLoads).toHaveBeenCalledWith(
      "700 8px 'Plus Jakarta Sans', 'Auralis Archive CJK', monospace",
      'Date 2026 · 12 次 · 34 分钟',
    )
    stage.dispose()
  })

  it('redraws only the current date after its role fonts load', async () => {
    const { stage, fontResolvers, placeholderTextCalls } = makeStageHarness()
    stage.setAlbums([album('旧日期专辑')])
    stage.setAlbums([album('当前日期专辑')])
    expect(countPlaceholderText(placeholderTextCalls)).toBe(6)

    fontResolvers.slice(0, 3).forEach((resolve) => resolve())
    await flushFontCallbacks()
    expect(countPlaceholderText(placeholderTextCalls)).toBe(6)

    fontResolvers.slice(3).forEach((resolve) => resolve())
    await flushFontCallbacks()
    expect(countPlaceholderText(placeholderTextCalls)).toBe(9)
    stage.dispose()
  })

  it('does not redraw after the stage has been disposed', async () => {
    const { stage, fontResolvers, placeholderTextCalls } = makeStageHarness()
    stage.setAlbums([album('当前日期专辑')])
    stage.dispose()
    fontResolvers.forEach((resolve) => resolve())
    await flushFontCallbacks()

    expect(countPlaceholderText(placeholderTextCalls)).toBe(3)
  })
})

describe('mountArchiveStage caption raster', () => {
  it('paints the selected title into a supersampled caption texture', () => {
    const { stage, captionFace, captionTextCalls } = makeStageHarness()
    stage.setAlbums([album('高分辨率专辑')])
    expect(captionFace.width).toBe(1600)
    expect(captionFace.height).toBe(96)
    expect(
      captionTextCalls.some((fillText) =>
        fillText.mock.calls.some((call) => call[0] === '高分辨率专辑'),
      ),
    ).toBe(true)
    stage.dispose()
  })
})
