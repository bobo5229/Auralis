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
    clientX,
    pointerId,
    preventDefault: vi.fn(),
  } as unknown as PointerEvent
}

function setup(activeInitially = false) {
  const duration = ref(100)
  const currentTime = ref(20)
  const isPlaying = ref(false)
  const active = ref(activeInitially)
  const seekByRatio = vi.fn()
  const seekTo = vi.fn()
  const renderRatio = vi.fn()
  const unsubscribe = vi.fn()
  const subscribeFrame = vi.fn(() => unsubscribe)
  const interaction = usePlaybackProgressInteraction({
    duration,
    currentTime,
    isPlaying,
    active,
    seekByRatio,
    seekTo,
    renderRatio,
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
