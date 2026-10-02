<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import markup from '../mac/archiveMac.html?raw'
import archiveMacCss from '../mac/archiveMac.css?raw'
import macAlbumWindowCss from '../mac/macAlbumWindow.css?raw'
import loadTrayCss from '../mac/loadTray.css?raw'
import '../mac/archiveMacFonts.css'
import { mountArchiveMacView } from '../mac/mountArchiveMacView'
import { useArchiveMacData } from '../composables/useArchiveMacData'
import { resolveArchiveFontFamily } from '../utils/resolveArchiveFontFamily'
import type { MacViewController } from '../mac/macViewTypes'
import type { LibraryChangedReason } from '@shared/ipc/contracts'

const router = useRouter()
const canvasHost = ref<HTMLElement | null>(null)
const data = useArchiveMacData()
const view = shallowRef<MacViewController | null>(null)

let unsubscribe: (() => void) | undefined
let debounceTimer: number | null = null
let disposed = false

const RELEVANT_REASONS = new Set<LibraryChangedReason>([
  'play-stats-updated',
  'play-stats-reset',
  'metadata-refresh',
  'track-added',
  'track-missing',
  'track-restored',
  'track-relocated',
  'file-change',
])

function returnToPlayer(): void {
  const previous = router.options.history.state.back
  if (
    typeof previous === 'string' &&
    previous.startsWith('/') &&
    !/^\/archive(?:[/?#]|$)/.test(previous)
  ) {
    router.back()
  } else {
    void router.replace({ name: 'library' })
  }
}

// Sync model to view
watchEffect(() => {
  view.value?.update({
    selectedYear: data.selectedYear.value,
    browsingYear: data.browsingYear.value,
    todayKey: data.todayKey.value,
    selectedDate: data.selectedDate.value,
    years: data.years.value,
    calendarDays: data.calendarDays.value,
    calendarLoading: data.calendarLoading.value,
    calendarError: data.calendarError.value,
    dayLoading: data.dayLoading.value,
    dayError: data.dayError.value,
    items: data.items.value,
    selectedAlbumKey: data.selectedAlbumKey.value,
  })
})

onMounted(async () => {
  const host = canvasHost.value
  if (!host) return

  const macFont = resolveArchiveFontFamily(
    getComputedStyle(host).getPropertyValue('--mac-font'),
    "'Plus Jakarta Sans', 'Auralis Mac Pixel', 'Microsoft YaHei', sans-serif",
  )

  try {
    if (document.fonts?.load) {
      await Promise.all([
        document.fonts.load(`400 12px ${macFont}`, 'Album 0123 专辑统计'),
        document.fonts.load('400 12px "Auralis Mac Pixel"', '专辑统计'),
      ])
    }
  } catch (err) {
    rendererDiagnostics.warn({
      scope: 'archive.mac.page',
      message: 'Font load failed, falling back',
      cause: err,
    })
  }

  if (disposed || canvasHost.value !== host) return

  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${archiveMacCss}\n${macAlbumWindowCss}\n${loadTrayCss}</style>${markup}`

  view.value = mountArchiveMacView(root, {
    onSelectYear: (year) => data.selectYear(year),
    onBrowseYear: (year) => data.browseYear(year),
    onSelectDate: (date) => void data.selectDate(date),
    onSelectAlbum: (key) => data.selectAlbum(key),
    onRetryCalendar: () => data.retryCalendar(),
    onRetryDay: (date) => data.retryDay(date),
  })

  // Subscribe to library changes
  unsubscribe = auralis.library.onChanged((event) => {
    if (RELEVANT_REASONS.has(event.reason)) {
      if (debounceTimer !== null) clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        if (!disposed) void data.refresh()
      }, 150)
    }
  })
})

onBeforeUnmount(() => {
  disposed = true
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  unsubscribe?.()
  view.value?.dispose()
})
</script>

<template>
  <section class="archive-mac-page" aria-label="Mac 声迹">
    <header class="archive-mac-header">
      <button
        type="button"
        class="archive-mac-back-btn"
        aria-label="返回播放器"
        @click="returnToPlayer"
      >
        <span aria-hidden="true">←</span> 返回
      </button>
      <span class="archive-mac-title">AURALIS / 声迹</span>
    </header>
    <div ref="canvasHost" class="archive-mac-host" />
  </section>
</template>

<style scoped>
.archive-mac-page {
  --mac-font: var(--auralis-font-latin), 'Auralis Mac Pixel', 'Microsoft YaHei', sans-serif;
  font-synthesis: none;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #030305;
  color: #f8fafc;
  overflow: hidden;
}
.archive-mac-header {
  flex: 0 0 54px;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 124px 0 28px;
  border-bottom: 1px solid rgba(112, 97, 127, 0.35);
  font-family: var(--mac-font, sans-serif);
  font-size: 12px;
  -webkit-app-region: drag;
  user-select: none;
}
.archive-mac-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid #70617f;
  border-radius: 3px;
  background: #211a2d;
  color: #c3b4cf;
  cursor: pointer;
  -webkit-app-region: no-drag;
  font-family: var(--mac-font, sans-serif);
  font-weight: 400;
  letter-spacing: 0.5px;
}
.archive-mac-back-btn:hover {
  border-color: #ff8fc3;
  color: #ff8fc3;
}
.archive-mac-back-btn:focus-visible {
  outline: 2px solid #ff8fc3;
  outline-offset: 2px;
}
.archive-mac-title {
  font-weight: 400;
  letter-spacing: 1.5px;
  color: #94a3b8;
}
.archive-mac-host {
  flex: 1;
  min-height: 0;
  width: 100%;
}
</style>
