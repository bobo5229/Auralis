<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLiquidGlassRefraction } from '@renderer/features/playback/composables/useLiquidGlassFilter'
import { supportsBackdropFilterUrlSyntax } from '@renderer/features/playback/utils/liquidGlassDisplacementMap'

const props = withDefaults(
  defineProps<{
    radius?: number
    refraction?: boolean
    strength?: number
    depth?: number
    chromaticAberration?: number
    blur?: number
  }>(),
  {
    radius: 20,
    refraction: true,
    strength: 36,
    depth: 10,
    chromaticAberration: 1,
    blur: 24,
  },
)

const panel = ref<HTMLElement | null>(null)
const syntaxSupported = supportsBackdropFilterUrlSyntax()
const isFrosted = computed(() => props.refraction === false)
const isLiquidRequested = computed(() => !isFrosted.value)

const { isActive: isLiquidRefractionActive, liquidFilterStyle } = useLiquidGlassRefraction(panel, {
  active: computed(() => isLiquidRequested.value && syntaxSupported),
  radius: props.radius,
  depth: props.depth,
  strength: props.strength,
  chromaticAberration: props.chromaticAberration,
  brightness: 1,
  saturate: 1.1,
  blur: props.blur,
})

function updateLight(event: PointerEvent): void {
  if (!isFrosted.value) return

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
    :class="{
      'liquid-glass-panel--liquid': isLiquidRefractionActive,
      'liquid-glass-panel--frosted': isFrosted,
    }"
    :style="{ '--glass-radius': `${radius}px` }"
    @pointermove="updateLight"
  >
    <div
      v-if="isLiquidRefractionActive"
      class="liquid-glass-panel__refract-edge"
      :style="liquidFilterStyle"
      aria-hidden="true"
    ></div>
    <div v-if="isLiquidRefractionActive" class="liquid-glass-panel__veil" aria-hidden="true"></div>
    <div v-if="isFrosted" class="liquid-glass-panel__refraction" aria-hidden="true"></div>
    <div v-if="isFrosted" class="liquid-glass-panel__highlight" aria-hidden="true"></div>
    <div class="liquid-glass-panel__content">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.liquid-glass-panel {
  isolation: isolate;
  border-radius: var(--glass-radius);
  background: var(--auralis-context-menu-bg);
  box-shadow:
    var(--auralis-context-menu-shadow),
    inset 0 1px 0 rgb(255 255 255 / 14%),
    inset 0 -1px 0 rgb(0 0 0 / 12%);
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

/*
 * Same displacement pipeline as Modern PlayerBar, with a reading-surface veil:
 * opaque in the middle, faded on a 12px rim so the lens stays visible at edges.
 * The panel fill stays transparent so backdrop-filter can sample the page.
 */
.liquid-glass-panel--liquid {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.26);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.liquid-glass-panel__refract-edge,
.liquid-glass-panel__veil {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.liquid-glass-panel__veil {
  --glass-veil-fade: 12px;
  background: rgba(16, 20, 26, 0.62);
  box-shadow: none;
  -webkit-mask-image:
    linear-gradient(
      to right,
      transparent,
      #000 var(--glass-veil-fade),
      #000 calc(100% - var(--glass-veil-fade)),
      transparent
    ),
    linear-gradient(
      to bottom,
      transparent,
      #000 var(--glass-veil-fade),
      #000 calc(100% - var(--glass-veil-fade)),
      transparent
    );
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(
      to right,
      transparent,
      #000 var(--glass-veil-fade),
      #000 calc(100% - var(--glass-veil-fade)),
      transparent
    ),
    linear-gradient(
      to bottom,
      transparent,
      #000 var(--glass-veil-fade),
      #000 calc(100% - var(--glass-veil-fade)),
      transparent
    );
  mask-composite: intersect;
}

.liquid-glass-panel--frosted {
  --glass-pointer-x: 24%;
  --glass-pointer-y: 12%;
  background: color-mix(in srgb, var(--auralis-context-menu-bg) 78%, transparent);
  backdrop-filter: blur(18px) saturate(1.18) contrast(1.04);
  -webkit-backdrop-filter: blur(18px) saturate(1.18) contrast(1.04);
}

.liquid-glass-panel__refraction,
.liquid-glass-panel__highlight {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
}

.liquid-glass-panel__refraction {
  padding: 1px;
  background:
    linear-gradient(
        115deg,
        var(--auralis-border-strong),
        transparent 24% 72%,
        var(--auralis-border-subtle)
      )
      border-box,
    linear-gradient(
        145deg,
        var(--auralis-border-strong),
        var(--auralis-border-subtle) 42%,
        transparent
      )
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

@media (prefers-reduced-transparency: reduce) {
  .liquid-glass-panel--liquid {
    background: var(--auralis-context-menu-bg);
  }

  .liquid-glass-panel--liquid .liquid-glass-panel__refract-edge,
  .liquid-glass-panel--liquid .liquid-glass-panel__veil {
    display: none;
  }
}

@media (prefers-contrast: more) {
  .liquid-glass-panel,
  .liquid-glass-panel--liquid,
  .liquid-glass-panel--frosted {
    background: var(--auralis-context-menu-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .liquid-glass-panel__refract-edge,
  .liquid-glass-panel__veil,
  .liquid-glass-panel__refraction,
  .liquid-glass-panel__highlight {
    display: none;
  }
}

@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .liquid-glass-panel--liquid {
    background: var(--auralis-context-menu-bg);
  }

  .liquid-glass-panel--liquid .liquid-glass-panel__refract-edge,
  .liquid-glass-panel--liquid .liquid-glass-panel__veil {
    display: none;
  }
}
</style>
