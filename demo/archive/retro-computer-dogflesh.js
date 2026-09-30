import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import modelBase64 from './assets/retro-computer-dogflesh/retro_computer.glb'
import diffuseImage from './assets/retro-computer-dogflesh/diffuse.png'

const stage = document.getElementById('stage')
const loading = document.getElementById('loading')
const status = document.getElementById('status')
const hint = document.getElementById('hint')
const buttons = Object.fromEntries(['angle', 'front', 'screen', 'back', 'power'].map(id => [id, document.getElementById(id)]))
const tracks = ['NIGHT DRIVE', 'AFTERIMAGE', 'ANALOG DAYS']
const screenCanvas = document.createElement('canvas')
screenCanvas.width = 768
screenCanvas.height = 500
const ctx = screenCanvas.getContext('2d')
const screenTexture = new THREE.CanvasTexture(screenCanvas)
screenTexture.colorSpace = THREE.SRGBColorSpace
screenTexture.anisotropy = 8
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.65
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.domElement.tabIndex = 0
renderer.domElement.setAttribute('aria-label', '九十年代电脑三维模型；拖动可旋转')
stage.prepend(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 25)
const ambient = new THREE.HemisphereLight(0xe8eddf, 0x384936, 2.5)
scene.add(ambient)
const keyLight = new THREE.DirectionalLight(0xfff6df, 3.4)
keyLight.position.set(-1.5, 3.5, 3)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(1024, 1024)
keyLight.shadow.camera.left = -2
keyLight.shadow.camera.right = 2
keyLight.shadow.camera.top = 2
keyLight.shadow.camera.bottom = -2
keyLight.shadow.bias = -0.0001
scene.add(keyLight)
const rimLight = new THREE.DirectionalLight(0xc5d8cc, 2.2)
rimLight.position.set(2.2, 2, -2)
scene.add(rimLight)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x373833, roughness: 1 }))
floor.rotation.x = -Math.PI / 2
floor.position.y = -0.008
floor.receiveShadow = true
scene.add(floor)
const floorMark = new THREE.Mesh(new THREE.CircleGeometry(1.45, 64), new THREE.MeshBasicMaterial({ color: 0x45473f, transparent: true, opacity: 0.35, depthWrite: false }))
floorMark.rotation.x = -Math.PI / 2
floorMark.position.y = -0.007
scene.add(floorMark)

const view = { yaw: 0.37, pitch: 0.25, radius: 2.65, lookX: 0, lookY: 0.31, lookZ: 0.53 }
const target = new THREE.Vector3(0, 0.31, 0.53)
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let model, screenPlane, keyboardHit, powerHit, selected = 0, playing = false, on = true, pressed = null

function setStatus(message) { status.innerHTML = `<strong>${message}</strong> · ${on ? '屏幕可操作' : '电脑已断电'}` }
function color(color) { ctx.fillStyle = color }
function text(value, x, y, size = 23, bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px Tahoma, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText(value, x, y)
}
function drawScreen() {
  color(on ? '#137279' : '#111813'); ctx.fillRect(0, 0, 768, 500)
  if (!on) { screenTexture.needsUpdate = true; return }
  color('#c9c7b9'); ctx.fillRect(18, 15, 732, 465)
  color('#213b7e'); ctx.fillRect(20, 17, 728, 48)
  color('#f4f5ed'); text('AURALIS PLAYER', 40, 41, 24, true)
  color('#c4c8d6'); ctx.fillRect(691, 29, 35, 26)
  color('#263260'); text('×', 699, 42, 21, true)
  color('#363e36'); text('DISC  01', 46, 98, 24, true)
  color('#5e6259'); text('LOCAL COLLECTION  /  1995', 468, 98, 18)
  tracks.forEach((title, i) => {
    const y = 123 + i * 66
    color(i === selected ? '#20427c' : i % 2 ? '#e1e2d7' : '#d7d8cc'); ctx.fillRect(37, y, 693, 59)
    color(i === selected ? '#f4f7ef' : '#2b342c')
    text(String(i + 1).padStart(2, '0'), 53, y + 30, 22, true)
    text(title, 116, y + 30, 24, true)
    text(['03:41', '04:08', '03:28'][i], 620, y + 30, 21)
  })
  color('#a4a69d'); ctx.fillRect(37, 338, 693, 2)
  color('#27352b'); text(playing ? `PLAYING  /  ${String(selected + 1).padStart(2, '0')}` : `READY  /  ${String(selected + 1).padStart(2, '0')}`, 43, 371, 24, true)
  color('#f3f3e8'); ctx.fillRect(557, 358, 170, 62)
  color('#899088'); ctx.fillRect(557, 358, 170, 3)
  color('#253929'); text(playing ? 'PAUSE' : 'PLAY', 605, 389, 26, true)
  color('#92988a'); text('COMPUTER AUDIO  /  DEMO', 45, 449, 18)
  screenTexture.needsUpdate = true
}
function setPower(next) {
  on = next; if (!on) playing = false
  buttons.power.textContent = on ? '关闭电源' : '开启电源'
  buttons.power.setAttribute('aria-pressed', String(on))
  drawScreen(); setStatus(on ? '电源已开启' : '电源已关闭')
}
function choose(index) { if (!on) return; selected = index; drawScreen(); setStatus(`已选中 ${tracks[index]}`) }
function togglePlay() { if (!on) return; playing = !playing; drawScreen(); setStatus(playing ? `正在模拟播放 ${tracks[selected]}` : '模拟播放已暂停') }
function setView(name) {
  const views = {
    angle: [0.37, 0.25, 2.65, 0, 0.31, 0.53],
    front: [0, 0.09, 2.55, 0, 0.31, 0.53],
    screen: [0, 0.02, 1.2, -0.09, 0.42, 0.94],
    back: [Math.PI, 0.22, 2.9, 0, 0.31, 0.53]
  }
  ;[view.yaw, view.pitch, view.radius, view.lookX, view.lookY, view.lookZ] = views[name]
  for (const id of ['angle', 'front', 'screen', 'back']) buttons[id].setAttribute('aria-pressed', String(id === name))
  render()
}
for (const id of ['angle', 'front', 'screen', 'back']) buttons[id].addEventListener('click', () => setView(id))
buttons.power.addEventListener('click', () => setPower(!on))

