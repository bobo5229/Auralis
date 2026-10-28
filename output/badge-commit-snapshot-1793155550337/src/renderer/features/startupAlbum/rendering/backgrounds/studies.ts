import { tone, ribbonColor, type BackgroundPalette } from './palette'
import { spline, type Point } from './vendor/spline'
import { orientPattern, type BackgroundVariation } from './variation'
import { composePattern } from './composition'

type Context = CanvasRenderingContext2D
const surface = (p: BackgroundPalette, template: string) => tone(p, template, 'bright-surface')

function base(c: Context, p: BackgroundPalette, top: string, bottom: string) {
  const fill = c.createLinearGradient(0, 0, 720, 1032)
  fill.addColorStop(0, surface(p, top))
  fill.addColorStop(1, surface(p, bottom))
  c.fillStyle = fill
  c.fillRect(0, 0, 720, 1032)
}

// Large cropped sheets, rather than a repeated wave pattern. Each boundary
// shares a broad flow, with different curvature and a narrow recessed shadow.
export function paper(c: Context, p: BackgroundPalette, variation: BackgroundVariation) {
  const v = variation.paper
  base(c, p, '#526979', '#14283d')
  composePattern(c, (c) => {
    orientPattern(c, v.flipX, v.flipY)
    for (let layer = 0; layer < 7; layer++) {
      const points: Point[] = []
      for (let step = 0; step <= 10; step++) {
        const x = -100 + step * 92
        const y =
          v.origin +
          layer * v.spacing +
          Math.sin(x / v.frequency + v.phase + layer * v.layerPhase) * v.amplitude +
          Math.cos(x / 125 + 0.6 + v.phase) * v.detail +
          x * v.slope
        points.push([x, y])
      }
      const boundary = spline(points)
      const sheet = new Path2D(`${boundary}L820,1190L-100,1190Z`)
      const fill = c.createLinearGradient(
        120,
        v.origin + layer * v.spacing * 0.83,
        580,
        1000 + layer * 45,
      )
      fill.addColorStop(
        0,
        surface(
          p,
          ['#93adbc', '#718c9f', '#586f89', '#465d78', '#384964', '#2b3b54', '#1b2b40'][layer],
        ),
      )
      fill.addColorStop(1, surface(p, '#142238'))
      c.shadowColor = tone(p, '#030a173d', 'shadow')
      c.shadowBlur = 7
      c.shadowOffsetY = -3
      c.fillStyle = fill
      c.fill(sheet)
      c.shadowBlur = c.shadowOffsetY = 0
      c.strokeStyle = surface(p, '#d8e9f344')
      c.lineWidth = 1.7
      c.stroke(new Path2D(boundary))
      c.save()
      c.strokeStyle = tone(p, '#152d484d', 'shadow')
      c.lineWidth = 0.65
      for (let seam = 1; seam <= 3; seam++) {
        c.translate(0, -5)
        c.stroke(new Path2D(boundary))
      }
      c.restore()
    }
    // A cropped stack of narrow cut edges remains visible above the title.
    c.lineWidth = 0.9
    c.strokeStyle = tone(p, '#10243a55', 'shadow')
    for (let cut = 0; cut < 9; cut++) {
      const y = 9 + cut * 7 + (v.origin - 275) * 0.12
      c.beginPath()
      c.moveTo(-40, y + 28)
      c.bezierCurveTo(120, y - 70, 340, y + v.amplitude * 0.22, 760, y - 18)
      c.stroke()
    }
  })
}

