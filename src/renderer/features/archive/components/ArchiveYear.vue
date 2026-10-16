<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{ year: number }>()
const digits = computed(() => String(props.year).split(''))
const direction = ref('year-up')
watch(
  () => props.year,
  (year, previous) => {
    direction.value = year > previous ? 'year-up' : 'year-down'
  },
  { flush: 'sync' },
)
</script>

<template>
  <h2 class="archive-year auralis-type-section" :aria-label="String(year)">
    <span v-for="(digit, index) in digits" :key="index" class="year-digit-slot" aria-hidden="true">
      <Transition :name="direction">
        <span :key="digit" class="year-digit">{{ digit }}</span>
      </Transition>
    </span>
  </h2>
</template>

<style scoped>
.archive-year {
  display: flex;
  margin: 0;
  color: var(--auralis-text);
  font-variant-numeric: tabular-nums;
}

.year-digit-slot {
  position: relative;
  width: 1ch;
  height: 1lh;
  overflow: hidden;
}

.year-digit-slot + .year-digit-slot {
  margin-inline-start: -0.08em;
}

.year-digit {
  position: absolute;
  inset: 0;
  text-align: center;
}

.year-up-enter-active,
.year-up-leave-active,
.year-down-enter-active,
.year-down-leave-active {
  transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.year-up-enter-from,
.year-down-leave-to {
  transform: translateY(100%);
}

.year-up-leave-to,
.year-down-enter-from {
  transform: translateY(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .year-digit {
    transition: none;
    transform: none;
  }
}

:global(html[data-reduced-motion='true'] .year-digit) {
  transition: none;
  transform: none;
}
</style>
