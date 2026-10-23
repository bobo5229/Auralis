export interface AlbumFocusRect {
  left: number
  top: number
  width: number
  height: number
}

export const ALBUM_FOCUS_POSE = { tiltX: -12, tiltY: 22, perspective: 900 } as const
export const ALBUM_CASE_OPEN_ANGLE = -160

export interface AlbumFocusProjection {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

/** Project the case and hinged lid using the slot's 50% 45% camera origin. */
export function albumFocusProjection(
  size: number,
  slotHeight: number,
  lidAngle = 0,
): AlbumFocusProjection {
  const { tiltX, tiltY, perspective } = ALBUM_FOCUS_POSE
  const x = (tiltX * Math.PI) / 180
  const y = (tiltY * Math.PI) / 180
  const cameraY = slotHeight * 0.45 - size / 2
  const shell = [-size / 2, size / 2].flatMap((px) =>
    [-size / 2, size / 2].flatMap((py) => [-7, 7].map((pz) => ({ px, py, pz }))),
  )
  const hinge = (lidAngle * Math.PI) / 180
  const lid = [0, size].flatMap((distance) =>
    [-size / 2, size / 2].flatMap((py) =>
      [-1, 1].map((depth) => ({
        px: -size / 2 + distance * Math.cos(hinge) + depth * Math.sin(hinge),
        py,
        pz: 6 - distance * Math.sin(hinge) + depth * Math.cos(hinge),
      })),
    ),
  )
  const points = [...shell, ...lid].map(({ px, py, pz }) => {
    const rx = px * Math.cos(y) + pz * Math.sin(y)
    const rz = -px * Math.sin(y) + pz * Math.cos(y)
    const ry = py * Math.cos(x) - rz * Math.sin(x)
    const depth = py * Math.sin(x) + rz * Math.cos(x)
    const factor = perspective / (perspective - depth)
    return { x: rx * factor, y: (ry - cameraY) * factor + cameraY }
  })
  const left = Math.min(...points.map((point) => point.x))
  const right = Math.max(...points.map((point) => point.x))
  const top = Math.min(...points.map((point) => point.y))
  const bottom = Math.max(...points.map((point) => point.y))
  return {
    width: right - left,
    height: bottom - top,
    offsetX: (left + right) / 2,
    offsetY: (top + bottom) / 2,
  }
}

export function albumFocusLayout(
  source: AlbumFocusRect,
  albumSize: number,
  content: AlbumFocusRect,
  bottomInset: number,
  projection?: AlbumFocusProjection,
  envelope?: AlbumFocusProjection,
) {
  const height = Math.max(1, content.height - bottomInset)
  const size = Math.max(1, Math.min(440, content.width - 64, height - 64))
  let scale = size / (projection ? Math.max(projection.width, projection.height) : albumSize)
  if (projection && envelope) {
    const halfWidth = Math.max(1, content.width / 2 - 32)
    const halfHeight = Math.max(1, height / 2 - 32)
    scale = Math.min(
      scale,
      halfWidth / (envelope.width / 2 + Math.abs(envelope.offsetX - projection.offsetX)),
      halfHeight / (envelope.height / 2 + Math.abs(envelope.offsetY - projection.offsetY)),
    )
  }
  return {
    x:
      content.left +
      content.width / 2 -
      (source.left + source.width / 2) -
      (projection?.offsetX ?? 0) * scale,
    y: content.top + height / 2 - (source.top + albumSize / 2) - (projection?.offsetY ?? 0) * scale,
    scale,
  }
}
