import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export const presets = [88, 92, 94, 96, 102, 104, 107]
export type View = 'front' | 'back' | 'left' | 'right' | 'top' | 'home'
export interface RadioState {
  on: boolean
  volume: number
  channel: number
  bass: number
  antenna: number
}
type Control = 'power' | 'volume' | 'channel' | 'bass' | 'antenna' | `preset:${number}`
export interface SceneSnapshot {
  ready: boolean
  frames: number
  calls: number
  triangles: number
  textures: number
  polar: number
  azimuth: number
  dragging: Control | null
  orbitEnabled: boolean
  loadMs: number
  renderMs: number
  contextLost: boolean
  pendingFrame: boolean
  modelDrawn: boolean
  distance: number
  webglRenderer: string
}

export function createRadioScene(
  host: HTMLElement,
  getState: () => RadioState,
  change: (patch: Partial<RadioState>) => void,
  hover: (control: string) => void,
  failed: (message: string) => void,
) {
  const started = performance.now()
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#e7e2da')
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50)
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.9
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.shadowMap.autoUpdate = false
  const canvas = renderer.domElement
  const gl = renderer.getContext()
  const debug = gl.getExtension('WEBGL_debug_renderer_info')
  const webglRenderer = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
  canvas.setAttribute('aria-label', '收音机三维视图；拖动旋转，滚轮缩放。部件也可用右侧控件操作。')
  host.append(canvas)

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0.15, 1.3, 0)
  controls.enablePan = false
  controls.enableDamping = false
  controls.minDistance = 4.5
  controls.maxDistance = 12
  controls.minPolarAngle = 0.035
  controls.maxPolarAngle = Math.PI / 2
  controls.rotateSpeed = 0.65
  controls.zoomSpeed = 0.7

  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room)
  scene.environment = environment.texture
  scene.environmentIntensity = 0.35
  room.dispose()
  pmrem.dispose()
  scene.add(new THREE.HemisphereLight(0xfff4e2, 0x777e87, 0.8))
  const sun = new THREE.DirectionalLight(0xfff4e5, 2)
  sun.position.set(-3, 7, 5)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -4
  sun.shadow.camera.right = 4
  sun.shadow.camera.top = 4
  sun.shadow.camera.bottom = -4
  sun.shadow.normalBias = 0.025
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xdce8ff, 1)
  fill.position.set(4, 3, -5)
  scene.add(fill)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ color: '#706452', opacity: 0.16 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.035
  floor.receiveShadow = true
  scene.add(floor)

  let model: THREE.Group | undefined
  const nodes = new Map<string, THREE.Object3D>()
  const bases = new Map<string, number>()
  let disposed = false
  let contextLost = false
  let frame = 0
  let frames = 0
  let loadMs = 0
  let renderMs = 0
  let modelDrawn = false
  let lastTime = 0
  let dragging: Control | null = null
  let pointer: { id: number; x: number; y: number; originX: number; originY: number } | null = null
  const raycaster = new THREE.Raycaster()
  const point = new THREE.Vector2()
  const labels: Record<string, string> = {
    power: '播放 / 暂停',
    volume: '音量 · 左右拖动',
    channel: '调谐 · 左右拖动',
    bass: '低音 · 左右拖动',
    antenna: '天线 · 上下拖动',
  }

  function invalidate(shadow = false) {
    if (shadow) renderer.shadowMap.needsUpdate = true
    if (disposed || document.hidden || contextLost) return
    if (!frame) frame = requestAnimationFrame(draw)
  }

  function easePosition(name: string, axis: 'x' | 'z', target: number, alpha: number): boolean {
    const node = nodes.get(name)
    if (!node) return false
    const delta = target - node.position[axis]
    if (Math.abs(delta) < 0.0001) {
      node.position[axis] = target
      return false
    }
    node.position[axis] += delta * alpha
    return true
  }

  function draw(time: number) {
    frame = 0
    if (disposed || document.hidden || contextLost) return
    const alpha = 1 - Math.exp(-Math.min(0.05, (time - lastTime) / 1000 || 0.016) * 22)
    lastTime = time
    const state = getState()
    let moving = false
    moving =
      easePosition('On_Off', 'z', (bases.get('On_Off') ?? 0.472) - (state.on ? 0.052 : 0), alpha) ||
      moving
    for (let i = 1; i <= 7; i++) {
      const name = `Tuner_Button_${i}`
      moving =
        easePosition(
          name,
          'z',
          (bases.get(name) ?? 0.435) -
            (Math.abs(state.channel - presets[i - 1]) < 0.025 ? 0.065 : 0),
          alpha,
        ) || moving
    }
    moving =
      easePosition(
        'Tuner_Marker',
        'x',
        THREE.MathUtils.mapLinear(state.channel, 87, 108, 0.39, 1),
        alpha,
      ) || moving
    for (const [number, amount] of [
      [1, state.volume],
      [2, (state.channel - 87) / 21],
      [3, state.bass],
    ]) {
      const node = nodes.get(`Knob_${number}`)
      if (node) node.rotation.y = -amount * Math.PI * 1.65
    }
    const antenna = nodes.get('Antenna')
    if (antenna) antenna.rotation.z = state.antenna
    if (moving) renderer.shadowMap.needsUpdate = true
    const begin = performance.now()
    renderer.render(scene, camera)
    if (model) modelDrawn = true
    renderMs = performance.now() - begin
    frames++
    if (moving) invalidate()
  }

  function fitDistance() {
    return Math.max(6.8, 4.6 / Math.max(0.5, camera.aspect))
  }

  function setView(view: View) {
    endDrag()
    const distance = fitDistance()
    const angles: Record<View, [number, number]> = {
      front: [0, Math.PI / 2],
      back: [Math.PI, Math.PI / 2],
      left: [-Math.PI / 2, Math.PI / 2],
      right: [Math.PI / 2, Math.PI / 2],
      top: [0, 0.035],
      home: [0.48, 1.3],
    }
    const [azimuth, polar] = angles[view]
    camera.position
      .copy(controls.target)
      .add(new THREE.Vector3().setFromSphericalCoords(distance, polar, azimuth))
    controls.update()
    invalidate()
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect()
    if (!width || !height) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(width, height)
    invalidate()
  }

  function classify(object: THREE.Object3D): Control | null {
    for (let current: THREE.Object3D | null = object; current; current = current.parent) {
      if (current.name === 'On_Off') return 'power'
      if (current.name === 'Antenna') return 'antenna'
      const knob = /^Knob_([123])(?:_Front|_Indicator)?$/.exec(current.name)
      if (knob) return (['volume', 'channel', 'bass'] as const)[Number(knob[1]) - 1]
      const preset = /^Tuner_Button_([1-7])$/.exec(current.name)
      if (preset) return `preset:${Number(preset[1]) - 1}`
    }
    return null
  }

  function pick(event: PointerEvent): Control | null {
    if (!model) return null
    const rect = canvas.getBoundingClientRect()
    point.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    camera.updateMatrixWorld()
    model.updateMatrixWorld(true)
    raycaster.setFromCamera(point, camera)
    const hit = raycaster.intersectObject(model, true)[0]
    return hit ? classify(hit.object) : null
  }

  function down(event: PointerEvent) {
    if (event.button !== 0 || pointer) return
    const control = pick(event)
    if (!control) return
    event.stopImmediatePropagation()
    dragging = control
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
    }
    controls.enabled = false
    canvas.setPointerCapture(event.pointerId)
    canvas.style.cursor =
      control === 'power' || control.startsWith('preset:') ? 'pointer' : 'grabbing'
  }

  function move(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId || !dragging) {
      const control = pick(event)
      canvas.style.cursor = control
        ? control === 'power' || control.startsWith('preset:')
          ? 'pointer'
          : 'grab'
        : 'grab'
      hover(
        control?.startsWith('preset:')
          ? `预设 ${presets[Number(control.split(':')[1])].toFixed(1)} MHz`
          : (labels[control ?? ''] ?? ''),
      )
      return
    }
    event.stopImmediatePropagation()
    const dx = event.clientX - pointer.x
    const dy = event.clientY - pointer.y
    pointer.x = event.clientX
    pointer.y = event.clientY
    const state = getState()
    const clamp = THREE.MathUtils.clamp
    if (dragging === 'volume') change({ volume: clamp(state.volume + dx * 0.005, 0, 1) })
    if (dragging === 'bass') change({ bass: clamp(state.bass + dx * 0.005, 0, 1) })
    if (dragging === 'channel') change({ channel: clamp(state.channel + dx * 0.04, 87, 108) })
    if (dragging === 'antenna')
      change({ antenna: clamp(state.antenna - dy * 0.005, -Math.PI / 2.5, -Math.PI / 4) })
  }

  function endDrag() {
    const id = pointer?.id
    pointer = null
    dragging = null
    controls.enabled = true
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id)
    canvas.style.cursor = 'grab'
  }

  function up(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return
    event.stopImmediatePropagation()
    const click = Math.hypot(event.clientX - pointer.originX, event.clientY - pointer.originY) < 6
    const active = dragging
    endDrag()
    if (click && active === 'power') change({ on: !getState().on })
    if (click && active?.startsWith('preset:'))
      change({ channel: presets[Number(active.split(':')[1])] })
  }

  // Capture runs before OrbitControls so component manipulation never starts an orbit.
  canvas.addEventListener('pointerdown', down, true)
  canvas.addEventListener('pointermove', move, true)
  canvas.addEventListener('pointerup', up, true)
  canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener('lostpointercapture', endDrag)
  window.addEventListener('blur', endDrag)
  function escape(event: KeyboardEvent) {
    if (event.key === 'Escape') endDrag()
  }
  window.addEventListener('keydown', escape)
  function visibility() {
    if (document.hidden) {
      endDrag()
      cancelAnimationFrame(frame)
      frame = 0
    } else invalidate()
  }
  function lost(event: Event) {
    event.preventDefault()
    contextLost = true
    endDrag()
    cancelAnimationFrame(frame)
    frame = 0
    failed('三维视图暂时不可用，请关闭后重新打开 demo。')
  }
  canvas.addEventListener('webglcontextlost', lost)
  document.addEventListener('visibilitychange', visibility)
  controls.addEventListener('change', () => invalidate())
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  setView('home')

  const manager = new THREE.LoadingManager()
  let assetFailed = false
  manager.onError = () => {
    assetFailed = true
  }
  const ready = new GLTFLoader(manager)
    .loadAsync(new URL('./assets/radio-1.glb', import.meta.url).href)
    .then((gltf) => {
      model = gltf.scene
      if (assetFailed) {
        disposeModel(model)
        model = undefined
        throw new Error('模型或贴图资源无法加载')
      }
      if (disposed) {
        disposeModel(model)
        return
      }
      model.traverse((object) => {
        nodes.set(object.name, object)
        if (object instanceof THREE.Mesh) {
          object.castShadow = !/Text|Marking|Indicator/.test(object.name)
          object.receiveShadow = true
        }
        if (object.name === 'On_Off' || object.name.startsWith('Tuner_Button_'))
          bases.set(object.name, object.position.z)
      })
      scene.add(model)
      loadMs = performance.now() - started
      invalidate(true)
    })

  function snapshot(): SceneSnapshot {
    return {
      ready: !!model && !disposed,
      frames,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      polar: controls.getPolarAngle(),
      azimuth: controls.getAzimuthalAngle(),
      dragging,
      orbitEnabled: controls.enabled,
      loadMs,
      renderMs,
      contextLost,
      pendingFrame: frame !== 0,
      modelDrawn,
      distance: camera.position.distanceTo(controls.target),
      webglRenderer,
    }
  }

  function project(name: string) {
    const node = nodes.get(name)
    if (!node) throw new Error(`Missing radio part: ${name}`)
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld()
    const position = (
      name === 'Antenna'
        ? new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3())
        : node.getWorldPosition(new THREE.Vector3())
    ).project(camera)
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.round(rect.left + ((position.x + 1) * rect.width) / 2),
      y: Math.round(rect.top + ((1 - position.y) * rect.height) / 2),
    }
  }

  function disposeModel(group: THREE.Group) {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    const textures = new Set<THREE.Texture>()
    group.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      geometries.add(node.geometry)
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material)
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value)
      }
    })
    geometries.forEach((geometry) => geometry.dispose())
    textures.forEach((texture) => {
      texture.dispose()
      if (texture.image instanceof ImageBitmap) texture.image.close()
    })
    materials.forEach((material) => material.dispose())
  }

  function dispose() {
    if (disposed) return
    disposed = true
    endDrag()
    cancelAnimationFrame(frame)
    frame = 0
    observer.disconnect()
    controls.dispose()
    window.removeEventListener('blur', endDrag)
    window.removeEventListener('keydown', escape)
    document.removeEventListener('visibilitychange', visibility)
    canvas.removeEventListener('pointerdown', down, true)
    canvas.removeEventListener('pointermove', move, true)
    canvas.removeEventListener('pointerup', up, true)
    canvas.removeEventListener('pointercancel', endDrag)
    canvas.removeEventListener('lostpointercapture', endDrag)
    canvas.removeEventListener('webglcontextlost', lost)
    if (model) disposeModel(model)
    floor.geometry.dispose()
    floor.material.dispose()
    sun.shadow.dispose()
    environment.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  }
  return { ready, snapshot, setView, invalidate, project, dispose }
}
