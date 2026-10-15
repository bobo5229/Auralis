import { ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import type {
  LyricsAssignment,
  LyricsEditorState,
  RetimeLyricsEditorLines,
} from '@shared/types/lyricsEditor'

/** One owner-bound draft; performer and timing mutations share the latest server revision. */
export function useDuetLyricsEditor(onFailure: (code: string, recoveryPath?: string) => void) {
  const session = ref<LyricsEditorState | null>(null)
  const assigning = ref(false)
  let generation = 0

  async function release(): Promise<void> {
    generation++
    const current = session.value
    session.value = null
    assigning.value = false
    if (current) await auralis.lyrics.closeEditor(current.sessionId).catch(() => undefined)
  }

  async function open(trackId: number): Promise<void> {
    const closed = release()
    const token = generation
    await closed
    if (token !== generation) return
    try {
      const result = await auralis.lyrics.openEditor(trackId)
      if (token !== generation) {
        if (result.ok)
          void auralis.lyrics.closeEditor(result.value.sessionId).catch(() => undefined)
        return
      }
      if (result.ok) session.value = result.value
      else onFailure(result.code, result.recoveryBackupPath)
    } catch {
      if (token === generation) onFailure('failed')
    }
  }

  async function assign(lineIds: string[], assignment: LyricsAssignment): Promise<void> {
    const current = session.value
    if (!current?.editable || assigning.value || !lineIds.length) return
    const editable = new Set(current.lines.filter((line) => line.editable).map((line) => line.id))
    if (lineIds.some((id) => !editable.has(id))) return
    const token = generation
    assigning.value = true
    try {
      // IPC bounds each request to 10,000 IDs. Preserve each returned revision between batches.
      const ids = [...new Set(lineIds)]
      for (let start = 0; start < ids.length; start += 10000) {
        const draft = session.value
        if (token !== generation || !draft) return
        const result = await auralis.lyrics.assignEditorLines({
          sessionId: draft.sessionId,
          expectedRevision: draft.revision,
          lineIds: ids.slice(start, start + 10000),
          assignment,
        })
        if (token !== generation) return
        if (!result.ok) {
          onFailure(result.code, result.recoveryBackupPath)
          return
        }
        session.value = result.value
      }
    } catch {
      if (token === generation) onFailure('failed')
    } finally {
      if (token === generation) assigning.value = false
    }
  }

  async function retime(
    lineIds: string[],
    mode: RetimeLyricsEditorLines['mode'],
    valueMs: number,
  ): Promise<void> {
    const current = session.value
    const ids = [...new Set(lineIds)]
    if (
      !current?.editable ||
      assigning.value ||
      !ids.length ||
      ids.length > 10000 ||
      !Number.isSafeInteger(valueMs) ||
      (mode !== 'shift' && (ids.length !== 1 || valueMs < 0))
    )
      return
    const editable = new Set(
      current.lines.filter((line) => line.timingEditable).map((line) => line.id),
    )
    if (ids.some((id) => !editable.has(id))) return
    const token = generation
    assigning.value = true
    try {
      const result = await auralis.lyrics.retimeEditorLines({
        sessionId: current.sessionId,
        expectedRevision: current.revision,
        lineIds: ids,
        mode,
        valueMs,
      })
      if (token !== generation) return
      if (result.ok) session.value = result.value
      else onFailure(result.code, result.recoveryBackupPath)
    } catch {
      if (token === generation) onFailure('failed')
    } finally {
      if (token === generation) assigning.value = false
    }
  }

  return { session, assigning, open, assign, retime, release }
}
