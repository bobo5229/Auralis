<script setup lang="ts">
import { ref } from 'vue'

withDefaults(
  defineProps<{
    radius?: number
  }>(),
  {
    radius: 20,
  },
)

const panel = ref<HTMLElement | null>(null)

function updateLight(event: PointerEvent): void {
  const element = panel.value
  if (!element) return

  const bounds = element.getBoundingClientRect()
  element.style.setProperty('--glass-pointer-x', `${event.clientX - bounds.left}px`)
  element.style.setProperty('--glass-pointer-y', `${event.clientY - bounds.top}px`)
}
</script>

<template>
  <div
    ref="panel"
    class="liquid-glass-panel"
    :style="{ '--glass-radius': `${radius}px` }"
    @pointermove="updateLight"
  >
    <div class="liquid-glass-panel__refraction" aria-hidden="true"></div>
    <div class="liquid-glass-panel__highlight" aria-hidden="true"></div>
    <div class="liquid-glass-panel__content">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
/*
 * Inspired by rdev/liquid-glass-react (MIT):
 * https://github.com/rdev/liquid-glass-react
 *
 * The small RGB offsets, edge mask, and pointer-driven highlight reproduce the
 * useful parts of its refraction model without adding React or a canvas loop.
 */
.liquid-glass-panel {
  --glass-pointer-x: 24%;
  --glass-pointer-y: 12%;
  position: relative;
  isolation: isolate;
  border-radius: var(--glass-radius);
  background: color-mix(in srgb, var(--auralis-context-menu-bg) 78%, transparent);
  box-shadow:
    var(--auralis-context-menu-shadow),
    inset 0 1px 0 rgb(255 255 255 / 18%),
    inset 0 -1px 0 rgb(0 0 0 / 12%);
  backdrop-filter: blur(18px) saturate(1.18) contrast(1.04);
  -webkit-backdrop-filter: blur(18px) saturate(1.18) contrast(1.04);
  overflow: hidden;
}

.liquid-glass-panel__refraction,
.liquid-glass-panel__highlight {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
}

.liquid-glass-panel__refraction {
  padding: 1px;
  background:
    linear-gradient(115deg, rgb(255 90 90 / 20%), transparent 24% 72%, rgb(70 130 255 / 18%))
      border-box,
    linear-gradient(145deg, rgb(255 255 255 / 34%), rgb(255 255 255 / 5%) 42%, rgb(0 0 0 / 16%))
      border-box;
  mask:
    linear-gradient(#000 0 0) content-box exclude,
    linear-gradient(#000 0 0);
  -webkit-mask:
    linear-gradient(#000 0 0) content-box xor,
    linear-gradient(#000 0 0);
}

.liquid-glass-panel__highlight {
  opacity: 0.72;
  background:
    radial-gradient(
      130px circle at var(--glass-pointer-x) var(--glass-pointer-y),
      rgb(255 255 255 / 19%),
      transparent 66%
    ),
    linear-gradient(135deg, rgb(255 255 255 / 9%), transparent 42%);
  transition: opacity 180ms ease;
}

.liquid-glass-panel__content {
  position: relative;
  z-index: 1;
}

@media (prefers-reduced-motion: reduce) {
  .liquid-glass-panel__highlight {
    display: none;
  }
}

@media (prefers-contrast: more) {
  .liquid-glass-panel {
    background: var(--auralis-context-menu-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
