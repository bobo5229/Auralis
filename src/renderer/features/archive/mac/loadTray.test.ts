import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountLoadTray } from './loadTray'

function setup(reduced = false) {
  const classes = new Set<string>()
  const rect = { left: 100, right: 200, top: 100, bottom: 110 }
  const slot = {
    insertAdjacentHTML: vi.fn(),
    querySelector: () => null,
    offsetWidth: 100,
    style: { setProperty: vi.fn() },
    dataset: {},
    getBoundingClientRect: () => rect,
    classList: {
      toggle: (name: string, value: boolean) => (value ? classes.add(name) : classes.delete(name)),
      contains: (name: string) => classes.has(name),
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
    },
  }
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const tray = mountLoadTray(slot as unknown as HTMLElement, { matches: reduced })
  const ghost = { hidden: false, offsetWidth: 96, offsetHeight: 96 }
  const start = (signal = new AbortController().signal) =>
    tray.load({} as HTMLCanvasElement, ghost as HTMLCanvasElement, { x: 150, y: 105, signal })
  return { tray, ghost, classes, start }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('load tray interruption', () => {
  it('opens on approach, accepts only near the slot and closes on departure', () => {
    const { tray, classes } = setup()
    tray.approach(130, 120)
    expect(classes.has('tray-open')).toBe(true)
    expect(tray.hit(130, 120)).toBe(true)
    expect(tray.hit(350, 120)).toBe(false)
    tray.approach(350, 120)
    expect(classes.has('tray-open')).toBe(false)
    tray.dispose()
  })
  it('explicit cancellation settles the pending load and releases the timer', async () => {
    vi.useFakeTimers()
    const { tray, start, ghost, classes } = setup()
    const result = start()
    tray.cancel()
    expect(await result).toBe(false)
    expect(ghost.hidden).toBe(true)
    expect(classes.has('tray-open')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('abort and dispose settle pending operations without completing insertion', async () => {
    vi.useFakeTimers()
    const { tray, start } = setup()
    const abort = new AbortController()
    const first = start(abort.signal)
    abort.abort()
    expect(await first).toBe(false)
    const second = start()
    tray.dispose()
    expect(await second).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('a replacement operation cannot be completed by the canceled operation', async () => {
    vi.useFakeTimers()
    const { start, classes } = setup()
    const first = start()
    const second = start()
    expect(await first).toBe(false)
    expect(classes.has('tray-open')).toBe(true)
    await vi.runAllTimersAsync()
    expect(await second).toBe(true)
    expect(classes.has('tray-open')).toBe(false)
  })
  it('reduced motion completes the same insertion state without delays', async () => {
    const { tray, start, ghost, classes } = setup(true)
    expect(await start()).toBe(true)
    expect(ghost.hidden).toBe(true)
    expect(classes.has('tray-open')).toBe(false)
    tray.dispose()
  })
})
