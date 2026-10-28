import type { LibraryScanStatus, LibraryScanStatusValue } from '@shared/types/libraryScan'
import { BaseRepository } from './baseRepository'

interface ScanJobRow {
  id: number
  root_id: number
  status: LibraryScanStatusValue
  total_files: number
  scanned_files: number
  failed_files: number
  started_at: string
  finished_at: string | null
  error_message: string | null
}

function toScanStatus(row: ScanJobRow): LibraryScanStatus {
  return {
    jobId: row.id,
    rootId: row.root_id,
    status: row.status,
    totalFiles: row.total_files,
    scannedFiles: row.scanned_files,
    failedFiles: row.failed_files,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
  }
}

export class ScanJobRepository extends BaseRepository {
  create(rootId: number): LibraryScanStatus {
    const result = this.db
      .prepare('INSERT INTO scan_jobs (root_id, status) VALUES (?, ?)')
      .run(rootId, 'scanning')

    return this.getById(Number(result.lastInsertRowid))!
  }

  getById(jobId: number): LibraryScanStatus | null {
    const row = this.db.prepare('SELECT * FROM scan_jobs WHERE id = ?').get(jobId) as
      | ScanJobRow
      | undefined

    return row ? toScanStatus(row) : null
  }

  getLatest(): LibraryScanStatus | null {
    const row = this.db.prepare('SELECT * FROM scan_jobs ORDER BY id DESC LIMIT 1').get() as
      | ScanJobRow
      | undefined

    return row ? toScanStatus(row) : null
  }

  getActive(): LibraryScanStatus | null {
    const row = this.db
      .prepare("SELECT * FROM scan_jobs WHERE status = 'scanning' ORDER BY id DESC LIMIT 1")
      .get() as ScanJobRow | undefined

    return row ? toScanStatus(row) : null
  }

  markInterruptedJobs(): void {
    this.db
      .prepare(
        `
          UPDATE scan_jobs
          SET status = 'failed',
              finished_at = CURRENT_TIMESTAMP,
              error_message = 'Scan was interrupted before completion'
          WHERE status = 'scanning'
        `,
      )
      .run()
  }

  updateProgress(
    jobId: number,
    totalFiles: number,
    scannedFiles: number,
    failedFiles: number,
  ): boolean {
    const result = this.db
      .prepare(
        `
          UPDATE scan_jobs
          SET total_files = ?,
              scanned_files = ?,
              failed_files = ?
          WHERE id = ?
            AND status = 'scanning'
        `,
      )
      .run(totalFiles, scannedFiles, failedFiles, jobId)

    return result.changes > 0
  }

  finish(jobId: number, status: Exclude<LibraryScanStatusValue, 'idle' | 'scanning'>): boolean {
    const result = this.db
      .prepare(
        `
          UPDATE scan_jobs
          SET status = ?,
              finished_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'scanning'
        `,
      )
      .run(status, jobId)

    return result.changes > 0
  }

  fail(jobId: number, message: string): boolean {
    const result = this.db
      .prepare(
        `
          UPDATE scan_jobs
          SET status = 'failed',
              finished_at = CURRENT_TIMESTAMP,
              error_message = ?
          WHERE id = ?
            AND status = 'scanning'
        `,
      )
      .run(message, jobId)

    return result.changes > 0
  }
}
