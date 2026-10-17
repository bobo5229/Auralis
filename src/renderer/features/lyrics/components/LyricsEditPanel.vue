<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import LyricsSaveMenu from './LyricsSaveMenu.vue'
import LyricsDuetLines from './LyricsDuetLines.vue'
import { useDuetLyricsEditor } from '../composables/useDuetLyricsEditor'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import {
  MAX_LRC_EDITOR_CHARACTERS,
  type LyricsAssignment,
  type LrcEditorState,
  type SaveLrcEditor,
  type RetimeLyricsEditorLines,
} from '@shared/types/lyricsEditor'
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
const duetList = ref<InstanceType<typeof LyricsDuetLines> | null>(null)
const continueButton = ref<HTMLButtonElement | null>(null)
const session = ref<LrcEditorState | null>(null)
const trackId = ref<number | null>(null)
const text = ref('')
const baseline = ref('')
const cursor = ref(0)
const loading = ref(false)
const saving = ref(false)
const composing = ref(false)
const confirming = ref(false)
const error = ref('')
const notice = ref('')
const ttmlMode = ref(false)
const inlineEditing = ref(false)
const inlineDirty = ref(false)
const duet = useDuetLyricsEditor(failure)
const duetSession = duet.session
const busy = computed(() => loading.value || saving.value || duet.assigning.value)
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
  {
    target: 'ttml' as const,
    label: t('lyricsEditor.ttmlFile'),
    disabled: !canSaveTarget('ttml'),
    icon: 'i-lucide-file-code',
  },
])

