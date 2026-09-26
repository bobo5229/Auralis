<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    kind: 'loading' | 'empty' | 'error'
    title: string
    description?: string
    actionLabel?: string
    icon?: string
    compact?: boolean
  }>(),
  { description: '', actionLabel: '', icon: '', compact: false },
)

defineEmits<{ action: [] }>()

const statusIcon = computed(() => {
  if (props.kind === 'loading') return 'i-lucide-loader-2'
  if (props.kind === 'error') return 'i-lucide-alert-circle'
  return props.icon || 'i-lucide-music-4'
})
</script>

<template>
  <div
    class="main-page-status"
    :class="{ 'main-page-status--compact': compact }"
    role="status"
    aria-live="polite"
  >
    <span
      class="main-page-status-icon"
      :class="{ 'main-page-status-icon--error': kind === 'error' }"
      aria-hidden="true"
    >
      <span
        :class="[statusIcon, { 'animate-spin main-page-status-spinner': kind === 'loading' }]"
      ></span>
    </span>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <button v-if="actionLabel" type="button" @click="$emit('action')">{{ actionLabel }}</button>
  </div>
</template>

<style scoped>
.main-page-status {
  display: flex;
  min-height: 160px;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  text-align: center;
  color: var(--auralis-text);
}

.main-page-status--compact {
  flex: none;
  padding: 24px;
}

.main-page-status-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 50%;
  color: var(--auralis-text-muted);
  background: var(--auralis-control-hover-bg);
}

.main-page-status-icon > span {
  width: 24px;
  height: 24px;
}

.main-page-status-icon--error {
  color: #ef4444;
  background: rgb(239 68 68 / 0.1);
}

.main-page-status h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.main-page-status p {
  max-width: 28rem;
  margin: 0;
  font-size: 12px;
  color: var(--auralis-text-muted);
}

.main-page-status button {
  min-height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--auralis-text);
  background: var(--auralis-control-hover-bg);
}

.main-page-status button:hover {
  background: var(--auralis-border-subtle);
}

.main-page-status button:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .main-page-status-spinner {
    animation: none;
  }
}
</style>
