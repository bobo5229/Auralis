<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  AmdlDownloadMode,
  AmdlLogEvent,
  AmdlSelectionRequest,
  AmdlTaskProgress,
} from '@shared/types/amdl'
import type { ShellPresentation } from '@renderer/app/utils/shellPresentation'
import { useSidebarOwnedModal } from '@renderer/app/utils/useSidebarOwnedModal'

const props = withDefaults(
  defineProps<{
    open: boolean
    task: AmdlTaskProgress | null
    logs: AmdlLogEvent[]
    isStarting: boolean
    startError: string | null
    selectionRequest?: AmdlSelectionRequest | null
    selectionError?: string | null
    isSubmittingSelection?: boolean
    selectionSubmitted?: boolean
    presentation?: ShellPresentation
    triggerElement?: HTMLElement | null
  }>(),
  {
    selectionRequest: null,
    selectionError: null,
    isSubmittingSelection: false,
    selectionSubmitted: false,
    presentation: 'modern',
    triggerElement: null,
  },
)

const emit = defineEmits<{
  close: []
  start: [url: string, mode?: AmdlDownloadMode]
  submitSelection: [trackIndexes: number[]]
  cancel: []
}>()

const { t } = useI18n()

const inputUrl = ref('')
const selectedMode = ref<AmdlDownloadMode>('direct')
const selectedTrackIndexes = ref<number[]>([])
const showLogs = ref(false)
const dialogRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const triggerRef = computed(() => props.triggerElement)

useSidebarOwnedModal({
  isOpen: () => props.open,
  container: dialogRef,
  trigger: triggerRef,
  onEscape: () => emit('close'),
})

// Auto-focus input when opened
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void nextTick(() => {
        inputRef.value?.focus()
      })
    }
  },
)

// When a new selectionRequest arrives, clear selection so tracks default to unselected
watch(
  () => props.selectionRequest,
  (req) => {
    if (req) {
      selectedTrackIndexes.value = []
    }
  },
)

const isRunning = computed(() => {
  const state = props.task?.state
  return state === 'starting' || state === 'running'
})

const isSelectingStage = computed(() => {
  return props.task?.state === 'running' && props.task?.stage === 'selecting'
})

const canSubmit = computed(() => {
  return inputUrl.value.trim().length > 0 && !props.isStarting && !isRunning.value
})

const statusBadge = computed(() => {
  if (!props.task) return null

  // Terminal states take precedence
  if (props.task.state === 'completed') {
    return { text: t('download.status.completed'), class: 'download-status--success' }
  }
  if (props.task.state === 'already-exists') {
    return { text: t('download.status.alreadyExists'), class: 'download-status--info' }
  }
  if (props.task.state === 'failed') {
    return { text: t('download.status.failed'), class: 'download-status--error' }
  }
  if (props.task.state === 'cancelled') {
    return { text: t('download.status.cancelled'), class: 'download-status--neutral' }
  }

  // Running stages
  if (props.task.stage === 'selecting') {
    if (props.selectionSubmitted) {
      return { text: t('download.status.selectingSubmitted'), class: 'download-status--running' }
    }
    if (props.selectionRequest) {
      return { text: t('download.status.selectingReady'), class: 'download-status--running' }
    }
    return { text: t('download.status.selectingReading'), class: 'download-status--running' }
  }
  if (props.task.stage === 'launching' || props.task.stage === 'preparing') {
    return { text: t('download.status.preparing'), class: 'download-status--running' }
  }
  if (props.task.stage === 'downloading') {
    return { text: t('download.status.downloading'), class: 'download-status--running' }
  }
  if (props.task.stage === 'processing' || props.task.stage === 'finalizing') {
    return { text: t('download.status.processing'), class: 'download-status--running' }
  }

  return { text: t('download.status.preparing'), class: 'download-status--running' }
})

function setMode(mode: AmdlDownloadMode): void {
  if (props.isStarting || isRunning.value) return
  selectedMode.value = mode
}