function size() {
  const w = stage.clientWidth, h = stage.clientHeight
  if (!w || !h) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  render()
}
function render() {
  const fit = Math.max(1, 1.2 / camera.aspect)
  const radius = view.radius * fit
  target.set(view.lookX, view.lookY, view.lookZ)
  camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * radius, Math.sin(view.pitch) * radius, Math.cos(view.yaw) * Math.cos(view.pitch) * radius).add(target)
  camera.lookAt(target)
  renderer.render(scene, camera)
}
new ResizeObserver(size).observe(stage)

function pick(event) {
  const box = renderer.domElement.getBoundingClientRect()
  pointer.x = (event.clientX - box.left) / box.width * 2 - 1
  pointer.y = -(event.clientY - box.top) / box.height * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const targets = [screenPlane, powerHit, keyboardHit].filter(Boolean)
  const hit = raycaster.intersectObjects(targets, true)[0]
  if (!hit) return
  const object = hit.object
  if (object === powerHit) { setPower(!on); return }
  if (object === screenPlane) {
    if (!on) return
    const x = hit.uv.x * screenCanvas.width, y = (1 - hit.uv.y) * screenCanvas.height
    if (x > 37 && x < 730 && y >= 123 && y < 321) choose(Math.floor((y - 123) / 66))
    else if (x > 557 && x < 727 && y > 358 && y < 420) togglePlay()
    else hint.textContent = '点击曲目行选择，点击 PLAY 模拟播放'
    return
  }
  if (object === keyboardHit) { choose((selected + 1) % tracks.length); return }
}
renderer.domElement.addEventListener('pointerdown', event => {
  pressed = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch, moved: false }
  stage.classList.add('dragging')
  renderer.domElement.setPointerCapture(event.pointerId)
})
renderer.domElement.addEventListener('pointermove', event => {
  if (!pressed) return
  const dx = event.clientX - pressed.x, dy = event.clientY - pressed.y
  if (Math.abs(dx) + Math.abs(dy) > 5) pressed.moved = true
  if (!pressed.moved) return
  view.yaw = pressed.yaw - dx * 0.007
  view.pitch = THREE.MathUtils.clamp(pressed.pitch + dy * 0.005, -0.22, 0.8)
  for (const id of ['angle', 'front', 'screen', 'back']) buttons[id].setAttribute('aria-pressed', 'false')
  render()
})
renderer.domElement.addEventListener('pointerup', event => {
  if (pressed && !pressed.moved) pick(event)
  pressed = null; stage.classList.remove('dragging')
})
renderer.domElement.addEventListener('pointercancel', () => { pressed = null; stage.classList.remove('dragging') })
renderer.domElement.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); choose((selected + (event.key === 'ArrowRight' ? 1 : 2)) % 3) }
  if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); togglePlay() }
})

function decodeBase64(value) {
  const binary = atob(value), bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
new GLTFLoader().parse(decodeBase64(modelBase64), '', gltf => {
  model = gltf.scene
  model.scale.setScalar(2.4)
  model.position.y = 0.32
  const texture = new THREE.TextureLoader().load(diffuseImage, () => {
    loading.hidden = true
    drawScreen(); size(); setStatus('模型与贴图已装入')
  }, undefined, error => {
    loading.textContent = '贴图解码失败，请重新打开 Demo'
    console.error(error)
  })
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  texture.anisotropy = 8
  model.traverse(object => {
    if (object.isMesh) {
      object.material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, side: THREE.DoubleSide })
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, side: THREE.DoubleSide })
  screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.465, 0.34), screenMaterial)
  screenPlane.name = 'interactiveScreen'
  screenPlane.position.set(-0.09, 0.416, 0.961)
  scene.add(screenPlane)
  powerHit = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.05), new THREE.MeshBasicMaterial({ visible: false }))
  powerHit.name = 'powerButtonHitArea'
  powerHit.position.set(0.18, 0.135, 0.77)
  scene.add(powerHit)
  keyboardHit = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.06, 0.43), new THREE.MeshBasicMaterial({ visible: false }))
  keyboardHit.name = 'keyboardHitArea'
  keyboardHit.position.set(-0.08, 0.055, 1.14)
  scene.add(keyboardHit)
  scene.add(model)
  drawScreen(); size()
}, error => {
  loading.textContent = '模型装入失败，请重新打开 Demo'
  console.error(error)
})
