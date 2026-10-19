import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import type { BigIntStats } from 'node:fs'
import { MetadataSaveError } from './metadataSaveError'

export function m4aPublicationHelper(ffmpegPath: string): string {
  return join(dirname(ffmpegPath), 'auralis-file-replace.exe')
}

export function hasM4aPublicationHelper(ffmpegPath: string): boolean {
  return process.platform === 'win32' && existsSync(m4aPublicationHelper(ffmpegPath))
}

export function windowsPublicationFailure(
  error: Error & { code?: unknown },
  stdout: string,
): MetadataSaveError {
  let winError: number | undefined
  try {
    winError = JSON.parse(stdout).winError
  } catch {
    /* spawn failure */
  }
  const reason =
    winError === 1006
      ? 'file-changed'
      : winError === 32 || winError === 33
        ? 'file-in-use'
        : winError === 5
          ? 'permission-denied'
          : winError === 112
            ? 'disk-full'
            : 'save-failed'
  return new MetadataSaveError(
    reason,
    `Audio publication failed (Windows ${winError ?? error.code})`,
  )
}

export async function publishWindowsM4a(
  original: string,
  staging: string,
  expected: BigIntStats,
  ffmpegPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // No shell or renderer-provided executable/arguments. Do not time out and kill
    // a publisher: an ambiguous termination could hide a successful replacement.
    execFile(
      m4aPublicationHelper(ffmpegPath),
      [
        original,
        staging,
        String(expected.size),
        String(expected.ino),
        String(expected.mtimeNs),
        String(expected.ctimeNs),
      ],
      { windowsHide: true, maxBuffer: 4096 },
      (error, stdout) => {
        if (!error) return resolve()
        reject(windowsPublicationFailure(error, stdout))
      },
    )
  })
}
