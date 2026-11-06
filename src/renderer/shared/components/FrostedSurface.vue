<script setup lang="ts">
withDefaults(
  defineProps<{
    frosted?: boolean
    plainBackground?: string
  }>(),
  {
    frosted: true,
    plainBackground: 'var(--auralis-fullscreen-controls-bg)',
  },
)
</script>

<template>
  <!-- A separate paint layer keeps backdrop clipping away from controls and popovers. -->
  <div
    class="frosted-surface"
    :data-frosted="frosted"
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
</style>
