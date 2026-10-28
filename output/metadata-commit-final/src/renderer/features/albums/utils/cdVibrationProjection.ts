/** Project travel along Rz * Ry * Rx's normal onto the already projected group.
 * The renderer flattens the face/ring and draws the sidewall in screen space;
 * one coherent group translation/zoom keeps these layers attached. Pose scale
 * is compensated so the normal travel is measured in screen CSS pixels.
 */
export function cdVibrationProjection(
  x: number,
  y: number,
  z: number,
  offset: number,
  poseScale: number,
) {
  const radians = Math.PI / 180
  const sx = Math.sin(x * radians),
    cx = Math.cos(x * radians)
  const sy = Math.sin(y * radians),
    cy = Math.cos(y * radians)
  const sz = Math.sin(z * radians),
    cz = Math.cos(z * radians)
  const nx = sy * cx * cz + sx * sz
  const ny = sy * cx * sz - sx * cz
  const nz = cy * cx
  const distance = offset / Math.max(0.01, poseScale)
  const zoom = 1100 / (1100 - nz * distance)
  return {
    x: 200 * (1 - zoom) + nx * distance * zoom,
    y: 200 * (1 - zoom) + ny * distance * zoom,
    zoom,
  }
}
