import {
  prepareTagAudioBuffer,
  tagAudioContinuation,
  TAG_BUFFER_LEAD_SECONDS,
} from './tagAudioBuffer'
import {
  assertCurrentTagWrite,
  isCurrentTagWrite,
  type BufferedTagPlaybackContext,
  type TagPlaybackWindow,
  type TagWriteAttempt,
} from './bufferedTagPlaybackState'

export async function installTagPlaybackBuffer(
  context: BufferedTagPlaybackContext,
  write: TagWriteAttempt,
): Promise<void> {
  const { state, options, runtime, read } = context
  const { window, client, signal } = write
  const check = () => assertCurrentTagWrite(context, write)
  for (let attempt = 0; attempt < 2; attempt++) {
    check()
    const rawPosition = await client.command('get_property', 'time-pos')
    const position = read().paused
      ? (state.frozenTagTime ?? rawPosition)
      : typeof rawPosition === 'number'
        ? rawPosition + state.tagDecodeOffset
        : rawPosition
    if (typeof position !== 'number') throw new Error('Invalid tag buffer playback position')
    const paused = read().paused
    const buffer = await prepareTagAudioBuffer(
      options.mpvPath,
      options.ffmpegPath,
      window.source!.path,
      position,
      read().duration,
      paused,
      signal,
    )
    state.tagFiles.add(buffer)
    check()
    const installed = await runtime.enqueue(async () => {
      check()
      const time = await client.command('get_property', 'time-pos')
      if (
        typeof time !== 'number' ||
        paused !== read().paused ||
        (!paused && buffer.start - time - state.tagDecodeOffset < TAG_BUFFER_LEAD_SECONDS)
      )
        return false
      window.buffer = buffer
      window.resumePath = window.source!.path
      window.resumeOffset = buffer.end
      window.resumeEntry = tagAudioContinuation(
        window.resumePath,
        buffer.end,
        read().duration,
        buffer.rate,
        buffer.origin,
      )
      window.phase = 'queued'
      if (paused) state.frozenTagTime = buffer.start
      if (paused) await client.command('loadfile', buffer.path, 'replace', -1, {})
      else await client.command('loadfile', buffer.path, 'append', -1, {})
      if (buffer.end < read().duration - 1 / buffer.rate)
        await client.command('loadfile', window.resumeEntry, 'append', -1, {
          'hr-seek': 'yes',
          'hr-seek-demuxer-offset': '1',
        })
      if (!paused)
        await client.command(
          'set_property',
          'file-local-options/end',
          String(buffer.start - state.tagDecodeOffset + 0.25 / buffer.rate),
        )
      return true
    })
    if (installed) break
    state.tagFiles.delete(buffer)
    await buffer.dispose()
    if (attempt === 1) throw new Error('Tag buffer preparation missed the playback deadline')
  }
}

export async function waitForTagBufferEntry(window: TagPlaybackWindow): Promise<void> {
  // file-loaded occurs only after mpv has unloaded the original decoder.
  const timeout = setTimeout(() => window.abort.abort(), 20000)
  try {
    await window.entered
  } finally {
    clearTimeout(timeout)
  }
}

export async function restoreCommittedTagPlayback(
  context: BufferedTagPlaybackContext,
  attempt: TagWriteAttempt,
  filePath: string,
  replacementOrigin: number,
): Promise<void> {
  const { options, runtime, read } = context
  const { window, client, signal } = attempt
  const current = () => isCurrentTagWrite(context, attempt)
  const check = () => assertCurrentTagWrite(context, attempt)
  // Keep the snapshot first until the verified replacement is ready to play.
  const heldLeaseId = runtime.currentLeaseId
  if (!heldLeaseId) {
    const lease = await options.coordinator!.acquireReadLease(filePath, 'mpv-current', signal)
    if (!current()) {
      options.coordinator!.releaseReadLease(lease.leaseId)
      check()
    }
    runtime.holdCurrentLease(lease.leaseId)
  } else if (!current()) {
    options.coordinator!.releaseReadLease(heldLeaseId)
    runtime.holdCurrentLease(null)
    check()
  }
  await runtime.enqueue(async () => {
    check()
    if (read().paused) {
      window.resumePath = filePath
      window.resumeEntry = filePath
      window.resumeOffset = 0
      window.loading = true
      await client.command('loadfile', filePath, 'replace', -1, {
        start: String(read().currentTime),
        'hr-seek': 'yes',
        'hr-seek-demuxer-offset': '1',
      })
      return
    }
    const time = await client.command('get_property', 'time-pos')
    if (
      window.phase !== 'bridge' ||
      typeof time !== 'number' ||
      window.buffer!.end - window.buffer!.start - time < TAG_BUFFER_LEAD_SECONDS
    )
      return
    if (window.buffer!.end >= read().duration - 1 / window.buffer!.rate) return
    const pos = await client.command('get_property', 'playlist-pos')
    if (typeof pos !== 'number') throw new Error('Invalid tag continuation playlist position')
    const entry = tagAudioContinuation(
      filePath,
      window.buffer!.end,
      read().duration,
      window.buffer!.rate,
      replacementOrigin,
    )
    await client.command('loadfile', entry, 'append', -1, {
      'hr-seek': 'yes',
      'hr-seek-demuxer-offset': '1',
    })
    if (!current() || window.phase !== 'bridge') return
    await client.command('playlist-move', pos + 2, pos + 1)
    window.resumePath = filePath
    window.resumeEntry = entry
    window.resumeOffset = window.buffer!.end
    await client.command('playlist-remove', pos + 2)
  })
}

export async function waitForTagPlaybackResume(
  window: TagPlaybackWindow,
  signal: AbortSignal,
): Promise<void> {
  const timeout = setTimeout(() => window.abort.abort(), 20000)
  let failOnAbort: (() => void) | undefined
  try {
    await Promise.race([
      window.resumed,
      new Promise<void>((_, fail) => {
        if (signal.aborted) fail(new Error('Tag playback changed'))
        else {
          failOnAbort = () => fail(new Error('Tag playback changed'))
          signal.addEventListener('abort', failOnAbort, { once: true })
        }
      }),
    ])
  } finally {
    clearTimeout(timeout)
    if (failOnAbort) signal.removeEventListener('abort', failOnAbort)
  }
}
