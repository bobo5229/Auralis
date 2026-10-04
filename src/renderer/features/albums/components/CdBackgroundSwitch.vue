<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const props = defineProps<{ enabled: boolean; disabled: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const { t } = useI18n()
</script>

<template>
  <button
    v-tooltip.feedback="
      t(
        disabled
          ? 'albums.cd.background.lightOnly'
          : enabled
            ? 'albums.cd.background.enabled'
            : 'albums.cd.background.disabled',
      )
    "
    type="button"
    class="cd-background-toggle"
    :aria-label="t('albums.cd.background.toggle')"
    :aria-pressed="enabled"
    :disabled="disabled"
    @click="!props.disabled && emit('toggle')"
  >
    <span class="cd-background-icon cd-control-icon" aria-hidden="true">
      <span class="i-lucide-palette cd-background-glyph"></span>
      <svg v-if="!enabled" class="cd-background-off" viewBox="0 0 16 16" fill="none">
        <path d="M1 1L15 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
.cd-background-toggle {
  position: absolute;
  left: 72px;
  bottom: 24px;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--cd-text-muted);
  background: transparent;
  border: 0;
  border-radius: 0;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.cd-background-icon {
  position: relative;
}
.cd-background-glyph {
  width: 100%;
  height: 100%;
}
.cd-background-off {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.cd-background-toggle[aria-pressed='true'],
.cd-background-toggle:hover:not(:disabled) {
  color: var(--cd-text);
}
.cd-background-toggle:focus-visible {
  outline: 2px solid var(--cd-focus-ring);
  outline-offset: 3px;
}
.cd-background-toggle:disabled {
  color: var(--cd-text-subtle);
  cursor: default;
}
@media (max-width: 800px) {
  .cd-background-toggle {
    left: 64px;
    bottom: 16px;
  }
}
</style>
