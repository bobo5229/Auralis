import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import type { AudioTagEdit as EditableTrackMetadata } from '../metadata/audioTagEdit'
import { stat } from 'node:fs/promises'
import { prepareAudioTagWrite, type PreparedAudioTagWrite } from '../metadata/audioTagWriteService'
import { metadataSaveFailureReason } from '../metadata/metadataSaveError'
import { createTagAudioSnapshot } from './tagAudioBuffer'
import { readMpvTimestampOrigin } from './softTransition'
import type { PlaybackCoordinator } from './nativePlaybackTypes'
import {
  createTagPlaybackWindow,
  assertCurrentTagWrite,
  isCurrentTagWrite,
  type BufferedTagPlaybackContext,
  type TagPlaybackWindow,
  type TagWriteAttempt,
} from './bufferedTagPlaybackState'
import {
  installTagPlaybackBuffer,
  waitForTagBufferEntry,
  restoreCommittedTagPlayback,
  waitForTagPlaybackResume,
} from './bufferedTagPlaybackBridge'

/**
 * Hold a read lease for this attempt only while it still owns an empty session.
 * Handoff notifies listeners before the hold; if playback moved, that read lease is released.
 */
export function retainCommittedPlaybackLease(input: {
  current: () => boolean
  currentLeaseId: () => string | null
  coordinator: PlaybackCoordinator | undefined
  intent: string
  hold: (leaseId: string) => void
}): void {
  if (!input.current() || input.currentLeaseId() !== null) return
  const coordinator = input.coordinator
  if (!coordinator?.handoffWriteLeaseToRead) throw new Error('File handoff is unavailable')
  const handed = coordinator.handoffWriteLeaseToRead(input.intent, 'mpv-current')
  if (!input.current() || input.currentLeaseId() !== null) {
    coordinator.releaseReadLease(handed.leaseId)
    return
  }
  input.hold(handed.leaseId)
}

/** Preserve the write, bridge and recovery ordering within one logical song. */
export async function writeBufferedTagMetadata(
  context: BufferedTagPlaybackContext,
  filePath: string,
  metadata: EditableTrackMetadata,
  commitAndReconcile: (commit: () => Promise<void>) => Promise<void>,
): Promise<UpdateTrackMetadataResult> {
  const { state, options, runtime, read, scheduling } = context
  const coordinator = options.coordinator
  const intent = coordinator?.reserveWriteIntent?.(filePath)
  if (!intent) return { ok: false, reason: 'playback-in-use' }
  const client = runtime.client!
  const session = runtime.id
  const window = createTagPlaybackWindow()
  const signal = AbortSignal.any([window.abort.signal, runtime.signal])
  const cancel = () => window.reject(new Error('Tag playback cancelled'))
  signal.addEventListener('abort', cancel, { once: true })
  state.tagWindow = window
  state.writesInFlight++
  if (read().paused) state.frozenTagTime ??= read().currentTime
  const nextRequest = scheduling.suspendPreparation()
  let prepared: PreparedAudioTagWrite | null = null
  let resumeReaders: (() => void) | null = null
  let committed = false
  let reason: Extract<UpdateTrackMetadataResult, { ok: false }>['reason'] =
    'buffer-preparation-failed'
  const attempt: TagWriteAttempt = { filePath, window, client, session, signal }
  const current = () => isCurrentTagWrite(context, attempt)
  const check = () => assertCurrentTagWrite(context, attempt)
  try {
    // Cancel and drain speculative readers before taking the write window.
    await runtime.enqueue(async () => {
      check()
      await scheduling.cancelNext(client)
    })
    scheduling.deferPrevious(nextRequest)
    await scheduling.drainAnalysis()
    check()
    const original = await stat(filePath)
    window.source = await createTagAudioSnapshot(state.tagFallback?.path ?? read().path)
    state.tagFiles.add(window.source)
    prepared = await prepareAudioTagWrite(filePath, metadata, options.ffmpegPath)
    check()
    const actual = await stat(filePath)
    if (original.size !== actual.size || original.mtimeMs !== actual.mtimeMs)
      throw new Error('Audio changed while preparing the tag playback snapshot')
    await prepared.assertUnchanged()
    const replacementOrigin = await readMpvTimestampOrigin(
      options.mpvPath,
      prepared.stagingPath,
      signal,
    )
    await installTagPlaybackBuffer(context, attempt)
    await waitForTagBufferEntry(window)
    check()
    resumeReaders = (await options.suspendFileReaders?.(filePath)) ?? null
    await scheduling.drainAnalysis()
    check()
    runtime.releaseCurrentLease()
    coordinator!.promoteWriteIntent!(intent)
    reason = 'file-in-use'
    await commitAndReconcile(async () => {
      check()
      await prepared!.commit(check)
      committed = true
    })
    retainCommittedPlaybackLease({
      current,
      currentLeaseId: () => runtime.currentLeaseId,
      coordinator,
      intent,
      hold: (leaseId) => runtime.holdCurrentLease(leaseId),
    })
    resumeReaders?.()
    resumeReaders = null
    if (current() && window.phase === 'bridge') {
      reason = 'playback-restore-failed'
      await restoreCommittedTagPlayback(context, attempt, filePath, replacementOrigin)
    }
    if (current() && window.phase !== 'resume' && read().loaded) {
      await waitForTagPlaybackResume(window, signal)
    }
    if (
      window.resumeFailed ||
      (current() &&
        read().loaded &&
        window.phase === 'resume' &&
        window.resumePath === window.source?.path)
    )
      return { ok: false, reason: 'playback-restore-failed' }
    return { ok: true }
  } catch (error) {
    options.warn(error)
    if (signal.aborted || !current()) reason = 'playback-changed'
    else if (committed) reason = 'playback-restore-failed'
    else reason = metadataSaveFailureReason(error) ?? reason
    return { ok: false, reason }
  } finally {
    window.done = true
    signal.removeEventListener('abort', cancel)
    try {
      await completeTagWrite(context, attempt, intent, prepared, resumeReaders)
    } finally {
      state.writesInFlight--
    }
  }
}

