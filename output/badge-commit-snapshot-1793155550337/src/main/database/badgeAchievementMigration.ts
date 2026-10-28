export const badgeAchievementMigration = {
  id: 32,
  name: 'record_badge_listening_evidence',
  sql: `
    CREATE TABLE badge_listening_epoch(id INTEGER PRIMARY KEY CHECK(id=1), epoch INTEGER NOT NULL);
    INSERT INTO badge_listening_epoch VALUES(1, 0);
    -- Snapshot once: effective plays after this migration must never be counted twice.
    CREATE TABLE badge_legacy_daily(play_date TEXT PRIMARY KEY, seconds REAL NOT NULL);
    INSERT INTO badge_legacy_daily SELECT play_date, MAX(0, duration_seconds) FROM daily_play_stats;
    CREATE TABLE badge_listening_daily(play_date TEXT PRIMARY KEY, seconds REAL NOT NULL);
    CREATE TABLE badge_listening_sessions(
      session_id TEXT PRIMARY KEY, track_id INTEGER NOT NULL, sequence INTEGER NOT NULL
    );
    -- No cascading FK: removing a music file must not erase time spent listening.
    CREATE TABLE badge_track_coverage(
      track_id INTEGER PRIMARY KEY, intervals_json TEXT NOT NULL, covered_seconds REAL NOT NULL
    );
  `,
} as const
