import * as THREE from 'three'
import { vertexShader, fragmentShader } from './badgeShaders'

export type BadgeState = 'lit' | 'unlit'
export interface BadgeMaterialMaps {
  base: string
  material: string
  normal: string
  ao: string
  finish: string
}
export interface BadgeMaterialDescriptor {
  id: string
  baseline: boolean
  roughness: readonly number[]
  states: Record<BadgeState, BadgeMaterialMaps>
}

/** A single owned WebGL context. Selection changes replace its texture set. */
export function createBadgeMaterialRenderer(
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
  renderer.debug.onShaderError = () => onError(new Error('Badge shader compilation failed'))
  const material = new THREE.ShaderMaterial({
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
  const geometry = new THREE.PlaneGeometry(330, 370)
  const mesh = new THREE.Mesh(geometry, material)
  const scene = new THREE.Scene()
  scene.add(mesh)
  const camera = new THREE.OrthographicCamera(-165, 165, 185, -185, 0.1, 2000)
  camera.position.z = 1000
  const textures = new Set<THREE.Texture>()
  let active: THREE.Texture[] = []
  let revision = 0,
    disposed = false,
    ready = false,
    frames = 0
  let badgeId = '',
    state: BadgeState = 'lit'
  const pose = { x: 0, y: 0 }
  const loader = new THREE.TextureLoader()
  function release(values: THREE.Texture[]) {
    for (const texture of values) {
      texture.dispose()
      textures.delete(texture)
    }
  }
  function contextLost(event: Event) {
    event.preventDefault()
    if (!disposed) onError(new Error('Badge WebGL context lost'))
  }
  canvas.addEventListener('webglcontextlost', contextLost)
  return {
    async load(
      descriptor: BadgeMaterialDescriptor,
      nextState: BadgeState = 'lit',
    ): Promise<boolean> {
      if (disposed) return false
      const owner = ++revision
      const next: THREE.Texture[] = []
      try {
        for (const key of ['base', 'material', 'normal', 'ao', 'finish'] as const) {
          const texture = await loader.loadAsync(descriptor.states[nextState][key])
          if (disposed || owner !== revision) {
            texture.dispose()
            release(next)
            return false
          }
          texture.colorSpace = key === 'base' ? THREE.SRGBColorSpace : THREE.NoColorSpace
          texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4)
          textures.add(texture)
          next.push(texture)
          // Commit the complete set below; an older selection remains coherent during loading.
        }
        if (disposed || owner !== revision) {
          release(next)
          return false
        }
        release(active)
        active = next
        for (const [i, key] of [
          'baseMap',
          'materialMap',
          'normalMap',
          'occlusionMap',
          'finishMap',
        ].entries())
          material.uniforms[key].value = active[i]
        material.uniforms.unlit.value = nextState === 'unlit' ? 1 : 0
        material.uniforms.useFinish.value = descriptor.baseline ? 0 : 1
        material.uniforms.roughness.value.fromArray(descriptor.roughness)
        badgeId = descriptor.id
        state = nextState
        ready = true
        return true
      } catch (error) {
        release(next)
        if (disposed || owner !== revision) return false
        throw error
      }
    },
    resize(width: number, height: number, dpr = devicePixelRatio || 1) {
      if (disposed) return
      renderer.setPixelRatio(Math.min(2, Math.max(1, dpr)))
      renderer.setSize(Math.max(1, width), Math.max(1, height), false)
      const aspect = width / Math.max(1, height)
      const halfHeight = Math.max(185, 165 / aspect)
      camera.left = -halfHeight * aspect
      camera.right = halfHeight * aspect
      camera.top = halfHeight
      camera.bottom = -halfHeight
      camera.updateProjectionMatrix()
    },
    render(x = pose.x, y = pose.y) {
      if (disposed || !ready) return
      pose.x = THREE.MathUtils.clamp(x, -8, 8)
      pose.y = THREE.MathUtils.clamp(y, -8, 8)
      mesh.rotation.set(
        THREE.MathUtils.degToRad(pose.x),
        THREE.MathUtils.degToRad(pose.y),
        0,
        'YXZ',
      )
      renderer.render(scene, camera)
      frames++
    },
    setReflections(enabled: boolean) {
      material.uniforms.reflections.value = enabled ? 1 : 0
    },
    snapshot() {
      return {
        badgeId,
        state,
        ready,
        disposed,
        frames,
        textures: textures.size,
        dpr: renderer.getPixelRatio(),
        pose: { ...pose },
      }
    },
    capture() {
      if (disposed || !ready) throw new Error('Badge is not ready')
      renderer.render(scene, camera)
      return canvas.toDataURL('image/png')
    },
    forceContextLoss() {
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss()
    },
    dispose() {
      if (disposed) return
      disposed = true
      ready = false
      revision++
      canvas.removeEventListener('webglcontextlost', contextLost)
      release([...textures])
      active = []
      material.dispose()
      geometry.dispose()
      renderer.dispose()
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss()
    },
  }
}
