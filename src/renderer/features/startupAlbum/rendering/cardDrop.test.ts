import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createCardDrop } from './cardDrop'

afterEach(() => vi.unstubAllGlobals())

function fixture(halfTurn = false, fractionalWidth = false) {
  vi.stubGlobal('innerWidth', 1168)
  vi.stubGlobal('innerHeight', 760)
  vi.stubGlobal('devicePixelRatio', 2)
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible' }))
  const style = { cssText: 'opacity: 1' }
  const canvas = {
    style,
    getBoundingClientRect: () => ({
      left: 0,
      top: 55,
      width: fractionalWidth ? 1168.333 : 1168,
      height: 625,
    }),
  }
  const renderer = {
    domElement: canvas,
    autoClear: true,
    setDrawingBufferSize: vi.fn(),
    setScissorTest: vi.fn(),
    setScissor: vi.fn(),
    clear: vi.fn(),
  }
  const camera = new THREE.OrthographicCamera(-5.84, 5.84, 3.125, -3.125, 0.1, 100)
  camera.position.set(0, 0.1, 12)
  camera.lookAt(0, 0.1, 0)
  camera.updateMatrixWorld(true)
  const presentation = new THREE.Group()
  presentation.position.set(-0.4, 0.18, 0)
  presentation.rotation.set(-0.3, 0.7, -0.08)
  presentation.scale.setScalar(1.2)
  const card = new THREE.Group()
  card.rotation.set(0.12, halfTurn ? Math.PI : -0.24, 0)
  presentation.add(card)
  const bar = { left: 400, right: 1000, top: 680, width: 600, height: 64 }
  const cancel = vi.fn()
  const target = {
    isConnected: true,
    getBoundingClientRect: () => bar,
    animate: vi.fn(() => ({ cancel })),
  }
  const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-1.325, 1.9, 0)]
  const project = (point: THREE.Vector3, full = false) => {
    const p = card.localToWorld(point.clone()).project(camera)
    return new THREE.Vector2(
      ((p.x + 1) * (full || !fractionalWidth ? 1168 : 1168.333)) / 2,
      ((1 - p.y) * (full ? 760 : 625)) / 2 + (full ? 0 : 55),
    )
  }
  const before = points.map((point) => project(point))
  const start = () =>
    createCardDrop(
      renderer as unknown as THREE.WebGLRenderer,
      camera,
      presentation,
      card,
      2.65,
      3.8,
      target as unknown as HTMLElement,
    )
  return {
    start,
    points,
    before,
    project,
    camera,
    renderer,
    target,
    presentation,
    bar,
    cancel,
    style,
  }
}

describe('card drop screen-space geometry', () => {
  it('preserves fractional CSS widths independently of the vertical world scale', () => {
    const f = fixture(true, true)
    const drop = f.start()!
    drop.update(0)
    f.points.forEach((point, i) =>
      expect(f.project(point, true).distanceTo(f.before[i])).toBeLessThan(1e-8),
    )
    drop.dispose()
  })
  it.each([false, true])(
    'preserves the captured pose when expanding the viewport (halfTurn=%s)',
    (halfTurn) => {
      const f = fixture(halfTurn)
      const drop = f.start()!
      expect(drop.update(0)).toBe(true)
      f.points.forEach((point, i) =>
        expect(f.project(point, true).distanceTo(f.before[i])).toBeLessThan(1e-8),
      )
      expect(f.renderer.setDrawingBufferSize).toHaveBeenCalledWith(1168, 760, 2)
      drop.dispose()
    },
  )

  it('clips to the moving receiving edge, lands once, and ends entirely inside the bar', () => {
    const f = fixture()
    const drop = f.start()!
    for (let ms = 0; ms <= 1200; ms += 10) expect(drop.update(ms)).toBe(true)
    expect(f.target.animate).toHaveBeenCalledTimes(1)
    f.bar.top += 3
    expect(drop.update(1200)).toBe(true)
    expect(f.renderer.setScissor).toHaveBeenLastCalledWith(0, 77, 1168, 683)
    expect(f.project(new THREE.Vector3(0, 0, 0), true).y).toBeGreaterThan(700)
    expect((f.presentation.scale.x * 3.8) / 0.01).toBeCloseTo(80)
    drop.dispose()
    drop.dispose()
    expect(f.cancel).toHaveBeenCalledTimes(1)
    expect(f.renderer.autoClear).toBe(true)
    expect(f.camera.top).toBe(3.125)
    expect(f.style.cssText).toBe('opacity: 1')
  })

  it('rejects unavailable targets without altering the viewport and detects target loss', () => {
    const f = fixture()
    f.target.isConnected = false
    expect(f.start()).toBeNull()
    expect(f.renderer.setDrawingBufferSize).not.toHaveBeenCalled()
    f.target.isConnected = true
    const drop = f.start()!
    f.target.isConnected = false
    expect(drop.update(300)).toBe(false)
    drop.dispose()
  })
})
