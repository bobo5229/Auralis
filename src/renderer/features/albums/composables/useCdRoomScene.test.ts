import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, markRaw, nextTick, reactive, ref } from 'vue'
import { createCdStage } from '../utils/cdStageController'
import { useCdRoomScene } from './useCdRoomScene'
import { stageClock } from '../utils/cdStageTestSupport'

vi.mock('@renderer/shared/animation/motion', async () => {
  const { stageClock } = await import('../utils/cdStageTestSupport')
  return { animateProgress: stageClock.animateProgress }
})

vi.mock('../utils/cdStageController', () => ({ createCdStage: vi.fn() }))

class ElementStub {
  style = { setProperty: vi.fn(), opacity: '', transform: '', visibility: '' }
  focus = vi.fn()
  closest = vi.fn(() => null as object | null)
  matches = vi.fn(() => false)
  contains = vi.fn(() => false)
  getBoundingClientRect = vi.fn(() => ({ left: 20, top: 30, width: 800, height: 600 }))
  offsetLeft = 660
  inert = false
  isContentEditable = false
  children: ElementStub[] = []
  canvas = { remove: vi.fn() }
  material = { removeAttribute: vi.fn() }
  querySelectorAll = vi.fn((selector: string) =>
    selector === '.cd-material-canvas' ? [this.canvas] : [this.material],
  )
  append = vi.fn((...nodes: ElementStub[]) => this.children.push(...nodes))
  cloneNode = vi.fn((): ElementStub => markRaw(new ElementStub()))
}

const cleanups: (() => void)[] = []
function fixture() {
  vi.stubGlobal('HTMLElement', ElementStub)
  vi.stubGlobal('Element', ElementStub)
  vi.stubGlobal('Node', ElementStub)
  const body = markRaw(new ElementStub())
  const doc = { body, activeElement: body }
  vi.stubGlobal('document', doc)
  const win = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('window', win)
  const reducedMotion = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const theme = ref<'light' | 'dark'>('light')
  const playbackRing = reactive({ visible: false, playing: false, progress: 0, accent: 'red' })
  const settleInfo = vi.fn()
  const back = vi.fn()
  const togglePlayback = vi.fn(() => true)
  const state = { loading: false, failed: false, disposed: false }
  const stage = markRaw(new ElementStub())
  const controller = {
    setAlbums: vi.fn(),
    setFocused: vi.fn(),
    focusAlbum: vi.fn(),
    startKeyboardNavigation: vi.fn(),
    stopKeyboardNavigation: vi.fn(),
    setMaterialAppearance: vi.fn(),
    setPlayback: vi.fn(),
    setVibrationOffset: vi.fn(),
    dispose: vi.fn(() => {
      stage.children = []
    }),
  }
  vi.mocked(createCdStage)
    .mockClear()
    .mockReturnValue(controller as unknown as ReturnType<typeof createCdStage>)
  const scope = effectScope()
  const scene = scope.run(() =>
    useCdRoomScene({
      canvasTheme: () => theme.value,
      reducedMotion,
      isDisposed: () => state.disposed,
      isLoading: () => state.loading,
      hasFailed: () => state.failed,
      settleInfo,
      setRapidBrowse: vi.fn(),
      playbackRing: () => ({ ...playbackRing }),
      togglePlayback,
      back,
      claimStartupEntry: vi.fn(async () => ({ firstEntry: true })),
      requestedAlbumKey: null,
      fromIndexViewSwitch: false,
    }),
  )!
  const page = markRaw(new ElementStub())
  scene.pageRef.value = page as unknown as HTMLElement
  scene.stageRef.value = stage as unknown as HTMLElement
  scene.trackPanelRef.value = markRaw(new ElementStub()) as unknown as HTMLElement
  scene.controlsRef.value = markRaw(new ElementStub()) as unknown as HTMLElement
  cleanups.push(() => {
    state.disposed = true
    scene.dispose(false)
    scope.stop()
  })
  function focusOptions() {
    return vi.mocked(createCdStage).mock.calls[0][5]!
  }
  function key(key: string, overrides = {}) {
    const event = {
      key,
      target: stage,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...overrides,
    }
    scene.onKeydown(event as unknown as KeyboardEvent)
    return event
  }
  return {
    scene,
    stage,
    page,
    doc,
    win,
    state,
    controller,
    reducedMotion,
    theme,
    playbackRing,
    settleInfo,
    back,
    togglePlayback,
    focusOptions,
    key,
  }
}
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllGlobals()
  stageClock.reset()
})

