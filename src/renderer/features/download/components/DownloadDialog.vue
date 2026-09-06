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
const selectTracksMode = ref(false)
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

function onSubmit(): void {
  if (!canSubmit.value) return
  emit('start', inputUrl.value.trim(), selectTracksMode.value ? 'select' : 'direct')
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
      <h2>{{ t('download.title') }}</h2>

      <form @submit.prevent="onSubmit">
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

        <!-- Select Mode Checkbox (before download starts) -->
        <div v-if="!isRunning" class="download-mode-option">
          <label class="download-mode-checkbox-label">
            <input
              v-model="selectTracksMode"
              type="checkbox"
              class="download-mode-checkbox"
              :disabled="isStarting"
            />
            <span>{{ t('download.selectTracksCheckbox') }}</span>
          </label>
        </div>

        <p v-if="startError" class="smart-playlist-dialog-error">
          {{ startError }}
        </p>

        <!-- Status Indicator while running or terminal -->
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

        <!-- Selecting Stage: Loading tracks placeholder -->
        <div
          v-if="isSelectingStage && !selectionRequest && !selectionSubmitted"
          class="download-selection-loading"
        >
          <span class="download-selection-spinner" aria-hidden="true"></span>
          <span>{{ t('download.loadingTracks') }}</span>
        </div>

        <!-- Selecting Stage: Interactive Track Table -->
        <div
          v-if="isSelectingStage && selectionRequest && !selectionSubmitted"
          class="download-selection-section"
        >
          <div class="download-selection-header">
            <span class="download-selection-count">
              {{ t('download.selectedCount', { count: selectedTrackIndexes.length }) }}
            </span>
            <div class="download-selection-tools">
              <button
                type="button"
                class="download-selection-tool-btn"
                :disabled="isSubmittingSelection"
                @click="selectAllTracks"
              >
                {{ t('download.selectAll') }}
              </button>
              <span class="download-selection-separator">|</span>
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

        <!-- Selecting Stage: Submitted state banner -->
        <div v-if="isSelectingStage && selectionSubmitted" class="download-selection-submitted">
          <span class="download-selection-spinner" aria-hidden="true"></span>
          <span>{{ t('download.selectionSubmitted') }}</span>
        </div>

        <!-- Log Drawer Toggle -->
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

        <div class="smart-playlist-dialog-actions download-dialog-actions">
          <button type="button" @click="emit('close')">
            {{ t('download.closeAction') }}
          </button>
          <template v-if="isSelectingStage && selectionRequest && !selectionSubmitted">
            <button
              type="button"
              class="download-btn-cancel smart-playlist-dialog-danger"
              :disabled="isSubmittingSelection"
              @click="onCancel"
            >
              {{ t('download.cancelAction') }}
            </button>
            <button
              type="button"
              class="smart-playlist-dialog-primary"
              :disabled="selectedTrackIndexes.length === 0 || isSubmittingSelection"
              @click="onSubmitSelection"
            >
              {{ t('download.downloadSelected') }}
            </button>
          </template>
          <template v-else-if="isRunning">
            <button
              type="button"
              class="download-btn-cancel smart-playlist-dialog-danger"
              @click="onCancel"
            >
              {{ t('download.cancelAction') }}
            </button>
          </template>
          <template v-else>
            <button type="submit" class="smart-playlist-dialog-primary" :disabled="!canSubmit">
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
  width: min(440px, calc(100vw - 48px));
}

.download-dialog-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.download-dialog-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--auralis-text-muted);
}

.download-status-card {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--auralis-dialog-bg) 80%, black 20%);
  border: 1px solid var(--auralis-border-subtle);
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
  width: 7px;
  height: 7px;
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
  color: var(--auralis-text-muted);
}

.download-status-msg {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--auralis-text-muted);
  font-size: 11px;
}

.download-logs-section {
  margin-top: 14px;
}

.download-logs-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--auralis-text-muted);
  cursor: pointer;
  transition: color 150ms ease;
}

.download-logs-toggle:hover {
  color: var(--auralis-text);
}

.download-logs-count {
  font-size: 11px;
  opacity: 0.7;
}

.download-logs-viewer {
  margin-top: 6px;
  max-height: 160px;
  overflow-y: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: #0f172a;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-all;
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

.download-dialog-actions {
  margin-top: 16px;
}

.download-mode-option {
  margin-top: -4px;
  margin-bottom: 12px;
}

.download-mode-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--auralis-text-muted);
  cursor: pointer;
  user-select: none;
}

.download-mode-checkbox-label:hover {
  color: var(--auralis-text);
}

.download-mode-checkbox {
  accent-color: var(--auralis-accent, #38bdf8);
  cursor: pointer;
}

.download-selection-loading,
.download-selection-submitted {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--auralis-dialog-bg) 80%, black 20%);
  border: 1px solid var(--auralis-border-subtle);
  font-size: 12px;
  color: var(--auralis-text-muted);
}

.download-selection-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--auralis-border-subtle);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: download-spin 800ms linear infinite;
}

@keyframes download-spin {
  to {
    transform: rotate(360deg);
  }
}

.download-selection-section {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.download-selection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.download-selection-count {
  font-weight: 600;
  color: var(--auralis-text);
}

.download-selection-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.download-selection-tool-btn {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 11px;
  color: var(--auralis-text-muted);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.download-selection-tool-btn:hover:not(:disabled) {
  color: var(--auralis-text);
}

.download-selection-tool-btn:disabled {
  opacity: 0.4;
  cursor: default;
  text-decoration: none;
}

.download-selection-separator {
  font-size: 10px;
  color: var(--auralis-text-muted);
  opacity: 0.5;
}

.download-tracks-list {
  max-height: 200px;
  overflow-y: auto;
  border-radius: 6px;
  border: 1px solid var(--auralis-border-subtle);
  background: color-mix(in srgb, var(--auralis-dialog-bg) 70%, black 30%);
}

.download-track-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-border-subtle) 40%, transparent);
  transition: background-color 120ms ease;
}

.download-track-row:last-child {
  border-bottom: none;
}

.download-track-row:hover {
  background: var(--auralis-control-hover-bg, rgba(255, 255, 255, 0.05));
}

.download-track-row--selected {
  background: color-mix(in srgb, var(--auralis-accent, #38bdf8) 12%, transparent);
}

.download-track-checkbox {
  accent-color: var(--auralis-accent, #38bdf8);
  cursor: pointer;
}

.download-track-index {
  font-size: 11px;
  min-width: 20px;
  font-weight: 600;
  color: var(--auralis-text-muted);
  font-variant-numeric: tabular-nums;
}

.download-track-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--auralis-text);
}
</style>
