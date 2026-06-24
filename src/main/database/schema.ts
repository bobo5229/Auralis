import type Database from 'better-sqlite3'

const migrations = [
  {
    id: 1,
    name: 'initial_library_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        title TEXT,
        artist TEXT,
        album TEXT,
        duration_seconds REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT,
        artwork_cache_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(title, artist)
      );

      CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
      CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    `,
  },
  {
    id: 2,
    name: 'library_scan_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS library_roots (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_scanned_at TEXT
      );

      CREATE TABLE IF NOT EXISTS scan_jobs (
        id INTEGER PRIMARY KEY,
        root_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        total_files INTEGER NOT NULL DEFAULT 0,
        scanned_files INTEGER NOT NULL DEFAULT 0,
        failed_files INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TEXT,
        error_message TEXT,
        FOREIGN KEY(root_id) REFERENCES library_roots(id)
      );

      CREATE TABLE IF NOT EXISTS scan_failures (
        id INTEGER PRIMARY KEY,
        job_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(job_id) REFERENCES scan_jobs(id)
      );

      ALTER TABLE tracks ADD COLUMN file_size INTEGER;
      ALTER TABLE tracks ADD COLUMN file_mtime_ms INTEGER;
      ALTER TABLE tracks ADD COLUMN album_artist TEXT;
      ALTER TABLE tracks ADD COLUMN track_no INTEGER;
      ALTER TABLE tracks ADD COLUMN disc_no INTEGER;
      ALTER TABLE tracks ADD COLUMN year INTEGER;
      ALTER TABLE tracks ADD COLUMN genre TEXT;

      CREATE INDEX IF NOT EXISTS idx_tracks_file_signature
        ON tracks(file_path, file_size, file_mtime_ms);
      CREATE INDEX IF NOT EXISTS idx_scan_jobs_status ON scan_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_scan_failures_job_id ON scan_failures(job_id);
    `,
  },
  {
    id: 3,
    name: 'add_release_date_to_tracks',
    sql: `
      ALTER TABLE tracks ADD COLUMN release_date TEXT;
    `,
  },
  {
    id: 4,
    name: 'add_lyrics_to_tracks',
    sql: `
      ALTER TABLE tracks ADD COLUMN lyrics_text TEXT;
      ALTER TABLE tracks ADD COLUMN lyrics_format TEXT;
    `,
  },
  {
    id: 5,
    name: 'add_lyrics_checked_mtime_to_tracks',
    sql: `
      ALTER TABLE tracks ADD COLUMN lyrics_checked_mtime_ms INTEGER;
    `,
  },
  {
    id: 6,
    name: 'add_metadata_checked_mtime_to_tracks',
    sql: `
      ALTER TABLE tracks ADD COLUMN metadata_checked_mtime_ms INTEGER;
    `,
  },
] as const

export function migrateDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const hasMigration = db
    .prepare('SELECT 1 FROM schema_migrations WHERE id = ?')
    .pluck() as Database.Statement<[number], 1 | undefined>

  const insertMigration = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)')

  const runMigration = db.transaction((migration: (typeof migrations)[number]) => {
    db.exec(migration.sql)
    insertMigration.run(migration.id, migration.name)
  })

  for (const migration of migrations) {
    if (!hasMigration.get(migration.id)) {
      runMigration(migration)
    }
  }
}
