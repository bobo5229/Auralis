import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { animateFrames } from '@renderer/shared/animation/motion'
import { cdAlbumIndex, cdPose, cdSlots, cdProjectedDiscOutline } from './cdGeometry'
import { cdPlaybackWavePath } from './cdPlaybackWave'
import { playCdStartup } from './cdStartup'
import { CD_VIBRATION_MAX_PX } from './cdVibrationMotion'
import { cdVibrationProjection } from './cdVibrationProjection'

import {
  createCdStageResources,
  type CdAlbum,
  type CdStageNode as DiscNode,
} from './cdStageResources'
import { createCdStageInteractions } from './cdStageInteractions'
import { createCdStageMaterial } from './cdStageMaterial'

export type { CdAlbum } from './cdStageResources'

// Parameters from the user-approved standalone inertia demo.
const POSITION_STIFFNESS = 110
const SWAY_STIFFNESS = 100
const SWAY_DAMPING = 14.4
const INFO_DELAY_SECONDS = 0.4
const RAPID_INPUT_SECONDS = 0.25
const MAX_BROWSE_SPEED = 6
const KEYBOARD_BROWSE_SPEED = 3.5
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
    targetChange?: (focused: boolean) => void
    togglePlayback?: () => boolean
  },
) {
  const reducedMotion = createReducedMotionQuery()
  const listeners = new AbortController()
  const options = { signal: listeners.signal }
  let vibratingNode: DiscNode | undefined
  let vibrationOffset = 0
  function applyVibration(node: DiscNode): void {
    const p = cdVibrationProjection(
      node.rotation.x,
      node.rotation.y,
      node.rotation.z,
      vibrationOffset,
      node.poseScale,
    )
    node.slot.style.transform = `${node.positionTransform} translate3d(${p.x}px, ${p.y}px, 0) scale(${p.zoom})`
  }
  function clearVibration(): void {
    if (vibratingNode) vibratingNode.slot.style.transform = vibratingNode.positionTransform
    vibratingNode = undefined
    vibrationOffset = 0
  }
  let albums: readonly CdAlbum[] = []
  let selected = 0
  let position = 0
  let active: InertialMove | null = null
  let continuousDirection = 0
  let swayAngle = 0
  let swayVelocity = 0
  let cancelAnimation: (() => void) | null = null
  let rapid = false
  let startup = false
  let width = stage.clientWidth
  let height = stage.clientHeight
  let focusProgress = 0
  let focusTarget = 0
  let focusMoving = false
  let directFocusOpacity = 1
  let focusGeometry = { cx: 0, cy: 0, size: 0 }
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
  const material = createCdStageMaterial()
  let materialAppearance = { dark: false, vinyl: 0 }

  function syncDiscMaterial(): void {
    const node = focusProgress > 0 && !startup ? resources.get(selected) : undefined
    material.sync(
      node,
      node
        ? {
            ...node.rotation,
            angle: resources.getArtworkAngle(node),
            vinyl: materialAppearance.vinyl * focusProgress,
            dark: materialAppearance.dark,
            size: 392 * node.poseScale,
          }
        : undefined,
    )
  }

  const resources = createCdStageResources(
    stage,
    () => ({ width, height }),
    (node) => {
      material.releaseNode(node)
      interactions.releaseNode(node)
    },
    syncDiscMaterial,
  )
  const interactions = createCdStageInteractions(
    stage,
    resources,
    () => ({
      selected,
      navigating: active !== null,
      startup,
      focusProgress,
      focusMoving,
      canFocus: Boolean(focusOptions),
      count: albums.length,
      width,
      height,
      reducedMotion: reducedMotion.matches,
    }),
    {
      navigateStep,
      moveToPosition,
      startCruise,
      endCruise,
      setFocused,
      togglePlayback: () => focusOptions?.togglePlayback?.() ?? false,
      render: () => render(selected),
    },
  )

  function stopWaveAnimation(): void {
    cancelWaveAnimation?.()
    cancelWaveAnimation = null
    waveFrameElapsed = 0
  }

  function syncPlaybackRing(): void {
    const activeNode =
      playback.visible && focusProgress === 1 && !focusMoving ? resources.get(selected) : undefined
    for (const node of resources.values()) {
      if (!node.waveRing || !node.waveProgress || !node.waveTrack) continue
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
    // Decorative loops stop while hidden; the playback clock still supplies progress.
    if (document.hidden) {
      stopWaveAnimation()
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
      const node = resources.get(selected)
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
    interactions.clearKeyboardNavigation()
    clearVibration()
    cancelAnimation?.()
    interactions.cancelArtworkClick()
    interactions.endRotation()
    interactions.resetHover()
    stopWaveAnimation()
    ringDrawElapsed = 0
    ringDrawSettled = false
    interactions.cancelPressAndTilt()
    interactions.clearPointer()
    measureFocus()
    focusTarget = Number(open)
    focusOptions.targetChange?.(open)
    const from = focusProgress
    const finish = (): void => {
      focusProgress = focusTarget
      focusMoving = false
      directFocusOpacity = 1
      cancelAnimation = null
      render(selected)
      for (const node of resources.values()) {
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
      const node = resources.get(selected)
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
    for (const node of resources.values()) {
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
    const foregroundIndex = focusProgress > 0 ? selected : Math.floor(position + 0.5)
    resources.retain(slots)
    slots.forEach((index, layer) => {
      const node = resources.ensure(index, startup)
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
      node.poseScale = pose.size / 400
      node.positionTransform = `translate3d(${pose.cx - pose.size / 2}px, ${pose.cy - pose.size / 2}px, 0) scale(${node.poseScale})`
      node.slot.style.transform = node.positionTransform
      // Keep the visual centre above both neighbors, including while browsing is in flight.
      node.slot.style.zIndex = String(index === foregroundIndex ? 5 : layer + 1)
      node.disc.style.pointerEvents =
        focusMoving || (focusProgress > 0 && !central) ? 'none' : 'auto'
      // The resting centre opens focus; a pending target during browsing remains a no-op.
      node.disc.style.cursor =
        central && focusProgress === 1
          ? interactions.isRotating()
            ? 'grabbing'
            : 'grab'
          : focusProgress > 0 || (!focusOptions && index === (active?.target ?? selected))
            ? 'default'
            : 'pointer'
      const focusRotation = interactions.getFocusRotation()
      const rotationBlend = central ? focusProgress : 0
      const rotationX = 9 + (focusRotation.x - 9) * rotationBlend
      const rotationY = pose.tilt + (focusRotation.y - pose.tilt) * rotationBlend
      const transform = `perspective(1100px) rotateZ(${pose.turn + angle}deg) rotateY(${rotationY + angle * 0.62}deg) rotateX(${rotationX + angle * 0.28}deg)`
      node.rotation = {
        x: rotationX + angle * 0.28,
        y: rotationY + angle * 0.62,
        z: pose.turn + angle,
      }
      if (node === vibratingNode) applyVibration(node)
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
    syncDiscMaterial()
  }

  function stop(): void {
    material.sync(undefined)
    interactions.clearKeyboardNavigation()
    clearVibration()
    interactions.cancelArtworkClick()
    interactions.cancelSpins()
    interactions.endRotation()
    if (focusProgress || focusMoving) {
      focusProgress = focusTarget = 0
      focusMoving = false
      focusOptions?.targetChange?.(false)
      focusOptions?.change(0, true)
      for (const node of resources.values()) {
        node.slot.style.willChange = ''
        node.disc.style.willChange = ''
      }
    }
    if (rapid) {
      rapid = false
      onRapidBrowse?.(false)
    }
    resources.cancelPreparation()
    if (startup) {
      startup = false
      onStartup?.(false)
    }
    cancelAnimation?.()
    cancelAnimation = null
    directFocusOpacity = 1
    active = null
    swayAngle = 0
    swayVelocity = 0
    interactions.resetHover()
    stopWaveAnimation()
    ringDrawElapsed = 0
    ringDrawSettled = false
  }

  function beginStartup(): void {
    startup = true
    onStartup?.(true)
    resources.prepareStartup((preparation) => {
      if (!preparation.isCurrent()) return
      cancelAnimation = playCdStartup(
        preparation.pool,
        preparation.count,
        () => ({ width, height }),
        () => {
          if (!preparation.isCurrent()) return
          cancelAnimation = null
          stop()
          selected = 0
          render(selected)
          onSelect(selected)
        },
        ({ visible }) => {
          if (preparation.isCurrent()) resources.releasePassedStartupDiscs(visible)
        },
      )
    })
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
    if (continuousDirection) {
      // Cruise from the current pose; holding a key never queues distant albums.
      active.velocity +=
        (continuousDirection * KEYBOARD_BROWSE_SPEED - active.velocity) * Math.min(1, seconds * 8)
      active.position += active.velocity * seconds
      active.target = keyboardSnapTarget(active.position, active.velocity)
      if (albums.length < 4 && (active.position <= 0 || active.position >= albums.length - 1)) {
        active.position = active.target
        active.velocity = 0
        continuousDirection = 0
      }
    } else {
      const acceleration =
        (active.target - active.position) * POSITION_STIFFNESS -
        2 * active.dampingRatio * Math.sqrt(POSITION_STIFFNESS) * active.velocity
      active.velocity = Math.max(
        -MAX_BROWSE_SPEED,
        Math.min(MAX_BROWSE_SPEED, active.velocity + acceleration * seconds),
      )
      active.position += active.velocity * seconds
    }
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
      continuousDirection === 0 &&
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
    interactions.resetHover()
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

  function navigateStep(direction: number): void {
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

  function keyboardSnapTarget(currentPosition: number, velocity: number): number {
    const target = Math.round(currentPosition + velocity * 0.08)
    return albums.length < 4 ? Math.max(0, Math.min(albums.length - 1, target)) : target
  }

  function endCruise(snap: boolean): void {
    const wasContinuous = continuousDirection !== 0
    continuousDirection = 0
    if (!snap || !wasContinuous || !active) return
    active.target = keyboardSnapTarget(active.position, active.velocity)
    active.dampingRatio = dampingRatio(active.target, active.position, active.velocity)
    active.elapsed = 0
    active.infoTriggered = false
  }

  function startCruise(direction: number): void {
    const nextPosition = active?.position ?? selected
    const target = direction > 0 ? Math.floor(nextPosition) + 1 : Math.ceil(nextPosition) - 1
    if (albums.length < 4 && (target < 0 || target >= albums.length)) return
    moveToPosition(target)
    continuousDirection = direction
    if (!rapid) {
      rapid = true
      onRapidBrowse?.(true)
    }
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

  reducedMotion.addEventListener(
    'change',
    () => {
      const target = active?.target ?? selected
      const wasFocused = focusTarget === 1
      stop()
      interactions.cancelPressAndTilt()
      selected = target
      render(selected)
      if (albums.length) onSelect(cdAlbumIndex(selected, albums.length))
      if (wasFocused) setFocused(true)
    },
    options,
  )
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) interactions.stopKeyboardNavigation()
      syncPlaybackRing()
      syncDiscMaterial()
    },
    options,
  )
  const observer = new ResizeObserver(() => {
    width = stage.clientWidth
    height = stage.clientHeight
    if (focusProgress > 0 || focusMoving) measureFocus()
    interactions.resetHover()
    if (!active && !startup) render(selected)
  })
  observer.observe(stage)

  return {
    navigate: interactions.navigate,
    startKeyboardNavigation: interactions.startKeyboardNavigation,
    stopKeyboardNavigation: interactions.stopKeyboardNavigation,
    focusAlbum,
    setFocused,
    setMaterialAppearance(next: { dark: boolean; vinyl: number }): void {
      materialAppearance = {
        dark: next.dark,
        vinyl: Number.isFinite(next.vinyl) ? Math.max(0, Math.min(1, next.vinyl)) : 0,
      }
      syncDiscMaterial()
    },
    setVibrationOffset(offset: number): void {
      const node =
        focusProgress === 1 &&
        !focusMoving &&
        !startup &&
        !reducedMotion.matches &&
        !document.hidden
          ? resources.get(selected)
          : undefined
      if (vibratingNode !== node || !offset) clearVibration()
      if (!node || !Number.isFinite(offset) || !offset) return
      vibratingNode = node
      vibrationOffset = Math.max(-CD_VIBRATION_MAX_PX * 0.12, Math.min(CD_VIBRATION_MAX_PX, offset))
      applyVibration(node)
    },
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
      interactions.clearPointer()
      resources.replaceAlbums(next)
      albums = next
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
      material.dispose()
      interactions.dispose()
      listeners.abort()
      observer.disconnect()
      resources.dispose()
      albums = []
      stopWaveAnimation()
    },
  }
}
