import type { WebContents } from 'electron'
import { ipcChannels } from '@shared/ipc/channels'
import type { LyricsEditorResult } from '@shared/types/lyricsEditor'
import type { LrcEditorService } from '@main/features/lyrics/lrcEditorService'
import { editorFailure } from '@main/features/lyrics/lyricsEditorError'
import type { IpcHandlerRegistrar } from './validatedIpcRegistrar'

/** Uses the same trusted-window/top-frame/runtime-payload boundary as other domain IPC. */
export function registerLyricsEditorIpcHandlers(
  registrar: IpcHandlerRegistrar,
  lrcService: LrcEditorService,
): void {
  const owners = new WeakSet<WebContents>()
  function owner(sender: WebContents): number {
    const ownerId = sender.id
    if (!owners.has(sender)) {
      owners.add(sender)
      sender.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) {
          lrcService.releaseOwner(ownerId)
        }
      })
      sender.on('render-process-gone', () => {
        lrcService.releaseOwner(ownerId)
      })
      sender.once('destroyed', () => {
        lrcService.releaseOwner(ownerId)
      })
    }
    return ownerId
  }
  async function result<T>(operation: () => T | Promise<T>): Promise<LyricsEditorResult<T>> {
    try {
      return { ok: true, value: await operation() }
    } catch (error) {
      return editorFailure(error)
    }
  }
  registrar.handle(ipcChannels.lyrics.openLrcEditor, (event, request) =>
    result(() => lrcService.open(owner(event.sender), request.trackId)),
  )
  registrar.handle(ipcChannels.lyrics.saveLrcEditor, (event, request) =>
    result(() => lrcService.save(owner(event.sender), request)),
  )
  registrar.handle(ipcChannels.lyrics.closeLrcEditor, (event, request) =>
    result(() => {
      lrcService.close(owner(event.sender), request.sessionId)
      return null
    }),
  )
}
