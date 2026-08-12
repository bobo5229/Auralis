<script setup lang="ts">
import { useI18n } from 'vue-i18n'

withDefaults(
  defineProps<{
    size?: 'row' | 'catalog'
  }>(),
  {
    size: 'row',
  },
)

const { t } = useI18n()
</script>

<template>
  <div
    class="library-artwork-placeholder select-none flex flex-col items-center justify-center overflow-hidden border border-[var(--manuscript-border-strong)] bg-[var(--manuscript-surface-recessed)] text-[var(--manuscript-state-missing)] rounded-[var(--manuscript-radius-artwork)]"
    :class="[size === 'catalog' ? 'p-4' : 'h-full w-full']"
    :aria-label="t('library.manuscript.missing.artwork')"
  >
    <span
      class="i-lucide-disc-3"
      :class="size === 'catalog' ? 'text-4xl opacity-60 mb-2' : 'text-base opacity-70'"
      aria-hidden="true"
    ></span>
    <span
      v-if="size === 'catalog'"
      class="font-[var(--manuscript-font-numeric)] text-xs tracking-wider opacity-70 text-center uppercase"
    >
      {{ t('library.manuscript.missing.artwork') }}
    </span>
  </div>
</template>

<style scoped>
.library-artwork-placeholder {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 6px,
    rgba(122, 114, 101, 0.05) 6px,
    rgba(122, 114, 101, 0.05) 12px
  );
}
</style>
