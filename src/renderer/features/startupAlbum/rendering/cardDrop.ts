import * as THREE from 'three'

export const CARD_DROP_DURATION_MS = 1200
const smooth = (t: number) => {
  const p = Math.max(0, Math.min(1, t))
  return p * p * (3 - 2 * p)
}

/** Uses the existing card and renderer; all coordinates at the boundary are CSS pixels. */
export function createCardDrop(
  renderer: THREE.WebGLRenderer,
  camera: THREE.OrthographicCamera,
  presentation: THREE.Group,
  card: THREE.Group,
  cardWidth: number,
  cardHeight: number,
  target: HTMLElement,
) {
  const canvas = renderer.domElement
  const source = canvas.getBoundingClientRect()
  const bar = target.getBoundingClientRect()
  if (
    !target.isConnected ||
    source.width <= 0 ||
    source.height <= 0 ||
    bar.width < 140 ||
    bar.height <= 0 ||
    bar.top < 100 ||
    bar.top >= innerHeight ||
    bar.right <= 0 ||
    bar.left >= innerWidth ||
    typeof target.animate !== 'function' ||
    getComputedStyle(target).visibility === 'hidden'
  )
    return null

  const originalStyle = canvas.style.cssText
  const originalCamera = [camera.left, camera.right, camera.top, camera.bottom]
  const autoClear = renderer.autoClear
  const units = (camera.top - camera.bottom) / source.height
  const horizontalUnits = (camera.right - camera.left) / source.width
  const position = card.getWorldPosition(new THREE.Vector3())
  const rotation = card.getWorldQuaternion(new THREE.Quaternion())
  const scale = card.getWorldScale(new THREE.Vector3())
  const identity = new THREE.Quaternion()
  const turn = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const width = innerWidth
  const height = innerHeight
  const endScale = (80 * units) / cardHeight
  const landingScale = new THREE.Vector3(endScale, endScale, endScale)
  const corners = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => new THREE.Vector3((sx * cardWidth) / 2, (sy * cardHeight) / 2, 0)),
  )
  const corner = new THREE.Vector3()
  const x = Math.max(bar.left + 48, Math.min(bar.right - 48, bar.left + bar.width / 2))
  const endX = camera.position.x + camera.left + (x - source.left) * horizontalUnits
  const edgeY = camera.position.y + camera.top - (bar.top - source.top) * units
  let impact: Animation | undefined
  let impacted = false
  let cleaned = false

  // Enlarge the existing viewport without changing any screen-space projection.
  camera.left -= source.left * horizontalUnits
  camera.right = camera.left + width * horizontalUnits
  camera.top += source.top * units
  camera.bottom = camera.top - height * units
  camera.updateProjectionMatrix()
  Object.assign(canvas.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
  })
  renderer.setDrawingBufferSize(width, height, Math.min(devicePixelRatio, 2))
  renderer.autoClear = false
  // Collapse the two transform groups into the exact current world pose.
  presentation.position.copy(position)
  presentation.quaternion.copy(rotation)
  presentation.scale.copy(scale)
  card.position.set(0, 0, 0)
  card.quaternion.identity()
  card.scale.setScalar(1)

  return {
    update(elapsed: number): boolean {
      const current = target.getBoundingClientRect()
      if (
        !target.isConnected ||
        current.width <= 0 ||
        current.height <= 0 ||
        innerWidth !== width ||
        innerHeight !== height ||
        Math.abs(current.left - bar.left) > 1 ||
        Math.abs(current.width - bar.width) > 1 ||
        Math.abs(current.height - bar.height) > 1 ||
        Math.abs(current.top - bar.top) > (impacted ? 4 : 1) ||
        getComputedStyle(target).visibility === 'hidden'
      )
        return false

      const flight = Math.max(0, Math.min(1, (elapsed - 150) / 800))
      const travel = smooth(flight)
      const insertion = smooth((elapsed - 950) / 250)
      const lift = 12 * units * smooth(elapsed / 150)
      presentation.position.set(
        THREE.MathUtils.lerp(position.x, endX, travel),
        THREE.MathUtils.lerp(position.y - lift, edgeY + 36 * units, flight * flight) -
          80 * units * Math.sin(flight * Math.PI) -
          76 * units * insertion,
        position.z,
      )
      presentation.scale.copy(scale).lerp(landingScale, travel)
      // Resolve the captured entrance/hover rotation gradually, without snapping at activation.
      presentation.quaternion.copy(rotation).slerp(identity, travel)
      euler.set(
        Math.PI * 2 * travel + THREE.MathUtils.degToRad(78) * insertion,
        0,
        THREE.MathUtils.degToRad(15) * Math.sin(flight * Math.PI),
      )
      turn.setFromEuler(euler)
      presentation.quaternion.premultiply(turn)
      presentation.updateMatrixWorld(true)

      // First contact uses actual transformed corners, including an interrupted entrance.
      let bottom = -Infinity
      for (const point of corners) {
        card.localToWorld(corner.copy(point)).project(camera)
        bottom = Math.max(bottom, ((1 - corner.y) * height) / 2)
      }
      if (!impacted && elapsed >= 800 && bottom >= current.top) {
        impacted = true
        impact = target.animate(
          [
            { transform: 'translateY(0)' },
            { transform: 'translateY(3px)', offset: 0.35 },
            { transform: 'translateY(0)' },
          ],
          { duration: 250, easing: 'cubic-bezier(.22,1,.36,1)', composite: 'add' },
        )
      }
      // Clear the whole transparent canvas first, then render only above the receiving edge.
      renderer.setScissorTest(false)
      renderer.clear()
      const edge = Math.max(0, Math.min(height, target.getBoundingClientRect().top))
      renderer.setScissor(0, height - edge, width, edge)
      renderer.setScissorTest(true)
      return true
    },
    dispose() {
      if (cleaned) return
      cleaned = true
      impact?.cancel()
      renderer.setScissorTest(false)
      renderer.autoClear = autoClear
      canvas.style.cssText = originalStyle
      ;[camera.left, camera.right, camera.top, camera.bottom] = originalCamera
      camera.updateProjectionMatrix()
    },
  }
}
