import { BaseRepository } from './baseRepository'
import { toPathVariants } from './trackRepositoryPaths'

/** Durable scan inputs are separate from the visible catalog until settlement. */
export class ScanStagingRepository extends BaseRepository {
  stageTracks<T extends { filePath: string }>(jobId: number, tracks: T[]): void {
    const insert = this.db
      .prepare(`INSERT INTO scan_staged_tracks(root_id,file_path,job_id,snapshot_json)
      VALUES((SELECT root_id FROM scan_jobs WHERE id=?),?,?,?)
      ON CONFLICT(root_id,file_path) DO UPDATE SET job_id=excluded.job_id,snapshot_json=excluded.snapshot_json`)
    this.db.transaction(() => {
      for (const track of tracks) insert.run(jobId, track.filePath, jobId, JSON.stringify(track))
    })()
  }

  stageInventory(jobId: number, found: string[], unreadable: string[]): void {
    const file = this.db.prepare('INSERT OR IGNORE INTO scan_inventory VALUES(?,?)')
    const directory = this.db.prepare(
      'INSERT OR IGNORE INTO scan_unreadable_directories VALUES(?,?)',
    )
    this.db.transaction(() => {
      for (const path of found) for (const variant of toPathVariants(path)) file.run(jobId, variant)
      for (const path of unreadable) directory.run(jobId, path)
    })()
  }

  *tracks<T>(jobId: number): Iterable<T> {
    // Page rather than holding an active SQLite iterator while other repositories write.
    const query = this.db.prepare(`SELECT file_path,snapshot_json FROM scan_staged_tracks
      WHERE job_id=? AND file_path>? ORDER BY file_path LIMIT 300`)
    let after = ''
    for (;;) {
      const rows = query.all(jobId, after) as { file_path: string; snapshot_json: string }[]
      if (!rows.length) return
      for (const row of rows) yield JSON.parse(row.snapshot_json) as T
      after = rows.at(-1)!.file_path
    }
  }

  readCached<T>(rootId: number, path: string): T | undefined {
    const row = this.db
      .prepare('SELECT snapshot_json FROM scan_staged_tracks WHERE root_id=? AND file_path=?')
      .get(rootId, path) as { snapshot_json: string } | undefined
    return row ? (JSON.parse(row.snapshot_json) as T) : undefined
  }

  unreadableDirectories(jobId: number): string[] {
    return this.db
      .prepare('SELECT file_path FROM scan_unreadable_directories WHERE job_id=?')
      .pluck()
      .all(jobId) as string[]
  }

  complete(jobId: number, rootId: number): void {
    this.db.prepare('DELETE FROM scan_staged_tracks WHERE root_id=?').run(rootId)
    this.db.prepare('DELETE FROM scan_inventory WHERE job_id=?').run(jobId)
    this.db.prepare('DELETE FROM scan_unreadable_directories WHERE job_id=?').run(jobId)
  }

  pruneInventories(): void {
    // Inventories can never resume: a new run must discover the filesystem again.
    // Parsed snapshots remain a cache, validated against current files on reuse.
    this.db.exec(
      "DELETE FROM scan_inventory WHERE job_id IN (SELECT id FROM scan_jobs WHERE status<>'scanning'); DELETE FROM scan_unreadable_directories WHERE job_id IN (SELECT id FROM scan_jobs WHERE status<>'scanning')",
    )
  }
}
