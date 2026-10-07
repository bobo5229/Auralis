import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'
import MetadataEditDialog from '../../src/renderer/features/library/components/MetadataEditDialog.vue'
import { useLibraryMetadataEditor } from '../../src/renderer/features/library/composables/useLibraryMetadataEditor'
import zh from '../../src/renderer/locales/zh-Hans.json'
import en from '../../src/renderer/locales/en.json'
import '../../src/renderer/app/styles/main.css'
import '../../src/renderer/app/styles/typography.css'
import 'virtual:uno.css'
import type {
  TrackEditStateChangedEvent,
  UpdateTrackMetadataResult,
} from '../../src/shared/ipc/contracts'

let status: ((event: TrackEditStateChangedEvent) => void) | null = null
let finish: ((result: UpdateTrackMetadataResult) => void) | null = null
let version = 1,
  saves = 0
const i18n = createI18n({ legacy: false, locale: 'zh-Hans', messages: { 'zh-Hans': zh, en } })
const editor = useLibraryMetadataEditor({
  loadTrackMetadata: async () => ({
    trackId: 1,
    title: '播放中的歌曲',
    artistDisplay: '测试艺术家',
    albumTitle: '隔离验证专辑',
    albumArtistDisplay: null,
    genreDisplay: 'Ambient',
    year: 2026,
    releaseDate: '2026',
  }),
  updateTrackMetadata: async () => {
    saves++
    status?.({ trackId: 1, status: 'write-in-progress', version: ++version })
    return await new Promise<UpdateTrackMetadataResult>((yes) => {
      finish = yes
    })
  },
  captureRouteScope: () => ({ kind: 'library' }),
  refreshLibrary: async () => 'committed',
  restoreFocus: async () => {
    document.getElementById('return-target')?.focus()
  },
  isDisposed: () => false,
  getSaveErrorMessage: () => zh.library.metadataEditor.errors.saveFailed,
  getSaveFailureMessage: () => zh.library.metadataEditor.errors.bufferPreparationFailed,
  getTrackEditState: async () => ({ trackId: 1, status: 'playback-editable', version }),
  onTrackEditStateChanged: (callback) => {
    status = callback
    return () => {
      status = null
    }
  },
})
createApp({
  render: () =>
    h('main', { style: { padding: '28px' } }, [
      h('button', { id: 'return-target' }, '返回曲库'),
      h(MetadataEditDialog, {
        metadata: editor.editingMetadata.value,
        open: editor.isMetadataEditorOpen.value,
        loading: editor.isLoadingMetadata.value,
        saving: editor.isSavingMetadata.value,
        errorMessage: editor.metadataEditError.value,
        editStatus: editor.editStatus.value,
        onSave: editor.save,
        onClose: editor.close,
        onRetryStatus: editor.retryCheckStatus,
      }),
    ]),
})
  .use(i18n)
  .mount('#app')
Object.assign(window, {
  tagEditorProbe: {
    state: () => ({
      open: editor.isMetadataEditorOpen.value,
      saving: editor.isSavingMetadata.value,
      status: editor.editStatus.value,
      saves,
      error: editor.metadataEditError.value,
    }),
    fail: () => {
      status?.({ trackId: 1, status: 'playback-editable', version: ++version })
      finish?.({ ok: false, reason: 'buffer-preparation-failed' })
    },
  },
})
void editor.open(1)
