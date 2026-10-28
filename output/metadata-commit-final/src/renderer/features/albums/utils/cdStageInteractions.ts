import { animateCdPress, animateFrames } from '@renderer/shared/animation/motion'
import { cdPose } from './cdGeometry'
import type { CdStageNode as DiscNode, CdStageResources } from './cdStageResources'

/** A fresh value snapshot, not a reference to writable controller state. */
export interface CdStageInteractionSnapshot {
  readonly selected: number
  readonly navigating: boolean
  readonly startup: boolean
  readonly focusProgress: number
  readonly focusMoving: boolean
  readonly canFocus: boolean
  readonly count: number
  readonly width: number
  readonly height: number
  readonly reducedMotion: boolean
}

export interface CdStageInteractionCommands {
  navigateStep(direction: number): void
  moveToPosition(index: number): void
  startCruise(direction: number): void
  endCruise(snap: boolean): void
  setFocused(open: boolean): void
  togglePlayback(): boolean
  render(): void
}

interface StagePointer {
  id: number
  x: number
  y: number
  moved: boolean
  node?: DiscNode
}

const neutralTilt = 'perspective(1100px) rotateX(0deg) rotateY(0deg)'
const KEYBOARD_HOLD_DELAY_MS = 350
const REDUCED_MOTION_REPEAT_MS = 180

interface NodeInteraction {
  tilt: { x: number; y: number; targetX: number; targetY: number }
  cancelTiltAnimation?: () => void
  cancelSpinAnimation?: () => void
  cancelPressAnimation?: () => void
}

