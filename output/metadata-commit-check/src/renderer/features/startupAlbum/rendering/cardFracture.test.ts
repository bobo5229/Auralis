import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
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
})