function onSubmit(): void {
  if (!canSubmit.value) return
  emit('start', inputUrl.value.trim(), selectedMode.value)
}

function onCancel(): void {
  emit('cancel')
}

function toggleLogs(): void {
  showLogs.value = !showLogs.value
}

function isTrackSelected(index: number): boolean {
  return selectedTrackIndexes.value.includes(index)
}

function toggleTrack(index: number): void {
  if (props.selectionSubmitted || props.isSubmittingSelection) return
  const current = selectedTrackIndexes.value
  if (current.includes(index)) {
    selectedTrackIndexes.value = current.filter((i) => i !== index)
  } else {
    selectedTrackIndexes.value = [...current, index].sort((a, b) => a - b)
  }
}

function selectAllTracks(): void {
  if (props.selectionSubmitted || props.isSubmittingSelection || !props.selectionRequest) return
  selectedTrackIndexes.value = props.selectionRequest.tracks.map((t) => t.index)
}

function clearAllTracks(): void {
  if (props.selectionSubmitted || props.isSubmittingSelection) return
  selectedTrackIndexes.value = []
}

function onSubmitSelection(): void {
  if (
    selectedTrackIndexes.value.length === 0 ||
    props.selectionSubmitted ||
    props.isSubmittingSelection
  ) {
    return
  }
  emit('submitSelection', [...selectedTrackIndexes.value])
}
</script>

