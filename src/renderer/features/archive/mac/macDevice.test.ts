import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountMacDevice } from './macDevice'
import { archiveSceneSession } from './archiveSceneSession'

const sky = vi.hoisted(() => ({
  draw: vi.fn(),
  resize: vi.fn(),
  reset: vi.fn(),
  pulse: vi.fn(),
  dispose: vi.fn(),
}))
vi.mock('./archiveStarfield', () => ({ createArchiveStarfield: () => sky }))
vi.mock('@renderer/i18n', () => ({ uiText: (key: string) => key }))

class TestNode extends EventTarget {
  dataset: Record<string, string> = {}
  values = new Map<string, string>()
  writeTransform = vi.fn()
  style = {
    setProperty: vi.fn((key: string, value: string) => this.values.set(key, value)),
    getPropertyValue: (key: string) => this.values.get(key) ?? '',
    transform: '',
    opacity: '',
  }
  clientWidth = 1200
  clientHeight = 800
  width = 512
  height = 544
  inert = false
  classList = { add: vi.fn(), remove: vi.fn() }
  setAttribute = vi.fn()
  focus = vi.fn()
  setPointerCapture = vi.fn()
  hasPointerCapture = () => true
  releasePointerCapture = vi.fn()
  getContext = () => null
  getBoundingClientRect = () => ({ left: 0, top: 0 })
  closest = () => null

  constructor() {
    super()
    let transform = ''
    Object.defineProperty(this.style, 'transform', {
      get: () => transform,
      set: (value: string) => {
        transform = value
        this.writeTransform(value)
      },
    })
  }
}

function setup(ready = false) {
  vi.useFakeTimers()
  archiveSceneSession.entered = ready
  const nodes = new Map<string, TestNode>()
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, new TestNode())
    return nodes.get(id)!
  }
  const root = Object.assign(new EventTarget(), { getElementById: node, querySelector: node })
  const media = Object.assign(new EventTarget(), { matches: false })
  const document = Object.assign(new EventTarget(), { hidden: false })
  const window = Object.assign(new EventTarget(), { matchMedia: () => media })
  vi.stubGlobal('document', document)
  vi.stubGlobal('window', window)
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(++id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
  let resize = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resize = cb
      }
      observe() {}
      disconnect = disconnect
    },
  )
  const controller = mountMacDevice(root as unknown as ShadowRoot)
  const frame = (time: number) => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((cb) => cb(time))
  }
  return {
    controller,
    frame,
    frames,
    node,
    document,
    media,
    root,
    resize: () => resize(),
    disconnect,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  archiveSceneSession.entered = false
})

