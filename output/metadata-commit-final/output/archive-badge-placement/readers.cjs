var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// <stdin>
var stdin_exports = {};
__export(stdin_exports, {
  PlayStatsRepository: () => PlayStatsRepository,
  browserPreviewApi: () => browserPreviewApi,
  ipcChannels: () => ipcChannels
});
module.exports = __toCommonJS(stdin_exports);

// src/main/repositories/baseRepository.ts
var BaseRepository = class {
  constructor(db) {
    this.db = db;
  }
};

// src/main/repositories/playStatsRepository.ts
var dailyListeningTracks = `
  SELECT stats.track_id, stats.play_count, stats.duration_seconds,
         display.title, display.artist, display.album, display.album_artist,
         display.artwork_cache_key
  FROM daily_track_play_stats AS stats
  JOIN library_track_display AS display ON display.id = stats.track_id
  WHERE stats.play_date = @date AND stats.play_count > 0
  UNION ALL
  SELECT stats.track_id, stats.play_count, stats.duration_seconds,
         display.title, display.artist, display.album, display.album_artist,
         display.artwork_cache_key
  FROM removed_daily_track_play_stats AS stats
  JOIN removed_track_history AS display ON display.id = stats.track_id
  WHERE stats.play_date = @date AND stats.play_count > 0
`;
function latestPlayedAt(previous, incoming) {
  const previousTime = previous ? Date.parse(previous) : NaN;
  return new Date(
    Number.isNaN(previousTime) ? incoming.getTime() : Math.max(previousTime, incoming.getTime())
  ).toISOString();
}
var PlayStatsRepository = class extends BaseRepository {
  constructor(db) {
    super(db);
  }
  trackExists(trackId) {
    const row = this.db.prepare("SELECT 1 AS ok FROM tracks WHERE id = ?").get(trackId);
    return row !== void 0;
  }
  incrementPlayCount(trackId, playedAtIso, localPlayDate) {
    const playedAt = new Date(playedAtIso);
    const readLastPlayed = this.db.prepare(`
      SELECT stats.last_played_at AS trackLastPlayedAt,
             daily.last_played_at AS dailyTrackLastPlayedAt
      FROM tracks
      LEFT JOIN track_play_stats AS stats ON stats.track_id = tracks.id
      LEFT JOIN daily_track_play_stats AS daily
        ON daily.track_id = tracks.id AND daily.play_date = ?
      WHERE tracks.id = ?
    `);
    const incrementTrack = this.db.prepare(`
      INSERT INTO track_play_stats (track_id, play_count, last_played_at, updated_at)
      VALUES (?, 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(track_id) DO UPDATE SET
        play_count = play_count + 1,
        last_played_at = excluded.last_played_at,
        updated_at = CURRENT_TIMESTAMP
    `);
    const incrementDay = this.db.prepare(`
      INSERT INTO daily_play_stats (play_date, play_count, duration_seconds, updated_at)
      SELECT ?, 1, COALESCE(duration_seconds, 0), CURRENT_TIMESTAMP
      FROM tracks
      WHERE id = ?
      ON CONFLICT(play_date) DO UPDATE SET
        play_count = play_count + 1,
        duration_seconds = duration_seconds + excluded.duration_seconds,
        updated_at = CURRENT_TIMESTAMP
    `);
    const incrementDailyTrack = this.db.prepare(`
      INSERT INTO daily_track_play_stats (
        play_date,
        track_id,
        play_count,
        duration_seconds,
        last_played_at,
        updated_at
      )
      SELECT ?, id, 1, COALESCE(duration_seconds, 0), ?, CURRENT_TIMESTAMP
      FROM tracks
      WHERE id = ?
      ON CONFLICT(play_date, track_id) DO UPDATE SET
        play_count = play_count + 1,
        duration_seconds = duration_seconds + excluded.duration_seconds,
        last_played_at = excluded.last_played_at,
        updated_at = CURRENT_TIMESTAMP
    `);
    this.db.transaction(() => {
      const previous = readLastPlayed.get(localPlayDate, trackId);
      const trackPlayedAt = latestPlayedAt(previous?.trackLastPlayedAt, playedAt);
      const dailyTrackPlayedAt = latestPlayedAt(previous?.dailyTrackLastPlayedAt, playedAt);
      incrementTrack.run(trackId, trackPlayedAt);
      incrementDay.run(localPlayDate, trackId);
      incrementDailyTrack.run(localPlayDate, dailyTrackPlayedAt, trackId);
    })();
  }
  getAnnualPlayCounts(year) {
    return this.db.prepare(
      `SELECT play_date AS date, play_count AS playCount, duration_seconds AS durationSeconds
         FROM daily_play_stats
         WHERE play_date BETWEEN ? AND ?
         ORDER BY play_date`
    ).all(`${year}-01-01`, `${year}-12-31`);
  }
  getDayTopTracks(date) {
    return this.db.prepare(
      `
      WITH day_tracks AS (${dailyListeningTracks})
      SELECT track_id AS trackId, title, artist, play_count AS playCount
      FROM day_tracks
      ORDER BY play_count DESC, duration_seconds DESC, track_id ASC
      LIMIT 3
    `
    ).all({ date });
  }
  withAnnualListeningSnapshot(year, read) {
    return this.db.transaction(() => {
      const rows = this.db.prepare(
        `
        WITH history AS (
          SELECT 'library' AS source, stats.track_id, stats.play_date, stats.play_count,
                 stats.duration_seconds AS recorded_duration, display.title, display.artist,
                 display.album, display.album_artist, display.artwork_cache_key,
                 display.duration_seconds, display.availability = 'available' AS available
          FROM daily_track_play_stats stats
          JOIN library_track_display display ON display.id = stats.track_id
          WHERE stats.play_date BETWEEN @start AND @end AND stats.play_count > 0
          UNION ALL
          SELECT 'removed', stats.track_id, stats.play_date, stats.play_count,
                 stats.duration_seconds, display.title, display.artist, display.album,
                 display.album_artist, display.artwork_cache_key, NULL, 0
          FROM removed_daily_track_play_stats stats
          JOIN removed_track_history display ON display.id = stats.track_id
          WHERE stats.play_date BETWEEN @start AND @end AND stats.play_count > 0
        )
        SELECT source, track_id AS trackId, CAST(substr(play_date, 6, 2) AS INTEGER) AS month,
               MIN(play_date) AS firstPlayedDate, title, artist, album, album_artist AS albumArtist,
               artwork_cache_key AS artworkCacheKey, duration_seconds AS durationSeconds,
               available, SUM(play_count) AS playCount, SUM(recorded_duration) AS recordedDuration
        FROM history GROUP BY source, track_id, month ORDER BY source, track_id, month
      `
      ).iterate({
        start: `${year}-01-01`,
        end: `${year}-12-31`
      });
      return read({
        days: this.getAnnualPlayCounts(year),
        rows,
        getDayTopAlbums: (date) => this.getDayTopAlbums(date)
      });
    })();
  }
  getDayTopAlbums(date) {
    return this.db.prepare(
      `
      WITH day_tracks AS (${dailyListeningTracks})
      SELECT
        album,
        COALESCE(
          NULLIF(TRIM(album_artist), ''),
          NULLIF(TRIM(artist), '')
        ) AS albumArtist,
        MAX(artwork_cache_key) AS artworkCacheKey,
        SUM(play_count) AS playCount,
        SUM(duration_seconds) AS durationSeconds,
        COUNT(*) AS trackCount
      FROM day_tracks
      WHERE album IS NOT NULL
        AND TRIM(album) <> ''
      GROUP BY
        album,
        COALESCE(
          NULLIF(TRIM(album_artist), ''),
          NULLIF(TRIM(artist), '')
        )
      ORDER BY durationSeconds DESC, playCount DESC, album COLLATE NOCASE ASC
      LIMIT 10
    `
    ).all({ date });
  }
  resetAll() {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM daily_track_play_stats").run();
      this.db.prepare("DELETE FROM daily_play_stats").run();
      this.db.prepare("DELETE FROM track_play_stats").run();
      this.db.prepare("DELETE FROM removed_daily_track_play_stats").run();
      this.db.prepare("UPDATE removed_track_history SET play_count=0,last_played_at=NULL").run();
    })();
  }
};