<template>
  <div
    v-if="open"
    class="sidebar-overlay smart-playlist-dialog-backdrop download-dialog-backdrop"
    :data-shell-presentation="presentation"
    @click.self="emit('close')"
  >
    <section
      ref="dialogRef"
      class="smart-playlist-dialog download-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('download.title')"
    >
      <div class="download-dialog-header">
        <h2>{{ t('download.title') }}</h2>
      </div>

      <form @submit.prevent="onSubmit">
        <!-- Field 1: Apple Music URL Input -->
        <div class="download-dialog-field">
          <label class="download-dialog-label" for="amdl-url-input">
            {{ t('download.urlLabel') }}
          </label>
          <input
            id="amdl-url-input"
            ref="inputRef"
            v-model="inputUrl"
            type="text"
            class="download-input"
            :placeholder="t('download.urlPlaceholder')"
            :disabled="isStarting || isRunning"
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <!-- Field 2: Download Mode Selection Cards -->
        <div v-if="!isRunning" class="download-dialog-field">
          <label class="download-dialog-label">
            {{ t('download.modeLabel') }}
          </label>
          <div class="download-mode-grid" role="radiogroup" :aria-label="t('download.modeLabel')">
            <button
              type="button"
              class="download-mode-card"
              :class="{ 'download-mode-card--selected': selectedMode === 'direct' }"
              :disabled="isStarting"
              role="radio"
              :aria-checked="selectedMode === 'direct'"
              @click="setMode('direct')"
            >
              <div class="download-mode-card-radio">
                <span class="download-mode-dot" aria-hidden="true"></span>
              </div>
              <div class="download-mode-card-content">
                <span class="download-mode-card-title">{{ t('download.modeDirect') }}</span>
                <span class="download-mode-card-desc">{{ t('download.modeDirectDesc') }}</span>
              </div>
            </button>

            <button
              type="button"
              class="download-mode-card"
              :class="{ 'download-mode-card--selected': selectedMode === 'select' }"
              :disabled="isStarting"
              role="radio"
              :aria-checked="selectedMode === 'select'"
              @click="setMode('select')"
            >
              <div class="download-mode-card-radio">
                <span class="download-mode-dot" aria-hidden="true"></span>
              </div>
              <div class="download-mode-card-content">
                <span class="download-mode-card-title">{{ t('download.modeSelect') }}</span>
                <span class="download-mode-card-desc">{{ t('download.modeSelectDesc') }}</span>
              </div>
            </button>
          </div>
        </div>

        <!-- General Start / Launch Error -->
        <p v-if="startError" class="smart-playlist-dialog-error">
          {{ startError }}
        </p>

        <!-- Status Card (running, terminal, or between steps) -->
        <div v-if="statusBadge" class="download-status-card">
          <span class="download-status-badge" :class="statusBadge.class">
            <span class="download-status-dot" aria-hidden="true"></span>
            {{ statusBadge.text }}
          </span>
          <span
            v-if="task?.state === 'failed' ? (task.error ?? task.message) : task?.message"
            class="download-status-msg"
            :title="
              task?.state === 'failed' ? (task.error ?? task.message ?? '') : (task?.message ?? '')
            "
          >
            {{ task?.state === 'failed' ? (task.error ?? task.message) : task?.message }}
          </span>
        </div>

        <!-- Selecting Stage 1: Loading selectable tracks -->
        <div
          v-if="isSelectingStage && !selectionRequest && !selectionSubmitted"
          class="download-state-panel download-state-panel--loading"
        >
          <span class="download-spinner" aria-hidden="true"></span>
          <div class="download-state-text">
            <span class="download-state-title">{{ t('download.loadingTracks') }}</span>
            <span class="download-state-hint">{{ t('download.selectTracksHint') }}</span>
          </div>
        </div>

        <!-- Selecting Stage 2: Interactive Track Selection List -->
        <div
          v-if="isSelectingStage && selectionRequest && !selectionSubmitted"
          class="download-selection-section"
        >
          <div class="download-selection-header">
            <div class="download-selection-count-group">
              <span class="download-selection-count-badge">
                {{ selectedTrackIndexes.length }}
              </span>
              <span class="download-selection-count-label">
                {{ t('download.selectedCount', { count: selectedTrackIndexes.length }) }}
              </span>
            </div>
            <div class="download-selection-tools">
              <button
                type="button"
                class="download-selection-tool-btn"
                :disabled="isSubmittingSelection"
                @click="selectAllTracks"
              >
                {{ t('download.selectAll') }}
              </button>
              <span class="download-selection-separator" aria-hidden="true">/</span>
              <button
                type="button"
                class="download-selection-tool-btn"
                :disabled="isSubmittingSelection || selectedTrackIndexes.length === 0"
                @click="clearAllTracks"
              >
                {{ t('download.clearAll') }}
              </button>
            </div>
          </div>

          <div class="download-tracks-list" role="listbox" aria-multiselectable="true">
            <div
              v-for="track in selectionRequest.tracks"
              :key="track.index"
              class="download-track-row"
              :class="{ 'download-track-row--selected': isTrackSelected(track.index) }"
              @click="toggleTrack(track.index)"
            >
              <input
                type="checkbox"
                class="download-track-checkbox"
                :checked="isTrackSelected(track.index)"
                :disabled="isSubmittingSelection"
                tabindex="-1"
                @click.stop="toggleTrack(track.index)"
              />
              <span class="download-track-index">{{ track.index }}</span>
              <span class="download-track-title" :title="track.title">{{ track.title }}</span>
            </div>
          </div>

          <p v-if="selectionError" class="smart-playlist-dialog-error">
            {{ selectionError }}
          </p>
        </div>

        <!-- Selecting Stage 3: Selection submitted banner -->
        <div
          v-if="isSelectingStage && selectionSubmitted"
          class="download-state-panel download-state-panel--submitted"
        >
          <span class="download-spinner" aria-hidden="true"></span>
          <div class="download-state-text">
            <span class="download-state-title">{{ t('download.submittingSelection') }}</span>
            <span class="download-state-hint">{{ t('download.selectionSubmitted') }}</span>
          </div>
        </div>

        <!-- Log Viewer Collapsible -->
        <div v-if="logs.length > 0" class="download-logs-section">
          <button
            type="button"
            class="download-logs-toggle"
            :aria-expanded="showLogs"
            @click="toggleLogs"
          >
            <span
              :class="showLogs ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              aria-hidden="true"
            ></span>
            <span>{{ showLogs ? t('download.hideLogs') : t('download.showLogs') }}</span>
            <span class="download-logs-count">({{ logs.length }})</span>
          </button>

          <div v-if="showLogs" class="download-logs-viewer" role="log">
            <div
              v-for="(log, index) in logs"
              :key="index"
              class="download-log-line"
              :class="
                log.stream === 'stderr' ? 'download-log-line--stderr' : 'download-log-line--stdout'
              "
            >
              {{ log.line }}
            </div>
          </div>
        </div>

        <!-- Dialog Footer Action Buttons -->
        <div class="smart-playlist-dialog-actions download-dialog-actions">
          <button type="button" class="download-action-btn" @click="emit('close')">
            {{ t('download.closeAction') }}
          </button>

          <template v-if="isSelectingStage && selectionRequest && !selectionSubmitted">
            <button
              type="button"
              class="download-action-btn download-btn-cancel smart-playlist-dialog-danger"
              :disabled="isSubmittingSelection"
              @click="onCancel"
            >
              {{ t('download.cancelAction') }}
            </button>
            <button
              type="button"
              class="download-action-btn smart-playlist-dialog-primary"
              :disabled="selectedTrackIndexes.length === 0 || isSubmittingSelection"
              @click="onSubmitSelection"
            >
              {{ t('download.downloadSelected') }}
            </button>
          </template>

          <template v-else-if="isRunning">
            <button
              type="button"
              class="download-action-btn download-btn-cancel smart-playlist-dialog-danger"
              @click="onCancel"
            >
              {{ t('download.cancelAction') }}
            </button>
          </template>

          <template v-else>
            <button
              type="submit"
              class="download-action-btn smart-playlist-dialog-primary"
              :disabled="!canSubmit"
            >
              {{ t('download.startAction') }}
            </button>
          </template>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.download-dialog {
  width: min(480px, calc(100vw - 48px));
  background: var(--auralis-dialog-bg, #181c1f);
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}

.download-dialog-header {
  margin-bottom: 16px;
}

.download-dialog-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--auralis-text, #f1f5f9);
  letter-spacing: -0.01em;
}

