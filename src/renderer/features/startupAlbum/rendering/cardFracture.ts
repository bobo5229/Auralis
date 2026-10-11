import * as THREE from 'three'
import type { createAlbumCard } from './card'

type AlbumCard = ReturnType<typeof createAlbumCard>
type Point = THREE.Vector2
const smooth = (a: number, b: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// Seven sites need only 42 bisector clips. No triangulation/physics dependency.
// Clip the real rounded outline, rather than a rectangle laid over the card.
function clip(polygon: Point[], normal: Point, distance: number): Point[] {
  const result: Point[] = []
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]
    const da = a.dot(normal) - distance
    const db = b.dot(normal) - distance
    if (da <= 1e-9) result.push(a.clone())
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) result.push(a.clone().lerp(b, da / (da - db)))
  })
  return result
}

function centroid(polygon: Point[]) {
  let area = 0
  const center = new THREE.Vector2()
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]
    const cross = a.x * b.y - b.x * a.y
    area += cross
    center.x += (a.x + b.x) * cross
    center.y += (a.y + b.y) * cross
  })
  return center.divideScalar(3 * area)
}

export const CARD_SHATTER_DURATION_MS = 1400

export function createCardFracture(card: AlbumCard, seed: number) {
  let state = seed >>> 0
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
  const source = card.hoverSurface.geometry.getAttribute('position')
  const unique = new Map<string, Point>()
  for (let i = 0; i < source.count; i++) {
    const p = new THREE.Vector2(source.getX(i), source.getY(i))
    unique.set(`${p.x},${p.y}`, p)
  }
  const outline = [...unique.values()].sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x))
  const sites = [
    [-0.72, 1.35],
    [0.63, 1.2],
    [-0.86, 0.12],
    [0.2, 0.32],
    [0.88, -0.4],
    [-0.62, -1.24],
    [0.53, -1.38],
  ].map(([x, y]) => new THREE.Vector2(x + (random() - 0.5) * 0.32, y + (random() - 0.5) * 0.38))
  const group = new THREE.Group()
  const fragments = sites.map((site, index) => {
    let polygon = outline.map((p) => p.clone())
    sites.forEach((other, j) => {
      if (index === j) return
      polygon = clip(polygon, other.clone().sub(site), (other.lengthSq() - site.lengthSq()) / 2)
    })
    const center = centroid(polygon)
    const shape = new THREE.Shape(polygon.map((p) => p.clone().sub(center)))
    const geometry = new THREE.ShapeGeometry(shape)
    const positions = geometry.getAttribute('position')
    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < positions.count; i++)
      uv.setXY(
        i,
        (positions.getX(i) + center.x) / card.width + 0.5,
        (positions.getY(i) + center.y) / card.height + 0.5,
      )
    const faceMaterial = card.createFragmentMaterial()
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: '#e1d6c9',
      roughness: 0.68,
      side: THREE.DoubleSide,
    })
    const face = new THREE.Mesh(geometry, faceMaterial)
    face.position.z = 0.018
    const edge = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.035,
        bevelEnabled: false,
        curveSegments: 8,
      }),
      edgeMaterial,
    )
    // Only render the paper core's sides; caps would tint translucent artwork.
    const sides = edge.geometry.groups[1]
    edge.geometry.setDrawRange(sides.start, sides.count)
    edge.position.z = -0.0175
    const object = new THREE.Group()
    object.add(edge, face)
    object.position.set(center.x, center.y, 0)
    group.add(object)
    const crackVertices: number[] = []
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length]
      const mid = a.clone().lerp(b, 0.5)
      const interior = sites.some(
        (other, j) =>
          j !== index &&
          Math.abs(mid.distanceToSquared(site) - mid.distanceToSquared(other)) < 1e-6,
      )
      if (interior)
        crackVertices.push(
          a.x - center.x,
          a.y - center.y,
          0.019,
          b.x - center.x,
          b.y - center.y,
          0.019,
        )
    })
    const crackGeometry = new THREE.BufferGeometry()
    crackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(crackVertices, 3))
    const crackMaterial = new THREE.LineBasicMaterial({
      color: '#f2e8d9',
      transparent: true,
      depthWrite: false,
    })
    const cracks = new THREE.LineSegments(crackGeometry, crackMaterial)
    object.add(cracks)
    for (const material of [faceMaterial, edgeMaterial]) {
      material.transparent = true
      material.depthWrite = true
    }
    return {
      object,
      center,
      polygon,
      face,
      edge,
      crackGeometry,
      crackMaterial,
      crackVertices,
      drift: (random() - 0.5) * 0.22,
      depth: (random() - 0.5) * 1.5,
      spin: new THREE.Vector3(
        (random() - 0.5) * 2.4,
        (random() - 0.5) * 2.8,
        (random() - 0.5) * 1.4,
      ),
      delay: random() * 0.055,
    }
  })
  let disposed = false
  return {
    group,
    setProgress(value: number) {
      const progress = THREE.MathUtils.clamp(value, 0, 1)
      card.object.visible = progress < 0.025
      group.visible = progress >= 0.025 && progress < 1
      for (const f of fragments) {
        // Give the fracture ~0.4 s to become legible before broad separation.
        const opening = smooth(0.19 + f.delay, 0.46, progress)
        const travel = Math.max(0, (progress - 0.3 - f.delay) / (0.7 - f.delay))
        const scatter = travel * (0.5 + 0.5 * travel)
        f.object.position.set(
          f.center.x + f.center.x * (opening * 0.017 + scatter * 0.64) + f.drift * scatter,
          f.center.y +
            f.center.y * (opening * 0.017 + scatter * 0.38) +
            0.2 * travel -
            1.55 * travel * travel,
          f.depth * scatter,
        )
        f.object.rotation.set(f.spin.x * scatter, f.spin.y * scatter, f.spin.z * scatter)
        const opacity = 1 - smooth(0.72 + f.delay, 1, progress)
        for (const mesh of [f.face, f.edge]) mesh.material.opacity = opacity
        f.crackMaterial.opacity =
          smooth(0.025, 0.15, progress) * (1 - smooth(0.27, 0.46, progress)) * 0.48
        const vertices = f.crackGeometry.getAttribute('position')
        const count = vertices.count / 2
        for (let i = 0; i < count; i++) {
          const offset = i * 6
          const grow = smooth(0.025 + (i / count) * 0.12, 0.13 + (i / count) * 0.12, progress)
          vertices.setXYZ(
            i * 2 + 1,
            THREE.MathUtils.lerp(f.crackVertices[offset], f.crackVertices[offset + 3], grow),
            THREE.MathUtils.lerp(f.crackVertices[offset + 1], f.crackVertices[offset + 4], grow),
            0.019,
          )
        }
        vertices.needsUpdate = true
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const f of fragments) {
        for (const mesh of [f.face, f.edge]) {
          mesh.geometry.dispose()
          mesh.material.dispose()
        }
        f.crackGeometry.dispose()
        f.crackMaterial.dispose()
      }
      group.removeFromParent()
    },
  }
}
