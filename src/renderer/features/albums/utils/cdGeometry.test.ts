import { describe, expect, it } from 'vitest'
import { cdAlbumIndex, cdPose, cdProjectedDiscOutline, cdSlots, type CdPoint } from './cdGeometry'

function cross(origin: CdPoint, first: CdPoint, second: CdPoint): number {
  return (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x)
}

function onSegment(start: CdPoint, end: CdPoint, point: CdPoint): boolean {
  return (
    point.x >= Math.min(start.x, end.x) - 0.001 &&
    point.x <= Math.max(start.x, end.x) + 0.001 &&
    point.y >= Math.min(start.y, end.y) - 0.001 &&
    point.y <= Math.max(start.y, end.y) + 0.001
  )
}

function segmentsIntersect(a: CdPoint, b: CdPoint, c: CdPoint, d: CdPoint): boolean {
  const first = cross(a, b, c)
  const second = cross(a, b, d)
  const third = cross(c, d, a)
  const fourth = cross(c, d, b)
  if (Math.sign(first) !== Math.sign(second) && Math.sign(third) !== Math.sign(fourth)) return true
  return (
    (Math.abs(first) < 0.001 && onSegment(a, b, c)) ||
    (Math.abs(second) < 0.001 && onSegment(a, b, d)) ||
    (Math.abs(third) < 0.001 && onSegment(c, d, a)) ||
    (Math.abs(fourth) < 0.001 && onSegment(c, d, b))
  )
}

function pointInOutline(point: CdPoint, outline: CdPoint[]): boolean {
  let inside = false
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
    const current = outline[index]
    const before = outline[previous]
    if (
      current.y > point.y !== before.y > point.y &&
      point.x <
        ((before.x - current.x) * (point.y - current.y)) / (before.y - current.y) + current.x
    )
      inside = !inside
  }
  return inside
}

function outlinesOverlap(first: CdPoint[], second: CdPoint[]): boolean {
  for (let index = 0; index < first.length; index++) {
    const next = (index + 1) % first.length
    for (let other = 0; other < second.length; other++) {
      if (
        segmentsIntersect(
          first[index],
          first[next],
          second[other],
          second[(other + 1) % second.length],
        )
      ) {
        return true
      }
    }
  }
  return pointInOutline(first[0], second) || pointInOutline(second[0], first)
}

function horizontalBounds(outline: CdPoint[]): { left: number; right: number } {
  return outline.reduce(
    (bounds, point) => ({
      left: Math.min(bounds.left, point.x),
      right: Math.max(bounds.right, point.x),
    }),
    { left: Infinity, right: -Infinity },
  )
}

function sampledOutlineGap(first: CdPoint[], second: CdPoint[]): number {
  return Math.min(
    ...first.map((point) =>
      Math.min(...second.map((other) => Math.hypot(point.x - other.x, point.y - other.y))),
    ),
  )
}

