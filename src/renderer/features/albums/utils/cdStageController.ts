import { animateCdPress, animateFrames } from '@renderer/shared/animation/motion'
import { cdAlbumIndex, cdPose, cdSlots, cdProjectedDiscOutline } from './cdGeometry'
import { cdPlaybackWavePath, cdPlaybackWaveSeed } from './cdPlaybackWave'
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
  art: HTMLDivElement
  hoverPlane: HTMLDivElement
  waveRing?: SVGSVGElement
  waveTrack?: SVGPathElement
  sidewall?: SVGSVGElement
  sidewallBands?: SVGPathElement[]
  shadow?: SVGSVGElement
  shadowPath?: SVGPathElement
  waveProgress?: SVGPathElement
  wavePaths?: SVGPathElement[]
  waveSeed: number
  image?: HTMLImageElement
  artwork: 'idle' | 'decoding' | 'shown' | 'dropped'
  vinyl?: HTMLDivElement
  tilt: { x: number; y: number; targetX: number; targetY: number }
  cancelTiltAnimation?: () => void
  cancelSpinAnimation?: () => void
  cancelPressAnimation?: () => void
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
const RING_DRAW_DURATION_SECONDS = 3

interface InertialMove {
  position: number
  velocity: number
  target: number
  dampingRatio: number
  elapsed: number
  infoTriggered: boolean
}

export interface CdPlaybackRingState {
  visible: boolean
  playing: boolean
  progress: number
  accent: string
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
    togglePlayback?: () => boolean
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
  let startupOrigin = 0
  const readyImages = new Set<HTMLImageElement>()
  const decodeQueue: DiscNode[] = []
  let decodesInFlight = 0
  let width = stage.clientWidth
  let height = stage.clientHeight
  let focusProgress = 0
  let focusTarget = 0
  let focusMoving = false
  let directFocusOpacity = 1
  let focusGeometry = { cx: 0, cy: 0, size: 0 }
  // Focus-only, page-instance memory; never applied to the browsing poses.
  let focusRotation = { x: 9, y: -42 }
  let rotationPointer: {
    id: number
    x: number
    y: number
    startX: number
    startY: number
    moved: boolean
  } | null = null
  let artworkClick: {
    node: DiscNode
    x: number
    y: number
    timer: ReturnType<typeof setTimeout>
  } | null = null
  let rotationContextMenu = false
  let playback: CdPlaybackRingState = {
    visible: false,
    playing: false,
    progress: 0,
    accent: '#62625b',
  }
  let cancelWaveAnimation: (() => void) | null = null
  let waveElapsed = 0
  let waveFrameElapsed = 0
  let ringDrawElapsed = 0
  let ringDrawSettled = false

  function stopWaveAnimation(): void {
    cancelWaveAnimation?.()
    cancelWaveAnimation = null
    waveFrameElapsed = 0
  }

