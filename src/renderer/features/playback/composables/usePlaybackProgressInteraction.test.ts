import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  clampProgressRatio,
  resolveProgressPointerRatio,
  usePlaybackProgressInteraction,
} from './usePlaybackProgressInteraction'

function createPointerTarget() {
  const captures = new Set<number>()
  return {
    getBoundingClientRect: () => ({ left: 100, width: 200 }),
    setPointerCapture: vi.fn((pointerId: number) => captures.add(pointerId)),
    hasPointerCapture: vi.fn((pointerId: number) => captures.has(pointerId)),
    releasePointerCapture: vi.fn((pointerId: number) => captures.delete(pointerId)),
  }
}

function pointerEvent(
  currentTarget: ReturnType<typeof createPointerTarget>,
  clientX: number,
  pointerId = 7,
): PointerEvent {
  return {
    currentTarget,
    button: 0,
    clientX,
    pointerId,
    preventDefault: vi.fn(),
  } as unknown as PointerEvent
}

function setup(activeInitially = false, maxVisualFps?: number) {
  const duration = ref(100)
  const currentTime = ref(20)
  const isPlaying = ref(false)
  const active = ref(activeInitially)
  const seekByRatio = vi.fn()
  const seekTo = vi.fn()
  const renderRatio = vi.fn()
  const unsubscribe = vi.fn()
  const subscribeFrame = vi.fn<(callback: (now: number) => void) => () => void>(() => unsubscribe)
  const interaction = usePlaybackProgressInteraction({
    duration,
    currentTime,
    isPlaying,
    active,
    seekByRatio,
    seekTo,
    renderRatio,
    maxVisualFps,
    resolveSeekStepSeconds: (shiftKey) => (shiftKey ? 10 : 5),
    subscribeFrame,
    now: () => 1000,
  })
  return {
    duration,
    currentTime,
    isPlaying,
    active,
    seekByRatio,
    seekTo,
    renderRatio,
    unsubscribe,
    subscribeFrame,
    interaction,
  }
}

describe('progress ratio helpers', () => {
  it('clamps pointer positions and invalid geometry', () => {
    expect(resolveProgressPointerRatio(50, 100, 200)).toBe(0)
    expect(resolveProgressPointerRatio(200, 100, 200)).toBe(0.5)
    expect(resolveProgressPointerRatio(400, 100, 200)).toBe(1)
    expect(resolveProgressPointerRatio(100, 100, 0)).toBe(0)
    expect(clampProgressRatio(Number.NaN)).toBe(0)
  })
})

