<script setup lang="ts">
import { ref } from 'vue'
import type { VisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'

withDefaults(
  defineProps<{
    radius?: number
    presentation?: VisualStyle
  }>(),
  {
    radius: 20,
    presentation: 'modern',
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

defineExpose({
  getElement: (): HTMLElement | null => panel.value,
})
</script>

<template>
  <div
    ref="panel"
    class="liquid-glass-panel"
    :class="{ 'liquid-glass-panel--manuscript': presentation === 'manuscript' }"
    :style="{ '--glass-radius': `${radius}px` }"
    @pointermove="updateLight"
  >
    <div
      v-if="presentation !== 'manuscript'"
      class="liquid-glass-panel__refraction"
      aria-hidden="true"
    ></div>
    <div
      v-if="presentation !== 'manuscript'"
      class="liquid-glass-panel__highlight"
      aria-hidden="true"
    ></div>
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

/*
 * Default positioning only: the panel must stay a containing block for its
 * absolute glass layers, but callers that pin the panel with their own
 * position utilities (context menus pass `fixed` / `absolute`) must win.
 * Layered author rules lose to un-layered ones, so a caller's `.fixed` or
 * `.absolute` always overrides this default `relative`; callers that pass no
 * position keep the in-flow relative default.
 */
@layer liquid-glass-panel {
  .liquid-glass-panel {
    position: relative;
  }
}

.liquid-glass-panel--manuscript {
  background: var(--manuscript-surface-overlay, #f3eedf) !important;
  border: var(--manuscript-hairline-width, 1px) solid
    var(--manuscript-border-overlay, rgba(48, 43, 37, 0.46)) !important;
  border-radius: var(--manuscript-radius-control, 2px) !important;
  box-shadow: var(--manuscript-effect-overlay-shadow, 0 8px 24px rgba(41, 39, 35, 0.16)) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
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
