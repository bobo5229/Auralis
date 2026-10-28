<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import LyricsSaveMenu from './LyricsSaveMenu.vue'
import { useLyricsEditSession } from '../composables/useLyricsEditSession'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { MAX_LRC_EDITOR_CHARACTERS, type SaveLrcEditor } from '@shared/types/lyricsEditor'
import {
  formatLrcTime,
  getLrcTextLine,
  nudgeLrcLineTime,
  replaceLrcLineTime,
} from '../utils/lrcTextEditing'

const props = defineProps<{
  open: boolean
  returnFocusTo?: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const playback = usePlayback()
const editor = ref<HTMLTextAreaElement | null>(null)
const continueButton = ref<HTMLButtonElement | null>(null)
const cursor = ref(0)
const composing = ref(false)
const editSession = useLyricsEditSession({
  isOpen: () => props.open,
  t,
  composing: () => composing.value,
  onLrcLoaded: () => {
    cursor.value = 0
    history = []
    historyIndex.value = -1
    record()
  },
  focusEditor: (resetSelection = false) => {
    editor.value?.focus({ preventScroll: true })
    if (resetSelection) editor.value?.setSelectionRange(0, 0)
  },
  onClose: () => emit('close'),
})
const {
  session,
  trackId,
  text,
  baseline,
  loading,
  saving,
  confirming,
  error,
  notice,
  busy,
  dirty,
  editable,
  canSave,
  canSaveTarget,
  reload: load,
  saveLrc: save,
  failure,
} = editSession
const saveButton = ref<HTMLButtonElement | null>(null)
const saveMenuOpen = ref(false)
const saveMenuVisible = ref(false)
const saveMenuCloseAfter = ref(false)
const saveActions = computed(() => [
  {
    target: 'tag' as const,
    label: t('lyricsEditor.tag'),
    disabled: !canSaveTarget('tag'),
    icon: 'i-lucide-tag',
  },
  {
    target: 'file' as const,
    label: t('lyricsEditor.file'),
    disabled: !canSaveTarget('file'),
    icon: 'i-lucide-file-text',
  },
])

function openSaveMenu(closeAfter = false): void {
  if (!canSave.value) return
  saveMenuCloseAfter.value = closeAfter
  saveMenuOpen.value = !saveMenuOpen.value
}
function closeSaveMenu(reason: string): void {
  saveMenuOpen.value = false
  if (reason !== 'outside') void nextTick(() => saveButton.value?.focus({ preventScroll: true }))
}
function selectSaveAction(target: SaveLrcEditor['target']): void {
  if (!canSaveTarget(target)) return
  const closeAfter = saveMenuCloseAfter.value
  saveMenuOpen.value = false
  void save(target, closeAfter)
  void nextTick(() => editor.value?.focus({ preventScroll: true }))
}
interface Snapshot {
  text: string
  start: number
  end: number
}
let history: Snapshot[] = []
const historyIndex = ref(-1)
const historyLength = ref(0)
const line = computed(() => getLrcTextLine(text.value, cursor.value))
const matchesPlayback = computed(
  () => trackId.value !== null && trackId.value === playback.state.currentTrackId,
)
const canStamp = computed(
  () => editable.value && !composing.value && matchesPlayback.value && line.value.editable,
)
const canNudge = computed(
  () => editable.value && !composing.value && line.value.editable && !!line.value.timestamp,
)

function snapshot(): Snapshot {
  return {
    text: text.value,
    start: editor.value?.selectionStart ?? 0,
    end: editor.value?.selectionEnd ?? 0,
  }
}
function record(): void {
  if (history[historyIndex.value]?.text === text.value) return
  history.splice(historyIndex.value + 1)
  history.push(snapshot())
  let size = history.reduce((sum, entry) => sum + entry.text.length, 0)
  while (history.length > 1 && (history.length > 150 || size > MAX_LRC_EDITOR_CHARACTERS * 8))
    size -= history.shift()!.text.length
  historyIndex.value = history.length - 1
  historyLength.value = history.length
}
function syncCursor(): void {
  cursor.value = editor.value?.selectionStart ?? 0
}
function beforeInput(event: InputEvent): void {
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    event.preventDefault()
    undo(event.inputType === 'historyUndo' ? -1 : 1)
  } else if (!composing.value && history[historyIndex.value])
    history[historyIndex.value] = snapshot()
}
function input(event: Event): void {
  text.value = (event.target as HTMLTextAreaElement).value
  syncCursor()
  if (!composing.value) record()
  notice.value = ''
}
function compositionEnd(event: CompositionEvent): void {
  composing.value = false
  input(event)
}
async function replaceLine(value: string | null): Promise<void> {
  if (value === null || !editable.value || composing.value || !editor.value) return
  const current = line.value
  const updated = text.value.slice(0, current.start) + value + text.value.slice(current.end)
  if (updated.length > MAX_LRC_EDITOR_CHARACTERS) return
  history[historyIndex.value] = snapshot()
  text.value = updated
  await nextTick()
  editor.value?.focus({ preventScroll: true })
  editor.value?.setSelectionRange(current.start + value.length, current.start + value.length)
  syncCursor()
  record()
  notice.value = ''
}
function stamp(): void {
  if (canStamp.value) applyTimingEdit(replaceLrcLineTime(line.value, playback.state.currentTime))
}
function nudge(delta: number): void {
  if (canNudge.value) applyTimingEdit(nudgeLrcLineTime(line.value, delta))
}
function applyTimingEdit(value: string | null): void {
  if (value === null) notice.value = t('lyricsEditor.cannotShift')
  else void replaceLine(value)
}
async function undo(direction: number): Promise<void> {
  const index = historyIndex.value + direction
  if (!editable.value || composing.value || index < 0 || index >= history.length) return
  const state = history[index]
  historyIndex.value = index
  text.value = state.text
  await nextTick()
  editor.value?.focus({ preventScroll: true })
  editor.value?.setSelectionRange(state.start, state.end)
  syncCursor()
  notice.value = ''
}
function keepEditing(): void {
  confirming.value = false
  void nextTick(() => {
    editor.value?.focus({ preventScroll: true })
  })
}
function requestClose(reason?: string): void {
  if (saveMenuOpen.value) {
    closeSaveMenu(reason ?? 'escape')
    return
  }
  if (busy.value || composing.value) return
  if (confirming.value && reason === 'escape') {
    keepEditing()
    return
  }
  if (!dirty.value) {
    emit('close')
    return
  }
  confirming.value = true
  void nextTick(() => continueButton.value?.focus())
}
function discard(): void {
  if (!busy.value) {
    baseline.value = text.value
    emit('close')
  }
}
function keydown(event: KeyboardEvent): void {
  if (event.isComposing || composing.value) return
  const modifier = event.ctrlKey || event.metaKey
  if (modifier && event.key.toLowerCase() === 's') {
    event.preventDefault()
    event.stopPropagation()
    if (!saveMenuOpen.value) openSaveMenu(confirming.value)
    return
  }
  if (confirming.value || saveMenuOpen.value) return
  if (modifier && event.shiftKey && event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    stamp()
  } else if (
    event.target === editor.value &&
    modifier &&
    ['z', 'y'].includes(event.key.toLowerCase())
  ) {
    event.preventDefault()
    event.stopPropagation()
    void undo(event.shiftKey || event.key.toLowerCase() === 'y' ? 1 : -1)
  }
}
function seek(event: Event): void {
  if (matchesPlayback.value) playback.seekTo(Number((event.target as HTMLInputElement).value))
}
async function togglePlay(): Promise<void> {
  if (!matchesPlayback.value) return
  try {
    await playback.togglePlayPause()
  } catch {
    failure('failed')
  }
}
function beforeUnload(event: BeforeUnloadEvent): void {
  if (props.open && dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
watch(
  () => props.open,
  (open) => {
    saveMenuOpen.value = false
    if (open) void editSession.open(playback.state.currentTrackId)
    else void editSession.close()
  },
  { immediate: true },
)
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  void editSession.close()
  window.removeEventListener('beforeunload', beforeUnload)
})
defineExpose({ requestClose })

