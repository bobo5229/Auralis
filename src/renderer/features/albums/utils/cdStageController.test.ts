import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCdStage } from './cdStageController'

const clock = vi.hoisted(() => ({
  update: (() => false) as (seconds: number) => boolean,
  running: false,
  cancel: vi.fn(),
}))
vi.mock('@renderer/shared/animation/motion', () => ({
  animateFrames: (update: typeof clock.update) => {
    clock.update = update
    clock.running = true
    return () => {
      clock.running = false
      clock.cancel()
    }
  },
  animateTilt: () => ({ stop: vi.fn(), cancel: vi.fn() }),
}))

// Small DOM substitute: these tests cover controller state/lifetime, not visuals.
class TestElement extends EventTarget {
  style = {} as CSSStyleDeclaration
  children: TestElement[] = []
  parent: TestElement | null = null
  clientWidth = 1200
  clientHeight = 700
  setAttribute(): void {}
  focus(): void {}
  setPointerCapture(): void {}
  append(...children: TestElement[]): void {
    for (const child of children) {
      child.parent = this
      this.children.push(child)
    }
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this)
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('CD stage lifetime', () => {
  function advance(frames: number): void {
    for (let index = 0; index < frames && clock.running; index++) {
      clock.running = clock.update(1 / 60)
    }
  }
  function settle(): void {
    advance(600)
    expect(clock.running).toBe(false)
  }
  function setup(count: number, focusChange?: (progress: number, settled: boolean) => void) {
    const disconnect = vi.fn()
    const media = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('matchMedia', () => media)
    const document = {
      createElement: () => new TestElement(),
      elementFromPoint: vi.fn(() => null as TestElement | null),
    }
    vi.stubGlobal('document', document)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect = disconnect
      },
    )
    const stage = new TestElement()
    const select = vi.fn()
    const approach = vi.fn()
    const rapid = vi.fn()
    const controller = createCdStage(
      stage as unknown as HTMLElement,
      select,
      approach,
      undefined,
      rapid,
      focusChange
        ? { geometry: () => ({ cx: 600, cy: 360, rightBoundary: 940 }), change: focusChange }
        : undefined,
    )
    const albums = Array.from({ length: count }, (_, index) => ({
      key: String(index),
      artworkUrl: null,
    }))
    controller.setAlbums(albums)
    return { stage, select, approach, rapid, controller, disconnect, albums, media, document }
  }

  function discAt(stage: TestElement, index: number): TestElement {
    const slot = stage.children.find((node) => Number(node.style.zIndex) === index)
    if (!slot) throw new Error(`Missing disc at layer ${index}`)
    return slot.children[0].children[0]
  }

  it('focuses only the resting centre and restores the same discs without changing selection', () => {
    const change = vi.fn()
    const { stage, document, controller, select } = setup(8, change)
    const original = stage.children.map((node) => node.style.transform)
    const discs = [...stage.children]
    tap(stage, document, discAt(stage, 3))
    advance(20)
    controller.navigate(1)
    settle()
    expect(change).toHaveBeenLastCalledWith(1, true)
    expect(stage.children[0].style.opacity).toBe('0')
    expect(stage.children[2].style.transform).not.toBe(original[2])
    expect(select).toHaveBeenCalledTimes(1)
    controller.setFocused(false)
    settle()
    expect(change).toHaveBeenLastCalledWith(0, true)
    expect(stage.children).toEqual(discs)
    expect(stage.children.map((node) => node.style.transform)).toEqual(original)
    controller.dispose()
  })

  it('supports focus reversal, reduced motion, catalog refresh and disposal', () => {
    const change = vi.fn()
    const { controller, media, albums } = setup(8, change)
    controller.setFocused(true)
    advance(12)
    controller.setFocused(false)
    settle()
    expect(change).toHaveBeenLastCalledWith(0, true)
    media.matches = true
    controller.setFocused(true)
    expect(change).toHaveBeenLastCalledWith(1, true)
    expect(clock.running).toBe(false)
    controller.setAlbums(albums)
    expect(change).toHaveBeenLastCalledWith(0, true)
    media.matches = false
    controller.setFocused(true)
    controller.dispose()
    expect(clock.running).toBe(false)
    expect(change).toHaveBeenLastCalledWith(0, true)
  })

