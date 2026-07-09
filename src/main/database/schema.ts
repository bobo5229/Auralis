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
  {
    id: 7,
    name: 'metadata_refresh_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS metadata_refresh_jobs (
        id INTEGER PRIMARY KEY,
        scope TEXT NOT NULL,
        status TEXT NOT NULL,
        total_tracks INTEGER NOT NULL DEFAULT 0,
        processed_tracks INTEGER NOT NULL DEFAULT 0,
        failed_tracks INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TEXT,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS metadata_refresh_failures (
        id INTEGER PRIMARY KEY,
        job_id INTEGER NOT NULL,
        track_id INTEGER,
        file_path TEXT,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(job_id) REFERENCES metadata_refresh_jobs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_metadata_refresh_jobs_status ON metadata_refresh_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_metadata_refresh_failures_job_id ON metadata_refresh_failures(job_id);
    `,
  },
  {
    id: 8,
    name: 'metadata_system_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS track_metadata (
        track_id INTEGER PRIMARY KEY,
        title TEXT,
        artist_display TEXT,
        album_title TEXT,
        album_artist_display TEXT,
        genre_display TEXT,
        year INTEGER,
        release_date TEXT,
        lyrics_text TEXT,
        lyrics_format TEXT,
        artwork_cache_key TEXT,
        source TEXT NOT NULL DEFAULT 'file_tag',
        refreshed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS artists (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        sort_name TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS track_artists (
        track_id INTEGER NOT NULL,
        artist_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'primary',
        PRIMARY KEY(track_id, artist_id, role),
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
        FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS file_tag_snapshots (
        id INTEGER PRIMARY KEY,
        track_id INTEGER NOT NULL,
        file_size INTEGER,
        file_mtime_ms INTEGER,
        parser_name TEXT NOT NULL,
        raw_common_json TEXT NOT NULL,
        raw_native_json TEXT,
        captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_track_metadata_track_id ON track_metadata(track_id);
      CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
      CREATE INDEX IF NOT EXISTS idx_track_artists_track_role_position
        ON track_artists(track_id, role, position);
      CREATE INDEX IF NOT EXISTS idx_file_tag_snapshots_track_captured
        ON file_tag_snapshots(track_id, captured_at);

      CREATE VIEW IF NOT EXISTS library_track_display AS
      SELECT
        t.id,
        t.file_path,
        t.file_size,
        t.file_mtime_ms,
        COALESCE(tm.title, t.title) AS title,
        COALESCE(tm.artist_display, t.artist) AS artist,
        COALESCE(tm.album_title, t.album) AS album,
        COALESCE(tm.album_artist_display, t.album_artist) AS album_artist,
        t.track_no,
        t.disc_no,
        COALESCE(tm.year, t.year) AS year,
        COALESCE(tm.release_date, t.release_date) AS release_date,
        COALESCE(tm.genre_display, t.genre) AS genre,
        t.duration_seconds,
        COALESCE(tm.lyrics_text, t.lyrics_text) AS lyrics_text,
        COALESCE(tm.lyrics_format, t.lyrics_format) AS lyrics_format,
        COALESCE(tm.artwork_cache_key, a.artwork_cache_key) AS artwork_cache_key,
        tm.source AS metadata_source,
        tm.refreshed_at AS metadata_refreshed_at,
        t.created_at,
        t.updated_at
      FROM tracks t
      LEFT JOIN track_metadata tm ON tm.track_id = t.id
      LEFT JOIN albums a ON COALESCE(tm.album_title, t.album) = a.title
        AND COALESCE(tm.album_artist_display, t.album_artist) = a.artist;
    `,
  },
  {
    id: 9,
    name: 'reset_plain_lyrics_after_lrc_detection_fix',
    sql: `
      UPDATE tracks
      SET lyrics_checked_mtime_ms = NULL
      WHERE lyrics_format = 'plain';
    `,
  },
  {
    id: 10,
    name: 'reset_mpeg4_metadata_after_tag_compatibility_fix',
    sql: `
      UPDATE tracks
      SET metadata_checked_mtime_ms = NULL
      WHERE genre IS NULL
        AND (
          lower(file_path) LIKE '%.m4a'
          OR lower(file_path) LIKE '%.mp4'
          OR lower(file_path) LIKE '%.aac'
        );
    `,
  },
  {
    id: 11,
    name: 'add_availability_and_identity_to_tracks',
    sql: `
      ALTER TABLE tracks ADD COLUMN availability TEXT NOT NULL DEFAULT 'available';
      ALTER TABLE tracks ADD COLUMN missing_since TEXT;
      ALTER TABLE tracks ADD COLUMN isrc TEXT;
      ALTER TABLE tracks ADD COLUMN metadata_signature TEXT;

      CREATE INDEX IF NOT EXISTS idx_tracks_availability ON tracks(availability);
      CREATE INDEX IF NOT EXISTS idx_tracks_isrc ON tracks(isrc);
      CREATE INDEX IF NOT EXISTS idx_tracks_metadata_signature ON tracks(metadata_signature);

      DROP VIEW IF EXISTS library_track_display;
      CREATE VIEW library_track_display AS
      SELECT
        t.id,
        t.file_path,
        t.file_size,
        t.file_mtime_ms,
        COALESCE(tm.title, t.title) AS title,
        COALESCE(tm.artist_display, t.artist) AS artist,
        COALESCE(tm.album_title, t.album) AS album,
        COALESCE(tm.album_artist_display, t.album_artist) AS album_artist,
        t.track_no,
        t.disc_no,
        COALESCE(tm.year, t.year) AS year,
        COALESCE(tm.release_date, t.release_date) AS release_date,
        COALESCE(tm.genre_display, t.genre) AS genre,
        t.duration_seconds,
        COALESCE(tm.lyrics_text, t.lyrics_text) AS lyrics_text,
        COALESCE(tm.lyrics_format, t.lyrics_format) AS lyrics_format,
        COALESCE(tm.artwork_cache_key, a.artwork_cache_key) AS artwork_cache_key,
        tm.source AS metadata_source,
        tm.refreshed_at AS metadata_refreshed_at,
        t.availability,
        t.missing_since,
        t.isrc,
        t.metadata_signature,
        t.created_at,
        t.updated_at
      FROM tracks t
      LEFT JOIN track_metadata tm ON tm.track_id = t.id
      LEFT JOIN albums a ON COALESCE(tm.album_title, t.album) = a.title
        AND COALESCE(tm.album_artist_display, t.album_artist) = a.artist;
    `,
  },
  {
    id: 12,
    name: 'add_play_stats',
    sql: `
      CREATE TABLE IF NOT EXISTS track_play_stats (
        track_id INTEGER PRIMARY KEY,
        play_count INTEGER NOT NULL DEFAULT 0,
        last_played_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_track_play_stats_last_played_at
        ON track_play_stats(last_played_at);

      DROP VIEW IF EXISTS library_track_display;
      CREATE VIEW library_track_display AS
      SELECT
        t.id,
        t.file_path,
        t.file_size,
        t.file_mtime_ms,
        COALESCE(tm.title, t.title) AS title,
        COALESCE(tm.artist_display, t.artist) AS artist,
        COALESCE(tm.album_title, t.album) AS album,
        COALESCE(tm.album_artist_display, t.album_artist) AS album_artist,
        t.track_no,
        t.disc_no,
        COALESCE(tm.year, t.year) AS year,
        COALESCE(tm.release_date, t.release_date) AS release_date,
        COALESCE(tm.genre_display, t.genre) AS genre,
        t.duration_seconds,
        COALESCE(tm.lyrics_text, t.lyrics_text) AS lyrics_text,
        COALESCE(tm.lyrics_format, t.lyrics_format) AS lyrics_format,
        COALESCE(tm.artwork_cache_key, a.artwork_cache_key) AS artwork_cache_key,
        tm.source AS metadata_source,
        tm.refreshed_at AS metadata_refreshed_at,
        t.availability,
        t.missing_since,
        t.isrc,
        t.metadata_signature,
        COALESCE(ps.play_count, 0) AS play_count,
        ps.last_played_at,
        t.created_at,
        t.updated_at
      FROM tracks t
      LEFT JOIN track_metadata tm ON tm.track_id = t.id
      LEFT JOIN albums a ON COALESCE(tm.album_title, t.album) = a.title
        AND COALESCE(tm.album_artist_display, t.album_artist) = a.artist
      LEFT JOIN track_play_stats ps ON ps.track_id = t.id;
    `,
  },
  {
    id: 13,
    name: 'add_copyright_to_tracks',
    sql: `
      ALTER TABLE tracks ADD COLUMN copyright TEXT;
      UPDATE tracks SET metadata_checked_mtime_ms = NULL;

      DROP VIEW IF EXISTS library_track_display;
      CREATE VIEW library_track_display AS
      SELECT
        t.id,
        t.file_path,
        t.file_size,
        t.file_mtime_ms,
        COALESCE(tm.title, t.title) AS title,
        COALESCE(tm.artist_display, t.artist) AS artist,
        COALESCE(tm.album_title, t.album) AS album,
        COALESCE(tm.album_artist_display, t.album_artist) AS album_artist,
        t.track_no,
        t.disc_no,
        COALESCE(tm.year, t.year) AS year,
        COALESCE(tm.release_date, t.release_date) AS release_date,
        t.copyright,
        COALESCE(tm.genre_display, t.genre) AS genre,
        t.duration_seconds,
        COALESCE(tm.lyrics_text, t.lyrics_text) AS lyrics_text,
        COALESCE(tm.lyrics_format, t.lyrics_format) AS lyrics_format,
        COALESCE(tm.artwork_cache_key, a.artwork_cache_key) AS artwork_cache_key,
        tm.source AS metadata_source,
        tm.refreshed_at AS metadata_refreshed_at,
        t.availability,
        t.missing_since,
        t.isrc,
        t.metadata_signature,
        COALESCE(ps.play_count, 0) AS play_count,
        ps.last_played_at,
        t.created_at,
        t.updated_at
      FROM tracks t
      LEFT JOIN track_metadata tm ON tm.track_id = t.id
      LEFT JOIN albums a ON COALESCE(tm.album_title, t.album) = a.title
        AND COALESCE(tm.album_artist_display, t.album_artist) = a.artist
      LEFT JOIN track_play_stats ps ON ps.track_id = t.id;
    `,
  },
  {
    id: 14,
    name: 'add_daily_play_stats',
    sql: `
      CREATE TABLE daily_play_stats (
        play_date TEXT PRIMARY KEY,
        play_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_daily_play_stats_date ON daily_play_stats(play_date);
    `,
  },
  {
    id: 15,
    name: 'add_daily_track_play_stats',
    sql: `
      CREATE TABLE daily_track_play_stats (
        play_date TEXT NOT NULL,
        track_id INTEGER NOT NULL,
        play_count INTEGER NOT NULL DEFAULT 0,
        duration_seconds REAL NOT NULL DEFAULT 0,
        last_played_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(play_date, track_id),
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_daily_track_play_stats_date_count
        ON daily_track_play_stats(play_date, play_count DESC);

      ALTER TABLE daily_play_stats
        ADD COLUMN duration_seconds REAL NOT NULL DEFAULT 0;
    `,
  },
  {
    id: 16,
    name: 'backfill_daily_play_duration',
    sql: `
      UPDATE daily_track_play_stats
      SET duration_seconds = play_count * COALESCE(
        (
          SELECT duration_seconds
          FROM tracks
          WHERE tracks.id = daily_track_play_stats.track_id
        ),
        0
      )
      WHERE duration_seconds = 0
        AND play_count > 0;

      UPDATE daily_play_stats
      SET duration_seconds = COALESCE(
        (
          SELECT SUM(duration_seconds)
          FROM daily_track_play_stats
          WHERE daily_track_play_stats.play_date = daily_play_stats.play_date
        ),
        0
      )
      WHERE duration_seconds = 0
        AND EXISTS (
          SELECT 1
          FROM daily_track_play_stats
          WHERE daily_track_play_stats.play_date = daily_play_stats.play_date
        );

      UPDATE daily_play_stats
      SET duration_seconds = play_count * COALESCE(
        (
          SELECT AVG(duration_seconds)
          FROM tracks
          WHERE duration_seconds IS NOT NULL
            AND duration_seconds > 0
        ),
        0
      )
      WHERE duration_seconds = 0
        AND play_count > 0;
    `,
  },
  {
    id: 17,
    name: 'add_smart_playlists',
    sql: `
      CREATE TABLE smart_playlists (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        rule_json TEXT NOT NULL,
        view_mode TEXT NOT NULL DEFAULT 'flat'
          CHECK(view_mode IN ('flat', 'cover')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_smart_playlists_created_at
        ON smart_playlists(created_at, id);
    `,
  },
  {
    id: 18,
    name: 'add_smart_playlist_sort_order',
    sql: `
      ALTER TABLE smart_playlists
        ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

      UPDATE smart_playlists
      SET sort_order = id;

      CREATE INDEX idx_smart_playlists_sort_order
        ON smart_playlists(sort_order, id);
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
