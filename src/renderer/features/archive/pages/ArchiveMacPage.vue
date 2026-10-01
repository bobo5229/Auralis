<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from 'vue'
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
import { useArchiveMacPlayback } from '../composables/useArchiveMacPlayback'
import { CoverPipeline } from '../mac/coverPipeline'
import type { MacViewController } from '../mac/macViewTypes'
import type { LibraryChangedReason } from '@shared/ipc/contracts'

const router = useRouter()
const canvasHost = ref<HTMLElement | null>(null)
const data = useArchiveMacData()
const macPlayback = useArchiveMacPlayback()
const view = shallowRef<MacViewController | null>(null)
const coverPipeline = new CoverPipeline()
const processedCovers = shallowRef(new Map<string, HTMLCanvasElement>())

let unsubscribe: (() => void) | undefined
let debounceTimer: number | null = null
let coverRevision = 0
let disposed = false
let coverSignature = ''

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

function returnToArchive(): void {
  const previous = router.options.history.state.back
  if (typeof previous === 'string' && previous.startsWith('/') && previous !== '/archive/mac') {
    router.back()
  } else {
    void router.replace({ name: 'archive' })
  }
}

// Watch data.items to run cover pipeline asynchronously
watch(
  () => data.items.value,
  async (newItems) => {
    const signature = JSON.stringify(
      newItems.map((item) => [item.key, item.artworkCacheKey, item.title]),
    )
    if (signature === coverSignature) return
    coverSignature = signature
    const rev = ++coverRevision
    processedCovers.value = new Map()
    const newMap = new Map<string, HTMLCanvasElement>()

    await Promise.all(
      newItems.map(async (item) => {
        const canvas = await coverPipeline.getCover(item.artworkCacheKey, rev, item.title)
        if (rev === coverRevision && !disposed) {
          newMap.set(item.key, canvas)
        }
      }),
    )

    if (rev === coverRevision && !disposed) {
      processedCovers.value = newMap
    }
  },
  { immediate: true },
)

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
    covers: processedCovers.value,
    canInsert: true,
    inserting: false,
    busy: false,
    playbackMessage: macPlayback.message.value,
  })
})

onMounted(async () => {
  if (!canvasHost.value) return

  try {
    await document.fonts.load('12px "Auralis Mac Pixel"', '专辑统计 Album 0123')
  } catch (err) {
    rendererDiagnostics.warn({
      scope: 'archive.mac.page',
      message: 'Font load failed, falling back',
      cause: err,
    })
  }

  if (disposed || !canvasHost.value) return

  const root = canvasHost.value.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${archiveMacCss}\n${macAlbumWindowCss}\n${loadTrayCss}</style>${markup}`

  view.value = mountArchiveMacView(root, {
    onSelectYear: (year) => data.selectYear(year),
    onBrowseYear: (year) => data.browseYear(year),
    onSelectDate: (date) => void data.selectDate(date),
    onSelectAlbum: (key) => data.selectAlbum(key),
    onRetryCalendar: () => data.retryCalendar(),
    onRetryDay: (date) => data.retryDay(date),
    onRequestInsert: macPlayback.playAlbum,
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
  coverPipeline.dispose()
})
</script>

<template>
  <section class="archive-mac-page" aria-label="Mac 声迹独立预览">
    <header class="archive-mac-header">
      <button
        type="button"
        class="archive-mac-back-btn"
        aria-label="返回声迹画板"
        @click="returnToArchive"
      >
        <span aria-hidden="true">←</span> 返回
      </button>
      <span class="archive-mac-title">AURALIS / MAC 声迹预览</span>
    </header>
    <div ref="canvasHost" class="archive-mac-host" />
  </section>
</template>

<style scoped>
.archive-mac-page {
  --mac-font: 'Auralis Mac Pixel', 'Microsoft YaHei', sans-serif;
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
