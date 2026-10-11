import * as THREE from 'three'
import { drawBackground } from './backgrounds/backgrounds'
import { tone } from './backgrounds/palette'
import { createCardAppearance, cardTextColors, type CardAppearance } from './cardAppearance'
import { cardLayout } from './cardLayout'
import { drawCardFrame, drawCoverFrame } from './cardFrame'
import { cardArtistFamily, cardArtistStrokeWidth, cardTitleFamily } from './cardTypography'

export interface CardContent {
  id: string
  title: string
  artist: string
  cover: CanvasImageSource | null
}

function textWidth(c: CanvasRenderingContext2D, text: string): number {
  const metrics = c.measureText(text)
  return Math.max(metrics.width, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight)
}

function fit(c: CanvasRenderingContext2D, text: string, width: number): string {
  if (textWidth(c, text) <= width) return text
  const chars = Array.from(text)
  while (chars.length && textWidth(c, chars.join('') + '…') > width) chars.pop()
  return chars.join('') + '…'
}

function titleLines(c: CanvasRenderingContext2D, title: string, width: number): string[] {
  const chars = Array.from(title)
  let first = ''
  while (chars.length && textWidth(c, first + chars[0]) <= width) first += chars.shift()
  // Prefer a word boundary for Latin titles; CJK can wrap between characters.
  const wordBreak = first.lastIndexOf(' ')
  if (
    chars.length &&
    wordBreak > 0 &&
    /[A-Za-z0-9]$/.test(first) &&
    /^[A-Za-z0-9]/.test(chars[0])
  ) {
    chars.unshift(...Array.from(first.slice(wordBreak + 1)))
    first = first.slice(0, wordBreak)
  }
  return chars.length ? [first.trimEnd(), fit(c, chars.join('').trimStart(), width)] : [first]
}