.download-dialog-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.download-dialog-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--auralis-text-muted, #94a3b8);
}

.download-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.1));
  background: var(--auralis-control-bg, rgba(255, 255, 255, 0.04));
  color: var(--auralis-text, #f1f5f9);
  font-size: 13px;
  outline: none;
  transition: border-color 150ms ease, background-color 150ms ease;
}

.download-input:focus {
  border-color: var(--auralis-focus-ring, #38bdf8);
  background: var(--auralis-control-hover-bg, rgba(255, 255, 255, 0.06));
}

.download-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Option Cards for Mode Selection */
.download-mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.download-mode-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.08));
  background: var(--auralis-control-bg, rgba(255, 255, 255, 0.03));
  text-align: left;
  cursor: pointer;
  transition: all 140ms ease;
}

.download-mode-card:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.16);
  background: var(--auralis-control-hover-bg, rgba(255, 255, 255, 0.06));
}

.download-mode-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.download-mode-card--selected {
  border-color: var(--auralis-focus-ring, #38bdf8);
  background: color-mix(in srgb, var(--auralis-focus-ring, #38bdf8) 8%, var(--auralis-control-bg, rgba(255, 255, 255, 0.03)));
}

.download-mode-card-radio {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border-radius: 50%;
  border: 1.5px solid var(--auralis-text-muted, #94a3b8);
  flex-shrink: 0;
  transition: border-color 140ms ease;
}

.download-mode-card--selected .download-mode-card-radio {
  border-color: var(--auralis-focus-ring, #38bdf8);
}

.download-mode-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
  transition: background-color 140ms ease;
}

.download-mode-card--selected .download-mode-dot {
  background: var(--auralis-focus-ring, #38bdf8);
}

.download-mode-card-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.download-mode-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--auralis-text, #f1f5f9);
}

.download-mode-card-desc {
  font-size: 11px;
  line-height: 1.35;
  color: var(--auralis-text-muted, #94a3b8);
}

/* Status Indicator Card */
.download-status-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  margin-bottom: 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--auralis-dialog-bg, #181c1f) 85%, black 15%);
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.08));
  font-size: 12px;
}

.download-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  white-space: nowrap;
}

.download-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.download-status--running {
  color: #38bdf8;
}

.download-status--success {
  color: #4ade80;
}

.download-status--info {
  color: #facc15;
}

.download-status--error {
  color: #f87171;
}

.download-status--neutral {
  color: var(--auralis-text-muted, #94a3b8);
}

.download-status-msg {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--auralis-text-muted, #94a3b8);
  font-size: 11px;
}

/* State Panel (Loading & Submitted) */
.download-state-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--auralis-dialog-bg, #181c1f) 90%, black 10%);
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.08));
}