function restoreLyricsFocus(captured: HTMLElement | null): void {
  const target = [
    props.returnFocusTo,
    captured,
    document.querySelector<HTMLElement>(
      '.lyrics-panel .synced-lyrics-scroll, .lyrics-panel .plain-lyrics-scroll',
    ),
  ].find(
    (element) =>
      element?.isConnected &&
      element !== document.body &&
      !element.matches(':disabled') &&
      !element.closest('[inert], [aria-hidden="true"]'),
  )
  target?.focus({ preventScroll: true })
}
</script>

<template>
  <AppDialog
    :open="open"
    :title="t('lyricsEditor.title')"
    title-id="lyrics-edit-dialog-title"
    :close-label="t('lyricsEditor.close')"
    :return-focus-to="returnFocusTo"
    :restore-focus="restoreLyricsFocus"
    panel-class="lyrics-editor-dialog"
    :busy="busy"
    :dismissible="!busy && !composing"
    :close-on-backdrop="false"
    fill
    :padded="false"
    :scroll="false"
    @keydown.capture="keydown"
    @close="requestClose"
  >
    <div class="lyrics-editor-content">
      <div class="editor-toolbar">
        <div class="editor-actions">
          <button
            v-tooltip="
              t(
                line.timestamp
                  ? 'lyricsEditor.updateTimeTooltip'
                  : 'lyricsEditor.insertTimeTooltip',
              )
            "
            class="auralis-dialog-action auralis-dialog-action--primary editor-timing-button"
            :disabled="!canStamp"
            @mousedown.prevent
            @click="stamp"
          >
            {{ t(line.timestamp ? 'lyricsEditor.updateTime' : 'lyricsEditor.insertTime') }}
          </button>
          <button
            v-tooltip="t('lyricsEditor.earlierTooltip')"
            class="editor-tool editor-timing-button"
            :disabled="!canNudge"
            @mousedown.prevent
            @click="nudge(-0.1)"
          >
            {{ t('lyricsEditor.earlier') }}
          </button>
          <button
            v-tooltip="t('lyricsEditor.laterTooltip')"
            class="editor-tool editor-timing-button"
            :disabled="!canNudge"
            @mousedown.prevent
            @click="nudge(0.1)"
          >
            {{ t('lyricsEditor.later') }}
          </button>
        </div>
        <div class="editor-actions">
          <button
            class="editor-tool"
            :disabled="!editable || composing || historyIndex <= 0"
            @mousedown.prevent
            @click="undo(-1)"
          >
            {{ t('lyricsEditor.undo') }}
          </button>
          <button
            class="editor-tool"
            :disabled="!editable || composing || historyIndex >= historyLength - 1"
            @mousedown.prevent
            @click="undo(1)"
          >
            {{ t('lyricsEditor.redo') }}
          </button>
        </div>
      </div>
      <p v-if="line.enhanced" class="editor-notice">
        {{
          t(line.editable ? 'lyricsEditor.enhancedShiftHint' : 'lyricsEditor.enhancedManualHint')
        }}
      </p>
      <div class="editor-transport">
        <button
          class="editor-play"
          :disabled="!matchesPlayback || playback.isPlaybackPending.value"
          :aria-label="t(playback.state.isPlaying ? 'lyricsEditor.pause' : 'lyricsEditor.play')"
          @click="togglePlay"
        >
          <span
            :class="playback.state.isPlaying ? 'i-lucide-pause' : 'i-lucide-play'"
            aria-hidden="true"
          />
        </button>
        <output>{{ formatLrcTime(matchesPlayback ? playback.state.currentTime : 0) }}</output>
        <input
          type="range"
          min="0"
          :max="Math.max(1, playback.state.duration)"
          step="0.01"
          :value="matchesPlayback ? playback.state.currentTime : 0"
          :disabled="!matchesPlayback || playback.state.duration <= 0"
          :aria-label="t('lyricsEditor.position')"
          @input="seek"
        />
        <span>{{ formatLrcTime(matchesPlayback ? playback.state.duration : 0) }}</span>
      </div>
      <div class="editor-meta">
        <label for="lyrics-source-editor">{{ t('lyricsEditor.text') }}</label>
      </div>
      <div v-if="loading" class="editor-load" role="status">{{ t('lyricsEditor.loading') }}</div>
      <textarea
        v-else
        id="lyrics-source-editor"
        ref="editor"
        :value="text"
        :readonly="!editable"
        :maxlength="MAX_LRC_EDITOR_CHARACTERS"
        wrap="off"
        spellcheck="false"
        @beforeinput="beforeInput"
        @input="input"
        @select="syncCursor"
        @click="syncCursor"
        @keyup="syncCursor"
        @compositionstart="composing = true"
        @compositionend="compositionEnd"
      />
      <div v-if="!session && !busy" class="editor-status">
        <button class="editor-tool" @click="load">
          {{ t('lyricsEditor.reload') }}
        </button>
      </div>
      <p v-if="session?.tagWriteProtected" class="editor-notice" role="status">
        {{ t('lyricsEditor.tagTtmlProtected') }}
      </p>
      <p v-if="error" class="editor-error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <div v-if="confirming" class="editor-footer editor-confirm">
        <span>{{ t('lyricsEditor.saveChanges') }}</span>
        <div class="editor-actions">
          <button ref="continueButton" class="auralis-dialog-action" @click="keepEditing">
            {{ t('lyricsEditor.continue') }}</button
          ><button class="auralis-dialog-action" @click="discard">
            {{ t('lyricsEditor.discard') }}</button
          ><button
            id="lyrics-save-button"
            ref="saveButton"
            class="auralis-dialog-action auralis-dialog-action--primary"
            :class="{ 'editor-save-covered': saveMenuVisible }"
            :tabindex="saveMenuVisible ? -1 : undefined"
            :aria-hidden="saveMenuVisible || undefined"
            :disabled="!canSave"
            aria-haspopup="menu"
            :aria-expanded="saveMenuOpen"
            :aria-controls="saveMenuOpen ? 'lyrics-save-menu' : undefined"
            @click="openSaveMenu(true)"
          >
            {{ t('lyricsEditor.saveClose') }}
            <span class="i-lucide-chevron-down editor-save-chevron" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div v-else class="editor-footer editor-footer--save">
        <p v-if="notice" class="editor-notice" role="status">{{ notice }}</p>
        <button
          id="lyrics-save-button"
          ref="saveButton"
          class="auralis-dialog-action auralis-dialog-action--primary"
          :class="{ 'editor-save-covered': saveMenuVisible }"
          :tabindex="saveMenuVisible ? -1 : undefined"
          :aria-hidden="saveMenuVisible || undefined"
          :disabled="!canSave"
          aria-haspopup="menu"
          :aria-expanded="saveMenuOpen"
          :aria-controls="saveMenuOpen ? 'lyrics-save-menu' : undefined"
          @click="openSaveMenu()"
        >
          {{ t(saving ? 'lyricsEditor.saving' : 'lyricsEditor.save') }}
          <span class="i-lucide-chevron-down editor-save-chevron" aria-hidden="true" />
        </button>
      </div>
    </template>
    <template #overlay>
      <LyricsSaveMenu
        :open="saveMenuOpen"
        :anchor="saveButton"
        :label="t(saveMenuCloseAfter ? 'lyricsEditor.saveClose' : 'lyricsEditor.save')"
        :actions="saveActions"
        @select="selectSaveAction"
        @close="closeSaveMenu"
        @surface-change="saveMenuVisible = $event"
      />
    </template>
  </AppDialog>