  function syncPlaybackRing(): void {
    const activeNode =
      playback.visible && focusProgress === 1 && !focusMoving ? nodes.get(selected) : undefined
    for (const node of nodes.values()) {
      if (!node.waveRing || !node.waveProgress) continue
      const visible = node === activeNode
      node.waveRing.style.opacity = visible ? '1' : '0'
      node.waveProgress.style.stroke = playback.accent
      node.waveProgress.setAttribute('stroke-dashoffset', String(1 - playback.progress))
      if (!visible) {
        node.waveTrack?.setAttribute('stroke-dashoffset', '1')
      }
    }
    if (!activeNode) {
      stopWaveAnimation()
      ringDrawElapsed = 0
      ringDrawSettled = false
      return
    }
    if (reducedMotion.matches) {
      ringDrawSettled = true
      activeNode.waveTrack?.setAttribute('stroke-dashoffset', '0')
    } else if (ringDrawSettled) {
      activeNode.waveTrack?.setAttribute('stroke-dashoffset', '0')
    }

    const needsDraw = !ringDrawSettled && !reducedMotion.matches
    const needsPulse = Boolean(activeNode.wavePaths && playback.playing && !reducedMotion.matches)

    if (!needsDraw && !needsPulse) {
      stopWaveAnimation()
      return
    }
    if (cancelWaveAnimation) return

    cancelWaveAnimation = animateFrames((seconds) => {
      const node = nodes.get(selected)
      if (!node || !playback.visible || focusProgress !== 1 || focusMoving) {
        cancelWaveAnimation = null
        return false
      }

      // 1. Advance the 3-second ease-out draw animation (continues regardless of pause)
      if (!ringDrawSettled && !reducedMotion.matches) {
        ringDrawElapsed += seconds
        const p = Math.min(1, ringDrawElapsed / RING_DRAW_DURATION_SECONDS)
        const eased = 1 - (1 - p) ** 3
        node.waveTrack?.setAttribute('stroke-dashoffset', String(1 - eased))
        if (p >= 1 || ringDrawElapsed >= RING_DRAW_DURATION_SECONDS - 1e-4) {
          ringDrawSettled = true
          node.waveTrack?.setAttribute('stroke-dashoffset', '0')
        }
      }

      // 2. If drawing is done and either paused or reduced-motion, halt the animation loop
      if (ringDrawSettled && (!playback.playing || reducedMotion.matches)) {
        cancelWaveAnimation = null
        return false
      }

      // 3. Throttle continuous playback waveform pulsation to 30fps
      if (playback.playing && !reducedMotion.matches) {
        waveElapsed += seconds
        waveFrameElapsed += seconds
        if (waveFrameElapsed >= 1 / 30) {
          waveFrameElapsed %= 1 / 30
          const path = cdPlaybackWavePath(node.waveSeed, waveElapsed, true)
          node.wavePaths?.forEach((element) => element.setAttribute('d', path))
        }
      }

      return true
    })
  }

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