function canSaveTarget(target: SaveLrcEditor['target']): boolean {
  return (
    editable.value &&
    !composing.value &&
    (target !== 'tag' || (!!session.value?.canSaveTag && dirty.value))
  )
}
function openSaveMenu(closeAfter = false): void {
  if (!canSave.value) return
  if (ttmlMode.value) {
    void saveDuet(closeAfter)
    return
  }
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
let generation = 0
interface Snapshot {
  text: string
  start: number
  end: number
}
let history: Snapshot[] = []
const historyIndex = ref(-1)
const historyLength = ref(0)
const dirty = computed(() =>
  ttmlMode.value ? !!duetSession.value?.dirty || inlineDirty.value : text.value !== baseline.value,
)
const line = computed(() => getLrcTextLine(text.value, cursor.value))
const editable = computed(() => !!session.value && !ttmlMode.value && !busy.value)
const matchesPlayback = computed(
  () => trackId.value !== null && trackId.value === playback.state.currentTrackId,
)
const canStamp = computed(
  () => editable.value && !composing.value && matchesPlayback.value && line.value.editable,
)
const canNudge = computed(
  () => editable.value && !composing.value && line.value.editable && !!line.value.timestamp,
)
const canSave = computed(() =>
  ttmlMode.value
    ? !!duetSession.value?.editable &&
      (!!duetSession.value?.dirty || inlineDirty.value) &&
      !busy.value
    : saveActions.value.some((action) => !action.disabled),
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
  if (canStamp.value) void replaceLine(replaceLrcLineTime(line.value, playback.state.currentTime))
}
function nudge(delta: number): void {
  if (canNudge.value) void replaceLine(nudgeLrcLineTime(line.value, delta))
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
async function release(): Promise<void> {
  const current = session.value
  session.value = null
  await duet.release()
  if (current) await auralis.lyrics.closeLrcEditor(current.sessionId).catch(() => undefined)
}
function failure(code: string, recoveryPath?: string): void {
  if (code === 'invalid-line-text') {
    error.value = t('lyricsEditor.errors.invalidLineText')
    return
  }
  if (code === 'invalid-end-time') {
    error.value = t('lyricsEditor.errors.invalidEndTime')
    return
  }
  if (code === 'invalid-time') {
    error.value = t('lyricsEditor.errors.invalidTime')
    return
  }
  if (
    ['unsupported-document', 'unsupported-timing', 'invalid-ttml', 'read-only-line'].includes(code)
  ) {
    error.value = t('lyricsEditor.errors.readOnly')
    return
  }
  if (code === 'invalid-lrc' || code === 'untimed-lines') {
    error.value = t(
      code === 'untimed-lines' ? 'lyricsEditor.errors.untimed' : 'lyricsEditor.errors.invalidLrc',
    )
    return
  }
  const key = ['file-changed', 'stale-revision', 'session-expired'].includes(code)
    ? 'changed'
    : code === 'busy'
      ? 'busy'
      : code === 'track-unavailable'
        ? 'unavailable'
        : 'failed'
  error.value = t(`lyricsEditor.errors.${key}`) + (recoveryPath ? ` ${recoveryPath}` : '')
}
async function load(): Promise<void> {
  if (saving.value || duet.assigning.value || trackId.value === null) return
  const id = trackId.value
  const token = ++generation
  loading.value = true
  error.value = ''
  notice.value = ''
  await release()
  if (token !== generation || !props.open) return
  try {
    const result = await auralis.lyrics.openLrcEditor(id)
    if (token !== generation || !props.open) {
      if (result.ok)
        void auralis.lyrics.closeLrcEditor(result.value.sessionId).catch(() => undefined)
      return
    }
    if (!result.ok) {
      failure(result.code)
      return
    }
    session.value = result.value
    ttmlMode.value = result.value.format === 'ttml'
    if (ttmlMode.value) {
      await duet.open(id)
      if (token !== generation || !props.open) return
      if (duetSession.value && !duetSession.value.editable) failure('unsupported-document')
      return
    }
    text.value = baseline.value = result.value.text.replace(/\r\n?/g, '\n')
    cursor.value = 0
    history = []
    historyIndex.value = -1
    record()
    await nextTick()
    editor.value?.focus({ preventScroll: true })
    editor.value?.setSelectionRange(0, 0)
  } catch {
    if (token === generation) failure('failed')
  } finally {
    if (token === generation) {
      loading.value = false
      await nextTick()
      if (ttmlMode.value) duetList.value?.focus()
      else editor.value?.focus({ preventScroll: true })
    }
  }
}
async function save(target: SaveLrcEditor['target'], closeAfter = false): Promise<void> {
  const current = session.value
  if (!current || !canSaveTarget(target)) return
  const token = generation
  const draft = text.value
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await auralis.lyrics.saveLrcEditor({
      sessionId: current.sessionId,
      expectedRevision: current.revision,
      text: draft,
      target,
    })
    if (token !== generation) return
    if (!result.ok) {
      failure(result.code, result.recoveryBackupPath)
      confirming.value = false
      return
    }
    baseline.value = draft
    session.value = null
    confirming.value = false
    if (
      closeAfter &&
      !result.value.writeWarning &&
      !result.value.conversionWarnings.includes('negative-times-clamped') &&
      !result.value.conversionWarnings.includes('inferred-final-end') &&
      result.value.cacheUpdated &&
      result.value.active
    ) {
      emit('close')
      return
    }
    notice.value = result.value.writeWarning
      ? t('lyricsEditor.writeWarning')
      : !result.value.cacheUpdated
        ? t('lyricsEditor.cachePending')
        : !result.value.active
          ? t('lyricsEditor.otherSource')
          : t(result.value.savedFormat === 'ttml' ? 'lyricsEditor.ttmlSaved' : 'lyricsEditor.saved')
    if (result.value.conversionWarnings.includes('negative-times-clamped'))
      notice.value += ` ${t('lyricsEditor.clampedTimes')}`
    if (result.value.conversionWarnings.includes('inferred-final-end'))
      notice.value += ` ${t('lyricsEditor.inferredEnd')}`
    // Reopen a fresh baseline for subsequent edits. Never retry the committed save.
    const reopened = await auralis.lyrics.openLrcEditor(current.trackId)
    if (token !== generation || !props.open) {
      if (reopened.ok)
        void auralis.lyrics.closeLrcEditor(reopened.value.sessionId).catch(() => undefined)
      return
    }
    if (reopened.ok) {
      session.value = reopened.value
      if (result.value.savedFormat === 'ttml') {
        ttmlMode.value = true
        await duet.open(current.trackId)
        if (token !== generation || !props.open) return
        if (duetSession.value && !duetSession.value.editable) failure('unsupported-document')
        await nextTick()
        duetList.value?.focus()
      }
    } else failure(reopened.code)
  } catch {
    if (token === generation) {
      failure('failed')
      confirming.value = false
    }
  } finally {
    if (token === generation) saving.value = false
  }
}
async function saveDuet(closeAfter = false): Promise<void> {
  if (!canSave.value) return
  const token = generation
  if (inlineEditing.value) {
    const committed = await duetList.value?.commitText()
    if (token !== generation || !props.open) return
    if (!committed) {
      confirming.value = false
      await nextTick()
      duetList.value?.focus()
      return
    }
  }
  const current = duetSession.value
  if (!current?.dirty || busy.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await auralis.lyrics.saveEditor({
      sessionId: current.sessionId,
      expectedRevision: current.revision,
    })
    if (token !== generation) return
    if (!result.ok) {
      failure(result.code, result.recoveryBackupPath)
      confirming.value = false
      return
    }
    // Saving consumes the server draft. Reopen rather than retrying a committed write.
    await duet.release()
    if (token !== generation || !props.open) return
    confirming.value = false
    if (closeAfter && result.value.cacheUpdated) {
      emit('close')
      return
    }
    notice.value = t(result.value.cacheUpdated ? 'lyricsEditor.saved' : 'lyricsEditor.cachePending')
    await duet.open(current.trackId)
    if (token === generation && duetSession.value && !duetSession.value.editable)
      failure('unsupported-document')
    if (token === generation) {
      await nextTick()
      duetList.value?.focus()
    }
  } catch {
    if (token === generation) {
      failure('failed')
      confirming.value = false
    }
  } finally {
    if (token === generation) saving.value = false
  }
}
function assignDuetLines(ids: string[], assignment: LyricsAssignment): void {
  if (busy.value || confirming.value) return
  error.value = ''
  notice.value = ''
  void duet.assign(ids, assignment)
}
function retimeDuetLines(
  ids: string[],
  mode: RetimeLyricsEditorLines['mode'],
  valueMs: number,
): void {
  if (busy.value || confirming.value) return
  error.value = ''
  notice.value = ''
  void duet.retime(ids, mode, valueMs)
}
async function replaceDuetText(lineId: string, value: string): Promise<boolean> {
  if (busy.value) return false
  error.value = ''
  notice.value = ''
  return duet.replaceText(lineId, value)
}
function textEditState(active: boolean, changed: boolean): void {
  inlineEditing.value = active
  inlineDirty.value = changed
}
function keepEditing(): void {
  confirming.value = false
  void nextTick(() => {
    if (ttmlMode.value) duetList.value?.focus()
    else editor.value?.focus({ preventScroll: true })
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
  if (confirming.value || saveMenuOpen.value || inlineEditing.value) return
  if (modifier && event.shiftKey && event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    if (ttmlMode.value) duetList.value?.stamp()
    else stamp()
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
    if (open) {
      inlineEditing.value = inlineDirty.value = false
      trackId.value = playback.state.currentTrackId
      confirming.value = false
      ttmlMode.value = false
      saveMenuOpen.value = false
      text.value = baseline.value = ''
      if (trackId.value === null) {
        error.value = t('lyricsEditor.errors.unavailable')
        return
      }
      void load()
    } else {
      inlineEditing.value = inlineDirty.value = false
      generation++
      saveMenuOpen.value = false
      loading.value = false
      saving.value = false
      confirming.value = false
      void release()
    }
  },
  { immediate: true },
)
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  generation++
  void release()
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
      <div v-if="!ttmlMode" class="editor-toolbar">
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
      <div v-if="!ttmlMode" class="editor-meta">
        <label for="lyrics-source-editor">{{
          t('lyricsEditor.text', { format: session?.format === 'ttml' ? 'TTML' : 'LRC' })
        }}</label>
      </div>
      <div v-if="loading" class="editor-load" role="status">{{ t('lyricsEditor.loading') }}</div>
      <LyricsDuetLines
        v-else-if="ttmlMode && duetSession"
        ref="duetList"
        :session="duetSession"
        :busy="busy"
        :inactive="confirming"
        :replace-text="replaceDuetText"
        :current-time="playback.state.currentTime"
        :matches-playback="matchesPlayback"
        @assign="assignDuetLines"
        @retime="retimeDuetLines"
        @text-edit-state="textEditState"
      />
      <textarea
        v-else-if="!ttmlMode"
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
      <div v-if="(!session || (ttmlMode && !duetSession)) && !busy" class="editor-status">
        <button class="editor-tool" @click="load">
          {{ t('lyricsEditor.reload') }}
        </button>
      </div>
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
            :aria-haspopup="ttmlMode ? undefined : 'menu'"
            :aria-expanded="ttmlMode ? undefined : saveMenuOpen"
            :aria-controls="saveMenuOpen ? 'lyrics-save-menu' : undefined"
            @click="openSaveMenu(true)"
          >
            {{ t('lyricsEditor.saveClose') }}
            <span
              v-if="!ttmlMode"
              class="i-lucide-chevron-down editor-save-chevron"
              aria-hidden="true"
            />
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
          :aria-haspopup="ttmlMode ? undefined : 'menu'"
          :aria-expanded="ttmlMode ? undefined : saveMenuOpen"
          :aria-controls="saveMenuOpen ? 'lyrics-save-menu' : undefined"
          @click="openSaveMenu()"
        >
          {{ t(saving ? 'lyricsEditor.saving' : 'lyricsEditor.save') }}
          <span
            v-if="!ttmlMode"
            class="i-lucide-chevron-down editor-save-chevron"
            aria-hidden="true"
          />
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
