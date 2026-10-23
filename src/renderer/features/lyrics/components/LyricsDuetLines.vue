<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  LyricsAssignment,
  LyricsEditorState,
  LyricsEditorLine,
  RetimeLyricsEditorLines,
} from '@shared/types/lyricsEditor'
import { MAX_TTML_LINE_CHARACTERS } from '@shared/types/lyricsEditor'
import { formatTtmlEditorTime, parseTtmlEditorTime } from '../utils/ttmlTimeEditing'
import { groupSimultaneousLyrics } from '../utils/groupSimultaneousLyrics'

const props = defineProps<{
  session: LyricsEditorState
  busy: boolean
  currentTime?: number
  matchesPlayback?: boolean
  inactive?: boolean
  replaceText?: (lineId: string, text: string) => Promise<boolean>
}>()
const emit = defineEmits<{
  assign: [lineIds: string[], assignment: LyricsAssignment]
  retime: [lineIds: string[], mode: RetimeLyricsEditorLines['mode'], valueMs: number]
  'text-edit-state': [active: boolean, dirty: boolean]
}>()
const { t } = useI18n()
const listId = useId()
const list = ref<HTMLElement | null>(null)
const selected = ref(new Set<string>())
const focused = ref<string | null>(null)
let anchor: string | null = null
const editing = ref<{ lineId: string; initial: string; text: string; sessionId: string } | null>(
  null,
)
const lineEditor = ref<HTMLTextAreaElement | null>(null)
const textSubmitting = ref(false)
const textComposing = ref(false)
const invalidText = computed(
  () =>
    !!editing.value &&
    (editing.value.text.length > MAX_TTML_LINE_CHARACTERS ||
      /[\r\n\u2028\u2029]/u.test(editing.value.text)),
)
const groups = computed(() => groupSimultaneousLyrics(props.session.lines))
const editableLines = computed(() =>
  groups.value.flatMap((group) => group.lines).filter((line) => line.editable),
)
const enabled = computed(() => props.session.editable && !props.busy && !props.inactive)
const allSelected = computed(
  () => editableLines.value.length > 0 && selected.value.size === editableLines.value.length,
)
const canAssign = computed(() => enabled.value && !editing.value && selected.value.size > 0)
const selectedLines = computed(() =>
  props.session.lines.filter((line) => selected.value.has(line.id)),
)
const canRetime = computed(
  () =>
    enabled.value &&
    !editing.value &&
    selectedLines.value.length > 0 &&
    selectedLines.value.length <= 10000 &&
    selectedLines.value.every((line) => line.timingEditable),
)
const singleLine = computed(() =>
  selectedLines.value.length === 1 ? selectedLines.value[0] : null,
)
const canSetTime = computed(() => canRetime.value && !!singleLine.value)
const canStamp = computed(
  () => canSetTime.value && props.matchesPlayback && Number.isFinite(props.currentTime),
)
const timeText = ref('')
const invalidTime = ref(false)
const endText = ref('')
const invalidEndTime = ref(false)
watch(
  () => [
    singleLine.value?.id,
    singleLine.value?.timeSeconds,
    singleLine.value?.endTimeSeconds,
    props.session.sessionId,
  ],
  () => {
    timeText.value =
      singleLine.value?.timeSeconds == null
        ? ''
        : formatTtmlEditorTime(singleLine.value.timeSeconds)
    invalidTime.value = false
    resetEndTime()
  },
  { immediate: true },
)

watch(
  () => props.session.sessionId,
  () => {
    editing.value = null
    textSubmitting.value = false
    textComposing.value = false
    publishTextState()
    selected.value = new Set()
    focused.value = editableLines.value[0]?.id ?? null
    anchor = null
  },
  { immediate: true },
)