export function drawCardCanvas(
  canvas: HTMLCanvasElement,
  content: CardContent,
  appearance: CardAppearance,
  mask?: HTMLCanvasElement,
) {
  const c = canvas.getContext('2d')!
  const ink = mask?.getContext('2d')
  // Artwork uses 720 × 1032 logical units; rasterize type at twice that precision.
  // Restore the transform so content redraws never accumulate scale.
  c.save()
  c.setTransform(canvas.width / 720, 0, 0, canvas.height / 1032, 0, 0)
  c.clearRect(0, 0, 720, 1032)
  c.textAlign = 'left'
  drawBackground(c, appearance.background, appearance.palette, appearance.patternSeed)
  drawCardFrame(c, appearance)
  const colors = cardTextColors(c, appearance.redSurface > 0.5)
  if (ink && mask) {
    ink.save()
    ink.setTransform(mask.width / 720, 0, 0, mask.height / 1032, 0, 0)
    ink.fillStyle = '#000000'
    ink.fillRect(0, 0, 720, 1032)
    ink.textAlign = 'left'
  }
  // The same fitted strings, baselines and fonts paint both ink and glyph mask.
  const print = (text: string, x: number, y: number, strokeWidth = 0) => {
    if (strokeWidth) {
      c.save()
      c.strokeStyle = c.fillStyle
      c.lineWidth = strokeWidth
      c.lineJoin = 'round'
      c.strokeText(text, x, y)
      c.restore()
    }
    c.fillText(text, x, y)
    if (ink) {
      ink.font = c.font
      ink.textAlign = c.textAlign
      ink.fillStyle = '#00ff00'
      if (strokeWidth) {
        ink.save()
        ink.strokeStyle = ink.fillStyle
        ink.lineWidth = strokeWidth
        ink.lineJoin = 'round'
        ink.strokeText(text, x, y)
        ink.restore()
      }
      ink.fillText(text, x, y)
    }
  }
  const letteringColors = (text: string, x: number, y: number) => {
    const bounds = c.measureText(text)
    return cardTextColors(c, appearance.redSurface > 0.5, {
      x: x - bounds.actualBoundingBoxLeft,
      y: y - bounds.actualBoundingBoxAscent,
      width: Math.max(1, bounds.actualBoundingBoxLeft + bounds.actualBoundingBoxRight),
      height: Math.max(1, bounds.actualBoundingBoxAscent + bounds.actualBoundingBoxDescent),
    })
  }
  const { x: coverX, y: coverY, size: coverSize } = cardLayout.cover
  // Center the visible ink rather than the advance width, including script swashes.
  const centeredInkX = (text: string) => {
    const bounds = c.measureText(text)
    return (
      coverX + coverSize / 2 + (bounds.actualBoundingBoxLeft - bounds.actualBoundingBoxRight) / 2
    )
  }
  if (ink) {
    ink.fillStyle = '#ff0000'
    ink.fillRect(coverX, coverY, coverSize, coverSize)
  }
  c.shadowColor = tone(appearance.palette, '#03091488', 'shadow')
  c.shadowBlur = 16
  c.shadowOffsetY = 8
  c.fillStyle = tone(appearance.palette, '#14243a')
  c.fillRect(coverX, coverY, coverSize, coverSize)
  c.shadowBlur = c.shadowOffsetY = 0
  if (content.cover) {
    // Preserve the complete cover even when its source isn't square.
    const source = content.cover as HTMLImageElement | HTMLCanvasElement
    const width = 'naturalWidth' in source ? source.naturalWidth : source.width
    const height = 'naturalHeight' in source ? source.naturalHeight : source.height
    const scale = Math.min(coverSize / width, coverSize / height)
    c.drawImage(
      source,
      coverX + (coverSize - width * scale) / 2,
      coverY + (coverSize - height * scale) / 2,
      width * scale,
      height * scale,
    )
  } else {
    c.strokeStyle = '#d5d7dc'
    c.lineWidth = 4
    c.beginPath()
    c.arc(360, coverY + coverSize / 2, 150, 0, Math.PI * 2)
    c.moveTo(402, coverY + coverSize / 2)
    c.arc(360, coverY + coverSize / 2, 42, 0, Math.PI * 2)
    c.stroke()
  }
  drawCoverFrame(c, appearance)
  // Display lettering is printed into a fixed-size card, so these sizes use
  // design units rather than the application's UI typography scale.
  c.textAlign = 'left'
  c.fillStyle = colors.primary
  c.font = `600 ${cardLayout.title.fontSize}px ${cardTitleFamily}`
  const titleWidth = coverSize - cardLayout.title.inset * 2
  if (textWidth(c, content.title) > titleWidth)
    c.font = `600 ${cardLayout.title.compactFontSize}px ${cardTitleFamily}`
  const lines = titleLines(c, content.title, titleWidth)
  // Center the visible ink block vertically, including descenders and all lines.
  const bounds = lines.map((line) => c.measureText(line))
  const top = Math.min(
    ...bounds.map((line, i) => i * cardLayout.title.lineHeight - line.actualBoundingBoxAscent),
  )
  const bottom = Math.max(
    ...bounds.map((line, i) => i * cardLayout.title.lineHeight + line.actualBoundingBoxDescent),
  )
  const titleY = cardLayout.title.centerY - (top + bottom) / 2
  lines.forEach((line, i) => {
    const x = centeredInkX(line)
    c.fillStyle = letteringColors(line, x, titleY + i * cardLayout.title.lineHeight).primary
    print(line, x, titleY + i * cardLayout.title.lineHeight)
  })
  c.font = `400 ${cardLayout.artist.fontSize}px ${cardArtistFamily}`
  c.textAlign = 'left'
  const artistText = fit(
    c,
    content.artist,
    coverSize - cardLayout.artist.inset * 2 - cardArtistStrokeWidth,
  )
  const artistX = centeredInkX(artistText)
  const artistBounds = c.measureText(artistText)
  const artistY =
    cardLayout.artist.centerY +
    (artistBounds.actualBoundingBoxAscent - artistBounds.actualBoundingBoxDescent) / 2
  c.fillStyle = letteringColors(artistText, artistX, artistY).secondary
  print(artistText, artistX, artistY, cardArtistStrokeWidth)
  c.textAlign = 'left'
  c.restore()
  ink?.restore()
}

export function drawCardArtwork(
  texture: THREE.CanvasTexture,
  content: CardContent,
  appearance = createCardAppearance(content.cover),
  mask?: THREE.CanvasTexture,
) {
  drawCardCanvas(texture.image as HTMLCanvasElement, content, appearance, mask?.image)
  texture.needsUpdate = true
  if (mask) mask.needsUpdate = true
}

export function createCardArtwork(
  content: CardContent,
  appearance = createCardAppearance(content.cover),
  mask?: THREE.CanvasTexture,
) {
  const canvas = document.createElement('canvas')
  canvas.width = 1440
  canvas.height = 2064
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  drawCardArtwork(texture, content, appearance, mask)
  return texture
}

export function createCardPrintMask() {
  const canvas = document.createElement('canvas')
  canvas.width = 1440
  canvas.height = 2064
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 8
  return texture
}
