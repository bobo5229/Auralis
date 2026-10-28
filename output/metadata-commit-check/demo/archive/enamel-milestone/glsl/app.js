import * as THREE from 'three'
import { vertexShader, fragmentShader } from './shaders.js'

const byId = (id) => document.getElementById(id)
const stage = byId('live-stage')
const canvas = byId('badge-canvas')
const small = byId('small-canvas')
const smallContext = small.getContext('2d')
const motion = matchMedia('(prefers-reduced-motion: reduce)')
const maxAngle = THREE.MathUtils.degToRad(8)
const poses = { x: 0, y: 0, targetX: 0, targetY: 0 }
const materialDefaults = { silver: 0.22, enamel: 0.12, opal: 0.18, unlit: 0.65 }
let renderer, material, mesh, geometry, scene, camera, observer
let resolutionQuery
function watchResolution() {
  resolutionQuery?.removeEventListener('change', onResolution)
  resolutionQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
  resolutionQuery.addEventListener('change', onResolution)
}
function onResolution() {
  resize()
  watchResolution()
}
let frame = 0,
  previousTime = 0,
  frames = 0,
  ready = false,
  failed = false,
  disposed = false
let state = 'lit',
  reflections = true,
  drawSize = 1,
  scale = 1,
  forceDraw = false
const sets = new Map()
const textures = new Set()
const durations = []

function originalSource() {
  return `../hours/assets/hours-100${state === 'unlit' ? '-unlit' : ''}@2x.png`
}
function updateOriginals() {
  for (const id of ['original', 'small-original', 'fallback', 'small-fallback'])
    byId(id).src = originalSource()
  byId('lit').setAttribute('aria-pressed', String(state === 'lit'))
  byId('unlit').setAttribute('aria-pressed', String(state === 'unlit'))
}
function stop() {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  previousTime = 0
}
function releaseGraphics() {
  observer?.disconnect()
  geometry?.dispose()
  material?.dispose()
  for (const texture of textures) texture.dispose()
  textures.clear()
  renderer?.dispose()
}
function fail(error) {
  if (failed || disposed) return
  failed = true
  ready = false
  stop()
  canvas.hidden = true
  small.hidden = true
  byId('fallback').hidden = false
  byId('small-fallback').hidden = false
  byId('reflection').disabled = true
  byId('finish').textContent = '静态预览'
  byId('status').textContent = '动态材质暂不可用，已显示原版徽章。'
  byId('instructions').textContent = '当前为静态预览。'
  console.warn('Badge material fallback:', error?.message || error)
  releaseGraphics()
}
function requestDraw() {
  if (!ready || failed || disposed || document.hidden) return
  forceDraw = true
  if (!frame) frame = requestAnimationFrame(tick)
}
function setTarget(x, y) {
  if (!ready || failed) return
  poses.targetX = Math.max(-maxAngle, Math.min(maxAngle, x))
  poses.targetY = Math.max(-maxAngle, Math.min(maxAngle, y))
  requestDraw()
}
function copySmall() {
  const physicalWidth = renderer.domElement.width
  const ratio = physicalWidth / drawSize
  const sourceWidth = 330 * scale * ratio
  const sourceHeight = 370 * scale * ratio
  const left = (physicalWidth - sourceWidth) / 2
  const top = (renderer.domElement.height - sourceHeight) / 2
  smallContext.clearRect(0, 0, small.width, small.height)
  smallContext.drawImage(
    canvas,
    left,
    top,
    sourceWidth,
    sourceHeight,
    0,
    0,
    small.width,
    small.height,
  )
}
function draw() {
  mesh.rotation.set(poses.x, poses.y, 0, 'YXZ')
  const x = THREE.MathUtils.radToDeg(poses.x),
    y = THREE.MathUtils.radToDeg(poses.y)
  byId('original').style.transform = `rotateY(${y}deg) rotateX(${-x}deg)`
  byId('small-original').style.transform = `rotateY(${y}deg) rotateX(${-x}deg)`
  renderer.render(scene, camera)
  if (failed) return
  copySmall()
  frames++
}
function tick(time) {
  frame = 0
  if (failed || disposed || document.hidden) {
    previousTime = 0
    return
  }
  const dt = previousTime ? Math.min(time - previousTime, 50) : 16.7
  if (previousTime) {
    durations.push(time - previousTime)
    if (durations.length > 1200) durations.shift()
  }
  previousTime = time
  const alpha = motion.matches ? 1 : 1 - Math.exp(-dt / 65)
  poses.x += (poses.targetX - poses.x) * alpha
  poses.y += (poses.targetY - poses.y) * alpha
  const moving = Math.abs(poses.x - poses.targetX) + Math.abs(poses.y - poses.targetY) > 0.00015
  if (!moving) {
    poses.x = poses.targetX
    poses.y = poses.targetY
  }
  try {
    if (forceDraw || moving) draw()
  } catch (error) {
    fail(error)
    return
  }
  forceDraw = moving
  if (moving && !failed) frame = requestAnimationFrame(tick)
  else previousTime = 0
}
function resize() {
  if (failed || disposed || !renderer || !camera || !mesh) return
  drawSize = Math.max(1, stage.clientWidth)
  const dpr = Math.min(devicePixelRatio || 1, 2)
  renderer.setPixelRatio(dpr)
  renderer.setSize(drawSize, drawSize, false)
  camera.left = -drawSize / 2
  camera.right = drawSize / 2
  camera.top = drawSize / 2
  camera.bottom = -drawSize / 2
  camera.updateProjectionMatrix()
  scale = Math.min(drawSize * 0.86, 440) / 330
  mesh.scale.setScalar(scale)
  small.width = Math.round(96 * dpr)
  small.height = Math.round(((96 * 370) / 330) * dpr)
  requestDraw()
}
function setState(next) {
  if (!['lit', 'unlit'].includes(next)) return
  state = next
  updateOriginals()
  if (ready && !failed) {
    const maps = sets.get(state)
    for (const [uniform, key] of [
      ['baseMap', 'base'],
      ['materialMap', 'material'],
      ['normalMap', 'normal'],
      ['occlusionMap', 'ao'],
    ])
      material.uniforms[uniform].value = maps[key]
    material.uniforms.unlit.value = state === 'unlit' ? 1 : 0
    requestDraw()
  }
}
function setReflections(value) {
  reflections = Boolean(value)
  if (material && !failed) material.uniforms.reflections.value = reflections ? 1 : 0
  byId('finish').textContent = failed
    ? '静态预览'
    : reflections
      ? '动态反光'
      : '关闭反光 · 检查底色'
  requestDraw()
}
function onPointer(event) {
  if (motion.matches || event.pointerType === 'touch') return
  const box = event.currentTarget.getBoundingClientRect()
  setTarget(
    (-(event.clientY - box.top - box.height / 2) / (box.height / 2)) * maxAngle,
    ((event.clientX - box.left - box.width / 2) / (box.width / 2)) * maxAngle,
  )
}
function reset() {
  setTarget(0, 0)
}
for (const host of [stage, byId('original-stage')]) {
  host.addEventListener('pointermove', onPointer)
  host.addEventListener('pointerleave', reset)
  host.addEventListener('pointercancel', reset)
}
stage.addEventListener('keydown', (event) => {
  const step = THREE.MathUtils.degToRad(2)
  if (event.key === 'Home') {
    event.preventDefault()
    reset()
    return
  }
  const offsets = {
    ArrowLeft: [0, -step],
    ArrowRight: [0, step],
    ArrowUp: [step, 0],
    ArrowDown: [-step, 0],
  }
  if (offsets[event.key]) {
    event.preventDefault()
    const [x, y] = offsets[event.key]
    setTarget(poses.targetX + x, poses.targetY + y)
  }
})
byId('lit').addEventListener('click', () => setState('lit'))
byId('unlit').addEventListener('click', () => setState('unlit'))
byId('reflection').addEventListener('change', (event) => setReflections(event.target.checked))
byId('reset').addEventListener('click', reset)
byId('theme').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light'
  document.documentElement.dataset.theme = light ? 'light' : 'dark'
  byId('theme').setAttribute('aria-pressed', String(light))
  byId('theme').textContent = light ? '深色背景' : '浅色背景'
})
function onMotion() {
  reset()
  byId('instructions').textContent = motion.matches
    ? '已减弱动态效果。可用方向键调整，Home 复位。'
    : '移动鼠标，观察银边与釉面的受光变化。'
}
motion.addEventListener('change', onMotion)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop()
  else requestDraw()
})
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault()
  fail(new Error('WebGL context lost'))
})
window.addEventListener('resize', resize)
window.addEventListener(
  'pagehide',
  () => {
    disposed = true
    stop()
    releaseGraphics()
    motion.removeEventListener('change', onMotion)
    window.removeEventListener('resize', resize)
    resolutionQuery?.removeEventListener('change', onResolution)
  },
  { once: true },
)