  function pointerEvent(
    type: string,
    target: TestElement,
    options: Partial<PointerEvent> = {},
  ): Event {
    const event = new Event(type)
    Object.assign(event, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 100,
      clientY: 100,
      ...options,
    })
    Object.defineProperty(event, 'composedPath', { value: () => [target] })
    return event
  }

  function tap(
    stage: TestElement,
    document: { elementFromPoint: ReturnType<typeof vi.fn> },
    disc: TestElement,
    options: Partial<PointerEvent> = {},
  ): void {
    stage.dispatchEvent(pointerEvent('pointerdown', disc, options))
    document.elementFromPoint.mockReturnValue(disc)
    stage.dispatchEvent(pointerEvent('pointerup', stage, options))
  }

  it('retargets without jumping and suppresses intermediate information until settling', () => {
    const { stage, select, approach, rapid, controller } = setup(8)
    controller.navigate(1)
    advance(12)
    const before = stage.children.map((node) => node.style.transform)
    controller.navigate(1)
    expect(stage.children.map((node) => node.style.transform)).toEqual(before)
    advance(12)
    controller.navigate(-1)
    advance(20)
    expect(approach).not.toHaveBeenCalled()
    expect(rapid).toHaveBeenCalledExactlyOnceWith(true)
    settle()
    expect(approach).not.toHaveBeenCalled()
    expect(rapid.mock.calls).toEqual([[true], [false]])
    expect(select).toHaveBeenLastCalledWith(1)
    controller.dispose()
  })

  it('prepares a bounded startup pool and hands off existing final nodes without allocating during motion', async () => {
    const { stage, albums, controller, select } = setup(20)
    controller.setAlbums(albums, true)
    expect(stage.children).toHaveLength(13)
    const prepared = [...stage.children]
    await Promise.resolve()
    controller.navigate(1)
    for (let frame = 0; frame < 260; frame++) {
      advance(1)
      expect(stage.children).toEqual(prepared)
      expect(
        stage.children.filter((node) => Number(node.style.opacity) > 0).length,
      ).toBeLessThanOrEqual(4)
    }
    settle()
    expect(stage.children).toHaveLength(4)
    expect(stage.children.every((node) => prepared.includes(node))).toBe(true)
    expect(stage.children.every((node) => node.style.willChange === '')).toBe(true)
    expect(select).toHaveBeenLastCalledWith(0)
    controller.navigate(1)
    settle()
    expect(select).toHaveBeenLastCalledWith(1)
    controller.dispose()
  })

  it('cancels pending startup on catalog replacement and disposal', async () => {
    const { stage, albums, controller } = setup(8)
    controller.setAlbums(albums, true)
    controller.setAlbums(albums.slice(0, 2))
    await Promise.resolve()
    expect(stage.children).toHaveLength(2)
    expect(stage.children.every((node) => node.style.opacity === '1')).toBe(true)
    controller.setAlbums(albums, true)
    controller.dispose()
    await Promise.resolve()
    expect(stage.children).toHaveLength(0)
  })

  it('bounds cover preparation and does not insert late images during rapid motion', async () => {
    vi.useFakeTimers()
    const { stage, albums, controller } = setup(8)
    const finishDecode: Array<() => void> = []
    vi.stubGlobal(
      'Image',
      class extends TestElement {
        decode(): Promise<void> {
          return new Promise((resolve) => finishDecode.push(resolve))
        }
      },
    )
    controller.setAlbums(
      albums.map((album) => ({ ...album, artworkUrl: `cover:${album.key}` })),
      true,
    )
    const artLayers = stage.children.map((slot) => slot.children[0].children[0].children[0])
    expect(artLayers.every((art) => art.children.length === 1)).toBe(true)
    vi.advanceTimersByTime(1200)
    expect(artLayers.every((art) => art.children.length === 0)).toBe(true)
    advance(150)
    const before = stage.children.map((node) => node.style.transform)
    finishDecode.forEach((resolve) => resolve())
    await Promise.resolve()
    await Promise.resolve()
    expect(stage.children.map((node) => node.style.transform)).toEqual(before)
    expect(artLayers.every((art) => art.children.length === 0)).toBe(true)
    controller.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('skips startup for reduced motion and unfolds small catalogs without duplicates', async () => {
    const { stage, albums, controller, media } = setup(3)
    media.matches = true
    controller.setAlbums(albums, true)
    expect(stage.children).toHaveLength(2)
    media.matches = false
    controller.setAlbums(albums, true)
    expect(stage.children).toHaveLength(2)
    await Promise.resolve()
    advance(100)
    media.matches = true
    media.dispatchEvent(new Event('change'))
    expect(clock.running).toBe(false)
    expect(stage.children.every((node) => node.style.opacity === '1')).toBe(true)
    controller.dispose()
  })

  it('respects small catalog boundaries and settles directly for reduced motion', () => {
    const { controller, select, media } = setup(2)
    select.mockClear()
    controller.navigate(-1)
    expect(select).not.toHaveBeenCalled()
    controller.navigate(1)
    advance(5)
    controller.navigate(1)
    media.matches = true
    media.dispatchEvent(new Event('change'))
    expect(select).toHaveBeenLastCalledWith(1)
    expect(clock.running).toBe(false)
    controller.navigate(-1)
    expect(select).toHaveBeenLastCalledWith(0)
    expect(clock.running).toBe(false)
    controller.dispose()
  })

  it('announces the approaching album after a delay and before settling', () => {
    const { controller, select, approach } = setup(8)
    for (const [direction, target] of [
      [1, 1],
      [-1, 0],
    ]) {
      select.mockClear()
      approach.mockClear()
      controller.navigate(direction)
      advance(20)
      expect(approach).not.toHaveBeenCalled()
      advance(5)
      expect(approach).toHaveBeenCalledExactlyOnceWith(target)
      expect(select).not.toHaveBeenCalled()
      settle()
      expect(approach).toHaveBeenCalledTimes(1)
      expect(select).toHaveBeenCalledExactlyOnceWith(target)
    }
    controller.dispose()
  })

  it('settles queued switches with four nodes and cancels on disposal', () => {
    const { stage, select, controller, disconnect } = setup(8)
    for (let index = 0; index < 12; index++) controller.navigate(1)
    for (let step = 0; step < 600 && clock.running; step++) {
      advance(1)
      expect(stage.children).toHaveLength(4)
    }
    expect(clock.running).toBe(false)
    expect(select).toHaveBeenLastCalledWith(4)
    controller.navigate(-1)
    controller.dispose()
    expect(clock.cancel).toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(stage.children).toHaveLength(0)
  })

  it('drops the forward backlog on reversal and restores information on cancellation', () => {
    const { controller, select, rapid, approach, albums, media } = setup(40)
    for (let index = 0; index < 20; index++) controller.navigate(1)
    advance(30)
    controller.navigate(-1)
    settle()
    expect(select.mock.lastCall![0]).toBeLessThan(5)
    expect(approach).not.toHaveBeenCalled()
    expect(rapid.mock.calls).toEqual([[true], [false]])
    controller.navigate(1)
    controller.navigate(1)
    expect(rapid).toHaveBeenLastCalledWith(true)
    controller.setAlbums(albums)
    expect(rapid).toHaveBeenLastCalledWith(false)
    controller.navigate(1)
    controller.navigate(1)
    media.matches = true
    media.dispatchEvent(new Event('change'))
    expect(rapid).toHaveBeenLastCalledWith(false)
    expect(clock.running).toBe(false)
    controller.dispose()
  })

  it('does not hide information for invalid small-catalog inputs or reduced motion', () => {
    const { controller, rapid, media } = setup(2)
    controller.navigate(1)
    controller.navigate(1)
    expect(rapid).not.toHaveBeenCalled()
    settle()
    media.matches = true
    controller.navigate(-1)
    controller.navigate(1)
    expect(rapid).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('assigns distinct disc-plane angles and retains them through movement and refresh', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const { stage, controller, albums } = setup(8)
    const angles = () =>
      [...stage.children]
        .sort((left, right) => Number(left.style.zIndex) - Number(right.style.zIndex))
        .map((slot) => slot.children[0].children[0].children[0].style.transform)
    const initial = angles()
    expect(new Set(initial).size).toBe(4)
    for (const transform of initial) {
      const degrees = Number(transform.match(/rotate\((\d+)deg\)/)?.[1])
      expect(degrees).toBeGreaterThanOrEqual(0)
      expect(degrees).toBeLessThan(360)
    }
    controller.navigate(1)
    advance(2)
    expect(angles()).toEqual(initial)
    settle()
    controller.navigate(-1)
    settle()
    expect(angles()).toEqual(initial)
    controller.setAlbums(albums)
    expect(angles()).toEqual(initial)
    controller.dispose()
  })

  it('preserves the selected album across catalog reorder and handles an empty catalog', () => {
    const { controller, select, stage, albums } = setup(5)
    controller.navigate(1)
    settle()
    controller.setAlbums([...albums].reverse())
    expect(select).toHaveBeenLastCalledWith(3)
    controller.setAlbums([])
    expect(stage.children).toHaveLength(0)
    controller.navigate(1)
    expect(stage.children).toHaveLength(0)
    controller.dispose()
  })

  it('moves the clicked visible instance directly, including the second disc on the left', () => {
    const { stage, select, controller, document } = setup(8)
    select.mockClear()
    // Initial layers are positions -2, -1, 0, 1. Selecting -2 must not pause at -1.
    tap(stage, document, discAt(stage, 1))
    expect(clock.running).toBe(true)
    settle()
    expect(select).toHaveBeenCalledExactlyOnceWith(6)
    controller.dispose()
  })

  it('keeps one-disc catalog inert and selects visible discs in a three-disc catalog', () => {
    const one = setup(1)
    one.select.mockClear()
    tap(one.stage, one.document, discAt(one.stage, 1))
    expect(clock.running).toBe(false)
    expect(one.select).not.toHaveBeenCalled()
    one.controller.dispose()

    const three = setup(3)
    three.select.mockClear()
    tap(three.stage, three.document, discAt(three.stage, 2))
    settle()
    expect(three.select).toHaveBeenCalledExactlyOnceWith(1)
    three.controller.dispose()
  })

  it('keeps a centre or already-pending target as a no-op', () => {
    const { stage, select, approach, controller, document } = setup(8)
    select.mockClear()
    tap(stage, document, discAt(stage, 3))
    expect(clock.running).toBe(false)
    expect(select).not.toHaveBeenCalled()
    tap(stage, document, discAt(stage, 4))
    advance(2)
    const before = stage.children.map((node) => node.style.transform)
    tap(stage, document, discAt(stage, 4))
    expect(stage.children.map((node) => node.style.transform)).toEqual(before)
    settle()
    expect(approach).toHaveBeenCalledExactlyOnceWith(1)
    expect(select).toHaveBeenCalledExactlyOnceWith(1)
    controller.dispose()
  })

  it('retargets an in-flight click while preserving the current geometry', () => {
    const { stage, select, controller, document } = setup(8)
    controller.navigate(1)
    advance(2)
    const before = stage.children.map((node) => node.style.transform)
    tap(stage, document, discAt(stage, 1))
    expect(stage.children.map((node) => node.style.transform)).toEqual(before)
    settle()
    expect(select).toHaveBeenLastCalledWith(6)
    controller.dispose()
  })

  it('keeps clicking mutually exclusive with dragging, cancellation, and recycled discs', () => {
    const { stage, select, controller, document, albums } = setup(8)
    select.mockClear()
    const right = discAt(stage, 4)
    stage.dispatchEvent(pointerEvent('pointerdown', right))
    stage.dispatchEvent(pointerEvent('pointermove', right, { clientX: 107 }))
    stage.dispatchEvent(pointerEvent('pointermove', right, { clientX: 100 }))
    document.elementFromPoint.mockReturnValue(right)
    stage.dispatchEvent(pointerEvent('pointerup', stage))
    expect(clock.running).toBe(false)
    stage.dispatchEvent(pointerEvent('pointerdown', right))
    stage.dispatchEvent(pointerEvent('pointerup', stage, { clientX: 107 }))
    expect(clock.running).toBe(false)
    stage.dispatchEvent(pointerEvent('pointerdown', right))
    stage.dispatchEvent(new Event('pointercancel'))
    document.elementFromPoint.mockReturnValue(right)
    stage.dispatchEvent(pointerEvent('pointerup', stage))
    expect(clock.running).toBe(false)
    stage.dispatchEvent(pointerEvent('pointerdown', right))
    controller.setAlbums([...albums].reverse())
    document.elementFromPoint.mockReturnValue(right)
    stage.dispatchEvent(pointerEvent('pointerup', stage))
    expect(clock.running).toBe(false)
    expect(select).toHaveBeenLastCalledWith(7)
    controller.dispose()
  })

  it('uses direct selection without animation when reduced motion is enabled', () => {
    const { stage, select, controller, document, media } = setup(8)
    select.mockClear()
    media.matches = true
    tap(stage, document, discAt(stage, 4))
    expect(clock.running).toBe(false)
    expect(select).toHaveBeenCalledExactlyOnceWith(1)
    controller.dispose()
  })
})
