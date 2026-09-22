// Generated offline snapshot: cdGeometry.ts + shared/animation/motion.ts animateProgress.
;(() => {
  const DISC_BASE_SIZE = 400
  const DISC_RADIUS = DISC_BASE_SIZE / 2
  const DISC_PERSPECTIVE = 1100
  const DISC_X_TILT = 9
  const SIZE_LOG_RATE = Math.log(1.2)
  function cdPose(t, width, height) {
    const w = typeof width === 'number' && width > 10 ? width : 1400
    const h = typeof height === 'number' && height > 10 ? height : 700
    // 1. 基准尺寸：同时受可用高度与宽度约束，避免随宽度过度放大
    // 中心盘透视后的垂直可见高度约为 55% 内容区高度（透视垂直投影系数 ~0.9113）
    const baseD = Math.min(h * 0.6, w * 0.38)
    // Frontal left discs need smaller diameters to remain subordinate after
    // projection. Keep the value and first derivative unchanged at the centre.
    const leftSizeCurve = t < 0 ? 0.012 * t * t : 0
    const size = baseD * Math.exp(SIZE_LOG_RATE * t + leftSizeCurve)
    // The left discs face the viewer more directly to retain a real contour
    // overlap while their centres open towards the clipping edge. Its added curve
    // and first derivative are both zero at the centre anchor.
    const leftTiltCurve =
      t < 0 ? 63.5333333333 * t * t + 39.8 * t * t * t + 6.2666666667 * t * t * t * t : 0
    const tilt = -42 + 3 * t + leftTiltCurve
    const turn = 24 - 2 * t
    // 2. 中心盘盘心锚点（内容区宽度的 53.5%、高度的 59.5%）
    const cx0 = 0.535 * w
    const cy0 = 0.595 * h
    // 3. 水平位移 dx(t)：右段保持既有锚点。左段由 -1、-2 两个盘心锚点
    //    反解三次曲线，并让 t=0 的一阶速度与右段完全相同。
    let dx
    if (t < 0) {
      const spanRight = 0.88 * baseD + 0.035 * w
      // Match spacing to the smaller projected discs rather than stretching to
      // the viewport edge, which would disconnect the chain in wide windows.
      const nearOffset = 0.7 * baseD
      const farOffset = 1.46 * baseD
      const delta = spanRight - nearOffset
      const cubic = (farOffset - 2 * spanRight + 4 * delta) / 4
      const quadratic = delta + cubic
      // The extra term leaves -2, -1 and 0 untouched, but keeps the fading tail
      // moving rightward through t=-2.5 rather than folding back before recycling.
      const tailBasisSlope = -16.25 // d/dt [t²(t+1)(t+2)] at t=-2.5
      const tailSlope = spanRight * 0.15
      const tailAtEdge = spanRight - 5 * quadratic + 18.75 * cubic
      const tail = (tailSlope - tailAtEdge) / tailBasisSlope
      dx = spanRight * t + quadratic * t * t + cubic * t * t * t + tail * t * t * (t + 1) * (t + 2)
    } else {
      const spanRight = 0.88 * baseD + 0.035 * w
      dx = spanRight * t
    }
    // 4. 垂直位移 dy(t)：保留左下整数锚点的底留白，并与右段一阶相接。
    let dy
    if (t < 0) {
      const linear = -0.42 * baseD
      const nearRise = 0.168 * baseD
      const farRise = 0.23 * baseD
      const delta = nearRise + linear
      const cubic = (4 * nearRise + 2 * linear - farRise) / 4
      const quadratic = delta + cubic
      dy = linear * t + quadratic * t * t + cubic * t * t * t
    } else {
      dy = -0.42 * baseD * t
    }
    const cx = cx0 + dx
    const cy = cy0 + dy
    return {
      x: cx,
      y: cy,
      cx,
      cy,
      size,
      tilt,
      turn,
    }
  }
  /**
   * Samples the static outer contour after the same nested CSS transforms used by
   * the stage: 400px disc around its centre, rotateX → rotateY → rotateZ →
   * perspective(1100px), followed by the slot's outer scale.
   */
  function cdProjectedDiscOutline(pose, samples = 128) {
    const radians = Math.PI / 180
    const xTilt = DISC_X_TILT * radians
    const yTilt = pose.tilt * radians
    const zTurn = pose.turn * radians
    const scale = pose.size / DISC_BASE_SIZE
    const cosX = Math.cos(xTilt)
    const sinX = Math.sin(xTilt)
    const cosY = Math.cos(yTilt)
    const sinY = Math.sin(yTilt)
    const cosZ = Math.cos(zTurn)
    const sinZ = Math.sin(zTurn)
    return Array.from({ length: samples }, (_, index) => {
      const angle = (index / samples) * Math.PI * 2
      const sourceX = Math.cos(angle) * DISC_RADIUS
      const sourceY = Math.sin(angle) * DISC_RADIUS
      const afterX = sourceX
      const afterY = sourceY * cosX
      const afterZ = sourceY * sinX
      const turnedX = afterX * cosY + afterZ * sinY
      const turnedY = afterY
      const turnedZ = -afterX * sinY + afterZ * cosY
      const rotatedX = turnedX * cosZ - turnedY * sinZ
      const rotatedY = turnedX * sinZ + turnedY * cosZ
      const perspectiveScale = 1 / (1 - turnedZ / DISC_PERSPECTIVE)
      return {
        x: pose.cx + rotatedX * perspectiveScale * scale,
        y: pose.cy + rotatedY * perspectiveScale * scale,
      }
    })
  }
  function cdSlots(position, count) {
    const base = Math.floor(position + 0.5)
    return [base - 2, base - 1, base, base + 1].filter(
      (index) => count >= 4 || (index >= 0 && index < count),
    )
  }
  function cdAlbumIndex(index, count) {
    return ((index % count) + count) % count
  }
  function animateProgress(duration, update, complete) {
    const start = performance.now()
    let frame = 0
    let stopped = false
    const tick = (now) => {
      if (stopped) return
      const progress = Math.min(1, Math.max(0, (now - start) / duration))
      update(progress)
      if (stopped) return
      if (progress < 1) frame = requestAnimationFrame(tick)
      else complete()
    }
    frame = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
    }
  }

  window.CdFocusRuntime = { cdPose, cdSlots, cdProjectedDiscOutline, animateProgress }
})()
