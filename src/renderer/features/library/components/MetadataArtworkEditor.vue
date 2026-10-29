<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { auralis } from '@renderer/shared/ipc/client'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type {
  ImportedMetadataArtwork,
  MetadataArtworkChange,
  MetadataArtworkSnapshot,
} from '@shared/types/metadataArtworkEdit'
const props = defineProps<{ metadata: EditableTrackMetadata; disabled: boolean }>()
const emit = defineEmits<{ change: [MetadataArtworkChange[]]; busyChange: [boolean] }>()
const { t } = useI18n()
const snapshot = ref<MetadataArtworkSnapshot | null>(null),
  selected = ref(0),
  busy = ref(false),
  error = ref(''),
  stale = ref(false),
  confirmRemove = ref(false)
const changes = ref<MetadataArtworkChange[]>([])
const imports = ref<Record<string, ImportedMetadataArtwork>>({})
const loaded = ref(false)
let revision = 0
const unavailable = computed(
  () => props.disabled || busy.value || !props.metadata.capabilities?.artwork || stale.value,
)
function selectPicture(index: number): void {
  selected.value = index
  confirmRemove.value = false
}
function undoChange(index: number): void {
  changes.value.splice(index, 1)
  update()
}
function update(): void {
  emit('change', [...changes.value])
}
async function load(): Promise<void> {
  if (busy.value || !props.metadata.editToken) return
  loaded.value = true
  busy.value = true
  emit('busyChange', true)
  error.value = ''
  const current = ++revision,
    trackId = props.metadata.trackId,
    editToken = props.metadata.editToken
  try {
    const result = await auralis.metadata.getMetadataArtwork({ trackId, editToken })
    if (current !== revision) return
    if (result.ok) {
      snapshot.value = result.value
      selected.value = 0
    } else error.value = t(`metadataArtwork.errors.${result.reason}`)
  } catch {
    if (current === revision) error.value = t('metadataArtwork.errors.unavailable')
  } finally {
    busy.value = false
    emit('busyChange', false)
  }
}
watch(
  () => props.metadata.editToken,
  (value, previous) => {
    if (value === previous) return
    if (changes.value.length) {
      stale.value = true
      error.value = t('metadataArtwork.stale')
      return
    }
    if (loaded.value) void load()
  },
)
async function importImage(kind: 'add' | 'replace'): Promise<void> {
  if (unavailable.value || !props.metadata.editToken) return
  busy.value = true
  emit('busyChange', true)
  error.value = ''
  try {
    const result = await auralis.metadata.importMetadataArtwork({
      trackId: props.metadata.trackId,
      editToken: props.metadata.editToken,
    })
    if (!result.ok) {
      error.value = t(`metadataArtwork.errors.${result.reason}`)
      return
    }
    if (!result.value) return
    const image = result.value
    imports.value[image.imageToken] = image
    if (kind === 'replace')
      changes.value = changes.value.filter(
        (change) => change.kind === 'add' || change.index !== selected.value,
      )
    changes.value.push(
      kind === 'add'
        ? { kind, imageToken: image.imageToken }
        : { kind, index: selected.value, imageToken: image.imageToken },
    )
    update()
  } catch {
    error.value = t('metadataArtwork.errors.unavailable')
  } finally {
    busy.value = false
    emit('busyChange', false)
  }
}
function remove(): void {
  if (unavailable.value) return
  changes.value = changes.value.filter(
    (change) => change.kind === 'add' || change.index !== selected.value,
  )
  changes.value.push({ kind: 'remove', index: selected.value })
  confirmRemove.value = false
  update()
}
function clearCommitted(): void {
  changes.value = []
  stale.value = false
  imports.value = {}
  confirmRemove.value = false
  update()
}
function discardQueued(): void {
  clearCommitted()
  void load()
}
onBeforeUnmount(() => {
  revision++
})
defineExpose({ clearCommitted, discardQueued, hasConflict: stale })
</script>
<template>
  <section class="metadata-artwork-editor auralis-type-caption">
    <button
      v-if="!loaded"
      type="button"
      class="auralis-dialog-action"
      :disabled="disabled || busy"
      @click="load"
    >
      {{ t('metadataArtwork.manage') }}
    </button>
    <template v-else>
      <p class="auralis-type-control font-semibold">{{ t('metadataArtwork.title') }}</p>
      <p v-if="busy" role="status">{{ t('metadataArtwork.loading') }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div v-if="snapshot" class="metadata-picture-list">
        <button
          v-for="picture in snapshot.pictures"
          :key="picture.index"
          type="button"
          class="metadata-picture"
          :class="{ 'metadata-picture--selected': selected === picture.index }"
          :aria-pressed="selected === picture.index"
          :disabled="disabled || busy"
          @click="selectPicture(picture.index)"
        >
          <img v-if="picture.cacheKey" :src="getArtworkUrl(picture.cacheKey)!" alt="" />
          <span
            >{{ picture.index + 1 }} · {{ picture.type || picture.mimeType }}<br />{{
              picture.width
            }}
            × {{ picture.height }} · {{ Math.ceil(picture.bytes / 1024) }} KiB<span
              v-if="picture.description"
              ><br />{{ picture.description }}</span
            ></span
          >
        </button>
      </div>
      <p v-if="snapshot">
        {{ t('metadataArtwork.fallback')
        }}{{ t(`metadataArtwork.sources.${snapshot.fallbackSource}`) }}
      </p>
      <div class="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          class="auralis-dialog-action"
          :disabled="unavailable || !snapshot"
          @click="importImage('add')"
        >
          {{ t('metadataArtwork.add') }}
        </button>
        <button
          type="button"
          class="auralis-dialog-action"
          :disabled="unavailable || !snapshot?.pictures.length"
          @click="importImage('replace')"
        >
          {{ t('metadataArtwork.replace') }}
        </button>
        <button
          type="button"
          class="auralis-dialog-action"
          :disabled="unavailable || !snapshot?.pictures.length"
          @click="confirmRemove = true"
        >
          {{ t('metadataArtwork.remove') }}
        </button>
        <button
          v-if="changes.length"
          type="button"
          class="auralis-dialog-action"
          :disabled="disabled || busy"
          @click="discardQueued"
        >
          {{ t('metadataArtwork.discard') }}
        </button>
      </div>
      <p v-if="!metadata.capabilities?.artwork">{{ t('metadataArtwork.unsupported') }}</p>
      <div v-if="confirmRemove" role="alert" class="mt-2">
        <p>
          {{ t('metadataArtwork.confirmRemove') }} {{ t('metadataArtwork.fallback')
          }}{{ t(`metadataArtwork.sources.${snapshot?.fallbackSource ?? 'none'}`) }}
        </p>
        <button type="button" class="auralis-dialog-action" :disabled="unavailable" @click="remove">
          {{ t('metadataArtwork.remove') }}
        </button>
        <button type="button" class="auralis-dialog-action" @click="confirmRemove = false">
          {{ t('lyricsEditor.continue') }}
        </button>
      </div>
      <ul v-if="changes.length" class="grid gap-2 mt-3" aria-live="polite">
        <li v-for="(change, index) in changes" :key="index" class="metadata-picture-change">
          <img
            v-if="change.kind !== 'remove' && imports[change.imageToken]"
            :src="getArtworkUrl(imports[change.imageToken]!.cacheKey)!"
            alt=""
          />
          <span
            >{{ t(`metadataArtwork.operations.${change.kind}`)
            }}<span v-if="change.kind !== 'add'"> {{ change.index + 1 }}</span></span
          >
          <button
            type="button"
            class="auralis-dialog-action"
            :disabled="disabled || busy"
            @click="undoChange(index)"
          >
            {{ t('metadataArtwork.undo') }}
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>
<style scoped>
.metadata-artwork-editor {
  border-top: 1px solid var(--auralis-border-subtle);
  padding-top: 12px;
  margin-top: 12px;
}
.metadata-picture-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-block: 10px;
}
.metadata-picture {
  display: flex;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  overflow-wrap: anywhere;
  align-items: center;
}
.metadata-picture--selected {
  outline: 2px solid var(--auralis-control-primary-bg);
}
.metadata-picture img,
.metadata-picture-change img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  flex: none;
  border-radius: 8px;
}
.metadata-picture-change {
  display: flex;
  align-items: center;
  gap: 10px;
}
@media (max-width: 600px) {
  .metadata-picture-list {
    grid-template-columns: 1fr;
  }
}
</style>