// Nested elevation silhouettes: one asymmetric landform, not a tiled contour
// texture. This is a local radial construction, not a copy of D3's algorithm.
export function terrain(c: Context, p: BackgroundPalette, variation: BackgroundVariation) {
  const v = variation.terrain
  base(c, p, '#243b51', '#0b172a')
  composePattern(c, (c) => {
    const levels = ['#324b63', '#466078', '#5a7186', '#6d8294', '#8397a5', '#9babb6', '#b4bec5']
    for (let layer = 0; layer < levels.length; layer++) {
      const radius = v.radius - layer * v.spacing
      const points: Point[] = []
      for (let i = 0; i < 64; i++) {
        const a = (i * Math.PI * 2) / 64
        const relief =
          1 + Math.sin(a * 3 + v.phase) * v.relief + Math.cos(a * 5 - v.phase) * v.detail
        const angle = a + v.rotation
        points.push([
          v.x + Math.cos(angle) * radius * relief,
          v.y + Math.sin(angle) * radius * relief * v.stretch,
        ])
      }
      const path = new Path2D(`${spline(points, 1, true)}Z`)
      const fill = c.createLinearGradient(
        v.x - radius,
        v.y - radius * v.stretch,
        v.x + radius,
        v.y + radius * v.stretch,
      )
      fill.addColorStop(0, surface(p, '#17283f'))
      fill.addColorStop(0.62, surface(p, levels[layer]))
      fill.addColorStop(1, surface(p, '#465a78'))
      c.fillStyle = fill
      c.shadowColor = tone(p, '#020b1940', 'shadow')
      c.shadowBlur = 6
      c.shadowOffsetY = -3
      c.fill(path)
      c.shadowBlur = c.shadowOffsetY = 0
      c.strokeStyle = surface(p, '#ddebf344')
      c.lineWidth = 1.5
      c.stroke(path)
      // Fine intermediate elevations retain the landform's shared contour.
      c.lineWidth = 0.7
      c.strokeStyle = tone(p, '#0b223b55', 'shadow')
      for (let contour = 1; contour <= 4; contour++) {
        const ratio = (radius - (contour * v.spacing) / 5) / radius
        const detail = points.map(
          ([x, y]): Point => [v.x + (x - v.x) * ratio, v.y + (y - v.y) * ratio],
        )
        c.stroke(new Path2D(`${spline(detail, 1, true)}Z`))
      }
    }
    // Smaller elevations sit at the same corner as the large landform, so its
    // characteristic concentric relief survives the square cover's occlusion.
    c.lineWidth = 0.9
    c.strokeStyle = tone(p, '#0b223b66', 'shadow')
    for (let contour = 0; contour < 12; contour++) {
      const radius = 60 + contour * 13
      const points: Point[] = []
      for (let i = 0; i < 64; i++) {
        const a = (i * Math.PI * 2) / 64
        const relief =
          1 + Math.sin(a * 3 + v.phase) * v.relief + Math.cos(a * 5 - v.phase) * v.detail
        points.push([
          v.x + Math.cos(a + v.rotation) * radius * relief,
          v.y + Math.sin(a + v.rotation) * radius * relief * v.stretch,
        ])
      }
      c.stroke(new Path2D(`${spline(points, 1, true)}Z`))
    }
  })
}

// Deterministic smooth direction field integrated into static streamlines.
// Three bundles leave gaps between ribbons; geometry is independent of hue.
export function flow(c: Context, p: BackgroundPalette, variation: BackgroundVariation) {
  const v = variation.flow
  base(c, p, '#1b3048', '#0a1528')
  composePattern(c, (c) => {
    orientPattern(c, v.flipX, v.flipY)
    for (let bundle = 0; bundle < 3; bundle++) {
      for (let line = 0; line < 25; line++) {
        let x = -95
        // Put one ribbon at the upper edge and one at the lower edge, leaving
        // the third to cross behind the cover and reappear along its sides.
        let y = [v.origin * 0.15 - 90, v.origin, 1032 - v.spacing * 0.25][bundle] + line * v.lineGap
        const points: Point[] = [[x, y]]
        for (let step = 0; step < 135; step++) {
          const angle =
            v.bias +
            Math.sin(x / v.frequencyX + bundle * 0.5 + v.phaseX) * v.waveX +
            Math.cos(y / v.frequencyY + x / 390 + v.phaseY) * v.waveY
          x += Math.cos(angle) * 8
          y += Math.sin(angle) * 8
          if (step % 3 === 0) points.push([x, y])
        }
        const path = new Path2D(spline(points, 0.8))
        c.lineWidth = 2.1
        c.strokeStyle = ribbonColor(
          p,
          (line / 24 + bundle) / 3,
          0.16 + Math.sin((line / 24) * Math.PI) * 0.38,
          true,
        )
        c.stroke(path)
        if (line % 8 === 0) {
          c.strokeStyle = surface(p, '#e1eef566')
          c.lineWidth = 0.7
          c.stroke(path)
        }
      }
    }
  })
}
