<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { observeWindowVisibility } from '@renderer/shared/animation/windowVisibility'
import { glassFilterMarkup } from './liquidGlass/optics'

const props = defineProps<{ target: HTMLElement | null; enabled: boolean }>()
const emit = defineEmits<{ ready: [value: boolean] }>()
const id = `island-glass-${useId().replaceAll(':', '-')}`
const markup = glassFilterMarkup(id)
const rect = ref({ x: 0, y: 0, width: 0, height: 0 })
const visible = ref(true)
const reduced = ref(false)
let observer: ResizeObserver | undefined
let frame = 0
let until = 0
let unbindVisibility: (() => void) | undefined
const media: MediaQueryList[] = []
const supported = typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'blur(1px)') && /Chrome\//.test(navigator.userAgent)
const active = computed(() => props.enabled && visible.value && !reduced.value && supported)
const ready = computed(() => active.value && rect.value.width > 0 && rect.value.height > 0)
watch(ready, value => emit('ready', value), { flush: 'sync' })
function measure(): void {
  if (!active.value || !props.target) return
  const r = props.target.getBoundingClientRect()
  rect.value = { x: r.x, y: r.y, width: r.width, height: r.height }
}
function tick(): void {
  frame = 0
  measure()
  if (active.value && performance.now() < until) frame = requestAnimationFrame(tick)
}
function follow(): void {
  if (!active.value) return
  until = performance.now() + 800
  if (!frame) frame = requestAnimationFrame(tick)
}
watch([active, () => props.target], () => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
  frame = 0
  rect.value = { x: 0, y: 0, width: 0, height: 0 }
  if (!active.value || !props.target) return
  observer = new ResizeObserver(measure)
  observer.observe(props.target)
  measure()
}, { flush: 'post' })
function updateMedia(): void { reduced.value = media.some(query => query.matches) }
onMounted(() => {
  media.push(matchMedia('(prefers-reduced-transparency: reduce)'), matchMedia('(prefers-contrast: more)'))
  media.forEach(query => query.addEventListener('change', updateMedia))
  updateMedia()
  unbindVisibility = observeWindowVisibility(value => { visible.value = value })
  window.addEventListener('resize', measure)
  document.addEventListener('transitionrun', follow, true)
  measure()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
  unbindVisibility?.()
  media.forEach(query => query.removeEventListener('change', updateMedia))
  window.removeEventListener('resize', measure)
  document.removeEventListener('transitionrun', follow, true)
  emit('ready', false)
})
</script>

<template>
  <Teleport to="body">
    <!-- Static markup from a bundled map and an internal Vue ID; no external HTML. -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <svg v-if="ready" class="island-glass-defs" :width="rect.width" :height="rect.height" aria-hidden="true" v-html="markup" />
    <div
      v-if="ready" class="island-liquid-glass" aria-hidden="true" :style="{
      left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`,
      backdropFilter: `url(#${id}) blur(5.92px) saturate(130%)`,
    }" />
  </Teleport>
</template>

<style scoped>
.island-glass-defs { position: fixed; left: -10000px; top: -10000px; pointer-events: none; }
.island-liquid-glass {
  position: fixed; z-index: 49; pointer-events: none; border-radius: 999px;
  background: rgb(255 255 255 / 2.5%); box-shadow: 0 10px 28px #0003;
}
.island-liquid-glass::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit;
  box-shadow: inset 0 1px 1px #ffffffa0, inset 1px 0 2px #ffffff50, inset -1px 0 2px #ffffff70, inset 0 -2px 3px #ffffff70;
  border: 1px solid #ffffff30;
}
</style>
