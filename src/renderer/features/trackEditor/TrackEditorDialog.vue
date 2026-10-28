<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import { formatArtist } from '@renderer/shared/media/formatArtist'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import MetadataEditPage from '@renderer/features/library/components/MetadataEditPage.vue'
import LyricsEditPage from '@renderer/features/lyrics/components/LyricsEditPage.vue'
import { useLibraryMetadataEditor } from '@renderer/features/library/composables/useLibraryMetadataEditor'
import { metadataSaveFailureMessageKey } from '@renderer/features/library/utils/metadataSaveFailure'
import { createMetadataEditRequest } from '@shared/utils/metadataEditRequest'
import { auralis } from '@renderer/shared/ipc/client'
import type { TrackEditorRequest, TrackEditorTab } from './trackEditor'

const props = defineProps<{ request: TrackEditorRequest | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const active = ref<TrackEditorTab>('metadata')
const artworkFailed = ref(false)
const artworkUrl = computed(() => getArtworkUrl(props.request?.artworkCacheKey ?? null))
const lyricsLoaded = ref(false)
const metadataPage = ref<InstanceType<typeof MetadataEditPage> | null>(null)
const lyricsPage = ref<InstanceType<typeof LyricsEditPage> | null>(null)
const lyricsDirty = ref(false),
  lyricsBusy = ref(false),
  lyricsComposing = ref(false)
const confirming = ref(false)
const continueButton = ref<HTMLButtonElement | null>(null)
const tabButtons = ref<HTMLButtonElement[]>([])
let disposed = false
let lastRequest: TrackEditorRequest | null = null
const metadata = useLibraryMetadataEditor({
  loadTrackMetadata: (id) => auralis.metadata.getTrackEditSnapshot(id),
  updateTrackMetadata: (value, baseline) =>
    auralis.metadata.updateTrackMetadata(createMetadataEditRequest(value, baseline!)),
  retainAfterSave: true,
  onWriteCommitted: async () => {
    metadataPage.value?.markCommitted()
    await lyricsPage.value?.refreshCredentials()
  },
  showSaveSuccess: async (signal) => {
    // A normalized no-op save also accepts the current form as saved.
    metadataPage.value?.markCommitted()
    await metadataPage.value?.showSaveSuccess(signal)
  },
  isDisposed: () => disposed,
  getSaveErrorMessage: () => t('library.metadataEditor.errors.saveFailed'),
  getSaveFailureMessage: (reason) => t(metadataSaveFailureMessageKey(reason)),
  getLoadErrorMessage: () => t('library.metadataEditor.errors.loadFailed'),
  getQueryFailedMessage: () => t('library.metadataEditor.status.queryFailed'),
  getTrackEditState: (id) => auralis.metadata.getTrackEditState(id),
  onTrackEditStateChanged: (callback) => auralis.metadata.onTrackEditStateChanged(callback),
})
const {
  editingMetadata,
  isLoadingMetadata,
  isSavingMetadata,
  metadataEditError,
  editStatus,
  conflict,
} = metadata
const metadataDirty = computed(() => metadataPage.value?.dirty ?? false)
const busy = computed(() => isLoadingMetadata.value || isSavingMetadata.value || lyricsBusy.value)
const composing = computed(() => lyricsComposing.value || !!metadataPage.value?.composing)
const dirtyNames = computed(() =>
  [
    metadataDirty.value ? t('trackEditor.metadata') : '',
    lyricsDirty.value ? t('trackEditor.lyrics') : '',
  ]
    .filter(Boolean)
    .join('、'),
)
const songTitle = computed(() => editingMetadata.value?.title || t('lyricsEditor.unknownTitle'))
const songArtists = computed(
  () => formatArtist(editingMetadata.value?.artistDisplay) || t('lyricsEditor.unknownArtist'),
)
watch(
  () => props.request,
  (request) => {
    confirming.value = false
    artworkFailed.value = false
    lyricsLoaded.value = request?.initialTab === 'lyrics'
    lyricsDirty.value = lyricsBusy.value = lyricsComposing.value = false
    if (request) {
      lastRequest = request
      active.value = request.initialTab
      void metadata.open(request.trackId)
    } else metadata.close(false)
  },
  { immediate: true },
)
function selectTab(tab: TrackEditorTab): void {
  if (busy.value || confirming.value || composing.value) return
  active.value = tab
  if (tab === 'lyrics') lyricsLoaded.value = true
}
function tabKey(event: KeyboardEvent, index: number): void {
  if (busy.value || confirming.value || composing.value) return
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? 1
        : event.key === 'ArrowRight' || event.key === 'ArrowLeft'
          ? 1 - index
          : null
  if (next === null) return
  event.preventDefault()
  selectTab(next === 0 ? 'metadata' : 'lyrics')
  tabButtons.value[next]?.focus()
}
function focusPage(): void {
  if (active.value === 'metadata') metadataPage.value?.focus()
  else lyricsPage.value?.focus()
}
function keepEditing(): void {
  confirming.value = false
  void nextTick(focusPage)
}
function requestClose(reason?: string): void {
  if (busy.value || composing.value) return
  if (lyricsPage.value?.dismissMenu()) return
  if (confirming.value && reason === 'escape') {
    keepEditing()
    return
  }
  if (!metadataDirty.value && !lyricsDirty.value) {
    emit('close')
    return
  }
  confirming.value = true
  void nextTick(() => continueButton.value?.focus())
}
function keydown(event: KeyboardEvent): void {
  if (event.isComposing || composing.value) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    event.stopPropagation()
    if (busy.value || confirming.value) return
    if (active.value === 'metadata') metadataPage.value?.save()
    else lyricsPage.value?.save()
  }
}
function beforeUnload(event: BeforeUnloadEvent): void {
  if (props.request && (metadataDirty.value || lyricsDirty.value)) {
    event.preventDefault()
    event.returnValue = ''
  }
}
async function restoreFocus(captured: HTMLElement | null): Promise<void> {
  const request = lastRequest
  // Capture the closing request before the parent clears it.
  const target = [request?.returnFocusTo, captured].find(
    (element) =>
      element?.isConnected &&
      element !== document.body &&
      !element.matches(':disabled') &&
      !element.closest('[inert], [aria-hidden="true"]'),
  )
  if (request?.restoreFocus && (await request.restoreFocus())) return
  const fallback = document.querySelector<HTMLElement>(
    '.app-main, .synced-lyrics-scroll, .plain-lyrics-scroll',
  )
  ;(target ?? fallback)?.focus({ preventScroll: true })
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  disposed = true
  metadata.dispose()
  window.removeEventListener('beforeunload', beforeUnload)
})
defineExpose({ requestClose })
</script>
<template>
  <AppDialog
    :open="!!request"
    :title="t('trackEditor.title')"
    title-id="track-editor-title"
    :close-label="t('dialog.close')"
    panel-class="track-editor-dialog"
    :busy="busy"
    :dismissible="!busy && !composing"
    :close-on-backdrop="false"
    :padded="false"
    :scroll="false"
    fill
    :return-focus-to="request?.returnFocusTo"
    :restore-focus="restoreFocus"
    @close="requestClose"
    @keydown.capture="keydown"
  >
    <template #header-leading>
      <div class="track-editor-artwork" aria-hidden="true">
        <img
          v-if="artworkUrl && !artworkFailed"
          :key="artworkUrl"
          :src="artworkUrl"
          alt=""
          draggable="false"
          @error="artworkFailed = true"
        />
        <span v-else class="i-lucide-music-2" />
      </div>
    </template>
    <template #subtitle>
      <div class="track-editor-subtitle">
        <p :title="songTitle">{{ songTitle }}</p>
        <p :title="songArtists">{{ songArtists }}</p>
      </div>
    </template>
    <div class="track-editor-layout">
      <div class="track-editor-tabs" role="tablist" :aria-label="t('trackEditor.title')">
        <button
          v-for="(tab, index) in ['metadata', 'lyrics'] as const"
          :id="`track-tab-${tab}`"
          :key="tab"
          :ref="
            (element) => {
              if (element) tabButtons[index] = element as HTMLButtonElement
            }
          "
          type="button"
          role="tab"
          :aria-selected="active === tab"
          :aria-controls="`track-page-${tab}`"
          :tabindex="active === tab ? 0 : -1"
          :disabled="busy || confirming || composing"
          @click="selectTab(tab)"
          @keydown="tabKey($event, index)"
        >
          {{ t(`trackEditor.${tab}`)
          }}<span
            v-if="tab === 'metadata' ? metadataDirty : lyricsDirty"
            class="track-editor-unsaved"
          >
            · {{ t('lyricsEditor.unsaved') }}</span
          >
        </button>
      </div>
      <div class="track-editor-pages" :inert="confirming || undefined">
        <section
          v-show="active === 'metadata'"
          id="track-page-metadata"
          role="tabpanel"
          aria-labelledby="track-tab-metadata"
        >
          <MetadataEditPage
            v-if="request"
            ref="metadataPage"
            :metadata="editingMetadata"
            :loading="isLoadingMetadata"
            :saving="isSavingMetadata"
            :active="active === 'metadata'"
            :disabled="busy || confirming || conflict"
            :error-message="conflict ? t('trackEditor.conflict') : metadataEditError"
            :edit-status="editStatus"
            @save="metadata.save"
            @retry-status="metadata.retryCheckStatus"
            @retry-load="metadata.retryLoad"
          >
            <template #footer-leading>
              <button
                type="button"
                class="auralis-dialog-action track-editor-cancel"
                :disabled="busy || confirming || composing"
                @click="requestClose()"
              >
                {{ t('library.metadataEditor.actions.cancel') }}
              </button>
            </template>
          </MetadataEditPage>
        </section>
        <section
          v-show="active === 'lyrics'"
          id="track-page-lyrics"
          role="tabpanel"
          aria-labelledby="track-tab-lyrics"
        >
          <LyricsEditPage
            v-if="request && lyricsLoaded"
            :key="request.trackId"
            ref="lyricsPage"
            :open="!!request"
            :track-id="request.trackId"
            :active="active === 'lyrics'"
            :disabled="busy || confirming || active !== 'lyrics'"
            :on-committed="metadata.refreshCredentials"
            @dirty-change="lyricsDirty = $event"
            @busy-change="lyricsBusy = $event"
            @composing-change="lyricsComposing = $event"
          />
        </section>
      </div>
    </div>
    <template v-if="confirming" #footer
      ><div class="track-editor-confirm">
        <p>{{ t('trackEditor.unsavedPages', { pages: dirtyNames }) }}</p>
        <div>
          <button ref="continueButton" class="auralis-dialog-action" @click="keepEditing">
            {{ t('lyricsEditor.continue') }}</button
          ><button class="auralis-dialog-action" @click="emit('close')">
            {{ t('trackEditor.discardAll') }}
          </button>
        </div>
      </div></template
    >
  </AppDialog>
