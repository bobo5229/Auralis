import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => vi.resetModules())

describe('fullscreen background preferences', () => {
  it('defaults to motion enabled', async () => {
    const { useFullscreenBackground } = await import('./useFullscreenBackground')
    const background = useFullscreenBackground()
    expect(background.backgroundMotionPaused.value).toBe(false)
  })

  it('shares the motion preference across fullscreen consumers', async () => {
    const { useFullscreenBackground } = await import('./useFullscreenBackground')
    const first = useFullscreenBackground()
    first.setBackgroundMotionPaused(true)
    const second = useFullscreenBackground()
    expect(second.backgroundMotionPaused.value).toBe(true)
    second.setBackgroundMotionPaused(false)
    expect(first.backgroundMotionPaused.value).toBe(false)
  })
})
