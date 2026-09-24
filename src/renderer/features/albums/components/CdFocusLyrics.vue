<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useTrackLyrics } from '@renderer/features/lyrics/composables/useTrackLyrics'
import { useReducedMotion } from '@renderer/features/lyrics/composables/useReducedMotion'
import { animateProgress } from '@renderer/shared/animation/motion'
import { cdLyricsPlacement, type LyricsRect } from '../utils/cdLyricsPlacement'
import {
  calculateCentrifugalRadius,
  calculateOrbitOffset,
  calculateSpacingExpand,
  calculateStaggerOpacities,
  pickLyricsExitAnimation,
  LYRICS_EXIT_DURATIONS,
  type LyricsExitAnimation,
} from '../utils/cdLyricsExitAnimation'

const props = defineProps<{
  active: boolean
  accent: string
  stage: HTMLElement | null
  information: HTMLElement | null
  tracks: HTMLElement | null
}>()
const { t } = useI18n()
const playback = usePlayback()
const { status, loadFailed, rawLyrics, parsedLines, activeIndex } = useTrackLyrics()
const motion = useReducedMotion()
const arcId = `cd-lyric-arc-${useId()}`
const target = shallowRef<HTMLElement | null>(null)
const arcPath = ref('')
let arcCenter = Math.random() * 360
let arcReversed: boolean | null = null
const viewport = ref('0 0 1 1')
const fontSize = ref(24)
const measureRef = ref<SVGTextElement | null>(null)
const depthSamples = shallowRef<{ distance: number; scale: number }[]>([])
const glyphMetrics = shallowRef<{ text: string; width: number }[]>([])
const displayedText = ref('')
const textOpacity = ref(0)
const startOffset = ref('50%')
const extraSpacing = ref(0)
const radialOffset = ref(0)
const glyphOpacities = shallowRef<number[]>([])
let lastExitAnimation: LyricsExitAnimation | null = null
let lastLineChangeTime = 0

function resetExitAnimationStyles(): void {
  const hadRadialOffset = radialOffset.value !== 0
  startOffset.value = '50%'
  extraSpacing.value = 0
  radialOffset.value = 0
  glyphOpacities.value = []
  if (hadRadialOffset) {
    projectArc()
  }
}
const placement = shallowRef<LyricsRect | null>(null)
const showEmpty = ref(false)
const emptyOpacity = ref(1)
const notifiedTracks = new Set<number>()
const noLyrics = computed(
  () =>
    status.value === 'empty' ||
    (status.value === 'plain' && !rawLyrics.value?.trim()) ||
    (status.value === 'lrc' && !parsedLines.value.some((line) => line.text.trim())),
)
const currentLine = computed(() => {
  if (status.value === 'plain')
    return rawLyrics.value?.split(/\r?\n/).find((line) => line.trim()) ?? ''
  return status.value === 'lrc' ? (parsedLines.value[activeIndex.value]?.text ?? '') : ''
})

const glyphs = computed(() => {
  const samples = depthSamples.value
  const length = samples.at(-1)?.distance ?? 0
  const maximumScale = Math.max(1, ...samples.map((sample) => sample.scale))
  const available = Math.max(0, length - fontSize.value)
  const required =
    glyphMetrics.value.reduce((sum, glyph) => sum + glyph.width, 0) * maximumScale * 1.08
  // Four size tiers based on measured width (including spaces and perspective).
  // Extremely long lines continue shrinking instead of dropping any characters.
  const fitScale =
    required > 0
      ? ([1, 0.85, 0.7, 0.55].find((scale) => required * scale <= available) ??
        available / required)
      : 1
  const scaleAt = (distance: number): number => {
    const index = samples.findIndex((sample) => sample.distance >= distance)
    if (index < 0) return samples.at(-1)?.scale ?? 1
    if (!index) return samples[0].scale
    const left = samples[index - 1]
    const right = samples[index]
    const fraction = (distance - left.distance) / (right.distance - left.distance)
    return left.scale + (right.scale - left.scale) * fraction
  }
  let scales = glyphMetrics.value.map(() => fitScale)
  // Re-estimate centred advances as the individual glyph sizes change.
  for (let pass = 0; pass < 3; pass++) {
    const widths = glyphMetrics.value.map((glyph, index) => glyph.width * scales[index])
    let cursor = (length - widths.reduce((sum, width) => sum + width, 0)) / 2
    scales = widths.map((width) => {
      const scale = scaleAt(cursor + width / 2) * fitScale
      cursor += width
      return scale
    })
  }
  return glyphMetrics.value.map((glyph, index) => ({
    text: glyph.text,
    size: fontSize.value * scales[index],
  }))
})

