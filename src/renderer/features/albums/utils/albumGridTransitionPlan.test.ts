import { describe, expect, it, vi } from 'vitest'
import { findAlbumTransitionFocusTarget } from './albumGridTransitionPlan'

describe('album grid transition focus', () => {
  it('restores focus to the same keyed card after its row has changed', () => {
    const focusedControl = { focus: vi.fn() } as unknown as HTMLElement
    const card = {
      dataset: { albumKey: 'album-b' },
      querySelector: vi.fn(() => focusedControl),
    } as unknown as HTMLElement
    const otherCard = {
      dataset: { albumKey: 'album-a' },
      querySelector: vi.fn(() => null),
    } as unknown as HTMLElement

    expect(findAlbumTransitionFocusTarget([otherCard, card], 'album-b', '.cover-stage')).toBe(
      focusedControl,
    )
    expect(card.querySelector).toHaveBeenCalledWith('.cover-stage')
  })
})
