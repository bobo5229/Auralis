import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { sanitizeSerializedLogLine } from './logSanitizer'

export const DEFAULT_LOG_FILE_BYTES = 2 * 1024 * 1024
export const DEFAULT_LOG_FILE_COUNT = 4
export const CURRENT_LOG_FILE_NAME = 'auralis.log'

const managedLogPattern = /^auralis(?:\.([1-9]\d*))?\.log$/

export interface RollingLogStoreOptions {
  maximumFileBytes?: number
  maximumFileCount?: number
}

export function isManagedLogFileName(fileName: string): boolean {
  return managedLogPattern.test(fileName)
}

export function listManagedLogFileNames(logsDirectory: string): string[] {
  try {
    return readdirSync(logsDirectory)
      .filter(isManagedLogFileName)
      .sort((left, right) => {
        if (left === CURRENT_LOG_FILE_NAME) return -1
        if (right === CURRENT_LOG_FILE_NAME) return 1
        const leftIndex = Number(managedLogPattern.exec(left)?.[1] ?? 0)
        const rightIndex = Number(managedLogPattern.exec(right)?.[1] ?? 0)
        return leftIndex - rightIndex
      })
  } catch {
    return []
  }
}

export class RollingLogStore {
  readonly maximumFileBytes: number
  readonly maximumFileCount: number
  private readonly currentPath: string
  private currentBytes = 0
  private closed = false
  private writable = true

  constructor(
    readonly logsDirectory: string,
    options: RollingLogStoreOptions = {},
  ) {
    this.maximumFileBytes = Math.max(1_024, options.maximumFileBytes ?? DEFAULT_LOG_FILE_BYTES)
    this.maximumFileCount = Math.max(1, options.maximumFileCount ?? DEFAULT_LOG_FILE_COUNT)
    this.currentPath = join(logsDirectory, CURRENT_LOG_FILE_NAME)
    this.initialize()
  }

  private initialize(): void {
    try {
      mkdirSync(this.logsDirectory, { recursive: true })
      for (const fileName of listManagedLogFileNames(this.logsDirectory)) {
        const match = managedLogPattern.exec(fileName)
        const archiveIndex = Number(match?.[1] ?? 0)
        const filePath = join(this.logsDirectory, fileName)
        if (
          archiveIndex >= this.maximumFileCount ||
          statSync(filePath).size > this.maximumFileBytes
        ) {
          rmSync(filePath, { force: true })
        }
      }
      this.currentBytes = existsSync(this.currentPath) ? statSync(this.currentPath).size : 0
    } catch {
      this.writable = false
      this.currentBytes = 0
    }
  }

  private rotate(): void {
    const oldestPath = join(this.logsDirectory, `auralis.${this.maximumFileCount - 1}.log`)
    if (this.maximumFileCount > 1) rmSync(oldestPath, { force: true })

    for (let index = this.maximumFileCount - 2; index >= 1; index -= 1) {
      const source = join(this.logsDirectory, `auralis.${index}.log`)
      if (existsSync(source)) {
        renameSync(source, join(this.logsDirectory, `auralis.${index + 1}.log`))
      }
    }

    if (existsSync(this.currentPath)) {
      if (this.maximumFileCount > 1) {
        renameSync(this.currentPath, join(this.logsDirectory, 'auralis.1.log'))
      } else {
        rmSync(this.currentPath, { force: true })
      }
    }
    this.currentBytes = 0
  }

  write(serializedLine: string): void {
    if (this.closed || !this.writable) return

    try {
      let safeLine = sanitizeSerializedLogLine(serializedLine)
      if (!safeLine.endsWith('\n')) safeLine += '\n'
      let bytes = Buffer.byteLength(safeLine, 'utf8')
      if (bytes > this.maximumFileBytes) {
        safeLine = `${JSON.stringify({
          level: 40,
          time: Date.now(),
          msg: 'Oversized log entry omitted',
        })}\n`
        bytes = Buffer.byteLength(safeLine, 'utf8')
      }
      if (this.currentBytes > 0 && this.currentBytes + bytes > this.maximumFileBytes) {
        this.rotate()
      }
      appendFileSync(this.currentPath, safeLine, { encoding: 'utf8' })
      this.currentBytes += bytes
    } catch {
      // Logging failures must never affect playback, scanning, or application shutdown.
      this.writable = false
    }
  }

  close(): void {
    this.closed = true
  }
}
