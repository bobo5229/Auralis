import { createRenderer, nextTick, shallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBadgeInspection } from './useBadgeInspection'
import type { InspectBadge } from '../runtime/badgeInspectRenderer'

const mocks = vi.hoisted(() => ({
  motion: { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  graphics: {
    load: vi.fn(),
    prepare: vi.fn(),
    activatePrepared: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    cancelLoad: vi.fn(),
    dispose: vi.fn(),
    snapshot: vi.fn(),
    forceContextLoss: vi.fn(),
  },
}))
vi.mock('@renderer/shared/animation/motionPreference', () => ({
  createReducedMotionQuery: () => mocks.motion,
}))
vi.mock('../runtime/badgeInspectRenderer', () => ({
  createInspectRenderer: () => mocks.graphics,
}))

// Mount the real composable so its unmount hooks run; only DOM/GPU and time are external fakes.
const renderer = createRenderer<object, object>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  insert: () => {},
  remove: () => {},
  setText: () => {},
  setElementText: () => {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp: () => {},
})
let clock = 0,
  serial = 0
const frames = new Map<number, FrameRequestCallback>()
const resizeCallbacks: Array<() => void> = []
const apps: Array<ReturnType<typeof renderer.createApp>> = []
function step(milliseconds: number) {
  clock += milliseconds
  const callbacks = [...frames.values()]
  frames.clear()
  for (const callback of callbacks) callback(clock)
}
function deferred() {
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function badge(id: string) {
  return { id, state: 'lit' } as InspectBadge
}
function button() {
  return {
    scrollIntoView: vi.fn(),
    focus: vi.fn(),
    isConnected: true,
    querySelector: () => ({
      getBoundingClientRect: () => ({ left: 200, top: 300, width: 174, height: 195 }),
    }),
  } as unknown as HTMLButtonElement
}
function fixture() {
  const stage = {
    style: { transform: '', opacity: '' },
    focus: vi.fn(),
    getBoundingClientRect: () => ({ left: 510, top: 214, width: 420, height: 471 }),
  }
  const caption = { style: { top: '' }, offsetHeight: 74 }
  const callbacks = { onLift: vi.fn(), onReturn: vi.fn(), onError: vi.fn(), onSwitchError: vi.fn() }
  let inspection!: ReturnType<typeof useBadgeInspection>
  const app = renderer.createApp({
    setup() {
      inspection = useBadgeInspection({
        stage: shallowRef(stage as unknown as HTMLElement),
        canvas: shallowRef({} as HTMLCanvasElement),
        caption: shallowRef(caption as unknown as HTMLElement),
        ...callbacks,
      })
      return () => null
    },
  })
  app.mount({})
  apps.push(app)
  return { inspection, stage, caption, app, ...callbacks }
}
async function opened() {
  const f = fixture()
  const sourceButton = button()
  await f.inspection.open(badge('first'), sourceButton)
  step(1080)
  expect(f.inspection.phase.value).toBe('inspecting')
  return { ...f, sourceButton }
}
beforeEach(() => {
  vi.clearAllMocks()
  clock = serial = 0
  frames.clear()
  resizeCallbacks.length = 0
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback)
      }
      observe() {}
      disconnect() {}
    },
  )
  mocks.motion.matches = false
  mocks.graphics.load.mockResolvedValue(true)
  mocks.graphics.prepare.mockResolvedValue(true)
  mocks.graphics.activatePrepared.mockReturnValue(true)
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.stubGlobal('innerWidth', 1440)
  vi.stubGlobal('innerHeight', 900)
  vi.stubGlobal('devicePixelRatio', 1.5)
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++serial, callback)
    return serial
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('badge inspection handoff', () => {
  it('reserves caption and bottom-control space and reacts to taller localized text', async () => {
    vi.stubGlobal('innerWidth', 680)
    vi.stubGlobal('innerHeight', 620)
    const f = await opened()
    const stageHeight = Number.parseFloat((f.stage.style as unknown as CSSStyleDeclaration).height)
    expect(stageHeight).toBeCloseTo(406)
    expect(Number.parseFloat(f.caption.style.top) + f.caption.offsetHeight).toBeCloseTo(528)
    f.caption.offsetHeight = 100
    resizeCallbacks[0]()
    step(16)
    expect(Number.parseFloat((f.stage.style as unknown as CSSStyleDeclaration).height)).toBeCloseTo(
      380,
    )
    expect(Number.parseFloat(f.caption.style.top) + f.caption.offsetHeight).toBeCloseTo(528)
    expect(f.inspection.snapshot().running).toBe(false)
  })

  it('recenters and redraws the current badge on resize while its target is still loading', async () => {
    const f = await opened()
    const target = deferred()
    mocks.graphics.prepare.mockReturnValueOnce(target.promise)
    const switching = f.inspection.switchTo(badge('next'), button(), 1)
    const draws = mocks.graphics.render.mock.calls.length
    vi.stubGlobal('innerWidth', 900)
    vi.stubGlobal('innerHeight', 620)
    window.dispatchEvent(new Event('resize'))
    step(16)
    expect(f.inspection.phase.value).toBe('switch-loading')
    expect(f.inspection.badgeId.value).toBe('first')
    const position = f.stage.style.transform.match(/translate\(([^p]+)px, ([^p]+)px\)/)!
    expect(Number(position[1])).toBeCloseTo(240)
    expect(Number(position[2])).toBeCloseTo(25.54545)
    expect(mocks.graphics.render).toHaveBeenCalledTimes(draws + 1)
    expect(mocks.graphics.activatePrepared).not.toHaveBeenCalled()
    expect(f.inspection.snapshot().running).toBe(false)
    target.resolve(true)
    await switching
    step(220)
    step(220)
    expect(f.inspection.phase.value).toBe('inspecting')
    expect(f.inspection.badgeId.value).toBe('next')
  })

  it('holds the current badge while preparing, then uses the same easing for both slides', async () => {
    const f = await opened()
    const target = deferred()
    mocks.graphics.prepare.mockReturnValueOnce(target.promise)
    const switching = f.inspection.switchTo(badge('next'), button(), 1)
    expect(f.inspection.phase.value).toBe('switch-loading')
    expect(f.inspection.badgeId.value).toBe('first')
    expect(f.onReturn).not.toHaveBeenCalled()
    target.resolve(true)
    await switching
    step(55)
    const outgoingProgress = 1 - Number(f.stage.style.opacity)
    expect(outgoingProgress).toBeCloseTo(0.0625)
    expect(f.stage.style.transform).toContain('translateX(-4px)')
    step(165)
    expect(f.inspection.phase.value).toBe('switch-in')
    expect(f.inspection.badgeId.value).toBe('next')
    expect(f.onReturn).toHaveBeenCalledExactlyOnceWith('first')
    step(55)
    expect(Number(f.stage.style.opacity)).toBeCloseTo(outgoingProgress)
    expect(f.stage.style.transform).toContain('translateX(60px)')
    step(165)
    expect(f.inspection.phase.value).toBe('inspecting')
    expect(f.inspection.snapshot().running).toBe(false)
    expect(mocks.graphics.load).toHaveBeenCalledOnce()
  })

  it('reverses previous navigation and ignores repeated input during a handoff', async () => {
    const f = await opened()
    await f.inspection.switchTo(badge('previous'), button(), -1)
    await f.inspection.switchTo(badge('extra'), button(), 1)
    expect(mocks.graphics.prepare).toHaveBeenCalledOnce()
    step(110)
    expect(f.stage.style.transform).toContain('translateX(32px)')
    step(110)
    step(110)
    expect(f.stage.style.transform).toContain('translateX(-32px)')
  })

  it('retains the current inspection when the target cannot load', async () => {
    const f = await opened()
    mocks.graphics.prepare.mockRejectedValueOnce(new Error('missing image'))
    await f.inspection.switchTo(badge('next'), button(), 1)
    expect(f.inspection.phase.value).toBe('inspecting')
    expect(f.inspection.badgeId.value).toBe('first')
    expect(f.onSwitchError).toHaveBeenCalledOnce()
    expect(f.onError).not.toHaveBeenCalled()
    expect(f.onReturn).not.toHaveBeenCalled()
    expect(mocks.graphics.dispose).not.toHaveBeenCalled()
  })

  it('invalidates a pending switch on close and restores the original source focus', async () => {
    const f = await opened()
    const target = deferred()
    mocks.graphics.prepare.mockReturnValueOnce(target.promise)
    const switching = f.inspection.switchTo(badge('next'), button(), 1)
    f.inspection.close()
    step(420)
    await nextTick()
    target.resolve(true)
    await switching
    expect(f.inspection.phase.value).toBe('closed')
    expect(mocks.graphics.activatePrepared).not.toHaveBeenCalled()
    expect(f.onLift).toHaveBeenCalledExactlyOnceWith('first')
    expect(f.onReturn).toHaveBeenCalledExactlyOnceWith('first')
    expect(f.sourceButton.focus).toHaveBeenCalledOnce()
  })

  it('switches atomically without moving phases when motion is reduced', async () => {
    const f = await opened()
    mocks.motion.matches = true
    await f.inspection.switchTo(badge('next'), button(), 1)
    expect(f.inspection.phase.value).toBe('inspecting')
    expect(f.inspection.badgeId.value).toBe('next')
    expect(f.stage.style.opacity).toBe('1')
    expect(f.inspection.snapshot().running).toBe(false)
  })

  it('disposes the session without activating an asynchronously prepared target after unmount', async () => {
    const f = await opened()
    const target = deferred()
    mocks.graphics.prepare.mockReturnValueOnce(target.promise)
    const switching = f.inspection.switchTo(badge('next'), button(), 1)
    f.app.unmount()
    apps.splice(apps.indexOf(f.app), 1)
    target.resolve(true)
    await switching
    expect(mocks.graphics.dispose).toHaveBeenCalledOnce()
    expect(mocks.graphics.activatePrepared).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })
})
