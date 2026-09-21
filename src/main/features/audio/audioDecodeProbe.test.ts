import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { probeAudioDecode, AUDIO_PROBE_MAX_BYTES } from './audioDecodeProbe'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
function wave(seconds: number): Buffer {
  const size = 48000 * 2 * 2 * seconds
  const data = Buffer.alloc(44 + size)
  data.write('RIFF', 0)
  data.writeUInt32LE(36 + size, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(2, 22)
  data.writeUInt32LE(48000, 24)
  data.writeUInt32LE(192000, 28)
  data.writeUInt16LE(4, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(size, 40)
  return data
}
describe('bounded audio probe', () => {
  it('reads full duration from a WAV larger than the input budget and invalidates its cache', async () => {
    const root = await mkdtemp(join(tmpdir(), 'auralis-probe-'))
    roots.push(root)
    const path = join(root, 'test.wav')
    const data = wave(10)
    expect(data.length).toBeGreaterThan(AUDIO_PROBE_MAX_BYTES)
    await writeFile(path, data)
    const first = await probeAudioDecode(path)
    expect(first).toMatchObject({
      durationSeconds: 10,
      sampleRate: 48000,
      numberOfChannels: 2,
      fileSize: data.length,
    })
    expect(await probeAudioDecode(path)).toBe(first)
    await writeFile(path, wave(1))
    expect(await probeAudioDecode(path)).toMatchObject({
      durationSeconds: 1,
      fileSize: wave(1).length,
    })
  })
  it('returns unavailable for corrupt, missing and unsupported formats', async () => {
    const root = await mkdtemp(join(tmpdir(), 'auralis-probe-'))
    roots.push(root)
    const path = join(root, 'bad.mp3')
    await writeFile(path, 'invalid')
    expect(await probeAudioDecode(path)).toBeNull()
    expect(await probeAudioDecode(join(root, 'missing.wav'))).toBeNull()
    await writeFile(join(root, 'test.ogg'), 'not a complete granule-position duration')
    expect(await probeAudioDecode(join(root, 'test.ogg'))).toBeNull()
  })
})
