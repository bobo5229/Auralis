<script setup lang="ts">
import { computed, ref } from 'vue'
import type { LiquidGlassOptions } from '@renderer/shared/glass/liquidGlass'
import { useLiquidGlassEffect } from '@renderer/shared/glass/useLiquidGlassEffect'

const props = withDefaults(
  defineProps<{
    frosted?: boolean
    liquid?: boolean
    liquidActive?: boolean
    liquidOptions?: LiquidGlassOptions
    plainBackground?: string
  }>(),
  {
    frosted: true,
    liquid: false,
    liquidActive: false,
    liquidOptions: undefined,
    plainBackground: 'var(--auralis-fullscreen-controls-bg)',
  },
)

const root = ref<HTMLElement | null>(null)
const runLiquidGlass = computed(() => props.liquid && props.liquidActive)
useLiquidGlassEffect(
  root,
  runLiquidGlass,
  undefined,
  computed(() => props.liquidOptions),
)
</script>

<template>
  <!-- A separate paint layer keeps backdrop clipping away from controls and popovers. -->
  <div
    ref="root"
    class="frosted-surface"
    :data-frosted="frosted && !liquid"
    :data-liquid="liquid"
    :style="{ '--auralis-surface-plain-bg': plainBackground }"
    aria-hidden="true"
  />
</template>

<style scoped>
.frosted-surface {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
  background: var(--auralis-surface-plain-bg);
  pointer-events: none;
  transition: background-color 0.3s ease;
}

.frosted-surface[data-frosted='true'] {
  background: var(--auralis-parameter-surface-bg);
  -webkit-backdrop-filter: var(--auralis-parameter-surface-filter);
  backdrop-filter: var(--auralis-parameter-surface-filter);
}

.frosted-surface[data-liquid='true'] {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--auralis-playbar-bg) 18%, transparent),
    color-mix(in srgb, var(--auralis-playbar-bg) 32%, transparent)
  );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 50%, transparent),
    inset 0 -8px 16px color-mix(in srgb, white 6%, transparent);
}

@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .frosted-surface[data-liquid='true'] {
    background: var(--auralis-playbar-reduced-transparency-bg, var(--auralis-surface-plain-bg));
    box-shadow: none;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }
}
</style>
