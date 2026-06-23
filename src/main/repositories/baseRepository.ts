import type Database from 'better-sqlite3'

export abstract class BaseRepository {
  protected constructor(protected readonly db: Database.Database) {}
}
