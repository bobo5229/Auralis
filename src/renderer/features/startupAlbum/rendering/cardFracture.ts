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
  const polygons = sites.map((site, index) => {
    let polygon = outline.map((p) => p.clone())
    sites.forEach((other, j) => {
      if (index === j) return
      polygon = clip(polygon, other.clone().sub(site), (other.lengthSq() - site.lengthSq()) / 2)
    })
    return polygon
  })
  // Merge shared endpoints/edges before scheduling the wave. Each physical
  // seam has one ribbon, even though it belongs to two pieces.
  const nodes: { point: Point; distance: number }[] = []
  const nodeFor = (point: Point) => {
    let index = nodes.findIndex((node) => node.point.distanceToSquared(point) < 1e-12)
    if (index < 0) {
      index = nodes.length
      nodes.push({ point: point.clone(), distance: Infinity })
    }
    return index
  }
  const seams: { a: number; b: number; length: number; owners: number[] }[] = []
  polygons.forEach((polygon, owner) => {
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length]
      const mid = a.clone().lerp(b, 0.5)
      if (
        !sites.some(
          (site, j) =>
            j !== owner &&
            Math.abs(mid.distanceToSquared(sites[owner]) - mid.distanceToSquared(site)) < 1e-6,
        )
      )
        return
      const ai = nodeFor(a),
        bi = nodeFor(b)
      const existing = seams.find(
        (edge) => (edge.a === ai && edge.b === bi) || (edge.a === bi && edge.b === ai),
      )
      if (existing) existing.owners.push(owner)
      else seams.push({ a: ai, b: bi, length: a.distanceTo(b), owners: [owner] })
    })
  })
  const target = new THREE.Vector2(-card.width * 0.18, card.height * 0.18)
  // Interior junctions have at least three incident seams; boundary terminals one.
  const junctions = nodes
    .map((_, index) => index)
    .filter((index) => seams.filter((edge) => edge.a === index || edge.b === index).length >= 3)
  const origin = junctions.reduce((best, index) =>
    nodes[index].point.distanceToSquared(target) < nodes[best].point.distanceToSquared(target)
      ? index
      : best,
  )
  nodes[origin].distance = 0
  const visited = new Set<number>()
  while (visited.size < nodes.length) {
    let next = -1
    nodes.forEach((node, index) => {
      if (!visited.has(index) && (next < 0 || node.distance < nodes[next].distance)) next = index
    })
    visited.add(next)
    for (const edge of seams) {
      const other = edge.a === next ? edge.b : edge.b === next ? edge.a : -1
      if (other >= 0)
        nodes[other].distance = Math.min(nodes[other].distance, nodes[next].distance + edge.length)
    }
  }
  const maxDistance = Math.max(
    ...seams.map((edge) => (nodes[edge.a].distance + nodes[edge.b].distance + edge.length) / 2),
  )
  const arrival = (distance: number) => 0.05 + (0.2 * distance) / maxDistance
  const areas = polygons.map(
    (polygon) =>
      Math.abs(polygon.reduce((sum, a, i) => sum + a.cross(polygon[(i + 1) % polygon.length]), 0)) /
      2,
  )
  const minArea = Math.min(...areas),
    maxArea = Math.max(...areas)
  const fragments = polygons.map((polygon, index) => {
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
      color: new THREE.Color('#c8bcac').multiplyScalar(0.94 + random() * 0.12),
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
    const crackArrivals: number[] = []
    const localSeams = seams.filter((seam) => seam.owners.includes(index))
    const hinge = localSeams.reduce((best, seam) =>
      Math.min(nodes[seam.a].distance, nodes[seam.b].distance) <
      Math.min(nodes[best.a].distance, nodes[best.b].distance)
        ? seam
        : best,
    )
    const hingeA = nodes[hinge.a].point,
      hingeB = nodes[hinge.b].point
    const pivot = new THREE.Vector3(hingeA.x - center.x, hingeA.y - center.y, 0)
    const axis = new THREE.Vector3(hingeB.x - hingeA.x, hingeB.y - hingeA.y, 0).normalize()
    // Choose the sign that lifts this piece toward the viewer.
    const liftSign = Math.sign(axis.x * -pivot.y - axis.y * -pivot.x)
    for (const seam of localSeams.filter((edge) => edge.owners[0] === index)) {
      const a = nodes[seam.a].point,
        b = nodes[seam.b].point
      const normal = new THREE.Vector2(-(b.y - a.y), b.x - a.x).normalize().multiplyScalar(0.003)
      const segments = Math.max(8, Math.ceil(seam.length / 0.045))
      for (let step = 0; step < segments; step++) {
        // Independent triangles allow alpha at the wavefront without a shader variant.
        for (const [along, side] of [
          [0, -1],
          [1, -1],
          [1, 1],
          [0, -1],
          [1, 1],
          [0, 1],
        ]) {
          const t = (step + along) / segments
          const point = a.clone().lerp(b, t).addScaledVector(normal, side).sub(center)
          crackVertices.push(point.x, point.y, 0.02)
          crackArrivals.push(
            arrival(
              Math.min(
                nodes[seam.a].distance + seam.length * t,
                nodes[seam.b].distance + seam.length * (1 - t),
              ),
            ),
          )
        }
      }
    }
    const crackGeometry = new THREE.BufferGeometry()
    crackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(crackVertices, 3))
    crackGeometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(new Float32Array(crackArrivals.length * 4), 4),
    )
    const crackMaterial = new THREE.MeshBasicMaterial({
      color: '#ead8b8',
      vertexColors: true,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    })
    const cracks = new THREE.Mesh(crackGeometry, crackMaterial)
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
      crackArrivals,
      pivot,
      axis,
      liftSign,
      weight: (areas[index] - minArea) / Math.max(0.001, maxArea - minArea),
      drift: (random() - 0.5) * 0.22,
      depth: (random() - 0.5) * 1.5,
      spin: new THREE.Vector3(
        (random() - 0.5) * 2.4,
        (random() - 0.5) * 2.8,
        (random() - 0.5) * 1.4,
      ),
      delay:
        (0.035 * (areas[index] - minArea)) / Math.max(0.001, maxArea - minArea) +
        (0.035 * Math.min(nodes[hinge.a].distance, nodes[hinge.b].distance)) / maxDistance,
    }
  })
  const hingeRotation = new THREE.Quaternion()
  const freeRotation = new THREE.Quaternion()
  const spinEuler = new THREE.Euler()
  const offset = new THREE.Vector3()
  let disposed = false
  return {
    group,
    setProgress(value: number) {
      const progress = THREE.MathUtils.clamp(value, 0, 1)
      card.object.visible = progress < 0.025
      group.visible = progress >= 0.025 && progress < 1
      for (const f of fragments) {
        const opening = smooth(0.2 + f.delay, 0.4 + f.delay, progress)
        const travel = Math.max(0, (progress - 0.32 - f.delay) / (0.68 - f.delay))
        const scatter = travel * travel
        const lightness = 1 - f.weight
        hingeRotation.setFromAxisAngle(f.axis, f.liftSign * (0.09 + lightness * 0.09) * opening)
        freeRotation.setFromEuler(
          spinEuler.set(
            f.spin.x * scatter * (0.55 + lightness * 0.65),
            f.spin.y * scatter * (0.55 + lightness * 0.65),
            f.spin.z * scatter * (0.4 + lightness * 0.6),
          ),
        )
        f.object.quaternion.copy(freeRotation).multiply(hingeRotation)
        // Rotate about a fixed seam first. Keeping its final offset during free
        // flight makes detachment continuous and independent of frame history.
        offset.copy(f.pivot).negate().applyQuaternion(hingeRotation).add(f.pivot)
        f.object.position.set(
          f.center.x +
            offset.x +
            f.center.x * (opening * 0.009 + scatter * (0.38 + lightness * 0.24)) +
            f.drift * scatter,
          f.center.y +
            offset.y +
            f.center.y * opening * 0.009 +
            0.14 * travel -
            (1.35 + lightness * 0.45) * scatter,
          offset.z + f.depth * scatter * (0.5 + lightness * 0.5),
        )
        const opacity = 1 - smooth(0.72 + f.delay, 1, progress)
        for (const mesh of [f.face, f.edge]) mesh.material.opacity = opacity
        const colors = f.crackGeometry.getAttribute('color')
        for (let i = 0; i < f.crackArrivals.length; i++) {
          const at = f.crackArrivals[i]
          const alpha =
            smooth(at, at + 0.012, progress) *
            (1 - smooth(at + 0.025, at + 0.085, progress)) *
            (1 - smooth(0.25, 0.36, progress)) *
            0.7
          colors.setXYZW(i, 1, 1, 1, alpha)
        }
        colors.needsUpdate = true
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
