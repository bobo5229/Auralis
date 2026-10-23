import { execFile } from 'node:child_process'
import type { BigIntStats } from 'node:fs'
import { MetadataSaveError } from './metadataSaveError'
import {
  hasM4aPublicationHelper,
  m4aPublicationHelper,
  windowsPublicationFailure,
} from './windowsM4aPublication'

export interface LockedAudioSource {
  isHeld(): boolean
  assertHeld(): void
  release(): Promise<void>
}

/** Only the fixed bundled helper is executable; it holds a read-only source handle. */
export function lockWindowsAudioSource(
  original: string,
  staging: string,
  expected: BigIntStats,
  ffmpegPath: string,
): Promise<LockedAudioSource> {
  if (!hasM4aPublicationHelper(ffmpegPath))
    return Promise.reject(
      new MetadataSaveError('save-failed', 'Safe audio publication runtime is unavailable'),
    )
  return new Promise((resolve, reject) => {
    let ready = false
    let closed = false
    let released = false
    let output = ''
    let finish!: () => void
    const completion = new Promise<void>((done) => {
      finish = done
    })
    const child = execFile(
      m4aPublicationHelper(ffmpegPath),
      [
        original,
        staging,
        String(expected.size),
        String(expected.ino),
        String(expected.mtimeNs),
        String(expected.ctimeNs),
        '--lock-source',
      ],
      { windowsHide: true, maxBuffer: 4096 },
      (error, stdout) => {
        closed = true
        finish()
        if (!ready)
          reject(
            windowsPublicationFailure(
              error ?? new Error('Source lock exited before ready'),
              stdout,
            ),
          )
      },
    )
    // A helper that exits before release may close its pipe first.
    child.stdin?.on('error', () => {})
    const isHeld = () => ready && !closed && child.exitCode === null && child.signalCode === null
    child.stdout?.on('data', (chunk: Buffer | string) => {
      output += String(chunk)
      if (ready || !output.includes('\n')) return
      try {
        if (JSON.parse(output.trim()).winError !== 0) return
      } catch {
        return
      }
      ready = true
      resolve({
        isHeld,
        assertHeld() {
          if (!isHeld()) throw new MetadataSaveError('file-changed', 'Audio source lock was lost')
        },
        async release() {
          if (!released) {
            released = true
            child.stdin?.end()
          }
          await completion
        },
      })
    })
  })
}
