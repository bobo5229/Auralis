<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { auralis } from '@renderer/shared/ipc/client'
import markup from '../canvas/archiveCanvas.html?raw'
import styles from '../canvas/archiveCanvas.css?raw'
import { mountArchiveCanvasView } from '../canvas/archiveCanvasView'
import { useArchiveCanvasData } from '../composables/useArchiveCanvasData'

const router = useRouter()
const canvasHost = ref<HTMLElement | null>(null)
const data = useArchiveCanvasData()
const { selectedYear, years } = data
const view = shallowRef<ReturnType<typeof mountArchiveCanvasView> | null>(null)
let unsubscribe: (() => void) | undefined

watchEffect(() => {
  view.value?.updateCalendar({
    year: selectedYear.value,
    days: data.calendarDays.value,
    months: data.monthMarkers.value,
    selectedDate: data.selectedDate.value,
    loading: data.isLoading.value,
    error: data.errorMessage.value,
  })
})
watchEffect(() => {
  view.value?.updateDay({
    date: data.selectedDate.value,
    loading: data.dayLoading.value,
    detail: data.detail.value,
    albums: data.albums.value,
    detailError: data.detailError.value,
    albumsError: data.albumsError.value,
  })
})

function goToMacArchive(): void {
  void router.push({ name: 'archive-mac' })
}

function returnToPlayer(): void {
  const previous = router.options.history.state.back
  if (typeof previous === 'string' && previous.startsWith('/') && previous !== '/archive') {
    router.back()
  } else {
    void router.replace({ name: 'library' })
  }
}

onMounted(() => {
  if (!canvasHost.value) return
  const root = canvasHost.value.attachShadow({ mode: 'open' })
  // Only bundled markup; library text is assigned with textContent by the view adapter.
  root.innerHTML = `<style>${styles}</style>${markup}`
  view.value = mountArchiveCanvasView(root, {
    selectDate: (date) => void data.selectDate(date),
    retryCalendar: () => void data.refresh(),
    retryDay: () => {
      if (data.selectedDate.value) void data.selectDate(data.selectedDate.value)
    },
  })
  unsubscribe = auralis.library.onChanged((event) => {
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset')
      void data.refresh()
  })
})
onBeforeUnmount(() => {
  unsubscribe?.()
  view.value?.dispose()
})
</script>

<template>
  <section class="archive-canvas-page" aria-label="声迹独立画布">
    <header class="archive-canvas-header">
      <button type="button" class="archive-canvas-back" @click="returnToPlayer">
        <span aria-hidden="true">←</span> 返回
      </button>
      <span class="archive-canvas-name">AURALIS / 声迹</span>
      <button type="button" class="archive-canvas-mac-btn" @click="goToMacArchive">
        Mac 声迹预览
      </button>
      <label class="archive-canvas-year">
        <span>年份</span>
        <select v-model.number="selectedYear" aria-label="听歌记录年份">
          <option v-for="year in years" :key="year" :value="year">{{ year }} 年</option>
        </select>
      </label>
    </header>
    <div ref="canvasHost" class="archive-canvas-host" data-theme="synth" data-layout="hud" />
  </section>
</template>

<style scoped>
.archive-canvas-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--archive-color-bg-void);
  color: var(--archive-color-text-primary);
}
.archive-canvas-header {
  flex: 0 0 64px;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 20px 124px 0 36px;
  border-bottom: 1px solid var(--archive-color-border-subtle);
  font-family: var(--archive-font-ui);
  font-size: 11px;
}
.archive-canvas-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--archive-color-border-control);
  border-radius: 3px;
  background: var(--archive-color-bg-elevated);
  color: var(--archive-color-text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  font-family: var(--archive-font-ui);
  font-weight: 600;
  letter-spacing: 0.5px;
}
.archive-canvas-back:hover {
  border-color: var(--archive-color-accent-primary);
}
.archive-canvas-back:focus-visible {
  outline: 2px solid var(--archive-color-accent-primary);
  outline-offset: 3px;
}
.archive-canvas-name {
  font-family: var(--archive-font-display);
  font-weight: 700;
  color: var(--archive-color-text-secondary);
  letter-spacing: 2px;
}
.archive-canvas-mac-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--archive-color-border-control);
  border-radius: 3px;
  background: var(--archive-color-bg-elevated);
  color: var(--archive-color-text-primary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  font-family: var(--archive-font-ui);
  font-weight: 600;
  letter-spacing: 0.5px;
}
.archive-canvas-mac-btn:hover {
  border-color: var(--archive-color-accent-primary);
  color: var(--archive-color-accent-primary);
}
.archive-canvas-mac-btn:focus-visible {
  outline: 2px solid var(--archive-color-accent-primary);
  outline-offset: 3px;
}
.archive-canvas-year {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--archive-color-accent-primary);
  font-family: var(--archive-font-ui);
  font-weight: 600;
  letter-spacing: 0.5px;
}
.archive-canvas-year select {
  font-family: var(--archive-font-data);
  font-weight: 600;
  color-scheme: dark;
  color: var(--archive-color-text-primary);
  background: var(--archive-color-bg-elevated);
  border: 1px solid var(--archive-color-border-control);
  border-radius: 3px;
  padding: 5px 8px;
  -webkit-app-region: no-drag;
}
.archive-canvas-year select:focus-visible {
  outline: 2px solid var(--archive-color-accent-primary);
}
.archive-canvas-host {
  flex: 1;
  min-height: 0;
  width: 100%;
}
</style>
