import * as THREE from 'three'
import {
  createCardArtwork,
  createCardPrintMask,
  drawCardArtwork,
  type CardContent,
} from './cardArtwork'
import { createCardAppearance, type CardAppearance } from './cardAppearance'
import { createCardCoating } from './cardMaterial'
import type { BackgroundId } from './backgrounds/backgrounds'

export type CardFinish = 'bands' | 'glitter'

export function createAlbumCard(
  content: CardContent,
  options: { background?: BackgroundId; appearance?: CardAppearance } = {},
) {
  let appearance = options.appearance ?? createCardAppearance(content.cover, options.background)
  let contentId = content.id
  const printMask = createCardPrintMask()
  const texture = createCardArtwork(content, appearance, printMask)
  const finish = { value: 0 }
  const sweepPosition = { value: 1.5 }
  const sweepStrength = { value: 0 }
  const redSurface = { value: appearance.redSurface }
  const uniforms = { finish, sweepPosition, sweepStrength }
  const surface = createCardCoating(texture, printMask, redSurface, uniforms)
  const w = 2.65,
    h = 3.8,
    r = 0.09
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2 + r, -h / 2)
  shape.lineTo(w / 2 - r, -h / 2)
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  shape.lineTo(w / 2, h / 2 - r)
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  shape.lineTo(-w / 2 + r, h / 2)
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  shape.lineTo(-w / 2, -h / 2 + r)
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  const faceGeometry = new THREE.ShapeGeometry(shape, 8)
  const positions = faceGeometry.getAttribute('position')
  const uv = faceGeometry.getAttribute('uv')
  for (let i = 0; i < positions.count; i++)
    uv.setXY(i, positions.getX(i) / w + 0.5, positions.getY(i) / h + 0.5)
  const object = new THREE.Group()
  const edges = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false, curveSegments: 8 }),
    new THREE.MeshStandardMaterial({
      color: '#e1d6c9',
      roughness: 0.68,
      transparent: true,
      side: THREE.DoubleSide,
    }),
  )
  // Keep only the extrusion walls; cap faces would cover the shared artwork
  // whenever the card turns away from the viewer.
  const sides = edges.geometry.groups[1]
  edges.geometry.setDrawRange(sides.start, sides.count)
  edges.position.z = -0.0175
  const front = new THREE.Mesh(faceGeometry, surface)
  front.position.z = 0.018
  object.add(edges, front)
  return {
    object,
    face: front,
    // Share the rounded face without rendering or allocating GPU resources.
    // The scene keeps this surface at the fixed presentation pose for hover.
    hoverSurface: new THREE.Mesh(faceGeometry, surface),
    width: w,
    height: h,
    texture,
    printMask,
    // Fragment surfaces share the same artwork, mask, foil, and entrance sweep.
    // Their caller owns/disposes the materials, while this card owns textures.
    createFragmentMaterial() {
      return createCardCoating(texture, printMask, redSurface, uniforms)
    },
    get appearance() {
      return appearance
    },
    disposeArtwork() {
      texture.dispose()
      printMask.dispose()
    },
    setEntranceSweep(position: number, strength: number) {
      sweepPosition.value = position
      sweepStrength.value = strength
    },
    setContent(
      value: CardContent,
      nextAppearance: CardAppearance = createCardAppearance(
        value.cover,
        value.id === contentId ? appearance.background : options.background,
        value.id === contentId ? appearance.patternSeed : undefined,
      ),
    ) {
      contentId = value.id
      appearance = nextAppearance
      redSurface.value = appearance.redSurface
      drawCardArtwork(texture, value, appearance, printMask)
    },
    setFinish(value: CardFinish) {
      finish.value = value === 'glitter' ? 1 : 0
    },
  }
}
