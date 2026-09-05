import type { LibraryRoot } from '@shared/types/libraryScan'
import { BaseRepository } from './baseRepository'

interface LibraryRootRow {
  id: number
  path: string
  created_at: string
  last_scanned_at: string | null
}

function toLibraryRoot(row: LibraryRootRow): LibraryRoot {
  return {
    id: row.id,
    path: row.path,
    createdAt: row.created_at,
    lastScannedAt: row.last_scanned_at,
  }
}

export class LibraryRootRepository extends BaseRepository {
  upsertByPath(path: string): LibraryRoot {
    this.db
      .prepare(
        `
          INSERT INTO library_roots (path)
          VALUES (?)
          ON CONFLICT(path) DO NOTHING
        `,
      )
      .run(path)

    return this.getByPath(path)
  }

  getById(id: number): LibraryRoot | null {
    const row = this.db
      .prepare('SELECT id, path, created_at, last_scanned_at FROM library_roots WHERE id = ?')
      .get(id) as LibraryRootRow | undefined

    return row ? toLibraryRoot(row) : null
  }

  getByPath(path: string): LibraryRoot {
    const row = this.db
      .prepare('SELECT id, path, created_at, last_scanned_at FROM library_roots WHERE path = ?')
      .get(path) as LibraryRootRow | undefined

    if (!row) {
      throw new Error(`Library root was not created: ${path}`)
    }

    return toLibraryRoot(row)
  }

  list(): LibraryRoot[] {
    const rows = this.db
      .prepare('SELECT id, path, created_at, last_scanned_at FROM library_roots ORDER BY id DESC')
      .all() as LibraryRootRow[]

    return rows.map(toLibraryRoot)
  }

  markScanned(rootId: number): void {
    this.db
      .prepare('UPDATE library_roots SET last_scanned_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(rootId)
  }

  deleteById(id: number): boolean {
    const deleteFailures = this.db.prepare(`
      DELETE FROM scan_failures
      WHERE job_id IN (SELECT id FROM scan_jobs WHERE root_id = ?)
    `)
    const deleteJobs = this.db.prepare('DELETE FROM scan_jobs WHERE root_id = ?')
    const deleteRoot = this.db.prepare('DELETE FROM library_roots WHERE id = ?')

    const remove = this.db.transaction(() => {
      deleteFailures.run(id)
      deleteJobs.run(id)
      return deleteRoot.run(id).changes > 0
    })

    return remove()
  }
}