describe('CD album geometry', () => {
  it('never exposes more than four albums or duplicates a small catalog', () => {
    for (const count of [0, 1, 2, 3, 4, 5, 10000]) {
      for (let step = -240; step <= 240; step++) {
        const slots = cdSlots(step / 40, count)
        expect(slots.length).toBeLessThanOrEqual(Math.min(4, count))
        const indexes = slots.map((index) => cdAlbumIndex(index, count))
        expect(new Set(indexes).size).toBe(indexes.length)
        for (const index of indexes) {
          expect(index).toBeGreaterThanOrEqual(0)
          expect(index).toBeLessThan(count)
        }
      }
    }
  })

  it('places two discs below-left and one above-right of the selected disc', () => {
    expect(cdSlots(0, 10)).toEqual([-2, -1, 0, 1])
    const poses = [-2, -1, 0, 1].map((t) => cdPose(t))
    for (let index = 1; index < poses.length; index++) {
      expect(poses[index].x).toBeGreaterThan(poses[index - 1].x)
      expect(poses[index].y).toBeLessThan(poses[index - 1].y)
      expect(poses[index].size).toBeGreaterThan(poses[index - 1].size)
    }
  })

  it('balances center disc anchor and scale across wide and compact viewports', () => {
    const viewports = [
      { width: 1400, height: 700 },
      { width: 1920, height: 950 },
      { width: 1600, height: 480 },
      { width: 1000, height: 700 },
    ]

    for (const { width, height } of viewports) {
      const center = cdPose(0, width, height)
      // 主盘横纵位置均向中心收拢，同时保留偏右、偏下的构图。
      expect(center.x / width).toBeCloseTo(0.52, 6)
      expect(center.y / height).toBeCloseTo(0.56, 6)
      expect(center.x / width).toBeGreaterThan(0.5)
      expect(center.y / height).toBeGreaterThan(0.5)

      // 尺寸受可用高度与宽度双重约束
      expect(center.size).toBeLessThanOrEqual(height * 0.66 + 1)
      expect(center.size).toBeLessThanOrEqual(width * 0.418 + 1)

      // 透视可见高度系数约为 0.9113，中心盘可见高度在内容区高度的 50%–60% 目标区间
      const approxVisHeight = center.size * 0.9113
      expect(approxVisHeight / height).toBeLessThanOrEqual(0.61)

      // 紧邻左下盘的下沉与底留白安全距离
      const neighbor = cdPose(-1, width, height)
      const neighborBottom = neighbor.y + (neighbor.size / 2) * 0.9113
      const bottomGap = height - neighborBottom
      expect(bottomGap).toBeGreaterThanOrEqual(25)
    }
  })

  it('uses the intended centre and right anchors while matching first derivatives at the join', () => {
    const width = 1400
    const height = 700
    const base = Math.min(height * 0.6, width * 0.38)
    const center = cdPose(0, width, height)
    const right = cdPose(1, width, height)
    expect(center.cx).toBeCloseTo(0.52 * width, 6)
    expect(center.cy).toBeCloseTo(0.56 * height, 6)
    expect(center).toMatchObject({
      size: base * 1.1,
      tilt: -42,
      turn: 24,
    })
    expect(right.cx).toBeCloseTo(0.52 * width + 1.04 * base, 6)
    expect(right.cy).toBeCloseTo(0.56 * height - 0.39 * base, 6)
    expect(right.size).toBeCloseTo(base * 1.2 * 1.04, 6)
    expect(right).toMatchObject({
      tilt: -39,
      turn: 22,
    })
    for (const [slot, horizontalOffset, verticalOffset] of [
      [-1, -0.76 * base, 0.168 * base],
      [-2, -1.46 * base, 0.23 * base],
    ]) {
      const neighbor = cdPose(slot, width, height)
      expect(neighbor.cx).toBeCloseTo(0.535 * width + horizontalOffset, 6)
      expect(neighbor.cy).toBeCloseTo(0.595 * height + verticalOffset, 6)
    }

    const step = 0.0001
    const before = cdPose(-step, width, height)
    const after = cdPose(step, width, height)
    for (const key of ['x', 'y', 'size', 'tilt'] as const) {
      const leftSlope = (center[key] - before[key]) / step
      const rightSlope = (after[key] - center[key]) / step
      expect(Math.abs(leftSlope - rightSlope)).toBeLessThan(
        Math.max(0.01, Math.abs(rightSlope) * 0.002),
      )
    }
  })

  it('keeps the full trajectory connected with actual projected contours', () => {
    const viewports = [
      { width: 1400, height: 700 },
      { width: 1920, height: 950 },
      { width: 1600, height: 480 },
      { width: 1280, height: 720 },
      { width: 1000, height: 700 },
      { width: 900, height: 620 },
    ]

    for (const { width, height } of viewports) {
      // 1. 轨迹水平与尺寸持续向右上展开，无反向折点。
      let prevX = -Infinity
      let previousSize = -Infinity
      for (let step = -250; step <= 150; step++) {
        const t = step / 100
        const p = cdPose(t, width, height)
        expect(p.x).toBeGreaterThan(prevX)
        expect(p.size).toBeGreaterThan(previousSize)
        prevX = p.x
        previousSize = p.size
      }

      // 2. 相邻盘面用实际 CSS 变换后的轮廓采样验证相交，而不是比较估算半宽。
      const pNeg2 = cdPose(-2, width, height)
      const pNeg1 = cdPose(-1, width, height)
      const p0 = cdPose(0, width, height)
      expect(outlinesOverlap(cdProjectedDiscOutline(pNeg2), cdProjectedDiscOutline(pNeg1))).toBe(
        true,
      )
      expect(outlinesOverlap(cdProjectedDiscOutline(pNeg1), cdProjectedDiscOutline(p0))).toBe(true)
      const base = Math.min(height * 0.6, width * 0.38)
      const right = cdPose(1, width, height)
      const centerOutline = cdProjectedDiscOutline(p0)
      const rightOutline = cdProjectedDiscOutline(right)
      const previousRight = {
        ...right,
        cx: 0.535 * width + 0.92 * base + 0.035 * width,
        cy: 0.595 * height - 0.42 * base,
        size: base * 1.2,
      }
      const previousOutline = cdProjectedDiscOutline(previousRight)
      expect(outlinesOverlap(centerOutline, rightOutline)).toBe(false)
      const gap = sampledOutlineGap(centerOutline, rightOutline)
      expect(gap).toBeGreaterThan(base * 0.02)
      expect(gap).toBeLessThan(base * 0.06)
      expect(sampledOutlineGap(centerOutline, rightOutline)).toBeLessThan(
        sampledOutlineGap(centerOutline, previousOutline),
      )
    }
  })

  it('lets the far-left contour leave a representative normal viewport without overextending', () => {
    const farLeft = horizontalBounds(cdProjectedDiscOutline(cdPose(-2, 1400, 700)))
    const projectedWidth = farLeft.right - farLeft.left
    expect(farLeft.left).toBeLessThan(0)
    expect(-farLeft.left / projectedWidth).toBeGreaterThanOrEqual(0.03)
    expect(-farLeft.left / projectedWidth).toBeLessThanOrEqual(0.24)
  })

  it('keeps frontal left discs visually smaller by projected area', () => {
    const area = (outline: CdPoint[]): number =>
      Math.abs(
        outline.reduce((sum, point, index) => {
          const next = outline[(index + 1) % outline.length]
          return sum + point.x * next.y - next.x * point.y
        }, 0),
      ) / 2

    const [far, near, center] = [-2, -1, 0].map((t) =>
      area(cdProjectedDiscOutline(cdPose(t, 1400, 700))),
    )
    expect(near).toBeLessThan(center * 0.65)
    expect(far).toBeLessThan(near)
  })
})
