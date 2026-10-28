import { describe, expect, it } from 'vitest'
import {
  PressureShapeCache,
  pressureShapeKey,
  type PressureGeometry,
} from './badgePressurePreparation'

describe('pressure shape cache', () => {
  it('evicts least recently used arrays within its byte budget', () => {
    const cache = new PressureShapeCache(24)
    const shape = () => ({
      envelope: new Float32Array(1),
      gx: new Float32Array(1),
      gy: new Float32Array(1),
    })
    const a = shape(),
      b = shape(),
      c = shape()
    cache.set('a', a)
    cache.set('b', b)
    expect(cache.get('a')).toBe(a)
    cache.set('c', c)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(a)
    expect(cache.get('c')).toBe(c)
  })
  it('does not reuse a shape when contour, raster size, scale or image placement changes', () => {
    const geometry: PressureGeometry = {
      contour: 'M0 0H10V10Z',
      width: 100,
      height: 120,
      scale: 1,
      imageX: 38,
      imageY: 40,
      imageScale: 0.5,
    }
    const key = pressureShapeKey(geometry)
    for (const change of [
      { contour: 'M0 0H20V10Z' },
      { width: 101 },
      { height: 121 },
      { scale: 1.5 },
      { imageX: 39 },
      { imageY: 41 },
      { imageScale: 0.6 },
    ])
      expect(pressureShapeKey({ ...geometry, ...change })).not.toBe(key)
  })
})
