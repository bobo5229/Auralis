import { animateFrames, animateTilt } from '@renderer/shared/animation/motion'
import { cdAlbumIndex, cdPose, cdSlots, cdProjectedDiscOutline } from './cdGeometry'
import { playCdStartup } from './cdStartup'

export interface CdAlbum {
  key: string
  artworkUrl: string | null
}

interface DiscNode {
  index: number
  albumKey: string
  slot: HTMLDivElement
  disc: HTMLDivElement
  hoverPlane: HTMLDivElement
  image?: HTMLImageElement
  vinyl?: HTMLDivElement
  tiltAnimation?: ReturnType<typeof animateTilt>
}

interface StagePointer {
  id: number
  x: number
  y: number
  moved: boolean
  node?: DiscNode
}

const neutralTilt = 'perspective(1100px) rotateX(0deg) rotateY(0deg)'
// Parameters from the user-approved standalone inertia demo.
const POSITION_STIFFNESS = 110
const SWAY_STIFFNESS = 100
const SWAY_DAMPING = 14.4
const INFO_DELAY_SECONDS = 0.4
const RAPID_INPUT_SECONDS = 0.25
const MAX_BROWSE_SPEED = 6

interface InertialMove {
  position: number
  velocity: number
  target: number
  dampingRatio: number
  elapsed: number
  infoTriggered: boolean
}

