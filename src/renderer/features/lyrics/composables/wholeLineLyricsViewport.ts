import type { Ref } from 'vue'
import type { LyricLine } from '../types'
import {
  isWholeLyricsOpening,
  resolveWholeLyricsMotionDuration,
  resolveWholeLyricsStart,
  resolveWholeLyricsWindow,
  WHOLE_LYRIC_MOTION_EASING,
  WHOLE_LYRIC_OPENING_GAP,
  WHOLE_LYRIC_SHADOW_GAP,
} from '../utils/wholeLineLyricsLayout'

interface Options {
  scrollRef: Ref<HTMLElement | null>
  trackRef: Ref<HTMLElement | null>
  lines?: Readonly<Ref<readonly LyricLine[]>>
  activeIndex: Readonly<Ref<number>>
  showPrelude: Readonly<Ref<boolean>>
  artworkRef?: Ref<HTMLElement | null>
  reducedMotion?: Readonly<Ref<boolean>>
  focalRatio: number
  activeScale: number
  requestMoreLines?: () => boolean
}

interface Paint extends Keyframe {
  color: string
  webkitTextStrokeColor: string
  textShadow: string
}
interface Pose {
  top: number
  height: number
  scale: number
  lineAppearance: LineAppearance
  paint: Paint[]
}

interface LineAppearance extends Keyframe {
  opacity: string
  filter: string
}

function readPaint(element: HTMLElement): Paint {
  const style = getComputedStyle(element)
  return {
    color: style.color,
    webkitTextStrokeColor: style.webkitTextStrokeColor,
    textShadow: style.textShadow,
  }
}

function readLineAppearance(element: HTMLElement): LineAppearance {
  const style = getComputedStyle(element)
  return {
    opacity: style.opacity,
    filter: style.filter,
  }
}

function readScale(element: HTMLElement): number {
  const transform = getComputedStyle(element).transform
  return transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a
}

/** Range measures the wrapped row's font box; Canvas supplies its ink inset. */
function firstInkOffset(line: HTMLElement, scale: number): number {
  const fill = line.querySelector<HTMLElement>('.fullscreen-player-lyric-fill')
  const text = fill?.firstChild
  if (!fill || !text || text.nodeType !== Node.TEXT_NODE) return 0
  const range = document.createRange()
  const content = text.textContent ?? ''
  let firstTop = 0
  let firstRow = ''
  for (let index = 0; index < content.length; index++) {
    range.setStart(text, index)
    range.setEnd(text, index + 1)
    const rect = range.getBoundingClientRect()
    if (index === 0) firstTop = rect.top
    if (Math.abs(rect.top - firstTop) > 1) break
    firstRow += content[index]
  }
  const style = getComputedStyle(fill)
  const context = document.createElement('canvas').getContext('2d')
  if (!context || !firstRow.trim()) return 0
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const metric = context.measureText(firstRow)
  return (
    firstTop -
    line.getBoundingClientRect().top +
    (metric.fontBoundingBoxAscent - metric.actualBoundingBoxAscent) * scale
  )
}

