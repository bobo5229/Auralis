<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import markup from '../mac/archiveMac.html?raw'
import archiveMacCss from '../mac/archiveMac.css?raw'
import macAlbumWindowCss from '../mac/macAlbumWindow.css?raw'
import '../mac/archiveMacFonts.css'
import { mountArchiveMacView } from '../mac/mountArchiveMacView'
import { useArchiveMacData } from '../composables/useArchiveMacData'
import { useArchiveLibraryRefresh } from '../composables/useArchiveLibraryRefresh'
import { resolveArchiveFontFamily } from '../utils/resolveArchiveFontFamily'
import type { MacViewController } from '../mac/macViewTypes'
import { archiveSceneSession } from '../mac/archiveSceneSession'

const router = useRouter()
const { t, locale } = useI18n()
const canvasHost = ref<HTMLElement | null>(null)
const data = useArchiveMacData({
  initialDate: archiveSceneSession.date,
  initialAlbumKey: archiveSceneSession.albumKey,
})
useArchiveLibraryRefresh(data.refresh)
const view = shallowRef<MacViewController | null>(null)
const sceneReady = ref(false)

let disposed = false

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
    locale: locale.value as 'zh-Hans' | 'en',
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

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !sceneReady.value) {
    returnToPlayer()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
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
  root.innerHTML = `<style>${archiveMacCss}\n${macAlbumWindowCss}</style>${markup}`

  view.value = mountArchiveMacView(root, {
    onSceneReadyChange: (ready) => {
      sceneReady.value = ready
    },
    onSelectYear: (year) => data.selectYear(year),
    onBrowseYear: (year) => data.browseYear(year),
    onSelectDate: (date) => void data.selectDate(date),
    onSelectAlbum: (key) => data.selectAlbum(key),
    onRetryCalendar: () => data.retryCalendar(),
    onRetryDay: (date) => data.retryDay(date),
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  archiveSceneSession.date = data.selectedDate.value
  archiveSceneSession.albumKey = data.selectedAlbumKey.value
  disposed = true
  view.value?.dispose()
})
</script>

<template>
  <section class="archive-mac-page" :aria-label="t('archive.mac.pageAria')">
    <header class="archive-mac-header">
      <button
        v-if="sceneReady"
        type="button"
        class="archive-mac-back-btn archive-mac-intro-btn"
        @click="view?.returnToIntro()"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
          <path
            d="M4 6H1.5V3.5M1.5 6A6 6 0 1 1 2 11"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {{ t('archive.mac.backToIntro') }}
      </button>
    </header>
    <div ref="canvasHost" class="archive-mac-host" />
  </section>
</template>

<style scoped>
.archive-mac-page {
  --mac-font: var(--auralis-font-latin), 'Auralis Mac Pixel', 'Microsoft YaHei', sans-serif;
  font-synthesis: none;
  position: relative;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #030305;
  color: #f8fafc;
  overflow: hidden;
}
.archive-mac-header {
  position: absolute;
  inset: 0 0 auto;
  z-index: 3;
  height: 54px;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 124px 0 28px;
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
  border: 1px solid #8acbd538;
  border-radius: 3px;
  background: transparent;
  color: #b5d2d7;
  cursor: pointer;
  -webkit-app-region: no-drag;
  font-family: var(--mac-font, sans-serif);
  font-weight: 400;
  letter-spacing: 0.5px;
}
.archive-mac-back-btn:hover {
  border-color: #9aefe7;
  color: #9aefe7;
}
.archive-mac-back-btn:focus-visible {
  outline: 2px solid #9aefe7;
  outline-offset: 2px;
}
.archive-mac-intro-btn {
  margin-left: auto;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  white-space: nowrap;
}
.archive-mac-host {
  flex: 1;
  min-height: 0;
  width: 100%;
}
@media (max-width: 600px) {
  .archive-mac-header {
    height: 42px;
    gap: 12px;
    padding-top: 0;
  }
}
</style>
