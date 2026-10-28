import { tone, ribbonColor, type BackgroundPalette } from './palette'
import { paper, terrain, flow } from './studies'
import { createBackgroundVariation, orientPattern, type BackgroundVariation } from './variation'
import { composePattern } from './composition'

export const variants = [
  { id: 'glass', name: '折光空间', description: '透明棱面 · 斜向光源 · 冷暖折射' },
  { id: 'metal', name: '液态金属', description: '流动曲面 · 金属亮边 · 深色凹陷' },
  { id: 'tunnel', name: '光轨隧道', description: '层叠拱门 · 透视收束 · 空间纵深' },
  { id: 'aurora', name: '极光云幕', description: '柔和色云 · 弯曲飘带 · 漫射光' },
  { id: 'paper', name: '层叠纸雕', description: '错落纸层 · 柔和切边 · 曲面纵深' },
  { id: 'terrain', name: '地形浮雕', description: '偏心地貌 · 等高层级 · 雕刻亮边' },
  { id: 'flow', name: '丝带流场', description: '曲线汇聚 · 疏密留白 · 丝带流向' },
] as const

export type BackgroundId = (typeof variants)[number]['id']
export function randomBackground(random: () => number = Math.random): BackgroundId {
  return variants[
    Math.min(variants.length - 1, Math.max(0, Math.floor(random() * variants.length)))
  ].id
}
export const hasBrightSurface = (id: BackgroundId) =>
  id === 'paper' || id === 'terrain' || id === 'flow'
type Context = CanvasRenderingContext2D

function wash(c: Context, colors: [number, string][], x = 720, y = 1032) {
  const gradient = c.createLinearGradient(0, 0, x, y)
  colors.forEach(([at, color]) => gradient.addColorStop(at, color))
  c.fillStyle = gradient
  c.fillRect(0, 0, 720, 1032)
}

function glow(c: Context, x: number, y: number, radius: number, color: string) {
  const gradient = c.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, color)
  gradient.addColorStop(1, 'transparent')
  c.fillStyle = gradient
  c.fillRect(0, 0, 720, 1032)
}

function glass(c: Context, p: BackgroundPalette, variation: BackgroundVariation) {
  const v = variation.glass
  wash(c, [
    [0, tone(p, '#122b49')],
    [0.45, tone(p, '#232c4e')],
    [1, tone(p, '#0c1128')],
  ])
  composePattern(c, (c) => {
    orientPattern(c, v.flipX)
    glow(c, v.glowX, v.glowY, 580, tone(p, '#407589'))
    // Large, overlapping planes create a composition rather than a tiled motif.
    const planes = [
      {
        points: [
          [-90, 230],
          [400, -100],
          [850, 755],
          [465, 1140],
        ],
        colors: [tone(p, '#a2d6df88'), tone(p, '#5e5fb822')],
      },
      {
        points: [
          [-50, 695],
          [275, 520],
          [800, 885],
          [480, 1150],
        ],
        colors: [tone(p, '#898dd1aa'), tone(p, '#c4b6d322')],
      },
      {
        points: [
          [430, -60],
          [770, 80],
          [535, 1070],
          [230, 915],
        ],
        colors: [tone(p, '#72bac755'), tone(p, '#122d4b00')],
      },
      {
        points: [
          [-30, 920],
          [570, 625],
          [830, 1140],
        ],
        colors: [tone(p, '#eac4b58f'), tone(p, '#7c79b344')],
      },
    ]
    for (const [index, plane] of planes.entries()) {
      const { x: dx, y: dy, shear } = v.planes[index]
      const points = plane.points.map(([x, y]) => [x + dx + (y - 516) * (shear + v.tilt), y + dy])
      const { colors } = plane
      c.beginPath()
      points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
      c.closePath()
      const gradient = c.createLinearGradient(points[0][0], points[0][1], 660, 1032)
      gradient.addColorStop(0, colors[0])
      gradient.addColorStop(1, colors[1])
      c.fillStyle = gradient
      c.fill()
      c.strokeStyle = tone(p, '#d6f4ff55')
      c.lineWidth = 1.5
      c.stroke()
      // Parallel facet cuts become visible along the narrow cover/perimeter rail.
      c.lineWidth = 0.7
      c.strokeStyle = tone(p, '#e3f4ff66')
      for (let cut = 1; cut <= 3; cut++) {
        c.beginPath()
        points.forEach(([x, y], i) => {
          const px = x + cut * 9
          const py = y - cut * 6
          if (i) c.lineTo(px, py)
          else c.moveTo(px, py)
        })
        c.closePath()
        c.stroke()
      }
    }
    glow(c, 620, 960, 220, tone(p, '#b5dce83d'))
  })
}