function projectArc(): void {
  const stage = props.stage
  const disc = stage?.querySelector<HTMLElement>('.cd-position[data-selected="true"] .cd-disc')
  if (!stage || !disc) return
  const hover = disc.parentElement!
  const slot = hover.parentElement!
  const transforms = [disc, hover, slot].map((element) => {
    const style = getComputedStyle(element)
    const [x, y] = style.transformOrigin.split(' ').map(Number.parseFloat)
    return { matrix: new DOMMatrixReadOnly(style.transform), x, y }
  })
  // Project the same flattened planes as the disc, then draw SVG text at viewport
  // resolution. No CSS 3D bitmap scaling is applied to the lyric SVG itself.
  const project = (degrees: number, radius: number): { x: number; y: number; scale: number } => {
    const angle = (degrees * Math.PI) / 180
    let x = 200 + Math.sin(angle) * radius
    let y = 200 - Math.cos(angle) * radius
    let scale = 1
    for (const transform of transforms) {
      const point = new DOMPoint(x - transform.x, y - transform.y).matrixTransform(transform.matrix)
      scale /= point.w
      x = point.x / point.w + transform.x
      y = point.y / point.w + transform.y
    }
    return { x, y, scale }
  }
  // Choose a left-to-right direction after perspective, and keep it for this line
  // so hovering near a vertical tangent cannot repeatedly flip the text.
  arcReversed ??= project(arcCenter + 0.5, 252).x < project(arcCenter - 0.5, 252).x
  const points = Array.from({ length: 97 }, (_, index) => {
    const offset = -60 + (index / 96) * 120
    // Reversed glyphs extend toward the disc; move their baseline out by one em.
    const baseRadius = (arcReversed ? 276 : 252) + radialOffset.value
    return project(arcCenter + (arcReversed ? -offset : offset), baseRadius)
  })
  let distance = 0
  depthSamples.value = points.map((point, index) => {
    if (index) distance += Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y)
    // Invert perspective for the requested far-large / near-small typography.
    return { distance, scale: 1 / point.scale }
  })
  arcPath.value = points
    .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(3)},${point.y.toFixed(3)}`)
    .join(' ')
  viewport.value = `0 0 ${stage.clientWidth} ${stage.clientHeight}`
  fontSize.value = 24 * Math.hypot(transforms[2].matrix.a, transforms[2].matrix.b)
}

function measure(): void {
  const stage = props.stage
  const disc = stage?.querySelector<HTMLElement>('.cd-position[data-selected="true"] .cd-disc')
  if (!props.active || !stage || !disc) {
    target.value = null
    placement.value = null
    return
  }
  target.value = stage
  projectArc()
  const bounds = stage.getBoundingClientRect()
  const rect = (element: HTMLElement, gap: number): LyricsRect => {
    const box = element.getBoundingClientRect()
    return {
      left: box.left - bounds.left - gap,
      top: box.top - bounds.top - gap,
      width: box.width + gap * 2,
      height: box.height + gap * 2,
    }
  }
  placement.value =
    props.information && props.tracks
      ? cdLyricsPlacement(
          { left: 24, top: 24, width: bounds.width - 48, height: bounds.height - 48 },
          [rect(disc, 80), rect(props.information, 20), rect(props.tracks, 20)],
        )
      : null
}

watch(
  [() => props.active, () => props.stage, () => props.information, () => props.tracks],
  (_, __, onCleanup) => {
    measure()
    if (!props.active) return
    const observer = new ResizeObserver(measure)
    for (const element of [props.stage, props.information, props.tracks]) {
      if (element) observer.observe(element)
    }
    const transforms = new MutationObserver(projectArc)
    const disc = props.stage?.querySelector<HTMLElement>(
      '.cd-position[data-selected="true"] .cd-disc',
    )
    if (disc) {
      for (const element of [disc, disc.parentElement!, disc.parentElement!.parentElement!]) {
        transforms.observe(element, { attributes: true, attributeFilter: ['style'] })
      }
    }
    onCleanup(() => {
      observer.disconnect()
      transforms.disconnect()
    })
  },
  { immediate: true, flush: 'post' },
)

watch(
  [currentLine, target, motion.matches, () => playback.state.currentTrackId, fontSize, activeIndex],
  async ([line, host, reduced, trackId, , lineIndex], previous, onCleanup) => {
    let cancelled = false
    let cancelAnimation: (() => void) | undefined
    onCleanup(() => {
      cancelled = true
      cancelAnimation?.()
      resetExitAnimationStyles()
    })
    const reveal = async (): Promise<void> => {
      resetExitAnimationStyles()
      textOpacity.value = 0
      if (
        line &&
        host &&
        (line !== previous?.[0] ||
          host !== previous?.[1] ||
          trackId !== previous?.[3] ||
          lineIndex !== previous?.[5])
      ) {
        // Select anywhere around the disc, at least 60 degrees from the previous arc.
        // Change only after the old line fades; hover and resize retain this position.
        arcCenter = (arcCenter + 60 + Math.random() * 240) % 360
        arcReversed = null
        projectArc()
      }
      displayedText.value = line
      await nextTick()
      if (cancelled) return
      const measurement = measureRef.value
      glyphMetrics.value = Array.from(displayedText.value).map((text) => {
        if (measurement) measurement.textContent = text
        return { text, width: measurement?.getComputedTextLength() ?? fontSize.value }
      })
      if (!line || !host) return
      if (reduced) {
        textOpacity.value = 1
        return
      }
      cancelAnimation = animateProgress(
        320,
        (p) => {
          textOpacity.value = p
        },
        () => {
          textOpacity.value = 1
        },
      )
    }

    const now = performance.now()
    const isRapidSeek = now - lastLineChangeTime < 80
    lastLineChangeTime = now

    if (!host || reduced || trackId !== previous?.[3] || !displayedText.value || isRapidSeek) {
      resetExitAnimationStyles()
      await reveal()
      return
    }

    const anim = pickLyricsExitAnimation(lastExitAnimation)
    lastExitAnimation = anim
    const duration = LYRICS_EXIT_DURATIONS[anim]
    const fromOpacity = textOpacity.value
    const glyphCount = Array.from(displayedText.value).length
    const driftDirection: 1 | -1 = Math.random() < 0.5 ? -1 : 1

    cancelAnimation = animateProgress(
      duration,
      (p) => {
        switch (anim) {
          case 'orbit-drift':
            textOpacity.value = fromOpacity * (1 - p)
            startOffset.value = calculateOrbitOffset(driftDirection, p)
            break
          case 'stagger-dissolve':
            textOpacity.value = 1
            glyphOpacities.value = calculateStaggerOpacities(glyphCount, p).map(
              (o) => o * fromOpacity,
            )
            break
          case 'centrifugal-drift':
            textOpacity.value = fromOpacity * (1 - p)
            radialOffset.value = calculateCentrifugalRadius(p)
            projectArc()
            break
          case 'spacing-expand':
            textOpacity.value = fromOpacity * (1 - p)
            extraSpacing.value = calculateSpacingExpand(fontSize.value, p)
            break
          case 'classic-fade':
          default:
            textOpacity.value = fromOpacity * (1 - p)
            break
        }
      },
      () => {
        resetExitAnimationStyles()
        void reveal()
      },
    )
  },
  { flush: 'post' },
)

watch(
  [
    () => playback.state.currentTrackId,
    noLyrics,
    loadFailed,
    () => props.active,
    () => !!placement.value,
  ],
  ([trackId, empty, failed, active, fits], _, onCleanup) => {
    showEmpty.value = false
    if (!trackId || !empty || failed || !active || !fits || notifiedTracks.has(trackId)) return
    notifiedTracks.add(trackId)
    showEmpty.value = true
    emptyOpacity.value = 1
    let cancelFade: (() => void) | undefined
    const timer = setTimeout(() => {
      if (motion.matches.value) {
        showEmpty.value = false
        return
      }
      cancelFade = animateProgress(
        800,
        (p) => {
          emptyOpacity.value = 1 - p
        },
        () => {
          showEmpty.value = false
        },
      )
    }, 3000)
    onCleanup(() => {
      clearTimeout(timer)
      cancelFade?.()
    })
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  motion.dispose()
  resetExitAnimationStyles()
})
</script>

<template>
  <Teleport v-if="target" :to="target">
    <svg
      class="cd-lyric-arc"
      :style="{ fill: props.accent }"
      :viewBox="viewport"
      role="img"
      :aria-label="currentLine || t('albums.cd.lyrics.label')"
    >
      <defs>
        <path :id="arcId" :d="arcPath" />
      </defs>
      <text
        ref="measureRef"
        visibility="hidden"
        aria-hidden="true"
        xml:space="preserve"
        :font-size="fontSize"
        :letter-spacing="fontSize / 30"
      />
      <text
        text-anchor="middle"
        :font-size="fontSize"
        :letter-spacing="fontSize / 30 + extraSpacing"
        :fill-opacity="textOpacity"
      >
        <textPath :href="`#${arcId}`" :startOffset="startOffset">
          <tspan
            v-for="(glyph, index) in glyphs"
            :key="index"
            :font-size="glyph.size"
            :letter-spacing="glyph.size / 30"
            :fill-opacity="glyphOpacities[index] ?? undefined"
            xml:space="preserve"
          >
            {{ glyph.text }}
          </tspan>
        </textPath>
      </text>
    </svg>
  </Teleport>
  <p
    v-if="props.active && showEmpty && placement"
    class="cd-lyrics-empty"
    :style="{
      left: `${placement.left}px`,
      top: `${placement.top}px`,
      width: `${placement.width}px`,
      opacity: emptyOpacity,
    }"
    role="status"
  >
    {{ t('albums.cd.lyrics.instrumental') }}
  </p>
</template>

<style scoped>
.cd-lyric-arc {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  font-weight: 400;
  text-rendering: geometricPrecision;
}
.cd-lyrics-empty {
  position: absolute;
  margin: 0;
  height: 112px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  text-align: center;
  font-family: Georgia, 'Auralis Desktop Lyrics SC', 'SimSun', 'Yu Mincho', serif;
  color: var(--cd-text-muted, #62625b);
  font-size: 13px;
  line-height: 22px;
}
</style>
