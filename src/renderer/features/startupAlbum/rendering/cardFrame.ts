import type { CardAppearance } from './cardAppearance'
import { cardLayout } from './cardLayout'
import { tone } from './backgrounds/palette'

// Printed rules live in the artwork texture, so the static card and fragments
// inherit the same details without extra geometry or an animation layer.
function metal(c: CanvasRenderingContext2D, appearance: CardAppearance) {
  const gradient = c.createLinearGradient(0, 0, cardLayout.width, cardLayout.height)
  // Neutral templates follow one cover hue with only a faint silver tint.
  for (const [stop, color] of [
    [0, '#c4c4c4'],
    [0.46, '#e6e6e6'],
    [1, '#bcbcbc'],
  ] as const)
    gradient.addColorStop(stop, tone(appearance.palette, color))
  return gradient
}

function strokeMetal(c: CanvasRenderingContext2D, appearance: CardAppearance) {
  // A subtle underprint on the same path keeps the single rule legible on pale surfaces.
  c.strokeStyle = tone(appearance.palette, '#10101038', 'shadow')
  c.lineWidth = 2.2
  c.stroke()
  c.strokeStyle = metal(c, appearance)
  c.lineWidth = 1.4
  c.stroke()
}

export function drawCardFrame(c: CanvasRenderingContext2D, appearance: CardAppearance) {
  const { width, height, frame } = cardLayout
  c.save()
  c.lineJoin = 'round'
  c.lineCap = 'round'
  c.beginPath()
  c.roundRect(
    frame.outerInset,
    frame.outerInset,
    width - frame.outerInset * 2,
    height - frame.outerInset * 2,
    frame.radius,
  )
  strokeMetal(c, appearance)

  const inset = frame.outerInset + frame.cornerGap
  const radius = frame.radius - frame.cornerGap
  const reach = radius + 14
  c.beginPath()
  // Short concentric arcs share the main frame's corner centres and spacing.
  for (const [x, sx] of [
    [inset, 1],
    [width - inset, -1],
  ] as const)
    for (const [y, sy] of [
      [inset, 1],
      [height - inset, -1],
    ] as const) {
      c.moveTo(x, y + sy * reach)
      c.lineTo(x, y + sy * radius)
      c.arcTo(x, y, x + sx * radius, y, radius)
      c.lineTo(x + sx * reach, y)
    }
  c.lineWidth = 1.2
  c.globalAlpha = 0.65
  c.stroke()

  // A single short rule closes the signature area; the title keeps open space.
  const footerWidth = 112
  c.beginPath()
  c.moveTo((width - footerWidth) / 2, height - 62)
  c.lineTo((width + footerWidth) / 2, height - 62)
  c.stroke()
  c.restore()
}

export function drawCoverFrame(c: CanvasRenderingContext2D, appearance: CardAppearance) {
  const { x, y, size } = cardLayout.cover
  const inset = cardLayout.frame.coverInset
  c.save()
  c.lineJoin = 'round'
  c.beginPath()
  // Both strokes sit outside the image, preserving every edge of the cover.
  c.rect(x - inset, y - inset, size + inset * 2, size + inset * 2)
  strokeMetal(c, appearance)
  c.restore()
}