// src/shared/types/windowBehavior.ts
var WINDOW_CLOSE_BEHAVIORS = ["quit", "tray"];
function isWindowCloseBehavior(value) {
  return WINDOW_CLOSE_BEHAVIORS.some((behavior) => behavior === value);
}

// src/renderer/shared/ipc/browserPreviewApi.ts
var previewCloseBehavior = "quit";
var emptyTrackPage = {
  snapshotId: "browser-preview",
  totalTracks: 0,
  tracks: [],
  nextCursor: null,
  diagnostics: {
    snapshotBuildMs: null,
    pageSliceMs: 0
  }
};
function mockResponse(group, method, args) {
  switch (`${group}.${method}`) {
    case "app.getInfo":
      return { name: "Auralis", version: "Browser preview", databasePath: "Browser preview" };
    case "app.claimCdStartupEntry":
      return { firstEntry: false };
    case "library.getStats":
      return { trackCount: 0, albumCount: 0 };
    case "library.getTrackPage":
      return emptyTrackPage;
    case "library.selectRoot":
      return { canceled: true };
    case "library.getScanStatus":
      return null;
    case "library.startScan":
      return { jobId: 0 };
    case "library.cancelScan":
      return { ok: false };
    case "library.revealInExplorer":
      return { ok: false, reason: "reveal-failed" };
    case "playback.nativeAvailability":
      return { available: false, reason: "Unavailable in browser preview" };
    case "playback.subscribeSpectrum":
    case "playback.nativeCommand":
      return { accepted: false };
    case "playback.getAudioUrl":
    case "playback.getRandomTrack":
    case "playback.getRandomAlbumTracks":
    case "playback.getAlbumTracks":
    case "lyrics.getByTrackId":
    case "metadata.getTrackMetadata":
    case "metadata.getRefreshStatus":
    case "smartPlaylists.getDetail":
    case "playlists.getDetail":
      return null;
    case "lyrics.openLrcEditor":
    case "lyrics.saveLrcEditor":
      return { ok: false, code: "track-unavailable" };
    case "lyrics.closeLrcEditor":
      return { ok: true, value: null };
    case "playback.recordEffectivePlay":
      return { ok: false, recorded: false };
    case "archive.getAnnualPlayCounts":
    case "archive.getDayTopTracks":
    case "archive.getDayTopAlbums":
      return [];
    case "archive.getAnnualSummary":
      return {
        year: args[0],
        playCount: 0,
        activeDays: 0,
        albumCount: 0,
        albums: [],
        tracks: [],
        artists: [],
        months: [],
        seasons: [],
        peakDay: null,
        longestRun: null,
        selection: []
      };
    case "playback.acquireReadLease":
      return { leaseId: "browser-preview" };
    case "playback.releaseReadLease":
      return { ok: true };
    case "window.control":
    case "window.getMaximized":
      return { isMaximized: false };
    case "window.getVisibility":
      return { isVisible: true };
    case "window.getCloseBehavior":
      return { behavior: previewCloseBehavior, trayAvailable: false };
    case "window.setCloseBehavior":
      if (!isWindowCloseBehavior(args[0]) || args[0] === "tray")
        throw new Error("Unavailable in browser preview");
      previewCloseBehavior = args[0];
      return { behavior: previewCloseBehavior, trayAvailable: false };
    case "database.exportBackup":
    case "database.restoreBackup":
      return { status: "cancelled" };
    case "app.claimStartupAlbum":
    case "app.drawStartupAlbum":
      return { album: null };
    case "app.setLocale":
      return void 0;
  }
  if (method.startsWith("list") || ["getRoots", "getTracks", "getTrackCounts", "listRefreshFailures"].includes(method)) {
    return [];
  }
  return {};
}
function createGroup(group) {
  return new Proxy(/* @__PURE__ */ Object.create(null), {
    get(_target, method) {
      if (typeof method !== "string") return void 0;
      return (...args) => {
        if (method.startsWith("on")) return () => void 0;
        if (group === "app" && ["rendererReady", "splashReady"].includes(method) || group === "systemMedia" && method === "updateThumbarState") {
          return void 0;
        }
        return Promise.resolve().then(() => mockResponse(group, method, args));
      };
    }
  });
}
var browserPreviewApi = new Proxy(/* @__PURE__ */ Object.create(null), {
  get(_target, group) {
    if (typeof group !== "string") return void 0;
    return createGroup(group);
  }
});

