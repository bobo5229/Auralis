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
  function setup(count: number) {
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
    const controller = createCdStage(stage as unknown as HTMLElement, select, approach)
    const albums = Array.from({ length: count }, (_, index) => ({
      key: String(index),
      artworkUrl: null,
    }))
    controller.setAlbums(albums)
    return { stage, select, approach, controller, disconnect, albums, media, document }
  }

  function discAt(stage: TestElement, index: number): TestElement {
    const slot = stage.children.find((node) => Number(node.style.zIndex) === index)
    if (!slot) throw new Error(`Missing disc at layer ${index}`)
    return slot.children[0].children[0]
  }

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

  it('retargets without jumping and reports only the latest delayed target', () => {
    const { stage, select, approach, controller } = setup(8)
    controller.navigate(1)
    advance(12)
    const before = stage.children.map((node) => node.style.transform)
    controller.navigate(1)
    expect(stage.children.map((node) => node.style.transform)).toEqual(before)
    advance(12)
    controller.navigate(-1)
    advance(20)
    expect(approach).not.toHaveBeenCalled()
    settle()
    expect(approach).toHaveBeenCalledExactlyOnceWith(1)
    expect(select).toHaveBeenLastCalledWith(1)
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
    expect(select).toHaveBeenLastCalledWith(3)
    controller.navigate(-1)
    controller.dispose()
    expect(clock.cancel).toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(stage.children).toHaveLength(0)
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