/** Owns the shared timed whole-sentence view; plain lyrics keep the legacy scrolling path. */
export function createWholeLineLyricsViewport(options: Options) {
  let track: HTMLElement | null = null
  let pending: Map<HTMLElement, Pose> | null = null
  let linesIdentity: readonly LyricLine[] | undefined
  let previousIndex = -1
  let layoutKey = ''
  let generation = 0
  let expandingWindow = false
  let measurements = new WeakMap<LyricLine, { key: string; height: number; inkOffset?: number }>()
  const animations = new Set<Animation>()

  function capture(): Map<HTMLElement, Pose> {
    const poses = new Map<HTMLElement, Pose>()
    track?.querySelectorAll<HTMLElement>('[data-lyric-index]').forEach((line) => {
      if (getComputedStyle(line).visibility !== 'visible') return
      const material = line.querySelector<HTMLElement>('.fullscreen-player-lyric-material')
      if (!material) return
      const rect = material.getBoundingClientRect()
      poses.set(line, {
        top: rect.top,
        height: rect.height,
        scale: readScale(material),
        lineAppearance: readLineAppearance(line),
        paint: Array.from(material.children, (child) => readPaint(child as HTMLElement)),
      })
    })
    return poses
  }

  function cancel(): void {
    generation++
    animations.forEach((animation) => animation.cancel())
    animations.clear()
  }

  function clear(): void {
    cancel()
    pending = null
    layoutKey = ''
    linesIdentity = undefined
    previousIndex = -1
    expandingWindow = false
    if (!track) return
    track.style.removeProperty('--fullscreen-whole-fit-scale')
    track
      .querySelectorAll<HTMLElement>('[data-lyric-index], [data-lyric-prelude]')
      .forEach((line) => {
        for (const property of ['visibility', 'height', 'transform', 'font-size']) {
          line.style.removeProperty(property)
        }
        line.removeAttribute('aria-hidden')
        line
          .querySelector<HTMLElement>('.fullscreen-player-lyric-material')
          ?.style.removeProperty('transform')
      })
    track = null
  }

  function beforeChange(): void {
    if (track && !pending) pending = capture()
    // Vue may update the active class before the post-render measurement runs. Remove old
    // history in the pre-render phase as well, so even an interrupted seek never exposes >2.
    const lines = options.lines?.value
    if (track && lines) {
      const start = resolveWholeLyricsStart(lines, options.activeIndex.value)
      track.querySelectorAll<HTMLElement>('[data-lyric-index]').forEach((line) => {
        if (Number(line.dataset.lyricIndex) < start) {
          line.style.visibility = 'hidden'
          line.setAttribute('aria-hidden', 'true')
        }
      })
    }
  }

  function animate(element: HTMLElement, frames: Keyframe[], duration: number): Promise<void> {
    const token = generation
    const animation = element.animate(frames, {
      duration,
      easing: WHOLE_LYRIC_MOTION_EASING,
      fill: 'both',
    })
    animations.add(animation)
    return animation.finished
      .then(() => {
        if (token !== generation) return
        animations.delete(animation)
        animation.cancel()
      })
      .catch(() => undefined)
  }

  function update(behavior: ScrollBehavior, force = false): void {
    const container = options.scrollRef.value
    const nextTrack = options.trackRef.value
    const lines = options.lines?.value
    if (!container || !nextTrack || !lines) return
    if (track && track !== nextTrack) clear()
    const elements = Array.from(nextTrack.querySelectorAll<HTMLElement>('[data-lyric-index]'))
    const indices = elements.map((line) => Number(line.dataset.lyricIndex))
    const rect = container.getBoundingClientRect()
    const artwork = options.artworkRef?.value?.getBoundingClientRect()
    const anchorTop =
      artwork && rect.left >= artwork.right ? artwork.top - rect.top : WHOLE_LYRIC_SHADOW_GAP
    const key = [
      rect.width,
      container.clientHeight,
      anchorTop,
      options.activeIndex.value,
      options.showPrelude.value,
      options.reducedMotion?.value,
      indices[0],
      indices.at(-1),
    ].join('|')
    // ResizeObserver also reports our own final row heights. It must not restart a transition.
    if (!force && track === nextTrack && linesIdentity === lines && layoutKey === key) {
      pending = null
      return
    }
    const previous = pending ?? capture()
    pending = null
    const duration = resolveWholeLyricsMotionDuration(
      lines,
      previousIndex,
      options.activeIndex.value,
      behavior === 'auto' ||
        options.reducedMotion?.value ||
        linesIdentity !== lines ||
        !track ||
        expandingWindow,
    )
    expandingWindow = false
    cancel()
    const token = generation
    track = nextTrack
    linesIdentity = lines
    layoutKey = key
    previousIndex = options.activeIndex.value
    container.scrollTop = 0
    const materials = elements.map(
      (line) => line.querySelector<HTMLElement>('.fullscreen-player-lyric-material')!,
    )
    if (!materials.length) return
    if (force) measurements = new WeakMap()
    const font = getComputedStyle(materials[0])
    const measurementKey = [
      rect.width,
      font.fontSize,
      font.fontFamily,
      font.fontWeight,
      font.lineHeight,
      font.letterSpacing,
    ].join('|')
    const measured = materials.map((material, index) => {
      const lyric = lines[indices[index]]
      const key = `${measurementKey}|${lyric.text}`
      const cached = measurements.get(lyric)
      if (cached?.key === key) return cached
      const value = {
        key,
        height: Math.max(material.offsetHeight, parseFloat(font.lineHeight)),
        inkOffset: undefined as number | undefined,
      }
      measurements.set(lyric, value)
      return value
    })
    const heights = measured.map((value) => value.height)
    const prelude = track.querySelector<HTMLElement>('[data-lyric-prelude]')
    const start = indices.indexOf(resolveWholeLyricsStart(lines, options.activeIndex.value))
    const currentIndex = indices.indexOf(options.activeIndex.value)
    const first = elements[start]
    if (!first) return
    if (measured[start].inkOffset === undefined) {
      const scale = readScale(materials[start])
      measured[start].inkOffset = firstInkOffset(first, scale) / scale
    }
    const opening = isWholeLyricsOpening(lines, options.activeIndex.value)
    const focalCenter = container.clientHeight * options.focalRatio
    let fit = 1
    let scales: number[] = []
    let layout = { offset: 0, endIndex: -1, requiredHeight: 0, anchorTop }
    elements.forEach((line) => {
      line.style.transform = 'none'
    })
    for (let attempt = 0; attempt < 16; attempt++) {
      track.style.setProperty('--fullscreen-whole-fit-scale', String(fit))
      scales = elements.map(
        (_, index) => fit * (index === currentIndex ? 1 : 1 / options.activeScale),
      )
      elements.forEach((line, index) => {
        line.style.height = `${heights[index] * scales[index]}px`
        materials[index].style.transform = `scale(${scales[index]})`
      })
      if (prelude)
        prelude.style.fontSize = `${parseFloat(getComputedStyle(first).fontSize) * options.activeScale * fit}px`
      const trackTop = track.getBoundingClientRect().top
      const metrics = elements.map((line) => {
        const box = line.getBoundingClientRect()
        return { offset: box.top - trackTop, height: box.height }
      })
      layout = resolveWholeLyricsWindow(
        metrics,
        start,
        currentIndex,
        anchorTop,
        container.clientHeight,
        measured[start].inkOffset! * scales[start],
        opening ? focalCenter : undefined,
      )
      let ratio: number
      if (opening) {
        const top =
          options.showPrelude.value && prelude
            ? prelude.getBoundingClientRect().top - trackTop + layout.offset
            : layout.anchorTop
        const head = focalCenter - top
        const tail = layout.anchorTop + layout.requiredHeight - focalCenter
        ratio = Math.min(
          head > 0 ? (focalCenter - anchorTop - WHOLE_LYRIC_OPENING_GAP) / head : 1,
          tail > 0 ? (container.clientHeight - WHOLE_LYRIC_SHADOW_GAP - focalCenter) / tail : 1,
        )
      } else {
        ratio =
          layout.requiredHeight > 0
            ? (container.clientHeight - layout.anchorTop - WHOLE_LYRIC_SHADOW_GAP) /
              layout.requiredHeight
            : 1
      }
      if (ratio >= 1 || ratio <= 0 || attempt === 15) break
      fit *= Math.min(0.9, ratio)
    }
    track.style.transform = `translate3d(0, ${layout.offset}px, 0)`
    const main: Promise<void>[] = []
    const incoming: number[] = []
    const targets = materials.map((material) => material.getBoundingClientRect())
    const appearances = elements.map(readLineAppearance)
    const paints = materials.map((material) =>
      Array.from(material.children, (child) => readPaint(child as HTMLElement)),
    )
    const current = elements[currentIndex]
    const newCurrent = current && !previous.has(current)
    const currentTarget = targets[currentIndex]
    const blocked = new Set<HTMLElement>()
    if (newCurrent) {
      // Reveal a newly reached current sentence immediately. History whose swept area
      // would cross it enters after the movement, instead of covering the highlight.
      elements.forEach((line, index) => {
        const old = previous.get(line)
        if (!old || index < start || index > layout.endIndex) return
        const top = Math.min(old.top, targets[index].top)
        const bottom = Math.max(old.top + old.height, targets[index].bottom)
        if (top < currentTarget.bottom && bottom > currentTarget.top) blocked.add(line)
      })
    }
    const retained = elements.some(
      (line, index) =>
        index >= start && index <= layout.endIndex && previous.has(line) && !blocked.has(line),
    )
    elements.forEach((line, index) => {
      const visible = index >= start && index <= layout.endIndex
      const old = previous.get(line)
      const waitForEntry =
        duration > 0 &&
        visible &&
        (blocked.has(line) || (!old && retained && index !== currentIndex))
      line.style.visibility = visible && !waitForEntry ? 'visible' : 'hidden'
      line.setAttribute('aria-hidden', String(!visible || waitForEntry))
      if (!visible || !duration) return
      if (waitForEntry) {
        incoming.push(index)
        return
      }
      const material = materials[index]
      const box = targets[index]
      if (old) {
        main.push(
          animate(
            line,
            [
              {
                transform: `translate3d(0, ${old.top - box.top}px, 0)`,
                ...old.lineAppearance,
              },
              { transform: 'none', ...appearances[index] },
            ],
            duration,
          ),
        )
        main.push(
          animate(
            material,
            [{ transform: `scale(${old.scale})` }, { transform: `scale(${scales[index]})` }],
            duration,
          ),
        )
        Array.from(material.children).forEach((child, layer) => {
          const target = paints[index][layer]
          if (old.paint[layer])
            main.push(animate(child as HTMLElement, [old.paint[layer], target], duration))
        })
      } else {
        main.push(
          animate(
            material,
            [
              { transform: `scale(${scales[index] * 0.98})` },
              { transform: `scale(${scales[index]})` },
            ],
            duration,
          ),
        )
      }
    })
    if (prelude) {
      prelude.style.visibility = options.showPrelude.value ? 'visible' : 'hidden'
      prelude.setAttribute('aria-hidden', String(!options.showPrelude.value))
    }
    // Fit can reveal more future sentences in a very tall window or after shrinking long
    // history. Grow only when the last mounted row fits, rather than clipping the content.
    if (layout.endIndex === elements.length - 1 && options.requestMoreLines?.()) {
      expandingWindow = true
    }
    void Promise.all(main).then(() => {
      if (token !== generation) return
      incoming.forEach((index) => {
        const line = elements[index]
        const material = materials[index]
        const bottom = material.getBoundingClientRect().bottom
        const nextTop = index < layout.endIndex ? targets[index + 1].top : rect.bottom
        const distance = Math.min(
          8,
          Math.max(0, rect.bottom - WHOLE_LYRIC_SHADOW_GAP - bottom),
          Math.max(0, nextTop - bottom - WHOLE_LYRIC_SHADOW_GAP),
        )
        line.style.visibility = 'visible'
        line.setAttribute('aria-hidden', 'false')
        if (distance > 0) {
          void animate(
            line,
            [{ transform: `translate3d(0, ${distance}px, 0)` }, { transform: 'none' }],
            120,
          )
        } else {
          void animate(
            material,
            [
              { transform: `scale(${scales[index] * 0.98})` },
              { transform: `scale(${scales[index]})` },
            ],
            120,
          )
        }
      })
    })
  }

  return { beforeChange, update, clear }
}
