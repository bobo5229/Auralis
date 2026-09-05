import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { IpcResponse } from '@shared/ipc/contracts'
import { sanitizeSerializedLogLine } from './logSanitizer'
import {
  DEFAULT_LOG_FILE_BYTES,
  DEFAULT_LOG_FILE_COUNT,
  listManagedLogFileNames,
} from './rollingLogStore'

export interface DiagnosticSaveDialogOptions {
  defaultPath: string
  filters: Array<{ name: string; extensions: string[] }>
}

export interface DiagnosticSaveDialogResult {
  canceled: boolean
  filePath?: string
}

export interface DiagnosticExporterOptions {
  appVersion: string
  logsDirectory: string
  showSaveDialog(options: DiagnosticSaveDialogOptions): Promise<DiagnosticSaveDialogResult>
  now?: () => Date
  platform?: NodeJS.Platform
  architecture?: string
}

function exportFileName(now: Date): string {
  return `Auralis-diagnostics-${now.toISOString().slice(0, 10)}.jsonl`
}

function chronologicalLogFileNames(logsDirectory: string): string[] {
  const names = listManagedLogFileNames(logsDirectory)
  return names.sort((left, right) => {
    const archiveIndex = (name: string): number => {
      if (name === 'auralis.log') return 0
      return Number(/^auralis\.(\d+)\.log$/.exec(name)?.[1] ?? 0)
    }
    return archiveIndex(right) - archiveIndex(left)
  })
}

export async function exportDiagnostics(
  options: DiagnosticExporterOptions,
): Promise<IpcResponse<'app:export-diagnostics'>> {
  const now = options.now?.() ?? new Date()
  const selection = await options.showSaveDialog({
    defaultPath: exportFileName(now),
    filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }],
  })
  if (selection.canceled || !selection.filePath) return { status: 'cancelled' }

  try {
    const logFileNames = chronologicalLogFileNames(options.logsDirectory)
    const lines = [
      JSON.stringify({
        type: 'auralis-diagnostic-export',
        generatedAt: now.toISOString(),
        app: { name: 'Auralis', version: options.appVersion },
        runtime: {
          platform: options.platform ?? process.platform,
          architecture: options.architecture ?? process.arch,
        },
        privacy: {
          localOnly: true,
          databaseIncluded: false,
          musicFilesIncluded: false,
          pathsAndUrlsRedacted: true,
        },
        retention: {
          maximumFileBytes: DEFAULT_LOG_FILE_BYTES,
          maximumFileCount: DEFAULT_LOG_FILE_COUNT,
        },
        includedLogFiles: logFileNames.length,
      }),
    ]

    for (const fileName of logFileNames) {
      // Exact managed names only; unrelated files in userData/logs are never included.
      if (basename(fileName) !== fileName) continue
      try {
        const content = await readFile(join(options.logsDirectory, fileName), 'utf8')
        for (const line of content.split(/\r?\n/)) {
          if (line.length > 0) lines.push(sanitizeSerializedLogLine(line))
        }
      } catch {
        // A file may rotate between enumeration and reading. Export the remaining files.
      }
    }

    await writeFile(selection.filePath, `${lines.join('\n')}\n`, { encoding: 'utf8' })
    return { status: 'saved' }
  } catch {
    return { status: 'failed' }
  }
}
