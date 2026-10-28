import type { ScanFailure } from '@shared/types/libraryScan'
import { BaseRepository } from './baseRepository'

export class ScanFailureRepository extends BaseRepository {
  insertMany(failures: ScanFailure[]): void {
    if (failures.length === 0) {
      return
    }

    const insert = this.db.prepare(
      'INSERT INTO scan_failures (job_id, file_path, reason) VALUES (?, ?, ?)',
    )
    const insertBatch = this.db.transaction((items: ScanFailure[]) => {
      for (const failure of items) {
        insert.run(failure.jobId, failure.filePath, failure.reason)
      }
    })

    insertBatch(failures)
  }
}
