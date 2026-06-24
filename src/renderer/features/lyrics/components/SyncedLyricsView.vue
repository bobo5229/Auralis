<script setup lang="ts">
import { ref, watch } from 'vue'
import type { LyricLine } from '../types'

const props = defineProps<{
  lines: LyricLine[]
  activeIndex: number
  isPrelude: boolean
}>()

const scrollRef = ref<HTMLElement | null>(null)
const isUserScrolling = ref(false)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null
let programmaticScrollTimer: ReturnType<typeof setTimeout> | null = null

function scrollToActive() {
  if (isUserScrolling.value) return

  const container = scrollRef.value
  if (!container) return

  // Mark as programmatic so handleScroll ignores this scroll
  programmaticScrollTimer = setTimeout(() => {
    programmaticScrollTimer = null
  }, 500)

  if (props.isPrelude) {
    container.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  if (props.activeIndex < 0) return

  const activeEl = container.children[props.activeIndex] as HTMLElement | undefined
  if (!activeEl) return

  const containerHeight = container.clientHeight
  const targetScrollTop = activeEl.offsetTop - containerHeight * 0.3 + activeEl.clientHeight / 2
  const maxScroll = container.scrollHeight - container.clientHeight
  container.scrollTo({ top: Math.max(0, Math.min(targetScrollTop, maxScroll)), behavior: 'smooth' })
}

function handleScroll() {
  // Ignore scroll events triggered by programmatic scrollTo
  if (programmaticScrollTimer) return

  isUserScrolling.value = true
  if (scrollTimeout) clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    isUserScrolling.value = false
  }, 3000)
}

watch(() => props.activeIndex, scrollToActive)
</script>

<template>
  <div ref="scrollRef" class="h-full overflow-auto px-4 py-3" @scroll="handleScroll">
    <div
      v-for="(line, index) in lines"
      :key="line.id"
      class="lyric-line transition-all duration-300"
      :class="{
        'lyric-active': activeIndex === index && line.text,
        'lyric-inactive': (activeIndex !== index || !line.text) && !(isPrelude && index === 0),
        'lyric-prelude': isPrelude && index === 0,
        'lyric-empty': !line.text && !(isPrelude && index === 0),
      }"
    >
      <template v-if="isPrelude && index === 0">
        <span class="lyric-dot">.</span><span class="lyric-dot">.</span
        ><span class="lyric-dot">.</span>
      </template>
      <template v-else>{{ line.text || ' ' }}</template>
    </div>
  </div>
</template>
