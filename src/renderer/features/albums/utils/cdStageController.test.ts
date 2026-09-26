import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCdStage } from './cdStageController'

const clock = vi.hoisted(() => ({
  update: (() => false) as (seconds: number) => boolean,
  running: false,
  cancel: vi.fn(),
  press: vi.fn(() => vi.fn()),
}))
vi.mock('@renderer/shared/animation/motion', () => ({
  animateCdPress: clock.press,
  animateFrames: (update: typeof clock.update) => {
    clock.update = update
    clock.running = true
    return () => {
      clock.running = false
      clock.cancel()
    }
  },
}))

// Small DOM substitute: these tests cover controller state/lifetime, not visuals.
class TestElement extends EventTarget {
  src = ''
  style = {} as CSSStyleDeclaration
  children: TestElement[] = []
  parent: TestElement | null = null
  attributes = new Map<string, string>()
  classList = { add: vi.fn() }
  clientWidth = 1200
  clientHeight = 700
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }
  focus(): void {}
  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 400, height: 400 } as DOMRect
  }
  setPointerCapture(): void {}
  hasPointerCapture(): boolean {
    return true
  }
  releasePointerCapture(): void {}
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
  function setup(
    count: number,
    focusChange?: (progress: number, settled: boolean) => void,
    togglePlayback?: () => boolean,
  ) {
    const disconnect = vi.fn()
    const media = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('matchMedia', () => media)
    const document = {
      createElement: () => new TestElement(),
      createElementNS: () => new TestElement(),
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
        ? {
            geometry: () => ({ cx: 600, cy: 360, rightBoundary: 940 }),
            change: focusChange,
            togglePlayback,
          }
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

  it('selects and focuses a requested album with reduced motion', () => {
    const change = vi.fn()
    const { controller, media, select } = setup(8, change)
    media.matches = true

    controller.focusAlbum(5)

    expect(select).toHaveBeenLastCalledWith(5)
    expect(change).toHaveBeenLastCalledWith(1, true)
    controller.dispose()
  })

  it('directly fades a requested album into focus', () => {
    const change = vi.fn()
    const { stage, controller, select } = setup(8, change)
    controller.focusAlbum(5)

    expect(select).toHaveBeenLastCalledWith(5)
    expect(change).toHaveBeenLastCalledWith(1, false)
    const selectedSlot = stage.children.find(
      (node) => node.attributes.get('data-selected') === 'true',
    )!
    const focusedTransform = selectedSlot.style.transform
    expect(selectedSlot.style.opacity).toBe('0')
    advance(12)
    expect(Number(selectedSlot.style.opacity)).toBeGreaterThan(0)
    expect(Number(selectedSlot.style.opacity)).toBeLessThan(1)
    expect(selectedSlot.style.transform).toBe(focusedTransform)
    settle()
    expect(change).toHaveBeenLastCalledWith(1, true)
    expect(selectedSlot.style.opacity).toBe('1')
    controller.dispose()
  })

  it('fades a requested album in at its final focused pose', () => {
    const change = vi.fn()
    const { stage, controller, albums, select } = setup(8, change)
    controller.setAlbums(albums, false, albums[5].key)
    expect(select).toHaveBeenLastCalledWith(5)
    controller.setFocused(true, 'fade')
    const selectedSlot = stage.children.find(
      (node) => node.attributes.get('data-selected') === 'true',
    )!
    const focusedTransform = selectedSlot.style.transform
    expect(selectedSlot.style.opacity).toBe('0')
    expect(change).toHaveBeenLastCalledWith(1, false)
    advance(12)
    expect(Number(selectedSlot.style.opacity)).toBeGreaterThan(0)
    expect(Number(selectedSlot.style.opacity)).toBeLessThan(1)
    expect(selectedSlot.style.transform).toBe(focusedTransform)
    settle()
    expect(selectedSlot.style.opacity).toBe('1')
    expect(change).toHaveBeenLastCalledWith(1, true)
    controller.dispose()
  })

  it('cleans up a direct focus fade when the user leaves before it finishes', () => {
    const change = vi.fn()
    const { stage, controller } = setup(8, change)
    controller.setFocused(true, 'fade')
    advance(8)
    controller.setFocused(false)
    settle()
    const selectedSlot = stage.children.find(
      (node) => node.attributes.get('data-selected') === 'true',
    )!
    expect(selectedSlot.style.opacity).toBe('1')
    expect(change).toHaveBeenLastCalledWith(0, true)
    controller.dispose()
  })

  it('shows, advances and pauses the focused playback wave', () => {
    const change = vi.fn()
    const { stage, controller } = setup(8, change)
    controller.setFocused(true)
    settle()
    const selectedSlot = stage.children.find((node) => node.style.zIndex === '5')!
    const waveRing = selectedSlot.children[0].children[1]
    const progressPath = waveRing.children[1]

    controller.setPlayback({ visible: true, playing: false, progress: 0.25, accent: '#123456' })
    expect(waveRing.style.opacity).toBe('1')
    expect(progressPath.attributes.get('stroke-dashoffset')).toBe('0.75')
    expect(progressPath.style.stroke).toBe('#123456')
    advance(180)
    expect(clock.running).toBe(false)
    const stillPath = progressPath.attributes.get('d')

    controller.setPlayback({ visible: true, playing: true, progress: 0.25, accent: '#123456' })
    advance(4)
    expect(progressPath.attributes.get('d')).not.toBe(stillPath)
    controller.setPlayback({ visible: true, playing: false, progress: 0.25, accent: '#123456' })
    expect(clock.running).toBe(false)
    controller.dispose()
  })

  function pointerEvent(
    type: string,
    target: TestElement,
    options: Partial<PointerEvent> = {},
  ): Event {
    const event = new Event(type, { cancelable: true })
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

  it('toggles playback only for left double-clicks on the settled focused disc', () => {
    const toggle = vi.fn(() => true)
    const { stage, controller } = setup(8, vi.fn(), toggle)
    const disc = discAt(stage, 3)
    const doubleClick = (target = disc, button = 0): void => {
      stage.dispatchEvent(pointerEvent('dblclick', target, { button }))
    }
    doubleClick()
    controller.setFocused(true)
    doubleClick()
    settle()
    doubleClick(stage)
    doubleClick(disc, 2)
    expect(toggle).not.toHaveBeenCalled()
    expect(clock.press).not.toHaveBeenCalled()
    doubleClick()
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(clock.press).toHaveBeenLastCalledWith(disc.parent, false)
    const cancelPress = clock.press.mock.results[0].value
    doubleClick()
    expect(toggle).toHaveBeenCalledTimes(2)
    expect(cancelPress).toHaveBeenCalledOnce()
    const cancelSecondPress = clock.press.mock.results[1].value
    controller.setFocused(false)
    expect(cancelSecondPress).toHaveBeenCalledOnce()
    doubleClick()
    settle()
    doubleClick()
    controller.dispose()
    doubleClick()
    expect(toggle).toHaveBeenCalledTimes(2)
  })

  it('skips press feedback when playback is unavailable and cancels it on disposal', () => {
    const toggle = vi.fn(() => false)
    const { stage, controller, media } = setup(8, vi.fn(), toggle)
    const disc = discAt(stage, 3)
    media.matches = true
    controller.setFocused(true)
    stage.dispatchEvent(pointerEvent('dblclick', disc, { button: 0 }))
    expect(clock.press).not.toHaveBeenCalled()
    toggle.mockReturnValue(true)
    stage.dispatchEvent(pointerEvent('dblclick', disc, { button: 0 }))
    expect(clock.press).toHaveBeenLastCalledWith(disc.parent, true)
    const cancelPress = clock.press.mock.results[0].value
    controller.dispose()
    expect(cancelPress).toHaveBeenCalledOnce()
  })

  it('rotates only in focus, couples the ring, retains angles and leaves browsing unchanged', () => {
    const { stage, controller, media } = setup(8, vi.fn())
    media.matches = true
    const disc = discAt(stage, 3)
    const ring = disc.parent!.children[1]
    const sidewall = disc.parent!.children[2]
    const shadow = disc.parent!.parent!.children[1]
    const initial = disc.style.transform
    expect(sidewall.style.opacity).toBe('0')
    expect(shadow.style.opacity).toBe('0')
    const drag = (): void => {
      stage.dispatchEvent(pointerEvent('pointerdown', disc, { button: 2 }))
      stage.dispatchEvent(
        pointerEvent('pointermove', stage, { buttons: 2, clientX: 180, clientY: 140 }),
      )
      stage.dispatchEvent(pointerEvent('pointerup', stage, { button: 2 }))
    }
    drag()
    expect(disc.style.transform).toBe(initial)
    controller.setFocused(true)
    expect(sidewall.style.opacity).toBe('1')
    const initialEdge = sidewall.children[0].attributes.get('d')
    const initialShadow = shadow.children[0].attributes.get('d')
    expect(shadow.style.opacity).toBe('0.12')
    expect(initialShadow).toMatch(/^M/)
    expect(shadow.style.transform).toBeUndefined()
    expect(initialEdge).toMatch(/^M/)
    drag()
    const rotated = disc.style.transform
    expect(rotated).not.toBe(initial)
    expect(ring.style.transform).toBe(rotated)
    expect(sidewall.children[0].attributes.get('d')).not.toBe(initialEdge)
    expect(shadow.children[0].attributes.get('d')).not.toBe(initialShadow)
    expect(shadow.children[0].attributes.get('d')).not.toMatch(/NaN|Infinity/)
    expect(shadow.style.filter).toMatch(/^blur\(/)
    expect(sidewall.children.every((band) => !/NaN|Infinity/.test(band.attributes.get('d')!))).toBe(
      true,
    )
    const menu = pointerEvent('contextmenu', stage)
    stage.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    media.matches = false
    stage.dispatchEvent(
      pointerEvent('pointermove', disc, { pointerType: 'mouse', buttons: 0, clientX: 350 }),
    )
    expect(clock.running).toBe(false)
    expect(disc.parent!.style.transform).toBe('perspective(1100px) rotateX(0deg) rotateY(0deg)')
    controller.setFocused(false)
    settle()
    expect(disc.style.transform).toBe(initial)
    expect(sidewall.style.opacity).toBe('0')
    expect(shadow.style.opacity).toBe('0')
    controller.setFocused(true)
    settle()
    expect(disc.style.transform).toBe(rotated)
    controller.dispose()
    const fresh = setup(8, vi.fn())
    fresh.media.matches = true
    fresh.controller.setFocused(true)
    expect(discAt(fresh.stage, 5).style.transform).toBe(initial)
    fresh.controller.dispose()
  })

  it('bounds focus rotation and ends dragging on cancellation, blur and capture loss', () => {
    const { stage, controller, media } = setup(8, vi.fn())
    media.matches = true
    controller.setFocused(true)
    const disc = discAt(stage, 5)
    for (const stop of ['pointercancel', 'lostpointercapture', 'blur']) {
      stage.dispatchEvent(pointerEvent('pointerdown', disc, { button: 2 }))
      stage.dispatchEvent(
        pointerEvent('pointermove', stage, { buttons: 2, clientX: 10000, clientY: -10000 }),
      )
      const transform = disc.style.transform
      const x = Number(transform.match(/rotateX\(([-\d.]+)deg\)/)![1])
      const y = Number(transform.match(/rotateY\(([-\d.]+)deg\)/)![1])
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(75.000001)
      if (stop === 'blur') window.dispatchEvent(new Event(stop))
      else stage.dispatchEvent(new Event(stop))
      stage.dispatchEvent(
        pointerEvent('pointermove', stage, { buttons: 2, clientX: 0, clientY: 0 }),
      )
      expect(disc.style.transform).toBe(transform)
      expect(disc.style.cursor).toBe('grab')
    }
    controller.dispose()
  })

  function expectScreenUpright(disc: TestElement): void {
    const radians = Math.PI / 180
    const rotation = (axis: string): number =>
      Number(disc.style.transform.match(new RegExp(`rotate${axis}\\(([-\\d.]+)deg\\)`))![1]) *
      radians
    const x = rotation('X'),
      y = rotation('Y'),
      z = rotation('Z')
    const a = Number(disc.children[0].style.transform.match(/rotate\(([-\d.]+)deg\)/)![1]) * radians
    const ux = Math.sin(a),
      uy = -Math.cos(a)
    const rx = ux * Math.cos(y) + uy * Math.sin(x) * Math.sin(y)
    const ry = uy * Math.cos(x)
    expect(rx * Math.cos(z) - ry * Math.sin(z)).toBeCloseTo(0, 8)
    expect(rx * Math.sin(z) + ry * Math.cos(z)).toBeLessThan(0)
  }

  it('randomizes artwork on right click, straightens on double click and excludes dragging', () => {
    vi.useFakeTimers()
    const { stage, controller, media, document } = setup(8, vi.fn())
    media.matches = true
    controller.setFocused(true)
    const disc = discAt(stage, 5)
    const art = disc.children[0]
    const pose = disc.style.transform
    const initial = art.style.transform
    const click = (): void => tap(stage, document, disc, { button: 2 })
    click()
    expect(art.style.transform).toBe(initial)
    vi.advanceTimersByTime(320)
    expect(art.style.transform).not.toBe(initial)
    expect(disc.style.transform).toBe(pose)
    const random = art.style.transform
    click()
    vi.advanceTimersByTime(100)
    click()
    expectScreenUpright(disc)
    const upright = art.style.transform
    vi.advanceTimersByTime(500)
    expect(art.style.transform).toBe(upright)
    expect(random).not.toBe(initial)
    stage.dispatchEvent(pointerEvent('pointerdown', disc, { button: 2 }))
    stage.dispatchEvent(pointerEvent('pointermove', stage, { buttons: 2, clientX: 180 }))
    stage.dispatchEvent(pointerEvent('pointermove', stage, { buttons: 2, clientX: 100 }))
    stage.dispatchEvent(pointerEvent('pointerup', stage, { button: 2 }))
    vi.advanceTimersByTime(500)
    expect(art.style.transform).toBe(upright)
    click()
    controller.setFocused(false)
    vi.advanceTimersByTime(500)
    expect(art.style.transform).toBe(upright)
    controller.setFocused(true)
    click()
    controller.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('spins continuously to a random angle and smoothly returns upright', () => {
    vi.useFakeTimers()
    const { stage, controller, media, document } = setup(8, vi.fn())
    media.matches = true
    controller.setFocused(true)
    media.matches = false
    const disc = discAt(stage, 5)
    const art = disc.children[0]
    const pose = disc.style.transform
    const angle = (): number => Number(art.style.transform.match(/rotate\(([-\d.]+)deg\)/)![1])
    const initial = angle()
    const click = (): void => tap(stage, document, disc, { button: 2 })
    click()
    vi.advanceTimersByTime(320)
    expect(angle()).toBe(initial)
    advance(10)
    const early = angle()
    expect(early).toBeGreaterThan(initial)
    advance(20)
    expect(angle()).toBeGreaterThan(early)
    expect(disc.style.transform).toBe(pose)
    settle()
    const resting = angle()
    click()
    click()
    expect(angle()).toBe(resting)
    advance(10)
    expect(angle()).not.toBe(resting)
    settle()
    expectScreenUpright(disc)
    // Recompute compensation after changing the perspective, not just the default pose.
    stage.dispatchEvent(pointerEvent('pointerdown', disc, { button: 2 }))
    stage.dispatchEvent(
      pointerEvent('pointermove', stage, { buttons: 2, clientX: 280, clientY: 30 }),
    )
    stage.dispatchEvent(pointerEvent('pointerup', stage, { button: 2, clientX: 280, clientY: 30 }))
    click()
    click()
    settle()
    expectScreenUpright(disc)
    click()
    vi.advanceTimersByTime(320)
    advance(5)
    controller.dispose()
    expect(clock.running).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('continuously follows mouse position on the same disc and returns to neutral', () => {
    const { stage, controller } = setup(8)
    const disc = discAt(stage, 3)
    const plane = disc.parent!
    const move = (clientX: number, clientY: number): void => {
      stage.dispatchEvent(
        pointerEvent('pointermove', disc, { pointerType: 'mouse', buttons: 0, clientX, clientY }),
      )
    }
    move(50, 50)
    advance(4)
    const first = plane.style.transform
    const follower = clock.update
    move(350, 350)
    expect(clock.update).toBe(follower)
    expect(plane.style.transform).toBe(first)
    advance(4)
    expect(plane.style.transform).not.toBe(first)
    settle()
    expect(plane.style.transform).toBe('perspective(1100px) rotateX(-3deg) rotateY(3deg)')

    move(200, 200)
    settle()
    expect(plane.style.transform).toBe('perspective(1100px) rotateX(0deg) rotateY(0deg)')
    move(350, 50)
    settle()
    expect(plane.style.transform).toBe('perspective(1100px) rotateX(3deg) rotateY(3deg)')
    stage.dispatchEvent(new Event('pointerleave'))
    advance(1)
    expect(plane.style.transform).not.toBe('perspective(1100px) rotateX(0deg) rotateY(0deg)')
    settle()
    expect(plane.style.transform).toBe('perspective(1100px) rotateX(0deg) rotateY(0deg)')
    controller.dispose()
  })

  it('stops hover following for reduced motion and disposal', () => {
    const { stage, controller, media } = setup(8)
    const disc = discAt(stage, 3)
    const move = (): void => {
      stage.dispatchEvent(pointerEvent('pointermove', disc, { pointerType: 'mouse', buttons: 0 }))
    }
    move()
    advance(2)
    media.matches = true
    media.dispatchEvent(new Event('change'))
    expect(clock.running).toBe(false)
    expect(disc.parent!.style.transform).toBe('perspective(1100px) rotateX(0deg) rotateY(0deg)')
    move()
    expect(clock.running).toBe(false)
    media.matches = false
    move()
    advance(2)
    controller.dispose()
    expect(clock.running).toBe(false)
    move()
    expect(clock.running).toBe(false)
  })

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
    expect(
      stage.children.filter((node) => node.style.willChange === 'transform, opacity'),
    ).toHaveLength(5)
    expect(stage.children.every((node) => node.children[0].children.length === 1)).toBe(true)
    controller.navigate(1)
    for (let frame = 0; frame < 260; frame++) {
      advance(1)
      expect(stage.children).toEqual(prepared)
      expect(
        stage.children.filter((node) => Number(node.style.opacity) > 0).length,
      ).toBeLessThanOrEqual(4)
      expect(
        stage.children.filter((node) => node.style.willChange === 'transform, opacity').length,
      ).toBeLessThanOrEqual(5)
      expect(stage.children.every((node) => node.children[0].children.length === 1)).toBe(true)
    }
    settle()
    expect(stage.children).toHaveLength(4)
    expect(stage.children.every((node) => prepared.includes(node))).toBe(true)
    expect(stage.children.every((node) => node.style.willChange === '')).toBe(true)
    expect(stage.children.every((node) => node.children.length === 2)).toBe(true)
    expect(stage.children.every((node) => node.children[0].children.length === 3)).toBe(true)
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
    expect(artLayers.every((art) => art.children.length === 0)).toBe(true)
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

  it('mounts a cover only when it decoded before that disc is shown', async () => {
    const resolvers = new Map<string, () => void>()
    vi.stubGlobal(
      'Image',
      class extends TestElement {
        decode(): Promise<void> {
          return new Promise((resolve) => {
            resolvers.set(this.src, resolve)
          })
        }
      },
    )
    const { stage, albums, controller } = setup(20)
    controller.setAlbums(
      albums.map((album) => ({ ...album, artworkUrl: `cover:${album.key}` })),
      true,
    )
    expect(resolvers.size).toBe(4)
    resolvers.forEach((resolve) => resolve())
    for (let step = 0; step < 6; step++) await Promise.resolve()
    const artOf = (slot: TestElement): TestElement => slot.children[0].children[0].children[0]
    expect(stage.children.filter((slot) => artOf(slot).children.length === 1)).toHaveLength(4)
    expect(resolvers.size).toBe(6)
    for (let frame = 0; frame < 180; frame++) advance(1)
    const exposed = stage.children.filter(
      (slot) => Number(slot.style.opacity) > 0 && artOf(slot).children.length === 0,
    )
    expect(exposed.length).toBeGreaterThan(0)
    resolvers.forEach((resolve) => resolve())
    await Promise.resolve()
    await Promise.resolve()
    advance(3)
    for (const slot of exposed) expect(artOf(slot).children.length).toBe(0)
    controller.dispose()
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

  it('draws playback wave ring over 3 seconds with ease-out curve and resists pause', () => {
    const change = vi.fn()
    const { stage, controller } = setup(8, change)
    controller.setFocused(true)
    settle()
    expect(change).toHaveBeenLastCalledWith(1, true)

    const selectedSlot = stage.children.find(
      (node) => node.attributes.get('data-selected') === 'true',
    )!
    const hoverPlane = selectedSlot.children[0]
    const waveRing = hoverPlane.children[1]
    const waveTrack = waveRing.children[0]
    const waveProgress = waveRing.children[1]

    // Initially stroke-dashoffset is 1 (hidden)
    expect(waveTrack.attributes.get('stroke-dashoffset')).toBe('1')

    // Start playback: triggers 3-second ease-out draw animation
    controller.setPlayback({ visible: true, playing: true, progress: 0.05, accent: '#62625b' })
    expect(clock.running).toBe(true)
    expect(waveRing.style.opacity).toBe('1')
    expect(waveProgress.attributes.get('stroke-dashoffset')).toBe('0.95')

    // Advance 1.5 seconds (90 frames at 60fps) -> p = 0.5, eased = 1 - (1 - 0.5)^3 = 0.875
    advance(90)
    const midOffset = Number(waveTrack.attributes.get('stroke-dashoffset'))
    expect(midOffset).toBeCloseTo(0.125, 2)

    // Advance another 1.5 seconds (90 frames) -> p = 1.0, fully closed at 3 seconds
    advance(90)
    expect(waveTrack.attributes.get('stroke-dashoffset')).toBe('0')

    controller.dispose()
  })

  it('completes the 3-second draw even if paused, and preserves progress across track switches', () => {
    const change = vi.fn()
    const { stage, controller } = setup(8, change)
    controller.setFocused(true)
    settle()

    const selectedSlot = stage.children.find(
      (node) => node.attributes.get('data-selected') === 'true',
    )!
    const waveRing = selectedSlot.children[0].children[1]
    const waveTrack = waveRing.children[0]

    // Start playback in paused state (playing: false)
    controller.setPlayback({ visible: true, playing: false, progress: 0, accent: '#62625b' })
    expect(clock.running).toBe(true)

    // Advance 1 second (60 frames) -> p = 1/3, eased = 1 - (2/3)^3 = 19/27 ≈ 0.7037
    advance(60)
    const offsetAfter1s = Number(waveTrack.attributes.get('stroke-dashoffset'))
    expect(offsetAfter1s).toBeCloseTo(1 - 19 / 27, 2)

    // Switch track midway within the 3 seconds: does not reset draw progress
    controller.setPlayback({ visible: true, playing: false, progress: 0.02, accent: '#888888' })
    expect(Number(waveTrack.attributes.get('stroke-dashoffset'))).toBeCloseTo(offsetAfter1s, 2)

    // Complete the remaining 2 seconds (120 frames)
    advance(120)
    expect(waveTrack.attributes.get('stroke-dashoffset')).toBe('0')
    // Since playing is false, animation halts after 3 seconds drawing finishes
    expect(clock.running).toBe(false)

    // Exiting focus resets draw progress
    controller.setFocused(false)
    settle()
    expect(waveTrack.attributes.get('stroke-dashoffset')).toBe('1')

    controller.dispose()
  })

  it('immediately settles wave ring drawing when reduced motion is preferred', () => {
    const change = vi.fn()
    const { stage, controller, media } = setup(8, change)
    media.matches = true
    controller.setFocused(true)
    settle()

    const selectedSlot = stage.children.find(
      (node) => node.attributes.get('data-selected') === 'true',
    )!
    const waveRing = selectedSlot.children[0].children[1]
    const waveTrack = waveRing.children[0]

    controller.setPlayback({ visible: true, playing: false, progress: 0, accent: '#62625b' })
    // Directly settled to 0 without 3-second drawing animation
    expect(waveTrack.attributes.get('stroke-dashoffset')).toBe('0')

    controller.dispose()
  })
})