  function setFocused(open: boolean, entrance: 'motion' | 'fade' = 'motion'): void {
    if (!focusOptions || startup || active || !albums.length || Number(open) === focusTarget) return
    cancelAnimation?.()
    cancelArtworkClick()
    endRotation()
    resetHover()
    stopWaveAnimation()
    ringDrawElapsed = 0
    ringDrawSettled = false
    for (const node of nodes.values()) {
      node.cancelPressAnimation?.()
      node.cancelPressAnimation = undefined
      node.cancelTiltAnimation?.()
      node.cancelTiltAnimation = undefined
      node.tilt = { x: 0, y: 0, targetX: 0, targetY: 0 }
      node.hoverPlane.style.transform = neutralTilt
    }
    pointer = null
    measureFocus()
    focusTarget = Number(open)
    const from = focusProgress
    const finish = (): void => {
      focusProgress = focusTarget
      focusMoving = false
      directFocusOpacity = 1
      cancelAnimation = null
      render(selected)
      for (const node of nodes.values()) {
        node.slot.style.willChange = ''
        node.disc.style.willChange = ''
      }
      focusOptions.change(focusProgress, true)
    }
    if (open && entrance === 'fade') {
      focusProgress = 1
      focusMoving = true
      directFocusOpacity = reducedMotion.matches ? 1 : 0
      render(selected)
      focusOptions.change(1, false)
      if (reducedMotion.matches) {
        finish()
        return
      }
      const node = nodes.get(selected)
      if (node) node.slot.style.willChange = 'opacity'
      let elapsed = 0
      cancelAnimation = animateFrames((seconds) => {
        elapsed += seconds
        const progress = Math.min(1, elapsed / 0.48)
        directFocusOpacity = 1 - (1 - progress) ** 3
        if (node) node.slot.style.opacity = String(directFocusOpacity)
        if (progress < 1) return true
        finish()
        return false
      })
      return
    }
    focusMoving = true
    focusOptions.change(open ? Math.max(from, 0.0001) : from, false)
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

  function tilt(node: DiscNode, x: number, y: number): void {
    const state = node.tilt
    state.targetX = x
    state.targetY = y
    if (reducedMotion.matches) {
      node.cancelTiltAnimation?.()
      node.cancelTiltAnimation = undefined
      state.x = state.y = 0
      node.hoverPlane.style.transform = neutralTilt
      return
    }
    // Retarget the running follower instead of restarting a transition on every move.
    if (node.cancelTiltAnimation) return
    node.cancelTiltAnimation = animateFrames((seconds) => {
      const blend = 1 - Math.exp(-18 * seconds)
      state.x += (state.targetX - state.x) * blend
      state.y += (state.targetY - state.y) * blend
      const settled =
        Math.abs(state.targetX - state.x) < 0.005 && Math.abs(state.targetY - state.y) < 0.005
      if (settled) {
        state.x = state.targetX
        state.y = state.targetY
        node.cancelTiltAnimation = undefined
      }
      node.hoverPlane.style.transform = `perspective(1100px) rotateX(${state.x}deg) rotateY(${state.y}deg)`
      return !settled
    })
  }

  function resetHover(): void {
    if (hovered) tilt(hovered, 0, 0)
    hovered = null
  }

  function removeNode(node: DiscNode): void {
    node.cancelPressAnimation?.()
    node.cancelTiltAnimation?.()
    node.cancelSpinAnimation?.()
    if (hovered === node) hovered = null
    node.slot.remove()
  }

  function releaseStartupImage(node: DiscNode): void {
    const image = node.image
    node.image = undefined
    node.artwork = 'dropped'
    if (!image) return
    image.remove()
    image.src = ''
  }

  function showStartupImage(node: DiscNode): void {
    if (!node.image || node.artwork === 'shown' || node.artwork === 'dropped') return
    if (!readyImages.has(node.image)) return
    node.art.append(node.image)
    node.artwork = 'shown'
  }

  function beginDecode(node: DiscNode): Promise<void> | null {
    if (!node.image || node.artwork !== 'idle') return null
    const album = albums[cdAlbumIndex(node.index, albums.length)]
    if (!album?.artworkUrl) {
      releaseStartupImage(node)
      return Promise.resolve()
    }
    node.artwork = 'decoding'
    const image = node.image
    const generation = startupGeneration
    image.src = album.artworkUrl
    return image.decode().then(
      () => {
        if (generation === startupGeneration && node.artwork === 'decoding') readyImages.add(image)
      },
      () => {
        if (generation === startupGeneration && node.artwork === 'decoding')
          releaseStartupImage(node)
      },
    )
  }

  function pumpDecode(): void {
    while (decodesInFlight < 2 && decodeQueue.length) {
      const node = decodeQueue.shift()
      if (!node || node.artwork !== 'idle') continue
      decodesInFlight += 1
      const generation = startupGeneration
      void beginDecode(node)?.finally(() => {
        decodesInFlight = Math.max(0, decodesInFlight - 1)
        if (generation === startupGeneration) pumpDecode()
      })
    }
  }

  function enqueueDecode(node: DiscNode): void {
    if (node.artwork !== 'idle' || !node.image || decodeQueue.includes(node)) return
    decodeQueue.push(node)
    pumpDecode()
  }

  function promoteStartupDisc(node: DiscNode): void {
    node.slot.style.willChange = 'transform, opacity'
    node.disc.style.willChange = 'transform'
    if (node.vinyl) return
    const vinyl = document.createElement('div')
    vinyl.className = 'cd-startup-vinyl'
    node.disc.append(vinyl)
    node.vinyl = vinyl
  }

  function prepareStartupFrame(
    visible: readonly number[],
    upcoming: number | null,
    gather: boolean,
  ): void {
    const shown = new Set(visible)
    for (const index of shown) {
      const node = nodes.get(index)
      if (!node) continue
      promoteStartupDisc(node)
      if (node.artwork === 'shown' || node.artwork === 'dropped') continue
      if (node.image && readyImages.has(node.image)) showStartupImage(node)
      else releaseStartupImage(node)
    }
    if (upcoming !== null) {
      const node = nodes.get(upcoming)
      if (node) {
        promoteStartupDisc(node)
        showStartupImage(node)
        if (gather && node.artwork === 'idle') enqueueDecode(node)
      }
    }
    const earliest = shown.size ? Math.min(...shown) : Number.POSITIVE_INFINITY
    for (const [index, node] of nodes) {
      if (index >= earliest) continue
      node.slot.style.willChange = ''
      node.disc.style.willChange = ''
      node.vinyl?.remove()
      node.vinyl = undefined
      if (node.artwork !== 'shown') releaseStartupImage(node)
      else if (node.image) {
        node.image.remove()
        node.image.src = ''
        node.image = undefined
        node.artwork = 'dropped'
      }
    }
    if (gather) pumpDecode()
    else decodeQueue.length = 0
  }

  function ensureDiscChrome(node: DiscNode): void {
    if (node.waveRing) return
    const album = albums[cdAlbumIndex(node.index, albums.length)]
    const waveRing = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    waveRing.classList.add('cd-wave-ring')
    waveRing.setAttribute('viewBox', '-28 -28 456 456')
    waveRing.setAttribute('aria-hidden', 'true')
    const waveTrack = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    waveTrack.classList.add('cd-wave-track')
    waveTrack.setAttribute('pathLength', '1')
    waveTrack.setAttribute('stroke-dasharray', '1')
    waveTrack.setAttribute('stroke-dashoffset', '1')
    const waveProgress = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    waveProgress.classList.add('cd-wave-progress')
    waveProgress.setAttribute('pathLength', '1')
    waveProgress.setAttribute('stroke-dasharray', '1')
    waveProgress.setAttribute('stroke-dashoffset', '1')
    const waveSeed = cdPlaybackWaveSeed(album.key)
    const wavePath = cdPlaybackWavePath(waveSeed)
    waveTrack.setAttribute('d', wavePath)
    waveProgress.setAttribute('d', wavePath)
    waveRing.append(waveTrack, waveProgress)
    const sidewall = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    sidewall.classList.add('cd-sidewall')
    sidewall.setAttribute('viewBox', '0 0 400 400')
    sidewall.setAttribute('aria-hidden', 'true')
    const sidewallBands = ['#d9dddf', '#777e83', '#a4aaae'].map((color) => {
      const band = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      band.setAttribute('fill', color)
      sidewall.append(band)
      return band
    })
    node.hoverPlane.append(waveRing, sidewall)
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    shadow.classList.add('cd-disc-shadow')
    shadow.setAttribute('viewBox', '0 0 400 400')
    shadow.setAttribute('aria-hidden', 'true')
    shadow.style.opacity = '0'
    const shadowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    shadow.append(shadowPath)
    node.slot.append(shadow)
    node.waveRing = waveRing
    node.waveTrack = waveTrack
    node.sidewall = sidewall
    node.sidewallBands = sidewallBands
    node.shadow = shadow
    node.shadowPath = shadowPath
    node.waveProgress = waveProgress
    node.wavePaths = [waveTrack, waveProgress]
    node.waveSeed = waveSeed
  }

  function createDisc(index: number, startupDisc = false): DiscNode {
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
    const hub = document.createElement('div')
    hub.className = 'cd-hub'
    disc.append(art, hub)
    hoverPlane.append(disc)
    // The shadow stays beside the tilted plane and is added with the other chrome.
    slot.append(hoverPlane)
    stage.append(slot)
    const node: DiscNode = {
      index,
      albumKey: album.key,
      slot,
      disc,
      art,
      hoverPlane,
      waveSeed: cdPlaybackWaveSeed(album.key),
      artwork: 'idle',
      tilt: { x: 0, y: 0, targetX: 0, targetY: 0 },
    }
    if (album.artworkUrl) {
      const image = new Image()
      image.alt = ''
      image.decoding = 'async'
      image.draggable = false
      image.addEventListener(
        'error',
        () => {
          if (node.artwork === 'shown') image.remove()
          else if (node.artwork !== 'dropped') releaseStartupImage(node)
        },
        { once: true },
      )
      node.image = image
      if (!startupDisc) {
        image.src = album.artworkUrl
        art.append(image)
        node.artwork = 'shown'
      }
    }
    if (!startupDisc) ensureDiscChrome(node)
    nodes.set(index, node)
    discNodes.set(disc, node)
    return node
  }

  function renderDiscDepth(node: DiscNode, x: number, y: number, z: number, visible: number): void {
    if (!node.sidewall || !node.shadow || !node.shadowPath || !node.sidewallBands) return
    node.sidewall.style.opacity = String(visible)
    node.shadow.style.opacity = String(visible * 0.12)
    if (!visible) return
    const radians = Math.PI / 180
    const cx = Math.cos(x * radians),
      sx = Math.sin(x * radians)
    const cy = Math.cos(y * radians),
      sy = Math.sin(y * radians)
    const cz = Math.cos(z * radians),
      sz = Math.sin(z * radians)
    // Project an actual shallow cylinder with the same X -> Y -> Z -> perspective
    // transform as the face. Only camera-facing walls are drawn, never the far rim.
    const project = (angle: number, depth: number): string => {
      const px = Math.cos(angle) * 200
      const py = Math.sin(angle) * 200
      const ry = py * cx + depth * sx
      const rz = py * sx - depth * cx
      const rx = px * cy + rz * sy
      const zoom = 1100 / (1100 - (-px * sy + rz * cy))
      return `${(200 + (rx * cz - ry * sz) * zoom).toFixed(3)},${(200 + (rx * sz + ry * cz) * zoom).toFixed(3)}`
    }
    const depths = [0, 0.7, 3.4, 4.2]
    const paths = ['', '', '']
    const amplitude = Math.hypot(sy, sx * cy)
    // Cast the rotated rim onto a fixed plane behind all allowed disc poses.
    // A fixed upper-left light produces down-right rays; this is not a tilted
    // drop-shadow of the whole group (which would also shadow lyrics/the wave).
    const groundDepth = 240
    const groundZoom = 1100 / (1100 + groundDepth)
    const shadowPoints = Array.from({ length: 128 }, (_, index) => {
      const angle = (index / 128) * Math.PI * 2
      const px = Math.cos(angle) * 200
      const py = Math.sin(angle) * 200
      const rx = px * cy + py * sx * sy
      const ry = py * cx
      const depth = -px * sy + py * sx * cy
      const distance = groundDepth + depth
      const shadowX = 200 + (rx * cz - ry * sz + distance * 0.18) * groundZoom
      const shadowY = 200 + (rx * sz + ry * cz + distance * 0.25) * groundZoom
      return `${shadowX.toFixed(3)},${shadowY.toFixed(3)}`
    })
    node.shadowPath.setAttribute('d', `M${shadowPoints.join('L')}Z`)
    node.shadow.style.filter = `blur(${(9 + amplitude * 5).toFixed(2)}px)`
    if (amplitude > 200 / 1100) {
      const center = Math.atan2(sx * cy, -sy)
      const halfArc = Math.acos(200 / (1100 * amplitude))
      const angles = Array.from({ length: 65 }, (_, i) => center - halfArc + (i / 64) * halfArc * 2)
      for (let band = 0; band < paths.length; band++) {
        const front = angles.map((angle) => project(angle, depths[band]))
        const back = angles.map((angle) => project(angle, depths[band + 1])).reverse()
        paths[band] = `M${front.join('L')}L${back.join('L')}Z`
      }
    }
    node.sidewallBands.forEach((band, index) => band.setAttribute('d', paths[index]))
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
      ensureDiscChrome(node)
      const t = index - position
      const pose = cdPose(t, width, height)
      const central = index === selected
      node.slot.setAttribute('data-selected', String(central))
      if (central && focusProgress > 0) {
        pose.cx += (focusGeometry.cx - pose.cx) * focusProgress
        pose.cy += (focusGeometry.cy - pose.cy) * focusProgress
        pose.size += (focusGeometry.size - pose.size) * focusProgress
      }
      const edge = Math.max(0, Math.min(1, (t + 2.5) * 2, (1.5 - t) * 2))
      const fade = Math.min(1, focusProgress / 0.8)
      const centralOpacity = directFocusOpacity + (1 - directFocusOpacity) * (1 - focusProgress)
      node.slot.style.opacity = String(
        edge *
          edge *
          (3 - 2 * edge) *
          (central ? centralOpacity : 1 - fade * fade * (3 - 2 * fade)),
      )
      node.slot.style.transform = `translate3d(${pose.cx - pose.size / 2}px, ${pose.cy - pose.size / 2}px, 0) scale(${pose.size / 400})`
      node.slot.style.zIndex = String(central && focusProgress > 0 ? 5 : layer + 1)
      node.disc.style.pointerEvents =
        focusMoving || (focusProgress > 0 && !central) ? 'none' : 'auto'
      // The resting centre opens focus; a pending target during browsing remains a no-op.
      node.disc.style.cursor =
        central && focusProgress === 1
          ? rotationPointer
            ? 'grabbing'
            : 'grab'
          : focusProgress > 0 || (!focusOptions && index === (active?.target ?? selected))
            ? 'default'
            : 'pointer'
      const rotationBlend = central ? focusProgress : 0
      const rotationX = 9 + (focusRotation.x - 9) * rotationBlend
      const rotationY = pose.tilt + (focusRotation.y - pose.tilt) * rotationBlend
      const transform = `perspective(1100px) rotateZ(${pose.turn + angle}deg) rotateY(${rotationY + angle * 0.62}deg) rotateX(${rotationX + angle * 0.28}deg)`
      node.disc.style.transform = transform
      if (node.waveRing) node.waveRing.style.transform = transform
      renderDiscDepth(
        node,
        rotationX + angle * 0.28,
        rotationY + angle * 0.62,
        pose.turn + angle,
        rotationBlend,
      )
    })
    syncPlaybackRing()
  }

  function stop(): void {
    cancelArtworkClick()
    for (const node of nodes.values()) {
      node.cancelSpinAnimation?.()
      node.cancelSpinAnimation = undefined
    }
    endRotation()
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
      decodeQueue.length = 0
      readyImages.clear()
      for (const node of nodes.values()) {
        node.vinyl?.remove()
        node.vinyl = undefined
        node.slot.style.willChange = ''
        node.disc.style.willChange = ''
        if (node.artwork === 'idle' || node.artwork === 'decoding') releaseStartupImage(node)
      }
      onStartup?.(false)
    }
    cancelAnimation?.()
    cancelAnimation = null
    directFocusOpacity = 1
    active = null
    swayAngle = 0
    swayVelocity = 0
    resetHover()
    stopWaveAnimation()
    ringDrawElapsed = 0
    ringDrawSettled = false
  }

  function beginStartup(): void {
    startup = true
    onStartup?.(true)
    const generation = ++startupGeneration
    readyImages.clear()
    decodeQueue.length = 0
    decodesInFlight = 0
    const travel = albums.length >= 4 ? 9 : 0
    startupOrigin = travel ? -travel : 0
    const first = travel ? -travel - 2 : 0
    const last = travel ? 1 : Math.min(1, albums.length - 1)
    // Bounded pool: at most 13 nodes, only four visible. Covers, vinyl paint
    // and compositor layers are attached in appearance order before fade-in.
    for (let index = first; index <= last; index++) {
      const node = createDisc(index, true)
      node.slot.style.opacity = '0'
    }
    const initial = cdSlots(startupOrigin, albums.length)
    const opening = initial
      .map((index) => nodes.get(index))
      .filter((node): node is DiscNode => Boolean(node))
    for (const node of opening) {
      promoteStartupDisc(node)
    }
    const lead = initial.length ? Math.max(...initial) + 1 : null
    if (lead !== null && nodes.has(lead)) promoteStartupDisc(nodes.get(lead)!)
    let prepared = false
    const start = (): void => {
      if (prepared || generation !== startupGeneration) return
      prepared = true
      clearTimeout(preparationTimer)
      preparationTimer = undefined
      for (const node of opening) {
        if (node.artwork === 'shown' || node.artwork === 'dropped') continue
        if (node.image && readyImages.has(node.image)) showStartupImage(node)
        else releaseStartupImage(node)
      }
      for (let index = first; index <= last; index++) {
        if (initial.includes(index)) continue
        const node = nodes.get(index)
        if (node) decodeQueue.push(node)
      }
      pumpDecode()
      const pool = new Map(
        Array.from(nodes, ([index, node]) => [
          index,
          {
            slot: node.slot,
            disc: node.disc,
            get vinyl() {
              return node.vinyl!
            },
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
        ({ visible, upcoming, gather }) => {
          if (generation !== startupGeneration) return
          prepareStartupFrame(visible, upcoming, gather)
        },
      )
    }
    preparationTimer = setTimeout(start, 1200)
    const openingDecodes = opening.flatMap((node) => {
      const job = beginDecode(node)
      return job ? [job] : []
    })
    void Promise.all(openingDecodes).then(start)
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

  function focusAlbum(index: number): void {
    if (
      !focusOptions ||
      startup ||
      focusProgress > 0 ||
      focusMoving ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= albums.length
    )
      return

    stop()
    selected = index
    render(selected)
    onSelect(cdAlbumIndex(selected, albums.length))
    setFocused(true, 'fade')
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

  function endRotation(): void {
    const pressed = rotationPointer
    rotationPointer = null
    if (!pressed) return
    if (stage.hasPointerCapture(pressed.id)) stage.releasePointerCapture(pressed.id)
    const node = nodes.get(selected)
    if (node) node.disc.style.cursor = focusProgress === 1 ? 'grab' : 'default'
  }

  function cancelArtworkClick(): void {
    if (artworkClick) clearTimeout(artworkClick.timer)
    artworkClick = null
  }

  function setArtworkAngle(node: DiscNode, angle: number): void {
    artworkAngles.set(node.albumKey, angle)
    for (const item of nodes.values()) {
      if (item.albumKey === node.albumKey) item.art.style.transform = `rotate(${angle}deg)`
    }
  }

  function spinArtwork(node: DiscNode, upright = false): void {
    node.cancelSpinAnimation?.()
    node.cancelSpinAnimation = undefined
    const from = artworkAngles.get(node.albumKey) ?? 0
    const radians = Math.PI / 180
    const x = focusRotation.x * radians
    const y = focusRotation.y * radians
    const z = cdPose(0, width, height).turn * radians
    // The artwork's up vector is (sin(a), -cos(a)). Invert the projected
    // face's horizontal row so that vector points straight up on screen.
    // Perspective divides both coordinates by the same positive w, so it
    // does not change the direction of this line through the disc centre.
    const horizontalX = Math.cos(z) * Math.cos(y)
    const horizontalY = Math.cos(z) * Math.sin(y) * Math.sin(x) - Math.sin(z) * Math.cos(x)
    const uprightAngle = Math.atan2(horizontalY, horizontalX) / radians
    const delta = upright
      ? ((((uprightAngle - from + 180) % 360) + 360) % 360) - 180
      : 390 + Math.floor(Math.random() * 300)
    const to = from + delta
    const finish = (): void => {
      setArtworkAngle(node, ((to % 360) + 360) % 360)
      node.cancelSpinAnimation = undefined
    }
    if (reducedMotion.matches || Math.abs(delta) < 0.01) {
      finish()
      return
    }
    let elapsed = 0
    const duration = upright ? 0.55 : 1.45
    node.cancelSpinAnimation = animateFrames((seconds) => {
      elapsed += seconds
      const p = Math.min(1, elapsed / duration)
      // Start gently, then coast to the random resting angle without a transform jump.
      const eased = p * p * p * (10 + p * (-15 + 6 * p))
      setArtworkAngle(node, from + delta * eased)
      if (p < 1) return true
      finish()
      return false
    })
  }

  function clickArtwork(node: DiscNode, x: number, y: number): void {
    if (artworkClick?.node === node && Math.hypot(x - artworkClick.x, y - artworkClick.y) <= 8) {
      cancelArtworkClick()
      spinArtwork(node, true)
      return
    }
    cancelArtworkClick()
    artworkClick = {
      node,
      x,
      y,
      timer: setTimeout(() => {
        artworkClick = null
        if (focusProgress !== 1 || focusMoving || nodes.get(selected) !== node) return
        spinArtwork(node)
      }, 320),
    }
  }

  function cancelRotation(): void {
    cancelArtworkClick()
    endRotation()
  }

  stage.addEventListener(
    'pointermove',
    (event) => {
      if (rotationPointer?.id === event.pointerId) {
        if (!(event.buttons & 2)) {
          cancelRotation()
          return
        }
        if (!rotationPointer.moved) {
          if (
            Math.hypot(
              event.clientX - rotationPointer.startX,
              event.clientY - rotationPointer.startY,
            ) <= 6
          )
            return
          rotationPointer.moved = true
          cancelArtworkClick()
        }
        const dx = event.clientX - rotationPointer.x
        const dy = event.clientY - rotationPointer.y
        rotationPointer.x = event.clientX
        rotationPointer.y = event.clientY
        // Undo the disc's in-plane turn so dragging follows screen directions.
        const turn = (cdPose(0, width, height).turn * Math.PI) / 180
        const x = focusRotation.x - (dy * Math.cos(turn) - dx * Math.sin(turn)) * 0.25
        const y = focusRotation.y + (dx * Math.cos(turn) + dy * Math.sin(turn)) * 0.25
        const limit = Math.min(1, 75 / Math.max(1, Math.hypot(x, y)))
        focusRotation = { x: x * limit, y: y * limit }
        render(selected)
        event.preventDefault()
        return
      }
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
        focusProgress > 0 ||
        focusMoving ||
        startup ||
        reducedMotion.matches
      ) {
        resetHover()
        return
      }
      const node = nodeFromEvent(event)
      if (node !== hovered) resetHover()
      if (!node) return
      hovered = node
      const rect = node.slot.getBoundingClientRect()
      const clamp = (value: number): number => Math.max(-1, Math.min(1, value))
      const x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1)
      const y = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1)
      tilt(node, -y * 4, x * 4)
    },
    options,
  )
  stage.addEventListener('pointerleave', resetHover, options)
  stage.addEventListener(
    'dblclick',
    (event) => {
      const node = nodeFromEvent(event)
      if (
        event.button !== 0 ||
        focusProgress !== 1 ||
        focusMoving ||
        startup ||
        rotationPointer ||
        !node ||
        node.index !== selected
      )
        return
      event.preventDefault()
      if (focusOptions?.togglePlayback?.()) {
        node.cancelPressAnimation?.()
        node.cancelPressAnimation = animateCdPress(node.hoverPlane, reducedMotion.matches)
      }
    },
    options,
  )
  window.addEventListener('blur', resetHover, options)
  window.addEventListener('blur', cancelRotation, options)
  stage.addEventListener(
    'lostpointercapture',
    () => {
      if (rotationPointer) cancelRotation()
    },
    options,
  )
  stage.addEventListener(
    'contextmenu',
    (event) => {
      if (
        rotationContextMenu ||
        rotationPointer ||
        (focusProgress > 0 && nodeFromEvent(event)?.index === selected)
      ) {
        event.preventDefault()
        rotationContextMenu = false
      }
    },
    options,
  )
  stage.addEventListener(
    'pointerdown',
    (event) => {
      rotationContextMenu = false
      if (
        focusProgress === 1 &&
        !focusMoving &&
        !startup &&
        !rotationPointer &&
        event.isPrimary &&
        event.button === 2 &&
        nodeFromEvent(event)?.index === selected
      ) {
        event.preventDefault()
        rotationContextMenu = true
        stage.focus({ preventScroll: true })
        rotationPointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        }
        stage.setPointerCapture(event.pointerId)
        render(selected)
        return
      }
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
      if (rotationPointer?.id === event.pointerId) {
        const pressed = rotationPointer
        endRotation()
        const node = nodes.get(selected)
        if (
          event.button === 2 &&
          !pressed.moved &&
          node &&
          Math.hypot(event.clientX - pressed.startX, event.clientY - pressed.startY) <= 6 &&
          nodeAtPoint(event.clientX, event.clientY) === node
        ) {
          clickArtwork(node, event.clientX, event.clientY)
        } else cancelArtworkClick()
        return
      }
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
      cancelRotation()
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
        node.cancelPressAnimation?.()
        node.cancelPressAnimation = undefined
        node.cancelTiltAnimation?.()
        node.cancelTiltAnimation = undefined
        node.tilt = { x: 0, y: 0, targetX: 0, targetY: 0 }
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
    focusAlbum,
    setFocused,
    setPlayback(next: CdPlaybackRingState): void {
      playback = {
        ...next,
        progress: Math.max(0, Math.min(1, Number.isFinite(next.progress) ? next.progress : 0)),
      }
      syncPlaybackRing()
    },
    setAlbums(next: readonly CdAlbum[], intro = false, targetKey?: string): void {
      const key =
        targetKey ?? (albums.length ? albums[cdAlbumIndex(selected, albums.length)].key : null)
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
      focusRotation = { x: 9, y: -42 }
      pointer = null
      listeners.abort()
      observer.disconnect()
      for (const node of nodes.values()) removeNode(node)
      nodes.clear()
      albums = []
      artworkAngles.clear()
      stopWaveAnimation()
    },
  }
}
