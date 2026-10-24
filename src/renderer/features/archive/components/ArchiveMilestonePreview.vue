<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'
import { useWindowVisibility } from '@renderer/shared/animation/useWindowVisibility'
import { badgeMaterialDescriptors, getBadgePreview } from '../utils/badgeMaterials'
import { milestoneBadges } from '../constants/milestoneBadges'
import type { BadgeState, createBadgeMaterialRenderer } from '../runtime/badgeMaterialRenderer'

const props = withDefaults(
  defineProps<{ badgeId: string; state?: BadgeState; reflections?: boolean }>(),
  { state: 'lit', reflections: true },
)
const { t, te } = useI18n()
const instructionsId = useId()
const host = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const ready = ref(false),
  failed = ref(false)
const visible = useWindowVisibility()
const motion = createReducedMotionQuery()
const fallback = computed(() => getBadgePreview(props.badgeId, props.state))
const name = computed(() => {
  const key = `archive.milestones.names.${props.badgeId}`
  return te(key)
    ? t(key)
    : (milestoneBadges.find((badge) => badge.id === props.badgeId)?.name ?? '')
})
let graphics: ReturnType<typeof createBadgeMaterialRenderer> | undefined
let starting: Promise<void> | undefined
let disposed = false,
  revision = 0,
  frame = 0,
  previous = 0
let observer: ResizeObserver | undefined, resolution: MediaQueryList | undefined
const pose = { x: 0, y: 0, targetX: 0, targetY: 0 }

function stop() {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  previous = 0
}
function fail() {
  if (disposed) return
  failed.value = true
  ready.value = false
  stop()
  graphics?.dispose()
}
function tick(time: number) {
  frame = 0
  if (disposed || failed.value || !ready.value || !visible.value) {
    previous = 0
    return
  }
  const elapsed = previous ? Math.min(time - previous, 50) : 16.7
  previous = time
  const alpha = motion.matches ? 1 : 1 - Math.exp(-elapsed / 65)
  pose.x += (pose.targetX - pose.x) * alpha
  pose.y += (pose.targetY - pose.y) * alpha
  const moving = Math.abs(pose.x - pose.targetX) + Math.abs(pose.y - pose.targetY) > 0.01
  if (!moving) {
    pose.x = pose.targetX
    pose.y = pose.targetY
  }
  try {
    graphics?.render(pose.x, pose.y)
  } catch {
    fail()
    return
  }
  if (moving && !failed.value) frame = requestAnimationFrame(tick)
  else previous = 0
}
function draw() {
  if (!frame && ready.value && !disposed && !failed.value && visible.value)
    frame = requestAnimationFrame(tick)
}
function resize() {
  if (!host.value || !graphics || disposed || failed.value) return
  const box = host.value.getBoundingClientRect()
  graphics.resize(box.width, box.height)
  draw()
}
function watchResolution() {
  resolution?.removeEventListener('change', onResolution)
  resolution = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
  resolution.addEventListener('change', onResolution)
}
function onResolution() {
  resize()
  watchResolution()
}
async function load() {
  const owner = ++revision
  ready.value = false
  stop()
  if (disposed || failed.value) return
  try {
    if (!starting)
      starting = import('../runtime/badgeMaterialRenderer').then((module) => {
        if (!disposed && canvas.value)
          graphics = module.createBadgeMaterialRenderer(canvas.value, fail)
      })
    await starting
    if (disposed || owner !== revision || !graphics) return
    const loaded = await graphics.load(badgeMaterialDescriptors[props.badgeId], props.state)
    if (!loaded || disposed || owner !== revision) return
    graphics.setReflections(props.reflections)
    Object.assign(pose, { x: 0, y: 0, targetX: 0, targetY: 0 })
    ready.value = true
    resize()
    draw()
  } catch {
    if (owner === revision) fail()
  }
}
function reset() {
  pose.targetX = pose.targetY = 0
  draw()
}
function pointer(event: PointerEvent) {
  if (motion.matches || event.pointerType === 'touch' || !host.value) return
  const box = host.value.getBoundingClientRect()
  pose.targetX = Math.max(
    -8,
    Math.min(8, (-(event.clientY - box.top - box.height / 2) / (box.height / 2)) * 8),
  )
  pose.targetY = Math.max(
    -8,
    Math.min(8, ((event.clientX - box.left - box.width / 2) / (box.width / 2)) * 8),
  )
  draw()
}
function keydown(event: KeyboardEvent) {
  const steps: Record<string, [number, number]> = {
    ArrowLeft: [0, -2],
    ArrowRight: [0, 2],
    ArrowUp: [2, 0],
    ArrowDown: [-2, 0],
  }
  if (event.key === 'Home') {
    event.preventDefault()
    reset()
    return
  }
  const step = steps[event.key]
  if (!step) return
  event.preventDefault()
  pose.targetX = Math.max(-8, Math.min(8, pose.targetX + step[0]))
  pose.targetY = Math.max(-8, Math.min(8, pose.targetY + step[1]))
  draw()
}
watch(
  () => [props.badgeId, props.state],
  () => {
    void load()
  },
)
watch(
  () => props.reflections,
  (value) => {
    graphics?.setReflections(value)
    draw()
  },
)
watch(visible, (value) => {
  if (value) draw()
  else stop()
})
onMounted(() => {
  observer = new ResizeObserver(resize)
  if (host.value) observer.observe(host.value)
  watchResolution()
  motion.addEventListener('change', reset)
  void load()
})
onBeforeUnmount(() => {
  disposed = true
  revision++
  stop()
  observer?.disconnect()
  resolution?.removeEventListener('change', onResolution)
  motion.removeEventListener('change', reset)
  graphics?.dispose()
})
defineExpose({
  snapshot: () => ({
    ...graphics?.snapshot(),
    failed: failed.value,
    running: !!frame,
    reducedMotion: motion.matches,
  }),
  forceContextLoss: () => graphics?.forceContextLoss(),
})
</script>

<template>
  <div
    ref="host"
    class="archive-milestone-preview"
    :class="{ 'is-ready': ready, 'is-fallback': failed }"
    :data-badge-id="badgeId"
    :data-render-state="failed ? 'fallback' : ready ? 'ready' : 'loading'"
    role="img"
    :aria-label="t('archive.milestones.previewFor', { name })"
    :aria-describedby="instructionsId"
    tabindex="0"
    @pointermove="pointer"
    @pointerleave="reset"
    @pointercancel="reset"
    @keydown="keydown"
  >
    <img :src="fallback" alt="" draggable="false" />
    <canvas ref="canvas" aria-hidden="true"></canvas>
    <p :id="instructionsId" class="sr-only">
      {{ failed ? t('archive.milestones.staticPreview') : t('archive.milestones.instructions') }}
    </p>
  </div>
</template>

<style scoped>
.archive-milestone-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 330 / 370;
  outline: none;
}
.archive-milestone-preview img,
.archive-milestone-preview canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
.archive-milestone-preview canvas {
  opacity: 0;
}
.archive-milestone-preview.is-ready canvas {
  opacity: 1;
}
.archive-milestone-preview.is-ready img {
  visibility: hidden;
}
.archive-milestone-preview:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 4px;
  border-radius: 8px;
}
</style>
