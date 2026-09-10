<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AmdlDownloadMode } from '@shared/types/amdl'
import { useVisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import { useProvidedAmdlDownload } from '../composables/downloadContext'

const { t } = useI18n()
const { visualStyle } = useVisualStyle()
const download = useProvidedAmdlDownload()

const inputUrl = ref('')
const selectedMode = ref<AmdlDownloadMode>('direct')

const isBusy = computed(() => {
  return download.isStarting.value || download.isRunning.value
})

const canStart = computed(() => {
  return inputUrl.value.trim().length > 0 && !isBusy.value
})

function setMode(mode: AmdlDownloadMode): void {
  if (isBusy.value) return
  selectedMode.value = mode
}

async function onStart(): Promise<void> {
  if (!canStart.value) return
  await download.startDownload(inputUrl.value.trim(), selectedMode.value)
}

async function onCancel(): Promise<void> {
  await download.cancelDownload()
}

/**
 * 任务状态与徽章计算（明确禁止百分比进度条）
 */
const taskStatus = computed(() => {
  const task = download.currentTask.value
  if (!task) return null

  // 1. 终态 (Terminal states)
  if (task.state === 'completed') {
    return {
      type: 'success',
      icon: 'i-lucide-check-circle-2',
      badgeText: t('download.status.completed'),
      canCancel: false,
    }
  }
  if (task.state === 'already-exists') {
    return {
      type: 'info',
      icon: 'i-lucide-info',
      badgeText: t('download.status.alreadyExists'),
      canCancel: false,
    }
  }
  if (task.state === 'failed') {
    return {
      type: 'error',
      icon: 'i-lucide-alert-circle',
      badgeText: t('download.status.failed'),
      canCancel: false,
    }
  }
  if (task.state === 'cancelled') {
    return {
      type: 'neutral',
      icon: 'i-lucide-slash',
      badgeText: t('download.status.cancelled'),
      canCancel: false,
    }
  }

  // 2. 运行中阶段 (Running stages)
  if (task.stage === 'selecting') {
    if (download.selectionSubmitted.value) {
      return {
        type: 'running',
        icon: 'i-lucide-loader-2',
        badgeText: t('download.status.selectingSubmitted'),
        canCancel: true,
      }
    }
    if (download.selectionRequest.value) {
      return {
        type: 'running',
        icon: 'i-lucide-list-checks',
        badgeText: t('download.status.selectingReady'),
        canCancel: true,
      }
    }
    return {
      type: 'running',
      icon: 'i-lucide-loader-2',
      badgeText: t('download.status.selectingReading'),
      canCancel: true,
    }
  }

  if (task.stage === 'launching' || task.stage === 'preparing') {
    return {
      type: 'running',
      icon: 'i-lucide-loader-2',
      badgeText: t('download.status.preparing'),
      canCancel: true,
    }
  }

  if (task.stage === 'downloading') {
    return {
      type: 'running',
      icon: 'i-lucide-cloud-download',
      badgeText: t('download.status.downloading'),
      canCancel: true,
    }
  }

  if (task.stage === 'processing' || task.stage === 'finalizing') {
    return {
      type: 'running',
      icon: 'i-lucide-refresh-cw',
      badgeText: t('download.status.processing'),
      canCancel: true,
    }
  }

  return {
    type: 'running',
    icon: 'i-lucide-loader-2',
    badgeText: t('download.status.preparing'),
    canCancel: true,
  }
})

/**
 * Phase B3: 曲目选择交互逻辑（由 App session download context 持久化）
 */
const { selectedTrackIndexes, toggleTrack, selectAllTracks, clearAllTracks, isTrackSelected } =
  download

const isSelectingStage = computed(() => {
  return (
    download.currentTask.value?.state === 'running' &&
    download.currentTask.value?.stage === 'selecting'
  )
})

const canSubmitSelection = computed(() => {
  return (
    selectedTrackIndexes.value.length > 0 &&
    !download.isSubmittingSelection.value &&
    !download.selectionSubmitted.value
  )
})

async function onSubmitSelection(): Promise<void> {
  if (!canSubmitSelection.value) return
  await download.submitSelection(selectedTrackIndexes.value)
}

const showLogs = ref(false)

function toggleLogs(): void {
  showLogs.value = !showLogs.value
}

defineExpose({
  inputUrl,
  selectedMode,
  isBusy,
  canStart,
  taskStatus,
  selectedTrackIndexes,
  isSelectingStage,
  canSubmitSelection,
  showLogs,
  isTrackSelected,
  toggleTrack,
  selectAllTracks,
  clearAllTracks,
  onSubmitSelection,
  toggleLogs,
  setMode,
  onStart,
  onCancel,
})
</script>

<template>
  <section class="download-page" :data-visual-style="visualStyle">
    <!-- Page Header -->
    <header class="download-header">
      <div class="download-header-title-row">
        <div class="download-header-icon" aria-hidden="true">
          <span class="i-lucide-cloud-download"></span>
        </div>
        <div>
          <h1 class="download-header-title">{{ t('download.title') }}</h1>
          <p class="download-header-subtitle">{{ t('download.pageSubtitle') }}</p>
        </div>
      </div>
    </header>

    <!-- Main Configuration Card -->
    <div class="download-config-card">
      <form class="download-form" @submit.prevent="onStart">
        <!-- URL Input Section -->
        <div class="download-field">
          <label class="download-field-label" for="amdl-page-url-input">
            {{ t('download.urlLabel') }}
          </label>
          <div class="download-input-wrapper">
            <span class="download-input-icon i-lucide-link-2" aria-hidden="true"></span>
            <input
              id="amdl-page-url-input"
              v-model="inputUrl"
              type="text"
              class="download-url-input"
              :placeholder="t('download.urlPlaceholder')"
              :disabled="isBusy"
              autocomplete="off"
              spellcheck="false"
            />
            <button
              v-if="inputUrl && !isBusy"
              type="button"
              class="download-input-clear"
              :aria-label="t('download.clearInput')"
              @click="inputUrl = ''"
            >
              <span class="i-lucide-x"></span>
            </button>
          </div>
        </div>

        <!-- Mode Option Cards Section -->
        <div class="download-field">
          <label class="download-field-label">
            {{ t('download.modeLabel') }}
          </label>
          <div class="download-mode-grid" role="radiogroup" :aria-label="t('download.modeLabel')">
            <!-- Mode 1: Direct Download -->
            <button
              type="button"
              class="download-mode-card"
              :class="{ 'is-selected': selectedMode === 'direct' }"
              :disabled="isBusy"
              role="radio"
              :aria-checked="selectedMode === 'direct'"
              @click="setMode('direct')"
            >
              <div class="download-mode-indicator">
                <span class="download-mode-dot"></span>
              </div>
              <div class="download-mode-body">
                <div class="download-mode-header">
                  <span class="download-mode-icon i-lucide-download"></span>
                  <span class="download-mode-name">{{ t('download.modeDirect') }}</span>
                </div>
                <p class="download-mode-desc">{{ t('download.modeDirectDesc') }}</p>
              </div>
            </button>

            <!-- Mode 2: Select Tracks -->
            <button
              type="button"
              class="download-mode-card"
              :class="{ 'is-selected': selectedMode === 'select' }"
              :disabled="isBusy"
              role="radio"
              :aria-checked="selectedMode === 'select'"
              @click="setMode('select')"
            >
              <div class="download-mode-indicator">
                <span class="download-mode-dot"></span>
              </div>
              <div class="download-mode-body">
                <div class="download-mode-header">
                  <span class="download-mode-icon i-lucide-list-checks"></span>
                  <span class="download-mode-name">{{ t('download.modeSelect') }}</span>
                </div>
                <p class="download-mode-desc">{{ t('download.modeSelectDesc') }}</p>
              </div>
            </button>
          </div>
        </div>

        <!-- Error feedback if any -->
        <p v-if="download.startError.value" class="download-error-message" role="alert">
          <span class="i-lucide-alert-circle"></span>
          <span>{{ download.startError.value }}</span>
        </p>

        <!-- Form Actions -->
        <div class="download-form-actions">
          <button type="submit" class="download-submit-button" :disabled="!canStart">
            <span
              v-if="download.isStarting.value"
              class="download-spinner"
              aria-hidden="true"
            ></span>
            <span v-else class="i-lucide-arrow-right" aria-hidden="true"></span>
            <span>{{
              download.isStarting.value ? t('download.status.preparing') : t('download.startAction')
            }}</span>
          </button>
        </div>
      </form>
    </div>

    <!-- Phase B2: Current Task Status Card -->
    <section
      v-if="download.currentTask.value"
      class="download-task-card"
      :class="`download-task-card--${taskStatus?.type ?? 'neutral'}`"
      role="region"
      :aria-label="t('download.currentTaskTitle')"
    >
      <div class="download-task-header">
        <div class="download-task-title-group">
          <span class="download-task-section-label">{{ t('download.currentTaskTitle') }}</span>
          <span
            class="download-task-badge"
            :class="`download-task-badge--${taskStatus?.type ?? 'neutral'}`"
          >
            <span
              class="download-task-status-icon"
              :class="taskStatus?.icon"
              aria-hidden="true"
            ></span>
            <span>{{ taskStatus?.badgeText }}</span>
          </span>
        </div>

        <button
          v-if="taskStatus?.canCancel"
          type="button"
          class="download-task-cancel-button"
          @click="onCancel"
        >
          <span class="i-lucide-x" aria-hidden="true"></span>
          <span>{{ t('download.cancelAction') }}</span>
        </button>
      </div>

      <!-- Task Info & Message -->
      <div class="download-task-body">
        <p
          v-if="
            download.currentTask.value.state === 'failed'
              ? (download.currentTask.value.error ?? download.currentTask.value.message)
              : download.currentTask.value.message
          "
          class="download-task-message"
          :class="{ 'is-error': download.currentTask.value.state === 'failed' }"
        >
          {{
            download.currentTask.value.state === 'failed'
              ? (download.currentTask.value.error ?? download.currentTask.value.message)
              : download.currentTask.value.message
          }}
        </p>

        <div class="download-task-meta">
          <span class="download-task-url" :title="download.currentTask.value.url">
            {{ download.currentTask.value.url }}
          </span>
        </div>
      </div>
    </section>

    <!-- Phase B3: Track Selection Card (when selectionRequest is active and in selecting stage) -->
    <section
      v-if="isSelectingStage && download.selectionRequest.value"
      class="download-selection-card"
      role="region"
      :aria-label="t('download.selectTracks')"
    >
      <!-- Selection Header & Controls -->
      <div class="download-selection-header">
        <div class="download-selection-title-group">
          <span class="download-selection-title">{{ t('download.chooseTracks') }}</span>
          <span class="download-selection-count-pill">
            <span class="download-selection-count-highlight">{{
              selectedTrackIndexes.length
            }}</span>
            <span class="download-selection-count-total"
              >/ {{ download.selectionRequest.value.tracks.length }}</span
            >
          </span>
        </div>

        <div class="download-selection-tools">
          <button
            type="button"
            class="download-tool-link"
            :disabled="download.isSubmittingSelection.value || download.selectionSubmitted.value"
            @click="selectAllTracks"
          >
            {{ t('download.selectAll') }}
          </button>
          <span class="download-tool-separator" aria-hidden="true">•</span>
          <button
            type="button"
            class="download-tool-link"
            :disabled="
              download.isSubmittingSelection.value ||
              download.selectionSubmitted.value ||
              selectedTrackIndexes.length === 0
            "
            @click="clearAllTracks"
          >
            {{ t('download.clearAll') }}
          </button>
        </div>
      </div>

      <!-- Tracks List (Virtual / Accessible Listbox) -->
      <div
        class="download-tracks-scroll-container"
        role="listbox"
        :aria-label="t('download.chooseTracks')"
        aria-multiselectable="true"
      >
        <div
          v-for="track in download.selectionRequest.value.tracks"
          :key="track.index"
          class="download-track-item"
          :class="{
            'is-selected': isTrackSelected(track.index),
            'is-disabled':
              download.isSubmittingSelection.value || download.selectionSubmitted.value,
          }"
          role="option"
          :aria-selected="isTrackSelected(track.index)"
          tabindex="0"
          @click="toggleTrack(track.index)"
          @keydown.space.prevent="toggleTrack(track.index)"
          @keydown.enter.prevent="toggleTrack(track.index)"
        >
          <!-- Checkbox -->
          <input
            type="checkbox"
            class="download-track-checkbox"
            :checked="isTrackSelected(track.index)"
            :disabled="download.isSubmittingSelection.value || download.selectionSubmitted.value"
            tabindex="-1"
            @click.stop="toggleTrack(track.index)"
          />

          <!-- Track Index -->
          <span class="download-track-index">{{ track.index }}</span>

          <!-- Track Title (handles long names) -->
          <span class="download-track-title" :title="track.title">{{ track.title }}</span>

          <!-- Track Type (subtle pill) -->
          <span v-if="track.type" class="download-track-type">{{ track.type }}</span>
        </div>
      </div>

      <!-- Selection Error Banner if any -->
      <p v-if="download.selectionError.value" class="download-error-message" role="alert">
        <span class="i-lucide-alert-circle"></span>
        <span>{{ download.selectionError.value }}</span>
      </p>

      <!-- Selection Footer Actions -->
      <div class="download-selection-footer">
        <div class="download-selection-status-note">
          <span v-if="download.selectionSubmitted.value" class="download-selection-submitted-note">
            <span class="download-spinner" aria-hidden="true"></span>
            <span>{{ t('download.selectionSubmitted') }}</span>
          </span>
          <span v-else-if="selectedTrackIndexes.length === 0" class="download-selection-hint">
            {{ t('download.selectionRequired') }}
          </span>
        </div>

        <button
          type="button"
          class="download-submit-selection-btn"
          :disabled="!canSubmitSelection"
          @click="onSubmitSelection"
        >
          <span
            v-if="download.isSubmittingSelection.value"
            class="download-spinner"
            aria-hidden="true"
          ></span>
          <span v-else class="i-lucide-download" aria-hidden="true"></span>
          <span>
            {{
              download.isSubmittingSelection.value
                ? t('download.submittingSelection')
                : t('download.downloadSelectedCount', { count: selectedTrackIndexes.length })
            }}
          </span>
        </button>
      </div>
    </section>

    <!-- Phase B4: Logs Drawer Card (collapsible, 500 lines maintained by controller) -->
    <section
      v-if="download.logs.value.length > 0"
      class="download-logs-card"
      role="region"
      :aria-label="t('download.logsTitle')"
    >
      <div class="download-logs-card-header">
        <button
          type="button"
          class="download-logs-toggle-btn"
          :aria-expanded="showLogs"
          @click="toggleLogs"
        >
          <span
            :class="showLogs ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            aria-hidden="true"
          ></span>
          <span class="download-logs-title">{{ t('download.logsTitle') }}</span>
          <span class="download-logs-count-badge">({{ download.logs.value.length }})</span>
        </button>

        <span class="download-logs-hint">
          {{ showLogs ? t('download.hideLogs') : t('download.showLogs') }}
        </span>
      </div>

      <div v-if="showLogs" class="download-logs-viewer-box" role="log" aria-live="polite">
        <div
          v-for="(log, idx) in download.logs.value"
          :key="idx"
          class="download-log-row"
          :class="log.stream === 'stderr' ? 'download-log-row--stderr' : 'download-log-row--stdout'"
        >
          <span class="download-log-prefix" aria-hidden="true">{{
            log.stream === 'stderr' ? '[ERR]' : '[OUT]'
          }}</span>
          <span class="download-log-text">{{ log.line }}</span>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.download-page {
  width: min(880px, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: 38px 36px var(--auralis-playbar-safe-area);
}

/* Header */
.download-header {
  margin-bottom: 28px;
}

.download-header-title-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.download-header-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator, #38bdf8) 12%, transparent);
  color: var(--auralis-sidebar-active-indicator, #38bdf8);
  font-size: 22px;
  border: 1px solid
    color-mix(in srgb, var(--auralis-sidebar-active-indicator, #38bdf8) 25%, transparent);
}

.download-header-title {
  margin: 0;
  font-size: clamp(24px, 2.6vw, 32px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--auralis-text, #f1f5f9);
  line-height: 1.2;
}

.download-header-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--auralis-text-muted, #94a3b8);
}

/* Config Card */
.download-config-card {
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: 18px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg, #181c1f) 65%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  padding: 28px;
}

.download-form {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.download-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.download-field-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--auralis-text-muted, #94a3b8);
}

/* URL Input */
.download-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.download-input-icon {
  position: absolute;
  left: 14px;
  font-size: 16px;
  color: var(--auralis-text-subtle, #64748b);
  pointer-events: none;
}

.download-url-input {
  width: 100%;
  padding: 12px 42px 12px 40px;
  border-radius: 12px;
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.1));
  background: var(--auralis-control-bg, rgba(255, 255, 255, 0.04));
  color: var(--auralis-text, #f1f5f9);
  font-size: 14px;
  outline: none;
  transition: all 180ms ease;
}

.download-url-input:focus {
  border-color: var(--auralis-focus-ring, #38bdf8);
  background: var(--auralis-control-hover-bg, rgba(255, 255, 255, 0.07));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--auralis-focus-ring, #38bdf8) 18%, transparent);
}

.download-url-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.download-input-clear {
  position: absolute;
  right: 12px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--auralis-text-subtle, #64748b);
  cursor: pointer;
  transition:
    color 140ms ease,
    background-color 140ms ease;
}

.download-input-clear:hover {
  color: var(--auralis-text, #f1f5f9);
  background: rgba(255, 255, 255, 0.08);
}

/* Mode Grid */
.download-mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.download-mode-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.08));
  background: var(--auralis-control-bg, rgba(255, 255, 255, 0.025));
  text-align: left;
  cursor: pointer;
  transition: all 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  position: relative;
}

.download-mode-card:hover:not(:disabled) {
  border-color: color-mix(
    in srgb,
    var(--auralis-focus-ring, #38bdf8) 35%,
    rgba(255, 255, 255, 0.15)
  );
  background: var(--auralis-control-hover-bg, rgba(255, 255, 255, 0.05));
  transform: translateY(-1px);
}

.download-mode-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.download-mode-card.is-selected {
  border-color: var(--auralis-focus-ring, #38bdf8);
  background: color-mix(
    in srgb,
    var(--auralis-focus-ring, #38bdf8) 9%,
    var(--auralis-control-bg, rgba(255, 255, 255, 0.03))
  );
  box-shadow:
    0 4px 16px color-mix(in srgb, var(--auralis-focus-ring, #38bdf8) 12%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.download-mode-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 50%;
  border: 1.5px solid var(--auralis-text-subtle, #64748b);
  flex-shrink: 0;
  transition: border-color 160ms ease;
}

.download-mode-card.is-selected .download-mode-indicator {
  border-color: var(--auralis-focus-ring, #38bdf8);
}

.download-mode-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  transition: background-color 160ms ease;
}

.download-mode-card.is-selected .download-mode-dot {
  background: var(--auralis-focus-ring, #38bdf8);
}

.download-mode-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.download-mode-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-mode-icon {
  font-size: 15px;
  color: var(--auralis-text-muted, #94a3b8);
}

.download-mode-card.is-selected .download-mode-icon {
  color: var(--auralis-focus-ring, #38bdf8);
}

.download-mode-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--auralis-text, #f1f5f9);
}

.download-mode-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--auralis-text-muted, #94a3b8);
}

/* Error banner */
.download-error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.08);
  color: #f87171;
  font-size: 13px;
}

/* Actions */
.download-form-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}

.download-submit-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  border-radius: 12px;
  border: none;
  background: var(--auralis-sidebar-active-indicator, #38bdf8);
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px
    color-mix(in srgb, var(--auralis-sidebar-active-indicator, #38bdf8) 28%, transparent);
  transition: all 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.download-submit-button:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow: 0 6px 18px
    color-mix(in srgb, var(--auralis-sidebar-active-indicator, #38bdf8) 36%, transparent);
}

.download-submit-button:active:not(:disabled) {
  transform: scale(0.98);
}

.download-submit-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.download-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: download-spin 700ms linear infinite;
}

@keyframes download-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Phase B2: Current Task Card */
.download-task-card {
  margin-top: 20px;
  border-radius: 16px;
  padding: 20px 24px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg, #181c1f) 70%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.08));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  transition: all 200ms ease;
}

.download-task-card--running {
  border-color: color-mix(
    in srgb,
    #38bdf8 28%,
    var(--auralis-border-subtle, rgba(255, 255, 255, 0.08))
  );
}

.download-task-card--success {
  border-color: color-mix(
    in srgb,
    #4ade80 28%,
    var(--auralis-border-subtle, rgba(255, 255, 255, 0.08))
  );
}

.download-task-card--error {
  border-color: color-mix(
    in srgb,
    #f87171 28%,
    var(--auralis-border-subtle, rgba(255, 255, 255, 0.08))
  );
}

.download-task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.download-task-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.download-task-section-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--auralis-text, #f1f5f9);
}

.download-task-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
}

.download-task-status-icon {
  font-size: 13px;
}

.download-task-badge--running {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.download-task-badge--success {
  background: rgba(74, 222, 128, 0.12);
  color: #4ade80;
  border: 1px solid rgba(74, 222, 128, 0.25);
}

.download-task-badge--info {
  background: rgba(250, 204, 21, 0.12);
  color: #facc15;
  border: 1px solid rgba(250, 204, 21, 0.25);
}

.download-task-badge--error {
  background: rgba(248, 113, 113, 0.12);
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.25);
}

.download-task-badge--neutral {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.download-task-cancel-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(248, 113, 113, 0.25);
  background: rgba(248, 113, 113, 0.08);
  color: #f87171;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 140ms ease;
}

.download-task-cancel-button:hover {
  background: rgba(248, 113, 113, 0.16);
  border-color: rgba(248, 113, 113, 0.4);
}

.download-task-body {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.download-task-message {
  margin: 0;
  font-size: 13px;
  color: var(--auralis-text, #f1f5f9);
  line-height: 1.5;
}

.download-task-message.is-error {
  color: #f87171;
}

.download-task-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-task-url {
  font-size: 11px;
  color: var(--auralis-text-subtle, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* Phase B3: Track Selection Card */
.download-selection-card {
  margin-top: 20px;
  border-radius: 16px;
  padding: 24px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg, #181c1f) 75%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid
    color-mix(
      in srgb,
      var(--auralis-focus-ring, #38bdf8) 25%,
      var(--auralis-border-subtle, rgba(255, 255, 255, 0.08))
    );
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.download-selection-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.download-selection-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.download-selection-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--auralis-text, #f1f5f9);
}

.download-selection-count-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--auralis-focus-ring, #38bdf8) 15%, transparent);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.download-selection-count-highlight {
  color: var(--auralis-focus-ring, #38bdf8);
}

.download-selection-count-total {
  color: var(--auralis-text-muted, #94a3b8);
  font-weight: 500;
}

.download-selection-tools {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.download-tool-link {
  border: none;
  background: transparent;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--auralis-text-muted, #94a3b8);
  cursor: pointer;
  transition: all 140ms ease;
}

.download-tool-link:hover:not(:disabled) {
  color: var(--auralis-text, #f1f5f9);
  background: rgba(255, 255, 255, 0.06);
}

.download-tool-link:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.download-tool-separator {
  color: var(--auralis-text-subtle, #64748b);
  font-size: 10px;
}

/* Track list container */
.download-tracks-scroll-container {
  max-height: 360px;
  overflow-y: auto;
  border-radius: 12px;
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.08));
  background: color-mix(in srgb, var(--auralis-dialog-bg, #181c1f) 70%, black 30%);
  scrollbar-width: thin;
}

.download-track-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid
    color-mix(in srgb, var(--auralis-border-subtle, rgba(255, 255, 255, 0.08)) 45%, transparent);
  transition: all 120ms ease;
  outline: none;
}

.download-track-item:last-child {
  border-bottom: none;
}

.download-track-item:hover:not(.is-disabled) {
  background: color-mix(
    in srgb,
    var(--auralis-control-hover-bg, rgba(255, 255, 255, 0.06)) 85%,
    transparent
  );
}

.download-track-item:focus-visible {
  box-shadow: inset 0 0 0 2px var(--auralis-focus-ring, #38bdf8);
}

.download-track-item.is-selected {
  background: color-mix(in srgb, var(--auralis-focus-ring, #38bdf8) 14%, transparent);
}

.download-track-item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.download-track-checkbox {
  width: 15px;
  height: 15px;
  accent-color: var(--auralis-focus-ring, #38bdf8);
  cursor: pointer;
  flex-shrink: 0;
}

.download-track-index {
  min-width: 26px;
  font-size: 12px;
  font-weight: 700;
  color: var(--auralis-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.download-track-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--auralis-text, #f1f5f9);
  font-weight: 500;
}

.download-track-type {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--auralis-text-subtle, #64748b);
  flex-shrink: 0;
}

/* Selection footer */
.download-selection-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 4px;
  flex-wrap: wrap;
}

.download-selection-status-note {
  font-size: 12px;
}

.download-selection-submitted-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #38bdf8;
  font-weight: 600;
}

.download-selection-hint {
  color: var(--auralis-text-subtle, #64748b);
}

.download-submit-selection-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: var(--auralis-sidebar-active-indicator, #38bdf8);
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px
    color-mix(in srgb, var(--auralis-sidebar-active-indicator, #38bdf8) 28%, transparent);
  transition: all 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.download-submit-selection-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow: 0 6px 18px
    color-mix(in srgb, var(--auralis-sidebar-active-indicator, #38bdf8) 36%, transparent);
}

.download-submit-selection-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.download-submit-selection-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

/* Phase B4: Logs Drawer Card */
.download-logs-card {
  margin-top: 20px;
  border-radius: 16px;
  padding: 16px 20px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg, #181c1f) 65%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--auralis-border-subtle, rgba(255, 255, 255, 0.08));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.download-logs-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.download-logs-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 4px 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--auralis-text, #f1f5f9);
  cursor: pointer;
  transition: color 150ms ease;
}

.download-logs-toggle-btn:hover {
  color: var(--auralis-sidebar-active-indicator, #38bdf8);
}

.download-logs-count-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--auralis-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.download-logs-hint {
  font-size: 11px;
  color: var(--auralis-text-subtle, #64748b);
}

.download-logs-viewer-box {
  max-height: 240px;
  overflow-y: auto;
  padding: 12px 14px;
  border-radius: 10px;
  background: #090d14;
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.download-log-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  word-break: break-all;
  white-space: pre-wrap;
}

.download-log-prefix {
  font-size: 9px;
  font-weight: 700;
  opacity: 0.6;
  user-select: none;
  flex-shrink: 0;
  margin-top: 1px;
}

.download-log-row--stdout {
  color: #94a3b8;
}

.download-log-row--stderr {
  color: #f87171;
}

/* Responsive */
@media (max-width: 640px) {
  .download-page {
    padding-inline: 18px;
  }

  .download-mode-grid {
    grid-template-columns: 1fr;
  }

  .download-config-card {
    padding: 20px;
  }

  .download-submit-button {
    width: 100%;
    justify-content: center;
  }

  .download-task-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .download-task-cancel-button {
    width: 100%;
    justify-content: center;
  }

  .download-selection-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .download-submit-selection-btn {
    width: 100%;
    justify-content: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .download-page {
    animation: none;
  }

  .download-mode-card,
  .download-submit-button,
  .download-url-input,
  .download-task-cancel-button,
  .download-submit-selection-btn,
  .download-track-item,
  .download-logs-toggle-btn {
    transition: none;
    transform: none;
  }
}
/* Manuscript presentation adaptation */
.download-page[data-visual-style='manuscript'] {
  color: var(--manuscript-content-primary, #292723);
}

.download-page[data-visual-style='manuscript'] .download-header-title {
  color: var(--manuscript-content-primary, #292723);
  font-family: var(--manuscript-font-family-serif, serif);
  font-weight: 700;
}

.download-page[data-visual-style='manuscript'] .download-header-subtitle {
  color: var(--manuscript-content-muted, #6d675e);
}

.download-page[data-visual-style='manuscript'] .download-header-icon {
  background: color-mix(in srgb, var(--manuscript-color-accent-700, #8b302f) 12%, transparent);
  color: var(--manuscript-color-accent-700, #8b302f);
  border-color: color-mix(in srgb, var(--manuscript-color-accent-700, #8b302f) 25%, transparent);
}

.download-page[data-visual-style='manuscript'] .download-config-card,
.download-page[data-visual-style='manuscript'] .download-task-card,
.download-page[data-visual-style='manuscript'] .download-selection-card,
.download-page[data-visual-style='manuscript'] .download-logs-card {
  background: var(--manuscript-surface-control, #f3eedf);
  border-color: rgba(var(--manuscript-color-rule-rgb, 62, 57, 50), 0.2);
  box-shadow: 0 4px 16px rgba(41, 39, 35, 0.08);
}

.download-page[data-visual-style='manuscript'] .download-field-label,
.download-page[data-visual-style='manuscript'] .download-selection-title,
.download-page[data-visual-style='manuscript'] .download-task-section-label,
.download-page[data-visual-style='manuscript'] .download-logs-title {
  color: var(--manuscript-content-primary, #292723);
}

.download-page[data-visual-style='manuscript'] .download-url-input {
  background: var(--manuscript-surface-recessed, #e9e1cf);
  border-color: rgba(var(--manuscript-color-rule-rgb, 62, 57, 50), 0.2);
  color: var(--manuscript-content-primary, #292723);
}

.download-page[data-visual-style='manuscript'] .download-mode-card {
  background: var(--manuscript-surface-recessed, #e9e1cf);
  border-color: rgba(var(--manuscript-color-rule-rgb, 62, 57, 50), 0.2);
}

.download-page[data-visual-style='manuscript'] .download-mode-name {
  color: var(--manuscript-content-primary, #292723);
}

.download-page[data-visual-style='manuscript'] .download-mode-card.is-selected {
  border-color: var(--manuscript-color-accent-700, #8b302f);
  background: color-mix(
    in srgb,
    var(--manuscript-color-accent-700, #8b302f) 10%,
    var(--manuscript-surface-recessed, #e9e1cf)
  );
}

.download-page[data-visual-style='manuscript']
  .download-mode-card.is-selected
  .download-mode-indicator {
  border-color: var(--manuscript-color-accent-700, #8b302f);
}

.download-page[data-visual-style='manuscript'] .download-mode-card.is-selected .download-mode-dot {
  background: var(--manuscript-color-accent-700, #8b302f);
}

.download-page[data-visual-style='manuscript'] .download-submit-button,
.download-page[data-visual-style='manuscript'] .download-submit-selection-btn {
  background: var(--manuscript-color-accent-700, #8b302f);
  color: #fff;
}

.download-page[data-visual-style='manuscript'] .download-track-item {
  color: var(--manuscript-content-primary, #292723);
  border-bottom-color: rgba(var(--manuscript-color-rule-rgb, 62, 57, 50), 0.12);
}

.download-page[data-visual-style='manuscript'] .download-track-title {
  color: var(--manuscript-content-primary, #292723);
}

.download-page[data-visual-style='manuscript'] .download-tracks-scroll-container {
  background: var(--manuscript-surface-recessed, #e9e1cf);
  border-color: rgba(var(--manuscript-color-rule-rgb, 62, 57, 50), 0.2);
}
</style>
