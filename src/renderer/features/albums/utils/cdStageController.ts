import { animateFrames, animateTilt } from '@renderer/shared/animation/motion'
import { cdAlbumIndex, cdPose, cdSlots } from './cdGeometry'

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
    if (album.artworkUrl) {
      const image = new Image()
      image.alt = ''
      image.decoding = 'async'
      image.draggable = false
      image.src = album.artworkUrl
      image.addEventListener('error', () => image.remove(), { once: true })
      art.append(image)
    }
    const hub = document.createElement('div')
    hub.className = 'cd-hub'
    disc.append(art, hub)
    hoverPlane.append(disc)
    slot.append(hoverPlane)
    stage.append(slot)
    const node = { index, albumKey: album.key, slot, disc, hoverPlane }
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
    const width = stage.clientWidth
    const height = stage.clientHeight
    const sceneWidth = Math.max(width, Math.min(760, height * 1.25))
    const sceneHeight = Math.min(height, sceneWidth * 0.57)
    const offsetX = (width - sceneWidth) / 2
    const offsetY = (height - sceneHeight) / 2
    slots.forEach((index, layer) => {
      const node = nodes.get(index) ?? createDisc(index)
      const t = index - position
      const pose = cdPose(t)
      const size = sceneWidth * pose.size
      const edge = Math.max(0, Math.min(1, (t + 2.5) * 2, (1.5 - t) * 2))
      node.slot.style.opacity = String(edge * edge * (3 - 2 * edge))
      node.slot.style.transform = `translate3d(${offsetX + pose.x * sceneWidth - size / 2}px, ${offsetY + pose.y * sceneHeight - size / 2}px, 0) scale(${size / 400})`
      node.slot.style.zIndex = String(layer + 1)
      // The resting centre disc has no selection action. During motion the pending
      // target likewise remains a no-op, while every other visible instance can retarget.
      node.disc.style.cursor = index === (active?.target ?? selected) ? 'default' : 'pointer'
      node.disc.style.transform = `perspective(1100px) rotateZ(${pose.turn + angle}deg) rotateY(${pose.tilt + angle * 0.62}deg) rotateX(${9 + angle * 0.28}deg)`
    })
  }

  function stop(): void {
    cancelAnimation?.()
    cancelAnimation = null
    active = null
    swayAngle = 0
    swayVelocity = 0
    resetHover()
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
    active.velocity += acceleration * seconds
    active.position += active.velocity * seconds
    const swayAcceleration = -SWAY_STIFFNESS * swayAngle - SWAY_DAMPING * swayVelocity
    swayVelocity += swayAcceleration * seconds
    swayAngle += swayVelocity * seconds
    render(active.position, swayAngle)
    // Each retarget restarts only the label delay, never the disc's momentum.
    if (
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
    return false
  }

  function moveToPosition(target: number): void {
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
    const target = (active?.target ?? selected) + direction
    if (albums.length < 4 && (target < 0 || target >= albums.length)) return
    // Buttons and keys remain bounded against repeated input; direct disc selection
    // intentionally bypasses this relative guard because it names a visible instance.
    if (Math.abs(target - selected) > 3) return
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
      if (!event.isPrimary || event.button !== 0) return
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
      moveToPosition(pressed.node.index)
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
      stop()
      for (const node of nodes.values()) {
        node.tiltAnimation?.cancel()
        node.hoverPlane.style.transform = neutralTilt
      }
      selected = target
      render(selected)
      if (albums.length) onSelect(cdAlbumIndex(selected, albums.length))
    },
    options,
  )
  const observer = new ResizeObserver(() => {
    resetHover()
    if (!active) render(selected)
  })
  observer.observe(stage)

  return {
    navigate,
    setAlbums(next: readonly CdAlbum[]): void {
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
      render(selected)
      onSelect(selected)
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
