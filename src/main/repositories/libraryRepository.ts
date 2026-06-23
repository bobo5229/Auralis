import type { LibraryStats } from '@shared/types/app'
import { BaseRepository } from './baseRepository'

export class LibraryRepository extends BaseRepository {
  getStats(): LibraryStats {
    const trackCount = this.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get() as number
    const albumCount = this.db.prepare('SELECT COUNT(*) FROM albums').pluck().get() as number

    return {
      trackCount,
      albumCount,
    }
  }
}
