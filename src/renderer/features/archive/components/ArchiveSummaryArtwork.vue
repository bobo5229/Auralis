<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
const props = defineProps<{ artworkKey: string | null; eager?: boolean }>()
const failed = ref(false)
watch(
  () => props.artworkKey,
  () => {
    failed.value = false
  },
)
const url = computed(() => (failed.value ? null : getArtworkUrl(props.artworkKey)))
</script>

<template>
  <span class="summary-artwork">
    <img
      v-if="url"
      :src="url"
      alt=""
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      @error="failed = true"
    />
    <span v-else class="i-lucide-disc-3 summary-artwork-fallback" aria-hidden="true"></span>
  </span>
</template>

<style scoped>
.summary-artwork {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--auralis-surface-raised);
  border-radius: 3px;
}
.summary-artwork img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.summary-artwork-fallback {
  width: 32%;
  height: 32%;
  color: var(--auralis-text-faint);
}
</style>
