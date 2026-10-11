import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createAlbumCard, type CardFinish } from './card'
import type { CardContent } from './cardArtwork'
import type { CardAppearance } from './cardAppearance'
import { createCardFracture, CARD_SHATTER_DURATION_MS } from './cardFracture'
import { randomPatternSeed } from './backgrounds/variation'
import { createCardDrop, CARD_DROP_DURATION_MS } from './cardDrop'

export interface CardSnapshot {
  entrance: 'full' | 'switch'
  entranceProgress: number
  entering: boolean
  reducedMotion: boolean
  sweepStrength: number
  entranceY: number
  entranceX: number
  entranceRotationX: number
  entranceRotationY: number
  entranceRotationZ: number
  frames: number
  cardRendered: boolean
  pending: boolean
  disposed: boolean
  calls: number
  triangles: number
  cardFinish: CardFinish
  contentId: string
  cardTilt: { x: number; y: number }
  contextLost: boolean
  shattering: boolean
  shatterProgress: number
  dropping: boolean
  dropProgress: number
}

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))
const defaultRoll = Math.PI / 120 // 1.5 degrees counterclockwise, independent of hover tilt.
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

export function createCardScene(
  host: HTMLElement,
  onChange: (state: CardSnapshot) => void,
  content: CardContent,
  motionQuery: {
    readonly matches: boolean
    addEventListener(type: 'change', listener: (event: MediaQueryListEvent) => void): void
    removeEventListener(type: 'change', listener: (event: MediaQueryListEvent) => void): void
  } = window.matchMedia('(prefers-reduced-motion: reduce)'),
  appearance?: CardAppearance,
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.85
  renderer.setClearColor(0x000000, 0)
  host.appendChild(renderer.domElement)
  const canvas = renderer.domElement
  canvas.setAttribute('aria-hidden', 'true')
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
  const keyLight = new THREE.DirectionalLight('#fff7ed', 1)
  keyLight.position.set(-3, 5, 7)
  const fill = new THREE.DirectionalLight('#d8d0f2', 0.6)
  fill.position.set(4, -1, 5)
  scene.add(keyLight, fill, new THREE.HemisphereLight('#ffffff', '#8b8394', 0.35))

  // Entrance pose and pointer pose are independent, so controls never wait.
  const presentation = new THREE.Group()
  scene.add(presentation)
  const albumCard = createAlbumCard(content, { appearance })
  const card = albumCard.object
  let cardRendered = false
  albumCard.face.onAfterRender = () => {
    cardRendered = true
  }
  const cardFaces = [albumCard.face]
  presentation.add(card)
  const reduced = motionQuery
  let entrance: CardSnapshot['entrance'] = 'full',
    entranceTime = 0
  let cardFinish: CardFinish = 'bands',
    contentId = content.id
  let tiltX = 0,
    tiltY = 0,
    sweepStrength = 0
  let frame = 0,
    frames = 0,
    lastTime = 0,
    disposed = false,
    contextLost = false
  let windowVisible = true
  let fracture: ReturnType<typeof createCardFracture> | undefined
  let shatterComplete: (() => void) | undefined
  let shatterStarted = 0,
    shatterProgress = 0
  let shatterTimer: ReturnType<typeof setTimeout> | undefined
  let drop: ReturnType<typeof createCardDrop>
  let dropComplete: (() => void) | undefined
  let dropStarted = 0,
    dropProgress = 0
  let dropTimer: ReturnType<typeof setTimeout> | undefined
  const raycaster = new THREE.Raycaster()
  const pointerNdc = new THREE.Vector2()
  let pointer: { x: number; y: number } | null = null
  let hovering = false
  const duration = () => (reduced.matches ? 0.15 : entrance === 'full' ? 1.3 : 0.35)
  const entering = () => entranceTime < duration()

  function snapshot(): CardSnapshot {
    return {
      entrance,
      entranceProgress: clamp(entranceTime / duration(), 0, 1),
      entering: entering(),
      reducedMotion: reduced.matches,
      sweepStrength,
      entranceY: presentation.position.y,
      entranceX: presentation.position.x,
      entranceRotationX: presentation.rotation.x,
      entranceRotationY: presentation.rotation.y,
      entranceRotationZ: presentation.rotation.z,
      frames,
      cardRendered,
      pending: !!frame,
      disposed,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      cardFinish,
      contentId,
      cardTilt: { x: card.rotation.x, y: card.rotation.y },
      contextLost,
      shattering: Boolean(shatterComplete),
      shatterProgress,
      dropping: Boolean(dropComplete),
      dropProgress,
    }
  }
  function notify() {
    onChange(snapshot())
  }
  function project(name: 'card' | 'card-center') {
    scene.updateMatrixWorld(true)
    const v = card
      .localToWorld(new THREE.Vector3(0, name === 'card' ? 1.82 : 0, 0.02))
      .project(camera)
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.left + ((v.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - v.y) * rect.height) / 2,
    }
  }
  function invalidate() {
    if (disposed || !windowVisible || document.hidden || contextLost || frame) return
    frame = requestAnimationFrame(render)
  }
  function entrancePose() {
    const p = clamp(entranceTime / duration(), 0, 1)
    let scale = 1,
      x = 0,
      y = 0,
      xRotation = 0,
      yRotation = 0,
      zRotation = 0
    let sweepPosition = 1.5
    sweepStrength = 0
    canvas.style.opacity = reduced.matches ? String(smooth(0, 1, p)) : '1'
    if (!reduced.matches && p < 1) {
      if (entrance === 'full') {
        const approach = 1 - (1 - clamp(entranceTime / 0.98, 0, 1)) ** 3
        const settle = smooth(0.98, 1.3, entranceTime)
        const rebound = Math.sin(settle * Math.PI * 2) * (1 - settle) * 0.025
        scale = 0.82 + approach * 0.18 + rebound * 0.3
        // Start fully below the viewport, including at compact aspect ratios.
        y = (camera.bottom - 2.7 - 0.18) * (1 - approach) + rebound
        // Independent, monotonic phase curves change angular speed and the
        // apparent rotation axis. Both converge with zero velocity at rest.
        const yawPhase = p + 0.1 * Math.sin(p * Math.PI * 2) + 0.025 * Math.sin(p * Math.PI * 4)
        const pitchPhase = p + 0.08 * Math.sin(p * Math.PI * 2) - 0.035 * Math.sin(p * Math.PI * 4)
        xRotation = -Math.PI * 4 * (1 - pitchPhase) ** 2.35
        yRotation = -Math.PI * 6 * (1 - yawPhase) ** 2.7
        zRotation =
          (-0.6 + 0.8 * Math.sin(p * Math.PI * 3) * Math.sqrt(1 - p)) * (1 - smooth(0.72, 1, p)) +
          rebound * 0.2
        x =
          -0.58 * (1 - smooth(0, 0.45, p)) +
          0.55 * Math.sin(p * Math.PI) * Math.sin(p * Math.PI * 1.4) * (1 - smooth(0.65, 1, p))
        const scan = clamp((entranceTime - 1.04) / 0.26, 0, 1)
        sweepPosition = -0.25 + scan * 1.5
        sweepStrength = Math.sin(scan * Math.PI) * 0.65
      } else {
        const remaining = (1 - p) ** 3
        xRotation = 0.035 * remaining
        yRotation = -0.12 * remaining
        zRotation = -0.012 * remaining
        sweepPosition = -0.25 + p * 1.5
        sweepStrength = Math.sin(p * Math.PI) * 0.32
      }
    }
    presentation.position.set(x, 0.18 + y, 0)
    presentation.scale.setScalar(1.2 * scale)
    presentation.rotation.set(xRotation, yRotation, defaultRoll + zRotation)
    albumCard.setEntranceSweep(sweepPosition, sweepStrength)
  }
  function render(time: number) {
    frame = 0
    if (disposed || !windowVisible || document.hidden || contextLost) return
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0
    lastTime = time
    if (dropComplete) {
      const elapsed = time - dropStarted
      dropProgress = clamp(elapsed / CARD_DROP_DURATION_MS, 0, 1)
      if (!drop?.update(elapsed)) {
        finishDrop()
        return
      }
      renderer.render(scene, camera)
      frames++
      notify()
      if (dropProgress >= 1) finishDrop()
      else invalidate()
      return
    }
    if (shatterComplete) {
      shatterProgress = clamp((time - shatterStarted) / CARD_SHATTER_DURATION_MS, 0, 1)
      fracture!.setProgress(shatterProgress)
      renderer.render(scene, camera)
      frames++
      notify()
      if (shatterProgress >= 1) finishShatter()
      else invalidate()
      return
    }
    entranceTime = Math.min(duration(), entranceTime + dt)
    entrancePose()
    updateHover()
    const ease = reduced.matches ? 1 : 1 - Math.exp(-dt * 13)
    const targetY = tiltY
    card.rotation.x += (tiltX - card.rotation.x) * ease
    card.rotation.y += (targetY - card.rotation.y) * ease
    if (Math.abs(card.rotation.x - tiltX) < 0.0003) card.rotation.x = tiltX
    if (Math.abs(card.rotation.y - targetY) < 0.0003) card.rotation.y = targetY
    renderer.render(scene, camera)
    frames++
    if (entering() || card.rotation.x !== tiltX || card.rotation.y !== tiltY) invalidate()
    notify()
  }
  function finishEntrance() {
    entranceTime = duration()
    entrancePose()
  }
  function startEntrance(kind: CardSnapshot['entrance']) {
    cardRendered = false
    entrance = kind
    entranceTime = 0
    lastTime = 0
    pointer = null
    hovering = false
    tiltX = tiltY = 0
    card.rotation.set(0, 0, 0)
    entrancePose()
    invalidate()
    notify()
  }
  function replay() {
    if (shatterComplete || dropComplete) return
    startEntrance('full')
  }
  function setContent(value: CardContent) {
    if (shatterComplete || dropComplete) return
    if (contentId === value.id) return
    contentId = value.id
    albumCard.setContent(value)
    startEntrance('switch')
  }
  function setCardFinish(value: CardFinish) {
    cardFinish = value
    albumCard.setFinish(value)
    invalidate()
    notify()
  }
  function updateHover() {
    if (!pointer || entering() || reduced.matches || shatterComplete || dropComplete) return
    const rect = canvas.getBoundingClientRect()
    pointerNdc.set(
      ((pointer.x - rect.left) / rect.width) * 2 - 1,
      1 - ((pointer.y - rect.top) / rect.height) * 2,
    )
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    raycaster.setFromCamera(pointerNdc, camera)
    const visibleHit = raycaster.intersectObjects(cardFaces, false)[0]
    albumCard.hoverSurface.matrixWorld.copy(presentation.matrixWorld)
    const restingHit = raycaster.intersectObject(albumCard.hoverSurface, false)[0]
    // Acquire only on the visible card. Once hovered, retain its rounded resting
    // footprint too, so tilting cannot pull a corner out from under the pointer.
    const hit = hovering ? (restingHit ?? visibleHit) : visibleHit
    if (!hit) {
      pointer = null
      hovering = false
      tiltX = tiltY = 0
      return
    }
    hovering = true
    // Use fixed presentation coordinates instead of the rotating face, avoiding
    // feedback between the tilt and the pointer's position near edges/corners.
    const local = presentation.worldToLocal(hit.point)
    tiltX = clamp(-local.y / albumCard.height, -0.5, 0.5) * 0.8
    tiltY = clamp(local.x / albumCard.width, -0.5, 0.5) * 1.1
  }
  function pointerMove(event: PointerEvent) {
    if (reduced.matches || contextLost || !windowVisible || shatterComplete || dropComplete) return
    pointer = { x: event.clientX, y: event.clientY }
    const previousX = tiltX,
      previousY = tiltY
    updateHover()
    if (tiltX !== previousX || tiltY !== previousY) invalidate()
  }
  function pointerLeave() {
    pointer = null
    hovering = false
    const changed = tiltX !== 0 || tiltY !== 0
    tiltX = tiltY = 0
    if (changed) invalidate()
  }
  function visibility() {
    if (!windowVisible || document.hidden) {
      if (dropComplete) {
        finishDrop()
        return
      }
      if (shatterComplete) {
        finishShatter()
        return
      }
      pointerLeave()
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      lastTime = 0
      notify()
    } else {
      lastTime = 0
      invalidate()
    }
  }
  function contextLoss(event: Event) {
    event.preventDefault()
    if (dropComplete) {
      finishDrop()
      return
    }
    if (shatterComplete) {
      finishShatter()
      return
    }
    pointerLeave()
    contextLost = true
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    lastTime = 0
    notify()
  }
  function setVisible(visible: boolean) {
    windowVisible = visible
    visibility()
  }
  function contextRestore() {
    contextLost = false
    lastTime = 0
    invalidate()
  }
  function motionChange() {
    if (dropComplete) {
      finishDrop()
      return
    }
    if (shatterComplete) {
      finishShatter()
      return
    }
    // A preference change during a reveal finishes it without restarting.
    finishEntrance()
    pointerLeave()
    invalidate()
  }
  function resize() {
    if (dropComplete) {
      finishDrop()
      return
    }
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight)
    renderer.setDrawingBufferSize(w, h, Math.min(devicePixelRatio, 2))
    const span = Math.max(7.5, 6.5 / (w / h))
    camera.left = (-span * w) / h / 2
    camera.right = (span * w) / h / 2
    camera.top = span / 2
    camera.bottom = -span / 2
    camera.updateProjectionMatrix()
    invalidate()
  }
  canvas.addEventListener('pointermove', pointerMove)
  canvas.addEventListener('pointerleave', pointerLeave)
  canvas.addEventListener('webglcontextlost', contextLoss)
  canvas.addEventListener('webglcontextrestored', contextRestore)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('resize', resize)
  reduced.addEventListener('change', motionChange)
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  function finishDrop() {
    const complete = dropComplete
    if (!complete) return
    dropComplete = undefined
    clearTimeout(dropTimer)
    dropTimer = undefined
    dropProgress = 1
    drop?.dispose()
    drop = null
    complete()
  }
  function dropInto(target: HTMLElement, onComplete: () => void): boolean {
    if (
      disposed ||
      dropComplete ||
      shatterComplete ||
      contextLost ||
      reduced.matches ||
      !windowVisible ||
      document.hidden
    )
      return false
    drop = createCardDrop(
      renderer,
      camera,
      presentation,
      card,
      albumCard.width,
      albumCard.height,
      target,
    )
    if (!drop) return false
    pointer = null
    hovering = false
    dropStarted = performance.now()
    dropProgress = 0
    dropComplete = onComplete
    dropTimer = setTimeout(finishDrop, CARD_DROP_DURATION_MS)
    invalidate()
    notify()
    return true
  }
  function finishShatter() {
    const complete = shatterComplete
    if (!complete) return
    shatterComplete = undefined
    clearTimeout(shatterTimer)
    shatterTimer = undefined
    shatterProgress = 1
    complete()
  }
  function shatter(onComplete: () => void): boolean {
    if (
      disposed ||
      dropComplete ||
      shatterComplete ||
      contextLost ||
      reduced.matches ||
      !windowVisible ||
      document.hidden
    )
      return false
    // Freeze exactly the currently rendered entrance/hover pose. Starting
    // an exit mid-reveal must never snap the card to its final entrance pose.
    fracture = createCardFracture(albumCard, randomPatternSeed())
    fracture.group.position.copy(card.position)
    fracture.group.quaternion.copy(card.quaternion)
    fracture.group.scale.copy(card.scale)
    presentation.add(fracture.group)
    fracture.setProgress(0)
    shatterStarted = performance.now()
    shatterComplete = onComplete
    pointer = null
    hovering = false
    shatterTimer = setTimeout(finishShatter, CARD_SHATTER_DURATION_MS)
    invalidate()
    return true
  }
  function dispose() {
    if (disposed) return
    disposed = true
    clearTimeout(dropTimer)
    dropTimer = undefined
    dropComplete = undefined
    drop?.dispose()
    drop = null
    clearTimeout(shatterTimer)
    shatterTimer = undefined
    shatterComplete = undefined
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    observer.disconnect()
    canvas.removeEventListener('pointermove', pointerMove)
    canvas.removeEventListener('pointerleave', pointerLeave)
    canvas.removeEventListener('webglcontextlost', contextLoss)
    canvas.removeEventListener('webglcontextrestored', contextRestore)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('resize', resize)
    reduced.removeEventListener('change', motionChange)
    // Fracture owns line resources as well as meshes; remove it before the
    // original card traversal so shared artwork is disposed exactly once.
    fracture?.dispose()
    fracture = undefined
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>()
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry)
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          materials.add(material)
      }
    })
    geometries.forEach((g) => g.dispose())
    materials.forEach((m) => m.dispose())
    albumCard.disposeArtwork()
    environment.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
    notify()
  }
  entrancePose()
  resize()
  notify()
  return {
    getArtworkCanvas: () => albumCard.texture.image as HTMLCanvasElement,
    snapshot,
    project,
    replay,
    setCardFinish,
    setContent,
    setVisible,
    shatter,
    dropInto,
    dispose,
  }
}
