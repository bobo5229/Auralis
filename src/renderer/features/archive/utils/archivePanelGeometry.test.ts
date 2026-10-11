import { describe, expect, it } from 'vitest'
import { archivePanelPosition, archivePanelTransform } from './archivePanelGeometry'

describe('archive panel geometry', () => {
  const viewport = { width: 900, height: 620 }
  it('opens over the source cell with its centerline aligned', () => {
    expect(
      archivePanelPosition({ left: 450, top: 120, width: 12, height: 12 }, 300, 254, viewport),
    ).toEqual({ left: 306, top: 120 })
  })
  it('keeps edge cells and upward expansion inside the viewport', () => {
    expect(
      archivePanelPosition({ left: 880, top: 580, width: 12, height: 12 }, 300, 254, viewport),
    ).toEqual({ left: 588, top: 338 })
    expect(
      archivePanelPosition({ left: 0, top: 0, width: 12, height: 12 }, 300, 254, viewport),
    ).toEqual({ left: 12, top: 12 })
  })
  it('maps the opening surface exactly from the source rectangle to the final panel', () => {
    const source = { left: 456, top: 120, width: 12, height: 12 }
    const target = { left: 312, top: 120, width: 300, height: 240 }
    expect(archivePanelTransform(source, target, 0)).toBe('translate(144px, 0px) scale(0.04, 0.05)')
    expect(archivePanelTransform(source, target, 1)).toBe('translate(0px, 0px) scale(1, 1)')
    const scale = archivePanelTransform(source, target, 1.025).match(/scale\(([^,]+), ([^)]+)\)/)!
    expect(Number(scale[1])).toBeCloseTo(1.024)
    expect(Number(scale[2])).toBeCloseTo(1.02375)
  })
})