function choose(id: string, extend: boolean, toggle: boolean): void {
  if (!enabled.value || editing.value || !editableLines.value.some((line) => line.id === id)) return
  if (extend && anchor) {
    const ids = editableLines.value.map((line) => line.id)
    const start = ids.indexOf(anchor)
    const end = ids.indexOf(id)
    selected.value = new Set([
      ...(toggle ? selected.value : []),
      ...ids.slice(Math.min(start, end), Math.max(start, end) + 1),
    ])
  } else if (toggle) {
    const next = new Set(selected.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected.value = next
    anchor = id
  } else {
    selected.value = new Set([id])
    anchor = id
  }
  focused.value = id
}
function click(event: MouseEvent, id: string): void {
  if (editing.value) return
  choose(id, event.shiftKey, event.ctrlKey || event.metaKey)
  list.value?.focus({ preventScroll: true })
}
function check(event: MouseEvent, id: string): void {
  if (editing.value) return
  choose(id, event.shiftKey, true)
  list.value?.focus({ preventScroll: true })
}
function selectAll(): void {
  if (!enabled.value || editing.value) return
  selected.value = allSelected.value
    ? new Set()
    : new Set(editableLines.value.map((line) => line.id))
}
function keydown(event: KeyboardEvent): void {
  if (!enabled.value || editing.value || event.isComposing) return
  const modifier = event.ctrlKey || event.metaKey
  const rows = editableLines.value
  if (event.key === 'F2' && focused.value) {
    event.preventDefault()
    const line = rows.find((line) => line.id === focused.value)
    if (line) void beginTextEdit(line)
  } else if (modifier && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    event.stopPropagation()
    selected.value = new Set(rows.map((line) => line.id))
  } else if (event.key === ' ' && focused.value) {
    event.preventDefault()
    choose(focused.value, event.shiftKey, true)
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    if (!rows.length) return
    const index = Math.max(
      0,
      rows.findIndex((line) => line.id === focused.value),
    )
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
    const id = rows[next].id
    if (modifier && !event.shiftKey) focused.value = id
    else choose(id, event.shiftKey, modifier)
    document.getElementById(`${listId}-${id}`)?.scrollIntoView({ block: 'nearest' })
  }
}
function assign(assignment: LyricsAssignment): void {
  if (canAssign.value) emit('assign', [...selected.value], assignment)
}
function stamp(): void {
  if (canStamp.value)
    emit('retime', [...selected.value], 'set', Math.round(props.currentTime! * 1000))
}
function nudge(valueMs: number): void {
  if (canRetime.value) emit('retime', [...selected.value], 'shift', valueMs)
}
function commitTime(): void {
  if (!canSetTime.value) return
  const valueMs = parseTtmlEditorTime(timeText.value)
  invalidTime.value = valueMs === null
  if (valueMs !== null && valueMs !== Math.round(singleLine.value!.timeSeconds! * 1000))
    emit('retime', [...selected.value], 'set', valueMs)
}
function inputTime(event: Event): void {
  timeText.value = (event.target as HTMLInputElement).value
  invalidTime.value = false
}
function blurTime(event: KeyboardEvent): void {
  if (!event.isComposing) (event.target as HTMLInputElement).blur()
}
function resetTime(): void {
  timeText.value =
    singleLine.value?.timeSeconds == null ? '' : formatTtmlEditorTime(singleLine.value.timeSeconds)
  invalidTime.value = false
}
function inputEndTime(event: Event): void {
  endText.value = (event.target as HTMLInputElement).value
  invalidEndTime.value = false
}
function resetEndTime(): void {
  endText.value =
    singleLine.value?.endTimeSeconds == null
      ? ''
      : formatTtmlEditorTime(singleLine.value.endTimeSeconds)
  invalidEndTime.value = false
}
function commitEndTime(): void {
  if (!canSetTime.value) return
  const valueMs = parseTtmlEditorTime(endText.value)
  invalidEndTime.value =
    valueMs === null || valueMs <= Math.round(singleLine.value!.timeSeconds! * 1000)
  if (
    !invalidEndTime.value &&
    valueMs !== Math.round((singleLine.value?.endTimeSeconds ?? NaN) * 1000)
  )
    emit('retime', [...selected.value], 'set-end', valueMs!)
}
function publishTextState(): void {
  emit(
    'text-edit-state',
    !!editing.value,
    !!editing.value && editing.value.text !== editing.value.initial,
  )
}
function focus(): void {
  ;(lineEditor.value ?? list.value)?.focus({ preventScroll: true })
}
function setLineEditor(element: unknown): void {
  lineEditor.value = element as HTMLTextAreaElement | null
}
async function beginTextEdit(line: LyricsEditorLine): Promise<void> {
  if (!enabled.value || editing.value || !line.textEditable || !props.replaceText) return
  choose(line.id, false, false)
  const initial = line.editableText ?? line.text
  editing.value = { lineId: line.id, initial, text: initial, sessionId: props.session.sessionId }
  publishTextState()
  await nextTick()
  lineEditor.value?.focus({ preventScroll: true })
  lineEditor.value?.select()
}
function inputText(event: Event): void {
  if (!editing.value || textSubmitting.value) return
  editing.value.text = (event.target as HTMLTextAreaElement).value
  publishTextState()
}
function textCompositionEnd(event: CompositionEvent): void {
  textComposing.value = false
  inputText(event)
}
function cancelTextEdit(): void {
  if (textSubmitting.value || props.busy) return
  editing.value = null
  textComposing.value = false
  publishTextState()
  void nextTick(() => list.value?.focus({ preventScroll: true }))
}
async function commitText(): Promise<boolean> {
  const draft = editing.value
  if (!draft) return true
  if (
    textSubmitting.value ||
    textComposing.value ||
    props.busy ||
    invalidText.value ||
    !props.replaceText
  )
    return false
  if (draft.text === draft.initial) {
    cancelTextEdit()
    return true
  }
  textSubmitting.value = true
  try {
    const accepted = await props.replaceText(draft.lineId, draft.text)
    if (editing.value !== draft || props.session.sessionId !== draft.sessionId) return false
    if (accepted) {
      editing.value = null
      publishTextState()
      await nextTick()
      list.value?.focus({ preventScroll: true })
    } else if (!props.inactive) {
      await nextTick()
      lineEditor.value?.focus({ preventScroll: true })
    }
    return accepted
  } finally {
    textSubmitting.value = false
  }
}
function textKeydown(event: KeyboardEvent): void {
  if (event.isComposing || textComposing.value || event.keyCode === 229) return
  if (event.key === 'Enter') {
    event.preventDefault()
    void commitText()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelTextEdit()
  }
}
defineExpose({ focus, stamp, commitText })
</script>

<template>
  <div class="duet-editor">
    <div class="duet-toolbar">
      <div class="duet-actions">
        <button
          data-action="performer-1"
          class="auralis-dialog-action"
          :disabled="!canAssign"
          @click="assign('performer-1')"
        >
          {{ t('lyricsEditor.performer1') }}
        </button>
        <button
          data-action="performer-2"
          class="auralis-dialog-action"
          :disabled="!canAssign"
          @click="assign('performer-2')"
        >
          {{ t('lyricsEditor.performer2') }}
        </button>
        <button
          data-action="together"
          class="auralis-dialog-action"
          :disabled="!canAssign"
          @click="assign('together')"
        >
          {{ t('lyricsEditor.together') }}
        </button>
        <button
          data-action="unassigned"
          class="auralis-dialog-action"
          :disabled="!canAssign"
          @click="assign('unassigned')"
        >
          {{ t('lyricsEditor.clearAssignment') }}
        </button>
      </div>
      <button
        data-action="select-all"
        class="auralis-dialog-action"
        :disabled="!enabled || !!editing || !editableLines.length"
        @click="selectAll"
      >
        {{ t(allSelected ? 'lyricsEditor.deselectAll' : 'lyricsEditor.selectAll') }}
      </button>
    </div>
    <div class="duet-timing">
      <label class="duet-time-field">
        <span>{{ t('lyricsEditor.startTime') }}</span>
        <input
          v-tooltip="
            invalidTime ? t('lyricsEditor.errors.invalidTime') : t('lyricsEditor.startTime')
          "
          class="duet-time-input"
          type="text"
          maxlength="32"
          spellcheck="false"
          placeholder="—"
          :value="timeText"
          :disabled="!canSetTime"
          :aria-label="t('lyricsEditor.startTime')"
          :aria-invalid="invalidTime || undefined"
          @input="inputTime"
          @change="commitTime"
          @keydown.enter.prevent="blurTime"
          @keydown.esc.stop="resetTime"
        />
      </label>
      <label class="duet-time-field">
        <span>{{ t('lyricsEditor.endTime') }}</span>
        <input
          v-tooltip="
            invalidEndTime ? t('lyricsEditor.errors.invalidEndTime') : t('lyricsEditor.endTime')
          "
          class="duet-time-input"
          type="text"
          maxlength="32"
          spellcheck="false"
          placeholder="—"
          :value="endText"
          :disabled="!canSetTime"
          :aria-label="t('lyricsEditor.endTime')"
          :aria-invalid="invalidEndTime || undefined"
          @input="inputEndTime"
          @change="commitEndTime"
          @keydown.enter.prevent="blurTime"
          @keydown.esc.stop="resetEndTime"
        />
      </label>
      <button
        v-tooltip="t('lyricsEditor.updateTimeTooltip')"
        class="auralis-dialog-action auralis-dialog-action--primary duet-timing-button"
        data-action="set"
        :disabled="!canStamp"
        @mousedown.prevent
        @click="stamp"
      >
        {{ t('lyricsEditor.updateTime') }}
      </button>
      <button
        v-tooltip="t('lyricsEditor.earlierSelectionTooltip')"
        class="auralis-dialog-action duet-timing-button"
        data-action="earlier"
        :disabled="!canRetime"
        @mousedown.prevent
        @click="nudge(-100)"
      >
        {{ t('lyricsEditor.earlier') }}
      </button>
      <button
        v-tooltip="t('lyricsEditor.laterSelectionTooltip')"
        class="auralis-dialog-action duet-timing-button"
        data-action="later"
        :disabled="!canRetime"
        @mousedown.prevent
        @click="nudge(100)"
      >
        {{ t('lyricsEditor.later') }}
      </button>
    </div>
    <div
      ref="list"
      class="duet-lines"
      :class="{ 'duet-lines--text-editing': !!editing }"
      role="listbox"
      tabindex="0"
      aria-multiselectable="true"
      :aria-label="t('lyricsEditor.duetLines')"
      :aria-busy="busy"
      :aria-disabled="!enabled"
      :aria-activedescendant="!editing && focused ? `${listId}-${focused}` : undefined"
      @keydown="keydown"
      @mousedown.shift.prevent
    >
      <div
        v-for="group in groups"
        :key="group.id"
        class="duet-line-group"
        :class="{ 'duet-line-group--simultaneous': group.simultaneous }"
        :role="group.simultaneous ? 'group' : 'presentation'"
        :aria-label="group.simultaneous ? t('lyricsEditor.simultaneous') : undefined"
      >
        <div v-if="group.simultaneous" class="duet-group-title" aria-hidden="true">
          {{ t('lyricsEditor.simultaneous') }}
        </div>
        <div
          v-for="line in group.lines"
          :id="`${listId}-${line.id}`"
          :key="line.id"
          class="duet-line"
          :class="{
            'duet-line--selected': selected.has(line.id),
            'duet-line--focused': focused === line.id,
            'duet-line--readonly': !line.editable,
          }"
          role="option"
          :aria-selected="selected.has(line.id)"
          :aria-disabled="!enabled || !line.editable"
          @click="click($event, line.id)"
        >
          <!-- The checkbox mirrors aria-selected; keyboard selection stays on the listbox. -->
          <span class="duet-check" aria-hidden="true" @click.stop="check($event, line.id)">
            <span class="duet-checkbox">
              <span v-if="selected.has(line.id)" class="i-lucide-check" />
            </span>
          </span>
          <span class="duet-interval">
            <time class="duet-time" :aria-label="t('lyricsEditor.startTime')">{{
              line.timeSeconds === null ? '—' : formatTtmlEditorTime(line.timeSeconds)
            }}</time>
            <span class="duet-time-separator" aria-hidden="true">–</span>
            <time class="duet-time" :aria-label="t('lyricsEditor.endTime')">{{
              line.endTimeSeconds == null ? '—' : formatTtmlEditorTime(line.endTimeSeconds)
            }}</time>
          </span>
          <textarea
            v-if="editing?.lineId === line.id"
            :ref="setLineEditor"
            v-tooltip="invalidText ? t('lyricsEditor.errors.invalidLineText') : undefined"
            class="duet-text-editor"
            rows="2"
            spellcheck="false"
            :value="editing.text"
            :maxlength="MAX_TTML_LINE_CHARACTERS"
            :readonly="busy || inactive || textSubmitting"
            :aria-label="t('lyricsEditor.lineText')"
            :aria-invalid="invalidText || undefined"
            @input="inputText"
            @click.stop
            @dblclick.stop
            @keydown.stop="textKeydown"
            @compositionstart="textComposing = true"
            @compositionend="textCompositionEnd"
          />
          <span
            v-else
            class="duet-text"
            :class="{ 'duet-text--editable': line.textEditable && enabled && !editing }"
            @dblclick.stop="beginTextEdit(line)"
            >{{ line.text || '—' }}</span
          >
          <span class="duet-assignment">
            {{
              line.assignment === 'performer-1'
                ? t('lyricsEditor.performer1')
                : line.assignment === 'performer-2'
                  ? t('lyricsEditor.performer2')
                  : line.assignment === 'together'
                    ? t('lyricsEditor.together')
                    : line.assignment === 'unsupported'
                      ? t('lyricsEditor.readOnly')
                      : '—'
            }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.duet-editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  gap: 14px;
}
.duet-toolbar,
.duet-actions,
.duet-timing {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.duet-time-input {
  box-sizing: border-box;
  width: 118px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 6px;
  background: var(--auralis-control-bg);
  color: var(--auralis-text);
  font-family: inherit;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  font-variant-numeric: tabular-nums;
}
.duet-timing {
  align-items: flex-end;
}
.duet-time-field {
  display: grid;
  gap: 6px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.duet-time-input:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}
.duet-time-input[aria-invalid='true'] {
  border-color: var(--auralis-danger);
}
.duet-time-input:disabled {
  opacity: 0.4;
}
.duet-timing-button {
  box-sizing: border-box;
  width: 72px;
  height: 34px;
  padding: 0;
  font-weight: 600;
}
.duet-toolbar {
  justify-content: space-between;
}
.duet-lines {
  flex: 1;
  min-height: 100px;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 6px;
  padding: 6px;
  color: var(--auralis-text);
  background: color-mix(in srgb, var(--auralis-main-bg) 92%, #000);
  box-shadow:
    inset 0 2px 6px rgb(0 0 0 / 14%),
    inset 0 1px 2px rgb(0 0 0 / 12%),
    0 1px 0 color-mix(in srgb, var(--auralis-main-bg) 86%, #fff);
}
.duet-lines:focus-visible {
  outline: 1px solid var(--auralis-focus-ring);
  outline-offset: -1px;
}
.duet-line {
  display: grid;
  grid-template-columns: 20px 190px minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 4px;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  cursor: default;
  user-select: none;
}
.duet-line-group--simultaneous {
  margin-block: 6px;
  padding: 6px;
  border-inline-start: 2px solid var(--auralis-border-strong);
  border-radius: 4px;
  background: color-mix(in srgb, var(--auralis-control-primary-bg) 5%, transparent);
}
.duet-group-title {
  padding: 2px 12px 6px;
  color: var(--auralis-text-muted);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  font-weight: 600;
}
.duet-interval {
  display: flex;
  align-items: center;
  gap: 6px;
}
.duet-time-separator {
  color: var(--auralis-text-muted);
}
.duet-line:hover:not(.duet-line--readonly) {
  background: var(--auralis-control-hover-bg);
}
.duet-line--selected,
.duet-line--selected:hover:not(.duet-line--readonly) {
  color: var(--auralis-track-selected-text);
  background: var(--auralis-track-selected-bg);
}
.duet-lines:focus-visible .duet-line--focused {
  outline: 1px solid currentColor;
  outline-offset: -2px;
}
.duet-check {
  display: grid;
  place-items: center;
  width: 20px;
  height: var(--auralis-type-control-line-height);
  cursor: pointer;
}
.duet-checkbox {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 17px;
  height: 17px;
  border: 1px solid var(--auralis-border-strong);
  border-radius: 4px;
  background: transparent;
}
.duet-line--selected .duet-checkbox {
  border-color: var(--auralis-control-primary-bg);
  background: var(--auralis-control-primary-bg);
  color: var(--auralis-control-primary-text);
}
.duet-checkbox > span {
  width: 13px;
  height: 13px;
}
.duet-line[aria-disabled='true'] .duet-check {
  cursor: default;
  opacity: 0.4;
}
.duet-lines--text-editing .duet-check {
  cursor: default;
  opacity: 0.4;
}
.duet-time {
  font-variant-numeric: tabular-nums;
}
.duet-time,
.duet-assignment {
  opacity: 0.65;
  white-space: nowrap;
}
.duet-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.duet-text--editable {
  cursor: text;
}
.duet-text-editor {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 48px;
  max-height: 180px;
  padding: 6px 8px;
  resize: vertical;
  border: 1px solid var(--auralis-focus-ring);
  border-radius: 4px;
  background: var(--auralis-dialog-bg);
  color: var(--auralis-text);
  font-family: inherit;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  user-select: text;
}
.duet-text-editor:focus {
  outline: 1px solid var(--auralis-focus-ring);
  outline-offset: -1px;
}
.duet-text-editor[aria-invalid='true'] {
  border-color: var(--auralis-danger);
}
.duet-line--readonly {
  color: var(--auralis-text-muted);
}
@media (max-width: 1000px) {
  .duet-line {
    grid-template-columns: 20px 90px minmax(0, 1fr) auto;
  }
  .duet-interval {
    display: grid;
    gap: 2px;
  }
  .duet-time-separator {
    display: none;
  }
}
</style>