</template>
<style scoped>
:global(.auralis-dialog-panel.track-editor-dialog) {
  overflow: visible;
  height: min(680px, calc(100dvh - 80px));
  border-radius: 20px;
}
:global(.track-editor-dialog .auralis-dialog-header) {
  margin-inline: 24px;
  padding: 18px 0 22px;
}
:global(.track-editor-dialog .auralis-dialog-title) {
  flex: 1;
}
.track-editor-artwork {
  position: relative;
  overflow: hidden;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  flex: none;
  width: 60px;
  height: 60px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--auralis-main-bg) 72%, #000);
  color: var(--auralis-text-muted);
}
.track-editor-artwork img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  border-radius: inherit;
}
.track-editor-artwork span {
  width: 26px;
  height: 26px;
}
:global(.track-editor-dialog .metadata-edit-footer .auralis-dialog-action),
.track-editor-confirm .auralis-dialog-action {
  min-height: 36px;
  box-sizing: border-box;
  border-radius: 12px;
  padding-inline: 18px;
}
.track-editor-cancel {
  border: 1px solid var(--auralis-border-subtle);
  background: transparent;
  font-weight: 400;
}
.track-editor-subtitle {
  margin: 4px 0 0;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}
.track-editor-subtitle p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-editor-subtitle p:first-child {
  color: var(--auralis-text);
}
.track-editor-subtitle p + p {
  margin-top: 2px;
}
.track-editor-layout {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}
.track-editor-tabs {
  display: flex;
  gap: 20px;
  padding: 12px 24px 0;
}
.track-editor-tabs button {
  padding: 10px 0 12px;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--auralis-text-muted);
  font: inherit;
  font-size: var(--auralis-type-body-size);
  line-height: var(--auralis-type-body-line-height);
  cursor: pointer;
}
.track-editor-tabs button[aria-selected='true'] {
  border-bottom-color: var(--auralis-control-primary-bg);
  color: var(--auralis-text);
  font-weight: 600;
}
.track-editor-tabs button:disabled {
  cursor: default;
  opacity: 0.5;
}
.track-editor-tabs button:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: -2px;
}
.track-editor-unsaved {
  font-size: var(--auralis-type-caption-size);
}
.track-editor-pages,
.track-editor-pages > section {
  min-height: 0;
  height: 100%;
}
.track-editor-pages[inert] :deep(.lyrics-edit-footer),
.track-editor-pages[inert] :deep(.metadata-edit-footer) {
  display: none;
}
.track-editor-confirm {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.track-editor-confirm p {
  margin: 0;
}
.track-editor-confirm > div {
  display: flex;
  gap: 8px;
}
@media (max-height: 600px) {
  :global(.track-editor-dialog .auralis-dialog-header) {
    padding-block: 12px;
  }
  .track-editor-artwork {
    width: 52px;
    height: 52px;
  }
  .track-editor-tabs {
    padding-top: 4px;
  }
}
@media (max-width: 600px) {
  :global(.track-editor-dialog .auralis-dialog-header) {
    margin-inline: 16px;
    gap: 12px;
  }
  .track-editor-tabs {
    padding-inline: 16px;
  }
}
</style>
