import { createWriteStream, readdirSync, type WriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { once } from 'node:events'
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
  private stream: WriteStream | undefined
  private pending: Promise<void>

  constructor(
    readonly logsDirectory: string,
    options: RollingLogStoreOptions = {},
  ) {
    this.maximumFileBytes = Math.max(1_024, options.maximumFileBytes ?? DEFAULT_LOG_FILE_BYTES)
    this.maximumFileCount = Math.max(1, options.maximumFileCount ?? DEFAULT_LOG_FILE_COUNT)
    this.currentPath = join(logsDirectory, CURRENT_LOG_FILE_NAME)
    this.pending = this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      await mkdir(this.logsDirectory, { recursive: true })
      for (const fileName of (await readdir(this.logsDirectory)).filter(isManagedLogFileName)) {
        const match = managedLogPattern.exec(fileName)
        const archiveIndex = Number(match?.[1] ?? 0)
        const filePath = join(this.logsDirectory, fileName)
        if (
          archiveIndex >= this.maximumFileCount ||
          (await stat(filePath)).size > this.maximumFileBytes
        ) {
          await rm(filePath, { force: true })
        }
      }
      this.currentBytes = await stat(this.currentPath).then(
        (entry) => entry.size,
        () => 0,
      )
    } catch {
      this.writable = false
      this.currentBytes = 0
    }
  }

  private async closeStream(): Promise<void> {
    const stream = this.stream
    this.stream = undefined
    if (!stream || stream.closed) return
    const closing = once(stream, 'close')
    stream.end()
    await closing
  }

  private async rotate(): Promise<void> {
    await this.closeStream()
    const oldestPath = join(this.logsDirectory, `auralis.${this.maximumFileCount - 1}.log`)
    if (this.maximumFileCount > 1) await rm(oldestPath, { force: true })

    for (let index = this.maximumFileCount - 2; index >= 1; index -= 1) {
      const source = join(this.logsDirectory, `auralis.${index}.log`)
      await this.renameIfPresent(source, join(this.logsDirectory, `auralis.${index + 1}.log`))
    }

    if (this.maximumFileCount > 1)
      await this.renameIfPresent(this.currentPath, join(this.logsDirectory, 'auralis.1.log'))
    else await rm(this.currentPath, { force: true })
    this.currentBytes = 0
  }

  private async renameIfPresent(source: string, destination: string): Promise<void> {
    try {
      await rename(source, destination)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  write(serializedLine: string): Promise<void> {
    if (this.closed) return this.pending
    this.pending = this.pending.then(() => this.append(serializedLine))
    return this.pending
  }

  private async append(serializedLine: string): Promise<void> {
    if (!this.writable) return

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
        await this.rotate()
      }
      if (!this.stream) {
        const stream = createWriteStream(this.currentPath, { flags: 'a', encoding: 'utf8' })
        this.stream = stream
        stream.on('error', () => {
          this.writable = false
        })
        await once(stream, 'open')
      }
      const stream = this.stream
      await new Promise<void>((resolve, reject) => {
        stream.write(safeLine, (error) => (error ? reject(error) : resolve()))
      })
      this.currentBytes += bytes
    } catch {
      // Logging failures must never affect playback, scanning, or application shutdown.
      this.writable = false
      this.stream?.destroy()
    }
  }

  close(): Promise<void> {
    this.closed = true
    this.pending = this.pending
      .then(() => this.closeStream())
      .catch(() => {
        this.stream?.destroy()
        this.stream = undefined
      })
    return this.pending
  }
}
