import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createFoil, createWrinkles } from './material'
import { createAlbumCard, type CardFinish } from './card'
import type { CardSample } from './cardArtwork'
import { createPixelDiscard } from './pixelDiscard'

export interface PouchSnapshot {
  progress: number
  dragging: boolean
  opened: boolean
  pouchGone: boolean
  extracted: boolean
  frames: number
  pending: boolean
  disposed: boolean
  calls: number
  triangles: number
  cardFinish: CardFinish
  cardSample: CardSample
  cardBack: boolean
  choice: 'play' | 'discard' | null
  discardProgress: number
  cardTilt: { x: number; y: number }
  back: boolean
  contextLost: boolean
}

const HALF = 1.6,
  BOTTOM = -2.4,
  SEAM = 1.95,
  TOP = 2.48
const columns = 80
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))
const jagged = (x: number) => 0.022 * Math.sin(x * 102) + 0.009 * Math.sin(x * 217)
// Forty die-cut teeth, with a vertex at every tip and valley on both films.
const serration = (x: number) => {
  const phase = ((x + HALF) / (2 * HALF)) * 40
  return 0.055 * (1 - Math.abs(2 * (phase - Math.floor(phase)) - 1))
}

export function createPouchScene(host: HTMLElement, onChange: (state: PouchSnapshot) => void) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.85
  renderer.setClearColor(0x000000, 0)
  host.appendChild(renderer.domElement)
  const canvas = renderer.domElement
  canvas.setAttribute('aria-label', '可拖动撕开的镀铝专辑包装袋')
  canvas.style.touchAction = 'none'
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100)
  camera.position.set(0, 0.1, 12)
  camera.lookAt(0, 0.1, 0)
  const environmentScene = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(environmentScene, 0.04)
  environmentScene.dispose()
  pmrem.dispose()
  scene.environment = environment.texture
  scene.environmentIntensity = 0.75
  const keyLight = new THREE.DirectionalLight('#fff7ed', 1.0)
  keyLight.position.set(-3, 5, 7)
  scene.add(keyLight)
  const fill = new THREE.DirectionalLight('#d8d0f2', 0.6)
  fill.position.set(4, -1, 5)
  scene.add(fill)
  scene.add(new THREE.HemisphereLight('#ffffff', '#8b8394', 0.35))
  const group = new THREE.Group()
  group.rotation.set(-0.035, -0.1, -0.025)
  scene.add(group)
  const pouch = new THREE.Group()
  group.add(pouch)

  const wrinkles = createWrinkles()
  const frontFoil = createFoil(wrinkles),
    backFoil = createFoil(wrinkles)
  const innerMaterial = new THREE.MeshStandardMaterial({
    color: '#84868e',
    metalness: 0.95,
    roughness: 0.3,
    side: THREE.DoubleSide,
  })
  const sealMaterial = new THREE.MeshStandardMaterial({
    color: '#b4b8bf',
    metalness: 0.92,
    roughness: 0.38,
    side: THREE.DoubleSide,
  })
  const geometryParts: {
    geometry: THREE.BufferGeometry
    kind: 'body' | 'strip' | 'side'
    side: number
    backSeal: boolean
  }[] = []

  function grid(kind: 'body' | 'strip' | 'side', side: number, rows: number, backSeal = false) {
    const nx = backSeal ? 8 : kind === 'side' ? 2 : columns
    const count = (nx + 1) * (rows + 1)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage),
    )
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2))
    const indices: number[] = []
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i,
          b = a + 1,
          c = a + nx + 1,
          d = c + 1
        if (side < 0 && kind !== 'side') indices.push(a, c, b, b, c, d)
        else indices.push(a, b, c, b, d, c)
      }
    geometry.setIndex(indices)
    const mesh = new THREE.Mesh(
      geometry,
      kind === 'side' ? sealMaterial : side > 0 ? frontFoil.material : backFoil.material,
    )
    mesh.frustumCulled = false
    pouch.add(mesh)
    geometryParts.push({ geometry, kind, side, backSeal })
  }
  grid('body', 1, 70)
  grid('body', -1, 70)
  grid('strip', 1, 12)
  grid('strip', -1, 12)
  grid('side', 1, 70)
  grid('side', -1, 70)
  // Raised, folded longitudinal lap seal; its top section tears off with the strip.
  grid('body', -1, 70, true)
  grid('strip', -1, 12, true)

  // Dark cavity behind the mouth, and a card physically between both films.
  const cavity = new THREE.Mesh(
    new THREE.PlaneGeometry(2.94, 0.5),
    new THREE.MeshBasicMaterial({ color: '#29282f', side: THREE.DoubleSide }),
  )
  cavity.position.set(0, 1.65, -0.035)
  pouch.add(cavity)
  cavity.visible = false
  const albumCard = createAlbumCard()
  const card = albumCard.object
  const pixelDiscard = createPixelDiscard()
  const cardFaces = [...card.children]
  card.add(pixelDiscard.object)
  card.position.set(0, -0.1, 0)
  group.add(card)
  // Interior film is visible when the front lip bends outward.
  const lipInner = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 0.34), innerMaterial)
  lipInner.position.set(0, 1.6, 0.02)
  pouch.add(lipInner)
  lipInner.visible = false

  let progress = 0,
    cardFinish: CardFinish = 'bands',
    cardSample: CardSample = 'blue',
    extracted = false,
    extractAmount = 0,
    targetExtract = 0
  let stripFall = 0
  let pouchFall = 0
  let cardTiltX = 0,
    cardTiltY = 0
  let cardBack = false
  let choice: 'play' | 'discard' | null = null
  let discardTime = 0
  let frame = 0,
    frames = 0,
    disposed = false,
    contextLost = false
  let grip = 0,
    gripTarget = 0,
    tiltX = -0.035,
    tiltY = -0.1,
    viewBack = false
  const deformationPoint = new THREE.Vector3()
  let deformFilm = false
  let drag: {
    id: number
    mode: 'tear' | 'film'
    start: THREE.Vector3
    progress: number
    at: THREE.Vector3
  } | null = null
  let dirty = true,
    lastTime = 0
  const raycaster = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.25)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  function snapshot(): PouchSnapshot {
    return {
      progress,
      dragging: !!drag,
      opened: progress === 1,
      pouchGone: pouchFall === 1,
      extracted,
      frames,
      pending: !!frame,
      disposed,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      cardFinish,
      cardSample,
      cardBack,
      choice,
      discardProgress: discardTime / 1.6,
      cardTilt: { x: card.rotation.x, y: card.rotation.y },
      back: viewBack,
      contextLost,
    }
  }
  function notify() {
    onChange(snapshot())
  }
  function screenPosition(local: THREE.Vector3) {
    group.updateMatrixWorld(true)
    const v = group.localToWorld(local.clone()).project(camera)
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.left + ((v.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - v.y) * rect.height) / 2,
    }
  }
  function tip() {
    return new THREE.Vector3(HALF - 2 * HALF * progress, SEAM + 0.02, 0.25)
  }
  function project(name: 'tip' | 'card' | 'card-center' | 'body' | 'end') {
    if (name === 'card') {
      group.updateMatrixWorld(true)
      return screenPosition(group.worldToLocal(card.localToWorld(new THREE.Vector3(0, 1.82, 0.02))))
    }
    return screenPosition(
      name === 'tip'
        ? tip()
        : name === 'end'
          ? new THREE.Vector3(-HALF, SEAM, 0.25)
          : name === 'card-center'
            ? card.position.clone()
            : new THREE.Vector3(0, 0, 0.25),
    )
  }
  function pointerPoint(event: PointerEvent) {
    const r = canvas.getBoundingClientRect()
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        1 - ((event.clientY - r.top) / r.height) * 2,
      ),
      camera,
    )
    const world = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(plane, world)) return new THREE.Vector3()
    group.updateMatrixWorld(true)
    return group.worldToLocal(world)
  }
  function filmZ(x: number, y: number, side: number) {
    const u = clamp((x + HALF) / (2 * HALF), 0, 1),
      v = clamp((y - BOTTOM) / (TOP - BOTTOM), 0, 1)
    const center =
      Math.pow(Math.sin(u * Math.PI), 0.65) *
      Math.pow(Math.sin(v * Math.PI), 0.55) *
      clamp((SEAM - y) / 0.3, 0, 1)
    const seal = Math.min(u, 1 - u, v, 1 - v) < 0.032
    const corrugation = seal ? Math.sin((Math.abs(x) > 1.49 ? y : x) * 105) * 0.004 : 0
    const ridge = (line: number, width: number) => Math.exp(-Math.pow(line / width, 2))
    const edge = Math.pow(Math.abs(x) / HALF, 7)
    const creases =
      Math.sin(y * 19 + Math.sin(x * 5) * 2.5) * edge * 0.024 +
      ridge(y - 0.8 + x * 0.24, 0.045) * 0.017 +
      ridge(y + 0.95 - x * 0.32, 0.035) * 0.016 +
      ridge(x - 0.7 + y * 0.05, 0.06) * 0.018 +
      Math.sin(x * 9 + Math.sin(y * 1.6)) * 0.003
    let z = side * (0.035 + center * 0.12 + creases + corrugation)
    if (side > 0 && progress > 0) {
      const torn = clamp((x - (HALF - 2 * HALF * progress)) * 9, 0, 1)
      z += torn * Math.pow(clamp((y - 1.3) / 0.65, 0, 1), 2) * 0.24
    }
    if (deformFilm && grip > 0) {
      const distance = Math.hypot(x - deformationPoint.x, y - deformationPoint.y)
      z += side * grip * 0.14 * Math.exp(-distance * distance * 4)
    }
    return z
  }
  function updateGeometry() {
    const cut = HALF - 2 * HALF * progress
    for (const part of geometryParts) {
      const positions = part.geometry.getAttribute('position') as THREE.BufferAttribute
      const uvs = part.geometry.getAttribute('uv') as THREE.BufferAttribute
      const nx = part.backSeal ? 8 : part.kind === 'side' ? 2 : columns,
        rows = positions.count / (nx + 1) - 1
      for (let j = 0; j <= rows; j++)
        for (let i = 0; i <= nx; i++) {
          const u = i / nx,
            v = j / rows,
            index = j * (nx + 1) + i
          let x = part.backSeal ? -0.16 + u * 0.32 : -HALF + u * 2 * HALF,
            y = BOTTOM + v * (SEAM - BOTTOM),
            z = 0
          const foilU = (x + HALF) / (2 * HALF)
          if (part.kind === 'side') {
            x = part.side * HALF
            z = (u - 0.5) * 0.075
            y = BOTTOM + v * (SEAM - BOTTOM)
          } else {
            const torn = clamp((x - cut) * 9, 0, 1)
            const edge = progress > 0 ? jagged(x) * torn : 0
            const bottomEdge = BOTTOM + serration(x)
            const topEdge = TOP - serration(x)
            if (part.kind === 'body') {
              y = bottomEdge + v * (SEAM + edge - bottomEdge)
              if (part.side > 0) y -= Math.pow(v, 18) * torn * 0.11
              z = filmZ(x, y, part.side)
            } else {
              y = SEAM + edge + v * (topEdge - SEAM - edge)
              z = filmZ(x, y, part.side)
            }
            if (part.backSeal) {
              // Two overlapping layers with a raised fold and a ribbed heat seal.
              z -= 0.009 + Math.sin(u * Math.PI) * 0.065 + u * 0.018
              z -= Math.sin(y * 105) * 0.003 * Math.sin(u * Math.PI)
            }
            if (part.kind === 'strip') {
              if (progress > 0) {
                const distance = Math.max(0, x - cut)
                const a = clamp(distance / (2 * HALF), 0, 1)
                // Seal strip peels towards the viewer, then curls up. The front
                // and back remain laminated together at the heat-sealed edge.
                const curl = torn * (0.6 + grip * 0.8 + a * 2.5)
                const offsetY = y - SEAM
                y = SEAM + edge + Math.cos(curl) * offsetY + a * 0.65
                z += Math.sin(curl) * offsetY + torn * (0.1 + a * 0.65)
                x -= Math.sin(a * Math.PI) * 0.2
                if (progress === 1) {
                  x += stripFall * 0.45
                  y -= stripFall * 5.35
                  z += stripFall * 0.05
                }
              }
            }
          }
          if (part.kind !== 'side' && progress === 0 && x > HALF - 0.07) {
            x -= Math.max(0, 1 - Math.abs(y - SEAM) / 0.09) * 0.065
          }
          positions.setXYZ(index, x, y, z)
          uvs.setXY(
            index,
            part.side < 0 ? 1 - foilU : foilU,
            part.kind === 'strip'
              ? (SEAM - BOTTOM + v * (TOP - SEAM)) / (TOP - BOTTOM)
              : (y - BOTTOM) / (TOP - BOTTOM),
          )
        }
      positions.needsUpdate = true
      uvs.needsUpdate = true
      part.geometry.computeVertexNormals()
    }
    cavity.visible = progress > 0.3
    // A narrow inner lip, revealed only after the seal is fully removed.
    lipInner.visible = progress === 1
    lipInner.rotation.x = 0.7
    card.position.y = -0.1 + (progress === 1 ? 0.3 : 0) + extractAmount * 0.3
    card.position.x = -extractAmount * 0.45
    card.position.z = extractAmount * 1.6
    card.rotation.z = -extractAmount * 0.025
    card.scale.setScalar(1 + extractAmount * 0.2)
    pouch.position.set(pouchFall * 0.25, -pouchFall * pouchFall * 16, 0)
    pouch.rotation.z = pouchFall * 0.18
    pouch.visible = pouchFall < 1
    pouch.scale.setScalar(1 - extractAmount * 0.28)
    dirty = false
  }
  function invalidate() {
    if (disposed || document.hidden || contextLost || frame) return
    frame = requestAnimationFrame(render)
  }
  function render(time: number) {
    frame = 0
    if (disposed || document.hidden || contextLost) return
    const dt = Math.min((time - lastTime) / 1000 || 0.016, 0.05)
    lastTime = time
    if (choice === 'discard' && discardTime < 1.6) {
      discardTime = reduced.matches ? 1.6 : Math.min(1.6, discardTime + dt)
      pixelDiscard.update(discardTime)
    }
    const ease = reduced.matches ? 1 : 1 - Math.exp(-dt * 13)
    const nextGrip = grip + (gripTarget - grip) * ease
    const nextExtract = extractAmount + (targetExtract - extractAmount) * ease
    const fallTarget = progress === 1 && !drag ? 1 : 0
    const nextFall = stripFall + (fallTarget - stripFall) * ease
    const nextPouchFall =
      progress === 1 && (!drag || pouchFall > 0)
        ? reduced.matches
          ? 1
          : Math.min(1, pouchFall + dt / 0.75)
        : pouchFall
    if (
      Math.abs(nextGrip - grip) > 0.0001 ||
      Math.abs(nextExtract - extractAmount) > 0.0001 ||
      Math.abs(nextFall - stripFall) > 0.0001 ||
      nextPouchFall !== pouchFall
    )
      dirty = true
    grip = Math.abs(nextGrip - gripTarget) < 0.001 ? gripTarget : nextGrip
    extractAmount = Math.abs(nextExtract - targetExtract) < 0.001 ? targetExtract : nextExtract
    stripFall = Math.abs(nextFall - fallTarget) < 0.001 ? fallTarget : nextFall
    pouchFall = nextPouchFall
    if (dirty) updateGeometry()
    const targetY = tiltY + (viewBack ? Math.PI : 0)
    group.rotation.x += (tiltX - group.rotation.x) * ease
    group.rotation.y += (targetY - group.rotation.y) * ease
    const cardTargetX = extracted ? cardTiltX : 0,
      cardTargetY = extracted ? cardTiltY + (cardBack ? Math.PI : 0) : 0
    card.rotation.x += (cardTargetX - card.rotation.x) * ease
    card.rotation.y += (cardTargetY - card.rotation.y) * ease
    renderer.render(scene, camera)
    frames++
    const moving =
      Math.abs(group.rotation.x - tiltX) > 0.0003 ||
      Math.abs(group.rotation.y - targetY) > 0.0003 ||
      Math.abs(card.rotation.x - cardTargetX) > 0.0003 ||
      Math.abs(card.rotation.y - cardTargetY) > 0.0003 ||
      grip !== gripTarget ||
      extractAmount !== targetExtract ||
      stripFall !== fallTarget ||
      (progress === 1 && !drag && pouchFall < 1) ||
      (choice === 'discard' && discardTime < 1.6)
    if (moving) invalidate()
    notify()
  }
  function release(event?: Event) {
    if (event instanceof PointerEvent && drag && event.pointerId !== drag.id) return
    const current = drag
    drag = null
    gripTarget = 0
    if (current && canvas.hasPointerCapture(current.id)) canvas.releasePointerCapture(current.id)
    canvas.style.cursor = 'grab'
    dirty = true
    invalidate()
    notify()
  }
  function pointerDown(event: PointerEvent) {
    if (choice === 'discard') return
    if (event.button !== 0 || drag || viewBack) return
    const at = pointerPoint(event),
      handle = project('tip')
    const cardHit = raycaster.intersectObject(card, true)[0]
    const pouchHit = pouch.visible ? raycaster.intersectObject(pouch, true)[0] : undefined
    const hitTip = Math.hypot(event.clientX - handle.x, event.clientY - handle.y) < 32
    if (progress < 1 && hitTip) {
      drag = { id: event.pointerId, mode: 'tear', start: at.clone(), at, progress }
    } else if (progress === 1 && cardHit && (!pouchHit || cardHit.distance < pouchHit.distance)) {
      extract()
      return
    } else if (progress < 1 && Math.abs(at.x) < 1.48 && at.y > BOTTOM + 0.1 && at.y < 1.7) {
      drag = { id: event.pointerId, mode: 'film', start: at.clone(), at, progress }
    } else return
    canvas.setPointerCapture(event.pointerId)
    deformFilm = drag.mode === 'film'
    deformationPoint.copy(at)
    gripTarget = 1
    dirty = true
    canvas.style.cursor = drag.mode === 'tear' ? 'ew-resize' : 'grabbing'
    invalidate()
    notify()
  }
  function pointerMove(event: PointerEvent) {
    if (choice === 'discard') return
    const at = pointerPoint(event)
    if (drag) {
      if (drag.id !== event.pointerId) return
      if (drag.mode === 'tear') {
        progress = Math.max(
          progress,
          clamp(drag.progress + (drag.start.x - at.x) / (2 * HALF), 0, 1),
        )
        if (progress > 0.985) progress = 1
        gripTarget = clamp(0.5 + Math.abs(drag.start.y - at.y) * 1.2, 0.5, 1.6)
      } else {
        drag.at = at
        deformationPoint.copy(at)
        gripTarget = clamp(0.7 + Math.abs(at.x - drag.start.x), 0.7, 1.8)
      }
      dirty = true
      invalidate()
      notify()
      return
    }
    const rect = canvas.getBoundingClientRect()
    tiltX = -0.035 + clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5) * 0.16
    tiltY = -0.1 + clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5) * 0.25
    if (extracted && !viewBack) {
      const center = project('card-center')
      const size = (rect.height / (camera.top - camera.bottom)) * 3.8 * card.scale.x
      cardTiltX = clamp((event.clientY - center.y) / size, -0.5, 0.5) * 0.8
      cardTiltY = clamp((event.clientX - center.x) / size, -0.5, 0.5) * 1.1
    }
    const handle = project('tip')
    canvas.style.cursor =
      !viewBack &&
      progress < 1 &&
      Math.hypot(event.clientX - handle.x, event.clientY - handle.y) < 32
        ? 'ew-resize'
        : 'grab'
    invalidate()
  }
  function pointerLeave() {
    if (choice === 'discard') return
    if (!drag) {
      tiltX = -0.035
      tiltY = -0.1
      cardTiltX = cardTiltY = 0
      invalidate()
    }
  }
  function key(event: KeyboardEvent) {
    if (event.code === 'Escape') release()
  }
  function visibility() {
    if (document.hidden) {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      release()
    } else {
      lastTime = 0
      dirty = true
      invalidate()
    }
  }
  function lost() {
    release()
  }
  function contextLoss(event: Event) {
    event.preventDefault()
    contextLost = true
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    notify()
  }
  function contextRestore() {
    contextLost = false
    dirty = true
    invalidate()
  }
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('pointermove', pointerMove)
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('lostpointercapture', lost)
  canvas.addEventListener('pointerleave', pointerLeave)
  canvas.addEventListener('webglcontextlost', contextLoss)
  canvas.addEventListener('webglcontextrestored', contextRestore)
  window.addEventListener('blur', release)
  window.addEventListener('keydown', key)
  document.addEventListener('visibilitychange', visibility)
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight
    renderer.setSize(w, h, false)
    const span = Math.max(7.5, 5.3 / (w / h))
    camera.left = (-span * w) / h / 2
    camera.right = (span * w) / h / 2
    camera.top = span / 2
    camera.bottom = -span / 2
    camera.updateProjectionMatrix()
    invalidate()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  function reset() {
    release()
    progress = 0
    extracted = false
    targetExtract = extractAmount = 0
    grip = 0
    stripFall = 0
    pouchFall = 0
    deformFilm = false
    cardTiltX = cardTiltY = 0
    cardBack = false
    choice = null
    resetDiscard()
    viewBack = false
    dirty = true
    invalidate()
    notify()
  }
  function extract() {
    if (choice === 'discard') return
    if (progress !== 1 || drag || viewBack) return
    extracted = !extracted
    cardBack = false
    choice = null
    targetExtract = extracted ? 1 : 0
    invalidate()
    notify()
  }
  function setCardFinish(value: CardFinish) {
    cardFinish = value
    albumCard.setFinish(value)
    invalidate()
    notify()
  }
  function setCardSample(value: CardSample) {
    cardSample = value
    choice = null
    resetDiscard()
    albumCard.setSample(value)
    invalidate()
    notify()
  }
  function flipCard() {
    if (!extracted || viewBack || drag || choice === 'discard') return
    cardBack = !cardBack
    invalidate()
    notify()
  }
  function choose(value: 'play' | 'discard') {
    if (!extracted || viewBack || drag || choice) return
    choice = value
    if (value === 'discard') {
      discardTime = 0
      tiltX = group.rotation.x
      tiltY = group.rotation.y
      cardTiltX = card.rotation.x
      cardTiltY = card.rotation.y - (cardBack ? Math.PI : 0)
      cardFaces.forEach((face) => (face.visible = false))
      pixelDiscard.start(cardBack ? albumCard.backTexture : albumCard.texture, cardBack)
      invalidate()
    }
    notify()
  }
  function resetDiscard() {
    discardTime = 0
    pixelDiscard.reset()
    cardFaces.forEach((face) => (face.visible = true))
  }
  function turn() {
    if (progress === 1) return
    release()
    viewBack = !viewBack
    invalidate()
  }
  function keyboardTear() {
    if (viewBack || progress === 1) return
    progress = clamp(progress + 0.25, 0, 1)
    dirty = true
    invalidate()
    notify()
  }
  function dispose() {
    if (disposed) return
    release()
    disposed = true
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    observer.disconnect()
    canvas.removeEventListener('pointerdown', pointerDown)
    canvas.removeEventListener('pointermove', pointerMove)
    canvas.removeEventListener('pointerup', release)
    canvas.removeEventListener('pointercancel', release)
    canvas.removeEventListener('lostpointercapture', lost)
    canvas.removeEventListener('pointerleave', pointerLeave)
    canvas.removeEventListener('webglcontextlost', contextLoss)
    canvas.removeEventListener('webglcontextrestored', contextRestore)
    window.removeEventListener('blur', release)
    window.removeEventListener('keydown', key)
    document.removeEventListener('visibilitychange', visibility)
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>()
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry)
        for (const m of Array.isArray(object.material) ? object.material : [object.material])
          materials.add(m)
      }
    })
    geometries.forEach((g) => g.dispose())
    materials.forEach((m) => m.dispose())
    wrinkles.dispose()
    albumCard.texture.dispose()
    albumCard.backTexture.dispose()
    environment.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
    notify()
  }
  resize()
  notify()
  return {
    snapshot,
    project,
    reset,
    extract,
    setCardFinish,
    setCardSample,
    flipCard,
    choose,
    turn,
    keyboardTear,
    dispose,
  }
}
