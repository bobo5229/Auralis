import { describe, expect, it, vi } from 'vitest'
import type {
  AlbumTransitionTarget,
  AlbumTransitionVisual,
} from '../components/AlbumGridTransitionLayer.vue'
import { findAlbumTransitionFocusTarget, planAlbumGridTransition } from './albumGridTransitionPlan'

function rect(left: number, top: number) {
  return { left, top, width: 180, height: 260 }
}

describe('album grid transition plan', () => {
  it('matches cards by stable album key when column regrouping moves them across rows', () => {
    const from: AlbumTransitionVisual[] = [
      { key: 'album-a', node: {} as HTMLElement, rect: rect(20, 10), opacity: 1 },
      { key: 'album-b', node: {} as HTMLElement, rect: rect(220, 10), opacity: 1 },
      { key: 'album-old', node: {} as HTMLElement, rect: rect(420, 10), opacity: 1 },
    ]
    const to: AlbumTransitionTarget[] = [
      { key: 'album-b', node: {} as HTMLElement, rect: rect(20, 280) },
      { key: 'album-a', node: {} as HTMLElement, rect: rect(220, 280) },
      { key: 'album-new', node: {} as HTMLElement, rect: rect(420, 280) },
    ]

    const plan = planAlbumGridTransition(from, to)
    expect(plan.from.map(({ key, destination }) => [key, destination?.top ?? null])).toEqual([
      ['album-a', 280],
      ['album-b', 280],
      ['album-old', null],
    ])
    expect(plan.to.map(({ key }) => key)).toEqual(['album-new'])
  })

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
