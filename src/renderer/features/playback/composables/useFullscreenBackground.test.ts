import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())

describe('fullscreen background preferences', () => {
  it('defaults to flow with motion enabled', async () => {
    const { useFullscreenBackground } = await import('./useFullscreenBackground')
    const background = useFullscreenBackground()
    expect(background.backgroundMode.value).toBe('fluid')
    expect(background.backgroundMotionPaused.value).toBe(false)
  })

  it('shares the selected mode and motion preference across consumers', async () => {
    const { useFullscreenBackground } = await import('./useFullscreenBackground')
    const first = useFullscreenBackground()
    first.setBackgroundMode('solid')
    first.setBackgroundMotionPaused(true)
    const second = useFullscreenBackground()
    expect(second.backgroundMode.value).toBe('solid')
    second.setBackgroundMode('fluid')
    expect(first.backgroundMode.value).toBe('fluid')
    expect(second.backgroundMotionPaused.value).toBe(true)
  })
})