</template>

<style scoped>
:global(.auralis-dialog-panel.lyrics-editor-dialog) {
  /* The anchored save menu extends beyond the panel; the body still clips its own content. */
  overflow: visible;
}
:deep(.auralis-dialog-header) {
  padding-inline: 24px;
}
.lyrics-editor-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 20px 24px 12px;
  gap: 14px;
}
.editor-meta,
.editor-status,
.editor-error,
.editor-notice {
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.editor-toolbar,
.editor-actions,
.editor-transport,
.editor-meta,
.editor-footer,
.editor-status {
  display: flex;
  align-items: center;
  gap: 8px;
}
.editor-toolbar,
.editor-meta,
.editor-footer,
.editor-status {
  justify-content: space-between;
}
.editor-toolbar,
.editor-footer,
.editor-actions {
  flex-wrap: wrap;
}
.editor-meta,
.editor-status,
.editor-transport {
  color: var(--auralis-text-muted);
}
.editor-meta label {
  color: var(--auralis-text);
  font-weight: 600;
}
.editor-tool {
  padding: 7px 12px;
  background: transparent;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 6px;
  color: var(--auralis-text);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.editor-tool:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
}
.editor-timing-button {
  box-sizing: border-box;
  flex: 0 0 72px;
  width: 72px;
  height: 34px;
  padding: 0;
  font-weight: 600;
}
.editor-tool:disabled,
.editor-play:disabled {
  opacity: 0.4;
  cursor: default;
}
.editor-tool:focus-visible,
.editor-play:focus-visible,
input:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}
.editor-transport {
  padding: 10px 12px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
  gap: 12px;
}
.editor-play {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--auralis-text-muted);
  cursor: pointer;
}
.editor-play:hover:not(:disabled) {
  color: var(--auralis-text);
}
.editor-play span {
  width: 16px;
  height: 16px;
}
.editor-transport input {
  min-width: 40px;
  flex: 1;
  accent-color: var(--auralis-control-primary-bg);
}
textarea {
  flex: 1;
  min-height: 100px;
  min-width: 0;
  width: 100%;
  resize: none;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 6px;
  padding: 16px 18px;
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-main-bg) 92%, #000);
  box-shadow:
    inset 0 2px 6px rgb(0 0 0 / 14%),
    inset 0 1px 2px rgb(0 0 0 / 12%),
    0 1px 0 color-mix(in srgb, var(--auralis-main-bg) 86%, #fff);
  font-family: Consolas, var(--auralis-font-ui);
  font-size: var(--auralis-type-control-size);
  line-height: 28px; /* Raw lyric lines use extra leading to make timestamps easier to edit. */
  overflow: auto;
  tab-size: 2;
}
textarea:focus {
  outline: 1px solid var(--auralis-focus-ring);
  outline-offset: -1px;
}
.editor-load {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--auralis-text-muted);
}
.editor-status {
  min-height: 18px;
}
.editor-error,
.editor-notice {
  margin: 0;
  overflow-wrap: anywhere;
}
.editor-error {
  color: var(--auralis-danger);
}
.editor-notice {
  color: var(--auralis-text-muted);
}
.editor-footer--save .editor-notice {
  flex: 1 1 220px;
  min-width: 0;
}
.editor-confirm {
  gap: 12px;
}
.editor-footer--save {
  justify-content: flex-end;
}
.editor-save-chevron {
  width: 14px;
  height: 14px;
  margin-inline-start: 6px;
  transition: transform 160ms ease-out;
}
.editor-save-covered {
  opacity: 0;
  pointer-events: none;
}
:where([data-reduced-motion='true']) .editor-save-chevron {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .editor-save-chevron {
    transition: none;
  }
}
</style>