// src/shared/ipc/channels.ts
var ipcChannels = {
  database: {
    exportBackup: "database:export-backup",
    restoreBackup: "database:restore-backup"
  },
  app: {
    getInfo: "app:get-info",
    setLocale: "app:set-locale",
    claimCdStartupEntry: "app:claim-cd-startup-entry",
    claimStartupAlbum: "app:claim-startup-album",
    drawStartupAlbum: "app:draw-startup-album",
    exportDiagnostics: "app:export-diagnostics",
    rendererReady: "app:renderer-ready",
    splashReady: "app:splash-ready"
  },
  library: {
    getStats: "library:get-stats",
    selectRoot: "library:select-root",
    getRoots: "library:get-roots",
    startScan: "library:start-scan",
    cancelScan: "library:cancel-scan",
    getScanStatus: "library:get-scan-status",
    getTracks: "library:get-tracks",
    getTrackPage: "library:get-track-page",
    getAlbumDetail: "library:get-album-detail",
    revealInExplorer: "library:reveal-in-explorer",
    scanProgress: "library:scan-progress",
    changed: "library:changed"
  },
  smartPlaylists: {
    list: "smart-playlists:list",
    listTrackCounts: "smart-playlists:list-track-counts",
    getDetail: "smart-playlists:get-detail",
    create: "smart-playlists:create",
    createFromQuery: "smart-playlists:create-from-query",
    createRecentAdded: "smart-playlists:create-recent-added",
    updateRecentAddedDays: "smart-playlists:update-recent-added-days",
    rename: "smart-playlists:rename",
    updateViewMode: "smart-playlists:update-view-mode",
    delete: "smart-playlists:delete",
    reorder: "smart-playlists:reorder"
  },
  playlists: {
    changed: "playlists:changed",
    list: "playlists:list",
    listTrackCounts: "playlists:list-track-counts",
    listSidebarItems: "playlists:list-sidebar-items",
    getDetail: "playlists:get-detail",
    create: "playlists:create",
    rename: "playlists:rename",
    updateViewMode: "playlists:update-view-mode",
    delete: "playlists:delete",
    addTracks: "playlists:add-tracks",
    reorderSidebarItems: "playlists:reorder-sidebar-items"
  },
  lyrics: {
    getByTrackId: "lyrics:get-by-track-id",
    openLrcEditor: "lyrics:open-lrc-editor",
    saveLrcEditor: "lyrics:save-lrc-editor",
    closeLrcEditor: "lyrics:close-lrc-editor"
  },
  playback: {
    spectrumSubscribe: "playback:spectrum-subscribe",
    spectrumFrame: "playback:spectrum-frame",
    nativeAvailability: "playback:native-availability",
    nativeCommand: "playback:native-command",
    nativeEvent: "playback:native-event",
    getAudioUrl: "playback:get-audio-url",
    getRandomTrack: "playback:get-random-track",
    getRandomAlbumTracks: "playback:get-random-album-tracks",
    getAlbumTracks: "playback:get-album-tracks",
    recordEffectivePlay: "playback:record-effective-play",
    acquireReadLease: "playback:acquire-read-lease",
    releaseReadLease: "playback:release-read-lease"
  },
  systemMedia: {
    updateThumbarState: "system-media:update-thumbar-state",
    command: "system-media:command"
  },
  archive: {
    getAnnualPlayCounts: "archive:get-annual-play-counts",
    getAnnualSummary: "archive:get-annual-summary",
    getDayTopTracks: "archive:get-day-top-tracks",
    getDayTopAlbums: "archive:get-day-top-albums",
    resetPlayStats: "archive:reset-play-stats"
  },
  metadata: {
    refreshTrack: "metadata:refresh-track",
    refreshTracks: "metadata:refresh-tracks",
    refreshLyricsMissing: "metadata:refresh-lyrics-missing",
    getRefreshStatus: "metadata:get-refresh-status",
    listRefreshFailures: "metadata:list-refresh-failures",
    clearRefreshFailures: "metadata:clear-refresh-failures",
    getTrackMetadata: "metadata:get-track-metadata",
    getTrackEditState: "metadata:get-track-edit-state",
    updateTrackMetadata: "metadata:update-track-metadata",
    refreshProgress: "metadata:refresh-progress",
    trackEditStateChanged: "metadata:track-edit-state-changed"
  },
  window: {
    getCloseBehavior: "window:get-close-behavior",
    setCloseBehavior: "window:set-close-behavior",
    control: "window:control",
    getMaximized: "window:get-maximized",
    maximizedChanged: "window:maximized-changed",
    getVisibility: "window:get-visibility",
    visibilityChanged: "window:visibility-changed"
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PlayStatsRepository,
  browserPreviewApi,
  ipcChannels
});
