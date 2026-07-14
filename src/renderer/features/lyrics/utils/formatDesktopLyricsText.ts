import OpenCC from 'opencc-js/cn2t'

const DESKTOP_LYRICS_FONT_FAMILY = 'Auralis Desktop Lyrics SC'
const FALLBACK_FONT_FAMILY = 'Arial'
const GLYPH_TEST_FONT_SIZE = 72
const GLYPH_TEST_CANVAS_SIZE = 128
const GLYPH_DIFF_THRESHOLD = 24

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' })
const glyphSupportCache = new Map<string, boolean>()

let fontReady = false
let fontReadyPromise: Promise<void> | null = null
let glyphCanvas: HTMLCanvasElement | null = null

function isCjkCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0)
  if (codePoint === undefined) return false

  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x2ebef) ||
    (codePoint >= 0x30000 && codePoint <= 0x3134f)
  )
}

function getGlyphCanvas(): HTMLCanvasElement {
  if (!glyphCanvas) {
    glyphCanvas = document.createElement('canvas')
    glyphCanvas.width = GLYPH_TEST_CANVAS_SIZE
    glyphCanvas.height = GLYPH_TEST_CANVAS_SIZE
  }

  return glyphCanvas
}

function renderGlyph(character: string, fontFamily: string): Uint8ClampedArray | null {
  const canvas = getGlyphCanvas()
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#000000'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `${GLYPH_TEST_FONT_SIZE}px "${fontFamily}"`
  context.fillText(character, canvas.width / 2, canvas.height / 2)

  return context.getImageData(0, 0, canvas.width, canvas.height).data
}

function hasDesktopLyricsFontGlyph(character: string): boolean {
  if (!fontReady || !isCjkCharacter(character)) return false

  const cached = glyphSupportCache.get(character)
  if (cached !== undefined) return cached

  const fontPixels = renderGlyph(character, DESKTOP_LYRICS_FONT_FAMILY)
  const fallbackPixels = renderGlyph(character, FALLBACK_FONT_FAMILY)

  if (!fontPixels || !fallbackPixels) {
    glyphSupportCache.set(character, false)
    return false
  }

  let diffCount = 0
  for (let index = 3; index < fontPixels.length; index += 4) {
    if (Math.abs(fontPixels[index] - fallbackPixels[index]) > 2) {
      diffCount += 1
      if (diffCount >= GLYPH_DIFF_THRESHOLD) {
        glyphSupportCache.set(character, true)
        return true
      }
    }
  }

  glyphSupportCache.set(character, false)
  return false
}

function hasSupportedConvertedGlyphs(value: string): boolean {
  return Array.from(value).every(
    (character) => !isCjkCharacter(character) || hasDesktopLyricsFontGlyph(character),
  )
}

export function ensureDesktopLyricsFontReady(): Promise<void> {
  if (fontReady) return Promise.resolve()
  if (fontReadyPromise) return fontReadyPromise

  fontReadyPromise = document.fonts
    .load(`${GLYPH_TEST_FONT_SIZE}px "${DESKTOP_LYRICS_FONT_FAMILY}"`)
    .then(() => document.fonts.ready)
    .then(() => {
      fontReady = true
    })

  return fontReadyPromise
}

export function formatDesktopLyricsText(value: string): string {
  if (!value || !fontReady) return value

  const converted = toTraditional(value)
  if (converted === value) return value

  if (hasSupportedConvertedGlyphs(converted)) {
    return converted
  }

  return Array.from(value, (character) => {
    const candidate = toTraditional(character)
    return candidate !== character && hasSupportedConvertedGlyphs(candidate) ? candidate : character
  }).join('')
}