describe('archive scene rendering cadence', () => {
  it.each([30, 60, 120, 144, 240])(
    'limits star painting at %i Hz without slowing its clock or rewriting the settled pose',
    (hz) => {
      const { controller, frame, node } = setup(true)
      sky.draw.mockClear()
      node('rig').writeTransform.mockClear()
      node('rig').style.setProperty.mockClear()
      frame(0)
      for (let i = 1; i <= hz; i++) frame((i * 1000) / hz)
      expect(sky.draw.mock.calls.length).toBe(Math.min(hz, 60) + 1)
      const elapsed = sky.draw.mock.calls.reduce((sum, [value]) => sum + value.dt, 0)
      expect(elapsed).toBeCloseTo(1, 6)
      expect(node('rig').writeTransform).not.toHaveBeenCalled()
      expect(node('rig').style.setProperty).not.toHaveBeenCalled()
      controller.dispose()
    },
  )

  it.each([60, 144, 240])(
    'preserves travel time, distance and the disk flight pose at %i Hz',
    (hz) => {
      const { controller, frame, node } = setup()
      controller.enter()
      frame(0)
      for (let i = 1; i <= Math.ceil(hz * 1.5); i++) frame((i * 1000) / hz)
      expect(node('archive-mac-shell').dataset.scene).toBe('ready')
      const distance = sky.draw.mock.calls.reduce((sum, [value]) => sum + value.distance, 0)
      expect(distance).toBeCloseTo(8.6, 6)
      expect(node('hologram').style.opacity).toBe('1')
      expect(node('hologram').style.transform).toBe('translateY(0px)')
      expect(node('rig').style.getPropertyValue('--tilt-y')).toBe('23deg')
      expect(node('rig').style.getPropertyValue('--tilt-x')).toBe('-8deg')
      expect(node('rig').style.transform).toContain('rotateY(23deg)')
      expect(node('rig').style.transform).toContain(node('rig').style.getPropertyValue('--zoom'))
      controller.dispose()
    },
  )

  it('updates drag feedback immediately without an extra star paint', () => {
    const { controller, node } = setup()
    const rig = node('rig')
    rig.dispatchEvent(
      Object.assign(new Event('pointerdown'), { button: 0, pointerId: 1, clientX: 0, clientY: 0 }),
    )
    const count = sky.draw.mock.calls.length
    rig.dispatchEvent(
      Object.assign(new Event('pointermove'), { pointerId: 1, clientX: 100, clientY: 20 }),
    )
    expect(rig.style.transform).toContain('rotateY(68deg)')
    expect(sky.draw).toHaveBeenCalledTimes(count)
    controller.dispose()
  })

  it('pauses while hidden, resumes without catch-up and releases all clocks on disposal', () => {
    const { controller, frame, frames, document, disconnect } = setup(true)
    frame(0)
    frame(1000 / 240)
    document.hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    document.hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    frame(10000)
    frame(10000 + 1000 / 60)
    expect(sky.draw.mock.calls.every(([value]) => value.dt < 0.065)).toBe(true)
    controller.dispose()
    expect(frames.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(sky.dispose).toHaveBeenCalledOnce()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
  })

  it('settles reduced motion and keeps resized geometry and pointer feedback usable', () => {
    const { controller, frame, frames, node, media, resize } = setup()
    controller.enter()
    frame(0)
    frame(30)
    media.matches = true
    media.dispatchEvent(Object.assign(new Event('change'), { matches: true }))
    expect(node('archive-mac-shell').dataset.scene).toBe('ready')
    expect(frames.size).toBe(0)
    node('archive-mac-shell').clientWidth = 600
    resize()
    expect(sky.resize).toHaveBeenLastCalledWith(600, 800)
    const shell = node('archive-mac-shell')
    shell.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 40, clientY: 60 }))
    expect(sky.draw).toHaveBeenLastCalledWith(
      expect.objectContaining({ pointerX: 40, pointerY: 60, reduced: true }),
    )
    controller.returnToIntro()
    expect(shell.dataset.scene).toBe('intro')
    expect(node('hologram').style.opacity).toBe('0')
    controller.dispose()
  })

  it('suspends with document.hidden false, keeps travel progress and resumes without catch-up', () => {
    const { controller, frame, frames, node, document, resize } = setup()
    controller.enter()
    frame(0)
    frame(40)
    const pose = node('rig').style.transform
    controller.setVisible(false)
    expect(document.hidden).toBe(false)
    expect(frames.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    const paints = sky.draw.mock.calls.length
    resize()
    document.dispatchEvent(new Event('visibilitychange'))
    frame(10000)
    expect(sky.draw).toHaveBeenCalledTimes(paints)
    expect(node('rig').style.transform).toBe(pose)
    controller.setVisible(true)
    frame(20000)
    expect(node('rig').style.transform).toBe(pose)
    expect(node('archive-mac-shell').dataset.scene).toBe('travel')
    for (let i = 1; i <= 90; i++) frame(20000 + (i * 1000) / 60)
    expect(node('archive-mac-shell').dataset.scene).toBe('ready')
    expect(sky.draw.mock.calls.every(([value]) => value.dt < 0.065)).toBe(true)
    controller.dispose()
    controller.setVisible(false)
    controller.setVisible(true)
    expect(frames.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('requires both document and window visibility, including reduced motion changes', () => {
    const { controller, frames, document, media } = setup(true)
    controller.setVisible(false)
    document.hidden = true
    controller.setVisible(true)
    expect(frames.size).toBe(0)
    document.hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(1)
    controller.setVisible(false)
    const paints = sky.draw.mock.calls.length
    media.matches = true
    media.dispatchEvent(new Event('change'))
    expect(sky.draw).toHaveBeenCalledTimes(paints)
    expect(vi.getTimerCount()).toBe(0)
    controller.setVisible(true)
    expect(frames.size).toBe(0)
    expect(sky.draw.mock.calls.length).toBeGreaterThan(paints)
    controller.dispose()
  })
})
