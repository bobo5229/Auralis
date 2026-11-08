<template>
  <!-- A separate paint layer keeps backdrop clipping away from controls and popovers. -->
  <div class="frosted-surface" aria-hidden="true" />
</template>

<style scoped>
.frosted-surface {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  transition: background-color 0.3s ease;
  background: var(--auralis-parameter-surface-bg);
  -webkit-backdrop-filter: var(--auralis-parameter-surface-filter);
  backdrop-filter: var(--auralis-parameter-surface-filter);
}
</style>