export function createCdStageInteractions(
  stage: HTMLElement,
  resources: Pick<
    CdStageResources,
    'get' | 'values' | 'nodeFromTarget' | 'getArtworkAngle' | 'setArtworkAngle'
  >,
  snapshot: () => CdStageInteractionSnapshot,
  commands: CdStageInteractionCommands,
) {
  const listeners = new AbortController()
  const options = { signal: listeners.signal }
  const states = new Map<DiscNode, NodeInteraction>()
  function interaction(node: DiscNode): NodeInteraction {
    let state = states.get(node)
    if (!state) {
      state = { tilt: { x: 0, y: 0, targetX: 0, targetY: 0 } }
      states.set(node, state)
    }
    return state
  }
  let hovered: DiscNode | null = null
  let pointer: StagePointer | null = null
  let keyboardDirection = 0
  let keyboardHoldTimer: ReturnType<typeof setTimeout> | undefined
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
  function tilt(node: DiscNode, x: number, y: number): void {
    const state = interaction(node).tilt
    state.targetX = x
    state.targetY = y
    if (snapshot().reducedMotion) {
      interaction(node).cancelTiltAnimation?.()
      interaction(node).cancelTiltAnimation = undefined
      state.x = state.y = 0
      node.hoverPlane.style.transform = neutralTilt
      return
    }
    // Retarget the running follower instead of restarting a transition on every move.
    if (interaction(node).cancelTiltAnimation) return
    interaction(node).cancelTiltAnimation = animateFrames((seconds) => {
      const blend = 1 - Math.exp(-18 * seconds)
      state.x += (state.targetX - state.x) * blend
      state.y += (state.targetY - state.y) * blend
      const settled =
        Math.abs(state.targetX - state.x) < 0.005 && Math.abs(state.targetY - state.y) < 0.005
      if (settled) {
        state.x = state.targetX
        state.y = state.targetY
        interaction(node).cancelTiltAnimation = undefined
      }
      node.hoverPlane.style.transform = `perspective(1100px) rotateX(${state.x}deg) rotateY(${state.y}deg)`
      return !settled
    })
  }

  function resetHover(): void {
    if (hovered) tilt(hovered, 0, 0)
    hovered = null
  }

  function clearKeyboardNavigation(): void {
    clearTimeout(keyboardHoldTimer)
    keyboardHoldTimer = undefined
    keyboardDirection = 0
    commands.endCruise(false)
  }

  function stopKeyboardNavigation(direction?: number): void {
    if (direction !== undefined && direction !== keyboardDirection) return
    clearTimeout(keyboardHoldTimer)
    keyboardHoldTimer = undefined
    keyboardDirection = 0
    commands.endCruise(true)
  }

  function continueKeyboardNavigation(): void {
    keyboardHoldTimer = undefined
    const state = snapshot()
    if (
      !keyboardDirection ||
      state.startup ||
      state.focusProgress > 0 ||
      state.focusMoving ||
      state.count < 2
    ) {
      stopKeyboardNavigation()
      return
    }
    if (state.reducedMotion) {
      // A reduced-motion step stops the stage; restore only the held direction.
      const direction = keyboardDirection
      commands.navigateStep(direction)
      keyboardDirection = direction
      keyboardHoldTimer = setTimeout(continueKeyboardNavigation, REDUCED_MOTION_REPEAT_MS)
      return
    }
    commands.startCruise(keyboardDirection)
  }

  function startKeyboardNavigation(direction: number): void {
    if (keyboardDirection === direction) return
    stopKeyboardNavigation()
    const state = snapshot()
    if (state.startup || state.focusProgress > 0 || state.focusMoving || state.count < 2) return
    commands.navigateStep(direction)
    keyboardDirection = direction
    keyboardHoldTimer = setTimeout(continueKeyboardNavigation, KEYBOARD_HOLD_DELAY_MS)
  }

  function navigate(direction: number): void {
    stopKeyboardNavigation()
    commands.navigateStep(direction)
  }

  function nodeFromTarget(target: EventTarget | null): DiscNode | undefined {
    return resources.nodeFromTarget(target)
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
    const node = resources.get(snapshot().selected)
    if (node) node.disc.style.cursor = snapshot().focusProgress === 1 ? 'grab' : 'default'
  }

  function cancelArtworkClick(): void {
    if (artworkClick) clearTimeout(artworkClick.timer)
    artworkClick = null
  }

  function spinArtwork(node: DiscNode, upright = false): void {
    interaction(node).cancelSpinAnimation?.()
    interaction(node).cancelSpinAnimation = undefined
    const from = resources.getArtworkAngle(node)
    const radians = Math.PI / 180
    const x = focusRotation.x * radians
    const y = focusRotation.y * radians
    const z = cdPose(0, snapshot().width, snapshot().height).turn * radians
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
      resources.setArtworkAngle(node, ((to % 360) + 360) % 360)
      interaction(node).cancelSpinAnimation = undefined
    }
    if (snapshot().reducedMotion || Math.abs(delta) < 0.01) {
      finish()
      return
    }
    let elapsed = 0
    const duration = upright ? 0.55 : 1.45
    interaction(node).cancelSpinAnimation = animateFrames((seconds) => {
      elapsed += seconds
      const p = Math.min(1, elapsed / duration)
      // Start gently, then coast to the random resting angle without a transform jump.
      const eased = p * p * p * (10 + p * (-15 + 6 * p))
      resources.setArtworkAngle(node, from + delta * eased)
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
        if (
          snapshot().focusProgress !== 1 ||
          snapshot().focusMoving ||
          resources.get(snapshot().selected) !== node
        )
          return
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
        const turn = (cdPose(0, snapshot().width, snapshot().height).turn * Math.PI) / 180
        const x = focusRotation.x - (dy * Math.cos(turn) - dx * Math.sin(turn)) * 0.25
        const y = focusRotation.y + (dx * Math.cos(turn) + dy * Math.sin(turn)) * 0.25
        const limit = Math.min(1, 75 / Math.max(1, Math.hypot(x, y)))
        focusRotation = { x: x * limit, y: y * limit }
        commands.render()
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
        snapshot().navigating ||
        snapshot().focusProgress > 0 ||
        snapshot().focusMoving ||
        snapshot().startup ||
        snapshot().reducedMotion
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
        snapshot().focusProgress !== 1 ||
        snapshot().focusMoving ||
        snapshot().startup ||
        rotationPointer ||
        !node ||
        node.index !== snapshot().selected
      )
        return
      event.preventDefault()
      if (commands.togglePlayback()) {
        interaction(node).cancelPressAnimation?.()
        interaction(node).cancelPressAnimation = animateCdPress(
          node.hoverPlane,
          snapshot().reducedMotion,
        )
      }
    },
    options,
  )
  window.addEventListener('blur', resetHover, options)
  window.addEventListener('blur', cancelRotation, options)
  window.addEventListener('blur', () => stopKeyboardNavigation(), options)
  window.addEventListener(
    'keyup',
    (event) => {
      if (event.key === 'ArrowLeft') stopKeyboardNavigation(-1)
      else if (event.key === 'ArrowRight') stopKeyboardNavigation(1)
    },
    options,
  )
  window.addEventListener('pointerdown', () => stopKeyboardNavigation(), {
    ...options,
    capture: true,
  })
  stage.addEventListener(
    'lostpointercapture',
    () => {
      if (rotationPointer) cancelRotation()
      pointer = null
    },
    options,
  )
  stage.addEventListener(
    'contextmenu',
    (event) => {
      if (
        rotationContextMenu ||
        rotationPointer ||
        (snapshot().focusProgress > 0 && nodeFromEvent(event)?.index === snapshot().selected)
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
        snapshot().focusProgress === 1 &&
        !snapshot().focusMoving &&
        !snapshot().startup &&
        !rotationPointer &&
        event.isPrimary &&
        event.button === 2 &&
        nodeFromEvent(event)?.index === snapshot().selected
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
        commands.render()
        return
      }
      if (
        snapshot().startup ||
        snapshot().focusMoving ||
        snapshot().focusProgress > 0 ||
        !event.isPrimary ||
        event.button !== 0
      )
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
        const node = resources.get(snapshot().selected)
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
      if (released !== pressed.node || resources.get(pressed.node.index) !== pressed.node) return
      if (
        !snapshot().navigating &&
        pressed.node.index === snapshot().selected &&
        snapshot().canFocus
      )
        commands.setFocused(true)
      else commands.moveToPosition(pressed.node.index)
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
  function cancelPressAndTilt(): void {
    for (const node of resources.values()) {
      const state = interaction(node)
      state.cancelPressAnimation?.()
      state.cancelPressAnimation = undefined
      state.cancelTiltAnimation?.()
      state.cancelTiltAnimation = undefined
      state.tilt = { x: 0, y: 0, targetX: 0, targetY: 0 }
      node.hoverPlane.style.transform = neutralTilt
    }
  }

  function cancelSpins(): void {
    for (const state of states.values()) {
      state.cancelSpinAnimation?.()
      state.cancelSpinAnimation = undefined
    }
  }

  function clearPointer(): void {
    const pressed = pointer
    pointer = null
    if (pressed && stage.hasPointerCapture(pressed.id)) stage.releasePointerCapture(pressed.id)
  }

  function releaseNode(node: DiscNode): void {
    if (pointer?.node === node) clearPointer()
    if (artworkClick?.node === node) cancelArtworkClick()
    if (rotationPointer && resources.get(snapshot().selected) === node) endRotation()
    if (hovered === node) hovered = null
    const state = states.get(node)
    state?.cancelPressAnimation?.()
    state?.cancelTiltAnimation?.()
    state?.cancelSpinAnimation?.()
    states.delete(node)
  }

  return {
    navigate,
    startKeyboardNavigation,
    stopKeyboardNavigation,
    clearKeyboardNavigation,
    cancelArtworkClick,
    endRotation,
    resetHover,
    cancelPressAndTilt,
    cancelSpins,
    clearPointer,
    releaseNode,
    getFocusRotation: (): Readonly<{ x: number; y: number }> => ({ ...focusRotation }),
    isRotating: (): boolean => rotationPointer !== null,
    dispose(): void {
      clearKeyboardNavigation()
      cancelRotation()
      clearPointer()
      listeners.abort()
      for (const node of states.keys()) releaseNode(node)
      hovered = null
      rotationContextMenu = false
      focusRotation = { x: 9, y: -42 }
    },
  }
}
