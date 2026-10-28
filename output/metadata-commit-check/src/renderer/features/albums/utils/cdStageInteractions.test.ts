import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCdStageInteractions, type CdStageInteractionSnapshot } from './cdStageInteractions'
import { createCdStageResources } from './cdStageResources'
import { installStageDOM, pointerEvent, stageClock } from './cdStageTestSupport'

vi.mock('@renderer/shared/animation/motion', async () => {
  const { stageClock } = await import('./cdStageTestSupport')
  return { animateFrames: stageClock.animateFrames, animateCdPress: stageClock.press }
})

afterEach(() => {
  stageClock.reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function setup() {
  const dom = installStageDOM()
  let state: CdStageInteractionSnapshot = {
    selected: 0,
    navigating: false,
    startup: false,
    focusProgress: 0,
    focusMoving: false,
    canFocus: true,
    count: 8,
    width: 1200,
    height: 700,
    reducedMotion: false,
  }
  const commands = {
    navigateStep: vi.fn(),
    moveToPosition: vi.fn(),
    startCruise: vi.fn(),
    endCruise: vi.fn(),
    setFocused: vi.fn(),
    togglePlayback: vi.fn(() => true),
    render: vi.fn(),
  }
  const resources = createCdStageResources(
    dom.stage,
    () => ({ width: 1200, height: 700 }),
    (node) => interactions.releaseNode(node),
  )
  const interactions = createCdStageInteractions(
    dom.stage,
    resources,
    () => ({ ...state }),
    commands,
  )
  const albums = Array.from({ length: 8 }, (_, index) => ({ key: String(index), artworkUrl: null }))
  resources.replaceAlbums(albums)
  const node = resources.ensure(0, false)
  dom.document.elementFromPoint.mockReturnValue(node.disc as never)
  const send = (type: string, overrides: Record<string, unknown> = {}) =>
    dom.stage.dispatchEvent(pointerEvent(type, node.disc, overrides))
  return {
    ...dom,
    node,
    resources,
    interactions,
    commands,
    albums,
    send,
    setState: (next: Partial<CdStageInteractionSnapshot>) => {
      state = { ...state, ...next }
    },
    dispose: () => {
      interactions.dispose()
      resources.dispose()
    },
  }
}

describe('CD stage interactions', () => {
  it('keeps click and swipe exclusive, and drops gestures on capture loss or node recycling', () => {
    const { send, commands, resources, dispose } = setup()
    send('pointerdown')
    send('pointermove', { clientX: 190 })
    send('pointerup')
    expect(commands.setFocused).not.toHaveBeenCalled()
    send('pointerdown')
    send('pointerup', { clientX: 140 })
    expect(commands.navigateStep).toHaveBeenCalledExactlyOnceWith(1)
    expect(commands.setFocused).not.toHaveBeenCalled()
    send('pointerdown')
    send('lostpointercapture')
    send('pointerup')
    expect(commands.setFocused).not.toHaveBeenCalled()
    send('pointerdown')
    resources.retain([])
    send('pointerup', { clientX: 140 })
    expect(commands.navigateStep).toHaveBeenCalledTimes(1)
    dispose()
  })

  it.each(['blur', 'cancel', 'release', 'dispose'] as const)(
    'cancels delayed right click on %s',
    (reason) => {
      vi.useFakeTimers()
      const { send, setState, node, resources, interactions, dispose } = setup()
      setState({ focusProgress: 1 })
      const angle = node.art.style.transform
      send('pointerdown', { button: 2, buttons: 2 })
      send('pointerup', { button: 2 })
      expect(vi.getTimerCount()).toBe(1)
      if (reason === 'blur') window.dispatchEvent(new Event('blur'))
      else if (reason === 'cancel') interactions.cancelArtworkClick()
      else if (reason === 'release') resources.retain([])
      else interactions.dispose()
      vi.advanceTimersByTime(500)
      stageClock.advance(120)
      expect(node.art.style.transform).toBe(angle)
      expect(vi.getTimerCount()).toBe(0)
      dispose()
    },
  )

  it('keeps focus rotation through refresh, excludes a dragged right click, and clears on disposal', () => {
    vi.useFakeTimers()
    const { send, setState, resources, interactions, albums, node, dispose } = setup()
    setState({ focusProgress: 1 })
    const angle = node.art.style.transform
    send('pointerdown', { button: 2, buttons: 2 })
    send('pointermove', { button: 2, buttons: 2, clientX: 250 })
    send('pointerup', { button: 2, clientX: 250 })
    const rotation = interactions.getFocusRotation()
    expect(rotation).not.toEqual({ x: 9, y: -42 })
    vi.advanceTimersByTime(500)
    expect(node.art.style.transform).toBe(angle)
    resources.replaceAlbums(albums)
    expect(interactions.getFocusRotation()).toEqual(rotation)
    dispose()
    expect(interactions.getFocusRotation()).toEqual({ x: 9, y: -42 })
  })

  it('distinguishes key release snapping from direct cancellation and ignores the previous direction release', () => {
    vi.useFakeTimers()
    const { interactions, commands, dispose } = setup()
    interactions.startKeyboardNavigation(1)
    expect(commands.navigateStep).toHaveBeenCalledExactlyOnceWith(1)
    vi.advanceTimersByTime(349)
    expect(commands.startCruise).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(commands.startCruise).toHaveBeenCalledExactlyOnceWith(1)
    interactions.startKeyboardNavigation(-1)
    commands.endCruise.mockClear()
    window.dispatchEvent(Object.assign(new Event('keyup'), { key: 'ArrowRight' }))
    expect(commands.endCruise).not.toHaveBeenCalled()
    vi.advanceTimersByTime(350)
    expect(commands.startCruise).toHaveBeenLastCalledWith(-1)
    interactions.stopKeyboardNavigation(-1)
    expect(commands.endCruise).toHaveBeenLastCalledWith(true)
    interactions.startKeyboardNavigation(1)
    interactions.clearKeyboardNavigation()
    expect(commands.endCruise).toHaveBeenLastCalledWith(false)
    expect(vi.getTimerCount()).toBe(0)
    dispose()
  })

  it('repeats reduced-motion steps despite stage stops, then cancels repeats and unregisters listeners', () => {
    vi.useFakeTimers()
    const { interactions, commands, setState, send, dispose } = setup()
    setState({ reducedMotion: true })
    commands.navigateStep.mockImplementation(() => interactions.clearKeyboardNavigation())
    interactions.startKeyboardNavigation(1)
    vi.advanceTimersByTime(350 + 180 * 2)
    expect(commands.navigateStep).toHaveBeenCalledTimes(4)
    expect(commands.startCruise).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(1000)
    expect(commands.navigateStep).toHaveBeenCalledTimes(4)
    dispose()
    commands.endCruise.mockClear()
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(Object.assign(new Event('keyup'), { key: 'ArrowRight' }))
    send('pointerdown')
    send('pointerup')
    expect(commands.endCruise).not.toHaveBeenCalled()
    expect(commands.setFocused).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels hover, spin, and press independently while another animation keeps running', () => {
    vi.useFakeTimers()
    const { interactions, send, setState, node, dispose } = setup()
    let otherFrames = 0
    const cancelOther = stageClock.animateFrames(() => {
      otherFrames++
      return true
    })
    send('pointermove', { buttons: 0, clientX: 350 })
    stageClock.advance(3)
    expect(stageClock.size).toBe(2)
    interactions.cancelPressAndTilt()
    expect(stageClock.size).toBe(1)
    setState({ focusProgress: 1 })
    send('pointerdown', { button: 2, buttons: 2 })
    send('pointerup', { button: 2 })
    vi.advanceTimersByTime(320)
    send('dblclick')
    const cancelPress = stageClock.press.mock.results[0].value
    stageClock.advance(3)
    const angle = node.art.style.transform
    interactions.cancelSpins()
    expect(cancelPress).not.toHaveBeenCalled()
    stageClock.advance(3)
    expect(node.art.style.transform).toBe(angle)
    expect(otherFrames).toBe(9)
    expect(stageClock.size).toBe(1)
    interactions.cancelPressAndTilt()
    expect(cancelPress).toHaveBeenCalledTimes(1)
    dispose()
    stageClock.advance(1)
    expect(otherFrames).toBe(10)
    cancelOther()
    expect(stageClock.running).toBe(false)
  })
})
