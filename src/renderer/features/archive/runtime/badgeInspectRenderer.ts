import * as THREE from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { vertexShader, fragmentShader } from './badgeShaders'
import grainTexture from '../assets/milestones/case/brushed-aluminium.png?url'
import type { BadgeMaterialDescriptor, BadgeState } from './badgeMaterialRenderer'

export interface InspectBadge {
  id: string
  contour: string
  material: BadgeMaterialDescriptor
  state: BadgeState
}

const metalVertex = /* glsl */ `
varying vec3 surfaceNormal;
varying vec2 grainUv;
varying vec2 viewSurface;
void main() {
  surfaceNormal = normalize(normalMatrix * normal);
  grainUv = position.xy / 330. + .5;
  viewSurface = (modelViewMatrix * vec4(position, 1.)).xy / 330.;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`
const metalFragment = /* glsl */ `
uniform sampler2D grainMap;
uniform vec3 metalTint;
varying vec3 surfaceNormal;
varying vec2 grainUv;
varying vec2 viewSurface;
void main() {
  vec3 n = normalize(surfaceNormal);
  vec3 r = reflect(vec3(0., 0., -1.), n);
  vec3 light = normalize(vec3(-.42, .55, .82));
  float grain = texture2D(grainMap, grainUv * vec2(1.3, 2.8)).r;
  float diffuse = .32 + .28 * max(dot(n, light), 0.);
  float panel = exp(-(1. - dot(r, light)) / .16);
  float strip = exp(-pow((r.x - .58) / .21, 2.)) * (.5 + .5 * max(r.z, 0.));
  float fresnel = pow(1. - max(n.z, 0.), 5.);
  vec2 p = viewSurface + r.xy / max(r.z, .18) * 1.2;
  float diagonal = p.y + p.x * .65;
  float nearbyPanel = 1. - smoothstep(.08, .30, abs(diagonal - .04));
  float lowerPanel = 1. - smoothstep(.03, .16, abs(diagonal + .4));
  vec3 silver = metalTint * (.86 + .28 * grain);
  vec3 reflected = vec3(.12, .15, .18) + vec3(.56, .59, .63) * panel + vec3(.26, .30, .35) * strip;
  reflected += vec3(.32, .34, .36) * nearbyPanel + vec3(.10, .13, .16) * lowerPanel;
  gl_FragColor = vec4(silver * diffuse + reflected * (.64 + .25 * fresnel), 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

// Solid badge body. The front uses the product's existing GLSL shader
// and five material maps; none of the original badge artwork is regenerated.
export function createInspectRenderer(
  canvas: HTMLCanvasElement,
  onError: (error: unknown) => void,
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.debug.onShaderError = () =>
    onError(new Error('Badge inspection shader compilation failed'))
  const camera = new THREE.OrthographicCamera(-165, 165, 185, -185, 0.1, 2000)
  camera.position.z = 1000
  const scene = new THREE.Scene()
  let object = new THREE.Group()
  scene.add(object)
  const loader = new THREE.TextureLoader()
  let settleGrain!: (ready: boolean) => void
  const grainReady = new Promise<boolean>((resolve) => {
    settleGrain = resolve
  })
  const grain = loader.load(
    grainTexture,
    () => settleGrain(true),
    undefined,
    () => settleGrain(false),
  )
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping
  const metal = new THREE.ShaderMaterial({
    vertexShader: metalVertex,
    fragmentShader: metalFragment,
    uniforms: {
      grainMap: { value: grain },
      metalTint: { value: new THREE.Color(0.52, 0.56, 0.59) },
    },
  })
  const fastening = new THREE.ShaderMaterial({
    vertexShader: metalVertex,
    fragmentShader: metalFragment,
    uniforms: {
      grainMap: { value: grain },
      metalTint: { value: new THREE.Color(0.21, 0.24, 0.27) },
    },
  })
  const front = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      baseMap: { value: null },
      materialMap: { value: null },
      normalMap: { value: null },
      occlusionMap: { value: null },
      finishMap: { value: null },
      useFinish: { value: 0 },
      reflections: { value: 1 },
      unlit: { value: 0 },
      roughness: { value: new THREE.Vector4(0.22, 0.12, 0.18, 0.65) },
    },
  })
  interface Model {
    key: string
    group: THREE.Group
    textures: THREE.Texture[]
    front: THREE.ShaderMaterial
  }
  let current: Model | undefined, prepared: Model | undefined
  let revision = 0,
    disposed = false,
    ready = false,
    badgeId = '',
    frames = 0
  const pose = { x: 0, y: 0 }
  function release(model: Model | undefined) {
    if (!model) return
    for (const mesh of [...model.group.children]) {
      if (mesh instanceof THREE.Mesh) mesh.geometry.dispose()
      model.group.remove(mesh)
    }
    for (const texture of model.textures) texture.dispose()
    model.front.dispose()
  }
  function mesh(
    group: THREE.Group,
    geometry: THREE.BufferGeometry,
    material = metal,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const part = new THREE.Mesh(geometry, material)
    part.position.set(x, y, z)
    group.add(part)
    return part
  }
  function contextLost(event: Event) {
    event.preventDefault()
    if (!disposed) onError(new Error('Badge inspection WebGL context lost'))
  }
  canvas.addEventListener('webglcontextlost', contextLost)
  function cancelLoad() {
    revision++
    release(prepared)
    prepared = undefined
  }
  function activatePrepared() {
    if (disposed || !prepared) return false
    scene.remove(object)
    release(current)
    current = prepared
    prepared = undefined
    object = current.group
    scene.add(object)
    badgeId = current.key
    ready = true
    return true
  }
  async function prepare(entry: InspectBadge) {
    if (disposed) return false
    cancelLoad()
    const owner = ++revision,
      next: THREE.Texture[] = []
    let model: Model | undefined
    try {
      const keys = ['base', 'material', 'normal', 'ao', 'finish'] as const
      // Decode independent maps concurrently; retain ownership of every fulfilled
      // texture so cancellation or one failed request cannot leak the others.
      const [loaded, grainLoaded] = await Promise.all([
        Promise.allSettled(
          keys.map((key) => loader.loadAsync(entry.material.states[entry.state][key])),
        ),
        grainReady,
      ])
      for (const result of loaded) if (result.status === 'fulfilled') next.push(result.value)
      if (disposed || owner !== revision) {
        for (const texture of next) texture.dispose()
        return false
      }
      if (!grainLoaded) throw new Error('Badge back texture failed to load')
      const failure = loaded.find((result) => result.status === 'rejected')
      if (failure) throw failure.reason
      for (const [i, key] of keys.entries()) {
        const texture = next[i]
        texture.colorSpace = key === 'base' ? THREE.SRGBColorSpace : THREE.NoColorSpace
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4)
      }
      const group = new THREE.Group()
      const material = front.clone()
      model = { key: `${entry.id}:${entry.state}`, group, textures: next, front: material }
      for (const [i, key] of [
        'baseMap',
        'materialMap',
        'normalMap',
        'occlusionMap',
        'finishMap',
      ].entries())
        material.uniforms[key].value = next[i]
      material.uniforms.unlit.value = entry.state === 'unlit' ? 1 : 0
      material.uniforms.useFinish.value = entry.material.baseline ? 0 : 1
      material.uniforms.roughness.value.fromArray(entry.material.roughness)
      const paths = new SVGLoader().parse(
        `<svg xmlns="http://www.w3.org/2000/svg"><path d="${entry.contour}"/></svg>`,
      ).paths
      const points = SVGLoader.createShapes(paths[0])[0]
        .getPoints(16)
        .map((point) => new THREE.Vector2(point.x - 165, 185 - point.y))
      const shape = new THREE.Shape(points)
      const body = new THREE.ExtrudeGeometry(shape, {
        depth: 6,
        bevelEnabled: true,
        bevelThickness: 1.3,
        bevelSize: 0.8,
        bevelSegments: 3,
        steps: 1,
      })
      body.translate(0, 0, -3)
      mesh(group, body)
      mesh(group, new THREE.PlaneGeometry(330, 370), material, 0, 0, 4.5)
      // A plain, unlettered metal back with a small brooch fastening.
      for (const x of [-62, 62]) {
        const mounting = mesh(
          group,
          new THREE.CylinderGeometry(7, 8, 3.5, 24),
          fastening,
          x,
          12,
          -6.5,
        )
        mounting.rotation.x = Math.PI / 2
      }
      const pin = mesh(group, new THREE.CylinderGeometry(1.8, 1.8, 124, 16), fastening, 0, 12, -9)
      pin.rotation.z = Math.PI / 2
      // Finish uploads and prepare the programs before starting the authored
      // turn, using the existing renderer's texture/program caches.
      for (const texture of [...next, grain]) renderer.initTexture(texture)
      const preparation = new THREE.Scene()
      preparation.add(group)
      await renderer.compileAsync(preparation, camera)
      preparation.remove(group)
      if (disposed || owner !== revision) {
        release(model)
        return false
      }
      prepared = model
      return true
    } catch (error) {
      if (model) release(model)
      else for (const loaded of next) loaded.dispose()
      if (!disposed && owner === revision) throw error
      return false
    }
  }
  return {
    prepare,
    activatePrepared,
    async load(entry: InspectBadge) {
      if (ready && badgeId === `${entry.id}:${entry.state}`) return true
      return (await prepare(entry)) && activatePrepared()
    },
    resize(width: number, height: number) {
      renderer.setPixelRatio(Math.min(2, Math.max(1, devicePixelRatio || 1)))
      renderer.setSize(Math.max(1, width), Math.max(1, height), false)
    },
    render(x = pose.x, y = pose.y) {
      if (disposed || !ready) return
      pose.x = x
      pose.y = y
      object.rotation.set(x, y, 0, 'YXZ')
      renderer.render(scene, camera)
      frames++
    },
    forceContextLoss() {
      renderer.forceContextLoss()
    },
    cancelLoad,
    snapshot() {
      return {
        badgeId,
        ready,
        frames,
        pose: { ...pose },
        textures: (current?.textures.length ?? 0) + (prepared?.textures.length ?? 0) + 1,
        preparedBadgeId: prepared?.key ?? null,
        models: Number(!!current) + Number(!!prepared),
        meshes: object.children.length,
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      revision++
      canvas.removeEventListener('webglcontextlost', contextLost)
      release(current)
      release(prepared)
      current = prepared = undefined
      ready = false
      grain.dispose()
      metal.dispose()
      fastening.dispose()
      front.dispose()
      renderer.dispose()
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss()
    },
  }
}
