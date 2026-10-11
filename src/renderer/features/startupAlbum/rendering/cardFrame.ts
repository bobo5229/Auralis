import type { CardAppearance } from './cardAppearance'
import { cardLayout } from './cardLayout'
import { tone } from './backgrounds/palette'

// Printed rules live in the artwork texture, so the static card and fragments
// inherit the same details without extra geometry or an animation layer.
function metal(c: CanvasRenderingContext2D, appearance: CardAppearance) {
  const gradient = c.createLinearGradient(0, 0, cardLayout.width, cardLayout.height)
  for (const [stop, color] of [
    [0, '#f0e4d2'],
    [0.24, '#7792ac'],
    [0.48, '#eef5fc'],
    [0.72, '#7b889d'],
    [1, '#e9d9bd'],
  ] as const)
    gradient.addColorStop(stop, tone(appearance.palette, color))
  return gradient
}

function diamond(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
  c.moveTo(x, y - size)
  c.lineTo(x + size, y)
  c.lineTo(x, y + size)
  c.lineTo(x - size, y)
  c.closePath()
}

export function drawCardFrame(c: CanvasRenderingContext2D, appearance: CardAppearance) {
  const { width, height, frame } = cardLayout
  c.save()
  c.lineJoin = 'round'
  // A dark keyline beneath the metal retains the edge on pale paper backgrounds.
  c.beginPath()
  c.roundRect(
    frame.outerInset,
    frame.outerInset,
    width - frame.outerInset * 2,
    height - frame.outerInset * 2,
    16,
  )
  c.strokeStyle = tone(appearance.palette, '#0a142b80', 'shadow')
  c.lineWidth = 4
  c.stroke()
  c.strokeStyle = metal(c, appearance)
  c.lineWidth = 1.8
  c.stroke()

  const inset = frame.innerInset
  c.beginPath()
  // Breaks at the artwork's upper/lower edge connect the perimeter to its frame.
  for (const x of [inset, width - inset]) {
    c.moveTo(x, 78)
    c.lineTo(x, cardLayout.cover.y - 26)
    c.moveTo(x, cardLayout.cover.y + 24)
    c.lineTo(x, cardLayout.cover.y + cardLayout.cover.size - 24)
    c.moveTo(x, cardLayout.cover.y + cardLayout.cover.size + 26)
    c.lineTo(x, height - 78)
  }
  // Stepped corner engravings, kept inside the physical rounded card edge.
  for (const [x, sx] of [
    [inset, 1],
    [width - inset, -1],
  ] as const)
    for (const [y, sy] of [
      [inset, 1],
      [height - inset, -1],
    ] as const) {
      c.moveTo(x, y + sy * 34)
      c.lineTo(x, y + sy * 10)
      c.lineTo(x + sx * 10, y)
      c.lineTo(x + sx * 34, y)
      c.moveTo(x + sx * 7, y + sy * 25)
      c.lineTo(x + sx * 7, y + sy * 13)
      c.lineTo(x + sx * 13, y + sy * 7)
      c.lineTo(x + sx * 25, y + sy * 7)
    }
  c.lineWidth = 1.1
  c.globalAlpha = 0.8
  c.stroke()

  // Fine rules and small open lozenges give the title/footer a shared axis.
  c.beginPath()
  for (const y of [55, height - 62]) {
    c.moveTo(60, y)
    c.lineTo(324, y)
    c.moveTo(396, y)
    c.lineTo(width - 60, y)
    diamond(c, width / 2, y, 6)
    diamond(c, width / 2 - 19, y, 2.5)
    diamond(c, width / 2 + 19, y, 2.5)
  }
  c.stroke()
  c.restore()
}

export function drawCoverFrame(c: CanvasRenderingContext2D, appearance: CardAppearance) {
  const { x, y, size } = cardLayout.cover
  const inset = cardLayout.frame.coverInset
  c.save()
  c.strokeStyle = tone(appearance.palette, '#08122699', 'shadow')
  c.lineWidth = 3
  c.strokeRect(x - 1.5, y - 1.5, size + 3, size + 3)
  c.strokeStyle = metal(c, appearance)
  c.lineWidth = 1.4
  c.strokeRect(x - 2, y - 2, size + 4, size + 4)
  c.globalAlpha = 0.75
  c.lineWidth = 1
  c.strokeRect(x - inset, y - inset, size + inset * 2, size + inset * 2)
  c.globalAlpha = 1
  c.lineWidth = 2.4
  c.beginPath()
  for (const [cx, sx] of [
    [x - inset, 1],
    [x + size + inset, -1],
  ] as const)
    for (const [cy, sy] of [
      [y - inset, 1],
      [y + size + inset, -1],
    ] as const) {
      c.moveTo(cx, cy + sy * 23)
      c.lineTo(cx, cy)
      c.lineTo(cx + sx * 23, cy)
      // A small connecting notch meets the broken inner perimeter.
      c.moveTo(cx - sx * 6, cy - sy * 9)
      c.lineTo(cx, cy - sy * 3)
    }
  c.stroke()
  c.restore()
}
