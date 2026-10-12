import { extname } from 'node:path'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import { prepareAudioTagWrite } from '../metadata/audioTagWriteService'
import { metadataSaveFailureReason } from '../metadata/metadataSaveError'
import type { NativePlaybackOptions } from './nativePlaybackTypes'
import { hasM4aPublicationHelper } from '../metadata/windowsM4aPublication'

/** The shipped Windows mpv shares deletion and can finish reading an old file object. */
export function canReplacePlayingM4a(filePath: string, ffmpegPath: string): boolean {
  return extname(filePath).toLowerCase() === '.m4a' && hasM4aPublicationHelper(ffmpegPath)
}

export async function replacePlayingM4a(
  options: Pick<
    NativePlaybackOptions,
    'coordinator' | 'ffmpegPath' | 'suspendFileReaders' | 'warn'
  >,
  suspendAnalysis: () => Promise<() => void>,
  filePath: string,
  metadata: EditableTrackMetadata,
  commitAndReconcile: (commit: () => Promise<void>) => Promise<void>,
): Promise<UpdateTrackMetadataResult> {
  const coordinator = options.coordinator
  if (
    !canReplacePlayingM4a(filePath, options.ffmpegPath) ||
    !coordinator?.promoteFileReplacement ||
    !coordinator.releaseWriteLease
  )
    return { ok: false, reason: 'playback-in-use' }
  const intent = coordinator.reserveFileReplacement?.(filePath)
  if (!intent) return { ok: false, reason: 'playback-in-use' }
  let resumeAnalysis: (() => void) | undefined
  let resumeReaders: (() => void) | undefined
  let prepared: Awaited<ReturnType<typeof prepareAudioTagWrite>> | undefined
  try {
    // Analysis uses FFmpeg and short-lived parsers, not just the mpv lease's handle.
    // Drain it before publication, and prevent a new scan until the path is stable.
    resumeAnalysis = await suspendAnalysis()
    prepared = await prepareAudioTagWrite(filePath, metadata, options.ffmpegPath)
    resumeReaders = await options.suspendFileReaders?.(filePath)
    coordinator.promoteFileReplacement(intent)
    await commitAndReconcile(() => prepared!.commit(undefined, true))
    return { ok: true }
  } catch (error) {
    options.warn(error)
    return { ok: false, reason: metadataSaveFailureReason(error) ?? 'save-failed' }
  } finally {
    // Keep readers gated through disk parsing and database reconciliation.
    try {
      await prepared?.dispose()
    } catch (error) {
      options.warn(error)
    }
    coordinator.releaseWriteLease(intent)
    resumeReaders?.()
    resumeAnalysis?.()
  }
}