function metal(c: Context, p: BackgroundPalette, variation: BackgroundVariation) {
  const v = variation.metal
  wash(c, [
    [0, tone(p, '#161f2e')],
    [0.5, tone(p, '#292b40')],
    [1, tone(p, '#101522')],
  ])
  composePattern(c, (c) => {
    orientPattern(c, v.flipX, v.flipY)
    glow(c, 80, 940, 470, tone(p, '#737a8c88'))
    const bands = [
      { y: 96, bend: -120, color: tone(p, '#a0b2bb') },
      { y: 1080, bend: -310, color: tone(p, '#a0b2bb') },
      { y: 900, bend: 130, color: tone(p, '#7b79a5') },
      { y: 755, bend: -150, color: tone(p, '#9bc4ca') },
    ]
    for (const band of bands) {
      const y = 900 + (band.y - 900) * v.spacing + v.offsetY
      const bend = band.bend * v.bend
      const width = 100 * v.width
      c.beginPath()
      c.moveTo(-150, y + 110)
      c.bezierCurveTo(130, y + bend, 435, y - bend, 850, y - 205)
      c.lineTo(850, y - 205 + width)
      c.bezierCurveTo(
        420,
        y - bend + width * 1.2,
        110,
        y + bend + width * 1.3,
        -150,
        y + 110 + width * 1.5,
      )
      c.closePath()
      const gradient = c.createLinearGradient(0, y - 160, 100, y + 200)
      gradient.addColorStop(0, tone(p, '#0d1426', 'shadow'))
      gradient.addColorStop(0.32, band.color)
      gradient.addColorStop(0.41, tone(p, '#d9e4e9'))
      gradient.addColorStop(0.48, tone(p, '#6f8196'))
      gradient.addColorStop(0.66, tone(p, '#242e45'))
      gradient.addColorStop(1, tone(p, '#111729', 'shadow'))
      c.fillStyle = gradient
      c.shadowColor = tone(p, '#050913', 'shadow')
      c.shadowBlur = 26
      c.shadowOffsetY = 12
      c.fill()
      c.shadowBlur = c.shadowOffsetY = 0
      c.strokeStyle = tone(p, '#d5eaff55')
      c.lineWidth = 2
      c.stroke()
      c.lineWidth = 0.7
      for (let ridge = 0; ridge < 7; ridge++) {
        const offset = (ridge * width) / 7
        c.beginPath()
        c.moveTo(-150, y + 110 + offset)
        c.bezierCurveTo(130, y + bend + offset, 435, y - bend + offset, 850, y - 205 + offset)
        c.strokeStyle = tone(
          p,
          ridge % 2 ? '#08132844' : '#e9f4ff66',
          ridge % 2 ? 'shadow' : 'surface',
        )
        c.stroke()
      }
    }
    glow(c, 680, 30, 400, tone(p, '#789cbb55'))
  })
}

function tunnel(c: Context, p: BackgroundPalette, variation: BackgroundVariation) {
  const v = variation.tunnel
  wash(c, [
    [0, tone(p, '#192d3e')],
    [0.5, tone(p, '#141b32')],
    [1, tone(p, '#080c1b')],
  ])
  composePattern(c, (c) => {
    glow(c, v.x, v.y, 640, tone(p, '#2b667b99'))
    // Offset nested portals recede to a single vanishing point.
    for (let i = 9; i >= 0; i--) {
      const scale = 0.21 + i * v.spacing
      c.save()
      c.translate(v.x, v.y)
      c.rotate(v.rotation)
      c.scale(scale * v.stretch, scale)
      c.beginPath()
      c.roundRect(-355, -510, 710, 1020, v.corner)
      c.strokeStyle = tone(p, '#06101c', 'shadow')
      c.lineWidth = 23 / scale
      c.stroke()
      const rim = c.createLinearGradient(-355, -510, 355, 510)
      rim.addColorStop(0, tone(p, '#bee8e9'))
      rim.addColorStop(0.35, tone(p, '#5278b0'))
      rim.addColorStop(0.65, tone(p, '#252b4a'))
      rim.addColorStop(1, tone(p, '#ac87ac'))
      c.strokeStyle = rim
      c.lineWidth = 7 / scale
      c.stroke()
      c.beginPath()
      c.roundRect(-343, -498, 686, 996, Math.max(20, v.corner - 12))
      c.strokeStyle = tone(p, '#e6f3ff88')
      c.lineWidth = 0.9 / scale
      c.stroke()
      c.restore()
    }
    glow(c, v.x, v.y, 240, tone(p, '#79c6d144'))
  })
}

function aurora(c: Context, p: BackgroundPalette, variation: BackgroundVariation) {
  const v = variation.aurora
  wash(c, [
    [0, tone(p, '#16283f')],
    [0.5, tone(p, '#272942')],
    [1, tone(p, '#10182e')],
  ])
  composePattern(c, (c) => {
    orientPattern(c, v.flipX, v.flipY)
    glow(c, 60 + v.cloudX, 780 + v.offsetY, 490, tone(p, '#6d68a9aa'))
    glow(c, 710 - v.cloudX, 820 + v.offsetY, 490, tone(p, '#387c8b99'))
    for (let i = 0; i < 28; i++) {
      const t = i / 27
      c.beginPath()
      c.moveTo(-160, 890 + v.offsetY + t * 230)
      c.bezierCurveTo(
        120,
        480 + v.offsetY + v.firstBend + t * 290,
        410,
        1300 + v.offsetY + v.secondBend - t * 400,
        850,
        390 + v.offsetY + t * 300,
      )
      c.strokeStyle = ribbonColor(p, t, 0.04 + Math.sin(t * Math.PI) * 0.1)
      c.lineWidth = (20 + Math.sin(t * Math.PI) * 38) * v.width
      c.shadowBlur = 28
      c.shadowColor = c.strokeStyle
      c.stroke()
      c.shadowBlur = 0
      c.strokeStyle = ribbonColor(p, t, 0.3)
      c.lineWidth = 0.85
      c.stroke()
    }
    c.shadowBlur = 0
    glow(c, 170, 970, 230, tone(p, '#e0aec244'))
    glow(c, 650, 680, 230, tone(p, '#a3e8e733'))
  })
}

export function drawBackground(c: Context, id: BackgroundId, p: BackgroundPalette, seed = 0) {
  c.save()
  ;({ glass, metal, tunnel, aurora, paper, terrain, flow })[id](
    c,
    p,
    createBackgroundVariation(seed),
  )
  c.restore()
}
