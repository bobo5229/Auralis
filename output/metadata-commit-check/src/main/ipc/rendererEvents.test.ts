import { describe, expect, it, vi } from 'vitest'
import { createRendererEventSender } from './rendererEvents'

vi.mock('@main/logging/logger', () => ({ logger: { warn: vi.fn() } }))

describe('renderer event delivery', () => {
  it('skips destroyed targets and still delivers after another target throws', () => {
    const dead = { isDestroyed: () => true, send: vi.fn() }
    const failing = {
      isDestroyed: () => false,
      send: vi.fn(() => {
        throw new Error('closed')
      }),
    }
    const live = { isDestroyed: () => false, send: vi.fn() }
    const send = createRendererEventSender(() =>
      [dead, failing, live].map((webContents) => ({ webContents })),
    )
    const event = { reason: 'track-added' as const, trackIds: [1], filePaths: [] }
    send('library:changed', event)
    expect(dead.send).not.toHaveBeenCalled()
    expect(live.send).toHaveBeenCalledWith('library:changed', event)
  })
})
