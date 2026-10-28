import { beforeEach, describe, expect, it } from 'vitest'
import { isReadonly } from 'vue'
import { _resetDisplayModeStateForTesting, usePlayerDisplayMode } from './usePlayerDisplayMode'
import { useFullscreenPlayer } from './useFullscreenPlayer'

describe('player presentation state', () => {
  beforeEach(_resetDisplayModeStateForTesting)

  it('starts in normal mode and shares readonly state across consumers', () => {
    const shell = usePlayerDisplayMode()
    const player = usePlayerDisplayMode()
    expect(shell.displayMode.value).toBe('normal')
    expect(isReadonly(shell.displayMode)).toBe(true)
    player.showFullscreenPlayer()
    expect(shell.displayMode.value).toBe('fullscreen')
    shell.showNormalPlayer()
    expect(player.displayMode.value).toBe('normal')
  })

  it('opens and closes the fullscreen player through the shared presentation state', () => {
    const shell = usePlayerDisplayMode()
    const fullscreen = useFullscreenPlayer()
    expect(fullscreen.isFullscreenPlayerOpen.value).toBe(false)
    fullscreen.openFullscreenPlayer()
    expect(shell.displayMode.value).toBe('fullscreen')
    expect(fullscreen.isFullscreenPlayerOpen.value).toBe(true)
    fullscreen.closeFullscreenPlayer()
    expect(shell.displayMode.value).toBe('normal')
    expect(fullscreen.isFullscreenPlayerOpen.value).toBe(false)
    fullscreen.closeFullscreenPlayer()
    expect(shell.displayMode.value).toBe('normal')
  })
})