export function createCdStage(
  stage: HTMLElement,
  onSelect: (index: number) => void,
  onApproach?: (index: number) => void,
  onStartup?: (running: boolean) => void,
  onRapidBrowse?: (running: boolean) => void,
  focusOptions?: {
    geometry: () => { cx: number; cy: number; rightBoundary: number }
    change: (progress: number, settled: boolean) => void
  },
) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const listeners = new AbortController()
  const options = { signal: listeners.signal }
  const nodes = new Map<number, DiscNode>()
  const discNodes = new WeakMap<EventTarget, DiscNode>()
  // Session-local orientations survive DOM recycling and catalog refreshes.
  const artworkAngles = new Map<string, number>()
  let albums: readonly CdAlbum[] = []
  let selected = 0
  let position = 0
  let active: InertialMove | null = null
  let swayAngle = 0
  let swayVelocity = 0
  let cancelAnimation: (() => void) | null = null
  let hovered: DiscNode | null = null
  let pointer: StagePointer | null = null
  let rapid = false
  let startup = false
  let startupGeneration = 0
  let preparationTimer: ReturnType<typeof setTimeout> | undefined
  let width = stage.clientWidth
  let height = stage.clientHeight
  let focusProgress = 0
  let focusTarget = 0
  let focusMoving = false
  let focusGeometry = { cx: 0, cy: 0, size: 0 }

  function measureFocus(): void {
    if (!focusOptions) return
    const target = focusOptions.geometry()
    const pose = cdPose(0, width, height)
    const right = Math.max(...cdProjectedDiscOutline(pose).map((point) => point.x)) - pose.cx
    const scale = Math.min(
      1.08,
      Math.max(0, target.rightBoundary - target.cx - 32) / Math.max(1, right),
    )
    focusGeometry = { cx: target.cx, cy: target.cy, size: pose.size * scale }
  }

  function setFocused(open: boolean): void {
    if (!focusOptions || startup || active || !albums.length || Number(open) === focusTarget) return
    cancelAnimation?.()
    resetHover()
    pointer = null
    measureFocus()
    focusTarget = Number(open)
    const from = focusProgress
    focusMoving = true
    focusOptions.change(open ? Math.max(from, 0.0001) : from, false)
    const finish = (): void => {
      focusProgress = focusTarget
      focusMoving = false
      cancelAnimation = null
      render(selected)
      for (const node of nodes.values()) {
        node.slot.style.willChange = ''
        node.disc.style.willChange = ''
      }
      focusOptions.change(focusProgress, true)
    }
    if (reducedMotion.matches) {
      finish()
      return
    }
    for (const node of nodes.values()) {
      node.slot.style.willChange = 'transform, opacity'
      node.disc.style.willChange = 'transform'
    }
    let elapsed = 0
    const duration = Math.max(0.18, (open ? 0.88 : 0.72) * Math.abs(focusTarget - from))
    cancelAnimation = animateFrames((seconds) => {
      elapsed += seconds
      const p = Math.min(1, elapsed / duration)
      const eased = p * p * p * (10 + p * (-15 + 6 * p))
      focusProgress = from + (focusTarget - from) * eased
      const wobble = Math.sin(p * Math.PI * 7) * Math.sin(p * Math.PI) * (1 - p) ** 1.3 * 2.8
      render(selected, wobble)
      focusOptions.change(focusProgress, false)
      if (p < 1) return true
      finish()
      return false
    })
  }

  function tilt(node: DiscNode, transform: string): void {
    node.tiltAnimation?.stop()
    if (reducedMotion.matches) node.hoverPlane.style.transform = transform
    else node.tiltAnimation = animateTilt(node.hoverPlane, transform)
  }

  function resetHover(): void {
    if (hovered) tilt(hovered, neutralTilt)
    hovered = null
  }

  function removeNode(node: DiscNode): void {
    node.tiltAnimation?.cancel()
    if (hovered === node) hovered = null
    node.slot.remove()
  }

  function createDisc(index: number): DiscNode {
    const album = albums[cdAlbumIndex(index, albums.length)]
    let angle = artworkAngles.get(album.key)
    if (angle === undefined) {
      const nearbyAngles: number[] = []
      for (let offset = -3; offset <= 3; offset++) {
        const neighbor = albums[cdAlbumIndex(index + offset, albums.length)]
        const assigned = artworkAngles.get(neighbor.key)
        if (neighbor.key !== album.key && assigned !== undefined) nearbyAngles.push(assigned)
      }
      // Keep adjacent albums visually distinct while retaining the full circle.
      const candidates = Array.from({ length: 360 }, (_, degree) => degree).filter((degree) =>
        nearbyAngles.every((other) => {
          const distance = Math.abs(degree - other)
          return Math.min(distance, 360 - distance) >= 24
        }),
      )
      angle = candidates[Math.floor(Math.random() * candidates.length)]
      artworkAngles.set(album.key, angle)
    }
    const slot = document.createElement('div')
    slot.className = 'cd-position'
    slot.setAttribute('aria-hidden', 'true')
    const hoverPlane = document.createElement('div')
    hoverPlane.className = 'cd-hover'
    const disc = document.createElement('div')
    disc.className = 'cd-disc'
    const art = document.createElement('div')
    art.className = 'cd-art'
    // Rotate inside the disc plane, leaving its silhouette, lighting and path intact.
    art.style.transform = `rotate(${angle}deg)`
    let image: HTMLImageElement | undefined
    if (album.artworkUrl) {
      image = new Image()
      image.alt = ''
      image.decoding = 'async'
      image.draggable = false
      image.src = album.artworkUrl
      const artwork = image
      image.addEventListener('error', () => artwork.remove(), { once: true })
      art.append(image)
    }
    const hub = document.createElement('div')
    hub.className = 'cd-hub'
    disc.append(art, hub)
    hoverPlane.append(disc)
    slot.append(hoverPlane)
    stage.append(slot)
    const node = { index, albumKey: album.key, slot, disc, hoverPlane, image }
    nodes.set(index, node)
    discNodes.set(disc, node)
    return node
  }

  function render(nextPosition: number, angle = 0): void {
    position = nextPosition
    const slots = cdSlots(position, albums.length)
    for (const [index, node] of nodes) {
      if (!slots.includes(index)) {
        removeNode(node)
        nodes.delete(index)
      }
    }
    slots.forEach((index, layer) => {
      const node = nodes.get(index) ?? createDisc(index)
      const t = index - position
      const pose = cdPose(t, width, height)
      const central = index === selected
      if (central && focusProgress > 0) {
        pose.cx += (focusGeometry.cx - pose.cx) * focusProgress
        pose.cy += (focusGeometry.cy - pose.cy) * focusProgress
        pose.size += (focusGeometry.size - pose.size) * focusProgress
      }
      const edge = Math.max(0, Math.min(1, (t + 2.5) * 2, (1.5 - t) * 2))
      const fade = Math.min(1, focusProgress / 0.8)
      node.slot.style.opacity = String(
        edge * edge * (3 - 2 * edge) * (central ? 1 : 1 - fade * fade * (3 - 2 * fade)),
      )
      node.slot.style.transform = `translate3d(${pose.cx - pose.size / 2}px, ${pose.cy - pose.size / 2}px, 0) scale(${pose.size / 400})`
      node.slot.style.zIndex = String(central && focusProgress > 0 ? 5 : layer + 1)
      node.disc.style.pointerEvents =
        focusMoving || (focusProgress > 0 && !central) ? 'none' : 'auto'
      // The resting centre opens focus; a pending target during browsing remains a no-op.
      node.disc.style.cursor =
        focusProgress > 0 || (!focusOptions && index === (active?.target ?? selected))
          ? 'default'
          : 'pointer'
      node.disc.style.transform = `perspective(1100px) rotateZ(${pose.turn + angle}deg) rotateY(${pose.tilt + angle * 0.62}deg) rotateX(${9 + angle * 0.28}deg)`
    })
  }

  function stop(): void {
    if (focusProgress || focusMoving) {
      focusProgress = focusTarget = 0
      focusMoving = false
      focusOptions?.change(0, true)
      for (const node of nodes.values()) {
        node.slot.style.willChange = ''
        node.disc.style.willChange = ''
      }
    }
    if (rapid) {
      rapid = false
      onRapidBrowse?.(false)
    }
    ++startupGeneration
    clearTimeout(preparationTimer)
    preparationTimer = undefined
    if (startup) {
      startup = false
      for (const node of nodes.values()) {
        node.vinyl?.remove()
        node.vinyl = undefined
        node.slot.style.willChange = ''
        node.disc.style.willChange = ''
      }
      onStartup?.(false)
    }
    cancelAnimation?.()
    cancelAnimation = null
    active = null
    swayAngle = 0
    swayVelocity = 0
    resetHover()
  }

  function beginStartup(): void {
    startup = true
    onStartup?.(true)
    const generation = ++startupGeneration
    const travel = albums.length >= 4 ? 9 : 0
    const first = travel ? -travel - 2 : 0
    const last = travel ? 1 : Math.min(1, albums.length - 1)
    const readyImages = new Set<HTMLImageElement>()
    const decoding: Promise<void>[] = []
    // Bounded pool: at most 13 nodes, only four visible. Nothing is allocated,
    // reparented or assigned a new image source during the rapid passage.
    for (let index = first; index <= last; index++) {
      const node = createDisc(index)
      node.slot.style.opacity = '0'
      node.slot.style.willChange = 'transform, opacity'
      node.disc.style.willChange = 'transform'
      const vinyl = document.createElement('div')
      vinyl.className = 'cd-startup-vinyl'
      node.disc.append(vinyl)
      node.vinyl = vinyl
      if (node.image) {
        const image = node.image
        decoding.push(
          image.decode().then(
            () => {
              readyImages.add(image)
            },
            () => {},
          ),
        )
      }
    }
    let prepared = false
    const start = (): void => {
      if (prepared || generation !== startupGeneration) return
      prepared = true
      clearTimeout(preparationTimer)
      preparationTimer = undefined
      // A slow/broken cover gets the existing metal fallback, never a late
      // image upload halfway through the fast animation.
      for (const node of nodes.values()) {
        if (node.image && !readyImages.has(node.image)) node.image.remove()
      }
      const pool = new Map(
        Array.from(nodes, ([index, node]) => [
          index,
          {
            slot: node.slot,
            disc: node.disc,
            vinyl: node.vinyl!,
          },
        ]),
      )
      cancelAnimation = playCdStartup(
        pool,
        albums.length,
        () => ({ width, height }),
        () => {
          cancelAnimation = null
          stop()
          selected = 0
          render(selected)
          onSelect(selected)
        },
      )
    }
    preparationTimer = setTimeout(start, 1200)
    void Promise.all(decoding).then(start)
  }

  function dampingRatio(target: number, currentPosition: number, velocity: number): number {
    const distance = Math.max(1, Math.abs(target - selected))
    const logarithm = -Math.log(0.02 / distance)
    const designedRatio = logarithm / Math.hypot(Math.PI, logarithm)
    const displacement = target - currentPosition
    if (velocity * displacement < 0) return 1.05
    const speedRatio =
      Math.abs(velocity) / (Math.sqrt(POSITION_STIFFNESS) * Math.max(Math.abs(displacement), 0.2))
    return Math.min(1.05, designedRatio + Math.max(0, speedRatio - 0.15) * 0.3)
  }

  function tick(seconds: number): boolean {
    if (!active) return false
    active.elapsed += seconds
    const acceleration =
      (active.target - active.position) * POSITION_STIFFNESS -
      2 * active.dampingRatio * Math.sqrt(POSITION_STIFFNESS) * active.velocity
    active.velocity = Math.max(
      -MAX_BROWSE_SPEED,
      Math.min(MAX_BROWSE_SPEED, active.velocity + acceleration * seconds),
    )
    active.position += active.velocity * seconds
    const swayAcceleration = -SWAY_STIFFNESS * swayAngle - SWAY_DAMPING * swayVelocity
    swayVelocity += swayAcceleration * seconds
    swayAngle += swayVelocity * seconds
    render(active.position, swayAngle)
    // Each retarget restarts only the label delay, never the disc's momentum.
    if (
      !rapid &&
      !active.infoTriggered &&
      active.elapsed >= INFO_DELAY_SECONDS &&
      Math.abs(active.target - active.position) < 0.5
    ) {
      active.infoTriggered = true
      onApproach?.(cdAlbumIndex(active.target, albums.length))
    }
    const settled =
      Math.abs(active.target - active.position) <= 0.002 &&
      Math.abs(active.velocity) <= 0.025 &&
      Math.abs(swayAngle) <= 0.03 &&
      Math.abs(swayVelocity) <= 0.1
    if (!settled) return true
    selected = active.target
    active = null
    cancelAnimation = null
    swayAngle = 0
    swayVelocity = 0
    render(selected)
    onSelect(cdAlbumIndex(selected, albums.length))
    if (rapid) {
      rapid = false
      onRapidBrowse?.(false)
    }
    return false
  }

  function moveToPosition(target: number): void {
    if (startup || focusProgress > 0 || focusMoving) return
    if (!albums.length || target === (active?.target ?? selected)) return
    const direction = Math.sign(target - (active?.target ?? selected))
    resetHover()
    if (reducedMotion.matches) {
      stop()
      selected = target
      render(selected)
      onSelect(cdAlbumIndex(selected, albums.length))
      return
    }
    if (active) {
      // Once entered, suppression lasts until physical settling, not a timeout
      // after the last click. Invalid/no-op inputs never enter this mode.
      if (!rapid && active.elapsed <= RAPID_INPUT_SECONDS) {
        rapid = true
        onRapidBrowse?.(true)
      }
      active.target = target
      active.dampingRatio = dampingRatio(target, active.position, active.velocity)
      active.elapsed = 0
      active.infoTriggered = false
    } else {
      active = {
        position: selected,
        velocity: 0,
        target,
        dampingRatio: dampingRatio(target, selected, 0),
        elapsed: 0,
        infoTriggered: false,
      }
    }
    swayVelocity = Math.max(-32, Math.min(32, swayVelocity + direction * 16))
    if (!cancelAnimation) cancelAnimation = animateFrames(tick)
  }

  function navigate(direction: number): void {
    if (albums.length < 2) return
    // Reversing discards the forward backlog and aims immediately behind/ahead
    // of the current position, preserving velocity for smooth braking.
    const target =
      active && direction * (active.target - active.position) < 0
        ? direction > 0
          ? Math.floor(active.position) + 1
          : Math.ceil(active.position) - 1
        : (active?.target ?? selected) + direction
    if (albums.length < 4 && (target < 0 || target >= albums.length)) return
    moveToPosition(target)
  }

  function nodeFromTarget(target: EventTarget | null): DiscNode | undefined {
    return target ? discNodes.get(target) : undefined
  }

  function nodeFromEvent(event: Event): DiscNode | undefined {
    // composedPath also keeps this reliable in the small test DOM, and does not rely
    // on pointerup's captured target.
    for (const target of event.composedPath()) {
      const node = nodeFromTarget(target)
      if (node) return node
    }
    return nodeFromTarget(event.target)
  }

  function nodeAtPoint(x: number, y: number): DiscNode | undefined {
    const target = document.elementFromPoint?.(x, y)
    return nodeFromTarget(target)
  }

  stage.addEventListener(
    'pointermove',
    (event) => {
      if (pointer?.id === event.pointerId) {
        if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 6) {
          pointer.moved = true
        }
        return
      }
      if (
        event.pointerType !== 'mouse' ||
        event.buttons ||
        pointer ||
        active ||
        focusMoving ||
        startup ||
        reducedMotion.matches
      ) {
        resetHover()
        return
      }
      const node = event.target ? discNodes.get(event.target) : undefined
      if (node !== hovered) resetHover()
      if (!node) return
      hovered = node
      const rect = node.slot.getBoundingClientRect()
      const clamp = (value: number): number => Math.max(-1, Math.min(1, value))
      const x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1)
      const y = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1)
      tilt(node, `perspective(1100px) rotateX(${-y * 4}deg) rotateY(${x * 4}deg)`)
    },
    options,
  )
  stage.addEventListener('pointerleave', resetHover, options)
  window.addEventListener('blur', resetHover, options)
  stage.addEventListener(
    'pointerdown',
    (event) => {
      if (startup || focusMoving || focusProgress > 0 || !event.isPrimary || event.button !== 0)
        return
      resetHover()
      stage.focus({ preventScroll: true })
      const node = nodeFromEvent(event)
      pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        node,
      }
      stage.setPointerCapture(event.pointerId)
    },
    options,
  )
  stage.addEventListener(
    'pointerup',
    (event) => {
      if (!pointer || event.pointerId !== pointer.id) return
      const pressed = pointer
      const dx = event.clientX - pointer.x
      const dy = event.clientY - pointer.y
      pointer = null
      if (Math.hypot(dx, dy) > 6) pressed.moved = true
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        navigate(dx < 0 ? 1 : -1)
        return
      }
      if (pressed.moved || !pressed.node) return
      const released = nodeAtPoint(event.clientX, event.clientY)
      if (
        released !== pressed.node ||
        nodes.get(pressed.node.index) !== pressed.node ||
        albums[cdAlbumIndex(pressed.node.index, albums.length)]?.key !== pressed.node.albumKey
      )
        return
      if (!active && pressed.node.index === selected && focusOptions) setFocused(true)
      else moveToPosition(pressed.node.index)
    },
    options,
  )
  stage.addEventListener(
    'pointercancel',
    () => {
      pointer = null
    },
    options,
  )
  reducedMotion.addEventListener(
    'change',
    () => {
      const target = active?.target ?? selected
      const wasFocused = focusTarget === 1
      stop()
      for (const node of nodes.values()) {
        node.tiltAnimation?.cancel()
        node.hoverPlane.style.transform = neutralTilt
      }
      selected = target
      render(selected)
      if (albums.length) onSelect(cdAlbumIndex(selected, albums.length))
      if (wasFocused) setFocused(true)
    },
    options,
  )
  const observer = new ResizeObserver(() => {
    width = stage.clientWidth
    height = stage.clientHeight
    if (focusProgress > 0 || focusMoving) measureFocus()
    resetHover()
    if (!active && !startup) render(selected)
  })
  observer.observe(stage)

  return {
    navigate,
    setFocused,
    setAlbums(next: readonly CdAlbum[], intro = false): void {
      const key = albums.length ? albums[cdAlbumIndex(selected, albums.length)].key : null
      stop()
      pointer = null
      for (const node of nodes.values()) removeNode(node)
      nodes.clear()
      albums = next
      const retainedKeys = new Set(albums.map((album) => album.key))
      for (const key of artworkAngles.keys()) {
        if (!retainedKeys.has(key)) artworkAngles.delete(key)
      }
      selected = Math.max(
        0,
        albums.findIndex((album) => album.key === key),
      )
      onSelect(selected)
      if (intro && albums.length && !reducedMotion.matches) beginStartup()
      else render(selected)
    },
    dispose(): void {
      stop()
      pointer = null
      listeners.abort()
      observer.disconnect()
      for (const node of nodes.values()) removeNode(node)
      nodes.clear()
      albums = []
      artworkAngles.clear()
    },
  }
}
