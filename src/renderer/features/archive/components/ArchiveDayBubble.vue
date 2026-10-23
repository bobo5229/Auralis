<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { startFloatingPosition } from '@renderer/shared/floating/floatingPosition'

const props = defineProps<{
  id: string
  date: string
  anchor: HTMLElement
  playCount: number
  durationSeconds: number
}>()
const emit = defineEmits<{ keep: []; leave: []; close: [] }>()
const { t, locale } = useI18n()
const root = ref<HTMLElement | null>(null)
const summaryText = ref<HTMLElement | null>(null)
const compactWidth = ref<number>()
let observer: ResizeObserver | undefined
let positioning: ReturnType<typeof startFloatingPosition> | undefined
let revision = 0
const dateLabel = computed(() =>
  new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${props.date}T00:00:00Z`)),
)
onMounted(() => {
  const measure = () => {
    if (summaryText.value)
      compactWidth.value = Math.ceil(summaryText.value.getBoundingClientRect().width) + 22
  }
  measure()
  observer = new ResizeObserver(measure)
  if (summaryText.value) observer.observe(summaryText.value)
})
watch(compactWidth, async () => {
  await nextTick()
  void positioning?.update()
})
watch(
  () => props.anchor,
  async () => {
    const current = ++revision
    positioning?.dispose()
    await nextTick()
    if (revision !== current || !root.value) return
    positioning = startFloatingPosition({
      reference: props.anchor,
      floating: root.value,
      profile: 'popover',
      gap: 10,
      shiftCrossAxis: false,
      onError: () => emit('close'),
    })
  },
  { immediate: true, flush: 'post' },
)
onScopeDispose(() => {
  revision++
  observer?.disconnect()
  positioning?.dispose()
})
</script>

<template>
  <div
    :id="id"
    ref="root"
    class="archive-day-bubble"
    :style="{ width: compactWidth ? `${compactWidth}px` : undefined }"
    role="status"
    :aria-label="dateLabel"
    @pointerenter="emit('keep')"
    @pointerleave="emit('leave')"
  >
    <p class="archive-day-bubble-date auralis-type-caption">{{ dateLabel }}</p>
    <p class="archive-day-summary auralis-type-caption">
      <span ref="summaryText">{{
        t('archive.daySummary', { count: playCount, minutes: Math.round(durationSeconds / 60) })
      }}</span>
    </p>
  </div>
</template>

<style scoped>
.archive-day-bubble {
  position: fixed;
  z-index: 100;
  width: max-content;
  min-width: max-content;
  padding: 6px 10px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 8px;
  background: var(--auralis-surface-floating);
  color: var(--auralis-text-muted);
  box-shadow: 0 8px 24px rgb(0 0 0 / 16%);
}
.archive-day-summary {
  margin: 0;
}
.archive-day-bubble-date {
  margin: 0 0 3px;
  color: var(--auralis-text);
}
.archive-day-summary > span {
  display: inline-block;
  white-space: nowrap;
}
</style>
