import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareSettingsDialogEnter } from './prepareSettingsDialogEnter'

let frames: Map<number, FrameRequestCallback>
let frameId: number

function paint(): void {
  const pending = [...frames.values()]
  frames.clear()
  for (const callback of pending) callback(performance.now())
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  frames = new Map()
  frameId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('settings dialog entry preparation', () => {
  it('waits for content and its fonts, then lets the blur layer paint before revealing', async () => {
    let contentReady!: () => void
    let fontsReady!: () => void
    const ready = new Promise<FontFaceSet>((resolve) => {
      fontsReady = () => resolve(document.fonts)
    })
    vi.stubGlobal('document', { fonts: { ready } })
    const reveal = vi.fn()
    prepareSettingsDialogEnter(new Promise<void>((resolve) => (contentReady = resolve)), reveal)
    paint()
    expect(frames.size).toBe(0)
    contentReady()
    await flush()
    expect(frames.size).toBe(0)
    fontsReady()
    await flush()
    paint()
    paint()
    expect(reveal).not.toHaveBeenCalled()
    paint()
    expect(reveal).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reveals the loading shell after a bounded wait even if the content never loads', async () => {
    const reveal = vi.fn()
    prepareSettingsDialogEnter(new Promise(() => {}), reveal)
    vi.advanceTimersByTime(100)
    paint()
    paint()
    paint()
    expect(reveal).toHaveBeenCalledOnce()
  })

  it('cancels outstanding frames and ignores late resources after closing', async () => {
    let ready!: () => void
    const reveal = vi.fn()
    const cancel = prepareSettingsDialogEnter(
      new Promise<void>((resolve) => (ready = resolve)),
      reveal,
    )
    vi.advanceTimersByTime(100)
    paint()
    cancel()
    ready()
    await flush()
    paint()
    vi.runAllTimers()
    expect(frames.size).toBe(0)
    expect(reveal).not.toHaveBeenCalled()
  })

  it('prepares only once when resources finish after the loading deadline', async () => {
    let ready!: () => void
    const reveal = vi.fn()
    prepareSettingsDialogEnter(new Promise<void>((resolve) => (ready = resolve)), reveal)
    vi.advanceTimersByTime(100)
    ready()
    await flush()
    paint()
    paint()
    paint()
    paint()
    expect(reveal).toHaveBeenCalledOnce()
  })
})
