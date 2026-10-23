import { computed, nextTick, ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import type {
  LyricsAssignment,
  LrcEditorState,
  SaveLrcEditor,
  RetimeLyricsEditorLines,
} from '@shared/types/lyricsEditor'
import { useDuetLyricsEditor } from './useDuetLyricsEditor'

interface LyricsEditSessionOptions {
  isOpen: () => boolean
  t: (key: string) => string
  composing: () => boolean
  inlineEditing: () => boolean
  inlineDirty: () => boolean
  onLrcLoaded: () => void
  focusEditor: (mode: 'lrc' | 'ttml', resetSelection?: boolean) => void
  commitInlineText: () => Promise<boolean> | undefined
  onClose: () => void
}

/** Owns raw and TTML sessions; DOM editing and focus remain in the panel. */
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
  const ttmlMode = ref(false)
  const duet = useDuetLyricsEditor(failure)
  const duetSession = duet.session
  const busy = computed(() => loading.value || saving.value || duet.assigning.value)
  const dirty = computed(() =>
    ttmlMode.value
      ? !!duetSession.value?.dirty || options.inlineDirty()
      : text.value !== baseline.value,
  )
  const editable = computed(() => !!session.value && !ttmlMode.value && !busy.value)
  const canSave = computed(() =>
    ttmlMode.value
      ? !!duetSession.value?.editable &&
        (!!duetSession.value?.dirty || options.inlineDirty()) &&
        !busy.value
      : canSaveTarget('tag') || canSaveTarget('file') || canSaveTarget('ttml'),
  )
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
    ttmlMode.value = false
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
    await duet.release()
    if (current) await auralis.lyrics.closeLrcEditor(current.sessionId).catch(() => undefined)
  }
  function failure(code: string, recoveryPath?: string): void {
    if (code === 'invalid-line-text') {
      error.value = t('lyricsEditor.errors.invalidLineText')
      return
    }
    if (code === 'invalid-end-time') {
      error.value = t('lyricsEditor.errors.invalidEndTime')
      return
    }
    if (code === 'invalid-time') {
      error.value = t('lyricsEditor.errors.invalidTime')
      return
    }
    if (
      ['unsupported-document', 'unsupported-timing', 'invalid-ttml', 'read-only-line'].includes(
        code,
      )
    ) {
      error.value = t('lyricsEditor.errors.readOnly')
      return
    }
    if (code === 'invalid-lrc' || code === 'untimed-lines') {
      error.value = t(
        code === 'untimed-lines' ? 'lyricsEditor.errors.untimed' : 'lyricsEditor.errors.invalidLrc',
      )
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
    if (saving.value || duet.assigning.value || trackId.value === null) return
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
      ttmlMode.value = result.value.format === 'ttml'
      if (ttmlMode.value) {
        await duet.open(id)
        if (token !== generation || !options.isOpen()) return
        if (duetSession.value && !duetSession.value.editable) failure('unsupported-document')
        return
      }
      text.value = baseline.value = result.value.text.replace(/\r\n?/g, '\n')
      options.onLrcLoaded()
      await nextTick()
      options.focusEditor('lrc', true)
    } catch {
      if (token === generation) failure('failed')
    } finally {
      if (token === generation) {
        loading.value = false
        await nextTick()
        options.focusEditor(ttmlMode.value ? 'ttml' : 'lrc')
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
        !result.value.conversionWarnings.includes('negative-times-clamped') &&
        !result.value.conversionWarnings.includes('inferred-final-end') &&
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
            : t(
                result.value.savedFormat === 'ttml'
                  ? 'lyricsEditor.ttmlSaved'
                  : 'lyricsEditor.saved',
              )
      if (result.value.conversionWarnings.includes('negative-times-clamped'))
        notice.value += ` ${t('lyricsEditor.clampedTimes')}`
      if (result.value.conversionWarnings.includes('inferred-final-end'))
        notice.value += ` ${t('lyricsEditor.inferredEnd')}`
      // Reopen a fresh baseline for subsequent edits. Never retry the committed save.
      const reopened = await auralis.lyrics.openLrcEditor(current.trackId)
      if (token !== generation || !options.isOpen()) {
        if (reopened.ok)
          void auralis.lyrics.closeLrcEditor(reopened.value.sessionId).catch(() => undefined)
        return
      }
      if (reopened.ok) {
        session.value = reopened.value
        if (result.value.savedFormat === 'ttml') {
          ttmlMode.value = true
          await duet.open(current.trackId)
          if (token !== generation || !options.isOpen()) return
          if (duetSession.value && !duetSession.value.editable) failure('unsupported-document')
          await nextTick()
          options.focusEditor('ttml')
        }
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
  async function saveTtml(closeAfter = false): Promise<void> {
    if (!canSave.value) return
    const token = generation
    if (options.inlineEditing()) {
      const committed = await options.commitInlineText()
      if (token !== generation || !options.isOpen()) return
      if (!committed) {
        confirming.value = false
        await nextTick()
        options.focusEditor('ttml')
        return
      }
    }
    const current = duetSession.value
    if (!current?.dirty || busy.value) return
    saving.value = true
    error.value = ''
    notice.value = ''
    try {
      const result = await auralis.lyrics.saveEditor({
        sessionId: current.sessionId,
        expectedRevision: current.revision,
      })
      if (token !== generation) return
      if (!result.ok) {
        failure(result.code, result.recoveryBackupPath)
        confirming.value = false
        return
      }
      // Saving consumes the server draft. Reopen rather than retrying a committed write.
      await duet.release()
      if (token !== generation || !options.isOpen()) return
      confirming.value = false
      if (closeAfter && result.value.cacheUpdated) {
        options.onClose()
        return
      }
      notice.value = t(
        result.value.cacheUpdated ? 'lyricsEditor.saved' : 'lyricsEditor.cachePending',
      )
      await duet.open(current.trackId)
      if (token === generation && duetSession.value && !duetSession.value.editable)
        failure('unsupported-document')
      if (token === generation) {
        await nextTick()
        options.focusEditor('ttml')
      }
    } catch {
      if (token === generation) {
        failure('failed')
        confirming.value = false
      }
    } finally {
      if (token === generation) saving.value = false
    }
  }
  function assignDuetLines(ids: string[], assignment: LyricsAssignment): void {
    if (busy.value || confirming.value) return
    error.value = ''
    notice.value = ''
    void duet.assign(ids, assignment)
  }
  function retimeDuetLines(
    ids: string[],
    mode: RetimeLyricsEditorLines['mode'],
    valueMs: number,
  ): void {
    if (busy.value || confirming.value) return
    error.value = ''
    notice.value = ''
    void duet.retime(ids, mode, valueMs)
  }
  async function replaceDuetText(lineId: string, value: string): Promise<boolean> {
    if (busy.value) return false
    error.value = ''
    notice.value = ''
    return duet.replaceText(lineId, value)
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
    ttmlMode,
    duetSession,
    busy,
    dirty,
    editable,
    canSave,
    canSaveTarget,
    open,
    reload,
    close,
    saveLrc,
    saveTtml,
    failure,
    assignDuetLines,
    retimeDuetLines,
    replaceDuetText,
  }
}