// Cancellation does not disown cleanup: compare session/client/window without the abort signal.
async function completeTagWrite(
  context: BufferedTagPlaybackContext,
  { filePath, window, client, session }: TagWriteAttempt,
  intent: string,
  prepared: PreparedAudioTagWrite | null,
  resumeReaders: (() => void) | null,
): Promise<void> {
  const { state, options, runtime, read, scheduling } = context
  // Releasing either an intent or a promoted lease unblocks queued readers.
  options.coordinator!.releaseWriteLease!(intent)
  resumeReaders?.()
  if (prepared) await prepared.dispose().catch(options.warn)
  if (session === runtime.id && client === runtime.client && state.tagWindow === window) {
    if (window.phase === 'queued' && window.loading && window.source) {
      // A cancellation can race file-loaded. Retain the song and its snapshot
      // rather than treating a decoder which has already changed as the original.
      await runtime
        .enqueue(async () => {
          if (client !== runtime.client || session !== runtime.id || state.tagWindow !== window)
            return
          window.phase = 'resume'
          window.resumePath = window.source!.path
          window.resumeEntry = window.source!.path
          window.resumeOffset = 0
          window.loading = true
          state.tagFallback = window.source
          await client.command('loadfile', window.source!.path, 'replace', -1, {
            start: String(read().currentTime),
            'hr-seek': 'yes',
            'hr-seek-demuxer-offset': '1',
          })
        })
        .catch(options.warn)
    } else if (window.phase === 'preparing' || window.phase === 'queued') {
      await runtime
        .enqueue(async () => {
          if (client !== runtime.client || session !== runtime.id) return
          await client.command('playlist-clear')
          await client.command('set_property', 'file-local-options/end', 'none')
        })
        .catch(options.warn)
      state.tagWindow = null
      scheduling.restoreDeferredNext()
    } else if (window.phase === 'resume' && !window.loading)
      finishTagPlaybackWindow(context, window)
  }
  if (session === runtime.id && client === runtime.client) {
    // file-loaded can finish the window while staging cleanup is awaiting I/O.
    // Keep the logical file occupied even if that callback already cleared it.
    if (!runtime.currentLeaseId && read().loaded) {
      const lease = await options
        .coordinator!.acquireReadLease(filePath, 'mpv-current', runtime.signal)
        .catch(() => null)
      if (lease && session === runtime.id && client === runtime.client)
        runtime.holdCurrentLease(lease.leaseId)
      else if (lease) options.coordinator!.releaseReadLease(lease.leaseId)
    }
    options.coordinator!.refreshPlaybackCapability?.(filePath)
  }
  if (client !== runtime.client || session !== runtime.id) {
    await client.close()
    for (const file of [window.buffer, window.source]) {
      if (file) {
        state.tagFiles.delete(file)
        await file.dispose().catch(options.warn)
      }
    }
  }
  await cleanupTagPlaybackFiles(context)
}

export function finishTagPlaybackWindow(
  context: BufferedTagPlaybackContext,
  window: TagPlaybackWindow,
): void {
  const { state, options, read, scheduling } = context
  if (state.tagWindow !== window) return
  state.tagWindow = null
  options.coordinator?.refreshPlaybackCapability?.(read().path)
  scheduling.restoreDeferredNext()
  void cleanupTagPlaybackFiles(context).catch(options.warn)
}

export async function cleanupTagPlaybackFiles(context: BufferedTagPlaybackContext): Promise<void> {
  const { state, options } = context
  const files = [...state.tagFiles].filter(
    (file) =>
      file !== state.tagFallback &&
      file !== state.tagWindow?.buffer &&
      file !== state.tagWindow?.source,
  )
  for (const file of files) state.tagFiles.delete(file)
  for (const file of files) {
    await file.dispose().catch(options.warn)
  }
}
