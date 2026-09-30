import { describe, expect, it } from 'vitest'
import { createLyricsAlbumTransitionCoordinator } from './lyricsAlbumTransitionCoordinator'

describe('lyrics album layout transition coordinator', () => {
  it('moves from preparing to animating and completes the current revision', () => {
    const coordinator = createLyricsAlbumTransitionCoordinator()
    const ticket = coordinator.begin(0, 1)
    expect(coordinator.phase).toBe('preparing')
    expect(coordinator.start(ticket)).toBe(true)
    expect(coordinator.phase).toBe('animating')
    expect(coordinator.complete(ticket)).toBe(true)
    expect(coordinator.phase).toBe('idle')
  })

  it('rejects stale preparation callbacks when reversed before motion starts', () => {
    const coordinator = createLyricsAlbumTransitionCoordinator()
    const first = coordinator.begin(1, 0)
    const reverse = coordinator.begin(0.6, 1)
    expect(coordinator.isCurrent(first)).toBe(false)
    expect(coordinator.start(first)).toBe(false)
    expect(coordinator.complete(first)).toBe(false)
    expect(coordinator.start(reverse)).toBe(true)
    expect(coordinator.complete(reverse)).toBe(true)
  })

  it('rejects animation and completion callbacks from the previous revision after reversal', () => {
    const coordinator = createLyricsAlbumTransitionCoordinator()
    const first = coordinator.begin(1, 0)
    expect(coordinator.start(first)).toBe(true)
    const reverse = coordinator.begin(0.6, 1)
    expect(coordinator.isCurrent(first)).toBe(false)
    expect(coordinator.complete(first)).toBe(false)
    expect(coordinator.start(reverse)).toBe(true)
    expect(coordinator.complete(reverse)).toBe(true)
  })

  it('invalidates pending work on cancellation and starts a fresh immediate commit', () => {
    const coordinator = createLyricsAlbumTransitionCoordinator()
    const animated = coordinator.begin(0, 1)
    const cancelledRevision = coordinator.cancel()
    expect(coordinator.revision).toBe(cancelledRevision)
    expect(coordinator.isCurrent(animated)).toBe(false)
    expect(coordinator.phase).toBe('idle')

    const immediate = coordinator.begin(0, 1)
    expect(coordinator.start(immediate)).toBe(true)
    expect(coordinator.complete(immediate)).toBe(true)
  })
})
