import type { AudioDecodeProbe } from '@shared/types/audioDecode'

export const MAX_ENCODED_BYTES = 256 * 1024 * 1024
export const MAX_SINGLE_PCM_BYTES = 320 * 1024 * 1024
export const MAX_DECODE_BUDGET_BYTES = 512 * 1024 * 1024
export const MAX_DURATION_SECONDS = 2 * 60 * 60

export function audioDecodeBudget(
  probe: AudioDecodeProbe | null | undefined,
  outputSampleRate: number,
  heldBytes: number,
  reservedBytes: number,
):
  | { allowed: true; pcmBytes: number; reservationBytes: number }
  | { allowed: false; reason: string } {
  if (
    !probe ||
    ![
      probe.durationSeconds,
      probe.numberOfChannels,
      probe.sampleRate,
      probe.fileSize,
      outputSampleRate,
    ].every((n) => Number.isFinite(n) && n > 0) ||
    !Number.isSafeInteger(probe.fileSize) ||
    !Number.isInteger(probe.numberOfChannels) ||
    !Number.isFinite(probe.fileMtimeMs)
  )
    return { allowed: false, reason: 'unknown or invalid probe' }
  const pcmBytes =
    Math.ceil(probe.durationSeconds * Math.max(outputSampleRate, probe.sampleRate)) *
    probe.numberOfChannels *
    4
  // Two encoded copies during collection/concatenation, plus one PCM-sized decoder allowance.
  const reservationBytes = 2 * probe.fileSize + 2 * pcmBytes
  if (
    probe.durationSeconds > MAX_DURATION_SECONDS ||
    probe.fileSize > MAX_ENCODED_BYTES ||
    !Number.isSafeInteger(pcmBytes) ||
    pcmBytes > MAX_SINGLE_PCM_BYTES ||
    heldBytes + reservedBytes + reservationBytes > MAX_DECODE_BUDGET_BYTES
  ) {
    return { allowed: false, reason: 'decode memory budget exceeded' }
  }
  return { allowed: true, pcmBytes, reservationBytes }
}

export async function readEncodedAudio(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Audio response has no readable body')
  try {
    const length = response.headers.get('content-length')
    if (
      !response.ok ||
      (length !== null &&
        (!Number.isSafeInteger(Number(length)) || Number(length) < 0 || Number(length) > maxBytes))
    ) {
      throw new Error('Encoded audio response exceeds budget or failed')
    }
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('Encoded audio stream exceeds budget')
      chunks.push(value)
    }
    if (size !== maxBytes) throw new Error('Audio fingerprint size changed during read')
    const encoded = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      encoded.set(chunk, offset)
      offset += chunk.length
    }
    return encoded.buffer
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}
