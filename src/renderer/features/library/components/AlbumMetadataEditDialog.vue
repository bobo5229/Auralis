<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { metadataSaveFailureMessageKey } from '../utils/metadataSaveFailure'
import AppDialog from '@renderer/shared/dialog/AppDialog.vue'
import { auralis } from '@renderer/shared/ipc/client'
import type { AlbumMetadataEditorRequest } from '@renderer/shared/albumMetadataEditor'
import {
  ALBUM_EDIT_FIELDS,
  type AlbumEditField,
  type AlbumEditOperations,
  type AlbumEditReply,
  type AlbumEditTask,
} from '@shared/types/albumMetadataEdit'
const props = defineProps<{
  request: AlbumMetadataEditorRequest | null
  showReturnButton?: boolean
}>()
const emit = defineEmits<{ close: []; reopen: [] }>()
const { t } = useI18n()
const task = ref<AlbumEditTask | null>(null),
  error = ref(''),
  busy = ref(false),
  page = ref(0),
  expanded = ref(false)
const operations = reactive<
  Record<AlbumEditField, { mode: 'keep' | 'replace' | 'clear' | 'add' | 'remove'; value: string }>
>({
  albumTitle: { mode: 'keep', value: '' },
  albumArtistDisplay: { mode: 'keep', value: '' },
  genreDisplay: { mode: 'keep', value: '' },
  releaseDate: { mode: 'keep', value: '' },
})
const skipBlocked = ref(false),
  previewCurrent = ref(false)
let unsubscribe: (() => void) | undefined,
  disposed = false,
  requestRevision = 0
