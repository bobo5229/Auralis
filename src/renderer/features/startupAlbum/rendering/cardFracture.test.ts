import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { createAlbumCard } from './card'
import { createCardFracture } from './cardFracture'

// Geometry/material fixture only: exercise the real clipping and UV code
// without allocating a DOM canvas, WebGL renderer, or production artwork.
function fixture() {
  const shape = new THREE.Shape()
  const w = 2.65,
    h = 3.8,
    r = 0.09
  shape.moveTo(-w / 2 + r, -h / 2)
  shape.lineTo(w / 2 - r, -h / 2)
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  shape.lineTo(w / 2, h / 2 - r)
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  shape.lineTo(-w / 2 + r, h / 2)
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  shape.lineTo(-w / 2, -h / 2 + r)
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  const geometry = new THREE.ShapeGeometry(shape, 8)
  const card = {
    width: w,
    height: h,
    object: new THREE.Group(),
    hoverSurface: new THREE.Mesh(geometry),
    createFragmentMaterial: () =>
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true }),
  }
  return { card: card as unknown as ReturnType<typeof createAlbumCard>, geometry }
}
function area(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position'),
    indices = geometry.index!
  let result = 0
  for (let i = 0; i < indices.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((offset) => {
      const index = indices.getX(i + offset)
      return new THREE.Vector2(positions.getX(index), positions.getY(index))
    })
    result += Math.abs(b.clone().sub(a).cross(c.clone().sub(a))) / 2
  }
  return result
}
describe('album card fracture', () => {
  it('covers the rounded card with seven two-sided pieces using the shared artwork UVs', () => {
    const { card, geometry } = fixture()
    for (let seed = 0; seed < 64; seed++) {
      const fracture = createCardFracture(card, seed)
      expect(fracture.group.children).toHaveLength(7)
      let total = 0
      for (const group of fracture.group.children) {
        expect(group.children).toHaveLength(3)
        const edge = group.children[0] as THREE.Mesh<THREE.ExtrudeGeometry>
        const face = group.children[1] as THREE.Mesh
        const faceMaterial = Array.isArray(face.material) ? face.material[0] : face.material
        const positions = face.geometry.getAttribute('position')
        const uv = face.geometry.getAttribute('uv')
        const pieceArea = area(face.geometry)
        const sideGroup = edge.geometry.groups.find((item) => item.materialIndex === 1)!
        expect(edge.geometry.drawRange).toEqual({ start: sideGroup.start, count: sideGroup.count })
        expect(faceMaterial.side).toBe(THREE.DoubleSide)
        expect(pieceArea).toBeGreaterThan(0.1)
        total += pieceArea
        for (let i = 0; i < positions.count; i++) {
          expect(uv.getX(i)).toBeCloseTo(
            (positions.getX(i) + group.position.x) / card.width + 0.5,
            6,
          )
          expect(uv.getY(i)).toBeCloseTo(
            (positions.getY(i) + group.position.y) / card.height + 0.5,
            6,
          )
        }
      }
      expect(total).toBeCloseTo(area(geometry), 5)
      fracture.dispose()
    }
    geometry.dispose()
    ;(card.hoverSurface.material as THREE.Material).dispose()
  })
  it('separates without scaling pieces and finishes invisible; scrubbing is deterministic', () => {
    const { card, geometry } = fixture(),
      fracture = createCardFracture(card, 123)
    fracture.setProgress(0.5)
    const middle = fracture.group.children.map((group) => group.position.toArray())
    fracture.setProgress(1)
    expect(fracture.group.visible).toBe(false)
    expect(card.object.visible).toBe(false)
    for (const group of fracture.group.children) {
      expect(group.scale.toArray()).toEqual([1, 1, 1])
      expect(((group.children[1] as THREE.Mesh).material as THREE.Material).opacity).toBe(0)
    }
    fracture.setProgress(0.5)
    expect(fracture.group.children.map((group) => group.position.toArray())).toEqual(middle)
    fracture.setProgress(0)
    expect(card.object.visible).toBe(true)
    fracture.dispose()
    fracture.dispose()
    geometry.dispose()
    ;(card.hoverSurface.material as THREE.Material).dispose()
  })
  it('draws each seam once and propagates a short highlight outward from one junction', () => {
    const { card, geometry } = fixture()
    const fracture = createCardFracture(card, 123)
    const segments = new Set<string>()
    const samples: { point: THREE.Vector2; first: number }[] = []
    const ribbons = fracture.group.children.map((piece) => {
      const ribbon = piece.children[2] as THREE.Mesh<THREE.BufferGeometry>
      const positions = ribbon.geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i += 6) {
        const points = [i, i + 1, i + 2, i + 5].map(
          (j) =>
            new THREE.Vector2(
              positions.getX(j) + piece.position.x,
              positions.getY(j) + piece.position.y,
            ),
        )
        const a = points[0].clone().lerp(points[3], 0.5)
        const b = points[1].clone().lerp(points[2], 0.5)
        const key = [a, b]
          .map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`)
          .sort()
          .join(':')
        expect(segments.has(key)).toBe(false)
        segments.add(key)
      }
      return { ribbon, position: piece.position.clone() }
    })
    const starts = ribbons.map(
      ({ ribbon }) =>
        Array(ribbon.geometry.getAttribute('position').count).fill(Infinity) as number[],
    )
    for (let tick = 0; tick <= 40; tick++) {
      const progress = tick / 100
      fracture.setProgress(progress)
      ribbons.forEach(({ ribbon }, ri) => {
        const colors = ribbon.geometry.getAttribute('color')
        for (let i = 0; i < colors.count; i++) {
          if (colors.getW(i) > 0.01) starts[ri][i] = Math.min(starts[ri][i], progress)
          if (tick === 0 || tick === 40) expect(colors.getW(i)).toBe(0)
        }
      })
    }
    ribbons.forEach(({ ribbon, position }, ri) => {
      const points = ribbon.geometry.getAttribute('position')
      for (let i = 0; i < points.count; i++) {
        expect(Number.isFinite(starts[ri][i])).toBe(true)
        samples.push({
          point: new THREE.Vector2(points.getX(i) + position.x, points.getY(i) + position.y),
          first: starts[ri][i],
        })
      }
    })
    const first = Math.min(...samples.map((sample) => sample.first))
    const origin = samples.find((sample) => sample.first === first)!.point
    const early = samples.filter((sample) => sample.first <= first + 0.01)
    expect(early.length).toBeLessThan(samples.length / 3)
    expect(Math.max(...early.map((sample) => sample.point.distanceTo(origin)))).toBeLessThan(0.65)
    expect(Math.max(...samples.map((sample) => sample.first))).toBeGreaterThan(first + 0.12)
    fracture.dispose()
    geometry.dispose()
    ;(card.hoverSurface.material as THREE.Material).dispose()
  })

  it('lifts and detaches continuously, repeats poses, and releases ribbon resources once', () => {
    const { card, geometry } = fixture()
    const fracture = createCardFracture(card, 91)
    const ribbons = fracture.group.children.map((piece) => piece.children[2] as THREE.Mesh)
    const disposed = ribbons.flatMap((ribbon) => [
      vi.spyOn(ribbon.geometry, 'dispose'),
      vi.spyOn(ribbon.material as THREE.Material, 'dispose'),
    ])
    const poses = () =>
      fracture.group.children.map((piece) => [
        ...piece.position.toArray(),
        ...piece.quaternion.toArray(),
      ])
    fracture.setProgress(0.4)
    const atDetach = poses()
    expect(new Set(atDetach.map((pose) => pose[2].toFixed(4))).size).toBeGreaterThan(3)
    let previous = poses()
    for (let ms = 280; ms <= 700; ms++) {
      fracture.setProgress(ms / 1400)
      const current = poses()
      if (ms > 280)
        current.forEach((pose, i) =>
          pose.forEach((value, j) => expect(Math.abs(value - previous[i][j])).toBeLessThan(0.01)),
        )
      previous = current
    }
    fracture.setProgress(0.4)
    expect(poses()).toEqual(atDetach)
    fracture.dispose()
    fracture.dispose()
    disposed.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1))
    geometry.dispose()
    ;(card.hoverSurface.material as THREE.Material).dispose()
  })
})
