<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  LyricsAssignment,
  LyricsEditorState,
  RetimeLyricsEditorLines,
} from '@shared/types/lyricsEditor'
import { formatTtmlEditorTime, parseTtmlEditorTime } from '../utils/ttmlTimeEditing'

const props = defineProps<{
  session: LyricsEditorState
  busy: boolean
  currentTime?: number
  matchesPlayback?: boolean
}>()
const emit = defineEmits<{
  assign: [lineIds: string[], assignment: LyricsAssignment]
  retime: [lineIds: string[], mode: RetimeLyricsEditorLines['mode'], valueMs: number]
}>()
const { t } = useI18n()
const listId = useId()
const list = ref<HTMLElement | null>(null)
const selected = ref(new Set<string>())
const focused = ref<string | null>(null)
let anchor: string | null = null
const editableLines = computed(() => props.session.lines.filter((line) => line.editable))
const enabled = computed(() => props.session.editable && !props.busy)
const allSelected = computed(
  () => editableLines.value.length > 0 && selected.value.size === editableLines.value.length,
)
const canAssign = computed(() => enabled.value && selected.value.size > 0)
const selectedLines = computed(() =>
  props.session.lines.filter((line) => selected.value.has(line.id)),
)
const canRetime = computed(
  () =>
    enabled.value &&
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
watch(
  () => [singleLine.value?.id, singleLine.value?.timeSeconds, props.session.sessionId],
  () => {
    timeText.value =
      singleLine.value?.timeSeconds == null
        ? ''
        : formatTtmlEditorTime(singleLine.value.timeSeconds)
    invalidTime.value = false
  },
  { immediate: true },
)

watch(
  () => props.session.sessionId,
  () => {
    selected.value = new Set()
    focused.value = editableLines.value[0]?.id ?? null
    anchor = null
  },
  { immediate: true },
)

function choose(id: string, extend: boolean, toggle: boolean): void {
  if (!enabled.value || !editableLines.value.some((line) => line.id === id)) return
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
  choose(id, event.shiftKey, event.ctrlKey || event.metaKey)
  list.value?.focus({ preventScroll: true })
}
function selectAll(): void {
  if (!enabled.value) return
  selected.value = allSelected.value
    ? new Set()
    : new Set(editableLines.value.map((line) => line.id))
}
function keydown(event: KeyboardEvent): void {
  if (!enabled.value || event.isComposing) return
  const modifier = event.ctrlKey || event.metaKey
  const rows = editableLines.value
  if (modifier && event.key.toLowerCase() === 'a') {
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
defineExpose({ focus: () => list.value?.focus({ preventScroll: true }), stamp })
</script>

<template>
  <div class="duet-editor">
    <div class="duet-toolbar">
      <div class="duet-actions">
        <button class="auralis-dialog-action" :disabled="!canAssign" @click="assign('performer-1')">
          {{ t('lyricsEditor.performer1') }}
        </button>
        <button class="auralis-dialog-action" :disabled="!canAssign" @click="assign('performer-2')">
          {{ t('lyricsEditor.performer2') }}
        </button>
        <button class="auralis-dialog-action" :disabled="!canAssign" @click="assign('unassigned')">
          {{ t('lyricsEditor.clearAssignment') }}
        </button>
      </div>
      <button
        class="auralis-dialog-action"
        :disabled="!enabled || !editableLines.length"
        @click="selectAll"
      >
        {{ t(allSelected ? 'lyricsEditor.deselectAll' : 'lyricsEditor.selectAll') }}
      </button>
    </div>
    <div class="duet-timing">
      <input
        :value="timeText"
        v-tooltip="invalidTime ? t('lyricsEditor.errors.invalidTime') : t('lyricsEditor.startTime')"
        class="duet-time-input"
        type="text"
        maxlength="32"
        spellcheck="false"
        placeholder="—"
        :disabled="!canSetTime"
        :aria-label="t('lyricsEditor.startTime')"
        :aria-invalid="invalidTime || undefined"
        @input="inputTime"
        @change="commitTime"
        @keydown.enter.prevent="blurTime"
        @keydown.esc.stop="resetTime"
      />
      <button
        v-tooltip="t('lyricsEditor.updateTimeTooltip')"
        class="auralis-dialog-action auralis-dialog-action--primary duet-timing-button"
        :disabled="!canStamp"
        @mousedown.prevent
        @click="stamp"
      >
        {{ t('lyricsEditor.updateTime') }}
      </button>
      <button
        v-tooltip="t('lyricsEditor.earlierSelectionTooltip')"
        class="auralis-dialog-action duet-timing-button"
        :disabled="!canRetime"
        @mousedown.prevent
        @click="nudge(-100)"
      >
        {{ t('lyricsEditor.earlier') }}
      </button>
      <button
        v-tooltip="t('lyricsEditor.laterSelectionTooltip')"
        class="auralis-dialog-action duet-timing-button"
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
      role="listbox"
      tabindex="0"
      aria-multiselectable="true"
      :aria-label="t('lyricsEditor.duetLines')"
      :aria-busy="busy"
      :aria-disabled="!enabled"
      :aria-activedescendant="focused ? `${listId}-${focused}` : undefined"
      @keydown="keydown"
      @mousedown.shift.prevent
    >
      <div
        v-for="line in session.lines"
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
        <span class="duet-check" aria-hidden="true">
          <span v-if="selected.has(line.id)" class="i-lucide-check" />
          <span v-else-if="!line.editable" class="i-lucide-lock-keyhole" />
        </span>
        <time class="duet-time">{{
          line.timeSeconds === null ? '—' : formatTtmlEditorTime(line.timeSeconds)
        }}</time>
        <span class="duet-text">{{ line.text || '—' }}</span>
        <span class="duet-assignment">
          {{
            line.assignment === 'performer-1'
              ? t('lyricsEditor.performer1')
              : line.assignment === 'performer-2'
                ? t('lyricsEditor.performer2')
                : line.assignment === 'unsupported'
                  ? t('lyricsEditor.readOnly')
                  : '—'
          }}
        </span>
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
  grid-template-columns: 16px 90px minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 4px;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  cursor: default;
  user-select: none;
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
  height: var(--auralis-type-control-line-height);
}
.duet-check > span {
  width: 14px;
  height: 14px;
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
.duet-line--readonly {
  color: var(--auralis-text-muted);
}
</style>