describe('useCdRoomScene', () => {
  it('fades at the old dock before movement and reveals at the new dock only after settling', async () => {
    const f = fixture()
    const info = markRaw(new ElementStub())
    f.scene.playbackInfoRef.value = info as unknown as HTMLElement
    await nextTick()
    f.reducedMotion.matches = false
    f.scene.mount()
    f.focusOptions().change(0.0001, false)
    const move = vi.fn()
    f.focusOptions().beforeMove!(move)
    stageClock.advance(4)
    expect(Number(info.style.opacity)).toBeGreaterThan(0)
    expect(Number(info.style.opacity)).toBeLessThan(1)
    expect(move).not.toHaveBeenCalled()
    expect(f.scene.playbackInfoFocused.value).toBe(false)
    stageClock.advance(5)
    expect(info.style.opacity).toBe('0')
    expect(move).toHaveBeenCalledOnce()
    f.focusOptions().change(0.5, false)
    expect(info.style.opacity).toBe('0')
    f.focusOptions().change(1, true)
    expect(f.scene.playbackInfoFocused.value).toBe(true)
    expect(info.style.opacity).toBe('0')
    await nextTick()
    stageClock.advance(6)
    expect(Number(info.style.opacity)).toBeGreaterThan(0)
    expect(Number(info.style.opacity)).toBeLessThan(1)

    // An exit during fade-in resumes from the current opacity without a flash.
    const interrupted = info.style.opacity
    f.focusOptions().change(1, false)
    const exit = vi.fn()
    f.focusOptions().beforeMove!(exit)
    expect(info.style.opacity).toBe(interrupted)
    stageClock.advance(9)
    expect(exit).toHaveBeenCalledOnce()
    expect(info.style.opacity).toBe('0')
    expect(f.scene.playbackInfoFocused.value).toBe(true)
    f.focusOptions().change(0, true)
    await nextTick()
    stageClock.advance(14)
    expect(f.scene.playbackInfoFocused.value).toBe(false)
    expect(info.style.opacity).toBe('1')
  })

  it('cancels preparation on reversal or disposal and skips fades under reduced motion', async () => {
    const f = fixture()
    const info = markRaw(new ElementStub())
    f.scene.playbackInfoRef.value = info as unknown as HTMLElement
    await nextTick()
    f.scene.mount()
    const immediate = vi.fn()
    f.focusOptions().beforeMove!(immediate)
    expect(immediate).toHaveBeenCalledOnce()
    expect(stageClock.running).toBe(false)

    info.style.opacity = '1'
    f.reducedMotion.matches = false
    const stale = vi.fn()
    const cancel = f.focusOptions().beforeMove!(stale)
    stageClock.advance(3)
    cancel()
    const latest = vi.fn()
    f.focusOptions().beforeMove!(latest)
    stageClock.advance(9)
    expect(stale).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
    info.style.opacity = '1'
    const disposed = vi.fn()
    f.focusOptions().beforeMove!(disposed)
    f.state.disposed = true
    f.scene.dispose(false)
    stageClock.advance(20)
    expect(disposed).not.toHaveBeenCalled()
    expect(stageClock.running).toBe(false)
  })

  it('restores information if the stage resets while waiting for fade-out', async () => {
    const f = fixture()
    const info = markRaw(new ElementStub())
    f.scene.playbackInfoRef.value = info as unknown as HTMLElement
    await nextTick()
    f.scene.mount()
    f.reducedMotion.matches = false
    f.focusOptions().change(0.0001, false)
    const move = vi.fn()
    const cancel = f.focusOptions().beforeMove!(move)
    stageClock.advance(4)
    // A catalog refresh resets focus, then releases the pending preparation.
    f.focusOptions().change(0, true)
    cancel()
    await nextTick()
    stageClock.advance(14)
    expect(move).not.toHaveBeenCalled()
    expect(info.style.opacity).toBe('1')
    expect(f.scene.playbackInfoFocused.value).toBe(false)
  })

  it('binds the real stage contract and syncs geometry, selection, ring and material', async () => {
    const f = fixture()
    expect(f.scene.mount()).toBe(true)
    expect(f.focusOptions().geometry()).toEqual({ cx: 400, cy: 300, rightBoundary: 660 })
    const callbacks = vi.mocked(createCdStage).mock.calls[0]
    callbacks[1](2)
    expect(f.scene.selected.value).toBe(2)
    expect(f.scene.infoSelected.value).toBe(2)
    callbacks[2]!(3)
    expect(f.scene.selected.value).toBe(2)
    expect(f.scene.infoSelected.value).toBe(3)
    callbacks[3]!(true)
    expect(f.scene.starting.value).toBe(true)
    expect(f.focusOptions().togglePlayback!()).toBe(true)
    expect(f.togglePlayback).toHaveBeenCalledOnce()
    f.theme.value = 'dark'
    f.scene.setDiscSurface('vinyl')
    f.playbackRing.visible = true
    f.playbackRing.progress = 0.5
    await nextTick()
    expect(f.stage.style.setProperty).toHaveBeenCalledWith('--cd-vinyl', '1')
    expect(f.controller.setMaterialAppearance).toHaveBeenLastCalledWith({ dark: true, vinyl: 1 })
    expect(f.controller.setPlayback).toHaveBeenLastCalledWith({ ...f.playbackRing })
  })

  it('preserves the focus transition, panel reveal and focus hand-off', () => {
    const f = fixture()
    f.scene.mount()
    f.stage.focus.mockClear()
    f.focusOptions().change(0.5, false)
    expect(f.scene.focused.value).toBe(true)
    expect(f.scene.focusSettled.value).toBe(false)
    expect(f.settleInfo).toHaveBeenCalledOnce()
    expect(f.scene.trackPanelRef.value!.style.visibility).toBe('hidden')
    f.focusOptions().change(1, true)
    expect(f.scene.focusSettled.value).toBe(true)
    expect(f.scene.trackPanelRef.value!.style.opacity).toBe('1')
    expect(f.stage.focus).not.toHaveBeenCalled()
    f.focusOptions().change(0, true)
    expect(f.scene.focused.value).toBe(false)
    expect(f.stage.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('keeps keyboard guards, continuous navigation, focus and Escape behavior', () => {
    const f = fixture()
    f.scene.mount()
    f.key('ArrowRight')
    expect(f.controller.startKeyboardNavigation).toHaveBeenLastCalledWith(1)
    f.key('ArrowLeft')
    expect(f.controller.startKeyboardNavigation).toHaveBeenLastCalledWith(-1)
    const started = f.controller.startKeyboardNavigation.mock.calls.length
    f.key('ArrowRight', { repeat: true })
    f.key('ArrowRight', { ctrlKey: true })
    f.key('ArrowRight', { isComposing: true })
    f.key('ArrowRight', { defaultPrevented: true })
    const input = new ElementStub()
    input.matches.mockReturnValue(true)
    f.key('ArrowRight', { target: input })
    const menu = new ElementStub()
    menu.closest.mockReturnValue({})
    f.key('ArrowRight', { target: menu })
    f.state.loading = true
    f.key('ArrowRight')
    f.state.loading = false
    f.state.failed = true
    f.key('ArrowRight')
    expect(f.controller.startKeyboardNavigation).toHaveBeenCalledTimes(started)
    f.key('Enter')
    expect(f.controller.setFocused).toHaveBeenCalledWith(true)
    f.scene.focused.value = true
    const escape = f.key('Escape')
    expect(escape.preventDefault).toHaveBeenCalledOnce()
    expect(escape.stopPropagation).toHaveBeenCalledOnce()
    expect(f.back).toHaveBeenCalledOnce()
  })

  it('keeps existing view-switch focus and stops navigation only when focus leaves the page', () => {
    const f = fixture()
    f.doc.activeElement.closest.mockReturnValue({})
    f.scene.mount()
    expect(f.stage.focus).not.toHaveBeenCalled()
    f.page.contains.mockReturnValue(true)
    f.scene.onBrowseFocusOut({ relatedTarget: new ElementStub() } as unknown as FocusEvent)
    expect(f.controller.stopKeyboardNavigation).not.toHaveBeenCalled()
    f.scene.onBrowseFocusOut({ relatedTarget: null } as FocusEvent)
    expect(f.controller.stopKeyboardNavigation).toHaveBeenCalledOnce()
  })

  it('releases listeners and stage immediately while keeping inert CSS leave copies', async () => {
    const f = fixture()
    f.scene.mount()
    f.reducedMotion.matches = false
    const disc = markRaw(new ElementStub())
    f.stage.children = [disc]
    f.state.disposed = true
    f.scene.dispose(true)
    expect(f.page.inert).toBe(true)
    expect(f.controller.dispose).toHaveBeenCalledOnce()
    const copy = f.stage.children[0]
    expect(copy).not.toBe(disc)
    expect(copy.canvas.remove).toHaveBeenCalledOnce()
    expect(copy.material.removeAttribute).toHaveBeenCalledWith('data-material-ready')
    expect(f.reducedMotion.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    expect(f.win.removeEventListener).toHaveBeenCalledWith('resize', f.settleInfo)
    const updates = f.controller.setPlayback.mock.calls.length
    f.playbackRing.progress = 0.9
    await nextTick()
    expect(f.controller.setPlayback).toHaveBeenCalledTimes(updates)
    f.scene.setVibrationOffset(4)
    expect(f.controller.setVibrationOffset).not.toHaveBeenCalled()
  })
})
