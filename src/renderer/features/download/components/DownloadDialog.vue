<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AmdlLogEvent, AmdlTaskProgress } from '@shared/types/amdl'
import type { ShellPresentation } from '@renderer/app/utils/shellPresentation'
import { useSidebarOwnedModal } from '@renderer/app/utils/useSidebarOwnedModal'

const props = withDefaults(
  defineProps<{
    open: boolean
    task: AmdlTaskProgress | null
    logs: AmdlLogEvent[]
    isStarting: boolean
    startError: string | null
    presentation?: ShellPresentation
    triggerElement?: HTMLElement | null
  }>(),
  {
    presentation: 'modern',
    triggerElement: null,
  },
)

const emit = defineEmits<{
  close: []
  start: [url: string]
  cancel: []
}>()

const { t } = useI18n()

const inputUrl = ref('')
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

const isRunning = computed(() => {
  const state = props.task?.state
  return state === 'starting' || state === 'running'
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
  emit('start', inputUrl.value.trim())
}

function onCancel(): void {
  emit('cancel')
}

function toggleLogs(): void {
  showLogs.value = !showLogs.value
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
          <button
            v-if="isRunning"
            type="button"
            class="download-btn-cancel smart-playlist-dialog-danger"
            @click="onCancel"
          >
            {{ t('download.cancelAction') }}
          </button>
          <button v-else type="submit" class="smart-playlist-dialog-primary" :disabled="!canSubmit">
            {{ t('download.startAction') }}
          </button>
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
</style>
