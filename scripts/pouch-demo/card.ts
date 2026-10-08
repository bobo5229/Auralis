import * as THREE from 'three'
import { createCardArtwork, drawCardArtwork, type CardSample } from './cardArtwork'

export type CardFinish = 'bands' | 'glitter'

export function createAlbumCard() {
  const texture = createCardArtwork()
  const backTexture = createCardArtwork(true)
  const finish = { value: 0 }
  const surface = new THREE.MeshPhysicalMaterial({
    map: texture,
    metalness: 0.08,
    roughness: 0.38,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
  })
  // View/light driven coating. Fixed facets catch light at different angles;
  // there is no clock, scrolling rainbow, randomly blinking particle or bloom.
  surface.onBeforeCompile = (shader) => {
    shader.uniforms.uCardFinish = finish
    shader.fragmentShader =
      `uniform float uCardFinish;
      float cardSeed(vec2 p) { return fract(sin(dot(p, vec2(73.17, 219.43))) * 18437.29); }
      vec3 cardSpectrum(float phase) {
        return 0.55 + 0.45 * cos(6.283185 * (phase + vec3(0., 0.33, 0.67)));
      }
      ` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      vec2 uv = vMapUv;
      vec3 view = normalize(vViewPosition);
      vec3 reflected = reflect(-view, normal);
      float art = step(0.052, uv.x) * step(uv.x, 0.948) * step(0.335, uv.y) * step(uv.y, 0.96);
      float coating = mix(0.8, 0.4, art);
      float phase = uv.x * 0.6 + uv.y * 1.15 + reflected.x * 1.4 + reflected.y * 0.9;
      vec3 rainbow = cardSpectrum(phase);
      float band = pow(0.5 + 0.5 * sin((uv.x * 1.3 + uv.y * 0.65 + reflected.x * 1.1 - reflected.y * 0.7) * 10.), 10.);
      vec2 cell = floor(uv * vec2(145., 208.));
      vec2 local = fract(uv * vec2(145., 208.));
      float seed = cardSeed(cell);
      vec2 facet = vec2(cardSeed(cell + 3.7), cardSeed(cell + 17.1)) * 2. - 1.;
      float alignment = pow(max(0., 1. - length(reflected.xy - facet * 0.8) * 1.4), 9.);
      float fleck = (1. - smoothstep(0.12, 0.34, length(local - 0.5))) * step(0.25, seed);
      float sparkle = alignment * fleck;
      float intensity = mix(0.08 + band * 0.5, 0.035 + sparkle * 2.4, uCardFinish);
      diffuseColor.rgb *= mix(vec3(1.), 0.75 + rainbow * 0.5, coating * mix(0.85, 0.3, uCardFinish));
      totalEmissiveRadiance += mix(rainbow, vec3(1., 0.95, 0.86), uCardFinish * 0.65) * intensity * coating;
      `,
    )
  }
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
    new THREE.MeshStandardMaterial({ color: '#e1d6c9', roughness: 0.68 }),
  )
  edges.position.z = -0.0175
  const front = new THREE.Mesh(faceGeometry, surface)
  front.position.z = 0.018
  const backSurface = surface.clone()
  backSurface.map = backTexture
  backSurface.onBeforeCompile = (shader, renderer) => {
    surface.onBeforeCompile(shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      'float coating = mix(0.8, 0.4, art);',
      'float coating = 0.8;',
    )
  }
  const back = new THREE.Mesh(faceGeometry, backSurface)
  back.rotation.y = Math.PI
  back.position.z = -0.018
  object.add(edges, front, back)
  return {
    object,
    texture,
    backTexture,
    setSample(value: CardSample) {
      drawCardArtwork(texture, value)
      drawCardArtwork(backTexture, value, true)
    },
    setFinish(value: CardFinish) {
      finish.value = value === 'glitter' ? 1 : 0
    },
  }
}