describe('usePlaybackProgressInteraction', () => {
  it('keeps high-frequency clock notifications inside the frame budget and paints external seeks immediately', async () => {
    let now = 1000
    const currentTime = ref(20)
    const renderRatio = vi.fn()
    let tick: (time: number) => void = () => {}
    const interaction = usePlaybackProgressInteraction({
      duration: ref(100),
      currentTime,
      isPlaying: ref(true),
      active: ref(true),
      seekByRatio: vi.fn(),
      seekTo: vi.fn(),
      renderRatio,
      maxVisualFps: 30,
      resolveSeekStepSeconds: () => 5,
      now: () => now,
      subscribeFrame: (callback) => {
        tick = callback
        return () => {}
      },
    })
    renderRatio.mockClear()
    for (let frame = 0; frame < 240; frame++) {
      now = 1000 + frame * (1000 / 240)
      currentTime.value = 20 + frame / 240
      await nextTick()
      tick(now)
    }
    expect(renderRatio).toHaveBeenCalledTimes(30)
    currentTime.value = 80
    await nextTick()
    expect(renderRatio).toHaveBeenLastCalledWith(0.8)
    interaction.dispose()
  })

  it('ignores secondary buttons and other pointers without committing the active drag', () => {
    const { interaction, seekByRatio } = setup()
    const target = createPointerTarget()
    interaction.onPointerDown({ ...pointerEvent(target, 150), button: 2 } as PointerEvent)
    expect(interaction.isDragging.value).toBe(false)
    interaction.onPointerDown(pointerEvent(target, 150))
    interaction.onPointerMove(pointerEvent(target, 250, 8))
    interaction.onPointerUp(pointerEvent(target, 250, 8))
    interaction.onPointerCancel(pointerEvent(target, 250, 8))
    expect(interaction.draggingRatio.value).toBe(0.25)
    expect(seekByRatio).not.toHaveBeenCalled()
    interaction.onPointerUp(pointerEvent(target, 200))
    expect(seekByRatio).toHaveBeenCalledWith(0.5)
    interaction.dispose()
  })
  it('limits 240Hz automatic interpolation while retaining immediate dragging, seek and ARIA state', async () => {
    const { isPlaying, renderRatio, subscribeFrame, currentTime, interaction } = setup(true, 30)
    isPlaying.value = true
    await nextTick()
    await nextTick()
    const tick = subscribeFrame.mock.calls[0][0]
    renderRatio.mockClear()
    for (let frame = 0; frame < 240; frame++) tick(1000 + frame * (1000 / 240))
    expect(renderRatio).toHaveBeenCalledTimes(30)
    expect(renderRatio.mock.calls.at(-1)?.[0]).toBeCloseTo((20 + 232 / 240) / 100)

    const target = createPointerTarget()
    interaction.onPointerDown(pointerEvent(target, 150))
    expect(renderRatio).toHaveBeenLastCalledWith(0.25)
    expect(interaction.valueNow.value).toBe(25)
    const count = renderRatio.mock.calls.length
    tick(2010)
    expect(renderRatio).toHaveBeenCalledTimes(count)
    interaction.onPointerMove(pointerEvent(target, 250))
    expect(renderRatio).toHaveBeenLastCalledWith(0.75)
    expect(interaction.valueNow.value).toBe(75)
    interaction.onPointerCancel()

    currentTime.value = 80
    await nextTick()
    expect(renderRatio).toHaveBeenLastCalledWith(0.8)
    expect(interaction.valueNow.value).toBe(80)
    interaction.dispose()
  })

  it('tracks pointer start and move, then commits the final ratio on pointer up', () => {
    const { interaction, seekByRatio } = setup()
    const target = createPointerTarget()

    interaction.onPointerDown(pointerEvent(target, 150))
    expect(interaction.isDragging.value).toBe(true)
    expect(interaction.draggingRatio.value).toBe(0.25)
    expect(target.setPointerCapture).toHaveBeenCalledWith(7)

    interaction.onPointerMove(pointerEvent(target, 500))
    expect(interaction.draggingRatio.value).toBe(1)

    interaction.onPointerUp(pointerEvent(target, 250))
    expect(seekByRatio).toHaveBeenCalledOnce()
    expect(seekByRatio).toHaveBeenCalledWith(0.75)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(interaction.isDragging.value).toBe(false)
    expect(interaction.draggingRatio.value).toBeNull()
  })

  it('cancels without seeking and releases pointer capture', () => {
    const { interaction, seekByRatio } = setup()
    const target = createPointerTarget()
    interaction.onPointerDown(pointerEvent(target, 200))

    interaction.onPointerCancel()

    expect(seekByRatio).not.toHaveBeenCalled()
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(interaction.isDragging.value).toBe(false)
  })

  it('does not start dragging or capture a pointer when duration is zero', () => {
    const { duration, interaction, seekByRatio } = setup()
    const target = createPointerTarget()
    duration.value = 0

    interaction.onPointerDown(pointerEvent(target, 200))
    interaction.onPointerUp(pointerEvent(target, 250))

    expect(target.setPointerCapture).not.toHaveBeenCalled()
    expect(seekByRatio).not.toHaveBeenCalled()
    expect(interaction.isDragging.value).toBe(false)
  })

  it('seeks by configured keyboard steps and ignores keys without duration', () => {
    const { interaction, duration, seekTo } = setup()
    const preventDefault = vi.fn()

    interaction.onKeydown({
      key: 'ArrowLeft',
      shiftKey: false,
      preventDefault,
    } as unknown as KeyboardEvent)
    interaction.onKeydown({
      key: 'ArrowRight',
      shiftKey: true,
      preventDefault,
    } as unknown as KeyboardEvent)
    expect(seekTo).toHaveBeenNthCalledWith(1, 15)
    expect(seekTo).toHaveBeenNthCalledWith(2, 30)

    duration.value = 0
    interaction.onKeydown({
      key: 'ArrowRight',
      shiftKey: false,
      preventDefault,
    } as unknown as KeyboardEvent)
    expect(seekTo).toHaveBeenCalledTimes(2)
  })

  it('owns one frame subscription and cleans it up across deactivate, reactivate, and dispose', async () => {
    const { active, isPlaying, subscribeFrame, unsubscribe, interaction } = setup(true)
    expect(subscribeFrame).not.toHaveBeenCalled()

    isPlaying.value = true
    await nextTick()
    await nextTick()
    expect(subscribeFrame).toHaveBeenCalledOnce()

    isPlaying.value = false
    await nextTick()
    await nextTick()
    expect(subscribeFrame).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()

    active.value = false
    await nextTick()
    await nextTick()
    expect(unsubscribe).toHaveBeenCalledOnce()

    active.value = true
    await nextTick()
    await nextTick()
    expect(subscribeFrame).toHaveBeenCalledOnce()

    isPlaying.value = true
    await nextTick()
    await nextTick()
    expect(subscribeFrame).toHaveBeenCalledTimes(2)

    interaction.dispose()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('releases an active pointer when disposed', () => {
    const { interaction } = setup()
    const target = createPointerTarget()
    interaction.onPointerDown(pointerEvent(target, 200))

    interaction.dispose()

    expect(target.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(interaction.isDragging.value).toBe(false)
  })
})