// Read-only diagnostics used by the isolated Electron verifier. Input tests use
// DOM and webContents input events, never replace the material or renderer.
window.badgeStudy = {
  snapshot() {
    return {
      ready,
      failed,
      disposed,
      state,
      reflections,
      frames,
      running: Boolean(frame),
      reducedMotion: motion.matches,
      pose: { ...poses },
      dpr: renderer?.getPixelRatio(),
      timings: durations.slice(),
      textureCount: textures.size,
    }
  },
  forceContextLoss() {
    renderer?.forceContextLoss()
  },
}

try {
  if (new URLSearchParams(location.search).has('fallback'))
    throw new Error('Explicit fallback preview')
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.debug.onShaderError = () => fail(new Error('Shader compilation failed'))
  const response = await fetch('assets/manifest.json')
  if (!response.ok) throw new Error('Material manifest missing; run build-materials.mjs')
  const manifest = await response.json()
  const loader = new THREE.TextureLoader()
  for (const name of ['lit', 'unlit']) {
    const maps = {}
    for (const key of ['base', 'material', 'normal', 'ao']) {
      const texture = await loader.loadAsync(manifest.states[name][key])
      if (failed || disposed) {
        texture.dispose()
        throw new Error('Material session ended during loading')
      }
      texture.colorSpace = key === 'base' ? THREE.SRGBColorSpace : THREE.NoColorSpace
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4)
      maps[key] = texture
      textures.add(texture)
    }
    sets.set(name, maps)
  }
  material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      baseMap: { value: null },
      materialMap: { value: null },
      normalMap: { value: null },
      occlusionMap: { value: null },
      reflections: { value: 1 },
      unlit: { value: 0 },
      roughness: {
        value: new THREE.Vector4(
          materialDefaults.silver,
          materialDefaults.enamel,
          materialDefaults.opal,
          materialDefaults.unlit,
        ),
      },
    },
  })
  geometry = new THREE.PlaneGeometry(330, 370)
  mesh = new THREE.Mesh(geometry, material)
  scene = new THREE.Scene()
  scene.add(mesh)
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000)
  camera.position.z = 1000
  ready = true
  setState(state)
  resize()
  onMotion()
  observer = new ResizeObserver(resize)
  observer.observe(stage)
  watchResolution()
  byId('status').textContent = ''
} catch (error) {
  fail(error)
}
