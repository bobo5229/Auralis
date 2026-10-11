<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ icon: string }>()

// 沿用 Phosphor 的图形结构，在 20px 网格内校正光学尺寸。
// 使用描边绘制，避免缩放填充图标时同时改变线宽。
const paths: Record<string, string[]> = {
  'i-ph-arrow-right': ['M3.25 10H16.25', 'M10.5 4.25 16.25 10 10.5 15.75'],
  'i-ph-repeat': [
    'M3 8V7.5A3 3 0 0 1 6 4.5H16.5 M13.5 1.5 16.5 4.5 13.5 7.5',
    'M17 12V12.5A3 3 0 0 1 14 15.5H3.5 M6.5 12.5 3.5 15.5 6.5 18.5',
  ],
  'i-ph-repeat-once': [
    'M3 8V7.5A3 3 0 0 1 6 4.5H16.5 M13.5 1.5 16.5 4.5 13.5 7.5',
    'M17 12V12.5A3 3 0 0 1 14 15.5H3.5 M6.5 12.5 3.5 15.5 6.5 18.5',
    'M8.75 9 10.25 8V12',
  ],
  'i-ph-shuffle': [
    'M2.5 5H5Q6.5 5 7.75 7L12.25 13Q13.5 15 15 15H17.5 M15 12.5 17.5 15 15 17.5',
    'M2.5 15H5Q6.5 15 7.75 13 M12.25 7Q13.5 5 15 5H17.5 M15 2.5 17.5 5 15 7.5',
  ],
  'i-ph-vinyl-record': [
    'M18 10A8 8 0 1 1 2 10A8 8 0 1 1 18 10Z',
    'M12.5 10A2.5 2.5 0 1 1 7.5 10A2.5 2.5 0 1 1 12.5 10Z',
    'M5 8A5.4 5.4 0 0 1 8 5 M12 15A5.4 5.4 0 0 0 15 12',
  ],
  'i-ph-queue': ['M2.5 4.5H16 M2.5 10H9.5 M2.5 15.5H9.5', 'M12.5 9 17.5 12.25 12.5 15.5Z'],
  'i-ph-subtitles': [
    'M3.5 3.75H16.5Q17.5 3.75 17.5 4.75V15.25Q17.5 16.25 16.5 16.25H3.5Q2.5 16.25 2.5 15.25V4.75Q2.5 3.75 3.5 3.75Z',
    'M5 10H6.5 M9 10H15 M5 13H11 M13.5 13H15',
  ],
  'i-ph-speaker-high': [
    'M6 7H2.5V13H6L11 17V3L6 7V13',
    'M14 7.5Q16.2 10 14 12.5 M16.5 5.5Q20.3 10 16.5 14.5',
  ],
  'i-ph-speaker-low': ['M6 7H2.5V13H6L11 17V3L6 7V13', 'M14 7.5Q16.2 10 14 12.5'],
  'i-ph-speaker-slash': [
    'M6 7H2.5V13H6L11 17V13.2 M11 7V3L8.5 5',
    'M14 7.5Q15.4 9.1 15 10.7 M16.5 5.5Q19.6 9.2 17.6 13',
    'M3.5 3 16.5 17',
  ],
}

const strokes = computed(() => paths[props.icon])
</script>

<template>
  <svg
    v-if="strokes"
    class="playbar-action-icon playbar-action-stroke-icon h-5 w-5"
    :data-icon="icon"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(path, index) in strokes" :key="index" :d="path" />
  </svg>
  <span v-else class="playbar-action-icon h-5 w-5" :class="icon" aria-hidden="true" />
</template>
