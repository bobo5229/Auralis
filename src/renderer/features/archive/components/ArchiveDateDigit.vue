<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createReducedMotionQuery } from '@renderer/shared/animation/motionPreference'

const props = defineProps<{ digit: string; direction: number }>()
const slot = ref<HTMLElement | null>(null)
let animations: Animation[] = []
let motion: ReturnType<typeof createReducedMotionQuery> | undefined

function clearAnimations(): void {
  for (const animation of animations) animation.cancel()
  animations = []
}

function showDigit(digit: string): void {
  const element = slot.value
  if (!element) return
  clearAnimations()
  element.replaceChildren()
  const layer = document.createElement('span')
  layer.className = 'archive-date-digit-layer'
  layer.textContent = digit
  element.append(layer)
}

onMounted(() => {
  motion = createReducedMotionQuery()
  motion.addEventListener('change', onMotionChange)
  showDigit(props.digit)
})

function onMotionChange(): void {
  if (motion?.matches) showDigit(props.digit)
}

watch(() => props.digit, (digit) => {
  const element = slot.value
  if (!element) return
  if (motion?.matches || typeof element.animate !== 'function') {
    showDigit(digit)
    return
  }
  const height = element.getBoundingClientRect().height
  if (!height) {
    showDigit(digit)
    return
  }
  const previous = Array.from(element.children, (child) => {
    const layer = child as HTMLElement
    const transform = getComputedStyle(layer).transform
    return { layer, offset: transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42 }
  })
  clearAnimations()
  const direction = props.direction
  const options: KeyframeAnimationOptions = { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
  for (const { layer, offset } of previous) {
    const animation = layer.animate([
      { transform: `translateY(${offset}px)` },
      { transform: `translateY(${offset - direction * height}px)` },
    ], options)
    animations.push(animation)
    animation.onfinish = () => { layer.remove(); animation.cancel() }
  }
  const next = document.createElement('span')
  next.className = 'archive-date-digit-layer'
  next.textContent = digit
  element.append(next)
  const animation = next.animate([
    { transform: `translateY(${direction * height}px)` },
    { transform: 'translateY(0)' },
  ], options)
  animations.push(animation)
  animation.onfinish = () => {
    next.style.transform = 'translateY(0)'
    animation.cancel()
    animations = animations.filter((item) => item !== animation)
  }
}, { flush: 'post' })

onBeforeUnmount(() => {
  motion?.removeEventListener('change', onMotionChange)
  clearAnimations()
})
</script>

<template>
  <span ref="slot" class="archive-date-digit" />
</template>

<style>
.archive-date-digit { position: relative; display: inline-block; width: 1ch; height: 1.22em; overflow: hidden; vertical-align: top; }
.archive-date-digit-layer { position: absolute; inset: 0; display: block; text-align: center; }
</style>