.download-state-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.download-state-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--auralis-text, #f1f5f9);
}

.download-state-hint {
  font-size: 11px;
  color: var(--auralis-text-muted, #94a3b8);
}

.download-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.15));
  border-top-color: var(--auralis-focus-ring, #38bdf8);
  border-radius: 50%;
  flex-shrink: 0;
  animation: download-spin 750ms linear infinite;
}

@keyframes download-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Interactive Track Selection Section */
.download-selection-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.download-selection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.download-selection-count-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.download-selection-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--auralis-focus-ring, #38bdf8) 20%, transparent);
  color: var(--auralis-focus-ring, #38bdf8);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.download-selection-count-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--auralis-text, #f1f5f9);
}

.download-selection-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.download-selection-tool-btn {
  background: transparent;
  border: none;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--auralis-text-muted, #94a3b8);
  cursor: pointer;
  transition: all 120ms ease;
}

.download-selection-tool-btn:hover:not(:disabled) {
  color: var(--auralis-text, #f1f5f9);
  background: var(--auralis-control-hover-bg, rgba(255, 255, 255, 0.06));
}

.download-selection-tool-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.download-selection-separator {
  font-size: 11px;
  color: var(--auralis-text-muted, #94a3b8);
  opacity: 0.3;
}

.download-tracks-list {
  max-height: 220px;
  overflow-y: auto;
  border-radius: 8px;
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.08));
  background: color-mix(in srgb, var(--auralis-dialog-bg, #181c1f) 75%, black 25%);
  scrollbar-width: thin;
}

.download-track-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-border-subtle, rgba(255, 255, 255, 0.08)) 50%, transparent);
  transition: background-color 100ms ease;
}

.download-track-row:last-child {
  border-bottom: none;
}

.download-track-row:hover {
  background: var(--auralis-control-hover-bg, rgba(255, 255, 255, 0.05));
}

.download-track-row--selected {
  background: color-mix(in srgb, var(--auralis-focus-ring, #38bdf8) 12%, transparent);
}

.download-track-checkbox {
  accent-color: var(--auralis-focus-ring, #38bdf8);
  cursor: pointer;
}

.download-track-index {
  font-size: 11px;
  min-width: 22px;
  font-weight: 600;
  color: var(--auralis-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.download-track-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--auralis-text, #f1f5f9);
}

/* Logs Drawer */
.download-logs-section {
  margin-top: 10px;
}

.download-logs-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--auralis-text-muted, #94a3b8);
  cursor: pointer;
  transition: color 150ms ease;
}

.download-logs-toggle:hover {
  color: var(--auralis-text, #f1f5f9);
}

.download-logs-count {
  font-size: 11px;
  opacity: 0.7;
}

.download-logs-viewer {
  margin-top: 6px;
  max-height: 150px;
  overflow-y: auto;
  padding: 8px 10px;
  border-radius: 8px;
  background: #0b0f17;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.download-log-line {
  margin-bottom: 2px;
}

.download-log-line--stderr {
  color: #f87171;
}

.download-log-line--stdout {
  color: #cbd5e1;
}

/* Action Buttons */
.download-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.download-action-btn {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  transition: all 120ms ease;
}
</style>

