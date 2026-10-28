import { computed, nextTick, ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import type { LrcEditorState, SaveLrcEditor } from '@shared/types/lyricsEditor'

interface LyricsEditSessionOptions {
  isOpen: () => boolean
  t: (key: string) => string
  composing: () => boolean
  onLrcLoaded: () => void
  focusEditor: (resetSelection?: boolean) => void
  onClose: () => void
}

/** Owns the LRC session; DOM editing and focus remain in the panel. */
export function useLyricsEditSession(options: LyricsEditSessionOptions) {
  const { t } = options
  const session = ref<LrcEditorState | null>(null)
  const trackId = ref<number | null>(null)
  const text = ref('')
  const baseline = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const confirming = ref(false)
  const error = ref('')
  const notice = ref('')
  const busy = computed(() => loading.value || saving.value)
  const dirty = computed(() => text.value !== baseline.value)
  const editable = computed(() => !!session.value && !busy.value)
  const canSave = computed(() => canSaveTarget('tag') || canSaveTarget('file'))
  let generation = 0

  function canSaveTarget(target: SaveLrcEditor['target']): boolean {
    return (
      editable.value &&
      !options.composing() &&
      (target !== 'tag' || (!!session.value?.canSaveTag && dirty.value))
    )
  }

  async function open(id: number | null): Promise<void> {
    trackId.value = id
    confirming.value = false
    text.value = baseline.value = ''
    if (id === null) {
      error.value = t('lyricsEditor.errors.unavailable')
      return
    }
    await reload()
  }

  async function close(): Promise<void> {
    generation++
    loading.value = false
    saving.value = false
    confirming.value = false
    await release()
  }

  async function release(): Promise<void> {
    const current = session.value
    session.value = null
    if (current) await auralis.lyrics.closeLrcEditor(current.sessionId).catch(() => undefined)
  }
  function failure(code: string, recoveryPath?: string): void {
    if (code === 'unsupported-format') {
      error.value = t('lyricsEditor.errors.lrcOnly')
      return
    }
    if (code === 'unsupported-document') {
      error.value = t('lyricsEditor.errors.unsupportedDocument')
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
  async function reload(): Promise<void> {
    if (saving.value || trackId.value === null) return
    const id = trackId.value
    const token = ++generation
    loading.value = true
    error.value = ''
    notice.value = ''
    await release()
    if (token !== generation || !options.isOpen()) return
    try {
      const result = await auralis.lyrics.openLrcEditor(id)
      if (token !== generation || !options.isOpen()) {
        if (result.ok)
          void auralis.lyrics.closeLrcEditor(result.value.sessionId).catch(() => undefined)
        return
      }
      if (!result.ok) {
        failure(result.code)
        return
      }
      session.value = result.value
      text.value = baseline.value = result.value.text.replace(/\r\n?/g, '\n')
      options.onLrcLoaded()
      await nextTick()
      options.focusEditor(true)
    } catch {
      if (token === generation) failure('failed')
    } finally {
      if (token === generation) {
        loading.value = false
        await nextTick()
        options.focusEditor()
      }
    }
  }
  async function saveLrc(target: SaveLrcEditor['target'], closeAfter = false): Promise<void> {
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
        result.value.cacheUpdated &&
        result.value.active
      ) {
        options.onClose()
        return
      }
      notice.value = result.value.writeWarning
        ? t('lyricsEditor.writeWarning')
        : !result.value.cacheUpdated
          ? t('lyricsEditor.cachePending')
          : !result.value.active
            ? t('lyricsEditor.otherSource')
            : t('lyricsEditor.saved')
      // Reopen a fresh baseline for subsequent edits. Never retry the committed save.
      const reopened = await auralis.lyrics.openLrcEditor(current.trackId)
      if (token !== generation || !options.isOpen()) {
        if (reopened.ok)
          void auralis.lyrics.closeLrcEditor(reopened.value.sessionId).catch(() => undefined)
        return
      }
      if (reopened.ok) {
        session.value = reopened.value
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
  return {
    session,
    trackId,
    text,
    baseline,
    loading,
    saving,
    confirming,
    error,
    notice,
    busy,
    dirty,
    editable,
    canSave,
    canSaveTarget,
    open,
    reload,
    close,
    saveLrc,
    failure,
  }
}
