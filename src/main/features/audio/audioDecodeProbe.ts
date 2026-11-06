import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { parseStream } from 'music-metadata'
import type { AudioDecodeProbe } from '@shared/types/audioDecode'
import type { TrackFileFingerprint } from '@shared/types/trackFile'
import { hasSameScanFileFingerprint, scanFileFingerprint } from '@shared/utils/trackFileFingerprint'

export const AUDIO_PROBE_MAX_BYTES = 1024 * 1024
export const AUDIO_PROBE_CACHE_ENTRIES = 128
const cache = new Map<
  string,
  { fingerprint: TrackFileFingerprint; probe: AudioDecodeProbe | null }
>()
const inFlight = new Map<
  string,
  { fingerprint: TrackFileFingerprint; promise: Promise<AudioDecodeProbe | null> }
>()

/** Bounded header probe, never a whole-file duration scan. Unknown/truncated formats fall back. */
export async function probeAudioDecode(filePath: string): Promise<AudioDecodeProbe | null> {
  try {
    const before = await stat(filePath)
    if (!before.isFile()) return null
    const cached = cache.get(filePath)
    if (cached && hasSameScanFileFingerprint(before, cached.fingerprint)) {
      cache.delete(filePath)
      cache.set(filePath, cached)
      return cached.probe
    }
    // Ogg/ADTS duration may describe only consumed frames. Do not admit partial-stream estimates.
    if (!['.flac', '.wav', '.mp3', '.m4a'].includes(extname(filePath).toLowerCase())) return null
    const pending = inFlight.get(filePath)
    if (pending && hasSameScanFileFingerprint(before, pending.fingerprint)) return pending.promise
    const fingerprint = scanFileFingerprint(before)
    const promise = readProbe(filePath, fingerprint)
    // Coalesce matching work without retaining an unbounded number of distinct paths.
    if (inFlight.has(filePath) || inFlight.size < AUDIO_PROBE_CACHE_ENTRIES) {
      const entry = { fingerprint, promise }
      inFlight.set(filePath, entry)
      void promise.finally(() => {
        if (inFlight.get(filePath) === entry) inFlight.delete(filePath)
      })
    }
    return promise
  } catch {
    return null
  }
}

async function readProbe(
  filePath: string,
  before: TrackFileFingerprint,
): Promise<AudioDecodeProbe | null> {
  try {
    const stream = createReadStream(filePath, { end: AUDIO_PROBE_MAX_BYTES - 1 })
    let probe: AudioDecodeProbe | null = null
    try {
      const metadata = await parseStream(
        stream,
        { path: filePath, size: before.size },
        {
          duration: false,
          skipCovers: true,
          skipPostHeaders: true,
        },
      )
      const { duration, numberOfChannels, sampleRate } = metadata.format
      if (
        [duration, numberOfChannels, sampleRate].every(
          (n) => typeof n === 'number' && Number.isFinite(n) && n > 0,
        )
      ) {
        probe = {
          fileSize: before.size,
          fileMtimeMs: before.mtimeMs,
          durationSeconds: duration!,
          numberOfChannels: numberOfChannels!,
          sampleRate: sampleRate!,
        }
      }
    } catch {
      // Header unavailable within the read budget: HTMLAudio remains available.
    } finally {
      stream.destroy()
    }
    const after = await stat(filePath)
    if (!hasSameScanFileFingerprint(after, before)) return null
    cache.delete(filePath)
    cache.set(filePath, { fingerprint: before, probe })
    while (cache.size > AUDIO_PROBE_CACHE_ENTRIES) cache.delete(cache.keys().next().value!)
    return probe
  } catch {
    return null
  }
}
