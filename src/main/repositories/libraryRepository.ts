import type { LibraryStats } from '@shared/types/app'
import { BaseRepository } from './baseRepository'

export class LibraryRepository extends BaseRepository {
  private cachedStats: { revision: string; stats: LibraryStats } | undefined

  getStats(): LibraryStats {
    // Do not cache a caller's uncommitted state: its revision may be rolled back
    // and then reused by a different write transaction.
    const externalTransaction = this.db.inTransaction
    const result = this.db.transaction(() => {
      const revision = this.db
        .prepare('SELECT CAST(revision AS TEXT) FROM library_catalog_revision WHERE id = 1')
        .pluck()
        .get() as string
      if (!externalTransaction && this.cachedStats?.revision === revision) return this.cachedStats
      const trackCount = this.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get() as number
      // Match the album browser's available tracks and unknown-value grouping;
      // albums also stores raw metadata fallbacks and may contain obsolete rows.
      const albumCount = this.db
        .prepare(
          `
          SELECT COUNT(*) FROM (
            SELECT COALESCE(NULLIF(album_artist, ''), NULLIF(artist, ''), 'Unknown Artist'),
                   COALESCE(NULLIF(album, ''), 'Unknown Album')
            FROM library_track_display WHERE availability = 'available'
            GROUP BY 1, 2
          )
        `,
        )
        .pluck()
        .get() as number
      return { revision, stats: { trackCount, albumCount } }
    })()
    if (!externalTransaction) this.cachedStats = result
    return { ...result.stats }
  }
}