const running = computed(() => !!task.value && ['preparing', 'running'].includes(task.value.state))
const visibleItems = computed(
  () => task.value?.items.slice(page.value * 50, page.value * 50 + 50) ?? [],
)
const blocked = computed(
  () => task.value?.items.filter((item) => item.status === 'blocked').length ?? 0,
)
const failed = computed(() => task.value?.items.some((item) => item.status === 'failed'))
function accept(reply: AlbumEditReply): void {
  if (disposed) return
  if (!reply.ok) {
    error.value = t(`albumMetadataEditor.errors.${reply.reason}`)
    return
  }
  const previous = task.value?.taskId
  task.value = reply.task
  if (previous !== reply.task?.taskId) {
    page.value = 0
    expanded.value = false
    for (const field of ALBUM_EDIT_FIELDS)
      Object.assign(operations[field], reply.task?.operations[field] ?? { mode: 'keep', value: '' })
    skipBlocked.value = reply.task?.skipBlocked ?? false
  }
}
async function call(operation: () => Promise<AlbumEditReply>): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    accept(await operation())
  } catch {
    if (!disposed) error.value = t('albumMetadataEditor.errors.invalid')
  } finally {
    if (!disposed) busy.value = false
  }
}
watch(
  () => props.request,
  async (request) => {
    const revision = ++requestRevision
    if (!request) return
    await call(async () => {
      const current = await auralis.metadata.getAlbumEdit()
      if (revision !== requestRevision || disposed) return { ok: true, task: task.value }
      if (current.ok && !current.task && request.album)
        return auralis.metadata.prepareAlbumEdit({ album: request.album })
      return current
    })
  },
  { immediate: true },
)
watch(
  [operations, skipBlocked],
  () => {
    previewCurrent.value = false
  },
  { deep: true, flush: 'sync' },
)
function mixedValue(field: AlbumEditField): string {
  const values = new Set(
    task.value?.items.filter((item) => item.before).map((item) => item.before![field] ?? '') ?? [],
  )
  return values.size > 1
    ? t('albumMetadataEditor.mixed')
    : String(values.values().next().value ?? '')
}
async function preview(): Promise<void> {
  if (!task.value) return
  await call(() =>
    auralis.metadata.previewAlbumEdit({
      taskId: task.value!.taskId,
      operations: structuredClone(JSON.parse(JSON.stringify(operations))) as AlbumEditOperations,
      skipBlocked: skipBlocked.value,
    }),
  )
  previewCurrent.value = !!task.value?.previewed && !error.value
  expanded.value = true
}
async function prepareRequested(): Promise<void> {
  if (!props.request?.album) return
  await call(async () => {
    if (task.value) {
      const released = await auralis.metadata.releaseAlbumEdit(task.value.taskId)
      if (!released.ok) return released
    }
    return auralis.metadata.prepareAlbumEdit({ album: props.request!.album! })
  })
}
onMounted(() => {
  unsubscribe = auralis.metadata.onAlbumEditProgress((event) => {
    if (disposed || !task.value || event.taskId !== task.value.taskId) return
    task.value.state = event.state
    task.value.processed = event.processed
    if (event.item) {
      const item = task.value.items.find((value) => value.trackId === event.item!.trackId)
      if (item) Object.assign(item, event.item)
    }
    if (
      event.state === 'ready' ||
      event.state === 'completed' ||
      event.state === 'cancelled' ||
      event.state === 'failed'
    )
      void auralis.metadata
        .getAlbumEdit()
        .then(accept)
        .catch(() => {
          if (!disposed) error.value = t('albumMetadataEditor.errors.invalid')
        })
  })
})
onBeforeUnmount(() => {
  disposed = true
  unsubscribe?.()
})
</script>
<template>
  <button
    v-if="task && !request && showReturnButton"
    type="button"
    class="album-edit-task-return auralis-dialog-action auralis-type-caption"
    @click="emit('reopen')"
  >
    {{ t('albumMetadataEditor.viewTask') }}
  </button>
  <AppDialog
    :open="!!request"
    :title="t('albumMetadataEditor.title')"
    title-id="album-metadata-title"
    :close-label="t('dialog.close')"
    :close-on-backdrop="false"
    :return-focus-to="request?.returnFocusTo"
    panel-class="album-metadata-dialog"
    @close="emit('close')"
  >
    <div class="grid gap-4">
      <p v-if="error" role="alert" class="auralis-type-caption text-[var(--auralis-danger)]">
        {{ error }}
      </p>
      <template v-if="task">
        <p class="auralis-type-control">
          {{ task.albumTitle }} · {{ t('metadataEditorExtra.targets', { count: task.total }) }}
        </p>
        <p class="auralis-type-caption" role="status">
          {{ t(`albumMetadataEditor.states.${task.state}`) }} {{ task.processed }}/{{ task.total }}
        </p>
        <progress v-if="running" :value="task.processed" :max="task.total" class="w-full" />
        <p v-if="running" class="auralis-type-caption">{{ t('albumMetadataEditor.background') }}</p>
        <template v-if="task.state === 'ready'">
          <label
            v-for="field in ALBUM_EDIT_FIELDS"
            :key="field"
            class="batch-field auralis-type-control"
          >
            <span>{{ t(`metadataEditorExtra.fields.${field}`) }}</span>
            <select
              :value="operations[field].mode"
              :disabled="busy"
              @change="
                operations[field].mode = ($event.target as HTMLSelectElement)
                  .value as (typeof operations)[typeof field]['mode']
              "
            >
              <option
                v-for="mode in field === 'genreDisplay'
                  ? ['keep', 'replace', 'clear', 'add', 'remove']
                  : ['keep', 'replace', 'clear']"
                :key="mode"
                :value="mode"
              >
                {{ t(`albumMetadataEditor.modes.${mode}`) }}
              </option>
            </select>
            <input
              v-if="['replace', 'add', 'remove'].includes(operations[field].mode)"
              v-model="operations[field].value"
              :placeholder="mixedValue(field)"
              :disabled="busy"
            />
            <span v-else class="auralis-type-caption text-[var(--auralis-text-muted)]">{{
              mixedValue(field)
            }}</span>
          </label>
          <label class="auralis-type-caption flex items-center gap-2"
            ><input v-model="skipBlocked" type="checkbox" :disabled="busy" />{{
              t('albumMetadataEditor.skipBlocked', { count: blocked })
            }}</label
          >
        </template>
        <button type="button" class="auralis-dialog-action" @click="expanded = !expanded">
          {{ t('albumMetadataEditor.targets') }}
        </button>
        <div v-if="expanded" class="batch-targets">
          <article
            v-for="item in visibleItems"
            :key="item.trackId"
            class="batch-target auralis-type-caption"
          >
            <p>
              <strong>{{ item.fileName }}</strong> ·
              {{ t(`albumMetadataEditor.itemStates.${item.status}`)
              }}<span v-if="item.reason">
                ·
                {{ t(metadataSaveFailureMessageKey(item.reason)) }}</span
              >
            </p>
            <p v-for="(value, field) in item.changes" :key="field">
              {{ t(`metadataEditorExtra.fields.${field}`) }}: {{ item.before?.[field] ?? '—' }} →
              {{ value ?? '—' }}
            </p>
          </article>
          <div class="flex items-center justify-between gap-2">
            <button
              type="button"
              class="auralis-dialog-action"
              :disabled="page === 0"
              @click="page--"
            >
              {{ t('albumMetadataEditor.previous') }}</button
            ><span>{{ page + 1 }} / {{ Math.max(1, Math.ceil(task.total / 50)) }}</span
            ><button
              type="button"
              class="auralis-dialog-action"
              :disabled="(page + 1) * 50 >= task.total"
              @click="page++"
            >
              {{ t('albumMetadataEditor.next') }}
            </button>
          </div>
        </div>
      </template>
    </div>
    <template #footer>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="auralis-dialog-action" @click="emit('close')">
          {{ t('dialog.close') }}
        </button>
        <button
          v-if="running && task"
          type="button"
          class="auralis-dialog-action"
          :disabled="busy"
          @click="call(() => auralis.metadata.cancelAlbumEdit(task!.taskId))"
        >
          {{ t('albumMetadataEditor.cancel') }}
        </button>
        <button
          v-if="task?.state === 'ready'"
          type="button"
          class="auralis-dialog-action"
          :disabled="busy"
          @click="preview"
        >
          {{ t('albumMetadataEditor.preview') }}
        </button>
        <button
          v-if="task?.state === 'ready'"
          type="button"
          class="auralis-dialog-action auralis-dialog-action--primary"
          :disabled="busy || !previewCurrent || (!skipBlocked && blocked > 0)"
          @click="call(() => auralis.metadata.startAlbumEdit(task!.taskId))"
        >
          {{ t('albumMetadataEditor.save') }}
        </button>
        <button
          v-if="task && failed && !running"
          type="button"
          class="auralis-dialog-action"
          :disabled="busy"
          @click="call(() => auralis.metadata.prepareAlbumEdit({ retryTaskId: task!.taskId }))"
        >
          {{ t('albumMetadataEditor.retryFailed') }}
        </button>
        <button
          v-if="request?.album && task && !running"
          type="button"
          class="auralis-dialog-action"
          :disabled="busy"
          @click="prepareRequested"
        >
          {{ t('albumMetadataEditor.prepareRequested') }}
        </button>
      </div>
    </template>
  </AppDialog>
</template>
<style scoped>
.album-edit-task-return {
  position: fixed;
  right: 24px;
  bottom: 110px;
  z-index: 50;
  background: var(--auralis-main-bg);
  box-shadow: 0 4px 20px #0002;
}
.batch-field {
  display: grid;
  grid-template-columns: minmax(80px, 1fr) 150px minmax(0, 2fr);
  gap: 10px;
  align-items: center;
}
.batch-field input,
.batch-field select {
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 10px;
  padding: 7px 10px;
  background: var(--auralis-main-bg);
  color: var(--auralis-text);
  min-width: 0;
}
.batch-targets {
  display: grid;
  gap: 10px;
}
.batch-target {
  padding-block: 10px;
  border-bottom: 1px solid var(--auralis-border-subtle);
  overflow-wrap: anywhere;
}
@media (max-width: 600px) {
  .batch-field {
    grid-template-columns: 1fr 1fr;
  }
  .batch-field input {
    grid-column: 1/-1;
  }
}
</style>
