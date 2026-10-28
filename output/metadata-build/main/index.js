import { ipcMain, nativeImage, app, BrowserWindow, dialog, protocol, shell, Tray, Menu } from "electron";
import { existsSync, mkdirSync, renameSync, unlinkSync, readdirSync, statSync, openSync, readSync, closeSync, readFileSync, copyFileSync, constants, writeFileSync, realpathSync, watch, createReadStream, rmSync } from "node:fs";
import { isAbsolute, join, basename, dirname, resolve, relative, extname, win32, parse, normalize, sep } from "node:path";
import { l as logger, j as isCacheFileName, A as ARTWORK_CACHE_VERSION, k as isLegacyArtworkCacheKey, w as writeArtworkToCache, m as parseFile, o as resolveLyrics, q as resolveFileDate, t as resolveGenres, u as resolveArtists, v as resolveAlbumArtists, p as parseAudioMetadata, x as normalizeEditableMetadata, y as hasEmbeddedTtml, z as getDefaultExportFromCjs, B as getDirectoryArtworkFingerprintSync, d as normalizeMetadata, C as resolveLyricsForFile, a as readArtworkForFile, e as normalizeIdentityText, h as buildMetadataSignature, g as getMetadataParserVersion, i as isCurrentArtworkCacheKey, D as getLyricsSidecarFingerprintSync, s as sameLyricsSidecarFingerprint, c as getLyricsSidecarFingerprint, E as isLyricSidecar, F as resolveAudioCandidatesForLyricSidecar, G as isSupportedAudioFile, H as lyricSidecarCandidates, I as flushLogger, J as normalizeEditableText, K as normalizeEditableReleaseDate, L as normalizeEditableYear, M as parseStream, N as supportedAudioExtensions, O as initializeLogger, P as ensureArtworkCacheDir, Q as shutdownLogger } from "./chunks/resolveLyricsForFile-COlnUOK3.js";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { randomUUID, createHash } from "node:crypto";
import { readdir, stat, readFile, mkdtemp, writeFile, unlink, rmdir, copyFile, rm, link, rename, lstat, realpath, open, mkdir } from "node:fs/promises";
import { B as BaseRepository, t as toRootPrefixes, e as escapeLikePattern, a as toPathVariants, T as TrackQueryRepository, S as STARTUP_ALBUM_HISTORY_LIMIT } from "./chunks/startupAlbum-X8KWrNIq.js";
import { spawn, execFile } from "node:child_process";
import { connect } from "node:net";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
import { tmpdir } from "node:os";
import { j as joinDelimitedValues, c as canonicalizeDelimitedValues, a as splitDelimitedValues, h as hasSameScanFileFingerprint, s as scanFileFingerprint, e as encodeScanFileFingerprint, b as cleanDelimitedValues, d as decodeScanFileFingerprint, n as normalizeDelimitedValue } from "./chunks/delimitedValues-CpE_2YHT.js";
import { isDeepStrictEqual } from "node:util";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { a as assertMetadataFingerprint, r as readStableMetadata } from "./chunks/readStableMetadata-Bn1i4569.js";
import { c as collectAudioFiles } from "./chunks/libraryScanInventory-EHqOAaYv.js";
import { s as sanitizeSerializedLogLine, n as normalizeDiagnosticError, a as sanitizeDiagnosticText } from "./chunks/logSanitizer-BxKsoqIP.js";
import { D as DEFAULT_LOG_FILE_COUNT, a as DEFAULT_LOG_FILE_BYTES, l as listManagedLogFileNames } from "./chunks/rollingLogStore-DH0sUGNn.js";
import { Readable } from "node:stream";
import "sharp";
import "pino";
import "node:zlib";
import "tty";
import "util";
import "os";
import "node:events";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const ipcChannels = {
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
    recordListeningProgress: "playback:record-listening-progress",
    acquireReadLease: "playback:acquire-read-lease",
    releaseReadLease: "playback:release-read-lease"
  },
  systemMedia: {
    updateThumbarState: "system-media:update-thumbar-state",
    command: "system-media:command"
  },
  archive: {
    getBadgeAchievements: "archive:get-badge-achievements",
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
    getTrackEditSnapshot: "metadata:get-track-edit-snapshot",
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
const mainWindows = /* @__PURE__ */ new WeakSet();
function registerMainWindow(window) {
  if (window.isDestroyed() || mainWindows.has(window)) return;
  mainWindows.add(window);
  window.once("closed", () => mainWindows.delete(window));
}
function isRegisteredMainWindow(window) {
  return mainWindows.has(window) && !window.isDestroyed();
}
const DEFAULT_UI_LOCALE = "zh-Hans";
const nativeUiMessages = {
  "zh-Hans": {
    startupTitle: "Auralis 启动失败",
    startupRetry: "请关闭应用后重试。",
    showMainWindow: "显示主界面",
    quitApp: "退出应用",
    selectFolder: "选择音乐文件夹",
    exportBackup: "导出数据库备份",
    restoreBackup: "选择要恢复的数据库备份",
    backupFilter: "Auralis 数据库备份",
    previous: "上一首",
    play: "播放",
    pause: "暂停",
    next: "下一首",
    newPlaylist: "新建歌单",
    recentAdded: "最近添加"
  },
  en: {
    startupTitle: "Auralis failed to start",
    startupRetry: "Close the app and try again.",
    showMainWindow: "Show main window",
    quitApp: "Quit Auralis",
    selectFolder: "Choose Music Folder",
    exportBackup: "Export Database Backup",
    restoreBackup: "Choose Database Backup to Restore",
    backupFilter: "Auralis Database Backup",
    previous: "Previous track",
    play: "Play",
    pause: "Pause",
    next: "Next track",
    newPlaylist: "New playlist",
    recentAdded: "Recently added"
  }
};
let locale = DEFAULT_UI_LOCALE;
const listeners = /* @__PURE__ */ new Set();
function getNativeUiMessages() {
  return nativeUiMessages[locale];
}
function setNativeUiLocale(value) {
  locale = value;
  for (const listener of listeners) listener();
}
function onNativeUiLocaleChanged(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function sendRendererEvent(target, channel, payload) {
  if (!target.isDestroyed()) target.send(channel, payload);
}
function createRendererEventSender(getWindows) {
  return (channel, payload) => {
    for (const window of getWindows()) {
      try {
        sendRendererEvent(window.webContents, channel, payload);
      } catch (error) {
        logger.warn({ error, channel }, "Failed to send renderer event");
      }
    }
  };
}
const ICON_SIZE = 16;
function createThumbarIcon(kind) {
  const bitmap = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
  const drawPixel = (x, y) => {
    if (x < 0 || x >= ICON_SIZE || y < 0 || y >= ICON_SIZE) return;
    const offset = (y * ICON_SIZE + x) * 4;
    bitmap[offset] = 255;
    bitmap[offset + 1] = 255;
    bitmap[offset + 2] = 255;
    bitmap[offset + 3] = 255;
  };
  const drawVerticalBar = (startX, startY, width, height) => {
    for (let y = startY; y < startY + height; y += 1) {
      for (let x = startX; x < startX + width; x += 1) drawPixel(x, y);
    }
  };
  const drawTriangle = (direction) => {
    for (let row = 0; row < 10; row += 1) {
      const distanceFromMiddle = Math.abs(row - 4.5);
      const width = Math.max(1, 5 - Math.floor(distanceFromMiddle));
      for (let column = 0; column < width; column += 1) {
        const x = direction === "right" ? 5 + column : 10 - column;
        drawPixel(x, row + 3);
      }
    }
  };
  switch (kind) {
    case "previous":
      drawVerticalBar(3, 3, 2, 10);
      drawTriangle("left");
      break;
    case "play":
      drawTriangle("right");
      break;
    case "pause":
      drawVerticalBar(4, 3, 3, 10);
      drawVerticalBar(9, 3, 3, 10);
      break;
    case "next":
      drawTriangle("right");
      drawVerticalBar(11, 3, 2, 10);
      break;
  }
  return nativeImage.createFromBitmap(bitmap, {
    width: ICON_SIZE,
    height: ICON_SIZE,
    scaleFactor: 1
  });
}
function createWindowsThumbarController(window) {
  if (process.platform !== "win32") return () => void 0;
  const icons = {
    previous: createThumbarIcon("previous"),
    play: createThumbarIcon("play"),
    pause: createThumbarIcon("pause"),
    next: createThumbarIcon("next")
  };
  const sendCommand = (command) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      sendRendererEvent(window.webContents, ipcChannels.systemMedia.command, command);
    }
  };
  let latestState = { hasTrack: false, isPlaying: false };
  const updateButtons = (state) => {
    latestState = state;
    if (window.isDestroyed()) return;
    if (!state.hasTrack) {
      window.setThumbarButtons([]);
      return;
    }
    const buttons = [
      {
        tooltip: getNativeUiMessages().previous,
        icon: icons.previous,
        click: () => sendCommand("previous")
      },
      {
        tooltip: state.isPlaying ? getNativeUiMessages().pause : getNativeUiMessages().play,
        icon: state.isPlaying ? icons.pause : icons.play,
        click: () => sendCommand("toggle-play-pause")
      },
      {
        tooltip: getNativeUiMessages().next,
        icon: icons.next,
        click: () => sendCommand("next")
      }
    ];
    window.setThumbarButtons(buttons);
  };
  const handleStateUpdate = (event, state) => {
    if (event.sender !== window.webContents || typeof state?.hasTrack !== "boolean" || typeof state.isPlaying !== "boolean") {
      return;
    }
    updateButtons(state);
  };
  ipcMain.on(ipcChannels.systemMedia.updateThumbarState, handleStateUpdate);
  const unsubscribeLocale = onNativeUiLocaleChanged(() => updateButtons(latestState));
  return () => {
    unsubscribeLocale();
    ipcMain.removeListener(ipcChannels.systemMedia.updateThumbarState, handleStateUpdate);
    if (!window.isDestroyed()) window.setThumbarButtons([]);
  };
}
const securedSessions = /* @__PURE__ */ new WeakSet();
function toUrl(value) {
  try {
    if (isAbsolute(value)) {
      return pathToFileURL(value);
    }
    return new URL(value);
  } catch {
    try {
      return pathToFileURL(value);
    } catch {
      return null;
    }
  }
}
function normalizePathname(url) {
  try {
    const pathname = decodeURIComponent(url.pathname).replaceAll("\\", "/");
    return process.platform === "win32" ? pathname.toLowerCase() : pathname;
  } catch {
    return null;
  }
}
function isTrustedRendererUrl(candidate, rendererEntry) {
  const candidateUrl = toUrl(candidate);
  const entryUrl = toUrl(rendererEntry);
  if (!candidateUrl || !entryUrl) return false;
  const candidatePathname = normalizePathname(candidateUrl);
  const entryPathname = normalizePathname(entryUrl);
  if (!candidatePathname || !entryPathname) return false;
  return candidateUrl.protocol === entryUrl.protocol && candidateUrl.username === entryUrl.username && candidateUrl.password === entryUrl.password && candidateUrl.hostname === entryUrl.hostname && candidateUrl.port === entryUrl.port && candidatePathname === entryPathname;
}
function denyRendererPermissions(session) {
  if (securedSessions.has(session)) return;
  securedSessions.add(session);
  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}
function secureRendererWindow(window, rendererEntry) {
  const { webContents } = window;
  denyRendererPermissions(webContents.session);
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  const preventUntrustedNavigation = (event, url) => {
    if (!isTrustedRendererUrl(url, rendererEntry)) {
      event.preventDefault();
    }
  };
  webContents.on("will-navigate", preventUntrustedNavigation);
  webContents.on("will-redirect", preventUntrustedNavigation);
}
function getWindowVisibility(window) {
  return { isVisible: !window.isDestroyed() && window.isVisible() && !window.isMinimized() };
}
function observeWindowVisibility(window) {
  const notify = () => {
    sendRendererEvent(
      window.webContents,
      ipcChannels.window.visibilityChanged,
      getWindowVisibility(window)
    );
  };
  window.on("show", notify);
  window.on("hide", notify);
  window.on("minimize", notify);
  window.on("restore", notify);
  return () => {
    window.removeListener("show", notify);
    window.removeListener("hide", notify);
    window.removeListener("minimize", notify);
    window.removeListener("restore", notify);
  };
}
function resolveAppIconPath() {
  return [
    join(process.resourcesPath, "icons", "icon.png"),
    join(app.getAppPath(), "resources", "icons", "icon.png"),
    join(__dirname, "../../resources/icons/icon.png")
  ].find((candidate) => existsSync(candidate));
}
function createWindow(options = {}) {
  const showSplash = options.showSplash !== false;
  const icon = resolveAppIconPath();
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: "Auralis",
    // 默认深色主题底色，与 main.css 的 --auralis-bg 一致；
    // 实际主题在收到 app:splash-ready 后、窗口可见前再对齐。
    backgroundColor: "#121212",
    transparent: false,
    frame: false,
    show: false,
    ...icon ? { icon } : {},
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      webSecurity: true
    }
  });
  const rendererEntry = process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL : join(__dirname, "../renderer/index.html");
  secureRendererWindow(window, rendererEntry);
  registerMainWindow(window);
  const disposeThumbarController = createWindowsThumbarController(window);
  const disposeVisibility = observeWindowVisibility(window);
  const notifyMaximizedChanged = () => {
    if (!window.webContents.isDestroyed()) {
      sendRendererEvent(window.webContents, ipcChannels.window.maximizedChanged, {
        isMaximized: window.isMaximized()
      });
    }
  };
  window.on("maximize", notifyMaximizedChanged);
  window.on("unmaximize", notifyMaximizedChanged);
  let didShow = false;
  const showWindow = () => {
    if (didShow || window.isDestroyed()) {
      return;
    }
    didShow = true;
    window.show();
  };
  const READY_TIMEOUT_MS = 5e3;
  const readyTimeout = setTimeout(() => {
    showWindow();
  }, READY_TIMEOUT_MS);
  const handleRendererReady = (event) => {
    if (event.sender === window.webContents) {
      clearTimeout(readyTimeout);
      showWindow();
    }
  };
  const SPLASH_THEME_BACKGROUNDS = {
    dark: "#121212",
    light: "#f0f1f2"
  };
  const handleSplashReady = (event, payload) => {
    if (event.sender !== window.webContents) return;
    if (!event.senderFrame || event.senderFrame !== window.webContents.mainFrame) return;
    const theme = payload?.theme;
    if (theme !== "light" && theme !== "dark") return;
    window.setBackgroundColor(SPLASH_THEME_BACKGROUNDS[theme]);
    if (showSplash) showWindow();
  };
  ipcMain.on(ipcChannels.app.rendererReady, handleRendererReady);
  ipcMain.on(ipcChannels.app.splashReady, handleSplashReady);
  window.once("closed", () => {
    clearTimeout(readyTimeout);
    ipcMain.removeListener(ipcChannels.app.rendererReady, handleRendererReady);
    ipcMain.removeListener(ipcChannels.app.splashReady, handleSplashReady);
    disposeThumbarController();
    disposeVisibility();
  });
  window.webContents.once("render-process-gone", showWindow);
  window.webContents.once("did-fail-load", showWindow);
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(rendererEntry);
    if (!showSplash) url.searchParams.set("splash", "0");
    window.loadURL(url.toString());
  } else {
    if (showSplash) window.loadFile(rendererEntry);
    else window.loadFile(rendererEntry, { query: { splash: "0" } });
  }
  return window;
}
const MAX_PRE_MIGRATION_BACKUPS = 5;
function removeTemporarySnapshot(tempPath) {
  if (!tempPath) return;
  for (const path of [tempPath, `${tempPath}-wal`, `${tempPath}-shm`, `${tempPath}-journal`]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch (error) {
      logger.warn({ error, path }, "Failed to remove temporary database snapshot");
    }
  }
}
function createPreMigrationBackup(options) {
  const {
    db,
    databasePath: databasePath2,
    targetVersion,
    backupsDir,
    maxBackups = MAX_PRE_MIGRATION_BACKUPS
  } = options;
  if (!databasePath2 || databasePath2 === ":memory:" || !existsSync(databasePath2)) {
    return null;
  }
  let tempBackupPath = null;
  try {
    mkdirSync(backupsDir, { recursive: true });
    const timestamp = Date.now();
    const backupFileName = `pre-migration-v${targetVersion}-${timestamp}-${randomUUID()}.backup`;
    const backupPath = join(backupsDir, backupFileName);
    tempBackupPath = `${backupPath}.tmp`;
    db.prepare("VACUUM INTO ?").run(tempBackupPath);
    renameSync(tempBackupPath, backupPath);
    logger.info({ backupPath, targetVersion }, "Created pre-migration database backup");
    prunePreMigrationBackups(backupsDir, maxBackups);
    return backupPath;
  } catch (error) {
    logger.error({ error, databasePath: databasePath2, targetVersion }, "Failed to create pre-migration backup");
    return null;
  } finally {
    removeTemporarySnapshot(tempBackupPath);
  }
}
function prunePreMigrationBackups(backupsDir, maxBackups = MAX_PRE_MIGRATION_BACKUPS) {
  if (!existsSync(backupsDir)) return;
  try {
    const files = readdirSync(backupsDir);
    const migrationBackups = files.filter((file) => file.startsWith("pre-migration-") && file.endsWith(".backup")).map((fileName) => {
      const fullPath = join(backupsDir, fileName);
      let mtimeMs = 0;
      try {
        mtimeMs = statSync(fullPath).mtimeMs;
      } catch {
      }
      return { fileName, fullPath, mtimeMs };
    }).sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (migrationBackups.length > maxBackups) {
      const toDelete = migrationBackups.slice(maxBackups);
      for (const item of toDelete) {
        if (basename(item.fullPath).startsWith("pre-migration-") && basename(item.fullPath).endsWith(".backup")) {
          unlinkSync(item.fullPath);
          logger.info({ path: item.fullPath }, "Pruned old pre-migration backup");
        }
      }
    }
  } catch (error) {
    logger.warn({ error, backupsDir }, "Failed to prune pre-migration backups");
  }
}
const badgeAchievementMigration = {
  id: 32,
  name: "record_badge_listening_evidence",
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
  `
};
const METADATA_OVERRIDE = {
  title: 1,
  artist: 2,
  album: 4,
  albumArtist: 8,
  genre: 16,
  year: 32,
  releaseDate: 64
};
const ALL_METADATA_OVERRIDES = Object.values(METADATA_OVERRIDE).reduce(
  (mask, bit) => mask | bit,
  0
);
const migrations = [
  {
    id: 1,
    name: "initial_library_schema",
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
    `
  },
  {
    id: 2,
    name: "library_scan_schema",
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
    `
  },
  {
    id: 3,
    name: "add_release_date_to_tracks",
    sql: `
      ALTER TABLE tracks ADD COLUMN release_date TEXT;
    `
  },
  {
    id: 4,
    name: "add_lyrics_to_tracks",
    sql: `
      ALTER TABLE tracks ADD COLUMN lyrics_text TEXT;
      ALTER TABLE tracks ADD COLUMN lyrics_format TEXT;
    `
  },
  {
    id: 5,
    name: "add_lyrics_checked_mtime_to_tracks",
    sql: `
      ALTER TABLE tracks ADD COLUMN lyrics_checked_mtime_ms INTEGER;
    `
  },
  {
    id: 6,
    name: "add_metadata_checked_mtime_to_tracks",
    sql: `
      ALTER TABLE tracks ADD COLUMN metadata_checked_mtime_ms INTEGER;
    `
  },
  {
    id: 7,
    name: "metadata_refresh_tables",
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
    `
  },
  {
    id: 8,
    name: "metadata_system_tables",
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

      -- Reserved for future search / faceted-browse normalization model.
      -- Currently written by metadata refresh (INSERT / DELETE), not yet queried.
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
    `
  },
  {
    id: 9,
    name: "reset_plain_lyrics_after_lrc_detection_fix",
    sql: `
      UPDATE tracks
      SET lyrics_checked_mtime_ms = NULL
      WHERE lyrics_format = 'plain';
    `
  },
  {
    id: 10,
    name: "reset_mpeg4_metadata_after_tag_compatibility_fix",
    sql: `
      UPDATE tracks
      SET metadata_checked_mtime_ms = NULL
      WHERE genre IS NULL
        AND (
          lower(file_path) LIKE '%.m4a'
          OR lower(file_path) LIKE '%.mp4'
          OR lower(file_path) LIKE '%.aac'
        );
    `
  },
  {
    id: 11,
    name: "add_availability_and_identity_to_tracks",
    sql: `
      ALTER TABLE tracks ADD COLUMN availability TEXT NOT NULL DEFAULT 'available';
      ALTER TABLE tracks ADD COLUMN missing_since TEXT;
      ALTER TABLE tracks ADD COLUMN isrc TEXT;
      -- Reserved for future signature-based dedup (currently file_size + file_mtime_ms).
      -- Computed and stored on every upsert, not yet used in matching logic.
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
    `
  },
  {
    id: 12,
    name: "add_play_stats",
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
    `
  },
  {
    id: 13,
    name: "add_copyright_to_tracks",
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
    `
  },
  {
    id: 14,
    name: "add_daily_play_stats",
    sql: `
      CREATE TABLE daily_play_stats (
        play_date TEXT PRIMARY KEY,
        play_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_daily_play_stats_date ON daily_play_stats(play_date);
    `
  },
  {
    id: 15,
    name: "add_daily_track_play_stats",
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
    `
  },
  {
    id: 16,
    name: "backfill_daily_play_duration",
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
    `
  },
  {
    id: 17,
    name: "add_smart_playlists",
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
    `
  },
  {
    id: 18,
    name: "add_smart_playlist_sort_order",
    sql: `
      ALTER TABLE smart_playlists
        ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

      UPDATE smart_playlists
      SET sort_order = id;

      CREATE INDEX idx_smart_playlists_sort_order
        ON smart_playlists(sort_order, id);
    `
  },
  {
    id: 19,
    name: "drop_file_tag_snapshots",
    sql: `DROP TABLE IF EXISTS file_tag_snapshots`
  },
  {
    id: 20,
    name: "add_regular_playlists",
    sql: `
      CREATE TABLE playlists (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        view_mode TEXT NOT NULL DEFAULT 'flat'
          CHECK(view_mode IN ('flat', 'cover')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE playlist_tracks (
        playlist_id INTEGER NOT NULL,
        track_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(playlist_id, track_id),
        FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      UPDATE smart_playlists
      SET sort_order = sort_order
      WHERE sort_order IS NOT NULL;

      CREATE INDEX idx_playlists_sort_order
        ON playlists(sort_order, id);
      CREATE INDEX idx_playlist_tracks_playlist_position
        ON playlist_tracks(playlist_id, position);
      CREATE INDEX idx_playlist_tracks_track_id
        ON playlist_tracks(track_id);
    `
  },
  {
    id: 21,
    name: "library_track_display_artwork_album_join",
    sql: `
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
        COALESCE(NULLIF(tm.artwork_cache_key, ''), a.artwork_cache_key) AS artwork_cache_key,
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
      LEFT JOIN albums a
        ON COALESCE(tm.album_title, t.album) = a.title
       AND COALESCE(
             NULLIF(COALESCE(tm.album_artist_display, t.album_artist), ''),
             COALESCE(tm.artist_display, t.artist)
           ) = a.artist
      LEFT JOIN track_play_stats ps ON ps.track_id = t.id;
    `
  },
  {
    id: 22,
    name: "lyrics_sidecar_fingerprint",
    sql: `ALTER TABLE tracks ADD COLUMN lyrics_sidecar_fingerprint TEXT;`
  },
  {
    id: 23,
    name: "add_composer_to_tracks",
    sql: `
      ALTER TABLE tracks ADD COLUMN composer TEXT;
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
        t.composer,
        COALESCE(tm.genre_display, t.genre) AS genre,
        t.duration_seconds,
        COALESCE(tm.lyrics_text, t.lyrics_text) AS lyrics_text,
        COALESCE(tm.lyrics_format, t.lyrics_format) AS lyrics_format,
        COALESCE(NULLIF(tm.artwork_cache_key, ''), a.artwork_cache_key) AS artwork_cache_key,
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
      LEFT JOIN albums a
        ON COALESCE(tm.album_title, t.album) = a.title
       AND COALESCE(
             NULLIF(COALESCE(tm.album_artist_display, t.album_artist), ''),
             COALESCE(tm.artist_display, t.artist)
           ) = a.artist
      LEFT JOIN track_play_stats ps ON ps.track_id = t.id;
    `
  },
  {
    id: 24,
    name: "preserve_listening_history_after_track_removal",
    sql: `
      CREATE TABLE removed_track_history (
        id INTEGER PRIMARY KEY,
        title TEXT,
        artist TEXT,
        album TEXT,
        album_artist TEXT,
        genre TEXT,
        artwork_cache_key TEXT,
        source_file_path TEXT NOT NULL,
        play_count INTEGER NOT NULL DEFAULT 0,
        last_played_at TEXT,
        removed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        recovery_json TEXT NOT NULL
      );
      CREATE TABLE removed_daily_track_play_stats (
        play_date TEXT NOT NULL,
        track_id INTEGER NOT NULL,
        play_count INTEGER NOT NULL DEFAULT 0,
        duration_seconds REAL NOT NULL DEFAULT 0,
        last_played_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(play_date, track_id),
        FOREIGN KEY(track_id) REFERENCES removed_track_history(id) ON DELETE CASCADE
      );
      CREATE VIEW listening_track_display AS
        SELECT id,title,artist,album,album_artist,genre,artwork_cache_key FROM library_track_display
        UNION ALL
        SELECT id,title,artist,album,album_artist,genre,artwork_cache_key FROM removed_track_history;
      CREATE VIEW listening_daily_track_play_stats AS
        SELECT * FROM daily_track_play_stats
        UNION ALL
        SELECT * FROM removed_daily_track_play_stats;
      CREATE TRIGGER prevent_removed_track_id_reuse
        AFTER INSERT ON tracks
        WHEN EXISTS(SELECT 1 FROM removed_track_history WHERE id=NEW.id)
        BEGIN SELECT RAISE(ABORT, 'Track ID is reserved by listening history'); END;
    `
  },
  {
    id: 25,
    name: "add_track_bitrate",
    sql: `
      ALTER TABLE tracks ADD COLUMN bitrate_bps REAL;
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
        t.composer,
        COALESCE(tm.genre_display, t.genre) AS genre,
        t.duration_seconds,
        t.bitrate_bps,
        COALESCE(tm.lyrics_text, t.lyrics_text) AS lyrics_text,
        COALESCE(tm.lyrics_format, t.lyrics_format) AS lyrics_format,
        COALESCE(NULLIF(tm.artwork_cache_key, ''), a.artwork_cache_key) AS artwork_cache_key,
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
      LEFT JOIN albums a
        ON COALESCE(tm.album_title, t.album) = a.title
       AND COALESCE(
             NULLIF(COALESCE(tm.album_artist_display, t.album_artist), ''),
             COALESCE(tm.artist_display, t.artist)
           ) = a.artist
      LEFT JOIN track_play_stats ps ON ps.track_id = t.id;
    `
  },
  {
    id: 26,
    name: "add_metadata_parser_version",
    sql: `
      -- Baseline used before per-format versioning. Existing MP3 rows will
      -- differ from the new MP3 revision; unchanged other formats keep the fast path.
      ALTER TABLE tracks ADD COLUMN metadata_parser_version TEXT NOT NULL DEFAULT 'metadata:1';
    `
  },
  {
    id: 27,
    name: "add_track_codec",
    sql: `
      ALTER TABLE tracks ADD COLUMN codec TEXT;
    `
  },
  {
    id: 28,
    name: "add_library_catalog_revision",
    sql: `
      CREATE TABLE library_catalog_revision (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO library_catalog_revision (id) VALUES (1);

      -- Track the columns consumed by TrackQueryRepository.getAll(), including
      -- its display joins. Keep revisions transactional and visible to workers.
      CREATE TRIGGER catalog_tracks_insert AFTER INSERT ON tracks
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;
      CREATE TRIGGER catalog_tracks_delete AFTER DELETE ON tracks
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;
      CREATE TRIGGER catalog_tracks_update AFTER UPDATE ON tracks
      WHEN NEW.id IS NOT OLD.id
        OR NEW.title IS NOT OLD.title OR NEW.artist IS NOT OLD.artist
        OR NEW.album IS NOT OLD.album OR NEW.album_artist IS NOT OLD.album_artist
        OR NEW.track_no IS NOT OLD.track_no OR NEW.disc_no IS NOT OLD.disc_no
        OR NEW.release_date IS NOT OLD.release_date OR NEW.copyright IS NOT OLD.copyright
        OR NEW.composer IS NOT OLD.composer OR NEW.duration_seconds IS NOT OLD.duration_seconds
        OR NEW.bitrate_bps IS NOT OLD.bitrate_bps OR NEW.genre IS NOT OLD.genre
        OR NEW.availability IS NOT OLD.availability OR NEW.created_at IS NOT OLD.created_at
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;

      CREATE TRIGGER catalog_metadata_insert AFTER INSERT ON track_metadata
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;
      CREATE TRIGGER catalog_metadata_delete AFTER DELETE ON track_metadata
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;
      CREATE TRIGGER catalog_metadata_update AFTER UPDATE ON track_metadata
      WHEN NEW.track_id IS NOT OLD.track_id
        OR NEW.title IS NOT OLD.title OR NEW.artist_display IS NOT OLD.artist_display
        OR NEW.album_title IS NOT OLD.album_title
        OR NEW.album_artist_display IS NOT OLD.album_artist_display
        OR NEW.genre_display IS NOT OLD.genre_display OR NEW.release_date IS NOT OLD.release_date
        OR NEW.artwork_cache_key IS NOT OLD.artwork_cache_key
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;

      CREATE TRIGGER catalog_albums_insert AFTER INSERT ON albums
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;
      CREATE TRIGGER catalog_albums_delete AFTER DELETE ON albums
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;
      CREATE TRIGGER catalog_albums_update AFTER UPDATE ON albums
      WHEN NEW.title IS NOT OLD.title OR NEW.artist IS NOT OLD.artist
        OR NEW.artwork_cache_key IS NOT OLD.artwork_cache_key
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;

      CREATE TRIGGER catalog_play_stats_insert AFTER INSERT ON track_play_stats
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;
      CREATE TRIGGER catalog_play_stats_delete AFTER DELETE ON track_play_stats
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;
      CREATE TRIGGER catalog_play_stats_update AFTER UPDATE ON track_play_stats
      WHEN NEW.track_id IS NOT OLD.track_id OR NEW.play_count IS NOT OLD.play_count
        OR NEW.last_played_at IS NOT OLD.last_played_at
      BEGIN UPDATE library_catalog_revision SET revision = revision + 1 WHERE id = 1; END;
    `
  },
  {
    id: 29,
    name: "add_audio_file_stat_fingerprint",
    sql: `ALTER TABLE tracks ADD COLUMN file_stat_fingerprint TEXT;`
  },
  {
    id: 30,
    name: "index_artwork_references",
    sql: `
      -- GC rechecks current references before each deletion, inside its write
      -- transaction. Keep that safety check proportional to matching keys.
      CREATE INDEX idx_albums_artwork_cache_key
        ON albums(artwork_cache_key) WHERE artwork_cache_key IS NOT NULL;
      CREATE INDEX idx_track_metadata_artwork_cache_key
        ON track_metadata(artwork_cache_key) WHERE artwork_cache_key IS NOT NULL;
      CREATE INDEX idx_removed_track_history_artwork_cache_key
        ON removed_track_history(artwork_cache_key) WHERE artwork_cache_key IS NOT NULL;
    `
  },
  {
    id: 31,
    name: "preserve_legacy_metadata_overrides",
    sql: `
      ALTER TABLE tracks ADD COLUMN title_fallback TEXT;
      ALTER TABLE tracks ADD COLUMN embedded_artwork_cache_key TEXT;
      ALTER TABLE tracks ADD COLUMN directory_artwork_cache_key TEXT;
      ALTER TABLE tracks ADD COLUMN embedded_artwork_checked_fingerprint TEXT;
      ALTER TABLE tracks ADD COLUMN effective_album_title TEXT;
      ALTER TABLE tracks ADD COLUMN effective_album_artist TEXT;
      ALTER TABLE tracks ADD COLUMN directory_artwork_checked_fingerprint TEXT;
      ALTER TABLE track_metadata ADD COLUMN override_mask INTEGER NOT NULL DEFAULT 0;
      -- Preserve exactly what the old display view exposed before changing its semantics.
      UPDATE track_metadata SET
        title = (SELECT title FROM library_track_display WHERE id = track_metadata.track_id),
        artist_display = (SELECT artist FROM library_track_display WHERE id = track_metadata.track_id),
        album_title = (SELECT album FROM library_track_display WHERE id = track_metadata.track_id),
        album_artist_display = (SELECT album_artist FROM library_track_display WHERE id = track_metadata.track_id),
        genre_display = (SELECT genre FROM library_track_display WHERE id = track_metadata.track_id),
        year = (SELECT year FROM library_track_display WHERE id = track_metadata.track_id),
        release_date = (SELECT release_date FROM library_track_display WHERE id = track_metadata.track_id),
        override_mask = ${ALL_METADATA_OVERRIDES}, source = 'legacy_user_edit'
      WHERE source = 'user_edit';
      DROP VIEW library_track_display;
      CREATE VIEW library_track_display AS
      SELECT t.id, t.file_path, t.file_size, t.file_mtime_ms,
        CASE WHEN tm.source='user_edit' THEN COALESCE(tm.title,t.title)
          WHEN (COALESCE(tm.override_mask, 0) & ${METADATA_OVERRIDE.title}) != 0 THEN tm.title ELSE COALESCE(t.title, t.title_fallback) END AS title,
        CASE WHEN tm.source='user_edit' THEN COALESCE(tm.artist_display,t.artist) WHEN (COALESCE(tm.override_mask, 0) & ${METADATA_OVERRIDE.artist}) != 0 THEN tm.artist_display ELSE t.artist END AS artist,
        CASE WHEN tm.source='user_edit' THEN COALESCE(tm.album_title,t.album) WHEN (COALESCE(tm.override_mask, 0) & ${METADATA_OVERRIDE.album}) != 0 THEN tm.album_title ELSE t.album END AS album,
        CASE WHEN tm.source='user_edit' THEN COALESCE(tm.album_artist_display,t.album_artist) WHEN (COALESCE(tm.override_mask, 0) & ${METADATA_OVERRIDE.albumArtist}) != 0 THEN tm.album_artist_display ELSE t.album_artist END AS album_artist,
        t.track_no, t.disc_no,
        CASE WHEN tm.source='user_edit' THEN COALESCE(tm.year,t.year) WHEN (COALESCE(tm.override_mask, 0) & ${METADATA_OVERRIDE.year}) != 0 THEN tm.year ELSE t.year END AS year,
        CASE WHEN tm.source='user_edit' THEN COALESCE(tm.release_date,t.release_date) WHEN (COALESCE(tm.override_mask, 0) & ${METADATA_OVERRIDE.releaseDate}) != 0 THEN tm.release_date ELSE t.release_date END AS release_date,
        t.copyright, t.composer,
        CASE WHEN tm.source='user_edit' THEN COALESCE(tm.genre_display,t.genre) WHEN (COALESCE(tm.override_mask, 0) & ${METADATA_OVERRIDE.genre}) != 0 THEN tm.genre_display ELSE t.genre END AS genre,
        t.duration_seconds, t.bitrate_bps,
        COALESCE(tm.lyrics_text, t.lyrics_text) AS lyrics_text,
        COALESCE(tm.lyrics_format, t.lyrics_format) AS lyrics_format,
        COALESCE(t.embedded_artwork_cache_key,t.directory_artwork_cache_key,
          CASE WHEN t.embedded_artwork_checked_fingerprint IS NULL THEN NULLIF(tm.artwork_cache_key, '') END,
          a.artwork_cache_key) AS artwork_cache_key,
        tm.source AS metadata_source, tm.refreshed_at AS metadata_refreshed_at,
        t.availability, t.missing_since, t.isrc, t.metadata_signature,
        COALESCE(ps.play_count, 0) AS play_count, ps.last_played_at, t.created_at, t.updated_at
      FROM tracks t LEFT JOIN track_metadata tm ON tm.track_id = t.id
      LEFT JOIN albums a ON
        COALESCE(NULLIF((CASE WHEN tm.source='user_edit' THEN COALESCE(tm.album_title,t.album) WHEN (COALESCE(tm.override_mask, 0) & ${METADATA_OVERRIDE.album}) != 0 THEN tm.album_title ELSE t.album END),''),'Unknown Album') = a.title
        AND COALESCE(
          NULLIF(CASE WHEN tm.source='user_edit' THEN COALESCE(tm.album_artist_display,t.album_artist) WHEN (COALESCE(tm.override_mask, 0) & ${METADATA_OVERRIDE.albumArtist}) != 0 THEN tm.album_artist_display ELSE t.album_artist END, ''),
          CASE WHEN tm.source='user_edit' THEN COALESCE(tm.artist_display,t.artist) WHEN (COALESCE(tm.override_mask, 0) & ${METADATA_OVERRIDE.artist}) != 0 THEN tm.artist_display ELSE t.artist END, 'Unknown Artist'
        ) = a.artist
      LEFT JOIN track_play_stats ps ON ps.track_id = t.id;
      UPDATE tracks SET effective_album_title=(SELECT COALESCE(NULLIF(album,''),'Unknown Album') FROM library_track_display WHERE id=tracks.id),
        effective_album_artist=(SELECT COALESCE(NULLIF(album_artist,''),NULLIF(artist,''),'Unknown Artist') FROM library_track_display WHERE id=tracks.id);
      CREATE INDEX idx_tracks_effective_album_artwork ON tracks(effective_album_title,effective_album_artist,availability,disc_no,track_no,id);
      CREATE INDEX idx_tracks_embedded_artwork ON tracks(embedded_artwork_cache_key) WHERE embedded_artwork_cache_key IS NOT NULL;
      CREATE INDEX idx_tracks_directory_artwork ON tracks(directory_artwork_cache_key) WHERE directory_artwork_cache_key IS NOT NULL;
      CREATE TRIGGER catalog_file_projection_update AFTER UPDATE ON tracks
      WHEN NEW.title_fallback IS NOT OLD.title_fallback
        OR NEW.embedded_artwork_cache_key IS NOT OLD.embedded_artwork_cache_key
        OR NEW.directory_artwork_cache_key IS NOT OLD.directory_artwork_cache_key
        OR NEW.embedded_artwork_checked_fingerprint IS NOT OLD.embedded_artwork_checked_fingerprint
      BEGIN UPDATE library_catalog_revision SET revision=revision+1 WHERE id=1; END;
      CREATE TRIGGER catalog_override_update AFTER UPDATE ON track_metadata
      WHEN NEW.override_mask IS NOT OLD.override_mask OR NEW.source IS NOT OLD.source
      BEGIN UPDATE library_catalog_revision SET revision=revision+1 WHERE id=1; END;
    `
  },
  badgeAchievementMigration
];
function resolveBackupsDir(databasePath2, customBackupsDir) {
  if (customBackupsDir) return customBackupsDir;
  try {
    if (app && typeof app.getPath === "function") {
      return join(app.getPath("userData"), "backups");
    }
  } catch {
  }
  if (databasePath2 && databasePath2 !== ":memory:") {
    return join(dirname(databasePath2), "..", "backups");
  }
  return void 0;
}
function migrateDatabase(db, databasePath2, backupsDir) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const hasMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE id = ?").pluck();
  const pendingMigrations = migrations.filter((migration) => !hasMigration.get(migration.id));
  if (pendingMigrations.length > 0 && !db.memory) {
    const actualDatabasePath = databasePath2 ?? db.name;
    const hasExistingData = Boolean(
      db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations' LIMIT 1"
      ).get()
    );
    const resolvedBackupsDir = databasePath2 ? resolveBackupsDir(actualDatabasePath, backupsDir) : backupsDir ?? (actualDatabasePath ? join(dirname(actualDatabasePath), "backups") : void 0);
    const backup = hasExistingData && resolvedBackupsDir ? createPreMigrationBackup({
      db,
      databasePath: actualDatabasePath,
      targetVersion: pendingMigrations[0].id,
      backupsDir: resolvedBackupsDir
    }) : null;
    if (hasExistingData && !backup)
      throw new Error("Database migration requires a successful pre-migration backup");
  }
  const insertMigration = db.prepare("INSERT INTO schema_migrations (id, name) VALUES (?, ?)");
  const runMigration = db.transaction((migration) => {
    db.exec(migration.sql);
    insertMigration.run(migration.id, migration.name);
  });
  for (const migration of pendingMigrations) {
    runMigration(migration);
  }
}
const SQLITE_HEADER_STRING = "SQLite format 3";
const SQLITE_HEADER_BYTES = 16;
function indexDefinition(db, table, name) {
  const properties = db.prepare('SELECT "unique", partial FROM pragma_index_list(?) WHERE name = ?').get(table, name);
  const columns = db.prepare('SELECT name, "desc", coll FROM pragma_index_xinfo(?) WHERE key = 1 ORDER BY seqno').all(name);
  const sql = properties.partial || columns.some((column) => column.name === null) ? db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").pluck().get(name) : void 0;
  return { ...properties, columns, sql };
}
function uniqueConstraints(db, table) {
  const indexes = db.prepare('SELECT name FROM pragma_index_list(?) WHERE "unique" = 1').all(table);
  return indexes.map(({ name }) => JSON.stringify(indexDefinition(db, table, name))).sort();
}
function validateBackupFile(filePath, databaseCtor = Database) {
  try {
    if (!existsSync(filePath)) {
      return { ok: false, error: "Backup file does not exist." };
    }
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return { ok: false, error: "Selected path is not a file." };
    }
    if (stats.size < 100) {
      return { ok: false, error: "File size is too small to be a valid SQLite database." };
    }
    const fd = openSync(filePath, "r");
    const headerBuf = Buffer.alloc(SQLITE_HEADER_BYTES);
    try {
      readSync(fd, headerBuf, 0, SQLITE_HEADER_BYTES, 0);
    } finally {
      closeSync(fd);
    }
    const headerStr = headerBuf.toString("utf8", 0, 15);
    if (headerStr !== SQLITE_HEADER_STRING) {
      return { ok: false, error: "Invalid SQLite file header signature." };
    }
    const testDb = new databaseCtor(filePath, { readonly: true, fileMustExist: true });
    try {
      const checkResult = testDb.pragma("quick_check(1)", { simple: true });
      if (checkResult !== "ok") {
        return { ok: false, error: `SQLite quick_check failed: ${String(checkResult)}` };
      }
      assertBackupSchema(testDb, databaseCtor);
    } finally {
      testDb.close();
    }
    return { ok: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: errorMsg };
  }
}
function assertBackupSchema(db, DatabaseCtor) {
  const hasHistory = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!hasHistory) throw new Error("Database does not contain expected Auralis tables.");
  const history = db.prepare("SELECT id, name, applied_at FROM schema_migrations ORDER BY id").all();
  if (!history.length || history.length > migrations.length || history.some(
    (entry, index) => entry.id !== migrations[index]?.id || entry.name !== migrations[index]?.name
  )) {
    throw new Error("Unsupported or incomplete Auralis migration history.");
  }
  const expected = new DatabaseCtor(":memory:");
  try {
    for (const migration of migrations.slice(0, history.length)) expected.exec(migration.sql);
    const objects = expected.prepare("SELECT name, type, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
    const lookup = db.prepare("SELECT type, tbl_name FROM sqlite_master WHERE name = ?");
    const columns = (connection, name) => connection.prepare('SELECT name, type, "notnull", pk FROM pragma_table_info(?)').all(name);
    for (const object of objects) {
      const actual = lookup.get(object.name);
      if (actual?.type !== object.type || actual.tbl_name !== object.tbl_name)
        throw new Error("Missing or incompatible Auralis schema object: " + object.name);
      if (object.type === "table" || object.type === "view") {
        const actualColumns = new Map(
          columns(db, object.name).map((column) => [column.name, column])
        );
        for (const column of columns(expected, object.name)) {
          if (JSON.stringify(actualColumns.get(column.name)) !== JSON.stringify(column))
            throw new Error(
              "Missing or incompatible Auralis column: " + object.name + "." + column.name
            );
        }
      }
      if (object.type === "table") {
        if (JSON.stringify(uniqueConstraints(db, object.name)) !== JSON.stringify(uniqueConstraints(expected, object.name)))
          throw new Error("Incompatible Auralis unique constraints: " + object.name);
        const references = (connection) => connection.prepare("SELECT * FROM pragma_foreign_key_list(?)").all(object.name);
        if (JSON.stringify(references(db)) !== JSON.stringify(references(expected)))
          throw new Error("Incompatible Auralis foreign keys: " + object.name);
      }
      if (object.type === "index") {
        if (JSON.stringify(indexDefinition(db, object.tbl_name, object.name)) !== JSON.stringify(indexDefinition(expected, object.tbl_name, object.name)))
          throw new Error("Incompatible Auralis index: " + object.name);
      }
    }
    if (db.prepare("SELECT * FROM pragma_foreign_key_check LIMIT 1").get())
      throw new Error("Auralis backup contains broken foreign key references.");
  } finally {
    expected.close();
  }
}
function restoreFile(path) {
  return { path, rollbackPath: `${path}.rollback`, copied: false };
}
class DatabaseRestoreFiles {
  stagedPath;
  statePath;
  database;
  journal;
  sidecars;
  files;
  state;
  constructor(databasePath2) {
    this.stagedPath = `${databasePath2}.restore_staged`;
    this.statePath = `${databasePath2}.restore_state`;
    this.database = restoreFile(databasePath2);
    this.journal = restoreFile(`${databasePath2}-journal`);
    this.sidecars = [
      restoreFile(`${databasePath2}-wal`),
      restoreFile(`${databasePath2}-shm`),
      this.journal
    ];
    this.files = [this.database, ...this.sidecars];
  }
  hasStagedRestore() {
    return existsSync(this.stagedPath);
  }
  /** Returns true when an interrupted attempt was rolled back instead of retried. */
  recoverInterruptedRestore(onCleanupError) {
    if (!existsSync(this.statePath)) {
      if (this.files.some((file) => existsSync(file.rollbackPath)))
        throw new Error("Unidentified database rollback files; preserve them for manual recovery");
      return false;
    }
    const state = JSON.parse(readFileSync(this.statePath, "utf8"));
    if (typeof state !== "object" || state === null || !("version" in state) || state.version !== 1 && state.version !== 2 || !("phase" in state) || typeof state.phase !== "string" || !["capturing", "replacing", "restored", "verified"].includes(state.phase) || !("originalExists" in state) || !Array.isArray(state.originalExists) || state.originalExists.length !== (state.version === 1 ? 3 : this.files.length) || !state.originalExists.every((value) => typeof value === "boolean"))
      throw new Error("Invalid database restore state; preserve recovery files");
    const legacy = state.version === 1;
    if (legacy && (existsSync(this.journal.rollbackPath) || (state.phase === "replacing" || state.phase === "restored") && existsSync(this.journal.path)))
      throw new Error("Legacy database restore has an untracked journal; preserve recovery files");
    this.state = {
      version: 2,
      phase: state.phase,
      originalExists: legacy ? [...state.originalExists, false] : state.originalExists
    };
    if (this.files.some(
      (file, index) => !this.state.originalExists[index] && existsSync(file.rollbackPath)
    ))
      throw new Error("Unexpected database rollback file; preserve recovery files");
    if (this.state.phase === "verified") {
      this.cleanupRollbackFiles(onCleanupError);
      if (this.hasStagedRestore() && existsSync(this.statePath))
        throw new Error("Previous verified database restore cleanup is incomplete");
      return false;
    }
    if (this.state.phase === "capturing") {
      for (const file of this.files) file.copied = true;
    }
    this.rollback();
    return true;
  }
  captureOriginal() {
    this.setState({
      version: 2,
      phase: "capturing",
      originalExists: this.files.map((file) => existsSync(file.path))
    });
    for (const [index, file] of this.files.entries()) {
      if (!this.state.originalExists[index]) continue;
      copyFileSync(file.path, file.rollbackPath, constants.COPYFILE_EXCL);
      file.copied = true;
    }
  }
  replaceFromStaged() {
    this.setPhase("replacing");
    copyFileSync(this.stagedPath, this.database.path);
    this.removeSidecars();
  }
  rollback() {
    if (!this.state) return;
    if (this.state.phase === "replacing") {
      for (const [index, file] of this.files.entries())
        if (this.state.originalExists[index] && !existsSync(file.rollbackPath))
          throw new Error(`Missing database rollback file: ${file.rollbackPath}`);
      this.removeSidecars();
      for (const [index, file] of this.files.entries()) {
        if (this.state.originalExists[index]) copyFileSync(file.rollbackPath, file.path);
        else if (existsSync(file.path)) unlinkSync(file.path);
      }
      this.setPhase("restored");
    }
    if (existsSync(this.stagedPath)) unlinkSync(this.stagedPath);
    for (const file of this.files) {
      if (this.state.phase === "capturing" && !file.copied) continue;
      if (existsSync(file.rollbackPath)) unlinkSync(file.rollbackPath);
    }
    this.removeStateIfClean();
  }
  cleanupVerifiedRestore(onCleanupError) {
    if (existsSync(this.stagedPath)) unlinkSync(this.stagedPath);
    this.setPhase("verified");
    this.cleanupRollbackFiles(onCleanupError);
  }
  cleanupRollbackFiles(onCleanupError) {
    for (const file of this.files) {
      try {
        if (existsSync(file.rollbackPath)) unlinkSync(file.rollbackPath);
      } catch (error) {
        onCleanupError(error, file.rollbackPath);
      }
    }
    try {
      this.removeStateIfClean();
    } catch (error) {
      onCleanupError(error, this.statePath);
    }
  }
  removeStateIfClean() {
    if (this.files.every((file) => !existsSync(file.rollbackPath))) {
      if (existsSync(this.statePath)) unlinkSync(this.statePath);
      this.state = void 0;
    }
  }
  setPhase(phase) {
    if (!this.state) throw new Error("Database restore state is missing");
    this.setState({ ...this.state, phase });
  }
  setState(state) {
    const temporaryPath = `${this.statePath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(state), "utf8");
    renameSync(temporaryPath, this.statePath);
    this.state = state;
  }
  removeSidecars() {
    for (const file of this.sidecars) if (existsSync(file.path)) unlinkSync(file.path);
  }
}
function migrateAndVerifyRestore(databasePath2, dependencies) {
  const { databaseCtor, migrate } = dependencies;
  const db = new databaseCtor(databasePath2, { fileMustExist: true });
  try {
    db.pragma("foreign_keys = ON");
    migrate(db);
    assertBackupSchema(db, databaseCtor);
    const result = db.pragma("quick_check(1)", { simple: true });
    if (result !== "ok") throw new Error(`Corrupt restored database quick_check: ${String(result)}`);
  } finally {
    db.close();
  }
}
function applyStagedDatabaseRestore(databasePath2, dependencies) {
  const files = new DatabaseRestoreFiles(databasePath2);
  const onCleanupError = (error, path) => {
    logger.warn({ error, path }, "Restore succeeded; rollback cleanup deferred");
  };
  if (files.recoverInterruptedRestore(onCleanupError)) {
    logger.warn({ databasePath: databasePath2 }, "Recovered interrupted database restore; original files restored");
    return false;
  }
  if (!files.hasStagedRestore()) return false;
  logger.info(
    { stagedPath: files.stagedPath, databasePath: databasePath2 },
    "Detected staged database restore; applying atomic swap"
  );
  try {
    files.captureOriginal();
    const validation = validateBackupFile(files.stagedPath, dependencies.databaseCtor);
    if (!validation.ok) throw new Error(validation.error);
    files.replaceFromStaged();
    migrateAndVerifyRestore(databasePath2, dependencies);
    files.cleanupVerifiedRestore(onCleanupError);
    logger.info({ databasePath: databasePath2 }, "Staged database restore applied and verified successfully");
    return true;
  } catch (error) {
    logger.error(
      { error, databasePath: databasePath2 },
      "Failed to apply staged database restore; executing rollback"
    );
    try {
      files.rollback();
    } catch (rollbackError) {
      logger.error({ rollbackError }, "Catastrophic error during database restore rollback");
    }
    throw new Error(
      `Failed to apply staged database restore: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
async function exportDatabaseBackup(options) {
  let tempTargetPath = null;
  try {
    const { db, databasePath: databasePath2, showSaveDialog } = options;
    if (!showSaveDialog) {
      return { status: "failed", error: "Save dialog provider is unavailable." };
    }
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const dialogResult = await showSaveDialog({
      title: "导出数据库备份",
      defaultPath: `auralis-backup-${dateStr}.backup`,
      filters: [{ name: "Auralis Database Backup (*.backup)", extensions: ["backup", "sqlite"] }]
    });
    if (dialogResult.canceled || !dialogResult.filePath) {
      return { status: "cancelled" };
    }
    const targetPath = dialogResult.filePath;
    const targetDir = dirname(targetPath);
    mkdirSync(targetDir, { recursive: true });
    tempTargetPath = `${targetPath}.tmp-${randomUUID()}`;
    await db.backup(tempTargetPath);
    renameSync(tempTargetPath, targetPath);
    logger.info({ databasePath: databasePath2, targetPath }, "Exported database backup successfully");
    return { status: "saved", targetPath };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error, databasePath: options.databasePath }, "Failed to export database backup");
    return { status: "failed", error: errorMsg };
  } finally {
    if (tempTargetPath && existsSync(tempTargetPath)) {
      try {
        unlinkSync(tempTargetPath);
      } catch (error) {
        logger.warn({ error, tempTargetPath }, "Failed to remove incomplete export backup");
      }
    }
  }
}
async function stageDatabaseRestore(options) {
  let tempStagedPath = null;
  try {
    const { currentDbPath, showOpenDialog, databaseCtor } = options;
    if (!showOpenDialog) {
      return { status: "failed", error: "Open dialog provider is unavailable." };
    }
    const dialogResult = await showOpenDialog({
      title: "选择要恢复的数据库备份",
      properties: ["openFile"],
      filters: [
        {
          name: "Auralis Database Backup (*.backup, *.sqlite)",
          extensions: ["backup", "sqlite", "db"]
        }
      ]
    });
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { status: "cancelled" };
    }
    const selectedPath = dialogResult.filePaths[0];
    const stagedPath = `${currentDbPath}.restore_staged`;
    tempStagedPath = `${stagedPath}.tmp-${randomUUID()}`;
    mkdirSync(dirname(stagedPath), { recursive: true });
    const source2 = new (databaseCtor ?? Database)(selectedPath, {
      readonly: true,
      fileMustExist: true
    });
    try {
      await source2.backup(tempStagedPath);
    } finally {
      source2.close();
    }
    const validation = validateBackupFile(tempStagedPath, databaseCtor);
    if (!validation.ok) {
      logger.warn({ selectedPath, error: validation.error }, "Rejected invalid restore backup file");
      return { status: "failed", error: validation.error ?? "Validation failed" };
    }
    renameSync(tempStagedPath, stagedPath);
    logger.info({ selectedPath, stagedPath }, "Staged database restore file successfully");
    return { status: "staged", requiresRestart: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { error, currentDbPath: options.currentDbPath },
      "Failed to stage database restore"
    );
    return { status: "failed", error: errorMsg };
  } finally {
    removeTemporarySnapshot(tempStagedPath);
  }
}
function applyStagedRestoreIfExists(databasePath2, options) {
  return applyStagedDatabaseRestore(databasePath2, {
    databaseCtor: Database,
    migrate: migrateDatabase
  });
}
let database;
let databasePath = "";
function copyLegacyDevDatabaseIfNeeded(targetPath) {
  if (app.isPackaged || existsSync(targetPath)) return;
  const legacyPath = join(app.getAppPath(), "data", "auralis.sqlite");
  if (!existsSync(legacyPath)) return;
  const files = ["", "-shm", "-wal"];
  for (const suffix of files) {
    const source2 = `${legacyPath}${suffix}`;
    if (existsSync(source2)) {
      copyFileSync(source2, `${targetPath}${suffix}`);
    }
  }
  logger.info({ legacyPath, databasePath: targetPath }, "Copied legacy dev SQLite database");
}
function getDatabasePath() {
  if (!databasePath) {
    const dataDirectory = join(app.getPath("userData"), "data");
    mkdirSync(dataDirectory, { recursive: true });
    databasePath = join(dataDirectory, "auralis.sqlite");
    copyLegacyDevDatabaseIfNeeded(databasePath);
  }
  return databasePath;
}
function initializeDatabase() {
  if (database) {
    return database;
  }
  const dbPath = getDatabasePath();
  applyStagedRestoreIfExists(dbPath);
  database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  const healthCheck = database.pragma("quick_check(1)", { simple: true });
  if (healthCheck !== "ok") {
    logger.fatal(
      { healthCheck, databasePath: dbPath },
      "Database quick_check failed with corruption"
    );
    database.close();
    database = void 0;
    throw new Error(`Database quick_check failed: ${String(healthCheck)}`);
  }
  try {
    migrateDatabase(database, dbPath);
  } catch (error) {
    database.close();
    database = void 0;
    throw error;
  }
  logger.info({ databasePath: dbPath }, "SQLite initialized");
  return database;
}
function closeDatabase() {
  if (database) {
    database.close();
    database = void 0;
  }
}
function mergeListeningIntervals(intervals) {
  const merged = [];
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue;
    const previous = merged.at(-1);
    if (previous && start <= previous[1] + 1e-3) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
function sampleDailySeconds(sample) {
  const result = [];
  let start = Date.parse(sample.startedAtIso);
  const end = start + sample.playedSeconds * 1e3;
  while (start < end) {
    const date = new Date(start);
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    const stop = Math.min(next, end);
    result.push([day, (stop - start) / 1e3]);
    start = stop;
  }
  return result;
}
class BadgeAchievementRepository {
  constructor(db) {
    this.db = db;
  }
  getEpoch() {
    return this.db.prepare("SELECT epoch FROM badge_listening_epoch WHERE id=1").pluck().get();
  }
  record(batch) {
    return this.db.transaction(() => {
      const epoch = this.getEpoch();
      if (batch.epoch !== epoch) return { ok: false, epoch };
      const track = this.db.prepare("SELECT duration_seconds AS duration FROM tracks WHERE id=?").get(batch.trackId);
      if (!track) return { ok: false, epoch };
      const duration = track.duration && Number.isFinite(track.duration) && track.duration > 0 ? track.duration : null;
      const previous = this.db.prepare(
        "SELECT track_id AS trackId, sequence FROM badge_listening_sessions WHERE session_id=?"
      ).get(batch.sessionId);
      if (previous && previous.trackId !== batch.trackId) return { ok: false, epoch };
      if (previous && previous.sequence >= batch.sequence) return { ok: true, epoch };
      const samples = batch.samples;
      if (samples.some(
        (s) => s.startSeconds < 0 || s.endSeconds <= s.startSeconds || s.endSeconds - s.startSeconds > s.playedSeconds + 0.5
      ))
        return { ok: false, epoch };
      const stored = this.db.prepare("SELECT intervals_json FROM badge_track_coverage WHERE track_id=?").pluck().get(batch.trackId);
      const intervals = mergeListeningIntervals([
        ...stored ? JSON.parse(stored) : [],
        ...samples.map(
          (s) => [s.startSeconds, Math.min(s.endSeconds, duration ?? Infinity)]
        )
      ]);
      const covered = intervals.reduce((n, [a, b]) => n + b - a, 0);
      this.db.prepare(
        "INSERT INTO badge_track_coverage VALUES(?,?,?) ON CONFLICT(track_id) DO UPDATE SET intervals_json=excluded.intervals_json,covered_seconds=excluded.covered_seconds"
      ).run(batch.trackId, JSON.stringify(intervals), covered);
      const addDay = this.db.prepare(
        "INSERT INTO badge_listening_daily VALUES(?,?) ON CONFLICT(play_date) DO UPDATE SET seconds=seconds+excluded.seconds"
      );
      for (const sample of samples)
        for (const [day, seconds] of sampleDailySeconds(sample)) addDay.run(day, seconds);
      this.db.prepare(
        "INSERT INTO badge_listening_sessions VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET sequence=excluded.sequence"
      ).run(batch.sessionId, batch.trackId, batch.sequence);
      return { ok: true, epoch };
    })();
  }
  getAchievements() {
    return this.db.transaction(() => {
      const time = this.db.prepare(
        `WITH days AS (
        SELECT play_date,SUM(seconds) AS seconds FROM (
          SELECT * FROM badge_legacy_daily UNION ALL SELECT * FROM badge_listening_daily
        ) GROUP BY play_date
      ) SELECT COALESCE(SUM(seconds),0) AS seconds, COALESCE(SUM(seconds >= 3600),0) AS days FROM days`
      ).get();
      const albums = this.db.prepare(
        `SELECT COUNT(*) AS totalTracks,
        SUM(CASE WHEN t.duration_seconds > 0 AND COALESCE(c.covered_seconds,0) + 0.000001 >= t.duration_seconds * 0.9
          AND (SELECT COALESCE(SUM(MAX(0,MIN(json_extract(value,'$[1]'),t.duration_seconds)-json_extract(value,'$[0]'))),0)
            FROM json_each(COALESCE(c.intervals_json,'[]'))) + 0.000001 >= t.duration_seconds * 0.9 THEN 1 ELSE 0 END) AS completedTracks,
        MIN(instr(lower(COALESCE(t.genre,'')), 'live') > 0) AS live
        FROM library_track_display t LEFT JOIN badge_track_coverage c ON c.track_id=t.id
        WHERE NULLIF(TRIM(t.album),'') IS NOT NULL
        GROUP BY t.album, COALESCE(NULLIF(TRIM(t.album_artist),''),NULLIF(TRIM(t.artist),''),'Unknown Artist')`
      ).iterate();
      let completeAlbums = 0, completeLiveAlbums = 0;
      let albumProgress = { completedTracks: 0, totalTracks: 0 };
      let liveAlbumProgress = { completedTracks: 0, totalTracks: 0 };
      const better = (a, b) => !b.totalTracks || a.completedTracks / a.totalTracks > b.completedTracks / b.totalTracks;
      for (const album of albums) {
        const progress = { completedTracks: album.completedTracks, totalTracks: album.totalTracks };
        if (better(progress, albumProgress)) albumProgress = progress;
        if (album.live && better(progress, liveAlbumProgress)) liveAlbumProgress = progress;
        if (album.completedTracks === album.totalTracks) {
          completeAlbums++;
          if (album.live) completeLiveAlbums++;
        }
      }
      return {
        epoch: this.getEpoch(),
        listeningSeconds: time.seconds,
        listeningDays: time.days,
        completeAlbums,
        completeLiveAlbums,
        albumProgress,
        liveAlbumProgress
      };
    })();
  }
}
function registerBadgeAchievementIpcHandlers(registrar, repository, changed) {
  registrar.handle(ipcChannels.archive.getBadgeAchievements, () => repository.getAchievements());
  registrar.handle(ipcChannels.playback.recordListeningProgress, (_event, payload) => {
    const result = repository.record(payload);
    if (result.ok) changed();
    return result;
  });
}
let entered = false;
function claimCdStartupEntry() {
  const firstEntry = !entered;
  entered = true;
  return { firstEntry };
}
function createStartupAlbumSession() {
  let claimed = false;
  return async (pick) => {
    if (claimed) return { album: null };
    claimed = true;
    return { album: await pick() };
  };
}
const claimStartupAlbum = createStartupAlbumSession();
const unusedAlbumIds = `
  WITH referenced AS MATERIALIZED (
    SELECT album AS title, CAST(COALESCE(NULLIF(album_artist, ''), artist) AS TEXT) AS artist
    FROM tracks
    UNION
    SELECT COALESCE(metadata.album_title, tracks.album),
           CAST(COALESCE(
             NULLIF(COALESCE(metadata.album_artist_display, tracks.album_artist), ''),
             COALESCE(metadata.artist_display, tracks.artist)
           ) AS TEXT)
    FROM tracks JOIN track_metadata AS metadata ON metadata.track_id = tracks.id
    UNION
    SELECT COALESCE(NULLIF(album, ''), 'Unknown Album'),
           CAST(COALESCE(NULLIF(album_artist, ''), NULLIF(artist, ''), 'Unknown Artist') AS TEXT)
    FROM library_track_display
  )
  SELECT albums.id FROM albums
  LEFT JOIN referenced
    ON referenced.title IS albums.title AND referenced.artist IS albums.artist
  WHERE referenced.title IS NULL
`;
class AlbumMaintenanceRepository extends BaseRepository {
  hasUnusedAlbums() {
    return this.db.prepare(`SELECT 1 FROM (${unusedAlbumIds}) LIMIT 1`).get() !== void 0;
  }
  removeUnusedAlbums() {
    return this.db.prepare(`DELETE FROM albums WHERE id IN (${unusedAlbumIds})`).run().changes;
  }
}
function isPathUnderCacheDir$1(filePath, cacheDir) {
  const resolvedFile = resolve(filePath);
  const resolvedCache = resolve(cacheDir);
  const fileForCompare = process.platform === "win32" ? resolvedFile.toLowerCase() : resolvedFile;
  const cacheForCompare = process.platform === "win32" ? resolvedCache.toLowerCase() : resolvedCache;
  const rel = relative(cacheForCompare, fileForCompare);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
class ArtworkCacheGarbageCollector {
  constructor(db, cacheDir) {
    this.db = db;
    this.cacheDir = cacheDir;
    this.albums = new AlbumMaintenanceRepository(db);
  }
  running = false;
  albums;
  isRunning() {
    return this.running;
  }
  hasUnusedAlbums() {
    return this.albums.hasUnusedAlbums();
  }
  collectReferencedKeys() {
    const rows = this.db.prepare(
      `SELECT artwork_cache_key AS key
         FROM albums
         WHERE artwork_cache_key IS NOT NULL
         UNION
         SELECT embedded_artwork_cache_key AS key FROM tracks WHERE embedded_artwork_cache_key IS NOT NULL
         UNION
         SELECT directory_artwork_cache_key AS key FROM tracks WHERE directory_artwork_cache_key IS NOT NULL
         UNION
         SELECT artwork_cache_key AS key
         FROM track_metadata
         WHERE artwork_cache_key IS NOT NULL
         UNION
         SELECT artwork_cache_key AS key FROM removed_track_history
         WHERE artwork_cache_key IS NOT NULL`
    ).all();
    return new Set(rows.map((row) => row.key));
  }
  async collectGarbage(canCollect = () => true) {
    if (this.running) {
      return {
        orphanFileCount: 0,
        bytesBefore: 0,
        bytesAfter: 0,
        bytesReclaimed: 0,
        warnedUnknownFileCount: 0,
        durationMs: 0
      };
    }
    this.running = true;
    const startedAt = Date.now();
    try {
      const referenced = this.db.transaction(() => {
        if (canCollect()) this.albums.removeUnusedAlbums();
        return this.collectReferencedKeys();
      }).immediate();
      const hasReference = this.db.prepare(`
        SELECT 1 FROM albums WHERE artwork_cache_key = ?
        UNION ALL SELECT 1 FROM track_metadata WHERE artwork_cache_key = ?
        UNION ALL SELECT 1 FROM removed_track_history WHERE artwork_cache_key = ?
        UNION ALL SELECT 1 FROM tracks WHERE embedded_artwork_cache_key = ?
        UNION ALL SELECT 1 FROM tracks WHERE directory_artwork_cache_key = ? LIMIT 1
      `);
      const deleteIfUnreferenced = this.db.transaction((name, path) => {
        if (!canCollect() || hasReference.get(name, name, name, name, name)) return false;
        unlinkSync(path);
        return true;
      });
      let entries;
      try {
        entries = await readdir(this.cacheDir, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") {
          entries = [];
        } else {
          throw error;
        }
      }
      let bytesBefore = 0;
      let bytesReclaimed = 0;
      let orphanFileCount = 0;
      let warnedUnknownFileCount = 0;
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        const filePath = join(this.cacheDir, entry.name);
        if (!isCacheFileName(entry.name)) {
          logger.warn({ fileName: entry.name }, "Unknown file inside artwork cache ignored");
          warnedUnknownFileCount += 1;
          continue;
        }
        if (!isPathUnderCacheDir$1(filePath, this.cacheDir)) {
          logger.warn({ fileName: entry.name }, "Artwork cache file outside cache dir ignored");
          continue;
        }
        let size = 0;
        try {
          size = (await stat(filePath)).size;
        } catch {
          continue;
        }
        bytesBefore += size;
        if (referenced.has(entry.name)) {
          continue;
        }
        try {
          if (!canCollect()) continue;
          if (deleteIfUnreferenced.immediate(entry.name, filePath)) {
            bytesReclaimed += size;
            orphanFileCount += 1;
          }
        } catch (error) {
          logger.warn(
            {
              fileName: entry.name,
              errorType: error instanceof Error ? error.name : "UnknownError",
              errorMessage: error instanceof Error ? error.message : String(error)
            },
            "Failed to delete orphan artwork cache file"
          );
        }
      }
      const summary = {
        orphanFileCount,
        bytesBefore,
        bytesAfter: bytesBefore - bytesReclaimed,
        bytesReclaimed,
        warnedUnknownFileCount,
        durationMs: Date.now() - startedAt
      };
      logger.info(summary, "Artwork cache garbage collection complete");
      return summary;
    } finally {
      this.running = false;
    }
  }
}
class ArtworkCacheMaintenanceService {
  constructor(migration, garbageCollector, gate) {
    this.migration = migration;
    this.garbageCollector = garbageCollector;
    this.gate = gate;
  }
  state = "idle";
  activeRun = null;
  stopped = false;
  startupTimer = null;
  getState() {
    return this.state;
  }
  isActive() {
    return this.state !== "idle";
  }
  isWriterBusy() {
    return this.gate.isScanActive() || this.gate.isRefreshActive() || this.gate.isImportActive();
  }
  /** Deferred startup maintenance — never blocks window first display (§10.1). */
  scheduleStartupMaintenance(delayMs = 2e3) {
    if (this.stopped) return;
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.runStartupMaintenance().catch((error) => {
        logger.error({ error }, "Scheduled artwork cache maintenance failed");
      });
    }, delayMs);
  }
  async shutdown() {
    this.stopped = true;
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
    await this.activeRun;
  }
  /** Migrate legacy keys when present, then GC once the migration committed. */
  runStartupMaintenance() {
    return this.runGuarded(async () => {
      if (!this.migration.hasLegacyKeys()) {
        logger.info("Artwork cache already current — skipping migration");
        if (this.garbageCollector.hasUnusedAlbums()) await this.collectGarbageInternal();
        return;
      }
      this.state = "migrating-cache";
      await this.migration.runMigration();
      await this.collectGarbageInternal();
    });
  }
  /** GC after a full scan completed (§11.2) — no-op when any writer is active. */
  runAfterScanGarbageCollection() {
    return this.runGuarded(async () => {
      await this.collectGarbageInternal();
    });
  }
  async collectGarbageInternal() {
    if (this.stopped || this.isWriterBusy()) {
      logger.info("Skipping artwork cache garbage collection: a writer task is active");
      return;
    }
    this.state = "collecting-garbage";
    await this.garbageCollector.collectGarbage(() => !this.stopped && !this.isWriterBusy());
  }
  runGuarded(run2) {
    if (this.stopped) return Promise.resolve();
    if (this.activeRun) {
      return this.activeRun;
    }
    const task = (async () => {
      if (this.isWriterBusy()) {
        logger.info("Skipping artwork cache maintenance: a writer task is active");
        return;
      }
      try {
        await run2();
      } finally {
        this.state = "idle";
      }
    })();
    this.activeRun = task;
    void task.then(
      () => {
        if (this.activeRun === task) {
          this.activeRun = null;
        }
      },
      () => {
        if (this.activeRun === task) {
          this.activeRun = null;
        }
      }
    );
    return task;
  }
}
const LEGACY_EXT_TO_MIME = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
async function extractArtworkFromAudioFile(filePath) {
  try {
    const metadata = await parseFile(filePath, { duration: false, skipCovers: false });
    const picture = metadata.common.picture?.[0];
    if (picture) {
      return { data: Buffer.from(picture.data), mimeType: picture.format };
    }
    const coverPath = join(dirname(filePath), "cover.jpg");
    const data = await readFile(coverPath);
    return { data, mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}
class ArtworkCacheMigrationService {
  constructor(db, cacheDir, extractTrackArtwork = extractArtworkFromAudioFile) {
    this.db = db;
    this.cacheDir = cacheDir;
    this.extractTrackArtwork = extractTrackArtwork;
  }
  running = false;
  isRunning() {
    return this.running;
  }
  /** Cheap startup gate: are there any non-current (legacy) keys to migrate? */
  hasLegacyKeys() {
    const row = this.db.prepare(
      `SELECT 1 AS found
         FROM (
           SELECT artwork_cache_key FROM albums
           WHERE artwork_cache_key IS NOT NULL
             AND artwork_cache_key NOT LIKE 'v2-%.webp'
           UNION
           SELECT artwork_cache_key FROM track_metadata
           WHERE artwork_cache_key IS NOT NULL
             AND artwork_cache_key NOT LIKE 'v2-%.webp'
         )
         LIMIT 1`
    ).get();
    return row !== void 0;
  }
  async runMigration() {
    if (this.running) {
      return {
        legacyKeyCount: 0,
        migratedKeyCount: 0,
        failedKeyCount: 0,
        skippedCurrentKeyCount: 0,
        bytesBefore: 0,
        bytesAfter: 0,
        durationMs: 0
      };
    }
    this.running = true;
    const startedAt = Date.now();
    try {
      const legacyKeys = this.listLegacyKeys();
      const summary = {
        legacyKeyCount: legacyKeys.length,
        migratedKeyCount: 0,
        failedKeyCount: 0,
        skippedCurrentKeyCount: 0,
        bytesBefore: 0,
        bytesAfter: 0,
        durationMs: 0
      };
      for (const key of legacyKeys) {
        const result = await this.migrateLegacyKey(key);
        if (result.status === "migrated") {
          summary.migratedKeyCount += 1;
          summary.bytesBefore += result.bytesBefore;
          summary.bytesAfter += result.bytesAfter;
        } else if (result.status === "failed") {
          summary.failedKeyCount += 1;
        } else if (result.status === "skipped") {
          summary.skippedCurrentKeyCount += 1;
        }
      }
      summary.durationMs = Date.now() - startedAt;
      logger.info(
        {
          ...summary,
          cacheVersion: ARTWORK_CACHE_VERSION
        },
        "Artwork cache migration complete"
      );
      return summary;
    } finally {
      this.running = false;
    }
  }
  listLegacyKeys() {
    const rows = this.db.prepare(
      `SELECT artwork_cache_key AS key
         FROM (
           SELECT artwork_cache_key FROM albums
           WHERE artwork_cache_key IS NOT NULL
             AND artwork_cache_key NOT LIKE 'v2-%.webp'
           UNION
           SELECT artwork_cache_key FROM track_metadata
           WHERE artwork_cache_key IS NOT NULL
             AND artwork_cache_key NOT LIKE 'v2-%.webp'
         )`
    ).all();
    return rows.map((row) => row.key).filter((key) => isLegacyArtworkCacheKey(key));
  }
  queryRefs(key) {
    const albumRows = this.db.prepare(
      `SELECT title, artist
         FROM albums
         WHERE artwork_cache_key = ?`
    ).all(key);
    const trackMetadataIds = this.db.prepare(
      `SELECT track_id AS trackId
         FROM track_metadata
         WHERE artwork_cache_key = ?`
    ).all(key).map((row) => row.trackId);
    return { albumRows, trackMetadataIds };
  }
  findRepresentativeTrack(refs) {
    for (const trackId of refs.trackMetadataIds) {
      const row = this.db.prepare(
        `SELECT file_path AS filePath
           FROM tracks
           WHERE id = ? AND availability = 'available'
           LIMIT 1`
      ).get(trackId);
      if (row?.filePath) {
        return row.filePath;
      }
    }
    for (const album of refs.albumRows) {
      const row = album.artist !== null ? this.db.prepare(
        `SELECT file_path AS filePath
                 FROM tracks
                 WHERE album = ? AND album_artist = ? AND availability = 'available'
                 LIMIT 1`
      ).get(album.title, album.artist) : this.db.prepare(
        `SELECT file_path AS filePath
                 FROM tracks
                 WHERE album = ? AND availability = 'available'
                 LIMIT 1`
      ).get(album.title);
      if (row?.filePath) {
        return row.filePath;
      }
    }
    return null;
  }
  async readLegacyCacheSource(key) {
    const ext = key.split(".").pop() ?? "";
    const mimeType = LEGACY_EXT_TO_MIME[ext];
    if (!mimeType) {
      return null;
    }
    try {
      const data = await readFile(join(this.cacheDir, key));
      return { data, mimeType };
    } catch {
      return null;
    }
  }
  async migrateLegacyKey(key) {
    const refs = this.queryRefs(key);
    let source2 = await this.readLegacyCacheSource(key);
    let sourceHint = join(this.cacheDir, key);
    if (!source2) {
      const trackPath = this.findRepresentativeTrack(refs);
      if (trackPath) {
        source2 = await this.extractTrackArtwork(trackPath);
        sourceHint = trackPath;
      }
    }
    if (!source2) {
      logger.warn(
        { key, cacheVersion: ARTWORK_CACHE_VERSION },
        "Artwork migration failed: legacy cache missing and no recoverable track"
      );
      return { status: "failed", bytesBefore: 0, bytesAfter: 0 };
    }
    const v2Key = await writeArtworkToCache(this.cacheDir, source2, sourceHint);
    if (!v2Key) {
      logger.warn(
        { key, cacheVersion: ARTWORK_CACHE_VERSION },
        "Artwork migration failed: v2 conversion failed"
      );
      return { status: "failed", bytesBefore: source2.data.byteLength, bytesAfter: 0 };
    }
    const updated = this.db.transaction(() => {
      const albumChanges = this.db.prepare(
        `UPDATE albums
           SET artwork_cache_key = ?, updated_at = CURRENT_TIMESTAMP
           WHERE artwork_cache_key = ?`
      ).run(v2Key, key).changes;
      const metadataChanges = this.db.prepare(
        `UPDATE track_metadata
           SET artwork_cache_key = ?, refreshed_at = CURRENT_TIMESTAMP
           WHERE artwork_cache_key = ?`
      ).run(v2Key, key).changes;
      return albumChanges + metadataChanges;
    })();
    let v2Bytes = 0;
    try {
      v2Bytes = (await stat(join(this.cacheDir, v2Key))).size;
    } catch {
      v2Bytes = 0;
    }
    if (updated === 0) {
      return { status: "skipped", bytesBefore: source2.data.byteLength, bytesAfter: v2Bytes };
    }
    logger.debug({ key, v2Key }, "Artwork cache key migrated to v2");
    return {
      status: "migrated",
      bytesBefore: source2.data.byteLength,
      bytesAfter: v2Bytes
    };
  }
}
async function openMpvClient(executable, onEvent, onFailure, signal, extraArgs = []) {
  const pipe2 = `\\\\.\\pipe\\auralis-audio-${randomUUID()}`;
  const child = spawn(
    executable,
    [
      "--no-config",
      "--load-scripts=no",
      "--terminal=no",
      "--video=no",
      "--audio-display=no",
      "--idle=yes",
      "--keep-open=no",
      "--gapless-audio=yes",
      // Same-song float PCM bridges must use the same negotiated output format
      // as the original decoder, so WASAPI keeps its audio client open.
      "--audio-format=float",
      "--replaygain=no",
      "--volume=0",
      "--input-default-bindings=no",
      "--input-vo-keyboard=no",
      `--input-ipc-server=${pipe2}`,
      ...extraArgs
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] }
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-4096);
  });
  let spawnError;
  const exited = new Promise((resolve2) => {
    child.once("exit", () => resolve2());
    child.once("error", () => {
      if (!child.pid) resolve2();
    });
  });
  child.on("error", (error) => {
    spawnError = error;
  });
  let socket;
  let closed = false;
  let ready = false;
  const pending = /* @__PURE__ */ new Map();
  function close() {
    if (closed) return exited;
    closed = true;
    signal.removeEventListener("abort", close);
    socket?.destroy();
    child.kill();
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("mpv closed"));
    }
    pending.clear();
    return exited;
  }
  function fail2(error) {
    if (closed) return;
    close();
    if (ready) onFailure(error);
  }
  signal.addEventListener("abort", close, { once: true });
  child.on("exit", (code) => fail2(new Error(`mpv exited (${code}): ${stderr}`)));
  try {
    const deadline = Date.now() + 8e3;
    while (!socket) {
      if (signal.aborted || closed) throw new Error("mpv startup cancelled");
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`mpv failed to start: ${stderr}`);
      try {
        socket = await new Promise((resolve2, reject) => {
          const candidate = connect(pipe2);
          candidate.once("connect", () => {
            candidate.removeAllListeners("error");
            resolve2(candidate);
          });
          candidate.once("error", (error) => {
            candidate.destroy();
            reject(error);
          });
        });
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await setTimeout$1(40);
      }
    }
    if (closed || signal.aborted) {
      socket.destroy();
      throw new Error("mpv startup cancelled");
    }
  } catch (error) {
    await close();
    throw error;
  }
  ready = true;
  socket.setEncoding("utf8");
  socket.on("error", fail2);
  socket.on("close", () => fail2(new Error("mpv IPC disconnected")));
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > 1048576) {
      fail2(new Error("mpv IPC response too large"));
      return;
    }
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        fail2(new Error("Invalid mpv IPC response"));
        return;
      }
      const item = message.request_id === void 0 ? void 0 : pending.get(message.request_id);
      if (item) {
        pending.delete(message.request_id);
        clearTimeout(item.timer);
        if (message.error === "success") item.resolve(message.data);
        else item.reject(new Error(`mpv: ${message.error}`));
      }
      if (message.event) onEvent(message);
    }
  });
  let requestId = 0;
  function command(...command2) {
    if (closed) return Promise.reject(new Error("mpv closed"));
    return new Promise((resolve2, reject) => {
      const request_id = ++requestId;
      const timer = setTimeout(() => {
        pending.delete(request_id);
        reject(new Error(`mpv command timed out: ${command2[0]}`));
      }, 5e3);
      pending.set(request_id, { resolve: resolve2, reject, timer });
      socket.write(JSON.stringify({ command: command2, request_id }) + "\n");
    });
  }
  return { command, close };
}
function normalizeAudioFilePath(filePath) {
  let normalized = resolve(filePath);
  try {
    normalized = realpathSync.native(normalized);
  } catch {
  }
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
class PlaybackFileCoordinator {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  bufferedWriteCapability = null;
  fileReplacementCapability = null;
  metadataWriteActive = () => false;
  entries = /* @__PURE__ */ new Map();
  leases = /* @__PURE__ */ new Map();
  nextLeaseSequence = 0;
  stateVersion = 0;
  setBufferedWriteCapability(capability) {
    this.bufferedWriteCapability = capability;
  }
  setFileReplacementCapability(capability) {
    this.fileReplacementCapability = capability;
  }
  setMetadataWriteActivity(isActive) {
    this.metadataWriteActive = isActive;
  }
  isPlaybackSource(sourceId) {
    return sourceId === "mpv-current" || sourceId === "mpv-next";
  }
  canReplace(entry) {
    return !!this.fileReplacementCapability?.([...entry.filePaths][0]) && [...entry.readers].every(
      (id) => ["mpv-current", "mpv-next", "spectrum-analysis"].includes(
        this.leases.get(id)?.sourceId ?? ""
      )
    );
  }
  /** Existing mpv handles keep their file version; all new opens wait for publication. */
  reserveFileReplacement(filePath) {
    const entry = this.getOrCreateEntry(normalizeAudioFilePath(filePath), filePath);
    if (entry.writer !== null || !this.canReplace(entry)) return null;
    const leaseId = `lease_replacement_${++this.nextLeaseSequence}`;
    entry.writer = leaseId;
    this.leases.set(leaseId, {
      leaseId,
      normalizedPath: entry.normalizedPath,
      kind: "replacement-intent",
      sourceId: "metadata-writer"
    });
    entry.version = ++this.stateVersion;
    this.broadcastStatusIfChanged(entry);
    return leaseId;
  }
  promoteFileReplacement(leaseId) {
    const lease = this.leases.get(leaseId);
    const entry = lease && this.entries.get(lease.normalizedPath);
    if (!lease || lease.kind !== "replacement-intent" || !entry || entry.writer !== leaseId)
      throw new Error("File replacement intent expired");
    if ([...entry.readers].some(
      (id) => !["mpv-current", "mpv-next"].includes(this.leases.get(id)?.sourceId ?? "")
    ))
      throw new Error("Non-mpv audio readers have not released the file");
    lease.kind = "write";
  }
  refreshPlaybackCapability(filePath) {
    const entry = this.entries.get(normalizeAudioFilePath(filePath));
    if (!entry) return;
    entry.version = ++this.stateVersion;
    this.broadcastStatusIfChanged(entry);
  }
  canBuffer(entry) {
    return !!this.bufferedWriteCapability?.([...entry.filePaths][0]) && [...entry.readers].every(
      (id) => ["mpv-current", "mpv-next", "spectrum-analysis"].includes(
        this.leases.get(id)?.sourceId ?? ""
      )
    );
  }
  /** Reserve the path before preparation, while existing readers continue playing. */
  reserveWriteIntent(filePath) {
    const normalizedPath = normalizeAudioFilePath(filePath);
    const entry = this.getOrCreateEntry(normalizedPath, filePath);
    if (entry.writer !== null || !this.canBuffer(entry)) return null;
    const leaseId = `lease_intent_${++this.nextLeaseSequence}`;
    entry.writer = leaseId;
    this.leases.set(leaseId, {
      leaseId,
      normalizedPath,
      kind: "intent",
      sourceId: "metadata-writer"
    });
    entry.version = ++this.stateVersion;
    this.broadcastStatusIfChanged(entry);
    return leaseId;
  }
  promoteWriteIntent(leaseId) {
    const lease = this.leases.get(leaseId);
    const entry = lease && this.entries.get(lease.normalizedPath);
    if (!lease || lease.kind !== "intent" || !entry || entry.writer !== leaseId)
      throw new Error("Tag write intent expired");
    if (entry.readers.size > 0) throw new Error("Audio readers have not released the file");
    lease.kind = "write";
  }
  getOrCreateEntry(normalizedPath, filePath) {
    let entry = this.entries.get(normalizedPath);
    if (!entry) {
      entry = {
        normalizedPath,
        filePaths: /* @__PURE__ */ new Set(),
        readers: /* @__PURE__ */ new Set(),
        writer: null,
        lastBroadcastStatus: "editable",
        writeWaiters: [],
        version: this.stateVersion
      };
      this.entries.set(normalizedPath, entry);
    }
    entry.filePaths.add(filePath);
    return entry;
  }
  cleanEntryIfIdle(entry) {
    if (entry.readers.size === 0 && entry.writer === null && entry.writeWaiters.length === 0) {
      this.entries.delete(entry.normalizedPath);
    }
  }
  grantReadWaiters(entry) {
    const pendingWaiters = [...entry.writeWaiters];
    entry.writeWaiters = [];
    const blocked = [];
    for (const waiter of pendingWaiters) {
      if (waiter.signal?.aborted) continue;
      if (this.metadataWriteActive(entry.normalizedPath) && !this.isPlaybackSource(waiter.sourceId)) {
        blocked.push(waiter);
        continue;
      }
      const nextReadLeaseId = `lease_read_${++this.nextLeaseSequence}`;
      entry.readers.add(nextReadLeaseId);
      this.leases.set(nextReadLeaseId, {
        leaseId: nextReadLeaseId,
        normalizedPath: entry.normalizedPath,
        kind: "read",
        sourceId: waiter.sourceId
      });
      waiter.resolve({ leaseId: nextReadLeaseId, version: entry.version });
    }
    entry.writeWaiters = blocked;
  }
  computeStatus(entry) {
    if (entry.writer !== null || this.metadataWriteActive(entry.normalizedPath))
      return "write-in-progress";
    if (entry.readers.size > 0) {
      if (this.canBuffer(entry) || this.canReplace(entry)) return "playback-editable";
      const isPreload = [...entry.readers].every(
        (id) => this.leases.get(id)?.sourceId === "mpv-next"
      );
      return isPreload ? "preload-in-use" : "playback-in-use";
    }
    return "editable";
  }
  broadcastStatusIfChanged(entry) {
    const currentStatus = this.computeStatus(entry);
    if (currentStatus === entry.lastBroadcastStatus && entry.version > 0) {
      return;
    }
    entry.lastBroadcastStatus = currentStatus;
    const trackIds = new Set(
      [...entry.filePaths].flatMap((path) => this.dependencies.getTrackIdsByFilePath(path))
    );
    for (const trackId of trackIds) {
      this.dependencies.sendToRenderer(ipcChannels.metadata.trackEditStateChanged, {
        trackId,
        status: currentStatus,
        version: entry.version
      });
    }
  }
  async acquireReadLease(filePath, sourceId, signal) {
    if (signal?.aborted) {
      throw new Error("Read lease request aborted");
    }
    const normalizedPath = normalizeAudioFilePath(filePath);
    const entry = this.getOrCreateEntry(normalizedPath, filePath);
    const waitForWriter = entry.writer !== null;
    const waitForActivity = this.metadataWriteActive(normalizedPath) && !this.isPlaybackSource(sourceId);
    if (!waitForWriter && !waitForActivity) {
      const leaseId = `lease_read_${++this.nextLeaseSequence}`;
      entry.readers.add(leaseId);
      entry.version = ++this.stateVersion;
      this.leases.set(leaseId, { leaseId, normalizedPath, kind: "read", sourceId });
      this.broadcastStatusIfChanged(entry);
      return { leaseId, version: entry.version };
    }
    return new Promise((resolve2, reject) => {
      let onAbort = null;
      const waiter = {
        sourceId,
        signal,
        resolve: (result) => {
          if (onAbort && signal) signal.removeEventListener("abort", onAbort);
          resolve2(result);
        },
        reject: (error) => {
          if (onAbort && signal) signal.removeEventListener("abort", onAbort);
          reject(error);
        }
      };
      if (signal) {
        onAbort = () => {
          const index = entry.writeWaiters.indexOf(waiter);
          if (index !== -1) {
            entry.writeWaiters.splice(index, 1);
          }
          this.cleanEntryIfIdle(entry);
          waiter.reject(new Error("Read lease request aborted while waiting for writer"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }
      entry.writeWaiters.push(waiter);
    });
  }
  isReadLeaseForTrack(leaseId, trackId, filePath) {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.kind !== "read") return false;
    const path = this.dependencies.getTrackFilePath(trackId);
    return path !== null && normalizeAudioFilePath(path) === lease.normalizedPath && normalizeAudioFilePath(filePath) === lease.normalizedPath;
  }
  markReadLeaseCurrent(leaseId) {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.kind !== "read" || lease.sourceId !== "mpv-next") return;
    lease.sourceId = "mpv-current";
    const entry = this.entries.get(lease.normalizedPath);
    if (!entry) return;
    entry.version = ++this.stateVersion;
    this.broadcastStatusIfChanged(entry);
  }
  releaseReadLease(leaseId) {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.kind !== "read") return;
    this.leases.delete(leaseId);
    const entry = this.entries.get(lease.normalizedPath);
    if (!entry) return;
    entry.readers.delete(leaseId);
    entry.version = ++this.stateVersion;
    this.broadcastStatusIfChanged(entry);
    this.cleanEntryIfIdle(entry);
  }
  tryAcquireWriteLease(filePath, sourceId = "metadata-writer") {
    const normalizedPath = normalizeAudioFilePath(filePath);
    const entry = this.getOrCreateEntry(normalizedPath, filePath);
    if (entry.writer !== null || this.metadataWriteActive(normalizedPath)) {
      return { ok: false, reason: "write-in-progress" };
    }
    if (entry.readers.size > 0) {
      return { ok: false, reason: "playback-in-use" };
    }
    const leaseId = `lease_write_${++this.nextLeaseSequence}`;
    entry.writer = leaseId;
    entry.version = ++this.stateVersion;
    this.leases.set(leaseId, { leaseId, normalizedPath, kind: "write", sourceId });
    this.broadcastStatusIfChanged(entry);
    return { ok: true, leaseId };
  }
  releaseWriteLease(leaseId) {
    const lease = this.leases.get(leaseId);
    if (!lease || !["write", "intent", "replacement-intent"].includes(lease.kind)) return;
    this.leases.delete(leaseId);
    const entry = this.entries.get(lease.normalizedPath);
    if (!entry || entry.writer !== leaseId) return;
    entry.writer = null;
    entry.version = ++this.stateVersion;
    this.grantReadWaiters(entry);
    this.broadcastStatusIfChanged(entry);
    this.cleanEntryIfIdle(entry);
  }
  handoffWriteLeaseToRead(leaseId, sourceId) {
    const lease = this.leases.get(leaseId);
    const entry = lease && this.entries.get(lease.normalizedPath);
    if (!lease || !entry || entry.writer !== leaseId || !["write", "intent", "replacement-intent"].includes(lease.kind)) {
      throw new Error("File write handoff lease expired");
    }
    this.leases.delete(leaseId);
    entry.writer = null;
    const readLeaseId = `lease_read_${++this.nextLeaseSequence}`;
    entry.readers.add(readLeaseId);
    this.leases.set(readLeaseId, {
      leaseId: readLeaseId,
      normalizedPath: entry.normalizedPath,
      kind: "read",
      sourceId
    });
    entry.version = ++this.stateVersion;
    this.grantReadWaiters(entry);
    this.broadcastStatusIfChanged(entry);
    return { leaseId: readLeaseId, version: entry.version };
  }
  finishMetadataWrite(filePath) {
    const entry = this.entries.get(normalizeAudioFilePath(filePath));
    if (!entry) return;
    entry.version = ++this.stateVersion;
    if (entry.writer !== null) {
      this.broadcastStatusIfChanged(entry);
      return;
    }
    this.grantReadWaiters(entry);
    this.broadcastStatusIfChanged(entry);
    this.cleanEntryIfIdle(entry);
  }
  getTrackState(trackId) {
    const filePath = this.dependencies.getTrackFilePath(trackId);
    if (!filePath) {
      return { trackId, status: "editable", version: this.stateVersion };
    }
    const normalizedPath = normalizeAudioFilePath(filePath);
    const entry = this.entries.get(normalizedPath);
    if (!entry) {
      return { trackId, status: "editable", version: this.stateVersion };
    }
    entry.filePaths.add(filePath);
    return {
      trackId,
      status: this.computeStatus(entry),
      version: entry.version
    };
  }
  releaseAllBySourceId(sourceId) {
    const matchingLeases = [...this.leases.values()].filter((lease) => lease.sourceId === sourceId);
    for (const lease of matchingLeases) {
      if (lease.kind === "read") {
        this.releaseReadLease(lease.leaseId);
      } else {
        this.releaseWriteLease(lease.leaseId);
      }
    }
  }
}
const SOFT_TRANSITION_MIN_SECONDS = 1;
const SOFT_TRANSITION_MAX_SECONDS = 6;
const SOFT_TRANSITION_STEP_SECONDS = 0.5;
const SOFT_TRANSITION_DEFAULT_SECONDS = 2;
function isSoftTransitionDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= SOFT_TRANSITION_MIN_SECONDS && value <= SOFT_TRANSITION_MAX_SECONDS && Number.isInteger(value / SOFT_TRANSITION_STEP_SECONDS);
}
async function readMpvTimestampOrigin(executable, path, signal) {
  const lifetime = AbortSignal.any([signal, AbortSignal.timeout(1e4)]);
  let loaded;
  let failed;
  const ready = new Promise((resolve2, reject) => {
    loaded = resolve2;
    failed = reject;
  });
  void ready.catch(() => void 0);
  const abort = () => failed(new Error("Transition timestamp query cancelled or timed out"));
  lifetime.addEventListener("abort", abort, { once: true });
  let client;
  try {
    lifetime.throwIfAborted();
    client = await openMpvClient(
      executable,
      (event) => {
        if (event.event === "file-loaded") loaded();
        if (event.event === "end-file" && event.reason === "error")
          failed(new Error("Transition timestamp query failed"));
      },
      failed,
      lifetime,
      ["--ao=null", "--pause=yes"]
    );
    await client.command("loadfile", path, "replace");
    await ready;
    const origin = await client.command("get_property", "demuxer-start-time");
    if (typeof origin !== "number" || !Number.isFinite(origin))
      throw new Error("Invalid demuxer timestamp origin");
    return origin;
  } finally {
    lifetime.removeEventListener("abort", abort);
    await client?.close();
  }
}
function parseFirstPcmTimestamp(diagnostics, rate, channels) {
  const match = /\[Parsed_ashowinfo_\d+ @ [^\]]+\] n:0 pts:(-?\d+) pts_time:[^\s]+ .*?channels:(\d+).*?rate:(\d+)/.exec(
    diagnostics
  );
  if (!match) return void 0;
  if (Number(match[2]) !== channels || Number(match[3]) !== rate)
    throw new Error("Unexpected audio decode format");
  const origin = Number(match[1]) / rate;
  if (!Number.isFinite(origin) || origin < 0) throw new Error("Unsupported audio timestamp origin");
  return origin;
}
class DigitalZeroCounter {
  constructor(channels) {
    this.channels = channels;
    if (!Number.isInteger(channels) || channels < 1 || channels > 32)
      throw new Error("Invalid channel count");
  }
  frames = 0;
  leading = 0;
  trailing = 0;
  carry = Buffer.alloc(0);
  foundSignal = false;
  push(chunk) {
    const data = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk;
    const frameBytes = this.channels * 4;
    const limit = data.length - data.length % frameBytes;
    for (let offset = 0; offset < limit; offset += frameBytes) {
      let zero = true;
      for (let channel = 0; channel < this.channels; channel++) {
        if (data.readFloatLE(offset + channel * 4) !== 0) {
          zero = false;
          break;
        }
      }
      this.frames++;
      if (zero) {
        this.trailing++;
        if (!this.foundSignal) this.leading++;
      } else {
        this.foundSignal = true;
        this.trailing = 0;
      }
    }
    this.carry = Buffer.from(data.subarray(limit));
  }
  finish() {
    if (this.carry.length || !this.foundSignal)
      throw new Error("Incomplete or entirely silent audio");
  }
}
function isConsecutiveAlbumPair(left, right) {
  const normalize2 = (value) => value?.trim().toLocaleLowerCase() || "";
  return Boolean(
    normalize2(left.album) && normalize2(left.album) === normalize2(right.album) && normalize2(left.albumartist || left.artist) && normalize2(left.albumartist || left.artist) === normalize2(right.albumartist || right.artist) && left.disk.no !== null && left.disk.no > 0 && left.disk.no === right.disk.no && left.track.no !== null && left.track.no > 0 && right.track.no === left.track.no + 1
  );
}
function chooseDigitalBoundary(left, right, sampleRate) {
  const total = left.trailing + right.leading;
  if (total <= 0 || total > sampleRate * 0.1) return null;
  return {
    // Without verified leading zeros, retain ordinary playback from the beginning.
    start: right.leading ? right.origin + (right.leading + 0.25) / sampleRate : 0,
    // Bias into verified silence: time-to-sample rounding in mpv must not eat
    // the final nonzero frame. The small bias remains inside one silent frame.
    end: left.trailing ? left.origin + (left.frames - left.trailing + 0.25) / sampleRate : null
  };
}
class DigitalSilenceAnalyzer {
  constructor(executable, mpvExecutable) {
    this.executable = executable;
    this.mpvExecutable = mpvExecutable;
  }
  cache = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  serial = Promise.resolve();
  async boundary(left, right, signal) {
    const [a, b] = await Promise.all([
      parseFile(left, { skipCovers: true, duration: false }),
      parseFile(right, { skipCovers: true, duration: false })
    ]);
    if (!isConsecutiveAlbumPair(a.common, b.common)) return null;
    const rate = a.format.sampleRate;
    const channels = a.format.numberOfChannels;
    if (!rate || !channels || rate !== b.format.sampleRate || channels !== b.format.numberOfChannels)
      return null;
    if (!a.format.duration || !b.format.duration || Math.max(a.format.duration, b.format.duration) > 7200)
      return null;
    const current = await this.scan(left, rate, channels, signal);
    const next = await this.scan(right, rate, channels, signal);
    signal.throwIfAborted();
    return chooseDigitalBoundary(current, next, rate);
  }
  async scan(path, rate, channels, signal) {
    signal.throwIfAborted();
    const before = await stat(path);
    const key = `${path}\0${before.size}\0${before.mtimeMs}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const pending = this.pending.get(key);
    if (pending && !pending.signal.aborted) return pending.promise;
    const work = this.serial.then(() => this.decode(path, rate, channels, signal, before, key));
    this.pending.set(key, { signal, promise: work });
    this.serial = work.catch(() => void 0);
    try {
      return await work;
    } finally {
      if (this.pending.get(key)?.promise === work) this.pending.delete(key);
    }
  }
  async decode(path, rate, channels, signal, before, key) {
    signal.throwIfAborted();
    const counter = new DigitalZeroCounter(channels);
    let origin;
    await new Promise((resolve2, reject) => {
      const child = spawn(
        this.executable,
        [
          "-nostdin",
          "-v",
          "info",
          "-threads",
          "1",
          "-copyts",
          "-i",
          path,
          "-map",
          "0:a:0",
          "-vn",
          "-sn",
          "-dn",
          "-af",
          "ashowinfo",
          "-c:a",
          "pcm_f32le",
          "-f",
          "f32le",
          "pipe:1"
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
      );
      let diagnostics = "";
      let failure;
      const abort = () => {
        failure = new Error("Digital silence scan cancelled");
        child.kill();
      };
      const timeout = setTimeout(() => {
        failure = new Error("Digital silence scan timed out");
        child.kill();
      }, 6e4);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      child.stdout.on("data", (chunk) => counter.push(chunk));
      child.stderr.on("data", (chunk) => {
        const text = diagnostics + chunk.toString("utf8");
        if (origin === void 0) {
          try {
            origin = parseFirstPcmTimestamp(text, rate, channels);
          } catch (error) {
            failure = error;
            child.kill();
          }
        }
        diagnostics = text.slice(-8192);
      });
      child.on("error", (error) => {
        failure = error;
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        if (failure || code !== 0) reject(failure ?? new Error(`Audio scan failed: ${diagnostics}`));
        else resolve2();
      });
    });
    counter.finish();
    signal.throwIfAborted();
    if (origin === void 0) throw new Error("Missing audio timestamp origin");
    origin -= await readMpvTimestampOrigin(this.mpvExecutable, path, signal);
    if (origin < -1 / rate) throw new Error("Unsupported rebased audio timestamp");
    signal.throwIfAborted();
    const after = await stat(path);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      throw new Error("Audio changed during boundary scan");
    signal.throwIfAborted();
    const result = {
      frames: counter.frames,
      leading: counter.leading,
      trailing: counter.trailing,
      origin
    };
    this.cache.set(key, result);
    while (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value);
    return result;
  }
}
async function scanTransitionAudio(executable, path, rate, channels, signal, windowSeconds = SOFT_TRANSITION_DEFAULT_SECONDS + 0.1) {
  signal.throwIfAborted();
  const counter = new DigitalZeroCounter(channels);
  const limit = Math.ceil(rate * windowSeconds) * channels * 4;
  const head = Buffer.allocUnsafe(limit);
  const tail = Buffer.allocUnsafe(limit);
  let headLength = 0;
  let tailLength = 0;
  let tailOffset = 0;
  let origin;
  await new Promise((resolve2, reject) => {
    const child = spawn(
      executable,
      [
        "-nostdin",
        "-v",
        "info",
        "-threads",
        "1",
        "-copyts",
        "-i",
        path,
        "-map",
        "0:a:0",
        "-vn",
        "-sn",
        "-dn",
        "-af",
        "ashowinfo",
        "-c:a",
        "pcm_f32le",
        "-f",
        "f32le",
        "pipe:1"
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let diagnostics = "";
    let failure;
    const stop = (error) => {
      failure = error;
      child.kill();
    };
    const abort = () => stop(new Error("Soft transition cancelled"));
    const timeout = setTimeout(() => stop(new Error("Soft transition decode timed out")), 45e3);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.on("error", (error) => {
      failure = error;
    });
    child.stderr.on("data", (chunk) => {
      const text = diagnostics + chunk.toString("utf8");
      if (origin === void 0) {
        try {
          origin = parseFirstPcmTimestamp(text, rate, channels);
        } catch (error) {
          stop(error);
        }
      }
      diagnostics = text.slice(-8192);
    });
    child.stdout.on("data", (chunk) => {
      counter.push(chunk);
      const headBytes = Math.min(chunk.length, limit - headLength);
      chunk.copy(head, headLength, 0, headBytes);
      headLength += headBytes;
      if (chunk.length >= limit) {
        chunk.copy(tail, 0, chunk.length - limit);
        tailLength = limit;
        tailOffset = 0;
      } else {
        const firstBytes2 = Math.min(chunk.length, limit - tailOffset);
        chunk.copy(tail, tailOffset, 0, firstBytes2);
        chunk.copy(tail, 0, firstBytes2);
        tailOffset = (tailOffset + chunk.length) % limit;
        tailLength = Math.min(limit, tailLength + chunk.length);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      if (failure || code !== 0)
        reject(failure ?? new Error(`Transition decode failed: ${diagnostics}`));
      else resolve2();
    });
  });
  signal.throwIfAborted();
  counter.finish();
  if (origin === void 0 || !Number.isFinite(origin) || origin < 0)
    throw new Error("Unsupported audio timestamp origin");
  const orderedTail = Buffer.allocUnsafe(tailLength);
  const tailStart = tailLength === limit ? tailOffset : 0;
  const firstBytes = Math.min(tailLength, limit - tailStart);
  tail.copy(orderedTail, 0, tailStart, tailStart + firstBytes);
  tail.copy(orderedTail, firstBytes, 0, tailLength - firstBytes);
  return {
    frames: counter.frames,
    leading: counter.leading,
    trailing: counter.trailing,
    origin,
    rate,
    channels,
    head: headLength === limit ? head : Buffer.from(head.subarray(0, headLength)),
    tail: orderedTail
  };
}
function renderSoftTransition(a, b, trim, durationSeconds = SOFT_TRANSITION_DEFAULT_SECONDS) {
  if (!isSoftTransitionDuration(durationSeconds))
    throw new Error("Invalid soft transition duration");
  if (a.rate !== b.rate || a.channels !== b.channels) throw new Error("Transition format mismatch");
  const zeroFrames = a.trailing + b.leading;
  const trimZeros = trim && zeroFrames <= a.rate / 10;
  const end = a.frames - (trimZeros ? a.trailing : 0);
  const start = trimZeros ? b.leading : 0;
  const frames = Math.min(
    Math.floor(durationSeconds * a.rate),
    Math.floor(end / 2),
    Math.floor((b.frames - start) / 2)
  );
  if (frames < 2) throw new Error("Audio too short for a transition");
  const stride = a.channels * 4;
  const aOffset = end - frames - (a.frames - a.tail.length / stride);
  if (aOffset < 0 || (start + frames) * stride > b.head.length)
    throw new Error("Transition window unavailable");
  const pcm = Buffer.alloc(frames * stride);
  for (let frame = 0; frame < frames; frame++) {
    const gain = (1 - Math.cos(Math.PI * frame / (frames - 1))) / 2;
    for (let channel = 0; channel < a.channels; channel++) {
      const left = a.tail.readFloatLE((aOffset + frame) * stride + channel * 4);
      const right = b.head.readFloatLE((start + frame) * stride + channel * 4);
      const sample = left * (1 - gain) + right * gain;
      if (!Number.isFinite(sample)) throw new Error("Non-finite transition sample");
      pcm.writeFloatLE(sample, frame * stride + channel * 4);
    }
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(a.channels, 22);
  header.writeUInt32LE(a.rate, 24);
  header.writeUInt32LE(a.rate * stride, 28);
  header.writeUInt16LE(stride, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return {
    wave: Buffer.concat([header, pcm]),
    outgoingEnd: a.origin + (end - frames + 0.25) / a.rate,
    incomingStart: b.origin + start / b.rate,
    incomingResume: b.origin + (start + frames + 0.25) / b.rate,
    incomingDuration: b.origin + b.frames / b.rate,
    duration: frames / a.rate
  };
}
class SoftTransitionPreparer {
  constructor(executable, mpvExecutable) {
    this.executable = executable;
    this.mpvExecutable = mpvExecutable;
  }
  serial = Promise.resolve();
  cache = /* @__PURE__ */ new Map();
  async prepare(left, right, trim, signal, durationSeconds = SOFT_TRANSITION_DEFAULT_SECONDS) {
    const work = this.serial.then(() => this.create(left, right, trim, signal, durationSeconds));
    this.serial = work.catch(() => void 0);
    return work;
  }
  async create(left, right, trim, signal, durationSeconds) {
    signal.throwIfAborted();
    if (!isSoftTransitionDuration(durationSeconds))
      throw new Error("Invalid soft transition duration");
    const [a, b] = await Promise.all([
      parseFile(left, { skipCovers: true }),
      parseFile(right, { skipCovers: true })
    ]);
    if (left === right) return null;
    const rate = a.format.sampleRate;
    const channels = a.format.numberOfChannels;
    if (!rate || !channels || ![1, 2].includes(channels) || rate > 192e3 || rate !== b.format.sampleRate || channels !== b.format.numberOfChannels || !a.format.duration || !b.format.duration || Math.max(a.format.duration, b.format.duration) > 7200)
      return null;
    const windowSeconds = durationSeconds + 0.1;
    const scan = async (path2) => {
      signal.throwIfAborted();
      const before = await stat(path2);
      const key = `${path2}\0${before.size}\0${before.mtimeMs}`;
      const cached = this.cache.get(key);
      if (cached && cached.windowSeconds >= windowSeconds) return cached.audio;
      const audio = await scanTransitionAudio(
        this.executable,
        path2,
        rate,
        channels,
        signal,
        windowSeconds
      );
      audio.origin -= await readMpvTimestampOrigin(this.mpvExecutable, path2, signal);
      if (audio.origin < -1 / rate) throw new Error("Unsupported rebased audio timestamp");
      const after = await stat(path2);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
        throw new Error("Audio changed during transition preparation");
      this.cache.set(key, { audio, windowSeconds });
      while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
      return audio;
    };
    const current = await scan(left), next = await scan(right);
    signal.throwIfAborted();
    const { wave, ...timing } = renderSoftTransition(current, next, trim, durationSeconds);
    const directory = await mkdtemp(join(tmpdir(), "auralis-transition-"));
    const path = join(directory, "bridge.wav");
    let disposal;
    const dispose = () => disposal ??= (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          await unlink(path);
          break;
        } catch (error) {
          const code = error.code;
          if (code === "ENOENT") break;
          if (attempt >= 9 || code !== "EPERM" && code !== "EBUSY") throw error;
          await setTimeout$1(100);
        }
      }
      await rmdir(directory);
    })();
    try {
      await writeFile(path, wave);
      signal.throwIfAborted();
      return { ...timing, path, dispose };
    } catch (error) {
      await unlink(path).catch(() => void 0);
      await rmdir(directory).catch(() => void 0);
      throw error;
    }
  }
}
const TAG_BUFFER_SECONDS = 8;
const TAG_BUFFER_MAX_BYTES = 64 * 1024 * 1024;
const TAG_BUFFER_LEAD_SECONDS = 2;
const TAG_PLAYBACK_EXTENSIONS = [".wav", ".flac", ".ogg"];
function tagAudioContinuation(source2, start, duration, rate, origin = 0) {
  return `edl://%${Buffer.byteLength(source2, "utf8")}%${source2},${start + origin + 0.25 / rate},${duration - start}`;
}
async function removeTemporaryFiles(directory, paths) {
  for (const path of paths) {
    for (let attempt = 0; ; attempt++) {
      try {
        await unlink(path);
        break;
      } catch (error) {
        const code = error.code;
        if (code === "ENOENT") break;
        if (attempt >= 49 || code !== "EBUSY" && code !== "EPERM") throw error;
        await setTimeout$1(100);
      }
    }
  }
  await rmdir(directory).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}
async function createTagAudioSnapshot(source2) {
  const directory = await mkdtemp(join(tmpdir(), "auralis-tag-source-"));
  const path = join(directory, `source${extname(source2)}`);
  try {
    const before = await stat(source2);
    await copyFile(source2, path);
    const after = await stat(source2);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs)
      throw new Error("Audio changed while preparing playback recovery");
    return { path, dispose: () => removeTemporaryFiles(directory, [path]) };
  } catch (error) {
    await removeTemporaryFiles(directory, [path]);
    throw error;
  }
}
async function run(executable, args, signal) {
  signal.throwIfAborted();
  await new Promise((resolve2, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let failure;
    let stderr = "";
    const abort = () => {
      failure = new Error("Tag playback preparation cancelled");
      child.kill();
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    child.on("error", (error) => {
      failure = error;
    });
    child.stderr.on("data", (data) => {
      stderr = (stderr + data.toString("utf8")).slice(-4096);
    });
    child.once("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (failure || code !== 0) reject(failure ?? new Error(`Tag buffer decode failed: ${stderr}`));
      else resolve2();
    });
  });
}
async function prepareTagAudioBuffer(mpvPath, ffmpegPath, source2, position, duration, paused, signal) {
  const metadata = await parseFile(source2, { skipCovers: true });
  const rate = metadata.format.sampleRate;
  const channels = metadata.format.numberOfChannels;
  if (!rate || !channels || ![1, 2].includes(channels) || rate > 192e3)
    throw new Error("Unsupported tag buffer audio format");
  const origin = await readMpvTimestampOrigin(mpvPath, source2, signal);
  const lead = paused ? 0 : Math.min(6, (duration - position) / 2);
  const startFrame = Math.ceil((position + lead) * rate);
  const endFrame = Math.min(Math.round(duration * rate), startFrame + TAG_BUFFER_SECONDS * rate);
  if (endFrame <= startFrame || (endFrame - startFrame) * channels * 4 > TAG_BUFFER_MAX_BYTES)
    throw new Error("Insufficient audio remaining for tag playback buffer");
  const start = startFrame / rate;
  const seekStart = start + 0.25 / rate;
  const end = endFrame / rate;
  const directory = await mkdtemp(join(tmpdir(), "auralis-tag-buffer-"));
  const raw = join(directory, "buffer.pcm");
  const path = join(directory, "buffer.wav");
  const dispose = () => removeTemporaryFiles(directory, [raw, path]);
  try {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(15e3)]);
    await run(
      mpvPath,
      [
        "--no-config",
        "--load-scripts=no",
        "--terminal=no",
        "--video=no",
        "--audio-display=no",
        "--idle=no",
        "--keep-open=no",
        "--gapless-audio=yes",
        "--replaygain=no",
        "--volume=100",
        "--ao=pcm",
        `--ao-pcm-file=${raw}`,
        "--ao-pcm-waveheader=no",
        "--audio-format=float",
        `--audio-samplerate=${rate}`,
        `--audio-channels=${channels === 1 ? "mono" : "stereo"}`,
        "--hr-seek=yes",
        "--hr-seek-demuxer-offset=1",
        `--start=${seekStart}`,
        `--end=${end + 0.25 / rate}`,
        source2
      ],
      deadline
    );
    const bytes = (await stat(raw)).size;
    if (bytes !== (endFrame - startFrame) * channels * 4 || bytes > TAG_BUFFER_MAX_BYTES)
      throw new Error("Tag buffer sample count does not match the playback interval");
    const pcm = await readFile(raw);
    for (let index = 0; index < pcm.length; index += 4)
      if (!Number.isFinite(pcm.readFloatLE(index))) throw new Error("Non-finite tag buffer sample");
    await run(
      ffmpegPath,
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "f32le",
        "-ar",
        String(rate),
        "-ac",
        String(channels),
        "-i",
        raw,
        "-c:a",
        "pcm_f32le",
        path
      ],
      deadline
    );
    await unlink(raw);
    return { path, start, end, rate, origin, frames: endFrame - startFrame, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
function createBufferedTagPlaybackState() {
  return {
    tagAudioEligible: false,
    tagEligibilityGeneration: 0,
    tagWindow: null,
    tagFallback: null,
    frozenTagTime: null,
    tagDecodeOffset: 0,
    tagSeekLoading: false,
    writesInFlight: 0,
    tagFiles: /* @__PURE__ */ new Set()
  };
}
function createTagPlaybackWindow() {
  let enter, reject;
  const entered2 = new Promise((yes, no) => {
    enter = yes;
    reject = no;
  });
  void entered2.catch(() => void 0);
  let resume;
  const resumed = new Promise((yes) => {
    resume = yes;
  });
  return {
    done: false,
    loading: false,
    abort: new AbortController(),
    phase: "preparing",
    buffer: null,
    source: null,
    resumePath: "",
    resumeEntry: "",
    resumeOffset: 0,
    entered: entered2,
    enter,
    reject,
    resumed,
    resume,
    resumeFailed: false
  };
}
function isCurrentTagWrite({ state, runtime: runtime2 }, { window, client, session, signal }) {
  return !signal.aborted && runtime2.isCurrent(session, client) && state.tagWindow === window;
}
function assertCurrentTagWrite(context, attempt) {
  if (!isCurrentTagWrite(context, attempt)) throw new Error("Tag playback changed");
}
class MetadataSaveError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
    this.name = "MetadataSaveError";
  }
}
function metadataSaveFailureReason(error) {
  if (error && typeof error === "object" && "code" in error) {
    switch (error.code) {
      case "ENOSPC":
      case "EDQUOT":
        return "disk-full";
      case "EACCES":
      case "EPERM":
        return "permission-denied";
      case "EBUSY":
      case "ETXTBSY":
        return "file-in-use";
      case "ENOENT":
        return "file-not-found";
    }
  }
  if (error instanceof MetadataSaveError) return error.reason;
  return null;
}
function verifyWrittenMetadata(expected, actual) {
  if (expected.lyricsText !== void 0) {
    const actualLyrics = resolveLyrics(actual, true);
    if ((actualLyrics?.text ?? "") !== expected.lyricsText)
      throw new MetadataSaveError("tag-verification-failed", "Written lyrics do not match the edit");
    return;
  }
  const { common } = actual;
  const text = (value) => value?.trim() || "";
  const list = (value) => canonicalizeDelimitedValues(value) ?? "";
  const expectedDate = text(expected.releaseDate) || String(expected.year ?? "");
  const actualDate = resolveFileDate(actual) ?? "";
  const actualGenres = joinDelimitedValues(resolveGenres(actual)) ?? "";
  if (text(common.title) !== text(expected.title) || (joinDelimitedValues(resolveArtists(actual)) ?? "") !== list(expected.artistDisplay) || text(common.album) !== text(expected.albumTitle) || (joinDelimitedValues(resolveAlbumArtists(actual)) ?? "") !== list(expected.albumArtistDisplay) || actualGenres !== list(expected.genreDisplay) || actualDate !== expectedDate) {
    throw new MetadataSaveError(
      "tag-verification-failed",
      "Written audio tags do not match the requested edit; refresh required"
    );
  }
}
async function verifyPreservedAudioTags(source2, staging, lyricsOnly = false, editedFields) {
  const [before, after] = await Promise.all([
    parseAudioMetadata(source2),
    parseAudioMetadata(staging)
  ]);
  const edited = /* @__PURE__ */ new Set([
    "title",
    "artist",
    "artists",
    "album",
    "albumartist",
    "albumartists",
    "genre",
    "date",
    "year"
  ]);
  if (lyricsOnly) {
    edited.clear();
    edited.add("lyrics");
  }
  const commonGroups = {
    title: ["title"],
    artistDisplay: ["artist", "artists"],
    albumTitle: ["album"],
    albumArtistDisplay: ["albumartist", "albumartists"],
    genreDisplay: ["genre"],
    releaseDate: ["date", "year"]
  };
  if (editedFields && !lyricsOnly) {
    edited.clear();
    for (const field2 of editedFields) for (const key of commonGroups[field2]) edited.add(key);
  }
  const artistsChanged = !isDeepStrictEqual(resolveArtists(before), resolveArtists(after));
  const albumArtistsChanged = !isDeepStrictEqual(
    resolveAlbumArtists(before),
    resolveAlbumArtists(after)
  );
  for (const key of Object.keys(before.common)) {
    if (edited.has(key)) continue;
    const name = key;
    if (!isDeepStrictEqual(before.common[name], after.common[name]))
      throw new MetadataSaveError(
        "tag-preservation-failed",
        `Tag preparation did not preserve ${key}`
      );
  }
  const editedNative = /* @__PURE__ */ new Set([
    "title",
    "artist",
    "artists",
    "album",
    "album_artist",
    "albumartist",
    "genre",
    "date",
    "year",
    "tit2",
    "tt2",
    "tpe1",
    "tp1",
    "tpe2",
    "tp2",
    "talb",
    "tal",
    "tcon",
    "tco",
    "tdrc",
    "tyer",
    "tye",
    "tdat",
    "tda",
    "txxx:date",
    "txxx:year",
    "txxx:album_artist",
    "©nam",
    "©art",
    "aart",
    "©alb",
    "©gen",
    "gnre",
    // This freeform MP4 field is part of the editable genre list, whose final
    // value is checked by verifyWrittenMetadata rather than preserved verbatim.
    "----:com.apple.itunes:genre",
    "©day",
    "inam",
    "iart",
    "iprd",
    "icrd",
    "ignr",
    // Artwork is verified byte-for-byte above; muxer signatures are generated.
    "apic",
    "pic",
    "metadata_block_picture",
    "encoder",
    "tsse",
    "tss",
    "isft",
    "©too"
  ]);
  if (lyricsOnly) {
    editedNative.clear();
    for (const id of ["uslt", "ult", "lyrics", "unsyncedlyrics", "©lyr"]) editedNative.add(id);
  }
  if (editedFields && !lyricsOnly) {
    const nativeGroups = {
      title: ["title", "tit2", "tt2", "©nam", "inam"],
      artistDisplay: ["artist", "artists", "tpe1", "tp1", "©art", "iart"],
      albumTitle: ["album", "talb", "tal", "©alb", "iprd"],
      albumArtistDisplay: [
        "album_artist",
        "albumartist",
        "tpe2",
        "tp2",
        "aart",
        "txxx:album_artist"
      ],
      genreDisplay: ["genre", "tcon", "tco", "©gen", "gnre", "ignr", "----:com.apple.itunes:genre"],
      releaseDate: [
        "date",
        "year",
        "tdrc",
        "tyer",
        "tye",
        "tdat",
        "tda",
        "txxx:date",
        "txxx:year",
        "©day",
        "icrd"
      ]
    };
    for (const field2 of Object.keys(nativeGroups))
      if (!editedFields.includes(field2))
        for (const id of nativeGroups[field2]) editedNative.delete(id);
  }
  const nativeTags = (tags) => {
    const values = /* @__PURE__ */ new Map();
    for (const [type, entries] of Object.entries(tags)) {
      for (const tag of entries) {
        if (editedNative.has(tag.id.toLowerCase())) continue;
        const freeform = /^----:([^:]+):(.+)$/.exec(tag.id);
        if (!lyricsOnly && type === "iTunes" && freeform?.[1]?.toLowerCase() === "com.apple.itunes" && (freeform[2]?.toLowerCase() === "artists" && artistsChanged && (!editedFields || editedFields.includes("artistDisplay")) || freeform[2]?.toLowerCase() === "albumartists" && albumArtistsChanged && (!editedFields || editedFields.includes("albumArtistDisplay"))))
          continue;
        const key = JSON.stringify([type.startsWith("ID3v2.") ? "ID3v2" : type, tag.id]);
        const occurrences = values.get(key) ?? [];
        occurrences.push(tag.value);
        values.set(key, occurrences);
      }
    }
    return values;
  };
  const afterTags = nativeTags(after.native);
  for (const [tag, values] of nativeTags(before.native)) {
    const remaining = afterTags.get(tag) ?? [];
    for (const value of values) {
      const index = remaining.findIndex((candidate) => isDeepStrictEqual(value, candidate));
      if (index < 0)
        throw new MetadataSaveError(
          "tag-preservation-failed",
          "Tag preparation did not preserve a native tag"
        );
      remaining.splice(index, 1);
    }
  }
}
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
const { Mpeg4File, ReadStyle, ByteVector, StringType, Mpeg4AppleDataBoxFlagType } = require(workerData.modulePath);
let file;
try {
  file = new Mpeg4File(workerData.path, ReadStyle.None);
  if (!file.isWritable) throw new Error('MP4 file is not safely writable');
  for (const [id, values] of workerData.fields) {
    // One data box per list item avoids the library's string helper joining
    // values or interpreting literal semicolons as separators.
    file.tag.setQuickTimeData(ByteVector.fromString(id, StringType.Latin1),
      values.map(value => ByteVector.fromString(value, StringType.UTF8)),
      Mpeg4AppleDataBoxFlagType.ContainsText);
  }
  for (const [mean, name] of workerData.removeFreeform) file.tag.setItunesStrings(mean, name);
  for (const [mean, name, values] of workerData.updateFreeform) file.tag.setItunesStrings(mean, name, ...values);
  file.save();
} catch (error) {
  parentPort.postMessage({ message: error.message, code: error.code });
} finally {
  file?.dispose();
  parentPort.close();
}
`;
async function writeM4aStagingTags(path, metadata) {
  const before = await parseAudioMetadata(path);
  const fields = [];
  const textValues = (value) => value?.trim() ? [value.trim()] : [];
  const changed = (field2) => !metadata.editedFields || metadata.editedFields.includes(field2);
  const patch = (id, actual, requested) => {
    const field2 = {
      "©nam": "title",
      "©ART": "artistDisplay",
      "©alb": "albumTitle",
      aART: "albumArtistDisplay",
      "©day": "releaseDate"
    }[id];
    if (field2 && !changed(field2)) return;
    if (JSON.stringify(actual) !== JSON.stringify(requested)) fields.push([id, requested]);
  };
  patch("©nam", textValues(before.common.title), textValues(metadata.title));
  const artists = splitDelimitedValues(metadata.artistDisplay);
  const albumArtists = splitDelimitedValues(metadata.albumArtistDisplay);
  const artistsChanged = changed("artistDisplay") && JSON.stringify(resolveArtists(before)) !== JSON.stringify(artists);
  const albumArtistsChanged = changed("albumArtistDisplay") && JSON.stringify(resolveAlbumArtists(before)) !== JSON.stringify(albumArtists);
  patch("©ART", resolveArtists(before), artists);
  patch("©alb", textValues(before.common.album), textValues(metadata.albumTitle));
  patch("aART", resolveAlbumArtists(before), albumArtists);
  patch(
    "©day",
    textValues(before.common.date || String(before.common.year ?? "")),
    textValues(metadata.releaseDate || String(metadata.year ?? ""))
  );
  const genres = splitDelimitedValues(metadata.genreDisplay);
  const removeFreeform = [];
  const updateFreeform = [];
  for (const tag of before.native.iTunes ?? []) {
    const match = /^----:([^:]+):(.+)$/.exec(tag.id);
    if (!match || match[1].toLowerCase() !== "com.apple.itunes") continue;
    const name = match[2].toLowerCase();
    if (name === "artists" && artistsChanged) updateFreeform.push([match[1], match[2], artists]);
    if (name === "albumartists" && albumArtistsChanged)
      updateFreeform.push([match[1], match[2], albumArtists]);
  }
  if (changed("genreDisplay") && JSON.stringify(resolveGenres(before)) !== JSON.stringify(genres)) {
    fields.push(["©gen", genres], ["gnre", []]);
    for (const tag of before.native.iTunes ?? []) {
      const match = /^----:([^:]+):(.+)$/.exec(tag.id);
      if (match && match[1].toLowerCase() === "com.apple.itunes" && match[2].toLowerCase() === "genre")
        removeFreeform.push([match[1], match[2]]);
    }
  }
  if (!fields.length && !updateFreeform.length) return;
  await new Promise((resolve2, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        modulePath: createRequire(import.meta.url).resolve("node-taglib-sharp"),
        path,
        fields,
        removeFreeform,
        updateFreeform
      }
    });
    let failure;
    worker.on("message", (result) => {
      failure = Object.assign(new MetadataSaveError("tag-write-failed", result.message), {
        code: result.code
      });
    });
    worker.once("error", (error) => {
      failure = error;
    });
    worker.once("exit", (code) => {
      if (failure) reject(failure);
      else if (code !== 0)
        reject(new MetadataSaveError("tag-write-failed", `MP4 tag worker exited with code ${code}`));
      else resolve2();
    });
  });
}
function m4aPublicationHelper(ffmpegPath) {
  return join(dirname(ffmpegPath), "auralis-file-replace.exe");
}
function hasM4aPublicationHelper(ffmpegPath) {
  return process.platform === "win32" && existsSync(m4aPublicationHelper(ffmpegPath));
}
function windowsPublicationFailure(error, stdout) {
  let winError;
  try {
    winError = JSON.parse(stdout).winError;
  } catch {
  }
  const reason = winError === 1006 ? "file-changed" : winError === 32 || winError === 33 ? "file-in-use" : winError === 5 ? "permission-denied" : winError === 112 ? "disk-full" : "save-failed";
  return new MetadataSaveError(
    reason,
    `Audio publication failed (Windows ${winError ?? error.code})`
  );
}
async function publishWindowsM4a(original, staging, expected, ffmpegPath) {
  await new Promise((resolve2, reject) => {
    execFile(
      m4aPublicationHelper(ffmpegPath),
      [
        original,
        staging,
        String(expected.size),
        String(expected.ino),
        String(expected.mtimeNs),
        String(expected.ctimeNs)
      ],
      { windowsHide: true, maxBuffer: 4096 },
      (error, stdout) => {
        if (!error) return resolve2();
        reject(windowsPublicationFailure(error, stdout));
      }
    );
  });
}
function lockWindowsAudioSource(original, staging, expected, ffmpegPath) {
  if (!hasM4aPublicationHelper(ffmpegPath))
    return Promise.reject(
      new MetadataSaveError("save-failed", "Safe audio publication runtime is unavailable")
    );
  return new Promise((resolve2, reject) => {
    let ready = false;
    let closed = false;
    let released = false;
    let output = "";
    let finish;
    const completion = new Promise((done) => {
      finish = done;
    });
    const child = execFile(
      m4aPublicationHelper(ffmpegPath),
      [
        original,
        staging,
        String(expected.size),
        String(expected.ino),
        String(expected.mtimeNs),
        String(expected.ctimeNs),
        "--lock-source"
      ],
      { windowsHide: true, maxBuffer: 4096 },
      (error, stdout) => {
        closed = true;
        finish();
        if (!ready)
          reject(
            windowsPublicationFailure(
              error ?? new Error("Source lock exited before ready"),
              stdout
            )
          );
      }
    );
    child.stdin?.on("error", () => {
    });
    const isHeld = () => ready && !closed && child.exitCode === null && child.signalCode === null;
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
      if (ready || !output.includes("\n")) return;
      try {
        if (JSON.parse(output.trim()).winError !== 0) return;
      } catch {
        return;
      }
      ready = true;
      resolve2({
        isHeld,
        assertHeld() {
          if (!isHeld()) throw new MetadataSaveError("file-changed", "Audio source lock was lost");
        },
        async release() {
          if (!released) {
            released = true;
            child.stdin?.end();
          }
          await completion;
        }
      });
    });
  });
}
const LYRICS_TAG_EXTENSIONS = /* @__PURE__ */ new Set([".mp3", ".flac", ".m4a", ".ogg", ".opus"]);
const source = `
const { parentPort, workerData } = require('node:worker_threads');
const { File, ReadStyle, TagTypes, ByteVector } = require(workerData.modulePath);
// The public Xiph setter trims strings. Adapt its public serialization on this staging
// instance only, retaining the vendor, other fields, pictures and optional framing byte.
function preserveXiphLyrics(comment, text) {
  const render = comment.render.bind(comment);
  comment.render = (framing) => {
    const bytes = Buffer.from(render(framing).toByteArray());
    const vendorEnd = 4 + bytes.readUInt32LE(0);
    const count = bytes.readUInt32LE(vendorEnd);
    let cursor = vendorEnd + 4;
    const fields = [];
    const length = (size) => {
      const value = Buffer.alloc(4);
      value.writeUInt32LE(size);
      return value;
    };
    for (let index = 0; index < count; index++) {
      const start = cursor;
      const size = bytes.readUInt32LE(cursor);
      cursor += 4;
      const field = bytes.subarray(cursor, cursor + size);
      cursor += size;
      const separator = field.indexOf(61);
      if (separator < 0 || field.subarray(0, separator).toString('ascii').toUpperCase() !== 'LYRICS')
        fields.push(bytes.subarray(start, cursor));
    }
    if (text !== '') {
      const field = Buffer.from('LYRICS=' + text, 'utf8');
      fields.push(Buffer.concat([length(field.length), field]));
    }
    return ByteVector.fromByteArray(Buffer.concat([
      bytes.subarray(0, vendorEnd), length(fields.length), ...fields, bytes.subarray(cursor),
    ]));
  };
}
let file;
try {
  file = File.createFromPath(workerData.path, workerData.mime, ReadStyle.None);
  if (!file.isWritable) throw new Error('Lyrics tag is not safely writable');
  file.tag.lyrics = workerData.text;
  if (['taglib/flac', 'taglib/ogg', 'taglib/opus'].includes(workerData.mime)) {
    const comments = file.tag.comments || [file.getTag(TagTypes.Xiph, true)];
    for (const comment of comments) {
      if (!comment) throw new Error('Missing Xiph comment');
      preserveXiphLyrics(comment, workerData.text);
    }
  }
  file.save();
} catch (error) {
  parentPort.postMessage({ message: error.message });
} finally {
  file?.dispose();
  parentPort.close();
}
`;
async function writeLyricsStagingTag(path, extension, text) {
  if (!LYRICS_TAG_EXTENSIONS.has(extension))
    throw new MetadataSaveError("tag-write-failed", "Unsupported embedded lyrics format");
  await new Promise((resolve2, reject) => {
    const worker = new Worker(source, {
      eval: true,
      workerData: {
        modulePath: createRequire(import.meta.url).resolve("node-taglib-sharp"),
        path,
        mime: `taglib/${extension.slice(1)}`,
        text
      }
    });
    let failure;
    worker.on("message", () => {
      failure = new MetadataSaveError("tag-write-failed", "Lyrics tag write failed");
    });
    worker.once("error", (error) => {
      failure = error;
    });
    worker.once("exit", (code) => {
      if (failure) reject(failure);
      else if (code !== 0)
        reject(new MetadataSaveError("tag-write-failed", "Lyrics tag worker exited"));
      else resolve2();
    });
  });
}
const FFMPEG_NOT_FOUND_MESSAGE = "Unable to write audio tags because the bundled FFmpeg runtime is unavailable.";
function sameFileIdentity(actual, expected, includeCtime = true) {
  return actual.size === expected.size && actual.mtimeNs === expected.mtimeNs && actual.ino === expected.ino && actual.dev === expected.dev && (!includeCtime || actual.ctimeNs === expected.ctimeNs);
}
async function removeTagWriteArtifact(filePath) {
  try {
    await rm(filePath, { force: true });
  } catch (error) {
    logger.warn({ err: error, filePath }, "Unable to remove tag-write temporary file");
  }
}
function normalizeTagValue(value) {
  return value?.trim() ?? "";
}
function buildMetadataArguments(metadata, flag = "-metadata") {
  const releaseDate = normalizeTagValue(metadata.releaseDate) || String(metadata.year ?? "");
  const fields = [
    ["title", `title=${normalizeTagValue(metadata.title)}`],
    ["artistDisplay", `artist=${normalizeTagValue(metadata.artistDisplay)}`],
    ["albumTitle", `album=${normalizeTagValue(metadata.albumTitle)}`],
    ["albumArtistDisplay", `album_artist=${normalizeTagValue(metadata.albumArtistDisplay)}`],
    ["genreDisplay", `genre=${normalizeTagValue(metadata.genreDisplay)}`],
    ["releaseDate", `date=${releaseDate}`],
    ["releaseDate", `year=${metadata.year ?? ""}`]
  ];
  return fields.filter(([field2]) => !metadata.editedFields || metadata.editedFields.includes(field2)).flatMap(([, value]) => [flag, value]);
}
function resolveCoverFileExtension(mimeType) {
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  return ".jpg";
}
async function readEmbeddedPicture(filePath) {
  try {
    const metadata = await parseFile(filePath, { skipCovers: false });
    const picture = metadata.common.picture?.[0];
    if (!picture?.data || picture.data.length === 0) return null;
    return { data: Buffer.from(picture.data), mimeType: picture.format || "image/jpeg" };
  } catch {
    return null;
  }
}
async function runFfmpegProcess(ffmpegPath, arguments_) {
  await new Promise((resolve2, reject) => {
    const process2 = spawn(ffmpegPath, arguments_, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let errorOutput = "";
    process2.stderr.setEncoding("utf8");
    process2.stderr.on("data", (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-8e3);
    });
    process2.once("error", (error) => {
      if ("code" in error && error.code === "ENOENT") {
        reject(new Error(FFMPEG_NOT_FOUND_MESSAGE));
        return;
      }
      reject(error);
    });
    process2.once("close", (code) => {
      if (code === 0) {
        resolve2();
        return;
      }
      reject(new Error(errorOutput.trim() || `FFmpeg exited with code ${code ?? "unknown"}.`));
    });
  });
}
async function remuxWithTags(inputPath, outputPath, metadata, ffmpegPath) {
  await runFfmpegProcess(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0",
    "-map_metadata",
    "0",
    "-c",
    "copy",
    "-id3v2_version",
    "3",
    ...buildMetadataArguments(
      metadata,
      [".ogg", ".opus"].includes(extname(inputPath).toLowerCase()) ? "-metadata:s:a:0" : "-metadata"
    ),
    outputPath
  ]);
}
async function remuxWithCover(audioPath, coverPath, outputPath, metadata, ffmpegPath) {
  await runFfmpegProcess(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-i",
    audioPath,
    "-i",
    coverPath,
    "-map",
    "0:a:0",
    "-map",
    "1:0",
    "-c",
    "copy",
    "-disposition:1",
    "attached_pic",
    "-id3v2_version",
    "3",
    "-map_metadata",
    "0",
    ...buildMetadataArguments(metadata),
    outputPath
  ]);
}
async function replaceOriginalFile(originalPath, stagingPath, expected, ffmpegPath, beforeFirstRename) {
  const operationId = randomUUID();
  const backupPath = `${originalPath}.auralis-backup-${operationId}`;
  const probePath = `${stagingPath}.probe`;
  let probeOwned = false;
  let source2 = null;
  try {
    await link(stagingPath, probePath);
    probeOwned = true;
    await unlink(probePath);
    probeOwned = false;
    if (!sameFileIdentity(await stat(originalPath, { bigint: true }), expected)) {
      throw new MetadataSaveError(
        "file-changed",
        "Audio file changed during tag writing; original was not replaced"
      );
    }
    beforeFirstRename?.();
    source2 = await lockWindowsAudioSource(originalPath, stagingPath, expected, ffmpegPath);
    source2.assertHeld();
    await rename(originalPath, backupPath);
    try {
      const backup = await stat(backupPath, { bigint: true });
      source2.assertHeld();
      if (!sameFileIdentity(backup, expected, false)) {
        throw new MetadataSaveError(
          "file-changed",
          "Audio file changed before tag replacement; restoring original"
        );
      }
      await link(stagingPath, originalPath);
    } catch (error) {
      try {
        await link(backupPath, originalPath);
        await removeTagWriteArtifact(backupPath);
      } catch (recoveryError) {
        logger.warn({ err: recoveryError, backupPath }, "Tag write recovery copy retained");
      }
      if (error.code === "EEXIST")
        throw new MetadataSaveError("file-changed", "Audio path was recreated during tag writing");
      throw error;
    }
    if (source2.isHeld()) await removeTagWriteArtifact(backupPath);
    else logger.warn({ backupPath }, "Tag source lock was lost; recovery copy retained");
  } finally {
    if (probeOwned) await removeTagWriteArtifact(probePath);
    await removeTagWriteArtifact(stagingPath);
    await source2?.release();
  }
}
async function prepareAudioTagWrite(filePath, metadata, ffmpegPath) {
  metadata = normalizeEditableMetadata(metadata);
  const extension = extname(filePath);
  if (!extension) {
    throw new Error(`Unable to determine the audio format for ${basename(filePath)}.`);
  }
  if (metadata.lyricsText === void 0 && (!metadata.editedFields || metadata.editedFields.includes("releaseDate")) && extension.toLowerCase() === ".mp3" && metadata.releaseDate?.length === 7)
    throw new MetadataSaveError(
      "unsupported-date-precision",
      "ID3v2.3 cannot preserve month-precision dates"
    );
  const nativePublication = extension.toLowerCase() === ".m4a" && hasM4aPublicationHelper(ffmpegPath);
  const originalIdentity = await stat(filePath, { bigint: true });
  if (metadata.expectedFingerprint && !hasSameScanFileFingerprint(await stat(filePath), metadata.expectedFingerprint))
    throw new MetadataSaveError("metadata-conflict", "Audio file changed since the editor opened");
  const assertUnchanged = async () => {
    if (!sameFileIdentity(await stat(filePath, { bigint: true }), originalIdentity))
      throw new MetadataSaveError(
        "file-changed",
        "Audio file changed during tag writing; original was not replaced"
      );
  };
  let outputPath = null;
  let coveredPath = null;
  let coverPath = null;
  const stagingPath = `${filePath}.auralis-replacement-${randomUUID()}`;
  let prepared = false;
  try {
    if (metadata.lyricsText !== void 0) {
      const sourceMetadata = await parseAudioMetadata(filePath, {
        skipCovers: true,
        duration: false
      });
      await assertUnchanged();
      if (hasEmbeddedTtml(sourceMetadata))
        throw new MetadataSaveError(
          "tag-write-failed",
          "Embedded TTML lyrics must not be overwritten"
        );
      await copyFile(filePath, stagingPath);
      await writeLyricsStagingTag(stagingPath, extension.toLowerCase(), metadata.lyricsText);
    } else if (extension.toLowerCase() === ".m4a") {
      await copyFile(filePath, stagingPath);
      await writeM4aStagingTags(stagingPath, metadata);
    } else {
      outputPath = join(tmpdir(), `auralis-tag-edit-${randomUUID()}${extension}`);
      coveredPath = join(tmpdir(), `auralis-tag-cover-${randomUUID()}${extension}`);
      const picture = await readEmbeddedPicture(filePath);
      await remuxWithTags(filePath, outputPath, metadata, ffmpegPath);
      let taggedPath = outputPath;
      const preservedPicture = picture ? await readEmbeddedPicture(outputPath) : null;
      if (picture && !preservedPicture?.data.equals(picture.data)) {
        coverPath = join(
          tmpdir(),
          `auralis-tag-cover-${randomUUID()}${resolveCoverFileExtension(picture.mimeType)}`
        );
        await writeFile(coverPath, picture.data);
        try {
          await remuxWithCover(outputPath, coverPath, coveredPath, metadata, ffmpegPath);
          taggedPath = coveredPath;
        } catch (error) {
          const actual = await readEmbeddedPicture(outputPath);
          if (!actual || !actual.data.equals(picture.data)) throw error;
        }
      }
      await copyFile(taggedPath, stagingPath);
    }
    await assertUnchanged();
    try {
      verifyWrittenMetadata(metadata, await parseAudioMetadata(stagingPath));
      await verifyPreservedAudioTags(
        filePath,
        stagingPath,
        metadata.lyricsText !== void 0,
        metadata.editedFields
      );
    } catch (error) {
      await assertUnchanged();
      throw error;
    }
    await assertUnchanged();
    prepared = true;
    let committed = false;
    return {
      stagingPath,
      assertUnchanged,
      commit: async (beforeFirstRename, preserveReaders = false) => {
        if (committed) throw new Error("Tag write already committed");
        if (preserveReaders && !nativePublication)
          throw new MetadataSaveError("save-failed", "Safe M4A publication runtime is unavailable");
        if (nativePublication) {
          await assertUnchanged();
          beforeFirstRename?.();
          await publishWindowsM4a(filePath, stagingPath, originalIdentity, ffmpegPath);
        } else
          await replaceOriginalFile(
            filePath,
            stagingPath,
            originalIdentity,
            ffmpegPath,
            beforeFirstRename
          );
        committed = true;
      },
      dispose: () => removeTagWriteArtifact(stagingPath)
    };
  } finally {
    if (outputPath) await removeTagWriteArtifact(outputPath);
    if (coveredPath) await removeTagWriteArtifact(coveredPath);
    if (coverPath) {
      await removeTagWriteArtifact(coverPath);
    }
    if (!prepared) await removeTagWriteArtifact(stagingPath);
  }
}
async function writeAudioTags(filePath, metadata, ffmpegPath) {
  const prepared = await prepareAudioTagWrite(filePath, metadata, ffmpegPath);
  try {
    await prepared.commit();
  } finally {
    await prepared.dispose();
  }
}
async function installTagPlaybackBuffer(context, write) {
  const { state, options, runtime: runtime2, read } = context;
  const { window, client, signal } = write;
  const check = () => assertCurrentTagWrite(context, write);
  for (let attempt = 0; attempt < 2; attempt++) {
    check();
    const rawPosition = await client.command("get_property", "time-pos");
    const position = read().paused ? state.frozenTagTime ?? rawPosition : typeof rawPosition === "number" ? rawPosition + state.tagDecodeOffset : rawPosition;
    if (typeof position !== "number") throw new Error("Invalid tag buffer playback position");
    const paused = read().paused;
    const buffer = await prepareTagAudioBuffer(
      options.mpvPath,
      options.ffmpegPath,
      window.source.path,
      position,
      read().duration,
      paused,
      signal
    );
    state.tagFiles.add(buffer);
    check();
    const installed = await runtime2.enqueue(async () => {
      check();
      const time = await client.command("get_property", "time-pos");
      if (typeof time !== "number" || paused !== read().paused || !paused && buffer.start - time - state.tagDecodeOffset < TAG_BUFFER_LEAD_SECONDS)
        return false;
      window.buffer = buffer;
      window.resumePath = window.source.path;
      window.resumeOffset = buffer.end;
      window.resumeEntry = tagAudioContinuation(
        window.resumePath,
        buffer.end,
        read().duration,
        buffer.rate,
        buffer.origin
      );
      window.phase = "queued";
      if (paused) state.frozenTagTime = buffer.start;
      if (paused) await client.command("loadfile", buffer.path, "replace", -1, {});
      else await client.command("loadfile", buffer.path, "append", -1, {});
      if (buffer.end < read().duration - 1 / buffer.rate)
        await client.command("loadfile", window.resumeEntry, "append", -1, {
          "hr-seek": "yes",
          "hr-seek-demuxer-offset": "1"
        });
      if (!paused)
        await client.command(
          "set_property",
          "file-local-options/end",
          String(buffer.start - state.tagDecodeOffset + 0.25 / buffer.rate)
        );
      return true;
    });
    if (installed) break;
    state.tagFiles.delete(buffer);
    await buffer.dispose();
    if (attempt === 1) throw new Error("Tag buffer preparation missed the playback deadline");
  }
}
async function waitForTagBufferEntry(window) {
  const timeout = setTimeout(() => window.abort.abort(), 2e4);
  try {
    await window.entered;
  } finally {
    clearTimeout(timeout);
  }
}
async function restoreCommittedTagPlayback(context, attempt, filePath, replacementOrigin) {
  const { options, runtime: runtime2, read } = context;
  const { window, client, signal } = attempt;
  const current = () => isCurrentTagWrite(context, attempt);
  const check = () => assertCurrentTagWrite(context, attempt);
  const heldLeaseId = runtime2.currentLeaseId;
  if (!heldLeaseId) {
    const lease = await options.coordinator.acquireReadLease(filePath, "mpv-current", signal);
    if (!current()) {
      options.coordinator.releaseReadLease(lease.leaseId);
      check();
    }
    runtime2.holdCurrentLease(lease.leaseId);
  } else if (!current()) {
    options.coordinator.releaseReadLease(heldLeaseId);
    runtime2.holdCurrentLease(null);
    check();
  }
  await runtime2.enqueue(async () => {
    check();
    if (read().paused) {
      window.resumePath = filePath;
      window.resumeEntry = filePath;
      window.resumeOffset = 0;
      window.loading = true;
      await client.command("loadfile", filePath, "replace", -1, {
        start: String(read().currentTime),
        "hr-seek": "yes",
        "hr-seek-demuxer-offset": "1"
      });
      return;
    }
    const time = await client.command("get_property", "time-pos");
    if (window.phase !== "bridge" || typeof time !== "number" || window.buffer.end - window.buffer.start - time < TAG_BUFFER_LEAD_SECONDS)
      return;
    if (window.buffer.end >= read().duration - 1 / window.buffer.rate) return;
    const pos = await client.command("get_property", "playlist-pos");
    if (typeof pos !== "number") throw new Error("Invalid tag continuation playlist position");
    const entry = tagAudioContinuation(
      filePath,
      window.buffer.end,
      read().duration,
      window.buffer.rate,
      replacementOrigin
    );
    await client.command("loadfile", entry, "append", -1, {
      "hr-seek": "yes",
      "hr-seek-demuxer-offset": "1"
    });
    if (!current() || window.phase !== "bridge") return;
    await client.command("playlist-move", pos + 2, pos + 1);
    window.resumePath = filePath;
    window.resumeEntry = entry;
    window.resumeOffset = window.buffer.end;
    await client.command("playlist-remove", pos + 2);
  });
}
async function waitForTagPlaybackResume(window, signal) {
  const timeout = setTimeout(() => window.abort.abort(), 2e4);
  let failOnAbort;
  try {
    await Promise.race([
      window.resumed,
      new Promise((_, fail2) => {
        if (signal.aborted) fail2(new Error("Tag playback changed"));
        else {
          failOnAbort = () => fail2(new Error("Tag playback changed"));
          signal.addEventListener("abort", failOnAbort, { once: true });
        }
      })
    ]);
  } finally {
    clearTimeout(timeout);
    if (failOnAbort) signal.removeEventListener("abort", failOnAbort);
  }
}
function retainCommittedPlaybackLease(input) {
  if (!input.current() || input.currentLeaseId() !== null) return;
  const coordinator = input.coordinator;
  if (!coordinator?.handoffWriteLeaseToRead) throw new Error("File handoff is unavailable");
  const handed = coordinator.handoffWriteLeaseToRead(input.intent, "mpv-current");
  if (!input.current() || input.currentLeaseId() !== null) {
    coordinator.releaseReadLease(handed.leaseId);
    return;
  }
  input.hold(handed.leaseId);
}
async function writeBufferedTagMetadata(context, filePath, metadata, commitAndReconcile) {
  const { state, options, runtime: runtime2, read, scheduling } = context;
  const coordinator = options.coordinator;
  const intent = coordinator?.reserveWriteIntent?.(filePath);
  if (!intent) return { ok: false, reason: "playback-in-use" };
  const client = runtime2.client;
  const session = runtime2.id;
  const window = createTagPlaybackWindow();
  const signal = AbortSignal.any([window.abort.signal, runtime2.signal]);
  const cancel = () => window.reject(new Error("Tag playback cancelled"));
  signal.addEventListener("abort", cancel, { once: true });
  state.tagWindow = window;
  state.writesInFlight++;
  if (read().paused) state.frozenTagTime ??= read().currentTime;
  const nextRequest = scheduling.suspendPreparation();
  let prepared = null;
  let resumeReaders = null;
  let committed = false;
  let reason = "buffer-preparation-failed";
  const attempt = { filePath, window, client, session, signal };
  const current = () => isCurrentTagWrite(context, attempt);
  const check = () => assertCurrentTagWrite(context, attempt);
  try {
    await runtime2.enqueue(async () => {
      check();
      await scheduling.cancelNext(client);
    });
    scheduling.deferPrevious(nextRequest);
    await scheduling.drainAnalysis();
    check();
    const original = await stat(filePath);
    window.source = await createTagAudioSnapshot(state.tagFallback?.path ?? read().path);
    state.tagFiles.add(window.source);
    prepared = await prepareAudioTagWrite(filePath, metadata, options.ffmpegPath);
    check();
    const actual = await stat(filePath);
    if (original.size !== actual.size || original.mtimeMs !== actual.mtimeMs)
      throw new Error("Audio changed while preparing the tag playback snapshot");
    await prepared.assertUnchanged();
    const replacementOrigin = await readMpvTimestampOrigin(
      options.mpvPath,
      prepared.stagingPath,
      signal
    );
    await installTagPlaybackBuffer(context, attempt);
    await waitForTagBufferEntry(window);
    check();
    resumeReaders = await options.suspendFileReaders?.(filePath) ?? null;
    await scheduling.drainAnalysis();
    check();
    runtime2.releaseCurrentLease();
    coordinator.promoteWriteIntent(intent);
    reason = "file-in-use";
    await commitAndReconcile(async () => {
      check();
      await prepared.commit(check);
      committed = true;
    });
    retainCommittedPlaybackLease({
      current,
      currentLeaseId: () => runtime2.currentLeaseId,
      coordinator,
      intent,
      hold: (leaseId) => runtime2.holdCurrentLease(leaseId)
    });
    resumeReaders?.();
    resumeReaders = null;
    if (current() && window.phase === "bridge") {
      reason = "playback-restore-failed";
      await restoreCommittedTagPlayback(context, attempt, filePath, replacementOrigin);
    }
    if (current() && window.phase !== "resume" && read().loaded) {
      await waitForTagPlaybackResume(window, signal);
    }
    if (window.resumeFailed || current() && read().loaded && window.phase === "resume" && window.resumePath === window.source?.path)
      return { ok: false, reason: "playback-restore-failed" };
    return { ok: true };
  } catch (error) {
    options.warn(error);
    if (signal.aborted || !current()) reason = "playback-changed";
    else if (committed) reason = "playback-restore-failed";
    else reason = metadataSaveFailureReason(error) ?? reason;
    return { ok: false, reason };
  } finally {
    window.done = true;
    signal.removeEventListener("abort", cancel);
    try {
      await completeTagWrite(context, attempt, intent, prepared, resumeReaders);
    } finally {
      state.writesInFlight--;
    }
  }
}
async function completeTagWrite(context, { filePath, window, client, session }, intent, prepared, resumeReaders) {
  const { state, options, runtime: runtime2, read, scheduling } = context;
  options.coordinator.releaseWriteLease(intent);
  resumeReaders?.();
  if (prepared) await prepared.dispose().catch(options.warn);
  if (session === runtime2.id && client === runtime2.client && state.tagWindow === window) {
    if (window.phase === "queued" && window.loading && window.source) {
      await runtime2.enqueue(async () => {
        if (client !== runtime2.client || session !== runtime2.id || state.tagWindow !== window)
          return;
        window.phase = "resume";
        window.resumePath = window.source.path;
        window.resumeEntry = window.source.path;
        window.resumeOffset = 0;
        window.loading = true;
        state.tagFallback = window.source;
        await client.command("loadfile", window.source.path, "replace", -1, {
          start: String(read().currentTime),
          "hr-seek": "yes",
          "hr-seek-demuxer-offset": "1"
        });
      }).catch(options.warn);
    } else if (window.phase === "preparing" || window.phase === "queued") {
      await runtime2.enqueue(async () => {
        if (client !== runtime2.client || session !== runtime2.id) return;
        await client.command("playlist-clear");
        await client.command("set_property", "file-local-options/end", "none");
      }).catch(options.warn);
      state.tagWindow = null;
      scheduling.restoreDeferredNext();
    } else if (window.phase === "resume" && !window.loading)
      finishTagPlaybackWindow(context, window);
  }
  if (session === runtime2.id && client === runtime2.client) {
    if (!runtime2.currentLeaseId && read().loaded) {
      const lease = await options.coordinator.acquireReadLease(filePath, "mpv-current", runtime2.signal).catch(() => null);
      if (lease && session === runtime2.id && client === runtime2.client)
        runtime2.holdCurrentLease(lease.leaseId);
      else if (lease) options.coordinator.releaseReadLease(lease.leaseId);
    }
    options.coordinator.refreshPlaybackCapability?.(filePath);
  }
  if (client !== runtime2.client || session !== runtime2.id) {
    await client.close();
    for (const file of [window.buffer, window.source]) {
      if (file) {
        state.tagFiles.delete(file);
        await file.dispose().catch(options.warn);
      }
    }
  }
  await cleanupTagPlaybackFiles(context);
}
function finishTagPlaybackWindow(context, window) {
  const { state, options, read, scheduling } = context;
  if (state.tagWindow !== window) return;
  state.tagWindow = null;
  options.coordinator?.refreshPlaybackCapability?.(read().path);
  scheduling.restoreDeferredNext();
  void cleanupTagPlaybackFiles(context).catch(options.warn);
}
async function cleanupTagPlaybackFiles(context) {
  const { state, options } = context;
  const files = [...state.tagFiles].filter(
    (file) => file !== state.tagFallback && file !== state.tagWindow?.buffer && file !== state.tagWindow?.source
  );
  for (const file of files) state.tagFiles.delete(file);
  for (const file of files) {
    await file.dispose().catch(options.warn);
  }
}
class BufferedTagPlayback {
  constructor(options, runtime2, read, scheduling, loaded, failure) {
    this.options = options;
    this.runtime = runtime2;
    this.read = read;
    this.scheduling = scheduling;
    this.loaded = loaded;
    this.failure = failure;
    this.context = { state: this.state, options, runtime: runtime2, read, scheduling };
  }
  state = createBufferedTagPlaybackState();
  context;
  isActive() {
    return this.state.tagWindow !== null;
  }
  get canReuseTransport() {
    return !this.state.writesInFlight && !this.state.tagWindow && !this.state.tagFallback && !this.state.tagSeekLoading && !this.state.tagFiles.size;
  }
  get decodeOffset() {
    return this.state.tagDecodeOffset;
  }
  get fallbackPath() {
    return this.state.tagFallback?.path ?? null;
  }
  get spectrumBuffer() {
    return this.state.tagWindow?.phase === "bridge" ? this.state.tagWindow.buffer : null;
  }
  get ignoresIdle() {
    return !!this.state.tagWindow?.resumeFailed && this.state.tagWindow.loading;
  }
  canWriteMetadata(filePath) {
    return this.read().loaded && this.state.tagAudioEligible && this.scheduling.canBeginTagWrite() && !this.state.tagWindow && normalizeAudioFilePath(filePath) === normalizeAudioFilePath(this.read().path) && TAG_PLAYBACK_EXTENSIONS.includes(extname(filePath).toLowerCase());
  }
  reset() {
    this.state.tagEligibilityGeneration += 1;
    this.state.tagAudioEligible = false;
    this.state.frozenTagTime = null;
    this.state.tagDecodeOffset = 0;
    this.state.tagSeekLoading = false;
    this.state.tagWindow?.abort.abort();
    this.state.tagWindow = null;
    this.state.tagFallback = null;
  }
  cancelWrite() {
    this.state.tagWindow?.abort.abort();
  }
  onPause() {
    if (this.state.tagWindow) this.state.frozenTagTime ??= this.read().currentTime;
    if (this.state.tagWindow?.phase === "queued") this.state.tagWindow.abort.abort();
  }
  onResume() {
    this.state.frozenTagTime = null;
  }
  onStartFile() {
    if (this.state.tagSeekLoading) return true;
    if (this.state.tagWindow && this.state.tagWindow.phase !== "preparing") {
      this.state.tagWindow.loading = true;
      return true;
    }
    return false;
  }
  timeFromProperty(name, data, enteringNext) {
    if (typeof data !== "number") return void 0;
    if (name === "time-pos" && !enteringNext && !this.state.tagWindow?.loading && this.state.tagWindow?.phase !== "bridge" && !this.state.tagDecodeOffset && this.state.frozenTagTime === null)
      return data;
    if (name === "audio-pts" && !this.state.tagWindow?.loading && this.state.frozenTagTime === null && (this.state.tagWindow?.phase === "bridge" || this.state.tagDecodeOffset))
      return Math.max(
        this.read().currentTime,
        data + (this.state.tagWindow?.phase === "bridge" ? this.state.tagWindow.buffer.start : this.state.tagDecodeOffset)
      );
    return void 0;
  }
  consumeSeekContinuation() {
    const continuation = this.state.tagSeekLoading;
    this.state.tagSeekLoading = false;
    return continuation;
  }
  onLogicalBoundary() {
    this.state.tagEligibilityGeneration += 1;
    this.state.tagAudioEligible = false;
    this.state.tagFallback = null;
    this.state.tagDecodeOffset = 0;
    void cleanupTagPlaybackFiles(this.context);
  }
  onPlaybackEnded(finishTail) {
    const tag = this.state.tagWindow;
    if (tag?.phase === "bridge" && tag.buffer && tag.buffer.end >= this.read().duration - 1 / tag.buffer.rate) {
      finishTail();
      tag.phase = "resume";
      tag.resume();
      if (tag.done) finishTagPlaybackWindow(this.context, tag);
    } else tag?.abort.abort();
    this.state.tagFallback = null;
  }
  async refreshEligibility(path, session, client) {
    if (this.options.coordinator?.reserveWriteIntent) {
      const generation = ++this.state.tagEligibilityGeneration;
      const expectedPath = normalizeAudioFilePath(path);
      this.state.tagAudioEligible = false;
      const beforeRead = this.read();
      if (!beforeRead.loaded || normalizeAudioFilePath(beforeRead.path) !== expectedPath)
        return false;
      const tags = await parseAudioMetadata(path, { skipCovers: true }).catch(() => null);
      const current = this.read();
      if (!this.runtime.isCurrent(session, client) || generation !== this.state.tagEligibilityGeneration || !current.loaded || normalizeAudioFilePath(current.path) !== expectedPath)
        return false;
      this.state.tagAudioEligible = !!tags?.format.sampleRate && tags.format.sampleRate <= 192e3 && [1, 2].includes(tags.format.numberOfChannels ?? 0);
    }
    return true;
  }
  seek(client, time) {
    this.state.frozenTagTime = null;
    if (this.state.tagWindow?.source && this.state.tagWindow.phase !== "preparing") {
      const window = this.state.tagWindow;
      const source2 = window.source;
      this.state.tagFallback = source2;
      window.resumePath = source2.path;
      window.resumeEntry = source2.path;
      window.resumeOffset = 0;
      window.loading = true;
      window.phase = "resume";
      return client.command("loadfile", source2.path, "replace", -1, {
        start: String(time),
        "hr-seek": "yes",
        "hr-seek-demuxer-offset": "1"
      });
    }
    if (this.state.tagDecodeOffset) {
      this.state.tagDecodeOffset = 0;
      this.state.tagSeekLoading = true;
      const session = this.runtime.id;
      return this.scheduling.cancelNext(client).then(() => {
        if (!this.runtime.isCurrent(session, client)) return;
        return client.command(
          "loadfile",
          this.state.tagFallback?.path ?? this.read().path,
          "replace",
          -1,
          {
            start: String(time),
            "hr-seek": "yes",
            "hr-seek-demuxer-offset": "1"
          }
        );
      });
    }
    return null;
  }
  recoverDecodeError(session) {
    const tag = this.state.tagWindow;
    if (!tag?.source || tag.phase === "preparing" || tag.resumePath === tag.source.path)
      return false;
    tag.resumeFailed = true;
    tag.resumePath = tag.source.path;
    tag.resumeEntry = tag.source.path;
    tag.resumeOffset = 0;
    tag.loading = true;
    this.state.tagFallback = tag.source;
    const client = this.runtime.client;
    void this.runtime.enqueue(async () => {
      if (!this.runtime.isCurrent(session, client) || tag !== this.state.tagWindow) return;
      await client.command("loadfile", tag.source.path, "replace", -1, {
        start: String(this.read().currentTime),
        "hr-seek": "yes",
        "hr-seek-demuxer-offset": "1"
      });
    }).catch((error) => {
      if (this.runtime.isCurrent(session, client) && tag === this.state.tagWindow)
        this.failure(error);
    });
    return true;
  }
  get needsLoadHandling() {
    return this.state.tagWindow !== null && this.state.tagWindow.phase !== "preparing";
  }
  async handleFileLoaded(session, client) {
    const tag = this.state.tagWindow;
    if (!tag || tag.phase === "preparing") return false;
    const path = await client.command("get_property", "path");
    const audioPosition = await client.command("get_property", "audio-pts").catch(() => null);
    if (!this.runtime.isCurrent(session, client) || tag !== this.state.tagWindow) return true;
    if (path !== tag.buffer?.path && path !== tag.resumeEntry) return false;
    const inBuffer = path === tag.buffer?.path;
    tag.loading = false;
    tag.phase = inBuffer ? "bridge" : "resume";
    this.state.tagDecodeOffset = inBuffer ? 0 : tag.resumeOffset;
    if (!inBuffer) this.state.tagFallback = tag.resumePath === tag.source?.path ? tag.source : null;
    const mappedTime = this.state.frozenTagTime ?? (typeof audioPosition === "number" ? audioPosition + (inBuffer ? tag.buffer.start : this.state.tagDecodeOffset) : this.read().currentTime);
    this.loaded(
      this.state.frozenTagTime !== null || !inBuffer && !this.state.tagDecodeOffset ? mappedTime : Math.max(this.read().currentTime, mappedTime)
    );
    if (inBuffer) tag.enter();
    else {
      tag.resume();
      if (tag.done) finishTagPlaybackWindow(this.context, tag);
    }
    return true;
  }
  cleanup() {
    return cleanupTagPlaybackFiles(this.context);
  }
  /** Write tags without restarting the output device or the logical song. */
  async writeMetadata(filePath, metadata, commitAndReconcile) {
    if (!this.canWriteMetadata(filePath)) return { ok: false, reason: "playback-in-use" };
    return writeBufferedTagMetadata(this.context, filePath, metadata, commitAndReconcile);
  }
}
const FILTER_LABEL = "auralis-soft-transition";
function softTransitionContinuationOptions(position) {
  return { af: `@${FILTER_LABEL}:lavfi=[atrim=start=${position}]` };
}
async function clearSoftTransitionContinuation(client, isCurrent) {
  const filters = await client.command("get_property", "af");
  if (!isCurrent()) return;
  if (Array.isArray(filters) && filters.some(
    (filter) => filter !== null && typeof filter === "object" && "label" in filter && filter.label === FILTER_LABEL
  ))
    await client.command("af", "remove", `@${FILTER_LABEL}`);
}
const BOUNDARY_UPDATE_MARGIN_SECONDS = 2;
class NativeBoundaryUpdater {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  operation = null;
  interruptedTransition = null;
  get isUpdating() {
    return this.operation !== null;
  }
  get isInstalling() {
    return this.operation?.installation != null;
  }
  get hasInterruptedLoad() {
    return this.interruptedTransition !== null;
  }
  reset() {
    this.interruptedTransition = null;
  }
  beginUpdate(installation = null) {
    const operation = { installation };
    this.operation = operation;
    return operation;
  }
  finishUpdate(operation) {
    if (this.operation === operation) this.operation = null;
  }
  /** Called after the scheduler records enteringNext and aborts its scan. */
  onStartFile(session, client) {
    if (this.operation?.installation && !this.dependencies.read().hasTransition)
      this.interruptedTransition = this.operation.installation;
    if (!this.isUpdating || this.dependencies.read().hasTransition) return null;
    return this.dependencies.enqueue(async () => {
      if (this.dependencies.isCurrent(session, client)) {
        await client.command("playlist-clear");
        if (this.dependencies.isCurrent(session, client))
          await client.command("set_property", "file-local-options/end", "none");
      }
    });
  }
  async recoverInterruptedLoad(session, client) {
    const interrupted = this.interruptedTransition;
    if (!interrupted) return false;
    const actualPath = await client.command("get_property", "path");
    if (!this.dependencies.isCurrent(session, client)) return true;
    if (this.interruptedTransition === interrupted) this.interruptedTransition = null;
    if (actualPath !== interrupted.bridge) return false;
    await client.command("loadfile", interrupted.original, "replace", -1, {});
    return true;
  }
  updateBoundary(client, nextPath, boundary, isCurrent) {
    return this.dependencies.enqueue(
      () => this.applyBoundary(client, nextPath, boundary, isCurrent)
    );
  }
  installSoftTransition(client, nextPath, prepared, isCurrent) {
    return this.dependencies.enqueue(async () => {
      const owns = () => isCurrent() && this.dependencies.read().loaded && !this.dependencies.read().enteringNext;
      const ready = async () => {
        if (!owns()) return false;
        const time = await client.command("get_property", "time-pos");
        return owns() && typeof time === "number" && prepared.outgoingEnd - time - this.dependencies.read().decodeOffset >= BOUNDARY_UPDATE_MARGIN_SECONDS;
      };
      if (!await ready()) return false;
      const position = await client.command("get_property", "playlist-pos");
      if (typeof position !== "number" || !Number.isInteger(position) || position < 0) return false;
      let installed = false;
      const operation = this.beginUpdate({ bridge: prepared.path, original: nextPath });
      let withdraw;
      try {
        await client.command("loadfile", prepared.path, "append", -1, {});
        await client.command(
          "loadfile",
          nextPath,
          "append",
          -1,
          softTransitionContinuationOptions(prepared.incomingResume)
        );
        if (!await ready()) return false;
        await client.command("playlist-move", position + 2, position + 1);
        await client.command("playlist-move", position + 3, position + 2);
        if (!await ready()) return false;
        await client.command("playlist-remove", position + 3);
        if (!await ready()) return false;
        withdraw = this.dependencies.publishTransition(prepared, nextPath);
        await client.command(
          "set_property",
          "file-local-options/end",
          String(prepared.outgoingEnd - this.dependencies.read().decodeOffset)
        );
        installed = true;
        return true;
      } finally {
        try {
          if (!installed && owns()) {
            withdraw?.();
            await client.command("playlist-clear");
            await client.command("set_property", "file-local-options/end", "none");
            await client.command("loadfile", nextPath, "append", -1, {});
          }
        } finally {
          this.finishUpdate(operation);
        }
      }
    });
  }
  async applyBoundary(client, nextPath, boundary, isCurrent) {
    const ownsBoundary = () => isCurrent() && this.dependencies.read().loaded && !this.dependencies.read().enteringNext;
    const end = boundary.end ?? this.dependencies.read().duration;
    if (!ownsBoundary()) return "cancelled";
    const position = await client.command("get_property", "playlist-pos");
    if (!ownsBoundary()) return "cancelled";
    if (typeof position !== "number" || !Number.isInteger(position) || position < 0)
      throw new Error("Invalid mpv playlist position during boundary update");
    const canUpdate = async () => {
      if (!ownsBoundary()) return false;
      const time = await client.command("get_property", "time-pos");
      if (!ownsBoundary()) return false;
      const currentPosition = await client.command("get_property", "playlist-pos");
      return ownsBoundary() && currentPosition === position && typeof time === "number" && end - time - this.dependencies.read().decodeOffset >= BOUNDARY_UPDATE_MARGIN_SECONDS;
    };
    const skipped = () => ownsBoundary() ? "too-late" : "cancelled";
    if (!await canUpdate()) return skipped();
    const nextIndex = position + 1;
    let appended = false;
    let moved = false;
    let replaced = false;
    const operation = this.beginUpdate();
    try {
      await client.command(
        "loadfile",
        nextPath,
        "append",
        -1,
        softTransitionContinuationOptions(boundary.start)
      );
      appended = true;
      if (!await canUpdate()) return skipped();
      await client.command("playlist-move", nextIndex + 1, nextIndex);
      moved = true;
      if (!await canUpdate()) return skipped();
      await client.command("playlist-remove", nextIndex + 1);
      replaced = true;
      if (!await canUpdate()) return skipped();
      if (boundary.end !== null)
        await client.command(
          "set_property",
          "file-local-options/end",
          String(boundary.end - this.dependencies.read().decodeOffset)
        );
      if (!ownsBoundary()) return skipped();
      appended = false;
      return "applied";
    } finally {
      try {
        if (appended && ownsBoundary()) {
          if (moved) {
            if (replaced) await client.command("loadfile", nextPath, "append", -1, {});
            if (ownsBoundary()) {
              await client.command("playlist-move", nextIndex + 1, nextIndex);
              if (ownsBoundary()) await client.command("playlist-remove", nextIndex + 1);
              if (ownsBoundary())
                await client.command("set_property", "file-local-options/end", "none");
            }
          } else {
            await client.command("playlist-remove", nextIndex + 1);
          }
        }
      } finally {
        this.finishUpdate(operation);
      }
    }
  }
}
const LIVE_SILENCE_DB = -60;
const LIVE_SILENCE_MINIMUM_SECONDS = 1;
class LiveSilenceEdges {
  active = null;
  leadingEnd = 0;
  last = null;
  push(line) {
    for (const match of line.matchAll(/\bsilence_(start|end):\s*([-+\d.eE]+)/g)) {
      const time = Number(match[2]);
      if (!Number.isFinite(time) || time < 0) throw new Error("Invalid live silence timestamp");
      if (match[1] === "start") this.active = time;
      else if (this.active !== null) {
        if (this.active === 0) this.leadingEnd = time;
        this.last = { start: this.active, end: time };
        this.active = null;
      }
    }
  }
  finish(frames, rate) {
    const duration = frames / rate;
    const trailingStart = this.active ?? (this.last && this.last.end >= duration - 1e-6 ? this.last.start : null);
    const clamp = (time) => Math.max(0, Math.min(frames, Math.round(time * rate)));
    return {
      leading: this.active === 0 ? frames : clamp(this.leadingEnd),
      trailing: trailingStart === null ? 0 : frames - clamp(trailingStart)
    };
  }
}
class LiveSilenceAnalyzer {
  constructor(executable, mpvExecutable) {
    this.executable = executable;
    this.mpvExecutable = mpvExecutable;
  }
  cache = /* @__PURE__ */ new Map();
  serial = Promise.resolve();
  async boundary(left, right, signal) {
    signal.throwIfAborted();
    const readers = [left, right].map((path) => parseAudioMetadata(path, { skipCovers: true }));
    let metadata;
    try {
      metadata = await Promise.all(readers);
    } catch (error) {
      await Promise.allSettled(readers);
      throw error;
    }
    signal.throwIfAborted();
    if (metadata.some(
      ({ format }) => !format.sampleRate || format.sampleRate > 192e3 || !format.numberOfChannels || format.numberOfChannels > 32 || format.duration !== void 0 && format.duration > 7200
    ))
      return null;
    const lifetime = new AbortController();
    const scanSignal = AbortSignal.any([signal, lifetime.signal]);
    const scans = [left, right].map(
      (path, index) => this.scan(
        path,
        metadata[index].format.sampleRate,
        metadata[index].format.numberOfChannels,
        scanSignal
      )
    );
    let pair;
    try {
      pair = await Promise.all(scans);
    } catch (error) {
      lifetime.abort();
      await Promise.allSettled(scans);
      throw error;
    }
    const [a, b] = pair;
    signal.throwIfAborted();
    if (a.leading === a.frames || b.leading === b.frames || !a.trailing && !b.leading) return null;
    return {
      start: b.leading ? b.origin + (b.leading + 0.25) / b.rate : 0,
      end: a.trailing ? a.origin + (a.frames - a.trailing + 0.25) / a.rate : null
    };
  }
  async scan(path, rate, channels, signal) {
    signal.throwIfAborted();
    const before = await stat(path);
    signal.throwIfAborted();
    const key = `${path}\0${before.size}\0${before.mtimeMs}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const work = this.serial.then(async () => {
      signal.throwIfAborted();
      const existing = this.cache.get(key);
      if (existing) return existing;
      const result = await this.decode(path, rate, channels, signal);
      const after = await stat(path);
      signal.throwIfAborted();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
        throw new Error("Audio changed during live silence scan");
      this.cache.set(key, result);
      while (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value);
      return result;
    });
    this.serial = work.catch(() => void 0);
    return work;
  }
  async decode(path, rate, channels, signal) {
    signal.throwIfAborted();
    const edges = new LiveSilenceEdges();
    let bytes = 0;
    let origin;
    await new Promise((resolve2, reject) => {
      const child = spawn(
        this.executable,
        [
          "-nostdin",
          "-nostats",
          "-v",
          "info",
          "-threads",
          "1",
          "-copyts",
          "-i",
          path,
          "-map",
          "0:a:0",
          "-vn",
          "-sn",
          "-dn",
          "-af",
          `ashowinfo,asetpts=PTS-STARTPTS,silencedetect=noise=${LIVE_SILENCE_DB}dB:d=${LIVE_SILENCE_MINIMUM_SECONDS}`,
          "-c:a",
          "pcm_f32le",
          "-f",
          "f32le",
          "pipe:1"
        ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
      );
      let pending = "";
      let diagnostics = "";
      let failure;
      const stop = (error) => {
        failure ??= error;
        child.kill();
      };
      const abort = () => stop(new Error("Live silence scan cancelled"));
      const timer = setTimeout(() => stop(new Error("Live silence scan timed out")), 6e4);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      const consume = (line) => {
        try {
          origin ??= parseFirstPcmTimestamp(line, rate, channels);
          edges.push(line);
        } catch (error) {
          stop(error);
        }
      };
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString("utf8");
        diagnostics = (diagnostics + text).slice(-8192);
        const lines = (pending + text).split("\n");
        pending = lines.pop().slice(-8192);
        for (const line of lines) consume(line);
      });
      child.on("error", (error) => {
        failure = error;
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        consume(pending);
        if (failure || code !== 0)
          reject(failure ?? new Error(`Live silence scan failed: ${diagnostics}`));
        else resolve2();
      });
    });
    signal.throwIfAborted();
    const frames = bytes / (channels * 4);
    if (!Number.isInteger(frames) || frames <= 0 || origin === void 0)
      throw new Error("Incomplete live silence scan");
    origin -= await readMpvTimestampOrigin(this.mpvExecutable, path, signal);
    signal.throwIfAborted();
    if (origin < -1 / rate) throw new Error("Unsupported rebased audio timestamp");
    return { frames, rate, origin, ...edges.finish(frames, rate) };
  }
}
class NativeNextTrackScheduler {
  constructor(options, runtime2, read, tag, onRecoverySettled) {
    this.options = options;
    this.runtime = runtime2;
    this.read = read;
    this.tag = tag;
    this.onRecoverySettled = onRecoverySettled;
    this.boundaryUpdater = new NativeBoundaryUpdater({
      enqueue: (work) => this.runtime.enqueue(work),
      isCurrent: (session, client) => this.runtime.isCurrent(session, client),
      read: () => ({
        loaded: this.read().loaded,
        duration: this.read().duration,
        decodeOffset: this.tag.decodeOffset,
        enteringNext: this.enteringNext !== null,
        hasTransition: this.transition !== null
      }),
      publishTransition: (plan, continuationPath) => {
        const transition = {
          plan,
          continuationPath,
          stage: "queued",
          continuationRecovery: null
        };
        this.transition = transition;
        return () => {
          if (this.transition === transition) this.transition = null;
        };
      }
    });
    this.analyzer = new DigitalSilenceAnalyzer(options.ffmpegPath, options.mpvPath);
    this.transitions = new SoftTransitionPreparer(options.ffmpegPath, options.mpvPath);
    this.liveSilence = new LiveSilenceAnalyzer(options.ffmpegPath, options.mpvPath);
  }
  analysisTasks = /* @__PURE__ */ new Set();
  metadataWrites = 0;
  deferredAnalysis = null;
  lastNextRequest = null;
  deferredNext = null;
  scan = new AbortController();
  nextGeneration = 0;
  next = null;
  enteringNext = null;
  transition = null;
  clearingTransition = null;
  boundaryUpdater;
  analyzer;
  transitions;
  liveSilence;
  get isEnteringNext() {
    return this.enteringNext !== null;
  }
  get canReuseTransport() {
    return !this.analysisTasks.size && !this.transition && !this.boundaryUpdater.isInstalling && !this.boundaryUpdater.hasInterruptedLoad && !this.boundaryUpdater.isUpdating;
  }
  get hasInterruptedLoad() {
    return this.boundaryUpdater.hasInterruptedLoad;
  }
  get isContinuation() {
    return this.transition?.stage === "resume";
  }
  get isRecoveringContinuation() {
    return this.transition !== null && (this.transition.continuationRecovery === "queued" || this.clearingTransition === this.transition && this.transition.stage !== "queued");
  }
  get bridge() {
    return this.transition?.stage === "bridge" ? this.transition.plan : null;
  }
  canBeginTagWrite() {
    return (!this.transition || this.transition.stage === "queued") && !this.boundaryUpdater.isInstalling && !this.enteringNext;
  }
  invalidatePreparation(clearRequest = false) {
    this.nextGeneration++;
    this.scan.abort();
    if (clearRequest) {
      this.lastNextRequest = null;
      this.deferredNext = null;
    }
  }
  suspendPreparation() {
    const request = this.lastNextRequest;
    this.invalidatePreparation();
    return request;
  }
  deferPrevious(request) {
    this.deferredNext ??= this.lastNextRequest === request ? request : null;
  }
  async drainAnalysis() {
    await Promise.allSettled([...this.analysisTasks]);
  }
  /** Let existing analysis finish without touching the playlist or its decoder handles. */
  async suspendMetadataAnalysis() {
    this.metadataWrites++;
    await this.drainAnalysis();
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      this.metadataWrites--;
      if (!this.metadataWrites) {
        const analysis = this.deferredAnalysis;
        this.deferredAnalysis = null;
        analysis?.();
      }
    };
  }
  reset() {
    this.deferredAnalysis = null;
    this.lastNextRequest = null;
    this.scan.abort();
    this.disposeTransition();
    this.clearingTransition = null;
    this.deferredNext = null;
    this.boundaryUpdater.reset();
    this.next = null;
    this.enteringNext = null;
    this.nextGeneration++;
  }
  endPlayback() {
    this.next = null;
    this.disposeTransition();
  }
  takeEnteredTrack() {
    const next = this.enteringNext ?? this.next;
    if (!next) throw new Error("Unexpected mpv playlist transition");
    this.next = null;
    this.enteringNext = null;
    this.nextGeneration++;
    return next;
  }
  finishContinuation() {
    this.disposeTransition();
    this.restoreDeferredNext();
  }
  seekContinuation(client, time) {
    if (!this.transition) return null;
    this.transition.stage = "resume";
    this.enteringNext = null;
    return client.command("loadfile", this.read().path, "replace", -1, {
      start: String(time),
      "hr-seek": "yes",
      "hr-seek-demuxer-offset": "1"
    });
  }
  onStartFile(session) {
    if (this.transition?.stage === "bridge" || this.transition?.stage === "resume") {
      this.transition.stage = "resume";
      return;
    }
    if (this.transition?.stage === "queued") this.transition.stage = "bridge";
    this.enteringNext = this.next;
    this.scan.abort();
    const client = this.runtime.client;
    void this.boundaryUpdater.onStartFile(session, client)?.catch((error) => {
      if (this.runtime.isCurrent(session, client)) this.options.warn(error);
    });
  }
  recoverInterruptedLoad(session, client) {
    return this.boundaryUpdater.recoverInterruptedLoad(session, client);
  }
  restoreDeferredNext() {
    const request = this.deferredNext;
    this.deferredNext = null;
    if (request && this.runtime.client && this.read().loaded)
      void this.schedule(request).catch(this.options.warn);
  }
  disposeTransition() {
    const previous = this.transition;
    this.transition = null;
    if (previous) void previous.plan.dispose().catch(this.options.warn);
  }
  trackAnalysis(task) {
    this.analysisTasks.add(task);
    void task.finally(() => this.analysisTasks.delete(task)).catch(this.options.warn);
  }
  async cancelNext(client, { preserveDeferredNext = false } = {}) {
    if (!preserveDeferredNext) this.deferredNext = null;
    const transition = this.transition;
    if (transition?.stage === "bridge" && transition.continuationRecovery !== "missing") {
      this.next = null;
      return;
    }
    const session = this.runtime.id;
    this.clearingTransition = transition;
    try {
      if (transition?.continuationRecovery === "missing") {
        await this.restoreContinuation(client, session, transition);
        return;
      }
      const leaseToRelease = this.runtime.nextLeaseId;
      await client.command("playlist-clear");
      if (!this.runtime.isCurrent(session, client)) return;
      if (transition && this.transition === transition) {
        if (transition.stage === "bridge") {
          await this.restoreContinuation(client, session, transition);
          return;
        }
        const actualPath = await client.command("get_property", "path");
        if (!this.runtime.isCurrent(session, client) || this.transition !== transition) return;
        if (actualPath === transition.plan.path) {
          await this.restoreContinuation(client, session, transition);
          return;
        }
      }
      if (!this.enteringNext && this.runtime.nextLeaseId === leaseToRelease && leaseToRelease) {
        this.runtime.releaseNextLease();
      }
      this.next = null;
      if (this.transition?.stage === "queued") this.disposeTransition();
      if (this.read().loaded && !this.enteringNext)
        await client.command("set_property", "file-local-options/end", "none");
    } finally {
      if (this.clearingTransition === transition) this.clearingTransition = null;
      this.onRecoverySettled();
    }
  }
  async restoreContinuation(client, session, transition) {
    transition.continuationRecovery = "missing";
    await client.command(
      "loadfile",
      transition.continuationPath,
      "append-play",
      -1,
      softTransitionContinuationOptions(transition.plan.incomingResume)
    );
    if (this.runtime.isCurrent(session, client) && this.transition === transition)
      transition.continuationRecovery = "queued";
  }
  async schedule(request) {
    this.lastNextRequest = request;
    if (this.tag.isActive()) {
      this.deferredNext = request;
      return { accepted: true };
    }
    if (this.transition && this.transition.stage !== "queued") {
      this.deferredNext = request;
      return { accepted: true };
    }
    const generation = ++this.nextGeneration;
    this.scan.abort();
    this.scan = new AbortController();
    const signal = this.scan.signal;
    const client = this.runtime.client;
    const currentPath = this.read().path;
    const isCurrent = () => !signal.aborted && generation === this.nextGeneration && request.session === this.runtime.id && client === this.runtime.client && currentPath === this.read().path;
    const nextPath = await this.options.resolveTrack(request.trackId);
    let leaseId = null;
    if (this.options.coordinator) {
      try {
        const lease = await this.options.coordinator.acquireReadLease(nextPath, "mpv-next", signal);
        leaseId = lease.leaseId;
      } catch (error) {
        if (!isCurrent()) return { accepted: false };
        throw error;
      }
    }
    if (!isCurrent()) {
      if (leaseId) this.options.coordinator?.releaseReadLease(leaseId);
      return { accepted: false };
    }
    const result = await this.runtime.enqueue(async () => {
      if (!isCurrent() || !this.read().loaded || this.enteringNext || this.read().duration - this.read().currentTime < 1) {
        if (leaseId) this.options.coordinator?.releaseReadLease(leaseId);
        return { accepted: false };
      }
      let scheduled = false;
      try {
        await this.cancelNext(client);
        if (!isCurrent() || this.enteringNext) {
          if (leaseId) this.options.coordinator?.releaseReadLease(leaseId);
          return { accepted: false };
        }
        if (leaseId && !this.options.coordinator.isReadLeaseForTrack(leaseId, request.trackId, nextPath)) {
          this.options.coordinator.releaseReadLease(leaseId);
          return { accepted: false };
        }
        this.next = { id: request.trackId, path: nextPath };
        this.runtime.holdNextLease(leaseId);
        scheduled = true;
        await client.command("loadfile", nextPath, "append", -1, {});
        return { accepted: isCurrent() };
      } catch (error) {
        if (leaseId && this.runtime.nextLeaseId !== leaseId) {
          this.options.coordinator?.releaseReadLease(leaseId);
        }
        if (!isCurrent()) return { accepted: false };
        if (scheduled) {
          try {
            await this.cancelNext(client);
          } catch {
          }
        }
        throw error;
      }
    });
    if (result.accepted && isCurrent()) {
      const analyze = () => {
        if (!isCurrent()) return;
        if (request.softTransition || request.trimDigitalSilence)
          this.trackAnalysis(
            this.refineNext(client, currentPath, nextPath, request, signal, isCurrent)
          );
      };
      if (this.metadataWrites) this.deferredAnalysis = analyze;
      else analyze();
    }
    return result;
  }
  async refineNext(client, currentPath, nextPath, request, signal, isCurrent) {
    const report = (status) => this.options.onBoundaryStatus?.({ trackId: request.trackId, status });
    try {
      report("analyzing");
      const currentTrackId = this.read().trackId;
      const liveBoundary = currentTrackId !== null && this.options.isLiveAlbum?.(currentTrackId) === true && this.options.isLiveAlbum(request.trackId);
      if (liveBoundary) {
        const boundary = await this.liveSilence.boundary(currentPath, nextPath, signal);
        if (!isCurrent()) return report("cancelled");
        if (!boundary) return report("unchanged");
        report(await this.boundaryUpdater.updateBoundary(client, nextPath, boundary, isCurrent));
      } else if (request.softTransition)
        await this.refineSoftTransition(client, currentPath, nextPath, request, signal, isCurrent);
      else
        await this.refineBoundary(client, currentPath, nextPath, request.trackId, signal, isCurrent);
    } catch (error) {
      report(isCurrent() ? "failed" : "cancelled");
      if (isCurrent()) this.options.warn(error);
    }
  }
  async refineSoftTransition(client, currentPath, nextPath, request, signal, isCurrent) {
    let plan = null;
    const report = (status) => this.options.onBoundaryStatus?.({ trackId: request.trackId, status });
    try {
      plan = await this.transitions.prepare(
        currentPath,
        nextPath,
        request.trimDigitalSilence,
        signal,
        request.softTransitionDurationSeconds
      );
      if (!isCurrent()) return report("cancelled");
      if (!plan) {
        if (request.trimDigitalSilence)
          await this.refineBoundary(
            client,
            currentPath,
            nextPath,
            request.trackId,
            signal,
            isCurrent
          );
        else report("unchanged");
        return;
      }
      const prepared = plan;
      const installed = await this.boundaryUpdater.installSoftTransition(
        client,
        nextPath,
        prepared,
        isCurrent
      );
      if (installed) plan = null;
      report(installed ? "applied" : isCurrent() ? "too-late" : "cancelled");
    } catch (error) {
      report(isCurrent() ? "failed" : "cancelled");
      if (isCurrent()) this.options.warn(error);
    } finally {
      if (plan) await plan.dispose().catch(this.options.warn);
    }
  }
  async refineBoundary(client, currentPath, nextPath, trackId, signal, isCurrent) {
    const report = (status) => this.options.onBoundaryStatus?.({ trackId, status });
    try {
      const boundary = await this.analyzer.boundary(currentPath, nextPath, signal);
      if (!isCurrent()) return report("cancelled");
      if (!boundary) return report("unchanged");
      const status = await this.boundaryUpdater.updateBoundary(
        client,
        nextPath,
        boundary,
        isCurrent
      );
      report(status);
    } catch (error) {
      report(isCurrent() ? "failed" : "cancelled");
      if (isCurrent()) this.options.warn(error);
    }
  }
}
class NativePlaybackSession {
  constructor(coordinator) {
    this.coordinator = coordinator;
  }
  id = -1;
  client = null;
  lifetime = new AbortController();
  serial = Promise.resolve();
  currentReadLease = null;
  nextReadLease = null;
  retiredReadLeases = /* @__PURE__ */ new Set();
  loadEvents = null;
  expectedEntryId = null;
  eventSession = -1;
  loadedWaiter = null;
  get signal() {
    return this.lifetime.signal;
  }
  get currentLeaseId() {
    return this.currentReadLease;
  }
  get nextLeaseId() {
    return this.nextReadLease;
  }
  begin(id) {
    this.lifetime.abort();
    this.failLoad(new Error("Playback replaced"));
    for (const lease of [this.currentReadLease, this.nextReadLease]) {
      if (lease) this.retiredReadLeases.add(lease);
    }
    this.currentReadLease = null;
    this.nextReadLease = null;
    this.loadEvents = null;
    this.expectedEntryId = null;
    this.eventSession = -1;
    this.id = id;
    this.lifetime = new AbortController();
  }
  isCurrent(id, client) {
    return !this.signal.aborted && id === this.id && client === this.client;
  }
  /** Gate the first load by mpv's unique entry ID, including events before its reply. */
  routeEvent(event, accept) {
    if (this.signal.aborted) return;
    if (this.loadEvents) {
      this.loadEvents.push(event);
      return;
    }
    if (this.expectedEntryId !== null) {
      if (event.event !== "start-file" || event.playlist_entry_id !== this.expectedEntryId) return;
      this.expectedEntryId = null;
      this.eventSession = this.id;
    }
    if (this.eventSession === this.id) accept(event, this.id);
  }
  holdCurrentLease(leaseId) {
    this.currentReadLease = leaseId;
  }
  holdNextLease(leaseId) {
    this.nextReadLease = leaseId;
  }
  releaseCurrentLease() {
    if (this.currentReadLease) this.coordinator?.releaseReadLease(this.currentReadLease);
    this.currentReadLease = null;
  }
  releaseNextLease() {
    if (this.nextReadLease) this.coordinator?.releaseReadLease(this.nextReadLease);
    this.nextReadLease = null;
  }
  advanceLease() {
    this.releaseCurrentLease();
    this.currentReadLease = this.nextReadLease;
    this.nextReadLease = null;
    if (this.currentReadLease) this.coordinator?.markReadLeaseCurrent?.(this.currentReadLease);
  }
  releasePlaybackLeases() {
    this.releaseCurrentLease();
    this.releaseNextLease();
  }
  enqueue(work) {
    const result = this.serial.then(work);
    this.serial = result.catch(() => void 0);
    return result;
  }
  load(client, path, accept) {
    const session = this.id;
    return new Promise((resolve2, reject) => {
      const timeout = setTimeout(() => waiter.reject(new Error("mpv file load timed out")), 15e3);
      const waiter = {
        resolve: () => {
          clearTimeout(timeout);
          resolve2();
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      };
      this.loadedWaiter = waiter;
      const events = [];
      this.loadEvents = events;
      void (async () => {
        await client.command("loadfile", path, "replace", -1, {});
        const entryId = await client.command("get_property", "playlist/0/id");
        if (!this.isCurrent(session, client) || this.loadedWaiter !== waiter) return;
        if (typeof entryId !== "number") throw new Error("Invalid mpv replacement entry ID");
        this.expectedEntryId = entryId;
        this.loadEvents = null;
        for (const event of events) {
          if (!this.isCurrent(session, client)) return;
          this.routeEvent(event, accept);
        }
      })().catch((error) => waiter.reject(error));
    });
  }
  finishLoad() {
    for (const lease of this.retiredReadLeases) this.coordinator?.releaseReadLease(lease);
    this.retiredReadLeases.clear();
    this.loadedWaiter?.resolve();
    this.loadedWaiter = null;
  }
  failLoad(error) {
    this.loadedWaiter?.reject(error);
    this.loadedWaiter = null;
  }
  release() {
    const leases = [this.currentReadLease, this.nextReadLease, ...this.retiredReadLeases];
    this.retiredReadLeases.clear();
    this.currentReadLease = null;
    this.nextReadLease = null;
    const closed = this.client?.close();
    this.lifetime.abort();
    this.loadEvents = null;
    this.expectedEntryId = null;
    this.eventSession = -1;
    this.client = null;
    this.failLoad(new Error("Playback replaced"));
    return Promise.resolve(closed).then(() => {
      for (const lease of leases) if (lease) this.coordinator?.releaseReadLease(lease);
    });
  }
}
function canReplacePlayingM4a(filePath, ffmpegPath) {
  return extname(filePath).toLowerCase() === ".m4a" && hasM4aPublicationHelper(ffmpegPath);
}
async function replacePlayingM4a(options, suspendAnalysis, filePath, metadata, commitAndReconcile) {
  const coordinator = options.coordinator;
  if (!canReplacePlayingM4a(filePath, options.ffmpegPath) || !coordinator?.promoteFileReplacement || !coordinator.releaseWriteLease)
    return { ok: false, reason: "playback-in-use" };
  const intent = coordinator.reserveFileReplacement?.(filePath);
  if (!intent) return { ok: false, reason: "playback-in-use" };
  let resumeAnalysis;
  let resumeReaders;
  let prepared;
  try {
    resumeAnalysis = await suspendAnalysis();
    prepared = await prepareAudioTagWrite(filePath, metadata, options.ffmpegPath);
    resumeReaders = await options.suspendFileReaders?.(filePath);
    coordinator.promoteFileReplacement(intent);
    await commitAndReconcile(() => prepared.commit(void 0, true));
    return { ok: true };
  } catch (error) {
    options.warn(error);
    return { ok: false, reason: metadataSaveFailureReason(error) ?? "save-failed" };
  } finally {
    try {
      await prepared?.dispose();
    } catch (error) {
      options.warn(error);
    }
    coordinator.releaseWriteLease(intent);
    resumeReaders?.();
    resumeAnalysis?.();
  }
}
class NativePlaybackService {
  constructor(options) {
    this.options = options;
    this.runtime = new NativePlaybackSession(options.coordinator);
    const read = () => ({
      trackId: this.snapshot.trackId,
      loaded: this.loaded,
      path: this.path,
      paused: this.paused,
      currentTime: this.snapshot.currentTime,
      duration: this.snapshot.duration
    });
    this.tags = new BufferedTagPlayback(
      options,
      this.runtime,
      read,
      {
        canBeginTagWrite: () => this.scheduler.canBeginTagWrite(),
        suspendPreparation: () => this.scheduler.suspendPreparation(),
        cancelNext: (client) => this.scheduler.cancelNext(client),
        deferPrevious: (request) => this.scheduler.deferPrevious(request),
        drainAnalysis: () => this.scheduler.drainAnalysis(),
        restoreDeferredNext: () => this.scheduler.restoreDeferredNext()
      },
      (time) => {
        this.loaded = true;
        this.snapshot.currentTime = time;
        this.publish();
      },
      (error) => this.failure(error)
    );
    this.scheduler = new NativeNextTrackScheduler(
      options,
      this.runtime,
      read,
      this.tags,
      () => this.flushPendingEnd()
    );
  }
  runtime;
  tags;
  scheduler;
  transport = null;
  opening = null;
  closing = /* @__PURE__ */ new Set();
  loaded = false;
  path = "";
  paused = false;
  buffering = false;
  pendingEnd = null;
  snapshot = {
    session: 0,
    kind: "state",
    trackId: null,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    buffering: false
  };
  canWriteMetadata(filePath) {
    return this.tags.canWriteMetadata(filePath);
  }
  canReplaceMetadata(filePath) {
    return canReplacePlayingM4a(filePath, this.options.ffmpegPath);
  }
  writeMetadata(filePath, metadata, commitAndReconcile) {
    if (canReplacePlayingM4a(filePath, this.options.ffmpegPath))
      return replacePlayingM4a(
        this.options,
        () => this.scheduler.suspendMetadataAnalysis(),
        filePath,
        metadata,
        commitAndReconcile
      );
    return this.tags.writeMetadata(filePath, metadata, commitAndReconcile);
  }
  /** Read-only view of the actual decoder source, including transition bridges. */
  getSpectrumSource() {
    if (!this.loaded || this.snapshot.trackId === null) return null;
    const bridge = this.scheduler.bridge;
    const tag = this.tags.spectrumBuffer;
    return {
      trackId: this.snapshot.trackId,
      path: tag?.path ?? bridge?.path ?? this.tags.fallbackPath ?? this.path,
      currentTime: this.snapshot.currentTime,
      isPlaying: this.snapshot.isPlaying,
      timelineOffset: tag?.start ?? bridge?.incomingStart ?? 0
    };
  }
  publish(kind = "state", detail) {
    this.snapshot = {
      ...this.snapshot,
      session: this.runtime.id,
      kind,
      detail,
      isPlaying: this.loaded && !this.paused && !this.buffering,
      buffering: this.buffering
    };
    this.options.emit({ ...this.snapshot });
  }
  failure(error) {
    this.loaded = false;
    this.runtime.failLoad(error);
    this.publish("error", error.message);
    void this.release().catch(this.options.warn);
  }
  release() {
    this.pendingEnd = null;
    this.tags.reset();
    const opening = this.opening;
    this.opening = null;
    this.transport?.abort();
    this.transport = null;
    const closed = this.runtime.release();
    this.scheduler.reset();
    this.loaded = false;
    const released = Promise.all([
      closed,
      opening?.then(
        (client) => client.close(),
        () => void 0
      )
    ]).then(() => this.tags.cleanup());
    this.closing.add(released);
    void released.then(
      () => this.closing.delete(released),
      () => this.closing.delete(released)
    );
    return released;
  }
  ensureClient() {
    if (this.opening) return this.opening;
    const transport = new AbortController();
    this.transport = transport;
    this.opening = (async () => {
      const client = await openMpvClient(
        this.options.mpvPath,
        (event) => {
          if (!transport.signal.aborted)
            this.runtime.routeEvent(event, (message, session) => this.onEvent(message, session));
        },
        (error) => {
          if (!transport.signal.aborted) this.failure(error);
        },
        transport.signal,
        this.options.mpvArgs
      );
      if (transport.signal.aborted) {
        await client.close();
        throw new Error("Playback transport cancelled");
      }
      this.runtime.client = client;
      await Promise.all(
        ["time-pos", "duration", "pause", "paused-for-cache", "idle-active", "audio-pts"].map(
          (name, index) => client.command("observe_property", index + 1, name)
        )
      );
      return client;
    })();
    return this.opening;
  }
  dispose() {
    this.release();
    this.runtime.id = -1;
    return Promise.all([...this.closing]).then(() => void 0);
  }
  async command(request) {
    if (request.action === "start") return this.start(request);
    if (request.action === "stop") {
      if (request.session < this.runtime.id) return { accepted: false };
      const closed = this.release();
      this.runtime.id = request.session;
      await closed;
      return { accepted: true };
    }
    if (request.session !== this.runtime.id || !this.runtime.client) return { accepted: false };
    if (request.action === "next") return this.scheduler.schedule(request);
    if (request.action === "cancel-next" || request.action === "seek")
      this.scheduler.invalidatePreparation(request.action === "cancel-next");
    if (request.action === "seek") this.tags.cancelWrite();
    const client = this.runtime.client;
    const isCurrent = () => this.runtime.isCurrent(request.session, client);
    return this.runtime.enqueue(async () => {
      if (!isCurrent()) return { accepted: false };
      try {
        switch (request.action) {
          case "cancel-next":
            if (!this.tags.isActive())
              await this.scheduler.cancelNext(client, { preserveDeferredNext: true });
            break;
          case "pause":
            await client.command("set_property", "pause", true);
            if (!isCurrent()) return { accepted: false };
            this.paused = true;
            this.tags.onPause();
            this.publish();
            break;
          case "resume":
            this.tags.onResume();
            await client.command("set_property", "pause", false);
            if (!isCurrent()) return { accepted: false };
            this.paused = false;
            this.publish();
            break;
          case "seek": {
            const trackId = this.snapshot.trackId;
            const isSeekingTrack = () => isCurrent() && this.loaded && this.snapshot.trackId === trackId && !this.scheduler.isEnteringNext;
            const tagSeek = this.tags.seek(client, request.time);
            if (tagSeek) {
              await tagSeek;
              if (!isCurrent()) return { accepted: false };
              break;
            }
            await this.scheduler.cancelNext(client);
            if (!isCurrent()) return { accepted: false };
            const continuation = this.scheduler.seekContinuation(client, request.time);
            if (continuation) await continuation;
            else {
              if (!isSeekingTrack()) return { accepted: false };
              await clearSoftTransitionContinuation(client, isSeekingTrack);
              if (!isSeekingTrack()) return { accepted: false };
              await client.command("seek", request.time, "absolute+exact");
            }
            break;
          }
          case "volume":
            await client.command("set_property", "volume", request.volume * 100);
            if (!isCurrent()) return { accepted: false };
            await client.command("set_property", "mute", request.muted);
            break;
        }
        return { accepted: isCurrent() };
      } catch (error) {
        if (!isCurrent()) return { accepted: false };
        throw error;
      }
    });
  }
  async start(request) {
    if (request.session <= this.runtime.id) return { accepted: false };
    const previousClient = this.runtime.client;
    if (!this.tags.canReuseTransport || !this.scheduler.canReuseTransport)
      void this.release().catch(this.options.warn);
    else {
      this.tags.reset();
      this.scheduler.reset();
      this.loaded = false;
    }
    this.runtime.begin(request.session);
    this.pendingEnd = null;
    const signal = this.runtime.signal;
    let path;
    try {
      path = await this.options.resolveTrack(request.trackId);
    } catch (error) {
      if (signal.aborted) return { accepted: false };
      this.failure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    if (signal.aborted) return { accepted: false };
    let leaseId = null;
    if (this.options.coordinator) {
      try {
        const lease = await this.options.coordinator.acquireReadLease(path, "mpv-current", signal);
        leaseId = lease.leaseId;
      } catch (error) {
        if (signal.aborted) return { accepted: false };
        this.failure(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }
    if (signal.aborted) {
      if (leaseId) this.options.coordinator?.releaseReadLease(leaseId);
      return { accepted: false };
    }
    this.runtime.holdCurrentLease(leaseId);
    this.path = path;
    this.paused = false;
    this.buffering = false;
    this.snapshot = {
      session: request.session,
      kind: "state",
      trackId: request.trackId,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      buffering: false
    };
    try {
      const client = await this.ensureClient();
      return await this.runtime.enqueue(async () => {
        const isCurrent = () => this.runtime.isCurrent(request.session, client);
        if (!isCurrent()) return { accepted: false };
        await client.command("set_property", "volume", request.volume * 100);
        if (!isCurrent()) return { accepted: false };
        await client.command("set_property", "mute", request.muted);
        if (!isCurrent()) return { accepted: false };
        if (leaseId && !this.options.coordinator.isReadLeaseForTrack(leaseId, request.trackId, path))
          throw new Error("Playback track path changed before loading");
        await this.runtime.load(client, path, (event, session) => this.onEvent(event, session));
        if (!isCurrent()) return { accepted: false };
        if (client === previousClient) {
          await client.command("set_property", "pause", false);
          if (!isCurrent()) return { accepted: false };
          this.paused = false;
          this.publish();
        }
        return { accepted: isCurrent() };
      });
    } catch (error) {
      if (signal.aborted) return { accepted: false };
      this.failure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  onEvent(event, session) {
    if (event.event === "start-file" && this.loaded) {
      if (!this.tags.onStartFile()) this.scheduler.onStartFile(session);
    } else if (event.event === "property-change") {
      this.propertyChanged(event);
    } else if (event.event === "file-loaded") {
      void this.fileLoaded(session).catch((error) => {
        if (session === this.runtime.id && this.runtime.client) this.failure(error);
      });
    } else if (event.event === "end-file" && event.reason === "error") {
      if (!this.tags.recoverDecodeError(session))
        this.failure(new Error(`mpv could not decode audio: ${event.error ?? "unknown error"}`));
    } else if (event.event === "idle" && this.loaded && !this.tags.ignoresIdle) {
      this.playbackEnded();
    }
  }
  playbackEnded() {
    if (this.scheduler.isRecoveringContinuation && this.runtime.client) {
      this.pendingEnd = { session: this.runtime.id, client: this.runtime.client };
      return;
    }
    this.pendingEnd = null;
    this.tags.onPlaybackEnded(() => {
      this.snapshot.currentTime = this.snapshot.duration;
    });
    this.loaded = false;
    this.scheduler.endPlayback();
    this.runtime.releasePlaybackLeases();
    this.publish("ended");
    void this.tags.cleanup().catch(this.options.warn);
  }
  flushPendingEnd() {
    const pending = this.pendingEnd;
    if (pending && this.runtime.isCurrent(pending.session, pending.client) && !this.scheduler.isRecoveringContinuation)
      this.playbackEnded();
  }
  propertyChanged(event) {
    if (event.name === "idle-active" && event.data === true && this.loaded) {
      if (!this.tags.ignoresIdle) this.playbackEnded();
      return;
    }
    const time = this.tags.timeFromProperty(event.name, event.data, this.scheduler.isEnteringNext);
    if (time !== void 0)
      this.snapshot.currentTime = event.name === "time-pos" && this.scheduler.bridge ? this.scheduler.bridge.incomingStart + time : time;
    if (event.name === "duration" && typeof event.data === "number" && !this.scheduler.isEnteringNext && !this.tags.isActive() && !this.scheduler.bridge)
      this.snapshot.duration = event.data + this.tags.decodeOffset;
    if (event.name === "pause" && typeof event.data === "boolean") this.paused = event.data;
    if (event.name === "paused-for-cache" && typeof event.data === "boolean")
      this.buffering = event.data;
    if (this.loaded) this.publish();
  }
  beginLoadedTrack(paused) {
    if (typeof paused === "boolean") this.paused = paused;
    const tagContinuation = this.tags.consumeSeekContinuation();
    const continuation = this.scheduler.isContinuation || tagContinuation;
    const boundary = this.loaded && !continuation;
    if (boundary) {
      const next = this.scheduler.takeEnteredTrack();
      this.snapshot.trackId = next.id;
      this.path = next.path;
      this.tags.onLogicalBoundary();
      this.runtime.advanceLease();
    }
    this.loaded = true;
    return { continuation, boundary };
  }
  publishLoadedFile(properties, continuation, boundary) {
    const [duration, position] = properties;
    this.snapshot.duration = typeof duration === "number" ? duration : 0;
    this.snapshot.currentTime = typeof position === "number" ? position : 0;
    const bridge = this.scheduler.bridge;
    if (bridge) {
      this.snapshot.duration = bridge.incomingDuration;
      this.snapshot.currentTime += bridge.incomingStart;
    }
    if (continuation) {
      this.pendingEnd = null;
      this.scheduler.finishContinuation();
    }
    this.publish(boundary ? "boundary" : "state");
  }
  async fileLoaded(session) {
    const client = this.runtime.client;
    if (!client) return;
    if (this.tags.needsLoadHandling && await this.tags.handleFileLoaded(session, client)) return;
    if (this.scheduler.hasInterruptedLoad && await this.scheduler.recoverInterruptedLoad(session, client))
      return;
    let properties;
    try {
      properties = await Promise.all([
        client.command("get_property", "duration"),
        client.command("get_property", "time-pos"),
        client.command("get_property", "pause")
      ]);
    } catch (error) {
      if (!this.runtime.isCurrent(session, client)) return;
      throw error;
    }
    if (!this.runtime.isCurrent(session, client)) return;
    const { continuation, boundary } = this.beginLoadedTrack(properties[2]);
    const loadedPath = this.path;
    const eligibility = this.tags.refreshEligibility(loadedPath, session, client);
    if (!boundary && !await eligibility) return;
    this.publishLoadedFile(properties, continuation, boundary);
    if (!this.runtime.isCurrent(session, client)) return;
    if (boundary) {
      void eligibility.then((current) => {
        if (current && this.runtime.isCurrent(session, client) && this.path === loadedPath)
          this.options.coordinator?.refreshPlaybackCapability?.(loadedPath);
      }).catch(this.options.warn);
    } else {
      this.options.coordinator?.refreshPlaybackCapability?.(loadedPath);
    }
    this.runtime.finishLoad();
  }
}
var fft;
var hasRequiredFft;
function requireFft() {
  if (hasRequiredFft) return fft;
  hasRequiredFft = 1;
  function FFT2(size) {
    this.size = size | 0;
    if (this.size <= 1 || (this.size & this.size - 1) !== 0)
      throw new Error("FFT size must be a power of two and bigger than 1");
    this._csize = size << 1;
    var table = new Array(this.size * 2);
    for (var i = 0; i < table.length; i += 2) {
      const angle = Math.PI * i / this.size;
      table[i] = Math.cos(angle);
      table[i + 1] = -Math.sin(angle);
    }
    this.table = table;
    var power = 0;
    for (var t = 1; this.size > t; t <<= 1)
      power++;
    this._width = power % 2 === 0 ? power - 1 : power;
    this._bitrev = new Array(1 << this._width);
    for (var j = 0; j < this._bitrev.length; j++) {
      this._bitrev[j] = 0;
      for (var shift = 0; shift < this._width; shift += 2) {
        var revShift = this._width - shift - 2;
        this._bitrev[j] |= (j >>> shift & 3) << revShift;
      }
    }
    this._out = null;
    this._data = null;
    this._inv = 0;
  }
  fft = FFT2;
  FFT2.prototype.fromComplexArray = function fromComplexArray(complex, storage) {
    var res = storage || new Array(complex.length >>> 1);
    for (var i = 0; i < complex.length; i += 2)
      res[i >>> 1] = complex[i];
    return res;
  };
  FFT2.prototype.createComplexArray = function createComplexArray() {
    const res = new Array(this._csize);
    for (var i = 0; i < res.length; i++)
      res[i] = 0;
    return res;
  };
  FFT2.prototype.toComplexArray = function toComplexArray(input, storage) {
    var res = storage || this.createComplexArray();
    for (var i = 0; i < res.length; i += 2) {
      res[i] = input[i >>> 1];
      res[i + 1] = 0;
    }
    return res;
  };
  FFT2.prototype.completeSpectrum = function completeSpectrum(spectrum) {
    var size = this._csize;
    var half = size >>> 1;
    for (var i = 2; i < half; i += 2) {
      spectrum[size - i] = spectrum[i];
      spectrum[size - i + 1] = -spectrum[i + 1];
    }
  };
  FFT2.prototype.transform = function transform(out, data) {
    if (out === data)
      throw new Error("Input and output buffers must be different");
    this._out = out;
    this._data = data;
    this._inv = 0;
    this._transform4();
    this._out = null;
    this._data = null;
  };
  FFT2.prototype.realTransform = function realTransform(out, data) {
    if (out === data)
      throw new Error("Input and output buffers must be different");
    this._out = out;
    this._data = data;
    this._inv = 0;
    this._realTransform4();
    this._out = null;
    this._data = null;
  };
  FFT2.prototype.inverseTransform = function inverseTransform(out, data) {
    if (out === data)
      throw new Error("Input and output buffers must be different");
    this._out = out;
    this._data = data;
    this._inv = 1;
    this._transform4();
    for (var i = 0; i < out.length; i++)
      out[i] /= this.size;
    this._out = null;
    this._data = null;
  };
  FFT2.prototype._transform4 = function _transform4() {
    var out = this._out;
    var size = this._csize;
    var width = this._width;
    var step = 1 << width;
    var len = size / step << 1;
    var outOff;
    var t;
    var bitrev = this._bitrev;
    if (len === 4) {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        const off = bitrev[t];
        this._singleTransform2(outOff, off, step);
      }
    } else {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        const off = bitrev[t];
        this._singleTransform4(outOff, off, step);
      }
    }
    var inv = this._inv ? -1 : 1;
    var table = this.table;
    for (step >>= 2; step >= 2; step >>= 2) {
      len = size / step << 1;
      var quarterLen = len >>> 2;
      for (outOff = 0; outOff < size; outOff += len) {
        var limit = outOff + quarterLen;
        for (var i = outOff, k = 0; i < limit; i += 2, k += step) {
          const A = i;
          const B = A + quarterLen;
          const C = B + quarterLen;
          const D = C + quarterLen;
          const Ar = out[A];
          const Ai = out[A + 1];
          const Br = out[B];
          const Bi = out[B + 1];
          const Cr = out[C];
          const Ci = out[C + 1];
          const Dr = out[D];
          const Di = out[D + 1];
          const MAr = Ar;
          const MAi = Ai;
          const tableBr = table[k];
          const tableBi = inv * table[k + 1];
          const MBr = Br * tableBr - Bi * tableBi;
          const MBi = Br * tableBi + Bi * tableBr;
          const tableCr = table[2 * k];
          const tableCi = inv * table[2 * k + 1];
          const MCr = Cr * tableCr - Ci * tableCi;
          const MCi = Cr * tableCi + Ci * tableCr;
          const tableDr = table[3 * k];
          const tableDi = inv * table[3 * k + 1];
          const MDr = Dr * tableDr - Di * tableDi;
          const MDi = Dr * tableDi + Di * tableDr;
          const T0r = MAr + MCr;
          const T0i = MAi + MCi;
          const T1r = MAr - MCr;
          const T1i = MAi - MCi;
          const T2r = MBr + MDr;
          const T2i = MBi + MDi;
          const T3r = inv * (MBr - MDr);
          const T3i = inv * (MBi - MDi);
          const FAr = T0r + T2r;
          const FAi = T0i + T2i;
          const FCr = T0r - T2r;
          const FCi = T0i - T2i;
          const FBr = T1r + T3i;
          const FBi = T1i - T3r;
          const FDr = T1r - T3i;
          const FDi = T1i + T3r;
          out[A] = FAr;
          out[A + 1] = FAi;
          out[B] = FBr;
          out[B + 1] = FBi;
          out[C] = FCr;
          out[C + 1] = FCi;
          out[D] = FDr;
          out[D + 1] = FDi;
        }
      }
    }
  };
  FFT2.prototype._singleTransform2 = function _singleTransform2(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const evenR = data[off];
    const evenI = data[off + 1];
    const oddR = data[off + step];
    const oddI = data[off + step + 1];
    const leftR = evenR + oddR;
    const leftI = evenI + oddI;
    const rightR = evenR - oddR;
    const rightI = evenI - oddI;
    out[outOff] = leftR;
    out[outOff + 1] = leftI;
    out[outOff + 2] = rightR;
    out[outOff + 3] = rightI;
  };
  FFT2.prototype._singleTransform4 = function _singleTransform4(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const inv = this._inv ? -1 : 1;
    const step2 = step * 2;
    const step3 = step * 3;
    const Ar = data[off];
    const Ai = data[off + 1];
    const Br = data[off + step];
    const Bi = data[off + step + 1];
    const Cr = data[off + step2];
    const Ci = data[off + step2 + 1];
    const Dr = data[off + step3];
    const Di = data[off + step3 + 1];
    const T0r = Ar + Cr;
    const T0i = Ai + Ci;
    const T1r = Ar - Cr;
    const T1i = Ai - Ci;
    const T2r = Br + Dr;
    const T2i = Bi + Di;
    const T3r = inv * (Br - Dr);
    const T3i = inv * (Bi - Di);
    const FAr = T0r + T2r;
    const FAi = T0i + T2i;
    const FBr = T1r + T3i;
    const FBi = T1i - T3r;
    const FCr = T0r - T2r;
    const FCi = T0i - T2i;
    const FDr = T1r - T3i;
    const FDi = T1i + T3r;
    out[outOff] = FAr;
    out[outOff + 1] = FAi;
    out[outOff + 2] = FBr;
    out[outOff + 3] = FBi;
    out[outOff + 4] = FCr;
    out[outOff + 5] = FCi;
    out[outOff + 6] = FDr;
    out[outOff + 7] = FDi;
  };
  FFT2.prototype._realTransform4 = function _realTransform4() {
    var out = this._out;
    var size = this._csize;
    var width = this._width;
    var step = 1 << width;
    var len = size / step << 1;
    var outOff;
    var t;
    var bitrev = this._bitrev;
    if (len === 4) {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        const off = bitrev[t];
        this._singleRealTransform2(outOff, off >>> 1, step >>> 1);
      }
    } else {
      for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
        const off = bitrev[t];
        this._singleRealTransform4(outOff, off >>> 1, step >>> 1);
      }
    }
    var inv = this._inv ? -1 : 1;
    var table = this.table;
    for (step >>= 2; step >= 2; step >>= 2) {
      len = size / step << 1;
      var halfLen = len >>> 1;
      var quarterLen = halfLen >>> 1;
      var hquarterLen = quarterLen >>> 1;
      for (outOff = 0; outOff < size; outOff += len) {
        for (var i = 0, k = 0; i <= hquarterLen; i += 2, k += step) {
          var A = outOff + i;
          var B = A + quarterLen;
          var C = B + quarterLen;
          var D = C + quarterLen;
          var Ar = out[A];
          var Ai = out[A + 1];
          var Br = out[B];
          var Bi = out[B + 1];
          var Cr = out[C];
          var Ci = out[C + 1];
          var Dr = out[D];
          var Di = out[D + 1];
          var MAr = Ar;
          var MAi = Ai;
          var tableBr = table[k];
          var tableBi = inv * table[k + 1];
          var MBr = Br * tableBr - Bi * tableBi;
          var MBi = Br * tableBi + Bi * tableBr;
          var tableCr = table[2 * k];
          var tableCi = inv * table[2 * k + 1];
          var MCr = Cr * tableCr - Ci * tableCi;
          var MCi = Cr * tableCi + Ci * tableCr;
          var tableDr = table[3 * k];
          var tableDi = inv * table[3 * k + 1];
          var MDr = Dr * tableDr - Di * tableDi;
          var MDi = Dr * tableDi + Di * tableDr;
          var T0r = MAr + MCr;
          var T0i = MAi + MCi;
          var T1r = MAr - MCr;
          var T1i = MAi - MCi;
          var T2r = MBr + MDr;
          var T2i = MBi + MDi;
          var T3r = inv * (MBr - MDr);
          var T3i = inv * (MBi - MDi);
          var FAr = T0r + T2r;
          var FAi = T0i + T2i;
          var FBr = T1r + T3i;
          var FBi = T1i - T3r;
          out[A] = FAr;
          out[A + 1] = FAi;
          out[B] = FBr;
          out[B + 1] = FBi;
          if (i === 0) {
            var FCr = T0r - T2r;
            var FCi = T0i - T2i;
            out[C] = FCr;
            out[C + 1] = FCi;
            continue;
          }
          if (i === hquarterLen)
            continue;
          var ST0r = T1r;
          var ST0i = -T1i;
          var ST1r = T0r;
          var ST1i = -T0i;
          var ST2r = -inv * T3i;
          var ST2i = -inv * T3r;
          var ST3r = -inv * T2i;
          var ST3i = -inv * T2r;
          var SFAr = ST0r + ST2r;
          var SFAi = ST0i + ST2i;
          var SFBr = ST1r + ST3i;
          var SFBi = ST1i - ST3r;
          var SA = outOff + quarterLen - i;
          var SB = outOff + halfLen - i;
          out[SA] = SFAr;
          out[SA + 1] = SFAi;
          out[SB] = SFBr;
          out[SB + 1] = SFBi;
        }
      }
    }
  };
  FFT2.prototype._singleRealTransform2 = function _singleRealTransform2(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const evenR = data[off];
    const oddR = data[off + step];
    const leftR = evenR + oddR;
    const rightR = evenR - oddR;
    out[outOff] = leftR;
    out[outOff + 1] = 0;
    out[outOff + 2] = rightR;
    out[outOff + 3] = 0;
  };
  FFT2.prototype._singleRealTransform4 = function _singleRealTransform4(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const inv = this._inv ? -1 : 1;
    const step2 = step * 2;
    const step3 = step * 3;
    const Ar = data[off];
    const Br = data[off + step];
    const Cr = data[off + step2];
    const Dr = data[off + step3];
    const T0r = Ar + Cr;
    const T1r = Ar - Cr;
    const T2r = Br + Dr;
    const T3r = inv * (Br - Dr);
    const FAr = T0r + T2r;
    const FBr = T1r;
    const FBi = -T3r;
    const FCr = T0r - T2r;
    const FDr = T1r;
    const FDi = T3r;
    out[outOff] = FAr;
    out[outOff + 1] = 0;
    out[outOff + 2] = FBr;
    out[outOff + 3] = FBi;
    out[outOff + 4] = FCr;
    out[outOff + 5] = 0;
    out[outOff + 6] = FDr;
    out[outOff + 7] = FDi;
  };
  return fft;
}
var fftExports = requireFft();
const FFT = /* @__PURE__ */ getDefaultExportFromCjs(fftExports);
const SPECTRUM_BANDS = 32;
const SPECTRUM_SAMPLE_RATE = 24e3;
const SPECTRUM_FFT_SIZE = 2048;
const SPECTRUM_HOP_SIZE = 1024;
const SPECTRUM_CHANNELS = 2;
class SpectrumAnalyzer {
  fft = new FFT(SPECTRUM_FFT_SIZE);
  input = new Float64Array(SPECTRUM_FFT_SIZE);
  // fft.js interleaves real and imaginary values; only its positive-frequency half is used.
  spectrum = new Float64Array(SPECTRUM_FFT_SIZE * 2);
  window = Float64Array.from(
    { length: SPECTRUM_FFT_SIZE },
    (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (SPECTRUM_FFT_SIZE - 1))
  );
  windowPower = this.window.reduce((sum, value) => sum + value * value, 0);
  bins = Array.from(
    { length: SPECTRUM_BANDS + 1 },
    (_, i) => Math.max(
      1,
      Math.round(
        40 * (11e3 / 40) ** (i / SPECTRUM_BANDS) * SPECTRUM_FFT_SIZE / SPECTRUM_SAMPLE_RATE
      )
    )
  );
  analyze(samples) {
    if (samples.length !== SPECTRUM_FFT_SIZE) throw new Error("Invalid spectrum window");
    let energy = 0;
    for (let i = 0; i < SPECTRUM_FFT_SIZE; i++) {
      const sample = Number.isFinite(samples[i]) ? samples[i] : 0;
      energy += sample * sample;
      this.input[i] = sample * this.window[i];
    }
    this.fft.realTransform(this.spectrum, this.input);
    let bassPower = 0;
    const firstBassBin = Math.ceil(40 * SPECTRUM_FFT_SIZE / SPECTRUM_SAMPLE_RATE);
    const lastBassBin = Math.floor(150 * SPECTRUM_FFT_SIZE / SPECTRUM_SAMPLE_RATE);
    for (let bin = firstBassBin; bin <= lastBassBin; bin++) {
      bassPower += this.spectrum[bin * 2] ** 2 + this.spectrum[bin * 2 + 1] ** 2;
    }
    const bass = Math.min(1, Math.sqrt(2 * bassPower / (SPECTRUM_FFT_SIZE * this.windowPower)));
    const bands = Array.from({ length: SPECTRUM_BANDS }, (_, band) => {
      const first = this.bins[band];
      const end = Math.max(first + 1, this.bins[band + 1]);
      let peakPower = 0;
      for (let bin = first; bin < end; bin++) {
        peakPower = Math.max(
          peakPower,
          this.spectrum[bin * 2] ** 2 + this.spectrum[bin * 2 + 1] ** 2
        );
      }
      const amplitude = Math.sqrt(peakPower) * 4 / SPECTRUM_FFT_SIZE;
      return amplitude < 25e-5 ? 0 : Math.max(0, Math.min(1, (20 * Math.log10(amplitude) + 72) / 60));
    });
    return { bands, rms: Math.min(1, Math.sqrt(energy / SPECTRUM_FFT_SIZE)), bass };
  }
}
const HORIZON = 1.5;
const MAX_CARRY_BYTES = 512 * 1024;
class PlaybackSpectrumService {
  constructor(options) {
    this.options = options;
  }
  suspendedPaths = /* @__PURE__ */ new Map();
  subscription = null;
  source = null;
  anchorAt = 0;
  child = null;
  decoderAbort = null;
  timer = null;
  epoch = 0;
  sequence = 0;
  revision = -1;
  decodeStart = 0;
  decodedSamples = 0;
  carry = Buffer.alloc(0);
  frames = [];
  eof = false;
  failed = false;
  lastFrameTime = -1;
  analyzer = new SpectrumAnalyzer();
  closing = /* @__PURE__ */ new Set();
  lastHeartbeat = 0;
  resolvingKey = null;
  usingNative = false;
  diagnostics = {
    analyzedFrames: 0,
    maxBufferedFrames: 0,
    maxCarryBytes: 0,
    maxAnalysisMs: 0,
    emittedFrames: 0,
    decoderStarts: 0
  };
  /** Main-process diagnostics only; never exposed to renderer capabilities. */
  get decoderPid() {
    return this.child?.pid ?? null;
  }
  async subscribe(request, nativeSource = null) {
    if (request.revision <= this.revision) return { accepted: false };
    this.revision = request.revision;
    this.lastHeartbeat = performance.now();
    const previous = this.subscription;
    this.subscription = { ...request };
    if (!request.enabled || request.trackId === null || !request.isPlaying) {
      this.stopDecoder();
      this.stopTimer();
      this.source = null;
      this.emit(request.isPlaying ? "waiting" : "paused");
      return { accepted: true };
    }
    if (previous?.subscriptionId !== request.subscriptionId) this.stopDecoder();
    if (this.failed && previous?.trackId === request.trackId) return { accepted: true };
    if (this.source && this.source.trackId !== request.trackId) {
      this.stopDecoder();
      this.source = null;
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), 1e3 / 30);
    if (nativeSource?.trackId === request.trackId) {
      this.usingNative = true;
      this.syncSource(nativeSource);
      return { accepted: true };
    }
    this.usingNative = false;
    if (this.source?.trackId === request.trackId && this.source.timelineOffset === 0) {
      this.syncSource({ ...this.source, currentTime: request.currentTime, isPlaying: true });
      return { accepted: true };
    }
    const key = `${request.subscriptionId}:${request.trackId}`;
    if (this.resolvingKey === key) return { accepted: true };
    this.resolvingKey = key;
    try {
      const path = await this.options.resolveTrack(request.trackId);
      const current = this.subscription;
      if (!current?.enabled || !current.isPlaying || this.usingNative || `${current.subscriptionId}:${current.trackId}` !== key)
        return { accepted: false };
      this.syncSource({
        trackId: request.trackId,
        path,
        currentTime: current.currentTime,
        isPlaying: true,
        timelineOffset: 0
      });
    } catch (error) {
      if (this.subscription?.enabled && `${this.subscription.subscriptionId}:${this.subscription.trackId}` === key) {
        this.failed = true;
        this.emit("unavailable");
        this.options.warn(error);
      }
    } finally {
      if (this.resolvingKey === key) this.resolvingKey = null;
    }
    return { accepted: true };
  }
  syncNative(source2) {
    if (!this.subscription?.enabled) return;
    if (source2 && source2.trackId === this.subscription.trackId) {
      this.usingNative = true;
      this.syncSource(source2);
    } else if (!source2 && this.usingNative) {
      this.stopDecoder();
      this.source = null;
      this.emit("waiting");
    }
  }
  clock() {
    if (!this.source) return 0;
    return this.source.currentTime + (this.source.isPlaying ? Math.min(0.25, (performance.now() - this.anchorAt) / 1e3) : 0);
  }
  syncSource(next) {
    const previous = this.source;
    const changed = !previous || previous.path !== next.path || previous.trackId !== next.trackId || previous.timelineOffset !== next.timelineOffset;
    const jumped = previous && (next.currentTime < previous.currentTime - 0.02 || Math.abs(next.currentTime - this.clock()) > 0.3);
    if (changed || jumped || !next.isPlaying) this.stopDecoder();
    if (changed || next.currentTime !== previous?.currentTime || next.isPlaying !== previous?.isPlaying) {
      this.source = { ...next };
      this.anchorAt = performance.now();
    }
    if (!next.isPlaying) {
      this.emit("paused");
      return;
    }
    if (!this.decoderAbort && !this.failed && !this.eof) void this.startDecoder();
  }
  async startDecoder() {
    const source2 = this.source;
    if (!source2) return;
    if (this.suspendedPaths.has(normalizeAudioFilePath(source2.path))) return;
    const abort = new AbortController();
    this.decoderAbort = abort;
    const epoch = this.epoch;
    let lease = null;
    try {
      if (this.options.coordinator) {
        lease = (await this.options.coordinator.acquireReadLease(
          source2.path,
          "spectrum-analysis",
          abort.signal
        )).leaseId;
      }
      if (abort.signal.aborted || epoch !== this.epoch) {
        if (lease) this.options.coordinator?.releaseReadLease(lease);
        return;
      }
      this.decodeStart = this.clock();
      this.decodedSamples = 0;
      const child = spawn(
        this.options.ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-threads",
          "1",
          "-ss",
          String(Math.max(0, this.decodeStart - source2.timelineOffset)),
          "-i",
          source2.path,
          "-map",
          "0:a:0",
          "-vn",
          "-sn",
          "-dn",
          "-ac",
          String(SPECTRUM_CHANNELS),
          "-ar",
          String(SPECTRUM_SAMPLE_RATE),
          "-f",
          "f32le",
          "-flush_packets",
          "1",
          "pipe:1"
        ],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
      );
      child.stdin.end();
      this.child = child;
      this.diagnostics.decoderStarts++;
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk.toString("utf8")).slice(-2048);
      });
      const closed = new Promise((resolve2) => {
        child.once("close", (code) => {
          if (lease) this.options.coordinator?.releaseReadLease(lease);
          if (this.child === child && epoch === this.epoch) {
            this.child = null;
            this.eof = code === 0;
            if (code !== 0 && !abort.signal.aborted)
              this.fail(new Error(`Spectrum decoder failed: ${stderr}`));
          }
          resolve2();
        });
      });
      this.closing.add(closed);
      void closed.then(() => this.closing.delete(closed));
      child.on("error", (error) => {
        if (epoch === this.epoch && !abort.signal.aborted) this.fail(error);
      });
      child.stdout.on("data", (chunk) => {
        if (epoch !== this.epoch || abort.signal.aborted) return;
        if (this.carry.length + chunk.length > MAX_CARRY_BYTES) {
          this.fail(new Error("Spectrum buffer limit exceeded"));
          return;
        }
        this.carry = Buffer.concat([this.carry, chunk]);
        this.diagnostics.maxCarryBytes = Math.max(this.diagnostics.maxCarryBytes, this.carry.length);
        this.consume();
      });
    } catch (error) {
      if (lease) this.options.coordinator?.releaseReadLease(lease);
      if (!abort.signal.aborted && epoch === this.epoch) this.fail(error);
    }
  }
  consume() {
    const horizon = this.clock() + HORIZON;
    let offset = 0;
    while (this.carry.length - offset >= SPECTRUM_FFT_SIZE * 4 * SPECTRUM_CHANNELS && this.decodeStart + this.decodedSamples / SPECTRUM_SAMPLE_RATE < horizon) {
      const left = new Float32Array(SPECTRUM_FFT_SIZE);
      const right = new Float32Array(SPECTRUM_FFT_SIZE);
      for (let i = 0; i < left.length; i++) {
        left[i] = this.carry.readFloatLE(offset + i * 8);
        right[i] = this.carry.readFloatLE(offset + i * 8 + 4);
      }
      const started = performance.now();
      const first = this.analyzer.analyze(left);
      const second = this.analyzer.analyze(right);
      const spectrum = {
        bands: first.bands.map((value, index) => Math.max(value, second.bands[index])),
        rms: Math.sqrt((first.rms ** 2 + second.rms ** 2) / 2),
        bass: Math.sqrt((first.bass ** 2 + second.bass ** 2) / 2)
      };
      this.diagnostics.maxAnalysisMs = Math.max(
        this.diagnostics.maxAnalysisMs,
        performance.now() - started
      );
      this.frames.push({
        time: this.decodeStart + (this.decodedSamples + SPECTRUM_FFT_SIZE / 2) / SPECTRUM_SAMPLE_RATE,
        ...spectrum
      });
      this.decodedSamples += SPECTRUM_HOP_SIZE;
      offset += SPECTRUM_HOP_SIZE * 4 * SPECTRUM_CHANNELS;
      this.diagnostics.analyzedFrames++;
    }
    if (offset) this.carry = Buffer.from(this.carry.subarray(offset));
    this.diagnostics.maxBufferedFrames = Math.max(
      this.diagnostics.maxBufferedFrames,
      this.frames.length
    );
    if (this.decodeStart + this.decodedSamples / SPECTRUM_SAMPLE_RATE >= horizon)
      this.child?.stdout.pause();
    else this.child?.stdout.resume();
  }
  tick() {
    if (performance.now() - this.lastHeartbeat > 1500) {
      this.stopDecoder();
      this.stopTimer();
      return;
    }
    if (!this.source?.isPlaying || !this.subscription?.isPlaying) return;
    const time = this.clock();
    while (this.frames.length > 1 && this.frames[1].time <= time) this.frames.shift();
    this.consume();
    const frame = this.frames[0];
    if (!frame || Math.abs(frame.time - time) > 0.15) {
      this.emit(this.failed ? "unavailable" : "waiting");
      return;
    }
    if (frame.time === this.lastFrameTime) return;
    this.lastFrameTime = frame.time;
    this.emit("ready", frame);
  }
  emit(status, frame) {
    const request = this.subscription;
    if (!request) return;
    this.diagnostics.emittedFrames++;
    this.options.emit({
      subscriptionId: request.subscriptionId,
      epoch: this.epoch,
      sequence: ++this.sequence,
      trackId: this.source?.trackId ?? request.trackId,
      currentTime: frame?.time ?? this.source?.currentTime ?? request.currentTime,
      status,
      bands: frame?.bands ?? Array(SPECTRUM_BANDS).fill(0),
      rms: frame?.rms ?? 0,
      bass: frame?.bass ?? 0
    });
  }
  fail(error) {
    this.stopDecoder();
    this.failed = true;
    this.emit("unavailable");
    this.options.warn(error);
  }
  stopDecoder() {
    this.epoch++;
    this.decoderAbort?.abort();
    this.decoderAbort = null;
    const child = this.child;
    this.child = null;
    child?.kill();
    this.frames = [];
    this.carry = Buffer.alloc(0);
    this.eof = false;
    this.failed = false;
    this.lastFrameTime = -1;
  }
  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  async suspendFileReaders(filePath) {
    const path = normalizeAudioFilePath(filePath);
    this.suspendedPaths.set(path, (this.suspendedPaths.get(path) ?? 0) + 1);
    if (this.source && normalizeAudioFilePath(this.source.path) === path) this.stopDecoder();
    await Promise.allSettled([...this.closing]);
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      const count = (this.suspendedPaths.get(path) ?? 1) - 1;
      if (count) this.suspendedPaths.set(path, count);
      else this.suspendedPaths.delete(path);
      if (this.source?.isPlaying && !this.decoderAbort && !this.failed && !this.eof)
        void this.startDecoder();
    };
  }
  async dispose() {
    this.stopDecoder();
    this.stopTimer();
    this.subscription = null;
    this.source = null;
    await Promise.allSettled([...this.closing]);
  }
}
class RendererReadLeaseOwner {
  constructor(coordinator) {
    this.coordinator = coordinator;
  }
  owners = /* @__PURE__ */ new Map();
  disposed = false;
  owner(sender) {
    if (this.disposed || sender.isDestroyed()) throw new Error("Renderer is unavailable");
    const existing = this.owners.get(sender);
    if (existing) return existing;
    const controller = new AbortController();
    const leases = /* @__PURE__ */ new Set();
    const cleanup = () => {
      controller.abort();
      for (const leaseId of leases) this.coordinator.releaseReadLease(leaseId);
      leases.clear();
      this.owners.delete(sender);
      sender.removeListener("destroyed", cleanup);
      sender.removeListener("render-process-gone", cleanup);
      sender.removeListener("did-start-navigation", onNavigation);
    };
    const onNavigation = (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) cleanup();
    };
    const owner = { controller, leases, cleanup };
    this.owners.set(sender, owner);
    sender.on("destroyed", cleanup);
    sender.on("render-process-gone", cleanup);
    sender.on("did-start-navigation", onNavigation);
    return owner;
  }
  async acquire(sender, filePath) {
    const owner = this.owner(sender);
    const lease = await this.coordinator.acquireReadLease(
      filePath,
      `renderer-${sender.id}`,
      owner.controller.signal
    );
    if (owner.controller.signal.aborted || sender.isDestroyed() || this.disposed) {
      this.coordinator.releaseReadLease(lease.leaseId);
      throw new Error("Renderer read request cancelled");
    }
    owner.leases.add(lease.leaseId);
    return { leaseId: lease.leaseId };
  }
  release(sender, leaseId) {
    const owner = this.owners.get(sender);
    if (!owner?.leases.delete(leaseId)) return;
    this.coordinator.releaseReadLease(leaseId);
  }
  dispose() {
    this.disposed = true;
    for (const owner of [...this.owners.values()]) owner.cleanup();
  }
}
function resolveAudioRuntimePaths(environment) {
  const directory = environment.isPackaged ? join(environment.resourcesPath, "audio") : join(environment.appPath, "resources", "audio");
  return {
    mpvPath: join(directory, "mpv.exe"),
    ffmpegPath: join(directory, "ffmpeg.exe")
  };
}
const STABILITY_DELAY_MS = 800;
async function checkFileStability(filePath) {
  try {
    const first = await stat(filePath);
    await new Promise((resolve2) => setTimeout(resolve2, STABILITY_DELAY_MS));
    const second = await stat(filePath);
    const stable = first.size === second.size && first.mtimeMs === second.mtimeMs;
    return {
      stable,
      filePath,
      fileSize: second.size,
      fileMtimeMs: second.mtimeMs
    };
  } catch {
    return {
      stable: false,
      filePath,
      fileSize: 0,
      fileMtimeMs: 0
    };
  }
}
function durationsMatch(candidate, file) {
  return candidate !== null && file !== null && Number.isFinite(candidate) && Number.isFinite(file) && candidate > 0 && file > 0 && Math.abs(candidate - file) <= 1;
}
function findUniqueRelocationCandidate(candidates, identity2) {
  if (candidates.length === 0) return null;
  if (identity2.isrc) {
    const isrcMatches = candidates.filter((c) => c.isrc === identity2.isrc);
    if (isrcMatches.length === 1) {
      const match = isrcMatches[0];
      return durationsMatch(match.durationSeconds, identity2.durationSeconds) ? match : null;
    }
    if (isrcMatches.length > 1) return null;
  }
  const titleMatches = candidates.filter((c) => {
    if (c.isrc) return false;
    if (c.title !== identity2.title) return false;
    if (c.artist !== identity2.artist) return false;
    if (!durationsMatch(c.durationSeconds, identity2.durationSeconds)) return false;
    if (!c.fileSize || !identity2.fileSize) return false;
    if (Math.abs(c.fileSize - identity2.fileSize) / c.fileSize > 0.02) return false;
    const albumMatch = c.album === identity2.album || !c.album || !identity2.album || c.album === "Unknown Album" || identity2.album === "Unknown Album";
    return albumMatch;
  });
  return titleMatches.length === 1 ? titleMatches[0] : null;
}
function findUniqueRelocations(candidates, tracks, canRelocate = () => true) {
  const byIsrc = /* @__PURE__ */ new Map();
  const byTitleAndArtist = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    if (candidate.isrc) {
      const group = byIsrc.get(candidate.isrc) ?? [];
      group.push(candidate);
      byIsrc.set(candidate.isrc, group);
    } else if (candidate.title !== null && candidate.artist !== null) {
      const artists = byTitleAndArtist.get(candidate.title) ?? /* @__PURE__ */ new Map();
      const group = artists.get(candidate.artist) ?? [];
      group.push(candidate);
      artists.set(candidate.artist, group);
      byTitleAndArtist.set(candidate.title, artists);
    }
  }
  const matches = /* @__PURE__ */ new Map();
  const claims = /* @__PURE__ */ new Map();
  for (const track of tracks) {
    const isrcGroup = track.isrc ? byIsrc.get(track.isrc) : void 0;
    if (isrcGroup && isrcGroup.length !== 1) continue;
    const group = isrcGroup ?? byTitleAndArtist.get(track.title)?.get(track.artist) ?? [];
    const match = findUniqueRelocationCandidate(group, track);
    if (!match || !canRelocate(match, track)) continue;
    matches.set(track.filePath, match);
    claims.set(match.trackId, (claims.get(match.trackId) ?? 0) + 1);
  }
  for (const [filePath, match] of matches) {
    if (claims.get(match.trackId) !== 1) matches.delete(filePath);
  }
  return matches;
}
const MAX_STABILITY_RETRIES = 5;
const IMPORT_BATCH_SIZE = 32;
function hasSameFingerprint(before, after) {
  return before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs && before.dev === after.dev && before.ino === after.ino;
}
class LibraryIncrementalImportService {
  constructor(trackRepository, artworkCacheDir, onChanged) {
    this.trackRepository = trackRepository;
    this.artworkCacheDir = artworkCacheDir;
    this.onChanged = onChanged;
  }
  activeImports = 0;
  /** True while an import pass is in flight (used to gate cache GC). */
  isImportActive() {
    return this.activeImports > 0;
  }
  async importFiles(filePaths) {
    this.activeImports += 1;
    try {
      return await this.doImport(filePaths);
    } finally {
      this.activeImports -= 1;
    }
  }
  async doImport(filePaths) {
    const result = { imported: [], unstable: [], failed: [] };
    const uniquePaths = [...new Set(filePaths)];
    const parsedTracks = [];
    const fingerprints = /* @__PURE__ */ new Map();
    const recordFailure = (filePath, error) => {
      const reason = error instanceof Error ? error.message : "Unable to import audio file";
      result.failed.push({ filePath, reason });
      logger.warn({ filePath, reason }, "Incremental import failed for file");
    };
    for (let offset = 0; offset < uniquePaths.length; offset += IMPORT_BATCH_SIZE) {
      const batch = uniquePaths.slice(offset, offset + IMPORT_BATCH_SIZE);
      const stable = await Promise.all(batch.map((filePath) => this.waitForStability(filePath)));
      for (const [index, filePath] of batch.entries()) {
        if (!stable[index]) {
          result.unstable.push(filePath);
          continue;
        }
        try {
          const parsed = await this.parseAndNormalize(filePath);
          if (!parsed) {
            result.unstable.push(filePath);
            continue;
          }
          parsedTracks.push(parsed.track);
          fingerprints.set(filePath, parsed.fingerprint);
        } catch (error) {
          recordFailure(filePath, error);
        }
      }
    }
    const candidates = /* @__PURE__ */ new Map();
    for (const track of parsedTracks) {
      for (const candidate of this.trackRepository.findRelocationCandidatesByIdentity(
        track,
        true
      )) {
        candidates.set(candidate.trackId, candidate);
      }
    }
    const absentCandidates = [];
    const pathAliasIds = /* @__PURE__ */ new Set();
    const incomingPaths = new Set(
      parsedTracks.map((track) => win32.normalize(track.filePath).toLowerCase())
    );
    for (const candidate of candidates.values()) {
      if (incomingPaths.has(win32.normalize(candidate.filePath).toLowerCase())) {
        absentCandidates.push(candidate);
        pathAliasIds.add(candidate.trackId);
        continue;
      }
      try {
        await stat(candidate.filePath);
      } catch (error) {
        const code = error.code;
        if (code === "ENOENT" || code === "ENOTDIR") absentCandidates.push(candidate);
      }
    }
    const matches = findUniqueRelocations(
      absentCandidates,
      parsedTracks,
      (candidate, track) => !pathAliasIds.has(candidate.trackId) || win32.normalize(candidate.filePath).toLowerCase() === win32.normalize(track.filePath).toLowerCase()
    );
    for (let offset = 0; offset < parsedTracks.length; offset += IMPORT_BATCH_SIZE) {
      const additions = [];
      const relocatedIds = [];
      const relocatedPaths = [];
      for (const track of parsedTracks.slice(offset, offset + IMPORT_BATCH_SIZE)) {
        if (!this.isCurrentFile(
          track.filePath,
          fingerprints.get(track.filePath),
          track.directoryArtworkFingerprint
        )) {
          result.unstable.push(track.filePath);
          continue;
        }
        try {
          const match = matches.get(track.filePath);
          if (match && this.canRelocateFrom(match.filePath, track.filePath) && this.trackRepository.relocateTrack(match.trackId, track, match.filePath)) {
            result.imported.push(track.filePath);
            relocatedIds.push(match.trackId);
            relocatedPaths.push(track.filePath);
          } else additions.push(track);
        } catch (error) {
          recordFailure(track.filePath, error);
        }
      }
      if (relocatedIds.length) {
        this.onChanged({
          reason: "track-relocated",
          trackIds: relocatedIds,
          filePaths: relocatedPaths
        });
      }
      if (additions.length) {
        const currentAdditions = additions.filter((track) => {
          if (this.isCurrentFile(
            track.filePath,
            fingerprints.get(track.filePath),
            track.directoryArtworkFingerprint
          ))
            return true;
          result.unstable.push(track.filePath);
          return false;
        });
        if (!currentAdditions.length) continue;
        try {
          this.trackRepository.upsertMany(currentAdditions);
        } catch (error) {
          for (const track of currentAdditions) recordFailure(track.filePath, error);
          continue;
        }
        const addedPaths = currentAdditions.map((track) => track.filePath);
        result.imported.push(...addedPaths);
        this.onChanged({
          reason: "track-added",
          trackIds: [],
          filePaths: addedPaths
        });
      }
    }
    return result;
  }
  isCurrentFile(filePath, fingerprint, directoryArtworkFingerprint) {
    try {
      return hasSameFingerprint(fingerprint, statSync(filePath)) && (directoryArtworkFingerprint === void 0 || directoryArtworkFingerprint === getDirectoryArtworkFingerprintSync(filePath));
    } catch {
      return false;
    }
  }
  canRelocateFrom(oldPath, newPath) {
    if (win32.normalize(oldPath).toLowerCase() === win32.normalize(newPath).toLowerCase())
      return true;
    try {
      statSync(oldPath);
      return false;
    } catch (error) {
      const code = error.code;
      return code === "ENOENT" || code === "ENOTDIR";
    }
  }
  async waitForStability(filePath) {
    for (let attempt = 0; attempt < MAX_STABILITY_RETRIES; attempt++) {
      const result = await checkFileStability(filePath);
      if (result.stable) {
        return true;
      }
      if (result.fileSize === 0) {
        return false;
      }
    }
    return false;
  }
  async parseAndNormalize(filePath) {
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      return null;
    }
    try {
      const metadata = await parseAudioMetadata(filePath, { duration: true });
      const normalized = normalizeMetadata(metadata, filePath);
      const lyrics = await resolveLyricsForFile(filePath, metadata);
      const artwork = await readArtworkForFile(filePath, metadata, this.artworkCacheDir);
      try {
        if (!hasSameFingerprint(fileStat, await stat(filePath))) return null;
      } catch {
        return null;
      }
      const identity2 = normalizeIdentityText(metadata);
      const metadataSignature = buildMetadataSignature(
        identity2,
        normalized.durationSeconds,
        fileStat.size
      );
      return {
        track: {
          filePath,
          fileTags: normalized.fileTags,
          ...artwork,
          fileFingerprint: scanFileFingerprint(fileStat),
          metadataParserVersion: getMetadataParserVersion(filePath),
          fileSize: fileStat.size,
          fileMtimeMs: fileStat.mtimeMs,
          title: normalized.title,
          artist: normalized.artist,
          album: normalized.album,
          albumArtist: normalized.albumArtist,
          trackNo: normalized.trackNo,
          discNo: normalized.discNo,
          durationSeconds: normalized.durationSeconds,
          bitrateBps: normalized.bitrateBps,
          codec: normalized.codec,
          year: normalized.year,
          releaseDate: normalized.releaseDate,
          copyright: normalized.copyright,
          composer: normalized.composer,
          genre: normalized.genre,
          artworkCacheKey: artwork.artworkCacheKey,
          lyricsText: lyrics?.text ?? null,
          lyricsFormat: lyrics?.format ?? null,
          isrc: identity2.isrc,
          metadataSignature
        },
        fingerprint: fileStat
      };
    } catch (error) {
      if (!this.isCurrentFile(filePath, fileStat)) return null;
      throw error;
    }
  }
}
async function selectLibraryDirectory() {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(window, {
    properties: ["openDirectory"],
    title: getNativeUiMessages().selectFolder
  });
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
}
function createLibraryScanEvents(send) {
  return {
    progress: (progress) => send(ipcChannels.library.scanProgress, progress),
    changed: (event) => send(ipcChannels.library.changed, event)
  };
}
function toLibraryRoot(row) {
  return {
    id: row.id,
    path: row.path,
    createdAt: row.created_at,
    lastScannedAt: row.last_scanned_at
  };
}
class LibraryRootRepository extends BaseRepository {
  upsertByPath(path) {
    this.db.prepare(
      `
          INSERT INTO library_roots (path)
          VALUES (?)
          ON CONFLICT(path) DO NOTHING
        `
    ).run(path);
    return this.getByPath(path);
  }
  getById(id) {
    const row = this.db.prepare("SELECT id, path, created_at, last_scanned_at FROM library_roots WHERE id = ?").get(id);
    return row ? toLibraryRoot(row) : null;
  }
  getByPath(path) {
    const row = this.db.prepare("SELECT id, path, created_at, last_scanned_at FROM library_roots WHERE path = ?").get(path);
    if (!row) {
      throw new Error(`Library root was not created: ${path}`);
    }
    return toLibraryRoot(row);
  }
  list() {
    const rows = this.db.prepare("SELECT id, path, created_at, last_scanned_at FROM library_roots ORDER BY id DESC").all();
    return rows.map(toLibraryRoot);
  }
  markScanned(rootId) {
    this.db.prepare("UPDATE library_roots SET last_scanned_at = CURRENT_TIMESTAMP WHERE id = ?").run(rootId);
  }
  deleteById(id) {
    const deleteFailures = this.db.prepare(`
      DELETE FROM scan_failures
      WHERE job_id IN (SELECT id FROM scan_jobs WHERE root_id = ?)
    `);
    const deleteJobs = this.db.prepare("DELETE FROM scan_jobs WHERE root_id = ?");
    const deleteRoot = this.db.prepare("DELETE FROM library_roots WHERE id = ?");
    const remove = this.db.transaction(() => {
      deleteFailures.run(id);
      deleteJobs.run(id);
      return deleteRoot.run(id).changes > 0;
    });
    return remove();
  }
}
function toScanStatus(row) {
  return {
    jobId: row.id,
    rootId: row.root_id,
    status: row.status,
    totalFiles: row.total_files,
    scannedFiles: row.scanned_files,
    failedFiles: row.failed_files,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message
  };
}
class ScanJobRepository extends BaseRepository {
  create(rootId) {
    const result = this.db.prepare("INSERT INTO scan_jobs (root_id, status) VALUES (?, ?)").run(rootId, "scanning");
    return this.getById(Number(result.lastInsertRowid));
  }
  getById(jobId) {
    const row = this.db.prepare("SELECT * FROM scan_jobs WHERE id = ?").get(jobId);
    return row ? toScanStatus(row) : null;
  }
  getLatest() {
    const row = this.db.prepare("SELECT * FROM scan_jobs ORDER BY id DESC LIMIT 1").get();
    return row ? toScanStatus(row) : null;
  }
  getActive() {
    const row = this.db.prepare("SELECT * FROM scan_jobs WHERE status = 'scanning' ORDER BY id DESC LIMIT 1").get();
    return row ? toScanStatus(row) : null;
  }
  markInterruptedJobs() {
    this.db.prepare(
      `
          UPDATE scan_jobs
          SET status = 'failed',
              finished_at = CURRENT_TIMESTAMP,
              error_message = 'Scan was interrupted before completion'
          WHERE status = 'scanning'
        `
    ).run();
  }
  updateProgress(jobId, totalFiles, scannedFiles, failedFiles) {
    const result = this.db.prepare(
      `
          UPDATE scan_jobs
          SET total_files = ?,
              scanned_files = ?,
              failed_files = ?
          WHERE id = ?
            AND status = 'scanning'
        `
    ).run(totalFiles, scannedFiles, failedFiles, jobId);
    return result.changes > 0;
  }
  finish(jobId, status) {
    const result = this.db.prepare(
      `
          UPDATE scan_jobs
          SET status = ?,
              finished_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND status = 'scanning'
        `
    ).run(status, jobId);
    return result.changes > 0;
  }
  fail(jobId, message) {
    const result = this.db.prepare(
      `
          UPDATE scan_jobs
          SET status = 'failed',
              finished_at = CURRENT_TIMESTAMP,
              error_message = ?
          WHERE id = ?
            AND status = 'scanning'
        `
    ).run(message, jobId);
    return result.changes > 0;
  }
}
function captureArtworkAlbum(db, trackId) {
  const row = db.prepare(
    `SELECT COALESCE(NULLIF(album,''),'Unknown Album') AS album,
    COALESCE(NULLIF(album_artist,''),NULLIF(artist,''),'Unknown Artist') AS artist
    FROM library_track_display WHERE id=?`
  ).get(trackId);
  return row;
}
function refreshArtworkAlbum(db, identity2) {
  const members = `FROM tracks t
    WHERE t.effective_album_title=?
      AND t.effective_album_artist=?
      AND t.availability='available'`;
  const candidate = db.prepare(
    `SELECT COALESCE(t.embedded_artwork_cache_key,t.directory_artwork_cache_key) AS key ${members}
    AND COALESCE(t.embedded_artwork_cache_key,t.directory_artwork_cache_key) IS NOT NULL
    ORDER BY COALESCE(t.disc_no,1), t.track_no IS NULL, t.track_no, t.id LIMIT 1`
  ).get(identity2.album, identity2.artist);
  if (candidate) {
    db.prepare(
      `INSERT INTO albums(title,artist,artwork_cache_key) VALUES(?,?,?)
      ON CONFLICT(title,artist) DO UPDATE SET artwork_cache_key=excluded.artwork_cache_key`
    ).run(identity2.album, identity2.artist, candidate.key);
  } else {
    if (!db.prepare(`SELECT 1 ${members} LIMIT 1`).get(identity2.album, identity2.artist)) return;
    const pending = db.prepare(`SELECT 1 ${members} AND t.embedded_artwork_checked_fingerprint IS NULL LIMIT 1`).get(identity2.album, identity2.artist);
    if (!pending)
      db.prepare(`UPDATE albums SET artwork_cache_key=NULL WHERE title=? AND artist=?`).run(
        identity2.album,
        identity2.artist
      );
  }
}
function commitArtworkProjection(db, trackId, state, previous) {
  const read = state.artworkRead;
  if (read?.status === "present" || read?.status === "absent") {
    const fingerprint = encodeScanFileFingerprint(state.fileFingerprint);
    if (fingerprint) {
      db.prepare(
        `UPDATE tracks SET embedded_artwork_cache_key=?,directory_artwork_cache_key=?,
        embedded_artwork_checked_fingerprint=?,directory_artwork_checked_fingerprint=? WHERE id=?`
      ).run(
        read.status === "present" ? read.cacheKey : null,
        state.directoryArtworkCacheKey ?? null,
        fingerprint,
        state.directoryArtworkFingerprint ?? null,
        trackId
      );
      db.prepare(`UPDATE track_metadata SET artwork_cache_key=NULL WHERE track_id=?`).run(trackId);
    }
  } else if (read?.status === "error") {
    db.prepare(`UPDATE tracks SET embedded_artwork_checked_fingerprint=NULL WHERE id=?`).run(
      trackId
    );
  }
  const current = captureArtworkAlbum(db, trackId);
  if (current)
    db.prepare(`UPDATE tracks SET effective_album_title=?,effective_album_artist=? WHERE id=?`).run(
      current.album,
      current.artist,
      trackId
    );
  if (previous && (!current || previous.album !== current.album || previous.artist !== current.artist))
    refreshArtworkAlbum(db, previous);
  if (current) refreshArtworkAlbum(db, current);
}
function replaceMetadataTrackArtists(trackId, names, role, upsertArtist, getArtistId, deleteTrackArtists, insertTrackArtist) {
  deleteTrackArtists.run(trackId, role);
  const seen = /* @__PURE__ */ new Set();
  let position = 0;
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    upsertArtist.run(name);
    const artist = getArtistId.get(name);
    if (!artist) {
      continue;
    }
    insertTrackArtist.run(trackId, artist.id, position, role);
    position += 1;
  }
}
function prepareFileMetadataProjection(db) {
  const raw = db.prepare(`UPDATE tracks SET title=?, artist=?, album=?, album_artist=?,
    genre=?, year=?, release_date=?, title_fallback=? WHERE id=?`);
  const existing = db.prepare(`SELECT title,artist_display AS artistDisplay,album_title AS albumTitle,
    album_artist_display AS albumArtistDisplay,genre_display AS genreDisplay,year,
    release_date AS releaseDate,override_mask AS mask FROM track_metadata
    WHERE track_id=? AND source='legacy_user_edit'`);
  const release = db.prepare(
    `UPDATE track_metadata SET source='file_tag',override_mask=0 WHERE track_id=?`
  );
  const sync = db.prepare(`UPDATE track_metadata SET
    (title,artist_display,album_title,album_artist_display,genre_display,year,release_date)=
      (SELECT title,artist,album,album_artist,genre,year,release_date FROM tracks WHERE id=track_metadata.track_id)
    WHERE track_id=? AND source='file_tag' AND override_mask=0`);
  const effective = db.prepare(
    `SELECT artist,album_artist AS albumArtist FROM library_track_display WHERE id=?`
  );
  const upsertArtist = db.prepare(
    `INSERT INTO artists(name) VALUES(?) ON CONFLICT(name) DO NOTHING`
  );
  const artistId = db.prepare(`SELECT id FROM artists WHERE name=?`);
  const remove = db.prepare(
    `DELETE FROM track_artists WHERE track_id=? AND role=?`
  );
  const insert = db.prepare(
    `INSERT OR IGNORE INTO track_artists(track_id,artist_id,position,role) VALUES(?,?,?,?)`
  );
  return (trackId, filePath, tags, state = {}, previous) => {
    if (tags) {
      raw.run(
        tags.title,
        tags.artistDisplay,
        tags.albumTitle,
        tags.albumArtistDisplay,
        tags.genreDisplay,
        tags.year,
        tags.releaseDate,
        parse(filePath).name,
        trackId
      );
      const legacy = existing.get(trackId);
      if (legacy && Object.keys(tags).every((key) => {
        const left = legacy[key], right = tags[key];
        return ["artistDisplay", "albumArtistDisplay", "genreDisplay"].includes(key) ? canonicalizeDelimitedValues(left) === canonicalizeDelimitedValues(right) : left === right;
      }))
        release.run(trackId);
    }
    sync.run(trackId);
    const row = effective.get(trackId);
    if (!row) return;
    replaceMetadataTrackArtists(
      trackId,
      splitDelimitedValues(row.artist),
      "primary",
      upsertArtist,
      artistId,
      remove,
      insert
    );
    replaceMetadataTrackArtists(
      trackId,
      splitDelimitedValues(row.albumArtist),
      "album_artist",
      upsertArtist,
      artistId,
      remove,
      insert
    );
    commitArtworkProjection(db, trackId, state, previous);
  };
}
function prepareScannedMetadataDisplayUpdate(db) {
  const project = prepareFileMetadataProjection(db);
  const trackId = db.prepare("SELECT id FROM tracks WHERE file_path=?");
  const update = db.prepare(`
    UPDATE track_metadata
    SET title = ?, artist_display = ?, album_title = ?, album_artist_display = ?,
        genre_display = ?, year = ?, release_date = ?, lyrics_text = ?, lyrics_format = ?,
        refreshed_at = CURRENT_TIMESTAMP
    WHERE track_id = (SELECT id FROM tracks WHERE file_path = ?) AND source = 'file_tag'
  `);
  return (track, previous) => {
    update.run(
      track.title,
      track.artist,
      track.album,
      track.albumArtist,
      track.genre,
      track.year,
      track.releaseDate,
      track.lyricsText,
      track.lyricsFormat,
      track.filePath
    );
    const row = trackId.get(track.filePath);
    if (row) project(row.id, track.filePath, track.fileTags, track, previous);
  };
}
function prepareScannedTagDisplayUpdate(db) {
  const project = prepareFileMetadataProjection(db);
  const trackId = db.prepare("SELECT id FROM tracks WHERE file_path=?");
  const update = db.prepare(`
    UPDATE track_metadata
    SET title = ?, artist_display = ?, album_title = ?, album_artist_display = ?,
        genre_display = ?, year = ?, release_date = ?, refreshed_at = CURRENT_TIMESTAMP
    WHERE track_id = (SELECT id FROM tracks WHERE file_path = ?) AND source = 'file_tag'
  `);
  return (patch, previous) => {
    update.run(
      patch.title,
      patch.artist,
      patch.album,
      patch.albumArtist,
      patch.genre,
      patch.year,
      patch.releaseDate,
      patch.filePath
    );
    const row = trackId.get(patch.filePath);
    if (row) project(row.id, patch.filePath, patch.fileTags, patch, previous);
  };
}
class TrackScanWriter extends BaseRepository {
  upsertMany(tracks) {
    if (tracks.length === 0) {
      return;
    }
    const upsertTrack = this.db.prepare(`
      INSERT INTO tracks (
        id,
        file_path,
        file_size,
        file_mtime_ms,
        title,
        artist,
        album,
        album_artist,
        track_no,
        disc_no,
        duration_seconds,
        bitrate_bps,
        codec,
        year,
        release_date,
        copyright,
        composer,
        genre,
        lyrics_text,
        lyrics_format,
        lyrics_checked_mtime_ms,
        lyrics_sidecar_fingerprint,
        metadata_checked_mtime_ms,
        metadata_parser_version,
        isrc,
        metadata_signature,
        availability,
        missing_since,
        updated_at
      )
      VALUES (MAX(COALESCE((SELECT MAX(id) FROM tracks),0),COALESCE((SELECT MAX(id) FROM removed_track_history),0))+1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(file_path) DO UPDATE SET
        file_size = excluded.file_size,
        file_mtime_ms = excluded.file_mtime_ms,
        title = excluded.title,
        artist = excluded.artist,
        album = excluded.album,
        album_artist = excluded.album_artist,
        track_no = excluded.track_no,
        disc_no = excluded.disc_no,
        duration_seconds = excluded.duration_seconds,
        bitrate_bps = excluded.bitrate_bps,
        codec = excluded.codec,
        year = excluded.year,
        release_date = excluded.release_date,
        copyright = excluded.copyright,
        composer = excluded.composer,
        genre = excluded.genre,
        lyrics_text = excluded.lyrics_text,
        lyrics_format = excluded.lyrics_format,
        lyrics_checked_mtime_ms = excluded.lyrics_checked_mtime_ms,
        lyrics_sidecar_fingerprint = excluded.lyrics_sidecar_fingerprint,
        metadata_checked_mtime_ms = excluded.metadata_checked_mtime_ms,
        metadata_parser_version = excluded.metadata_parser_version,
        isrc = excluded.isrc,
        metadata_signature = excluded.metadata_signature,
        availability = 'available',
        missing_since = NULL,
        updated_at = CURRENT_TIMESTAMP
    `);
    const syncFileMetadata = prepareScannedMetadataDisplayUpdate(this.db);
    const updateFingerprint = this.db.prepare(
      "UPDATE tracks SET file_stat_fingerprint = ? WHERE file_path = ?"
    );
    const upsertAlbum = this.db.prepare(`
      INSERT INTO albums (title, artist, artwork_cache_key)
      VALUES (?, ?, ?)
      ON CONFLICT(title, artist) DO UPDATE SET
        artwork_cache_key = excluded.artwork_cache_key
        WHERE excluded.artwork_cache_key LIKE 'v2-%.webp'
          AND (
            albums.artwork_cache_key IS NULL
            OR albums.artwork_cache_key NOT LIKE 'v2-%.webp'
          )
    `);
    const upsertBatch = this.db.transaction((items) => {
      for (const track of items) {
        const oldId = this.db.prepare("SELECT id FROM tracks WHERE file_path=?").pluck().get(track.filePath);
        const previous = oldId ? captureArtworkAlbum(this.db, oldId) : void 0;
        upsertTrack.run(
          track.filePath,
          track.fileSize,
          track.fileMtimeMs,
          track.title,
          track.artist,
          track.album,
          track.albumArtist,
          track.trackNo,
          track.discNo,
          track.durationSeconds,
          track.bitrateBps,
          track.codec ?? null,
          track.year,
          track.releaseDate,
          track.copyright,
          track.composer,
          track.genre,
          track.lyricsText,
          track.lyricsFormat,
          track.fileMtimeMs,
          track.lyricsSidecarFingerprint ?? null,
          track.fileMtimeMs,
          track.metadataParserVersion ?? "",
          track.isrc,
          track.metadataSignature
        );
        updateFingerprint.run(encodeScanFileFingerprint(track.fileFingerprint), track.filePath);
        upsertAlbum.run(track.album, track.albumArtist || track.artist, track.artworkCacheKey);
        syncFileMetadata(track, previous);
      }
    });
    for (let index = 0; index < tracks.length; index += 300) {
      upsertBatch(tracks.slice(index, index + 300));
    }
  }
  patchAlbumArtwork(items) {
    if (items.length === 0) {
      return;
    }
    const upsert = this.db.prepare(`
      INSERT INTO albums (title, artist, artwork_cache_key)
      VALUES (?, ?, ?)
      ON CONFLICT(title, artist) DO UPDATE SET
        artwork_cache_key = excluded.artwork_cache_key
        WHERE excluded.artwork_cache_key LIKE 'v2-%.webp'
          AND (
            albums.artwork_cache_key IS NULL
            OR albums.artwork_cache_key NOT LIKE 'v2-%.webp'
          )
    `);
    const batch = this.db.transaction((patches) => {
      for (const patch of patches) {
        if (patch.filePath && patch.artworkRead) {
          const id = this.db.prepare("SELECT id FROM tracks WHERE file_path=?").pluck().get(patch.filePath);
          if (id) commitArtworkProjection(this.db, id, patch);
          continue;
        }
        upsert.run(patch.album, patch.artist, patch.artworkCacheKey);
      }
    });
    for (let index = 0; index < items.length; index += 300) {
      batch(items.slice(index, index + 300));
    }
  }
  patchLyrics(items) {
    if (items.length === 0) {
      return;
    }
    const update = this.db.prepare(`
      UPDATE tracks
      SET lyrics_text = ?,
          lyrics_format = ?,
          lyrics_checked_mtime_ms = ?,
          lyrics_sidecar_fingerprint = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE file_path = ?
    `);
    const updateDisplay = this.db.prepare(`
      UPDATE track_metadata SET lyrics_text = ?, lyrics_format = ?, refreshed_at = CURRENT_TIMESTAMP
      WHERE track_id = (SELECT id FROM tracks WHERE file_path = ?)
    `);
    const batch = this.db.transaction((patches) => {
      for (const patch of patches) {
        update.run(
          patch.lyricsText,
          patch.lyricsFormat,
          patch.lyricsCheckedMtimeMs,
          patch.lyricsSidecarFingerprint ?? null,
          patch.filePath
        );
        updateDisplay.run(patch.lyricsText, patch.lyricsFormat, patch.filePath);
      }
    });
    for (let index = 0; index < items.length; index += 300) {
      batch(items.slice(index, index + 300));
    }
  }
  /** Update text tags and the parser fingerprint without rewriting duration, bitrate, codec or lyrics. */
  patchTrackTags(items) {
    if (items.length === 0) return;
    const update = this.db.prepare(`
      UPDATE tracks
      SET title = ?,
          artist = ?,
          album = ?,
          album_artist = ?,
          track_no = ?,
          disc_no = ?,
          year = ?,
          release_date = ?,
          copyright = ?,
          composer = ?,
          genre = ?,
          isrc = ?,
          metadata_signature = ?,
          metadata_checked_mtime_ms = ?,
          metadata_parser_version = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE file_path = ?
    `);
    const syncFileMetadata = prepareScannedTagDisplayUpdate(this.db);
    const updateFingerprint = this.db.prepare(
      "UPDATE tracks SET file_stat_fingerprint = ? WHERE file_path = ?"
    );
    const upsertAlbum = this.db.prepare(`
      INSERT INTO albums (title, artist, artwork_cache_key)
      VALUES (?, ?, ?)
      ON CONFLICT(title, artist) DO UPDATE SET
        artwork_cache_key = excluded.artwork_cache_key
        WHERE excluded.artwork_cache_key LIKE 'v2-%.webp'
          AND (
            albums.artwork_cache_key IS NULL
            OR albums.artwork_cache_key NOT LIKE 'v2-%.webp'
          )
    `);
    const batch = this.db.transaction((patches) => {
      for (const patch of patches) {
        const oldId = this.db.prepare("SELECT id FROM tracks WHERE file_path=?").pluck().get(patch.filePath);
        const previous = oldId ? captureArtworkAlbum(this.db, oldId) : void 0;
        update.run(
          patch.title,
          patch.artist,
          patch.album,
          patch.albumArtist,
          patch.trackNo,
          patch.discNo,
          patch.year,
          patch.releaseDate,
          patch.copyright,
          patch.composer,
          patch.genre,
          patch.isrc,
          patch.metadataSignature,
          patch.fileMtimeMs,
          patch.metadataParserVersion ?? "",
          patch.filePath
        );
        updateFingerprint.run(encodeScanFileFingerprint(patch.fileFingerprint), patch.filePath);
        if (isCurrentArtworkCacheKey(patch.artworkCacheKey)) {
          upsertAlbum.run(patch.album, patch.albumArtist || patch.artist, patch.artworkCacheKey);
        }
        syncFileMetadata(patch, previous);
      }
    });
    for (let index = 0; index < items.length; index += 300) {
      batch(items.slice(index, index + 300));
    }
  }
}
class TrackAvailabilityRepository extends BaseRepository {
  markMissingByFilePaths(filePaths) {
    return this.db.transaction(() => this.markMissingPaths(filePaths))();
  }
  markMissingPaths(filePaths) {
    if (filePaths.length === 0) return [];
    const markedIds = [];
    for (let index = 0; index < filePaths.length; index += 400) {
      const batch = filePaths.slice(index, index + 400);
      const placeholders = batch.map(() => "?").join(", ");
      const rows = this.db.prepare(
        `UPDATE tracks
           SET availability = 'missing',
               missing_since = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE file_path IN (${placeholders})
             AND availability = 'available'
           RETURNING id`
      ).all(...batch);
      markedIds.push(...rows.map((row) => row.id));
    }
    this.refreshArtwork(markedIds);
    return markedIds;
  }
  markAvailableByFilePaths(filePaths) {
    return this.db.transaction(() => this.restorePaths(filePaths))();
  }
  restorePaths(filePaths) {
    if (filePaths.length === 0) return [];
    const restoredIds = [];
    for (let index = 0; index < filePaths.length; index += 400) {
      const batch = filePaths.slice(index, index + 400);
      const placeholders = batch.map(() => "?").join(", ");
      const rows = this.db.prepare(
        `UPDATE tracks
           SET availability = 'available',
               missing_since = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE file_path IN (${placeholders})
             AND availability = 'missing'
           RETURNING id`
      ).all(...batch);
      restoredIds.push(...rows.map((row) => row.id));
    }
    this.refreshArtwork(restoredIds);
    return restoredIds;
  }
  getMissingCandidates() {
    return this.db.prepare(
      `SELECT id AS trackId,
                file_path AS filePath,
                title,
                artist,
                album,
                duration_seconds AS durationSeconds,
                file_size AS fileSize,
                isrc,
                metadata_signature AS metadataSignature,
                missing_since AS missingSince
         FROM tracks
         WHERE availability = 'missing'
         ORDER BY missing_since ASC`
    ).all();
  }
  findRelocationCandidatesByIdentity(identity2, includeAvailable = false) {
    const selectCandidates = `
      SELECT id AS trackId,
             file_path AS filePath,
             title,
             artist,
             album,
             duration_seconds AS durationSeconds,
             file_size AS fileSize,
             isrc,
             metadata_signature AS metadataSignature,
             missing_since AS missingSince
      FROM tracks
      WHERE availability IN (${includeAvailable ? "'missing', 'available'" : "'missing'"})
    `;
    if (identity2.isrc) {
      const byIsrc = this.db.prepare(`${selectCandidates} AND isrc = ?`).all(identity2.isrc);
      if (byIsrc.length > 0) {
        return byIsrc;
      }
    }
    return this.db.prepare(
      `${selectCandidates}
           AND isrc IS NULL
           AND title = ?
           AND artist = ?`
    ).all(identity2.title, identity2.artist);
  }
  markMissingUnderRootExcept(rootPath, foundFilePaths, unreadableDirectoryPaths = []) {
    return this.db.transaction(
      () => this.markMissingUnderRoot(rootPath, foundFilePaths, unreadableDirectoryPaths)
    )();
  }
  markMissingUnderRoot(rootPath, foundFilePaths, unreadableDirectoryPaths) {
    const rootPrefixes = toRootPrefixes(rootPath);
    const rootPredicates = rootPrefixes.map(() => `file_path LIKE ? ESCAPE '~'`).join(" OR ");
    const rootPatternArgs = rootPrefixes.map((prefix) => `${escapeLikePattern(prefix)}%`);
    const unreadablePrefixes = unreadableDirectoryPaths.flatMap(toRootPrefixes);
    const unreadablePredicate = unreadablePrefixes.length > 0 ? `AND NOT (${unreadablePrefixes.map(() => `file_path LIKE ? ESCAPE '~'`).join(" OR ")})` : "";
    const unreadablePatternArgs = unreadablePrefixes.map(
      (prefix) => `${escapeLikePattern(prefix)}%`
    );
    if (foundFilePaths.length === 0) {
      const rows = this.db.prepare(
        `UPDATE tracks
           SET availability = 'missing',
               missing_since = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
            WHERE (${rootPredicates})
              AND availability = 'available'
              ${unreadablePredicate}
            RETURNING id`
      ).all(...rootPatternArgs, ...unreadablePatternArgs);
      const ids = rows.map((row) => row.id);
      this.refreshArtwork(ids);
      return ids;
    }
    try {
      this.db.exec(
        `CREATE TEMP TABLE IF NOT EXISTS _temp_found_paths (
          file_path TEXT PRIMARY KEY
        )`
      );
      this.db.exec("DELETE FROM _temp_found_paths");
      const insertTemp = this.db.prepare(
        "INSERT OR IGNORE INTO _temp_found_paths (file_path) VALUES (?)"
      );
      const insertBatch = this.db.transaction((paths) => {
        for (const path of paths) {
          for (const pathVariant of toPathVariants(path)) {
            insertTemp.run(pathVariant);
          }
        }
      });
      for (let index = 0; index < foundFilePaths.length; index += 300) {
        insertBatch(foundFilePaths.slice(index, index + 300));
      }
      const rows = this.db.prepare(
        `UPDATE tracks
           SET availability = 'missing',
               missing_since = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
            WHERE (${rootPredicates})
              AND availability = 'available'
              AND file_path NOT IN (SELECT file_path FROM _temp_found_paths)
              ${unreadablePredicate}
            RETURNING id`
      ).all(...rootPatternArgs, ...unreadablePatternArgs);
      const ids = rows.map((row) => row.id);
      this.refreshArtwork(ids);
      return ids;
    } finally {
      this.db.exec("DROP TABLE IF EXISTS _temp_found_paths");
    }
  }
  /**
   * Relocate a record whose old file was confirmed absent (or a Windows path alias).
   * The expected old path prevents a stale match from taking over an already moved record.
   * Returns false when the target path is already occupied by another track
   * (or a UNIQUE constraint race loses), so callers can fall back to upsert.
   */
  relocateTrack(trackId, scannedTrack, expectedOldPath) {
    const occupant = this.db.prepare(`SELECT id FROM tracks WHERE file_path = ? AND id != ?`).get(scannedTrack.filePath, trackId);
    if (occupant) {
      return false;
    }
    try {
      return this.db.transaction(() => {
        const previous = captureArtworkAlbum(this.db, trackId);
        const result = this.db.prepare(
          `UPDATE tracks
           SET file_path = ?,
               file_size = ?,
               file_mtime_ms = ?,
               title = ?,
               artist = ?,
               album = ?,
               album_artist = ?,
               track_no = ?,
               disc_no = ?,
               duration_seconds = ?,
               bitrate_bps = ?,
               codec = ?,
               year = ?,
               release_date = ?,
               copyright = ?,
               composer = ?,
               genre = ?,
               lyrics_text = ?,
               lyrics_format = ?,
               isrc = ?,
               metadata_signature = ?,
               availability = 'available',
               missing_since = NULL,
               lyrics_checked_mtime_ms = ?,
               lyrics_sidecar_fingerprint = ?,
               metadata_checked_mtime_ms = ?,
               metadata_parser_version = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND file_path = ?`
        ).run(
          scannedTrack.filePath,
          scannedTrack.fileSize,
          scannedTrack.fileMtimeMs,
          scannedTrack.title,
          scannedTrack.artist,
          scannedTrack.album,
          scannedTrack.albumArtist,
          scannedTrack.trackNo,
          scannedTrack.discNo,
          scannedTrack.durationSeconds,
          scannedTrack.bitrateBps,
          scannedTrack.codec ?? null,
          scannedTrack.year,
          scannedTrack.releaseDate,
          scannedTrack.copyright,
          scannedTrack.composer,
          scannedTrack.genre,
          scannedTrack.lyricsText,
          scannedTrack.lyricsFormat,
          scannedTrack.isrc,
          scannedTrack.metadataSignature,
          scannedTrack.fileMtimeMs,
          scannedTrack.lyricsSidecarFingerprint ?? null,
          scannedTrack.fileMtimeMs,
          scannedTrack.metadataParserVersion ?? "",
          trackId,
          expectedOldPath
        );
        if (result.changes > 0) {
          this.db.prepare("UPDATE tracks SET file_stat_fingerprint = ? WHERE id = ?").run(encodeScanFileFingerprint(scannedTrack.fileFingerprint), trackId);
          prepareScannedMetadataDisplayUpdate(this.db)(scannedTrack, previous);
        }
        return result.changes > 0;
      })();
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code.startsWith("SQLITE_CONSTRAINT")) {
        return false;
      }
      throw error;
    }
  }
  markMissingByPathPrefix(rootPath) {
    return this.db.transaction(() => this.markMissingPrefix(rootPath))();
  }
  markMissingPrefix(rootPath) {
    const rootPrefixes = toRootPrefixes(rootPath);
    const predicates = rootPrefixes.map(() => `file_path LIKE ? ESCAPE '~'`).join(" OR ");
    const patternArgs = rootPrefixes.map((prefix) => `${escapeLikePattern(prefix)}%`);
    const rows = this.db.prepare(
      `UPDATE tracks
         SET availability = 'missing',
             missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE availability = 'available'
           AND (${predicates}) RETURNING id`
    ).all(...patternArgs);
    this.refreshArtwork(rows.map((row) => row.id));
    return rows.length;
  }
  refreshArtwork(ids) {
    const seen = /* @__PURE__ */ new Set();
    for (const id of ids) {
      const identity2 = captureArtworkAlbum(this.db, id);
      if (identity2 && !seen.has(JSON.stringify(identity2))) {
        seen.add(JSON.stringify(identity2));
        refreshArtworkAlbum(this.db, identity2);
      }
    }
  }
}
class TrackRepository extends BaseRepository {
  queries;
  writer;
  availability;
  constructor(db) {
    super(db);
    this.queries = new TrackQueryRepository(db);
    this.writer = new TrackScanWriter(db);
    this.availability = new TrackAvailabilityRepository(db);
  }
  getChangeToken() {
    return this.queries.getChangeToken();
  }
  isLiveAlbum(trackId) {
    return this.queries.isLiveAlbum(trackId);
  }
  getFilePathById(trackId) {
    return this.queries.getFilePathById(trackId);
  }
  adoptPlaybackPath(trackId, expectedPath, nextPath) {
    return this.queries.adoptPlaybackPath(trackId, expectedPath, nextPath);
  }
  getTrackIdsByFilePaths(filePaths) {
    return this.queries.getTrackIdsByFilePaths(filePaths);
  }
  getTrackIdsByPlaybackPath(filePath) {
    return this.queries.getTrackIdsByPlaybackPath(filePath);
  }
  getExistingFilePaths(filePaths) {
    return this.queries.getExistingFilePaths(filePaths);
  }
  getWatchRecoveryTracks(rootPath) {
    return this.queries.getWatchRecoveryTracks(rootPath);
  }
  /**
   * Read the persisted scan fingerprint (file_size + file_mtime_ms) for the
   * given paths. Paths absent from the table are simply not present in the
   * map. Used by the metadata watcher to skip a refresh job when a file was
   * only opened for reading (same fingerprint as the last scan).
   */
  getFileFingerprintsByFilePaths(filePaths) {
    return this.queries.getFileFingerprintsByFilePaths(filePaths);
  }
  getLyricsByTrackId(trackId) {
    return this.queries.getLyricsByTrackId(trackId);
  }
  getAll() {
    return this.queries.getAll();
  }
  getAlbumDetailTracks(albumArtist, albumTitle) {
    return this.queries.getAlbumDetailTracks(albumArtist, albumTitle);
  }
  getArtistAlbumSummaries(albumArtist, excludeAlbumTitle) {
    return this.queries.getArtistAlbumSummaries(albumArtist, excludeAlbumTitle);
  }
  getGenreAlbumSummaries(genre, excludeArtist, excludeTitle) {
    return this.queries.getGenreAlbumSummaries(genre, excludeArtist, excludeTitle);
  }
  getKnownFiles() {
    return this.queries.getKnownFiles();
  }
  upsertMany(tracks) {
    return this.writer.upsertMany(tracks);
  }
  patchAlbumArtwork(items) {
    return this.writer.patchAlbumArtwork(items);
  }
  patchLyrics(items) {
    return this.writer.patchLyrics(items);
  }
  patchTrackTags(items) {
    return this.writer.patchTrackTags(items);
  }
  markMissingByFilePaths(filePaths) {
    return this.availability.markMissingByFilePaths(filePaths);
  }
  markAvailableByFilePaths(filePaths) {
    return this.availability.markAvailableByFilePaths(filePaths);
  }
  getMissingCandidates() {
    return this.availability.getMissingCandidates();
  }
  findRelocationCandidatesByIdentity(identity2, includeAvailable = false) {
    return this.availability.findRelocationCandidatesByIdentity(identity2, includeAvailable);
  }
  markMissingUnderRootExcept(rootPath, foundFilePaths, unreadableDirectoryPaths = []) {
    return this.availability.markMissingUnderRootExcept(
      rootPath,
      foundFilePaths,
      unreadableDirectoryPaths
    );
  }
  /**
   * Relocate a record whose old file was confirmed absent (or a Windows path alias).
   * The expected old path prevents a stale match from taking over an already moved record.
   * Returns false when the target path is already occupied by another track
   * (or a UNIQUE constraint race loses), so callers can fall back to upsert.
   */
  relocateTrack(trackId, scannedTrack, expectedOldPath) {
    return this.availability.relocateTrack(trackId, scannedTrack, expectedOldPath);
  }
  getRandomPlayableTrack(excludeTrackId) {
    return this.queries.getRandomPlayableTrack(excludeTrackId);
  }
  getStartupAlbumCandidates() {
    return this.queries.getStartupAlbumCandidates();
  }
  getRandomAlbumIdentity(excludeAlbumKey) {
    return this.queries.getRandomAlbumIdentity(excludeAlbumKey);
  }
  getAlbumTracks(albumArtist, album) {
    return this.queries.getAlbumTracks(albumArtist, album);
  }
  markMissingByPathPrefix(rootPath) {
    return this.availability.markMissingByPathPrefix(rootPath);
  }
}
class ScanFailureRepository extends BaseRepository {
  insertMany(failures) {
    if (failures.length === 0) {
      return;
    }
    const insert = this.db.prepare(
      "INSERT INTO scan_failures (job_id, file_path, reason) VALUES (?, ?, ?)"
    );
    const insertBatch = this.db.transaction((items) => {
      for (const failure of items) {
        insert.run(failure.jobId, failure.filePath, failure.reason);
      }
    });
    insertBatch(failures);
  }
}
function underRoot(path, root) {
  const relative2 = win32.relative(root, path);
  return relative2 !== "" && relative2 !== ".." && !relative2.startsWith("..\\") && !win32.isAbsolute(relative2);
}
class MissingTrackCleanupRepository extends BaseRepository {
  removeConfirmedMissing(rootPath) {
    if (!this.db.inTransaction) throw new Error("Missing-track cleanup requires a transaction");
    try {
      if (!statSync(rootPath).isDirectory()) return [];
    } catch {
      return [];
    }
    const candidates = new TrackRepository(this.db).getMissingCandidates().filter((c) => underRoot(c.filePath, rootPath));
    const possibleMoves = this.findPossibleMoves(candidates);
    const removed = [];
    const affectedAlbums = /* @__PURE__ */ new Set();
    const affectedArtists = /* @__PURE__ */ new Set();
    for (const candidate of candidates) {
      if (!this.isAbsent(candidate.filePath) || possibleMoves.has(candidate.trackId)) continue;
      const row = this.db.prepare("SELECT * FROM tracks WHERE id=? AND availability='missing' AND file_path=?").get(candidate.trackId, candidate.filePath);
      if (!row) continue;
      const stored = row;
      const display = this.db.prepare("SELECT * FROM library_track_display WHERE id=?").get(candidate.trackId);
      const snapshot = {
        track: row,
        metadata: this.db.prepare("SELECT * FROM track_metadata WHERE track_id=?").get(candidate.trackId) ?? null,
        artists: this.db.prepare("SELECT * FROM track_artists WHERE track_id=?").all(candidate.trackId),
        playlists: this.db.prepare("SELECT * FROM playlist_tracks WHERE track_id=?").all(candidate.trackId),
        stats: this.db.prepare("SELECT * FROM track_play_stats WHERE track_id=?").get(candidate.trackId) ?? null,
        dailyStats: this.db.prepare("SELECT * FROM daily_track_play_stats WHERE track_id=?").all(candidate.trackId)
      };
      const albumRows = this.db.prepare(
        "SELECT * FROM albums WHERE (title=? AND artist=COALESCE(NULLIF(?,''),?)) OR (title=? AND artist=COALESCE(NULLIF(?,''),?))"
      ).all(
        display.album,
        display.album_artist,
        display.artist,
        stored.album,
        stored.album_artist,
        stored.artist
      );
      const artistRows = this.db.prepare(
        "SELECT a.* FROM artists a JOIN track_artists ta ON ta.artist_id=a.id WHERE ta.track_id=?"
      ).all(candidate.trackId);
      for (const album of albumRows) affectedAlbums.add(album.id);
      for (const artist of artistRows) affectedArtists.add(artist.id);
      this.db.prepare(
        `INSERT INTO removed_track_history(id,title,artist,album,album_artist,genre,artwork_cache_key,source_file_path,play_count,last_played_at,recovery_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        candidate.trackId,
        display.title,
        display.artist,
        display.album,
        display.album_artist,
        display.genre,
        display.artwork_cache_key,
        candidate.filePath,
        display.play_count,
        display.last_played_at,
        JSON.stringify({ ...snapshot, albumRows, artistRows })
      );
      this.db.prepare(
        "INSERT INTO removed_daily_track_play_stats SELECT * FROM daily_track_play_stats WHERE track_id=?"
      ).run(candidate.trackId);
      for (const table of [
        "track_artists",
        "track_metadata",
        "playlist_tracks",
        "track_play_stats",
        "daily_track_play_stats"
      ])
        this.db.prepare(`DELETE FROM ${table} WHERE track_id=?`).run(candidate.trackId);
      const deletion = this.db.prepare("DELETE FROM tracks WHERE id=? AND availability='missing' AND file_path=?").run(candidate.trackId, candidate.filePath);
      if (deletion.changes !== 1) throw new Error("Missing track changed during cleanup");
      removed.push(candidate.trackId);
    }
    if (removed.length) {
      const deleteAlbum = this.db.prepare(
        `DELETE FROM albums WHERE id=? AND NOT EXISTS(SELECT 1 FROM library_track_display d WHERE d.album=albums.title AND COALESCE(NULLIF(d.album_artist,''),d.artist)=albums.artist)`
      );
      for (const id of affectedAlbums) deleteAlbum.run(id);
      const deleteArtist = this.db.prepare(
        "DELETE FROM artists WHERE id=? AND NOT EXISTS(SELECT 1 FROM track_artists ta WHERE ta.artist_id=artists.id)"
      );
      for (const id of affectedArtists) deleteArtist.run(id);
    }
    return removed;
  }
  isAbsent(filePath) {
    try {
      statSync(filePath);
      return false;
    } catch (error) {
      const code = error.code;
      return code === "ENOENT" || code === "ENOTDIR";
    }
  }
  findPossibleMoves(candidates) {
    const byIsrc = /* @__PURE__ */ new Map();
    const byTitleAndArtist = /* @__PURE__ */ new Map();
    for (const candidate of candidates) {
      if (candidate.isrc) {
        const group = byIsrc.get(candidate.isrc) ?? [];
        group.push(candidate);
        byIsrc.set(candidate.isrc, group);
      } else if (candidate.title !== null && candidate.artist !== null) {
        const artists = byTitleAndArtist.get(candidate.title) ?? /* @__PURE__ */ new Map();
        const group = artists.get(candidate.artist) ?? [];
        group.push(candidate);
        artists.set(candidate.artist, group);
        byTitleAndArtist.set(candidate.title, artists);
      }
    }
    const possibleMoves = /* @__PURE__ */ new Set();
    if (!byIsrc.size && !byTitleAndArtist.size) return possibleMoves;
    const identities = this.db.prepare(
      `SELECT title,artist,album,isrc,duration_seconds AS durationSeconds,file_size AS fileSize FROM tracks WHERE availability='available'`
    ).iterate();
    for (const identity2 of identities) {
      const groups = [
        identity2.isrc ? byIsrc.get(identity2.isrc) : void 0,
        byTitleAndArtist.get(identity2.title)?.get(identity2.artist)
      ];
      for (const group of groups) {
        if (!group) continue;
        for (const candidate of group) {
          if (!possibleMoves.has(candidate.trackId) && findUniqueRelocationCandidate([candidate], identity2))
            possibleMoves.add(candidate.trackId);
        }
      }
    }
    return possibleMoves;
  }
}
function isCurrentScanSnapshot(result, verifyLyrics) {
  try {
    const file = statSync(result.filePath);
    return file.isFile() && hasSameScanFileFingerprint(file, result.fileFingerprint) && (result.directoryArtworkFingerprint === void 0 || result.directoryArtworkFingerprint === getDirectoryArtworkFingerprintSync(result.filePath)) && (!verifyLyrics || result.lyricsSidecarFingerprint === getLyricsSidecarFingerprintSync(result.filePath));
  } catch {
    return false;
  }
}
function importScannedTracks(tracks, candidates, trackRepository, onFailure) {
  const newTracks = [];
  const relocatedIds = [];
  const relocatedPaths = [];
  const restoredPaths = [];
  const failures = [];
  const isCurrentFile = (track) => {
    if (isCurrentScanSnapshot(track, true)) return true;
    onFailure();
    failures.push({
      filePath: track.filePath,
      // electron-vite 3's shim scanner mistakes a trailing module keyword in a
      // string for syntax and can insert its shim inside a later string literal.
      reason: "Audio file changed or became unavailable before committing scanned tracks"
    });
    return false;
  };
  const matches = findUniqueRelocations(candidates, tracks);
  for (const track of tracks) {
    if (!isCurrentFile(track)) continue;
    try {
      const match = matches.get(track.filePath);
      if (match) {
        const pathAlias = win32.normalize(match.filePath).toLowerCase() === win32.normalize(track.filePath).toLowerCase();
        if (!pathAlias) {
          try {
            if (statSync(match.filePath).isFile()) restoredPaths.push(match.filePath);
            newTracks.push(track);
            continue;
          } catch (error) {
            const code = error.code;
            if (code !== "ENOENT" && code !== "ENOTDIR") {
              newTracks.push(track);
              continue;
            }
          }
        }
        const relocated = trackRepository.relocateTrack(match.trackId, track, match.filePath);
        if (relocated) {
          relocatedIds.push(match.trackId);
          relocatedPaths.push(track.filePath);
        } else {
          newTracks.push(track);
        }
      } else {
        newTracks.push(track);
      }
    } catch (error) {
      onFailure();
      logger.warn(
        { error, filePath: track.filePath },
        "Failed to relocate/upsert scanned track; trying upsert fallback"
      );
      newTracks.push(track);
    }
  }
  let addedPaths = [];
  const currentNewTracks = newTracks.filter(isCurrentFile);
  if (currentNewTracks.length > 0) {
    const newTrackPaths = currentNewTracks.map((track) => track.filePath);
    const existingPaths = trackRepository.getExistingFilePaths(newTrackPaths);
    addedPaths = newTrackPaths.filter((filePath) => !existingPaths.has(filePath));
    try {
      trackRepository.upsertMany(currentNewTracks);
    } catch (error) {
      onFailure();
      logger.warn(
        { error, count: currentNewTracks.length },
        "Batch upsert failed; retrying per track"
      );
      for (const track of currentNewTracks) {
        if (!isCurrentFile(track)) continue;
        try {
          trackRepository.upsertMany([track]);
        } catch (trackError) {
          failures.push({
            filePath: track.filePath,
            reason: trackError instanceof Error ? trackError.message : "Unable to import track"
          });
          logger.warn(
            { error: trackError, filePath: track.filePath },
            "Skipping track after upsert failure"
          );
        }
      }
    }
    const committedPaths = trackRepository.getExistingFilePaths(addedPaths);
    addedPaths = addedPaths.filter((path) => committedPaths.has(path));
  }
  return { addedPaths, relocatedIds, relocatedPaths, restoredPaths, failures };
}
function isUnderDirectory(filePath, directory) {
  const relative2 = win32.relative(directory, filePath);
  return relative2 === "" || relative2 !== ".." && !relative2.startsWith("..\\") && !win32.isAbsolute(relative2);
}
class LibraryScanPersistence {
  constructor(db, libraryRootRepository, scanJobRepository, trackRepository, events) {
    this.db = db;
    this.libraryRootRepository = libraryRootRepository;
    this.scanJobRepository = scanJobRepository;
    this.trackRepository = trackRepository;
    this.events = events;
    this.scanFailureRepository = new ScanFailureRepository(db);
  }
  pendingNewTracks = /* @__PURE__ */ new Map();
  rejectedScanFiles = /* @__PURE__ */ new Set();
  scanHadFailures = false;
  scanFailureRepository;
  begin() {
    this.clearPendingTracks();
    this.scanHadFailures = false;
  }
  clearPendingTracks() {
    this.pendingNewTracks.clear();
    this.rejectedScanFiles.clear();
  }
  fail(jobId, reason, defaultFailedFiles = 0) {
    this.scanJobRepository.fail(jobId, reason);
    const status = this.scanJobRepository.getById(jobId);
    this.publishProgress({
      jobId,
      status: "failed",
      totalFiles: status?.totalFiles ?? 0,
      scannedFiles: status?.scannedFiles ?? 0,
      failedFiles: status?.failedFiles ?? defaultFailedFiles,
      currentFile: null,
      message: reason
    });
  }
  handleMessage(message, workerJobId) {
    if (message.type === "progress") {
      const progress = {
        ...message.payload,
        failedFiles: message.payload.failedFiles + this.rejectedScanFiles.size
      };
      if (progress.failedFiles > 0) this.scanHadFailures = true;
      this.scanJobRepository.updateProgress(
        progress.jobId,
        progress.totalFiles,
        progress.scannedFiles,
        progress.failedFiles
      );
      this.publishProgress(progress);
      return;
    }
    if (message.type === "tracks") {
      const knownPaths = this.trackRepository.getExistingFilePaths(
        message.payload.map((track) => track.filePath)
      );
      const knownTracks = [];
      for (const track of message.payload) {
        if (knownPaths.has(track.filePath)) knownTracks.push(track);
        else this.pendingNewTracks.set(track.filePath, track);
      }
      const currentTracks = this.acceptCurrentSnapshots(knownTracks, workerJobId, true);
      this.trackRepository.upsertMany(currentTracks);
      if (currentTracks.length > 0) {
        const filePaths = currentTracks.map((track) => track.filePath);
        this.publishChanged(
          "metadata-refresh",
          this.trackRepository.getTrackIdsByFilePaths(filePaths),
          filePaths
        );
      }
      return;
    }
    if (message.type === "trackTags") {
      const patches = this.acceptCurrentSnapshots(message.payload, workerJobId, false);
      this.trackRepository.patchTrackTags(patches);
      if (patches.length > 0) {
        const filePaths = patches.map((patch) => patch.filePath);
        this.publishChanged(
          "metadata-refresh",
          this.trackRepository.getTrackIdsByFilePaths(filePaths),
          filePaths
        );
      }
      return;
    }
    if (message.type === "albumArtwork") {
      const patches = message.payload.filter(
        (patch) => !patch.filePath || patch.fileFingerprint && this.acceptCurrentSnapshots(
          [{ ...patch, filePath: patch.filePath, fileFingerprint: patch.fileFingerprint }],
          workerJobId,
          false
        ).length > 0
      );
      this.trackRepository.patchAlbumArtwork(patches);
      const paths = patches.flatMap((patch) => patch.filePath ? [patch.filePath] : []);
      if (paths.length)
        this.publishChanged(
          "metadata-refresh",
          this.trackRepository.getTrackIdsByFilePaths(paths),
          paths
        );
      return;
    }
    if (message.type === "trackLyrics") {
      const patches = this.acceptCurrentSnapshots(message.payload, workerJobId, true);
      if (patches.length === 0) return;
      this.trackRepository.patchLyrics(patches);
      const filePaths = patches.map((patch) => patch.filePath);
      this.publishChanged(
        "metadata-refresh",
        this.trackRepository.getTrackIdsByFilePaths(filePaths),
        filePaths
      );
      return;
    }
    if (message.type === "failure") {
      this.scanHadFailures = true;
      this.scanFailureRepository.insertMany([message.payload]);
      return;
    }
    if (message.type === "fatal") {
      this.fail(workerJobId, message.payload.reason, 1);
      return;
    }
    if (message.type === "complete") {
      const result = this.db.transaction(() => {
        const status = this.scanJobRepository.getById(workerJobId);
        if (!status || status.status !== "scanning") {
          return null;
        }
        const root = this.libraryRootRepository.getById(status.rootId);
        if (!root) {
          throw new Error(`Library root not found while completing scan: ${status.rootId}`);
        }
        this.libraryRootRepository.markScanned(status.rootId);
        const restoredIds = this.trackRepository.markAvailableByFilePaths(
          message.payload.foundFilePaths
        );
        const missingIds = this.trackRepository.markMissingUnderRootExcept(
          root.path,
          message.payload.foundFilePaths,
          message.payload.unreadableDirectoryPaths
        );
        const candidates = this.trackRepository.getMissingCandidates().filter(
          (candidate) => isUnderDirectory(candidate.filePath, root.path) && !message.payload.unreadableDirectoryPaths.some(
            (directory) => isUnderDirectory(candidate.filePath, directory)
          )
        );
        const imported = importScannedTracks(
          [...this.pendingNewTracks.values()],
          candidates,
          this.trackRepository,
          () => {
            this.scanHadFailures = true;
          }
        );
        const allRestoredIds = restoredIds.concat(
          this.trackRepository.markAvailableByFilePaths(imported.restoredPaths)
        );
        const failedFiles = status.failedFiles + imported.failures.length;
        if (imported.failures.length > 0) {
          this.scanFailureRepository.insertMany(
            imported.failures.map((failure) => ({ ...failure, jobId: workerJobId }))
          );
          this.scanJobRepository.updateProgress(
            workerJobId,
            status.totalFiles,
            status.scannedFiles,
            failedFiles
          );
        }
        const removedIds = !this.scanHadFailures && status.failedFiles === 0 && message.payload.unreadableDirectoryPaths.length === 0 ? new MissingTrackCleanupRepository(this.db).removeConfirmedMissing(root.path) : [];
        if (!this.scanJobRepository.finish(workerJobId, "completed")) {
          throw new Error(`Scan job was no longer active while completing: ${workerJobId}`);
        }
        const relocated = new Set(imported.relocatedIds);
        const restored = new Set(allRestoredIds);
        return {
          status: { ...status, failedFiles },
          restoredIds: allRestoredIds,
          missingIds: [
            .../* @__PURE__ */ new Set([
              ...missingIds.filter((id) => !relocated.has(id) && !restored.has(id)),
              ...removedIds
            ])
          ],
          imported
        };
      })();
      if (!result) {
        return;
      }
      this.publishImportedTracks(result.imported);
      if (result.restoredIds.length > 0) {
        this.publishChanged("track-restored", result.restoredIds, [
          ...message.payload.foundFilePaths,
          ...result.imported.restoredPaths
        ]);
      }
      if (result.missingIds.length > 0) {
        this.publishChanged("track-missing", result.missingIds);
      }
      this.publishProgress({
        jobId: workerJobId,
        status: "completed",
        totalFiles: result.status.totalFiles,
        scannedFiles: result.status.scannedFiles,
        failedFiles: result.status.failedFiles,
        currentFile: null,
        message: "Scan completed"
      });
    }
  }
  publishImportedTracks(result) {
    if (result.addedPaths.length > 0) {
      this.publishChanged(
        "track-added",
        this.trackRepository.getTrackIdsByFilePaths(result.addedPaths),
        result.addedPaths
      );
    }
    if (result.relocatedIds.length > 0) {
      this.publishChanged("track-relocated", result.relocatedIds, result.relocatedPaths);
    }
  }
  acceptCurrentSnapshots(items, jobId, verifyLyrics) {
    const accepted = [];
    const failures = [];
    for (const item of items) {
      if (isCurrentScanSnapshot(item, verifyLyrics)) {
        accepted.push(item);
      } else if (!this.rejectedScanFiles.has(item.filePath)) {
        this.rejectedScanFiles.add(item.filePath);
        this.scanHadFailures = true;
        failures.push({
          jobId,
          filePath: item.filePath,
          reason: "Audio file or lyric sidecar changed or became unavailable before scan update"
        });
      }
    }
    if (failures.length > 0) {
      this.scanFailureRepository.insertMany(failures);
      const status = this.scanJobRepository.getById(jobId);
      if (status) {
        this.scanJobRepository.updateProgress(
          jobId,
          status.totalFiles,
          status.scannedFiles,
          status.failedFiles + failures.length
        );
      }
    }
    return accepted;
  }
  publishMissingTracks(trackIds) {
    this.publishChanged("track-missing", trackIds);
  }
  publishProgress(progress) {
    this.events.progress(progress);
  }
  publishChanged(reason, trackIds, filePaths = []) {
    this.events.changed({ reason, trackIds, filePaths });
  }
}
class LibraryScanWorkerHost {
  constructor(createWorker, callbacks) {
    this.createWorker = createWorker;
    this.callbacks = callbacks;
  }
  activeWorker = null;
  jobId = null;
  terminating = false;
  deferredEvents = [];
  cleanup = null;
  get activeJobId() {
    return this.jobId;
  }
  isActive() {
    return this.activeWorker !== null || this.jobId !== null;
  }
  prepare(jobId) {
    this.jobId = jobId;
    this.terminating = false;
  }
  waitForCleanup() {
    return this.cleanup;
  }
  /** Keep ownership until the lifecycle hook has finished resuming other writers. */
  finish(jobId) {
    if (this.jobId !== jobId) return Promise.resolve();
    if (this.cleanup) return this.cleanup;
    this.activeWorker = null;
    this.deferredEvents.length = 0;
    this.callbacks.onClear();
    const release = () => {
      if (this.jobId === jobId) this.jobId = null;
      this.cleanup = null;
      this.terminating = false;
    };
    try {
      const ending = this.callbacks.onEnd();
      if (!ending) {
        release();
        return Promise.resolve();
      }
      this.cleanup = Promise.resolve(ending).catch((error) => {
        logger.error({ error, jobId }, "Failed to end library scan lifecycle");
      }).finally(release);
      return this.cleanup;
    } catch (error) {
      logger.error({ error, jobId }, "Failed to end library scan lifecycle");
      release();
      return Promise.resolve();
    }
  }
  async terminate(jobId) {
    if (this.jobId !== jobId || this.cleanup) return false;
    const worker = this.activeWorker;
    this.terminating = true;
    try {
      if (worker) await worker.terminate();
    } catch (error) {
      this.terminating = false;
      for (const event of this.deferredEvents.splice(0)) event();
      throw error;
    }
    return true;
  }
  start(input) {
    const jobId = input.jobId;
    const workerPath = join(__dirname, "features/libraryScan/libraryScanWorker.js");
    const worker = this.createWorker(workerPath, { workerData: input });
    this.activeWorker = worker;
    let terminalSettled = false;
    const clearWorkerState = () => {
      if (this.activeWorker === worker && this.jobId === jobId) {
        void this.finish(jobId);
      }
    };
    const settleFailed = (reason, error) => {
      if (terminalSettled || this.terminating || this.activeWorker !== worker) {
        return;
      }
      terminalSettled = true;
      logger.error({ error, jobId }, reason);
      try {
        this.callbacks.onFailure(jobId, reason);
      } catch (settlementError) {
        logger.error({ error: settlementError, jobId }, "Failed to persist scan failure status");
      } finally {
        clearWorkerState();
      }
    };
    const dispatch = (event) => {
      if (terminalSettled || this.activeWorker !== worker || this.jobId !== jobId) return;
      if (this.terminating) this.deferredEvents.push(() => dispatch(event));
      else event();
    };
    worker.on("message", (message) => {
      dispatch(() => {
        const isTerminal = message.type === "complete" || message.type === "fatal";
        try {
          this.callbacks.onMessage(message, jobId);
          if (isTerminal) {
            terminalSettled = true;
            clearWorkerState();
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Unknown error while processing worker message";
          settleFailed(`Failed to finalize library scan: ${reason}`, error);
        }
      });
    });
    worker.on("error", (error) => {
      dispatch(() => settleFailed(error.message, error));
    });
    worker.on("exit", (code) => {
      setImmediate(() => {
        if (terminalSettled || this.jobId !== jobId) {
          return;
        }
        const reason = code === 0 ? "Worker exited without completing the scan" : `Worker exited with code ${code}`;
        dispatch(() => settleFailed(reason));
      });
    });
  }
}
class LibraryScanService {
  constructor(db, artworkCacheDir, selectDirectory, events, createWorker = (fileName, options) => new Worker(fileName, options)) {
    this.selectDirectory = selectDirectory;
    this.db = db;
    this.libraryRootRepository = new LibraryRootRepository(db);
    this.scanJobRepository = new ScanJobRepository(db);
    this.trackRepository = new TrackRepository(db);
    this.artworkCacheDir = artworkCacheDir;
    this.persistence = new LibraryScanPersistence(
      db,
      this.libraryRootRepository,
      this.scanJobRepository,
      this.trackRepository,
      events
    );
    this.workerHost = new LibraryScanWorkerHost(createWorker, {
      onMessage: (message, jobId) => this.persistence.handleMessage(message, jobId),
      onFailure: (jobId, reason) => this.persistence.fail(jobId, reason),
      onClear: () => this.persistence.clearPendingTracks(),
      onEnd: () => this.onScanLifecycle.onEnd?.()
    });
    this.scanJobRepository.markInterruptedJobs();
  }
  db;
  libraryRootRepository;
  scanJobRepository;
  trackRepository;
  artworkCacheDir;
  persistence;
  workerHost;
  stopping = false;
  rootChanging = false;
  rootChange = null;
  preparation = null;
  cancellations = /* @__PURE__ */ new Map();
  onRootChange = {};
  pendingStarts = /* @__PURE__ */ new Set();
  onScanLifecycle = {};
  /**
   * Optional hooks so watch flush can pause during a full scan
   * (prevents watch-imported tracks from being markMissing'd on complete).
   */
  setScanLifecycleHooks(hooks) {
    this.onScanLifecycle = hooks;
  }
  /** True while a scan worker (or a scan in preparation) is running. */
  isScanActive() {
    return this.workerHost.isActive();
  }
  async selectRoot() {
    const selectedPath = await this.selectDirectory();
    if (selectedPath === null) {
      return { canceled: true };
    }
    if (this.stopping || this.rootChanging || this.isScanActive() || this.cancellations.size > 0) {
      throw new Error("Cannot change library root while a scan or library change is active");
    }
    const existingRoots = this.libraryRootRepository.list();
    if (existingRoots.length === 1 && win32.relative(existingRoots[0].path, selectedPath) === "") {
      return { canceled: false, root: existingRoots[0] };
    }
    this.rootChanging = true;
    const change = this.replaceRoot(selectedPath);
    this.rootChange = change;
    try {
      return await change;
    } finally {
      this.rootChange = null;
      this.rootChanging = false;
    }
  }
  setRootChangeHooks(hooks) {
    this.onRootChange = hooks;
  }
  async replaceRoot(selectedPath) {
    try {
      await this.onRootChange.onStart?.();
      if (this.stopping) throw new Error("Library root change interrupted by application shutdown");
      const result = this.db.transaction(() => {
        const missingIds = /* @__PURE__ */ new Set();
        for (const oldRoot of this.libraryRootRepository.list()) {
          for (const id of this.trackRepository.markMissingUnderRootExcept(
            oldRoot.path,
            [],
            [selectedPath]
          )) {
            missingIds.add(id);
          }
          this.libraryRootRepository.deleteById(oldRoot.id);
        }
        const root = this.libraryRootRepository.upsertByPath(selectedPath);
        return { root, missingIds: [...missingIds] };
      })();
      if (result.missingIds.length > 0) this.persistence.publishMissingTracks(result.missingIds);
      return { canceled: false, root: result.root };
    } finally {
      try {
        await this.onRootChange.onEnd?.();
      } catch (error) {
        logger.error({ error }, "Failed to end library root change lifecycle");
      }
    }
  }
  getRoots() {
    return this.libraryRootRepository.list();
  }
  getScanStatus(jobId) {
    return jobId ? this.scanJobRepository.getById(jobId) : this.scanJobRepository.getLatest();
  }
  startScan(rootId) {
    if (this.stopping) return Promise.reject(new Error("Library scan service is shutting down"));
    const request = this.startScanInternal(rootId);
    this.pendingStarts.add(request);
    void request.then(
      () => this.pendingStarts.delete(request),
      () => this.pendingStarts.delete(request)
    );
    return request;
  }
  async shutdown() {
    this.stopping = true;
    await Promise.allSettled([
      ...this.pendingStarts,
      ...this.cancellations.values(),
      ...this.rootChange ? [this.rootChange] : []
    ]);
    await this.workerHost.waitForCleanup();
    if (this.workerHost.activeJobId !== null) await this.cancelScan(this.workerHost.activeJobId);
  }
  async startScanInternal(rootId) {
    if (this.cancellations.size > 0) await Promise.all([...this.cancellations.values()]);
    const cleanup = this.workerHost.waitForCleanup();
    if (cleanup) await cleanup;
    if (this.stopping) throw new Error("Library scan service is shutting down");
    if (this.rootChanging) throw new Error("Cannot start a scan while the library root is changing");
    const activeJob = this.scanJobRepository.getActive();
    if (activeJob) {
      if (this.workerHost.activeJobId === activeJob.jobId) {
        return { jobId: activeJob.jobId };
      }
      logger.warn(
        { jobId: activeJob.jobId },
        "Healing orphan scanning job without an active worker"
      );
      this.scanJobRepository.fail(
        activeJob.jobId,
        "Scan job recovered after unexpected interruption"
      );
    }
    const root = this.libraryRootRepository.getById(rootId);
    if (!root) {
      throw new Error(`Library root not found: ${rootId}`);
    }
    const job = this.scanJobRepository.create(root.id);
    this.persistence.begin();
    this.workerHost.prepare(job.jobId);
    let resolvePreparation;
    const preparation = {
      jobId: job.jobId,
      canceled: false,
      done: new Promise((resolve2) => {
        resolvePreparation = resolve2;
      }),
      resolve: () => resolvePreparation()
    };
    this.preparation = preparation;
    try {
      await this.onScanLifecycle.onStart?.();
      if (this.stopping) throw new Error("Library scan interrupted by application shutdown");
      if (preparation.canceled) return { jobId: job.jobId };
      this.workerHost.start({
        jobId: job.jobId,
        rootPath: root.path,
        knownFiles: this.trackRepository.getKnownFiles(),
        artworkCacheDir: this.artworkCacheDir
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Failed to prepare library scan";
      if (!preparation.canceled) {
        try {
          this.scanJobRepository.fail(job.jobId, reason);
        } finally {
          await this.workerHost.finish(job.jobId);
        }
      }
      throw error;
    } finally {
      if (this.preparation === preparation) this.preparation = null;
      preparation.resolve();
    }
    return { jobId: job.jobId };
  }
  cancelScan(jobId) {
    const existing = this.cancellations.get(jobId);
    if (existing) return existing;
    if (this.workerHost.activeJobId !== jobId || this.workerHost.waitForCleanup()) {
      return Promise.resolve({ ok: false });
    }
    if (this.preparation?.jobId === jobId) this.preparation.canceled = true;
    const cancel = this.cancelScanInternal(jobId);
    this.cancellations.set(jobId, cancel);
    void cancel.then(
      () => this.cancellations.delete(jobId),
      () => this.cancellations.delete(jobId)
    );
    return cancel;
  }
  async cancelScanInternal(jobId) {
    if (this.preparation?.jobId === jobId) await this.preparation.done;
    if (!await this.workerHost.terminate(jobId)) return { ok: false };
    try {
      this.scanJobRepository.finish(jobId, "canceled");
    } finally {
      await this.workerHost.finish(jobId);
    }
    const status = this.scanJobRepository.getById(jobId);
    if (status) {
      this.persistence.publishProgress({
        jobId,
        status: "canceled",
        totalFiles: status.totalFiles,
        scannedFiles: status.scannedFiles,
        failedFiles: status.failedFiles,
        currentFile: null,
        message: "Scan canceled"
      });
    }
    return { ok: true };
  }
}
function getWorkerPath() {
  return join(__dirname, "features/metadata/metadataRefreshWorker.js");
}
class MetadataRefreshWorkerHost {
  constructor(repository, events, writes, onIdle) {
    this.repository = repository;
    this.events = events;
    this.writes = writes;
    this.onIdle = onIdle;
  }
  activeWorker = null;
  activeJobId = null;
  activeJobFinalizer = null;
  pendingMessages = /* @__PURE__ */ new Set();
  get jobId() {
    return this.activeJobId;
  }
  async shutdown(reason = "Application shutdown interrupted refresh") {
    const worker = this.activeWorker;
    const jobId = this.activeJobId;
    const finalize = this.activeJobFinalizer;
    this.activeWorker = null;
    this.activeJobId = null;
    this.activeJobFinalizer = null;
    if (worker) {
      try {
        await worker.terminate();
      } catch (error) {
        this.activeWorker = worker;
        this.activeJobId = jobId;
        this.activeJobFinalizer = finalize;
        throw error;
      }
    }
    while (this.pendingMessages.size > 0) await Promise.allSettled([...this.pendingMessages]);
    finalize?.(reason, true);
  }
  start(input) {
    input = {
      ...input,
      tracks: input.tracks.map((track) => ({
        ...track,
        generation: this.writes.generationFor(track.trackId)
      }))
    };
    const changedReason = this.getChangedReason(input.jobId);
    const worker = new Worker(getWorkerPath(), {
      workerData: input
    });
    this.activeWorker = worker;
    this.activeJobId = input.jobId;
    let failed = 0;
    let committed = 0;
    const expectedTracks = new Map(input.tracks.map((track) => [track.trackId, track]));
    const committedTrackIds = [];
    let terminal = false;
    let messages = Promise.resolve();
    const cleanup = () => {
      if (this.activeWorker === worker) {
        this.activeWorker = null;
        this.activeJobId = null;
        this.activeJobFinalizer = null;
        queueMicrotask(() => this.onIdle());
      }
    };
    const finalize = (reason, interrupted = false) => {
      if (terminal || !interrupted && (this.activeWorker !== worker || this.activeJobId !== input.jobId))
        return;
      terminal = true;
      let terminalError = reason;
      const recordError = (error, affectsStatus = true) => {
        if (affectsStatus)
          terminalError ??= error instanceof Error ? error.message : "Metadata commit failed";
        logger.error({ err: error, jobId: input.jobId }, "Metadata refresh finalization failed");
      };
      try {
        try {
          this.repository.updateJobProgress(input.jobId, committed, failed);
        } catch (error) {
          recordError(error);
        }
        try {
          if (terminalError === void 0) this.repository.completeJob(input.jobId);
          else this.repository.completeJob(input.jobId, terminalError);
        } catch (error) {
          recordError(error);
        }
        try {
          if (committedTrackIds.length) this.pushChanged(committedTrackIds, changedReason);
        } catch (error) {
          recordError(error, false);
        }
        try {
          this.pushProgress(
            input.jobId,
            committed + failed,
            input.tracks.length,
            failed,
            terminalError === void 0 ? "completed" : "failed"
          );
        } catch (error) {
          recordError(error, false);
        }
      } finally {
        cleanup();
      }
    };
    this.activeJobFinalizer = finalize;
    const handleMessage = async (message) => {
      if (this.activeWorker !== worker || this.activeJobId !== input.jobId) return;
      switch (message.type) {
        case "result": {
          const r = message.payload;
          try {
            const matches = () => r.jobId === input.jobId && expectedTracks.get(r.trackId)?.filePath === r.sourceFilePath && expectedTracks.get(r.trackId)?.generation === r.generation && r.generation === this.writes.generationFor(r.trackId) && !this.writes.isWriting(r.trackId) && this.activeWorker === worker && (input.writeMode === "legacy-ttml" ? this.repository.getLegacyTtmlFilePath(r.trackId) : this.repository.getTrackFilePath(r.trackId)) === r.sourceFilePath;
            if (!matches()) throw new Error("Stale metadata result or changed track identity");
            await assertMetadataFingerprint(r);
            if (!matches()) throw new Error("Stale metadata result or changed track identity");
            if (input.writeMode === "legacy-ttml") {
              if (!r.lyricsSidecarFingerprint || r.lyricsSidecarFingerprint !== getLyricsSidecarFingerprintSync(r.sourceFilePath))
                throw new Error("Lyrics sidecar changed before commit");
              if (!this.repository.updateLegacyTtmlLyrics(r, r.lyricsSidecarFingerprint))
                throw new Error("Legacy lyrics already changed");
            } else if (input.writeMode === "lyrics") this.repository.updateTrackLyrics(r);
            else this.repository.updateTrackMetadata(r);
            committed++;
            committedTrackIds.push(r.trackId);
          } catch (error) {
            failed++;
            const reason = error instanceof Error ? error.message : "Metadata commit failed";
            this.repository.addFailure(input.jobId, r.trackId, r.sourceFilePath, reason);
            logger.warn(
              { err: error, jobId: input.jobId, trackId: r.trackId },
              "Metadata result was not committed"
            );
          }
          break;
        }
        case "failure": {
          const f = message.payload;
          const source2 = expectedTracks.get(f.trackId);
          if (f.jobId !== input.jobId || !source2 || source2.filePath !== f.filePath) break;
          failed += 1;
          const matches = () => this.activeWorker === worker && this.activeJobId === input.jobId && source2.generation === this.writes.generationFor(f.trackId) && !this.writes.isWriting(f.trackId) && this.repository.getTrackFilePath(f.trackId) === f.filePath;
          if (input.writeMode !== "legacy-ttml" && this.isMissingFileFailure(f.reason) && matches() && await this.isConfirmedMissing(f.filePath) && matches()) {
            this.repository.markTrackMissing(f.trackId);
            this.pushChanged([f.trackId], "track-missing");
          } else {
            this.repository.addFailure(f.jobId, f.trackId, f.filePath, f.reason);
          }
          break;
        }
        case "progress": {
          this.repository.updateJobProgress(input.jobId, committed, failed);
          this.pushProgress(input.jobId, committed + failed, input.tracks.length, failed, "running");
          break;
        }
        case "complete": {
          finalize();
          break;
        }
        case "fatal": {
          finalize(message.payload.reason);
          break;
        }
      }
    };
    const enqueue = (operation) => {
      messages = messages.then(operation).catch((error) => {
        logger.error({ err: error, jobId: input.jobId }, "Metadata message processing failed");
        finalize(error instanceof Error ? error.message : "Metadata commit failed");
      });
      const pending = messages;
      this.pendingMessages.add(pending);
      void pending.then(
        () => this.pendingMessages.delete(pending),
        () => this.pendingMessages.delete(pending)
      );
    };
    worker.on(
      "message",
      (message) => enqueue(() => handleMessage(message))
    );
    worker.on(
      "error",
      (error) => enqueue(() => {
        finalize(error.message);
      })
    );
    worker.on(
      "exit",
      (code) => enqueue(() => {
        finalize(`Worker exited unexpectedly (code ${code})`);
      })
    );
  }
  pushProgress(jobId, processedTracks, totalTracks, failedTracks, overrideStatus) {
    const status = overrideStatus ?? (processedTracks >= totalTracks ? "completed" : "running");
    const progress = {
      jobId,
      status,
      totalTracks,
      processedTracks,
      failedTracks
    };
    this.events.refreshProgress(progress);
  }
  isMissingFileFailure(reason) {
    return /\bENOENT\b|\bENOTDIR\b|no such file or directory/i.test(reason);
  }
  async isConfirmedMissing(filePath) {
    try {
      await stat(filePath);
      return false;
    } catch (error) {
      const code = error.code;
      return code === "ENOENT" || code === "ENOTDIR";
    }
  }
  getChangedReason(jobId) {
    const job = this.repository.getJobById(jobId);
    return job?.scope === "file-change" ? "file-change" : "metadata-refresh";
  }
  pushChanged(trackIds, reason) {
    this.events.libraryChanged({
      trackIds: [...new Set(trackIds)],
      filePaths: [],
      reason
    });
  }
}
class MetadataEditSessions {
  constructor(repository, write, notify) {
    this.repository = repository;
    this.write = write;
    this.notify = notify;
  }
  sessions = /* @__PURE__ */ new Map();
  clear() {
    this.sessions.clear();
  }
  async load(trackId) {
    const path = this.repository.getTrackFilePath(trackId);
    if (!path) return null;
    const revision = this.repository.getMetadataEditRevision(trackId);
    const before = await stat(path);
    if (!before.isFile()) throw new Error("Metadata source is not a file");
    const metadata = await parseAudioMetadata(path, { skipCovers: true, duration: false });
    const fingerprint = scanFileFingerprint(before);
    if (!hasSameScanFileFingerprint(await stat(path), fingerprint) || revision !== this.repository.getMetadataEditRevision(trackId))
      throw new MetadataSaveError("metadata-conflict", "Metadata changed while opening the editor");
    const snapshot = {
      trackId,
      ...normalizeMetadata(metadata).fileTags,
      editToken: randomUUID()
    };
    const legacy = this.repository.getLegacyMetadata(trackId);
    if (legacy) snapshot.legacyMetadata = legacy;
    const now = Date.now();
    for (const [key, session] of this.sessions) if (session.expires < now) this.sessions.delete(key);
    while (this.sessions.size >= 256) this.sessions.delete(this.sessions.keys().next().value);
    this.sessions.set(snapshot.editToken, {
      snapshot,
      path,
      fingerprint,
      revision,
      expires: now + 30 * 60 * 1e3
    });
    return snapshot;
  }
  async save(request) {
    const session = this.sessions.get(request.editToken);
    if (!session || session.snapshot.trackId !== request.trackId || session.expires < Date.now())
      return { ok: false, reason: "metadata-conflict" };
    const assertCurrent = async () => {
      if (this.repository.getMetadataEditRevision(request.trackId) !== session.revision || this.repository.getTrackFilePath(request.trackId) !== session.path || !hasSameScanFileFingerprint(await stat(session.path), session.fingerprint))
        throw new MetadataSaveError("metadata-conflict", "The metadata edit is stale");
    };
    await assertCurrent();
    const legacy = session.snapshot.legacyMetadata;
    if (legacy && !request.legacyAction) return { ok: false, reason: "legacy-metadata-unresolved" };
    if (!legacy && request.legacyAction) return { ok: false, reason: "metadata-conflict" };
    if (request.legacyAction === "adopt-file") {
      if (Object.keys(request.changes).length) return { ok: false, reason: "metadata-conflict" };
      await assertCurrent();
      this.repository.adoptFileMetadata(
        request.trackId,
        session.path,
        session.snapshot,
        session.revision
      );
      this.sessions.delete(request.editToken);
      const revision = this.notify(request.trackId, session.path);
      return { ok: true, ...revision ? { libraryRevision: revision } : {} };
    }
    const fields = Object.keys(request.changes);
    if (!fields.length && !legacy) return { ok: true };
    const base = request.legacyAction === "write-legacy" ? legacy : session.snapshot;
    const edit = {
      ...normalizeEditableMetadata({ ...base, ...request.changes, trackId: request.trackId }),
      editedFields: legacy ? [
        "title",
        "artistDisplay",
        "albumTitle",
        "albumArtistDisplay",
        "genreDisplay",
        "releaseDate"
      ] : fields,
      expectedFingerprint: session.fingerprint,
      expectedEditRevision: session.revision,
      commitFileTags: true
    };
    const result = await this.write(edit, assertCurrent);
    if (result.ok) {
      const fingerprint = this.repository.getMetadataFileFingerprint(request.trackId);
      if (fingerprint)
        this.sessions.set(request.editToken, {
          ...session,
          fingerprint,
          revision: this.repository.getMetadataEditRevision(request.trackId),
          snapshot: {
            trackId: edit.trackId,
            title: edit.title,
            artistDisplay: edit.artistDisplay,
            albumTitle: edit.albumTitle,
            albumArtistDisplay: edit.albumArtistDisplay,
            genreDisplay: edit.genreDisplay,
            year: edit.year,
            releaseDate: edit.releaseDate,
            editToken: request.editToken
          }
        });
      else this.sessions.delete(request.editToken);
    }
    return result;
  }
}
function isSameEditableMetadata(left, right) {
  const text = (value) => value?.trim() || null;
  const date = (value) => text(value.releaseDate) ?? (value.year === null ? null : String(value.year).padStart(4, "0"));
  return left.trackId === right.trackId && text(left.title) === text(right.title) && text(left.albumTitle) === text(right.albumTitle) && canonicalizeDelimitedValues(left.artistDisplay) === canonicalizeDelimitedValues(right.artistDisplay) && canonicalizeDelimitedValues(left.albumArtistDisplay) === canonicalizeDelimitedValues(right.albumArtistDisplay) && canonicalizeDelimitedValues(left.genreDisplay) === canonicalizeDelimitedValues(right.genreDisplay) && date(left) === date(right);
}
class MetadataTagWriteCoordinator {
  constructor(repository, artworkCacheDir, ffmpegPath, lifecycle, coordinator) {
    this.repository = repository;
    this.artworkCacheDir = artworkCacheDir;
    this.ffmpegPath = ffmpegPath;
    this.lifecycle = lifecycle;
    this.coordinator = coordinator;
  }
  playbackTagWrite = null;
  onTagWriteSuccess = null;
  trackGenerations = /* @__PURE__ */ new Map();
  writingTracks = /* @__PURE__ */ new Set();
  writingFiles = /* @__PURE__ */ new Set();
  pendingPublishedWrites = /* @__PURE__ */ new Map();
  reconciliation = null;
  reconciliationRequested = false;
  pendingWrites = /* @__PURE__ */ new Set();
  generationFor(trackId) {
    return this.trackGenerations.get(trackId) ?? 0;
  }
  isWriting(trackId) {
    return this.writingTracks.has(trackId);
  }
  hasActiveWrites() {
    return this.writingTracks.size > 0;
  }
  isWritingFile(filePath) {
    return this.writingFiles.has(normalizeAudioFilePath(filePath));
  }
  async drain() {
    await Promise.allSettled([...this.pendingWrites]);
  }
  /**
   * Called immediately before the audio file is rewritten so watchers can
   * suppress the incoming mtime events (e.g. skip a metadata refresh).
   */
  setTagWriteSuccessHandler(handler) {
    this.onTagWriteSuccess = handler;
  }
  setPlaybackTagWriteHandler(handler) {
    this.playbackTagWrite = handler;
  }
  updateTrackMetadata(metadata, beforeCommit, onDiskCommit) {
    if (this.lifecycle.isStopping())
      return Promise.reject(new Error("Metadata refresh service is shutting down"));
    const request = this.writeTrackMetadata(metadata, beforeCommit, onDiskCommit);
    this.pendingWrites.add(request);
    void request.then(
      () => this.pendingWrites.delete(request),
      () => this.pendingWrites.delete(request)
    );
    return request;
  }
  async writeTrackMetadata(metadata, beforeCommit, onDiskCommit) {
    metadata = normalizeEditableMetadata(metadata);
    const filePath = this.repository.getTrackFilePath(metadata.trackId);
    if (!filePath) {
      throw new Error(`Audio file not found for track ${metadata.trackId}`);
    }
    if (this.writingTracks.has(metadata.trackId)) return { ok: false, reason: "write-in-progress" };
    const existing = this.repository.getEditableTrackMetadata(metadata.trackId);
    if (metadata.lyricsText === void 0 && !metadata.commitFileTags && !this.pendingPublishedWrites.has(metadata.trackId) && existing && isSameEditableMetadata(metadata, existing))
      return { ok: true };
    if (metadata.lyricsText === void 0 && !metadata.commitFileTags && !this.pendingPublishedWrites.has(metadata.trackId) && existing?.year != null && existing.releaseDate && existing.year !== Number(existing.releaseDate.slice(0, 4)) && metadata.releaseDate === existing.releaseDate)
      return { ok: false, reason: "legacy-date-conflict" };
    let writeLeaseId = null;
    let usesPlaybackWriter = false;
    if (this.coordinator) {
      const leaseResult = this.coordinator.tryAcquireWriteLease(
        filePath,
        `track-${metadata.trackId}`
      );
      if (!leaseResult.ok) {
        if (leaseResult.reason !== "playback-in-use" || !this.playbackTagWrite) return leaseResult;
        usesPlaybackWriter = true;
      } else {
        writeLeaseId = leaseResult.leaseId;
      }
    }
    const generation = (this.trackGenerations.get(metadata.trackId) ?? 0) + 1;
    this.trackGenerations.set(metadata.trackId, generation);
    this.writingTracks.add(metadata.trackId);
    this.writingFiles.add(normalizeAudioFilePath(filePath));
    this.coordinator?.refreshPlaybackCapability?.(filePath);
    let libraryRevision;
    let filePublished = false;
    let databaseCommitted = false;
    try {
      const commitAndReconcile = async (commit) => {
        await beforeCommit?.();
        this.onTagWriteSuccess?.(filePath);
        await commit();
        filePublished = true;
        onDiskCommit?.();
        const result = await readStableMetadata(
          metadata.trackId,
          filePath,
          this.artworkCacheDir,
          (actual) => verifyWrittenMetadata(metadata, actual)
        );
        await assertMetadataFingerprint(result);
        if (this.trackGenerations.get(metadata.trackId) !== generation)
          throw new Error("Tag write became stale");
        this.assertEditRevision(metadata);
        if (metadata.lyricsText !== void 0) this.repository.updateTrackLyrics(result);
        else if (metadata.commitFileTags) this.repository.commitVerifiedFileEdit(result);
        else this.repository.commitVerifiedUserEdit(metadata, result);
        this.pendingPublishedWrites.delete(metadata.trackId);
        databaseCommitted = true;
        this.onTagWriteSuccess?.(filePath);
        try {
          const revision = this.lifecycle.onUserEditCommitted?.(metadata.trackId, filePath);
          if (typeof revision === "string") libraryRevision = revision;
        } catch (error) {
          logger.warn({ err: error }, "Unable to notify committed metadata edit");
        }
      };
      if (usesPlaybackWriter) {
        const result = await this.playbackTagWrite(filePath, metadata, commitAndReconcile);
        if (!result.ok && filePublished && !databaseCommitted) {
          this.pendingPublishedWrites.set(metadata.trackId, metadata);
        }
        if (result.ok && libraryRevision) return { ...result, libraryRevision };
        return result;
      }
      if (metadata.lyricsText !== void 0 || metadata.commitFileTags) {
        const prepared = await prepareAudioTagWrite(filePath, metadata, this.ffmpegPath);
        try {
          await commitAndReconcile(() => prepared.commit());
        } finally {
          await prepared.dispose();
        }
      } else await commitAndReconcile(() => writeAudioTags(filePath, metadata, this.ffmpegPath));
      return libraryRevision ? { ok: true, libraryRevision } : { ok: true };
    } catch (error) {
      if (filePublished && !databaseCommitted) {
        this.pendingPublishedWrites.set(metadata.trackId, metadata);
      }
      logger.warn(
        { err: error, trackId: metadata.trackId },
        "Tag write requires metadata reconciliation"
      );
      throw error;
    } finally {
      if (writeLeaseId) {
        this.coordinator?.releaseWriteLease(writeLeaseId);
      }
      this.writingTracks.delete(metadata.trackId);
      this.writingFiles.delete(normalizeAudioFilePath(filePath));
      this.coordinator?.finishMetadataWrite?.(filePath);
      this.flushReconciliation();
    }
  }
  flushReconciliation() {
    if (this.lifecycle.isStopping() || this.lifecycle.hasActiveJob()) return;
    if (this.pendingPublishedWrites.size === 0) return;
    if (this.reconciliation) {
      this.reconciliationRequested = true;
      return;
    }
    this.reconciliationRequested = false;
    const run2 = this.reconcilePublishedWrites();
    const reconciliation = run2.finally(() => {
      if (this.reconciliation === reconciliation) {
        this.reconciliation = null;
        if (this.reconciliationRequested) this.flushReconciliation();
      }
    });
    this.reconciliation = reconciliation;
  }
  assertEditRevision(metadata) {
    if (metadata.expectedEditRevision !== void 0 && metadata.expectedEditRevision !== this.repository.getMetadataEditRevision(metadata.trackId))
      throw new MetadataSaveError(
        "metadata-conflict",
        "Metadata changed before the database commit"
      );
  }
  async awaitReconciliation() {
    while (this.reconciliation) await this.reconciliation;
    await this.reconcilePublishedWrites();
  }
  async reconcilePublishedWrites() {
    for (const [trackId, metadata] of [...this.pendingPublishedWrites]) {
      if (this.pendingPublishedWrites.get(trackId) !== metadata || this.writingTracks.has(trackId))
        continue;
      const generation = this.generationFor(trackId);
      try {
        const filePath = this.repository.getTrackFilePath(trackId);
        if (!filePath) {
          this.pendingPublishedWrites.delete(trackId);
          logger.warn({ trackId }, "Published tag write has no track path");
          continue;
        }
        const result = await readStableMetadata(
          trackId,
          filePath,
          this.artworkCacheDir,
          (actual) => verifyWrittenMetadata(metadata, actual)
        );
        await assertMetadataFingerprint(result);
        if (this.writingTracks.has(trackId) || this.pendingPublishedWrites.get(trackId) !== metadata || this.generationFor(trackId) !== generation || this.repository.getTrackFilePath(trackId) !== filePath)
          continue;
        this.assertEditRevision(metadata);
        if (metadata.lyricsText !== void 0) this.repository.updateTrackLyrics(result);
        else if (metadata.commitFileTags) this.repository.commitVerifiedFileEdit(result);
        else this.repository.commitVerifiedUserEdit(metadata, result);
        this.pendingPublishedWrites.delete(trackId);
        this.onTagWriteSuccess?.(filePath);
        try {
          this.lifecycle.onUserEditCommitted?.(trackId, filePath);
        } catch (error) {
          logger.warn({ err: error }, "Unable to notify committed metadata edit");
        }
      } catch (error) {
        logger.warn({ err: error, trackId }, "Unable to reconcile published tag write");
      }
    }
  }
}
class MetadataRefreshService {
  constructor(repository, artworkCacheDir, events, ffmpegPath, coordinator, readLibraryRevision) {
    this.repository = repository;
    this.artworkCacheDir = artworkCacheDir;
    this.events = events;
    this.editSessions = new MetadataEditSessions(
      repository,
      (metadata, beforeCommit) => this.tagWrites.updateTrackMetadata(metadata, beforeCommit),
      (trackId, filePath) => {
        const libraryRevision = readLibraryRevision?.();
        events.libraryChanged({
          reason: "metadata-refresh",
          trackIds: [trackId],
          filePaths: [filePath],
          ...libraryRevision ? { libraryRevision } : {}
        });
        return libraryRevision;
      }
    );
    this.tagWrites = new MetadataTagWriteCoordinator(
      repository,
      artworkCacheDir,
      ffmpegPath,
      {
        isStopping: () => this.stopping,
        hasActiveJob: () => this.hasActiveJob(),
        refreshTracksFromFileChanges: (ids) => this.refreshTracksFromFileChanges(ids),
        onUserEditCommitted: (trackId, filePath) => {
          const libraryRevision = readLibraryRevision?.();
          events.libraryChanged({
            reason: "metadata-refresh",
            trackIds: [trackId],
            filePaths: [filePath],
            ...libraryRevision ? { libraryRevision } : {}
          });
          return libraryRevision;
        }
      },
      coordinator
    );
    this.workerHost = new MetadataRefreshWorkerHost(repository, events, this.tagWrites, () => {
      this.tagWrites.flushReconciliation();
      this.finishLegacyRecovery();
      this.scheduleLegacyRecovery(0);
    });
    this.repository.markInterruptedJobs();
  }
  editSessions;
  editOperations = /* @__PURE__ */ new Set();
  workerHost;
  tagWrites;
  stopping = false;
  legacyRecoveryEnabled = false;
  legacyRecoveryPaused = false;
  legacyRecoveryJob = null;
  legacyRecoveryCursor = 0;
  legacyRecoveryAttempt = 0;
  legacyRecoveryTimer = null;
  legacyRecoveryWaiters = [];
  pendingManualJob = null;
  preemption = null;
  startLegacyLyricsRecovery() {
    this.legacyRecoveryEnabled = true;
    this.scheduleLegacyRecovery(0);
  }
  async pauseLegacyLyricsRecovery() {
    this.legacyRecoveryPaused = true;
    if (this.legacyRecoveryTimer) clearTimeout(this.legacyRecoveryTimer);
    this.legacyRecoveryTimer = null;
    if (this.legacyRecoveryJob !== null)
      await new Promise((resolve2) => this.legacyRecoveryWaiters.push(resolve2));
  }
  resumeLegacyLyricsRecovery() {
    this.legacyRecoveryPaused = false;
    this.scheduleLegacyRecovery(0);
  }
  scheduleLegacyRecovery(delay2) {
    if (!this.legacyRecoveryEnabled || this.legacyRecoveryPaused || this.stopping || this.legacyRecoveryTimer)
      return;
    this.legacyRecoveryTimer = setTimeout(() => {
      this.legacyRecoveryTimer = null;
      this.runLegacyRecovery();
    }, delay2);
    this.legacyRecoveryTimer.unref();
  }
  runLegacyRecovery() {
    if (this.stopping || this.legacyRecoveryPaused) return;
    if (this.hasActiveJob()) {
      this.scheduleLegacyRecovery(1e3);
      return;
    }
    let jobId;
    try {
      const tracks = this.repository.getLegacyTtmlTracks(this.legacyRecoveryCursor, 128);
      if (!tracks.length) {
        this.legacyRecoveryCursor = 0;
        const delay2 = Math.min(6e4 * 2 ** Math.min(this.legacyRecoveryAttempt, 4), 9e5);
        this.legacyRecoveryAttempt += 1;
        this.scheduleLegacyRecovery(delay2);
        return;
      }
      this.repository.pruneLegacyLyricsJobs();
      jobId = this.repository.createJob("legacy-lyrics", tracks.length);
      this.workerHost.start({
        jobId,
        tracks,
        artworkCacheDir: this.artworkCacheDir,
        writeMode: "legacy-ttml"
      });
      this.legacyRecoveryCursor = tracks[tracks.length - 1].trackId;
      this.legacyRecoveryJob = jobId;
    } catch (error) {
      if (jobId !== void 0)
        this.repository.completeJob(jobId, "Legacy lyric recovery failed to start");
      logger.warn({ error }, "Unable to start legacy lyric recovery");
      this.scheduleLegacyRecovery(6e4);
    }
  }
  setTagWriteSuccessHandler(handler) {
    this.tagWrites.setTagWriteSuccessHandler(handler);
  }
  setPlaybackTagWriteHandler(handler) {
    this.tagWrites.setPlaybackTagWriteHandler(handler);
  }
  hasActiveArtworkWrites() {
    return this.hasActiveJob() || this.tagWrites.hasActiveWrites();
  }
  isWritingFile(filePath) {
    return this.tagWrites.isWritingFile(filePath);
  }
  hasActiveJob() {
    return this.pendingManualJob !== null || this.workerHost.jobId !== null;
  }
  async shutdown() {
    this.stopping = true;
    const workerShutdown = this.workerHost.shutdown();
    void workerShutdown.catch(() => void 0);
    if (this.legacyRecoveryTimer) clearTimeout(this.legacyRecoveryTimer);
    this.legacyRecoveryTimer = null;
    try {
      await Promise.allSettled([...this.editOperations]);
      this.editSessions.clear();
      if (this.preemption) await this.preemption;
      await this.tagWrites.drain();
      await workerShutdown;
      await this.tagWrites.awaitReconciliation();
    } finally {
      this.legacyRecoveryJob = null;
      for (const resolve2 of this.legacyRecoveryWaiters.splice(0)) resolve2();
    }
  }
  assertRunning() {
    if (this.stopping) throw new Error("Metadata refresh service is shutting down");
  }
  finishLegacyRecovery() {
    if (this.legacyRecoveryJob === null) return;
    this.legacyRecoveryJob = null;
    for (const resolve2 of this.legacyRecoveryWaiters.splice(0)) resolve2();
  }
  startUserRefresh(input) {
    if (this.legacyRecoveryJob === null) {
      this.workerHost.start(input);
      return;
    }
    this.pendingManualJob = input.jobId;
    this.legacyRecoveryCursor = 0;
    const preemption = (async () => {
      try {
        await this.workerHost.shutdown("Background lyric recovery yielded to user refresh");
        this.finishLegacyRecovery();
        if (this.stopping) throw new Error("Metadata refresh service is shutting down");
        this.workerHost.start(input);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unable to start metadata refresh";
        this.repository.completeJob(input.jobId, reason);
        this.events.refreshProgress({
          jobId: input.jobId,
          status: "failed",
          totalTracks: input.tracks.length,
          processedTracks: 0,
          failedTracks: 0
        });
      } finally {
        this.pendingManualJob = null;
        this.scheduleLegacyRecovery(0);
      }
    })();
    this.preemption = preemption;
    void preemption.finally(() => {
      if (this.preemption === preemption) this.preemption = null;
    });
  }
  refreshTrack(trackId) {
    return this.refreshTracks([trackId]);
  }
  refreshTracks(trackIds) {
    return this.refreshTracksForScope(trackIds, "tracks");
  }
  refreshTracksFromFileChanges(trackIds) {
    return this.refreshTracksForScope(trackIds, "file-change");
  }
  refreshTracksForScope(trackIds, scope) {
    this.assertRunning();
    const activeJob = this.pendingManualJob ?? this.workerHost.jobId;
    if (activeJob !== null && (activeJob !== this.legacyRecoveryJob || scope === "file-change")) {
      throw new Error(`A refresh job is already running (job ${activeJob})`);
    }
    const tracks = this.repository.getTracksByIds(trackIds);
    if (tracks.length === 0) {
      throw new Error("No matching tracks found");
    }
    const jobId = this.repository.createJob(scope, tracks.length);
    const workerInput = {
      jobId,
      tracks,
      artworkCacheDir: this.artworkCacheDir,
      writeMode: "metadata"
    };
    this.startUserRefresh(workerInput);
    return { jobId };
  }
  refreshLyricsForMissing(limit = 5e3) {
    this.assertRunning();
    const activeJob = this.pendingManualJob ?? this.workerHost.jobId;
    if (activeJob !== null && activeJob !== this.legacyRecoveryJob) {
      throw new Error(`A refresh job is already running (job ${activeJob})`);
    }
    const tracks = this.repository.getTracksWithMissingLyrics(limit);
    if (tracks.length === 0) {
      throw new Error("No tracks with missing lyrics found");
    }
    const jobId = this.repository.createJob("missing-lyrics", tracks.length);
    this.startUserRefresh({
      jobId,
      tracks,
      artworkCacheDir: this.artworkCacheDir,
      writeMode: "lyrics"
    });
    return { jobId };
  }
  getJobStatus(jobId) {
    return this.repository.getJobById(jobId);
  }
  listFailures(limit) {
    return this.repository.listFailures(limit);
  }
  clearFailures() {
    return { deletedCount: this.repository.clearFailures() };
  }
  getTrackMetadata(trackId) {
    return this.repository.getEditableTrackMetadata(trackId);
  }
  getTrackEditSnapshot(trackId) {
    this.assertRunning();
    return this.trackEditOperation(this.editSessions.load(trackId));
  }
  saveTrackMetadata(request) {
    this.assertRunning();
    return this.trackEditOperation(this.editSessions.save(request));
  }
  trackEditOperation(operation) {
    this.editOperations.add(operation);
    void operation.then(
      () => this.editOperations.delete(operation),
      () => this.editOperations.delete(operation)
    );
    return operation;
  }
  updateTrackMetadata(metadata) {
    return this.tagWrites.updateTrackMetadata(metadata);
  }
  updateTrackLyrics(trackId, lyricsText, beforeCommit, onDiskCommit) {
    const metadata = this.repository.getEditableTrackMetadata(trackId);
    if (!metadata) return Promise.resolve({ ok: false, reason: "file-not-found" });
    return this.tagWrites.updateTrackMetadata(
      { ...metadata, lyricsText },
      beforeCommit,
      onDiskCommit
    );
  }
}
const UNSTABLE_RETRY_DELAY_MS$1 = 3e3;
const MAX_UNSTABLE_RETRIES = 40;
class MetadataWatchImportQueue {
  constructor(incrementalImportService, onPending, scheduleFlush, isPathActive) {
    this.incrementalImportService = incrementalImportService;
    this.onPending = onPending;
    this.scheduleFlush = scheduleFlush;
    this.isPathActive = isPathActive;
  }
  unstableRetries = /* @__PURE__ */ new Map();
  inFlightFilePaths = /* @__PURE__ */ new Set();
  deferredFilePaths = /* @__PURE__ */ new Set();
  deferIfInFlight(filePath) {
    if (!this.inFlightFilePaths.has(filePath)) return false;
    this.deferredFilePaths.add(filePath);
    return true;
  }
  clearDeferred() {
    this.deferredFilePaths.clear();
    this.unstableRetries.clear();
  }
  pruneInactivePaths() {
    for (const paths of [this.deferredFilePaths, this.unstableRetries]) {
      for (const filePath of paths.keys()) {
        if (!this.isPathActive(filePath)) paths.delete(filePath);
      }
    }
  }
  async importFiles(filePaths) {
    filePaths = filePaths.filter((filePath) => this.isPathActive(filePath));
    if (filePaths.length === 0) return;
    for (const filePath of filePaths) this.inFlightFilePaths.add(filePath);
    try {
      const result = await this.incrementalImportService.importFiles(filePaths);
      for (const filePath of result.imported) {
        this.unstableRetries.delete(filePath);
        this.releaseInFlight(filePath);
      }
      for (const failure of result.failed) {
        this.unstableRetries.delete(failure.filePath);
        this.releaseInFlight(failure.filePath);
      }
      if (result.unstable.length > 0) {
        for (const filePath of result.unstable) {
          this.inFlightFilePaths.delete(filePath);
          if (!this.isPathActive(filePath)) {
            this.unstableRetries.delete(filePath);
            this.deferredFilePaths.delete(filePath);
            continue;
          }
          const retries = (this.unstableRetries.get(filePath) ?? 0) + 1;
          if (retries >= MAX_UNSTABLE_RETRIES) {
            this.unstableRetries.delete(filePath);
            this.drainDeferred(filePath);
            logger.warn({ filePath, retries }, "Dropping unstable file after max retries");
          } else {
            this.unstableRetries.set(filePath, retries);
            this.onPending(filePath);
          }
        }
        this.scheduleFlush(UNSTABLE_RETRY_DELAY_MS$1);
      }
    } catch (error) {
      for (const filePath of filePaths) {
        this.releaseInFlight(filePath);
      }
      logger.warn({ error, count: filePaths.length }, "Incremental import failed");
    }
  }
  /**
   * Release a path from in-flight and re-add any deferred events for it to pending.
   */
  releaseInFlight(filePath) {
    this.inFlightFilePaths.delete(filePath);
    this.drainDeferred(filePath);
  }
  /**
   * If a path was deferred while in-flight, move it to pending and schedule a flush.
   */
  drainDeferred(filePath) {
    if (this.deferredFilePaths.delete(filePath) && this.isPathActive(filePath)) {
      this.onPending(filePath);
      this.scheduleFlush();
    }
  }
}
const RETRY_INITIAL_MS = 1e3;
const RETRY_MAX_MS = 3e4;
class MetadataRootWatchers {
  constructor(isStopped, onPath, onRecovered) {
    this.isStopped = isStopped;
    this.onPath = onPath;
    this.onRecovered = onRecovered;
  }
  watchers = /* @__PURE__ */ new Map();
  rootPaths = /* @__PURE__ */ new Map();
  retries = /* @__PURE__ */ new Map();
  close() {
    const watchers = [...this.watchers.values()];
    this.watchers.clear();
    this.rootPaths.clear();
    for (const key of this.retries.keys()) this.clearRetry(key);
    for (const watcher of watchers) watcher.close();
  }
  containsPath(filePath) {
    for (const rootPath of this.rootPaths.values()) {
      const relative2 = win32.relative(rootPath, filePath);
      if (relative2 === "" || relative2 !== ".." && !relative2.startsWith("..\\") && !win32.isAbsolute(relative2)) {
        return true;
      }
    }
    return false;
  }
  sync(rootPaths) {
    if (this.isStopped()) return false;
    const nextRootPaths = new Map(
      rootPaths.map((rootPath) => [win32.resolve(rootPath).toLowerCase(), normalize(rootPath)])
    );
    const changed = nextRootPaths.size !== this.rootPaths.size || [...nextRootPaths.keys()].some((key) => !this.rootPaths.has(key));
    this.rootPaths = nextRootPaths;
    for (const key of this.retries.keys()) {
      if (!nextRootPaths.has(key)) this.clearRetry(key);
    }
    for (const [key, watcher] of this.watchers) {
      if (!nextRootPaths.has(key)) {
        this.watchers.delete(key);
        watcher.close();
      }
    }
    for (const [key, rootPath] of nextRootPaths) {
      if (this.watchers.has(key)) {
        continue;
      }
      this.watchRoot(key, rootPath);
    }
    return changed;
  }
  watchRoot(key, rootPath) {
    try {
      const watcher = watch(rootPath, { recursive: true }, (_eventType, filename) => {
        if (this.isStopped() || this.watchers.get(key) !== watcher || !filename) {
          return;
        }
        this.onPath(normalize(join(rootPath, filename.toString())));
      });
      watcher.on("error", (error) => {
        if (this.watchers.get(key) !== watcher) return;
        logger.warn({ error, rootPath }, "Metadata watcher failed");
        this.watchers.delete(key);
        watcher.close();
        this.scheduleRetry(key);
      });
      this.watchers.set(key, watcher);
      const recovered = this.retries.has(key);
      this.clearRetry(key);
      logger.info({ rootPath }, "Metadata watcher started");
      if (recovered)
        this.onRecovered(rootPath, () => !this.isStopped() && this.watchers.get(key) === watcher);
    } catch (error) {
      logger.warn({ error, rootPath }, "Unable to start metadata watcher");
      this.scheduleRetry(key);
    }
  }
  clearRetry(key) {
    const retry = this.retries.get(key);
    if (retry?.timer) clearTimeout(retry.timer);
    this.retries.delete(key);
  }
  scheduleRetry(key) {
    if (this.isStopped() || !this.rootPaths.has(key)) return;
    let retry = this.retries.get(key);
    if (!retry) {
      retry = { attempt: 0, timer: null };
      this.retries.set(key, retry);
    }
    if (retry.timer) return;
    const delay2 = Math.min(RETRY_INITIAL_MS * 2 ** Math.min(retry.attempt, 5), RETRY_MAX_MS);
    retry.attempt += 1;
    const currentRetry = retry;
    retry.timer = setTimeout(() => {
      if (this.retries.get(key) !== currentRetry) return;
      currentRetry.timer = null;
      const rootPath = this.rootPaths.get(key);
      if (!this.isStopped() && rootPath && !this.watchers.has(key)) this.watchRoot(key, rootPath);
    }, delay2);
    retry.timer.unref();
  }
}
const TRANSIENT_STAT_ERROR_CODES = /* @__PURE__ */ new Set([
  "EACCES",
  "EPERM",
  "EBUSY",
  "ETIMEDOUT",
  "ENETDOWN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EHOSTDOWN",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAGAIN"
]);
function isTransientStatError(error) {
  if (!error || typeof error !== "object") return false;
  const code = error.code;
  return typeof code === "string" && TRANSIENT_STAT_ERROR_CODES.has(code);
}
const MISSING_CONFIRM_DELAY_MS = 5e3;
const MAX_STAT_RETRIES$1 = 10;
class MetadataMissingConfirmation {
  constructor(trackRepository, statRetries, sendToRenderer, lifecycle) {
    this.trackRepository = trackRepository;
    this.statRetries = statRetries;
    this.sendToRenderer = sendToRenderer;
    this.lifecycle = lifecycle;
  }
  pendingMissingFilePaths = /* @__PURE__ */ new Map();
  missingConfirmationTimer = null;
  pause() {
    if (this.missingConfirmationTimer) {
      clearTimeout(this.missingConfirmationTimer);
      this.missingConfirmationTimer = null;
    }
  }
  clear() {
    this.pendingMissingFilePaths.clear();
  }
  pruneInactivePaths() {
    for (const filePath of this.pendingMissingFilePaths.keys()) {
      if (!this.lifecycle.isPathActive(filePath)) this.pendingMissingFilePaths.delete(filePath);
    }
    if (this.pendingMissingFilePaths.size === 0) this.pause();
  }
  resume() {
    if (this.pendingMissingFilePaths.size > 0) this.schedule();
  }
  enqueue(filePath) {
    if (!this.lifecycle.isPathActive(filePath)) return;
    this.pendingMissingFilePaths.set(filePath, Symbol());
    this.schedule();
  }
  /** Restore paths whose latest stat has confirmed a regular audio file. */
  restorePaths(filePaths) {
    filePaths = filePaths.filter((filePath) => this.lifecycle.isPathActive(filePath));
    if (filePaths.length === 0) return;
    for (const filePath of filePaths) {
      this.pendingMissingFilePaths.delete(filePath);
      this.statRetries.delete(filePath);
    }
    const restoredIds = this.trackRepository.markAvailableByFilePaths(filePaths);
    if (restoredIds.length > 0) {
      this.sendChanged("track-restored", restoredIds, filePaths);
    }
  }
  schedule() {
    if (this.lifecycle.isStopped() || this.lifecycle.isPaused()) {
      return;
    }
    if (this.missingConfirmationTimer) {
      clearTimeout(this.missingConfirmationTimer);
    }
    this.missingConfirmationTimer = setTimeout(() => {
      this.missingConfirmationTimer = null;
      this.lifecycle.runOperation(() => this.confirmMissing());
    }, MISSING_CONFIRM_DELAY_MS);
  }
  async confirmMissing() {
    const entries = [...this.pendingMissingFilePaths.entries()];
    if (entries.length === 0) {
      return;
    }
    const filePaths = entries.map(([p]) => p);
    const statResults = await Promise.allSettled(filePaths.map((p) => stat(p)));
    if (this.lifecycle.isStopped()) return;
    const confirmedMissing = [];
    const restoredPaths = [];
    const transientErrorPaths = [];
    for (let i = 0; i < filePaths.length; i++) {
      if (this.pendingMissingFilePaths.get(filePaths[i]) !== entries[i][1]) continue;
      if (this.lifecycle.isPathBusy?.(filePaths[i])) {
        this.schedule();
        continue;
      }
      this.pendingMissingFilePaths.delete(filePaths[i]);
      if (!this.lifecycle.isPathActive(filePaths[i])) continue;
      const result = statResults[i];
      if (result.status === "fulfilled" && result.value.isFile()) {
        restoredPaths.push(filePaths[i]);
        this.statRetries.delete(filePaths[i]);
      } else if (result.status === "rejected" && isTransientStatError(result.reason)) {
        transientErrorPaths.push(filePaths[i]);
      } else {
        confirmedMissing.push(filePaths[i]);
      }
    }
    if (transientErrorPaths.length > 0) {
      for (const filePath of transientErrorPaths) {
        const retries = (this.statRetries.get(filePath) ?? 0) + 1;
        if (retries >= MAX_STAT_RETRIES$1) {
          this.statRetries.delete(filePath);
          logger.warn({ filePath, retries }, "Dropping file after max stat retries (confirm phase)");
        } else {
          this.statRetries.set(filePath, retries);
          this.enqueue(filePath);
        }
      }
    }
    if (restoredPaths.length > 0) {
      this.restorePaths(restoredPaths);
    }
    if (confirmedMissing.length > 0) {
      const missingIds = this.trackRepository.markMissingByFilePaths(confirmedMissing);
      if (missingIds.length > 0) {
        this.sendChanged("track-missing", missingIds, confirmedMissing);
      }
    }
  }
  sendChanged(reason, trackIds, filePaths) {
    this.sendToRenderer("library:changed", {
      reason,
      trackIds,
      filePaths
    });
  }
}
function createMetadataWatchState() {
  return {
    pendingFilePaths: /* @__PURE__ */ new Map(),
    pendingLyricsIntentPaths: /* @__PURE__ */ new Set(),
    pendingArtworkIntentPaths: /* @__PURE__ */ new Set(),
    statRetries: /* @__PURE__ */ new Map(),
    suppressRefreshUntil: /* @__PURE__ */ new Map(),
    flushPaused: false,
    stopped: false,
    rootsVersion: 0
  };
}
function resolveChangedFilePaths(input) {
  return input.stats.filter((entry) => {
    const fingerprint = input.fingerprints.get(entry.filePath);
    if (!fingerprint) return true;
    if (!fingerprint.fileFingerprint || ![entry.size, entry.mtimeMs, entry.ctimeMs, entry.dev, entry.ino].every(Number.isFinite))
      return true;
    return entry.size !== fingerprint.fileSize || entry.mtimeMs !== fingerprint.fileMtimeMs || !hasSameScanFileFingerprint(entry, fingerprint.fileFingerprint);
  }).map((entry) => entry.filePath);
}
function resolveWatchRefreshPaths(input) {
  const changedPaths = new Set(
    resolveChangedFilePaths({
      stats: input.stats,
      fingerprints: input.fingerprints
    })
  );
  const lyricsIntentPaths = new Set(input.lyricsIntentPaths ?? []);
  const artworkIntentPaths = new Set(input.artworkIntentPaths ?? []);
  const selected = /* @__PURE__ */ new Set();
  const result = [];
  for (const entry of input.stats) {
    if (selected.has(entry.filePath)) continue;
    if (!changedPaths.has(entry.filePath) && !lyricsIntentPaths.has(entry.filePath) && !artworkIntentPaths.has(entry.filePath))
      continue;
    selected.add(entry.filePath);
    result.push(entry.filePath);
  }
  return result;
}
const RETRY_AFTER_ACTIVE_JOB_MS = 5e3;
const UNSTABLE_RETRY_DELAY_MS = 3e3;
const MAX_STAT_RETRIES = 10;
class MetadataWatchBatch {
  constructor(state, context) {
    this.state = state;
    this.context = context;
  }
  async flushPending(selectedPaths) {
    if (this.state.flushPaused) {
      return;
    }
    const filePaths = selectedPaths ? [...selectedPaths] : [...this.state.pendingFilePaths.keys()];
    for (const path of filePaths) this.state.pendingFilePaths.delete(path);
    if (filePaths.length === 0) {
      return;
    }
    const incoming = [];
    for (const filePath of filePaths) {
      if (this.context.metadataRefreshService.isWritingFile?.(filePath)) {
        this.state.pendingFilePaths.set(filePath, Date.now());
        this.context.scheduleFlush();
        continue;
      }
      if (this.context.isCurrentPath(filePath) && !this.context.importQueue.deferIfInFlight(filePath)) {
        incoming.push(filePath);
      }
    }
    if (incoming.length === 0) {
      return;
    }
    const rootsVersion = this.state.rootsVersion;
    const statResults = await Promise.allSettled(incoming.map((p) => stat(p)));
    if (this.state.stopped) return;
    if (rootsVersion !== this.state.rootsVersion) {
      this.requeuePaths(incoming);
      if (this.state.pendingFilePaths.size > 0) this.context.scheduleFlush();
      return;
    }
    const { existingEntries, missingPaths } = this.classifyStatResults(incoming, statResults);
    if (existingEntries.length > 0) {
      const newFilePaths = this.reconcileExistingFiles(existingEntries);
      if (newFilePaths.length > 0) {
        await this.context.importQueue.importFiles(newFilePaths);
      }
    }
    if (missingPaths.length > 0) {
      for (const filePath of missingPaths) {
        this.context.missingConfirmation.enqueue(filePath);
      }
    }
    for (const filePath of incoming) {
      if (!this.state.pendingFilePaths.has(filePath)) {
        this.state.pendingLyricsIntentPaths.delete(filePath);
        this.state.pendingArtworkIntentPaths.delete(filePath);
      }
    }
  }
  classifyStatResults(incoming, statResults) {
    const existingEntries = [];
    const missingPaths = [];
    const transientErrorPaths = [];
    for (let i = 0; i < incoming.length; i++) {
      if (this.context.metadataRefreshService.isWritingFile?.(incoming[i])) {
        this.state.pendingFilePaths.set(incoming[i], Date.now());
        this.context.scheduleFlush();
        continue;
      }
      const result = statResults[i];
      if (result.status === "fulfilled" && result.value.isFile()) {
        existingEntries.push({
          filePath: incoming[i],
          ...scanFileFingerprint(result.value)
        });
        this.state.statRetries.delete(incoming[i]);
      } else if (result.status === "rejected" && isTransientStatError(result.reason)) {
        transientErrorPaths.push(incoming[i]);
      } else {
        missingPaths.push(incoming[i]);
      }
    }
    if (transientErrorPaths.length > 0) {
      for (const filePath of transientErrorPaths) {
        const retries = (this.state.statRetries.get(filePath) ?? 0) + 1;
        if (retries >= MAX_STAT_RETRIES) {
          this.state.statRetries.delete(filePath);
          logger.warn({ filePath, retries }, "Dropping file after max stat retries");
        } else {
          this.state.statRetries.set(filePath, retries);
          this.state.pendingFilePaths.set(filePath, Date.now());
        }
      }
      this.context.scheduleFlush(UNSTABLE_RETRY_DELAY_MS);
    }
    return { existingEntries, missingPaths };
  }
  reconcileExistingFiles(existingEntries) {
    const knownEntries = [];
    const newFilePaths = [];
    for (const entry of existingEntries) {
      const resolved = this.resolveKnownWatchPaths(entry.filePath);
      if (resolved.length === 0) {
        newFilePaths.push(entry.filePath);
        continue;
      }
      for (const resolvedPath of resolved) {
        knownEntries.push({
          ...entry,
          eventPath: entry.filePath,
          resolvedPath
        });
      }
    }
    this.context.missingConfirmation.restorePaths(knownEntries.map((entry) => entry.resolvedPath));
    this.refreshKnownEntries(knownEntries);
    return newFilePaths;
  }
  refreshKnownEntries(knownEntries) {
    let suppressionRetryDelay = Infinity;
    const refreshCandidates = knownEntries.filter((entry) => {
      if (!this.isRefreshSuppressed(entry.eventPath)) return true;
      this.state.pendingFilePaths.set(entry.eventPath, Date.now());
      suppressionRetryDelay = Math.min(
        suppressionRetryDelay,
        this.state.suppressRefreshUntil.get(normalizeAudioFilePath(entry.eventPath)) - Date.now()
      );
      return false;
    });
    if (Number.isFinite(suppressionRetryDelay) && !this.context.hasScheduledFlush()) {
      this.context.scheduleFlush(Math.max(1, suppressionRetryDelay));
    }
    const fingerprints = this.context.trackRepository.getFileFingerprintsByFilePaths(
      refreshCandidates.map((entry) => entry.resolvedPath)
    );
    const changedPaths = resolveWatchRefreshPaths({
      stats: refreshCandidates.map((entry) => ({
        ...scanFileFingerprint(entry),
        filePath: entry.resolvedPath
      })),
      fingerprints,
      lyricsIntentPaths: refreshCandidates.filter((entry) => this.state.pendingLyricsIntentPaths.has(entry.eventPath)).map((entry) => entry.resolvedPath),
      artworkIntentPaths: refreshCandidates.filter((entry) => this.state.pendingArtworkIntentPaths.has(entry.eventPath)).map((entry) => entry.resolvedPath)
    });
    if (changedPaths.length > 0) {
      const trackIds = this.context.trackRepository.getTrackIdsByFilePaths(changedPaths);
      if (trackIds.length > 0) {
        try {
          this.context.metadataRefreshService.refreshTracksFromFileChanges(trackIds);
        } catch (error) {
          this.requeuePaths(changedPaths);
          logger.info(
            { error, count: trackIds.length },
            "Deferring metadata refresh for file changes"
          );
          this.context.scheduleFlush(RETRY_AFTER_ACTIVE_JOB_MS);
        }
      }
    } else if (refreshCandidates.length > 0) {
      logger.debug(
        { count: refreshCandidates.length },
        "Metadata watcher: files unchanged since last scan, skipping refresh"
      );
    }
  }
  resolveKnownWatchPaths(filePath) {
    if (this.context.trackRepository.getExistingFilePaths([filePath]).has(filePath))
      return [filePath];
    const ids = this.context.trackRepository.getTrackIdsByPlaybackPath(filePath);
    if (ids.length === 0) return [];
    if (ids.length > 1) {
      return ids.map((id2) => this.context.trackRepository.getFilePathById(id2)).filter((stored2) => stored2 !== null);
    }
    const id = ids[0];
    if (id === void 0) return [];
    const stored = this.context.trackRepository.getFilePathById(id);
    if (!stored || stored === filePath) return stored ? [stored] : [];
    return this.context.trackRepository.adoptPlaybackPath(id, stored, filePath) ? [filePath] : [stored];
  }
  isRefreshSuppressed(filePath) {
    const normalizedPath = normalizeAudioFilePath(filePath);
    const until = this.state.suppressRefreshUntil.get(normalizedPath);
    if (until === void 0) {
      return false;
    }
    if (Date.now() >= until) {
      this.state.suppressRefreshUntil.delete(normalizedPath);
      return false;
    }
    return true;
  }
  requeuePaths(filePaths) {
    for (const filePath of filePaths) {
      if (!this.context.isCurrentPath(filePath)) continue;
      this.state.pendingFilePaths.set(filePath, Date.now());
    }
  }
}
const RECOVERY_BATCH_SIZE = 128;
class MetadataWatchRecovery {
  constructor(state, context) {
    this.state = state;
    this.context = context;
  }
  pendingRecoveries = /* @__PURE__ */ new Map();
  enqueue(rootPath, isCurrent) {
    this.clearRecoveryTimer(this.pendingRecoveries.get(rootPath));
    this.pendingRecoveries.set(rootPath, { isCurrent, retryAttempt: 0, retryTimer: null });
    this.resume();
  }
  pause() {
    for (const recovery of this.pendingRecoveries.values()) this.clearRecoveryTimer(recovery);
  }
  clear() {
    this.pause();
    this.pendingRecoveries.clear();
  }
  pruneInactiveRoots() {
    for (const [root, recovery] of this.pendingRecoveries) {
      if (!recovery.isCurrent()) {
        this.clearRecoveryTimer(recovery);
        this.pendingRecoveries.delete(root);
      }
    }
  }
  resume() {
    if (this.state.stopped || this.state.flushPaused) return;
    for (const [root, recovery] of this.pendingRecoveries) {
      if (recovery.retryTimer) continue;
      this.pendingRecoveries.delete(root);
      if (recovery.isCurrent())
        this.context.runOperation(() => this.reconcileRecoveredRoot(root, recovery));
    }
  }
  clearRecoveryTimer(recovery) {
    if (recovery?.retryTimer) clearTimeout(recovery.retryTimer);
    if (recovery) recovery.retryTimer = null;
  }
  async reconcileRecoveredRoot(root, recovery) {
    const canContinue = () => !this.state.stopped && !this.state.flushPaused && recovery.isCurrent();
    let needsRetry = false;
    try {
      const files = await collectAudioFiles(
        root,
        (directory) => {
          needsRetry = true;
          logger.warn({ directory }, "Unable to read directory during metadata watch recovery");
        },
        canContinue
      );
      if (!canContinue()) return;
      const known = this.context.trackRepository.getWatchRecoveryTracks(root);
      const pathKey2 = (path) => win32.normalize(path).toLowerCase();
      const knownByPath = new Map(known.map((track) => [pathKey2(track.filePath), track]));
      const paths = new Map(files.map((path) => [pathKey2(path), path]));
      for (const track of known) paths.set(pathKey2(track.filePath), normalize(track.filePath));
      const candidates = [...paths.values()];
      for (let offset = 0; offset < candidates.length; offset += RECOVERY_BATCH_SIZE) {
        if (!canContinue()) return;
        const batch = candidates.slice(offset, offset + RECOVERY_BATCH_SIZE);
        const lyricsChanged = await Promise.all(
          batch.map(async (path) => {
            const track = knownByPath.get(pathKey2(path));
            if (!track) return false;
            try {
              return !sameLyricsSidecarFingerprint(
                track.lyricsSidecarFingerprint,
                await getLyricsSidecarFingerprint(path)
              );
            } catch (error) {
              needsRetry = true;
              logger.warn(
                { error, filePath: path },
                "Unable to check lyrics during metadata watch recovery"
              );
              return false;
            }
          })
        );
        if (!canContinue()) return;
        for (const [index, path] of batch.entries()) {
          this.state.pendingFilePaths.set(path, Date.now());
          if (lyricsChanged[index]) this.state.pendingLyricsIntentPaths.add(path);
        }
        await this.context.flushPending(batch);
      }
    } catch (error) {
      needsRetry = true;
      throw error;
    } finally {
      if (!this.state.stopped && recovery.isCurrent() && (this.state.flushPaused || needsRetry)) {
        this.pendingRecoveries.set(root, recovery);
        if (!this.state.flushPaused) {
          const delay2 = Math.min(1e3 * 2 ** Math.min(recovery.retryAttempt, 5), 3e4);
          recovery.retryAttempt += 1;
          recovery.retryTimer = setTimeout(() => {
            recovery.retryTimer = null;
            if (this.pendingRecoveries.get(root) === recovery) this.resume();
          }, delay2);
          recovery.retryTimer.unref();
        }
      }
    }
  }
}
const WATCH_DEBOUNCE_MS = 1200;
const TAG_WRITE_REFRESH_SUPPRESS_MS = 8e3;
class MetadataWatchService {
  constructor(libraryRootRepository, trackRepository, metadataRefreshService, incrementalImportService, sendToRenderer) {
    this.libraryRootRepository = libraryRootRepository;
    this.trackRepository = trackRepository;
    this.importQueue = new MetadataWatchImportQueue(
      incrementalImportService,
      (filePath) => {
        if (!this.isCurrentPath(filePath)) return;
        this.state.pendingFilePaths.set(filePath, Date.now());
      },
      (delay2) => this.scheduleFlush(delay2),
      (filePath) => this.isCurrentPath(filePath)
    );
    this.rootWatchers = new MetadataRootWatchers(
      () => this.state.stopped,
      (path) => this.enqueueChangedPath(path),
      (rootPath, isCurrent) => this.recovery.enqueue(rootPath, isCurrent)
    );
    this.missingConfirmation = new MetadataMissingConfirmation(
      trackRepository,
      this.state.statRetries,
      sendToRenderer,
      {
        isStopped: () => this.state.stopped,
        isPathBusy: (filePath) => metadataRefreshService.isWritingFile?.(filePath) ?? false,
        isPaused: () => this.state.flushPaused,
        isPathActive: (filePath) => this.isCurrentPath(filePath),
        runOperation: (operation) => this.runOperation(operation)
      }
    );
    this.batch = new MetadataWatchBatch(this.state, {
      trackRepository,
      metadataRefreshService,
      importQueue: this.importQueue,
      missingConfirmation: this.missingConfirmation,
      isCurrentPath: (filePath) => this.isCurrentPath(filePath),
      scheduleFlush: (delay2) => this.scheduleFlush(delay2),
      hasScheduledFlush: () => this.flushTimer !== null
    });
    this.recovery = new MetadataWatchRecovery(this.state, {
      trackRepository,
      runOperation: (operation) => this.runOperation(operation),
      flushPending: (paths) => this.batch.flushPending(paths)
    });
  }
  state = createMetadataWatchState();
  /** Watch work that may eventually write to the library database. */
  activeOperations = /* @__PURE__ */ new Set();
  flushTimer = null;
  importQueue;
  rootWatchers;
  missingConfirmation;
  batch;
  recovery;
  start() {
    this.syncRoots();
  }
  async stop() {
    this.state.stopped = true;
    this.rootWatchers.close();
    this.recovery.clear();
    this.state.statRetries.clear();
    this.state.suppressRefreshUntil.clear();
    this.state.flushPaused = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.missingConfirmation.pause();
    while (this.activeOperations.size > 0) {
      await Promise.allSettled([...this.activeOperations]);
    }
    this.state.pendingFilePaths.clear();
    this.missingConfirmation.clear();
    this.state.pendingLyricsIntentPaths.clear();
    this.state.pendingArtworkIntentPaths.clear();
    this.importQueue.clearDeferred();
  }
  /**
   * Pause pending-file flush while a full library scan runs so watch imports
   * cannot race markMissingUnderRootExcept on scan complete.
   */
  async pauseFlush() {
    this.state.flushPaused = true;
    this.recovery.pause();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.missingConfirmation.pause();
    while (this.activeOperations.size > 0) {
      await Promise.allSettled([...this.activeOperations]);
    }
  }
  resumeFlush() {
    if (this.state.stopped) return;
    this.state.flushPaused = false;
    if (this.state.pendingFilePaths.size > 0) {
      this.scheduleFlush();
    }
    this.missingConfirmation.resume();
    this.recovery.resume();
  }
  /**
   * After a successful tag write, ignore watch-driven metadata refresh for this
   * path briefly so the write mtime change cannot clobber user_edit via refresh.
   */
  suppressRefreshForPath(filePath, durationMs = TAG_WRITE_REFRESH_SUPPRESS_MS) {
    const normalizedPath = normalizeAudioFilePath(filePath);
    this.state.suppressRefreshUntil.set(normalizedPath, Date.now() + durationMs);
  }
  syncRoots() {
    if (this.state.stopped) return;
    if (this.rootWatchers.sync(this.libraryRootRepository.list().map((root) => root.path))) {
      this.state.rootsVersion++;
    }
    for (const paths of [
      this.state.pendingFilePaths,
      this.state.pendingLyricsIntentPaths,
      this.state.pendingArtworkIntentPaths,
      this.state.statRetries,
      this.state.suppressRefreshUntil
    ]) {
      for (const filePath of paths.keys()) {
        if (!this.isCurrentPath(filePath)) paths.delete(filePath);
      }
    }
    this.missingConfirmation.pruneInactivePaths();
    this.importQueue.pruneInactivePaths();
    this.recovery.pruneInactiveRoots();
    if (this.state.pendingFilePaths.size === 0 && this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
  isCurrentPath(filePath) {
    return !this.state.stopped && this.rootWatchers.containsPath(filePath);
  }
  enqueueChangedPath(filePath) {
    if (!this.isCurrentPath(filePath)) return;
    if (win32.basename(filePath).toLowerCase() === "cover.jpg") {
      const directory = win32.dirname(filePath);
      const normalized = normalizeAudioFilePath(directory);
      const tracks = this.trackRepository.getWatchRecoveryTracks(directory);
      for (const track of tracks) {
        if (normalizeAudioFilePath(win32.dirname(track.filePath)) !== normalized || !this.isCurrentPath(track.filePath))
          continue;
        this.state.pendingFilePaths.set(track.filePath, Date.now());
        this.state.pendingArtworkIntentPaths.add(track.filePath);
      }
      if (this.state.pendingFilePaths.size) this.scheduleFlush();
      return;
    }
    if (isLyricSidecar(filePath)) {
      const audioCandidates = resolveAudioCandidatesForLyricSidecar(filePath);
      const knownAudioPaths = this.trackRepository.getExistingFilePaths(audioCandidates);
      for (const audioPath of knownAudioPaths) {
        if (!this.isCurrentPath(audioPath)) continue;
        this.state.pendingFilePaths.set(audioPath, Date.now());
        this.state.pendingLyricsIntentPaths.add(audioPath);
      }
      if (knownAudioPaths.size > 0) {
        this.scheduleFlush();
      }
      return;
    }
    if (!isSupportedAudioFile(filePath)) {
      return;
    }
    this.state.pendingFilePaths.set(filePath, Date.now());
    this.scheduleFlush();
  }
  scheduleFlush(delay2 = WATCH_DEBOUNCE_MS) {
    if (this.state.stopped || this.state.flushPaused) {
      return;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.runOperation(() => this.batch.flushPending());
    }, delay2);
  }
  runOperation(operation) {
    if (this.state.stopped) return;
    const promise = operation().catch((error) => {
      logger.warn({ error }, "Metadata watch operation failed");
    });
    this.activeOperations.add(promise);
    void promise.finally(() => this.activeOperations.delete(promise));
  }
}
const MAX_LRC_EDITOR_CHARACTERS = 128 * 1024;
class LyricsEditorError extends Error {
  constructor(code, recoveryBackupPath) {
    super(code);
    this.code = code;
    this.recoveryBackupPath = recoveryBackupPath;
    this.name = "LyricsEditorError";
  }
}
function editorFailure(error) {
  if (error instanceof LyricsEditorError) {
    return {
      ok: false,
      code: error.code,
      ...error.recoveryBackupPath ? { recoveryBackupPath: error.recoveryBackupPath } : {}
    };
  }
  if (["ENOENT", "ENOTDIR"].includes(error?.code ?? "")) {
    return { ok: false, code: "file-changed" };
  }
  return { ok: false, code: "save-failed" };
}
function isPathUnderRoot(filePath, rootPath) {
  const resolvedFile = resolve(filePath);
  const resolvedRoot = resolve(rootPath);
  const fileForCompare = process.platform === "win32" ? resolvedFile.toLowerCase() : resolvedFile;
  const rootForCompare = process.platform === "win32" ? resolvedRoot.toLowerCase() : resolvedRoot;
  const rel = relative(rootForCompare, fileForCompare);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return false;
  }
  return true;
}
function isPathUnderAnyRoot(filePath, rootPaths) {
  return rootPaths.some((rootPath) => isPathUnderRoot(filePath, rootPath));
}
const MAX_LYRICS_CHARACTERS = 8 * 1024 * 1024;
const pathKey = (path) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
const identity = (info) => ({
  size: info.size,
  mtimeMs: info.mtimeMs,
  ctimeMs: info.ctimeMs,
  ino: info.ino,
  dev: info.dev
});
const sameIdentity = (left, right) => JSON.stringify(left) === JSON.stringify(right);
async function authorizeLyricsPath(filePath, roots) {
  if (!filePath || !isSupportedAudioFile(filePath)) throw new LyricsEditorError("track-unavailable");
  let info;
  try {
    info = await lstat(filePath);
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code ?? ""))
      throw new LyricsEditorError("track-unavailable");
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) throw new LyricsEditorError("unsupported-file");
  const canonical = await realpath(filePath);
  const canonicalRoots = (await Promise.all(roots.map((root) => realpath(root).catch(() => null)))).filter((root) => root !== null);
  if (!isPathUnderAnyRoot(canonical, canonicalRoots)) throw new LyricsEditorError("outside-library");
  return canonical;
}
async function audioIdentity(filePath) {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new LyricsEditorError("file-changed");
  return identity(info);
}
async function readLyricFile(path) {
  let before;
  try {
    before = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT")
      return { path, identity: null, hash: null, text: null };
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_LYRICS_CHARACTERS * 4)
    throw new LyricsEditorError("unsupported-file");
  const file = await open(path, "r");
  try {
    if (!sameIdentity(identity(before), identity(await file.stat())))
      throw new LyricsEditorError("file-changed");
    const chunks = [];
    let total = 0;
    for (; ; ) {
      const buffer = Buffer.alloc(65536);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > MAX_LYRICS_CHARACTERS * 4) throw new LyricsEditorError("unsupported-file");
      chunks.push(buffer.subarray(0, bytesRead));
    }
    if (!sameIdentity(identity(before), identity(await file.stat())) || !sameIdentity(identity(before), identity(await lstat(path))))
      throw new LyricsEditorError("file-changed");
    const bytes = Buffer.concat(chunks);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new LyricsEditorError("unsupported-file");
    }
    if (text.length > MAX_LYRICS_CHARACTERS) throw new LyricsEditorError("unsupported-file");
    return {
      path,
      identity: identity(before),
      hash: createHash("sha256").update(bytes).digest("hex"),
      text
    };
  } finally {
    await file.close();
  }
}
async function captureLyricsFiles(filePath) {
  const seen = /* @__PURE__ */ new Set();
  const unique = lyricSidecarCandidates(filePath).filter((path) => {
    const key = pathKey(path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return Promise.all(unique.map(readLyricFile));
}
function sameLyricFiles(expected, actual, movedPath) {
  return expected.length === actual.length && expected.every((entry, index) => {
    const next = actual[index];
    if (pathKey(entry.path) !== pathKey(next.path)) return false;
    if (movedPath && pathKey(entry.path) === pathKey(movedPath)) return next.identity === null;
    return entry.hash === next.hash && JSON.stringify(entry.identity) === JSON.stringify(next.identity);
  });
}
async function publishLyricsFile(target, text, assertUnchanged) {
  const staging = `${target.path}.auralis-lyrics-staging-${randomUUID()}`;
  const probe = `${staging}.probe`;
  let stagingOwned = false;
  let probeOwned = false;
  let backupDirectory = null;
  let backupPath = null;
  let moved = false;
  let published = false;
  try {
    await assertUnchanged();
    const file = await open(
      staging,
      "wx",
      target.identity ? (await lstat(target.path)).mode & 511 : 384
    );
    stagingOwned = true;
    try {
      await file.writeFile(text, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await link(staging, probe);
    probeOwned = true;
    await unlink(probe);
    probeOwned = false;
    await assertUnchanged();
    if (target.identity) {
      backupDirectory = await mkdtemp(
        join(dirname(target.path), `${basename(target.path)}.auralis-backup-`)
      );
      backupPath = join(backupDirectory, basename(target.path));
      await rename(target.path, backupPath);
      moved = true;
      const captured = await readLyricFile(backupPath);
      const old = target.identity;
      const now = captured.identity;
      if (!now || captured.hash !== target.hash || now.ino !== old.ino || now.dev !== old.dev || now.size !== old.size || now.mtimeMs !== old.mtimeMs)
        throw new LyricsEditorError("file-changed");
      await assertUnchanged(target.path);
    }
    await link(staging, target.path);
    published = true;
    return { backupPath };
  } catch (error) {
    if (moved && !published && backupPath) {
      try {
        await link(backupPath, target.path);
      } catch {
        throw new LyricsEditorError("recovery-required", backupPath);
      }
    }
    if (error instanceof LyricsEditorError) throw error;
    if (error.code === "EEXIST")
      throw new LyricsEditorError("file-changed");
    throw new LyricsEditorError("save-failed");
  } finally {
    if (probeOwned) await unlink(probe).catch(() => void 0);
    if (stagingOwned) await unlink(staging).catch(() => void 0);
    if (backupDirectory && !moved) await rmdir(backupDirectory).catch(() => void 0);
  }
}
class LrcEditorService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.now = dependencies.now ?? Date.now;
  }
  sessions = /* @__PURE__ */ new Map();
  saving = /* @__PURE__ */ new Set();
  owners = /* @__PURE__ */ new Map();
  opening = 0;
  now;
  prune() {
    for (const [id, session] of this.sessions)
      if (!session.busy && this.now() - session.touched > 30 * 60 * 1e3) this.sessions.delete(id);
  }
  async unchanged(session, movedPath) {
    if (this.dependencies.getFilePath(session.trackId) !== session.dbPath)
      throw new LyricsEditorError("file-changed");
    const path = await authorizeLyricsPath(session.dbPath, this.dependencies.getRoots());
    if (pathKey(path) !== pathKey(session.path) || !sameIdentity(session.audio, await audioIdentity(path)) || !sameLyricFiles(session.sidecars, await captureLyricsFiles(path), movedPath))
      throw new LyricsEditorError("file-changed");
  }
  async open(owner, trackId) {
    this.prune();
    if (this.sessions.size + this.opening >= 8) throw new LyricsEditorError("too-many-sessions");
    this.opening++;
    const ownerVersion = this.owners.get(owner) ?? 0;
    try {
      const dbPath = this.dependencies.getFilePath(trackId);
      const path = await authorizeLyricsPath(dbPath, this.dependencies.getRoots());
      if (!dbPath) throw new LyricsEditorError("track-unavailable");
      const audio = await audioIdentity(path);
      const sidecars = await captureLyricsFiles(path);
      const source2 = await this.dependencies.readSource(path);
      if (source2?.lyricsFormat === "ttml") throw new LyricsEditorError("unsupported-format");
      const text = source2?.lyricsText ?? "";
      if (text.length > MAX_LRC_EDITOR_CHARACTERS)
        throw new LyricsEditorError("unsupported-document");
      const session = {
        id: randomUUID(),
        owner,
        trackId,
        dbPath,
        path,
        audio,
        sidecars,
        revision: createHash("sha256").update(text).digest("hex"),
        format: source2?.lyricsFormat ?? "plain",
        tagWriteProtected: source2?.hasEmbeddedTtml === true,
        touched: this.now(),
        busy: false
      };
      await this.unchanged(session);
      if ((this.owners.get(owner) ?? 0) !== ownerVersion)
        throw new LyricsEditorError("session-expired");
      for (const file of sidecars) file.text = null;
      this.sessions.set(session.id, session);
      return {
        sessionId: session.id,
        trackId,
        revision: session.revision,
        text,
        format: session.format,
        canSaveTag: LYRICS_TAG_EXTENSIONS.has(extname(path).toLowerCase()) && !session.tagWriteProtected,
        ...session.tagWriteProtected ? { tagWriteProtected: true } : {}
      };
    } finally {
      this.opening--;
    }
  }
  async save(owner, request) {
    this.prune();
    const session = this.sessions.get(request.sessionId);
    if (!session || session.owner !== owner) throw new LyricsEditorError("session-expired");
    if (session.busy || this.saving.has(pathKey(session.path))) throw new LyricsEditorError("busy");
    if (request.expectedRevision !== session.revision) throw new LyricsEditorError("stale-revision");
    if (typeof request.text !== "string" || request.text.length > MAX_LRC_EDITOR_CHARACTERS || request.text.includes("\0") || !["tag", "file"].includes(request.target) || /<\s*(?:\w+:)?tt\b/i.test(request.text))
      throw new LyricsEditorError("invalid-request");
    if (request.target === "tag" && session.tagWriteProtected)
      throw new LyricsEditorError("unsupported-format");
    if (request.target === "tag" && !LYRICS_TAG_EXTENSIONS.has(extname(session.path).toLowerCase()))
      throw new LyricsEditorError("unsupported-file");
    session.busy = true;
    session.touched = this.now();
    const key = pathKey(session.path);
    this.saving.add(key);
    let backupPath = null;
    let writeWarning = false;
    try {
      await this.unchanged(session);
      if (request.target === "tag") {
        writeWarning = (await this.dependencies.writeTag(
          session.trackId,
          request.text,
          () => this.unchanged(session)
        )).warning;
      } else {
        const targetPath = `${session.path.slice(0, -extname(session.path).length)}.lrc`;
        const target = session.sidecars.find((file) => pathKey(file.path) === pathKey(targetPath));
        if (!target) throw new LyricsEditorError("unsupported-file");
        backupPath = (await publishLyricsFile(target, request.text, (moved) => this.unchanged(session, moved))).backupPath;
      }
      this.sessions.delete(session.id);
      let reconciliation = { cacheUpdated: false, active: false };
      try {
        reconciliation = await this.dependencies.reconcile(
          session.trackId,
          session.dbPath,
          request.text
        );
      } catch {
      }
      return {
        trackId: session.trackId,
        backupPath,
        writeWarning,
        ...reconciliation
      };
    } finally {
      session.busy = false;
      this.saving.delete(key);
    }
  }
  close(owner, id) {
    const session = this.sessions.get(id);
    if (!session || session.owner !== owner) return;
    if (session.busy) throw new LyricsEditorError("busy");
    this.sessions.delete(id);
  }
  releaseOwner(owner) {
    this.owners.set(owner, (this.owners.get(owner) ?? 0) + 1);
    for (const session of this.sessions.values())
      if (session.owner === owner && !session.busy) this.sessions.delete(session.id);
  }
  dispose() {
    this.sessions.clear();
    this.owners.clear();
  }
}
class StartupAlbumWorkerHost {
  constructor(databasePath2, options = {}) {
    this.databasePath = databasePath2;
    this.options = options;
  }
  active = null;
  stopping = false;
  getStartupAlbumTracks(history = []) {
    if (this.stopping) return Promise.reject(new Error("Startup album worker is shutting down"));
    if (this.active) return Promise.reject(new Error("Startup album query is already running"));
    if (!this.databasePath || this.databasePath === ":memory:") {
      return Promise.reject(new Error("Startup album worker requires an initialized file database"));
    }
    return new Promise((resolve2, reject) => {
      const input = { databasePath: this.databasePath, history };
      const worker = new Worker(
        this.options.workerPath ?? join(__dirname, "features/startupAlbum/startupAlbumWorker.js"),
        { workerData: input }
      );
      let settled = false;
      let exited = false;
      let stopping;
      const stop = () => {
        if (exited) return Promise.resolve();
        if (!stopping) {
          stopping = worker.terminate().then(
            () => {
              exited = true;
            },
            (error) => {
              stopping = void 0;
              throw error;
            }
          );
        }
        return stopping;
      };
      const finish = (error, album = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void stop().then(() => {
          if (this.active === query) this.active = null;
          if (error) reject(error);
          else resolve2(album);
        }, reject);
      };
      const query = { finish, stop };
      this.active = query;
      const timer = setTimeout(
        () => finish(new Error("Startup album query timed out")),
        this.options.timeoutMs ?? 5e3
      );
      worker.on("message", (message) => {
        if (message.type === "result") finish(void 0, message.album);
        else finish(new Error(message.reason));
      });
      worker.on("error", (error) => finish(error));
      worker.on("exit", (code) => {
        exited = true;
        finish(new Error(`Startup album worker exited without a result (code ${code})`));
      });
    });
  }
  async shutdown() {
    this.stopping = true;
    const query = this.active;
    if (!query) return;
    query.finish(new Error("Application shutdown interrupted startup album query"));
    await query.stop();
    if (this.active === query) this.active = null;
  }
}
function exportFileName(now) {
  return `Auralis-diagnostics-${now.toISOString().slice(0, 10)}.jsonl`;
}
function chronologicalLogFileNames(logsDirectory) {
  const names = listManagedLogFileNames(logsDirectory);
  return names.sort((left, right) => {
    const archiveIndex = (name) => {
      if (name === "auralis.log") return 0;
      return Number(/^auralis\.(\d+)\.log$/.exec(name)?.[1] ?? 0);
    };
    return archiveIndex(right) - archiveIndex(left);
  });
}
async function exportDiagnostics(options) {
  const now = options.now?.() ?? /* @__PURE__ */ new Date();
  const selection = await options.showSaveDialog({
    defaultPath: exportFileName(now),
    filters: [{ name: "JSON Lines", extensions: ["jsonl"] }]
  });
  if (selection.canceled || !selection.filePath) return { status: "cancelled" };
  try {
    flushLogger();
    const logFileNames = chronologicalLogFileNames(options.logsDirectory);
    const lines = [
      JSON.stringify({
        type: "auralis-diagnostic-export",
        generatedAt: now.toISOString(),
        app: { name: "Auralis", version: options.appVersion },
        runtime: {
          platform: options.platform ?? process.platform,
          architecture: options.architecture ?? process.arch
        },
        privacy: {
          localOnly: true,
          databaseIncluded: false,
          musicFilesIncluded: false,
          pathsAndUrlsRedacted: true
        },
        retention: {
          maximumFileBytes: DEFAULT_LOG_FILE_BYTES,
          maximumFileCount: DEFAULT_LOG_FILE_COUNT
        },
        includedLogFiles: logFileNames.length
      })
    ];
    for (const fileName of logFileNames) {
      if (basename(fileName) !== fileName) continue;
      try {
        const content = await readFile(join(options.logsDirectory, fileName), "utf8");
        for (const line of content.split(/\r?\n/)) {
          if (line.length > 0) lines.push(sanitizeSerializedLogLine(line));
        }
      } catch {
      }
    }
    await writeFile(selection.filePath, `${lines.join("\n")}
`, { encoding: "utf8" });
    return { status: "saved" };
  } catch {
    return { status: "failed" };
  }
}
class LibraryRepository extends BaseRepository {
  cachedStats;
  getStats() {
    const externalTransaction = this.db.inTransaction;
    const result = this.db.transaction(() => {
      const revision = this.db.prepare("SELECT CAST(revision AS TEXT) FROM library_catalog_revision WHERE id = 1").pluck().get();
      if (!externalTransaction && this.cachedStats?.revision === revision) return this.cachedStats;
      const trackCount = this.db.prepare("SELECT COUNT(*) FROM tracks").pluck().get();
      const albumCount = this.db.prepare(
        `
          SELECT COUNT(*) FROM (
            SELECT COALESCE(NULLIF(album_artist, ''), NULLIF(artist, ''), 'Unknown Artist'),
                   COALESCE(NULLIF(album, ''), 'Unknown Album')
            FROM library_track_display WHERE availability = 'available'
            GROUP BY 1, 2
          )
        `
      ).pluck().get();
      return { revision, stats: { trackCount, albumCount } };
    })();
    if (!externalTransaction) this.cachedStats = result;
    return { ...result.stats };
  }
}
function resolveArtworkKeyForUserEdit(trackMetadataKey, albumKey2) {
  if (trackMetadataKey) return trackMetadataKey;
  if (albumKey2) return albumKey2;
  return null;
}
class UserEditedMetadataWriter {
  constructor(db) {
    this.db = db;
  }
  getEditableTrackMetadata(trackId) {
    const row = this.db.prepare(
      `SELECT id AS trackId,
                title,
                artist AS artistDisplay,
                album AS albumTitle,
                album_artist AS albumArtistDisplay,
                genre AS genreDisplay,
                year,
                release_date AS releaseDate
         FROM library_track_display
         WHERE id = ?`
    ).get(trackId);
    return row ?? null;
  }
  updateUserEditedMetadata(metadata) {
    const update = this.db.transaction((item) => {
      const existing = this.getEditableTrackMetadata(item.trackId);
      if (!existing) {
        throw new Error(`Track not found: ${item.trackId}`);
      }
      const title = normalizeEditableText(item.title);
      const artistDisplay = normalizeEditableText(item.artistDisplay);
      const albumTitle = normalizeEditableText(item.albumTitle);
      const albumArtistDisplay = normalizeEditableText(item.albumArtistDisplay);
      const genreDisplay = normalizeEditableText(item.genreDisplay);
      const releaseDate = normalizeEditableReleaseDate(item.releaseDate);
      const year = normalizeEditableYear(item.year);
      const existingArtwork = this.db.prepare(
        `SELECT tm.artwork_cache_key AS trackMetadataKey,
                  d.artwork_cache_key AS albumKey
           FROM tracks t
           LEFT JOIN track_metadata tm ON tm.track_id = t.id
           LEFT JOIN library_track_display d ON d.id = t.id
           WHERE t.id = ?`
      ).get(item.trackId);
      const artworkCacheKey = resolveArtworkKeyForUserEdit(
        existingArtwork?.trackMetadataKey,
        existingArtwork?.albumKey
      );
      this.db.prepare(
        `INSERT INTO track_metadata (
            track_id,
            title,
            artist_display,
            album_title,
            album_artist_display,
            genre_display,
            year,
            release_date,
            artwork_cache_key,
            source,
            override_mask,
            refreshed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'legacy_user_edit', ${ALL_METADATA_OVERRIDES}, CURRENT_TIMESTAMP)
          ON CONFLICT(track_id) DO UPDATE SET
            title = excluded.title,
            artist_display = excluded.artist_display,
            album_title = excluded.album_title,
            album_artist_display = excluded.album_artist_display,
            genre_display = excluded.genre_display,
            year = excluded.year,
            release_date = excluded.release_date,
            artwork_cache_key = COALESCE(
              track_metadata.artwork_cache_key,
              excluded.artwork_cache_key
            ),
            source = excluded.source,
            override_mask = excluded.override_mask,
            refreshed_at = CURRENT_TIMESTAMP`
      ).run(
        item.trackId,
        title,
        artistDisplay,
        albumTitle,
        albumArtistDisplay,
        genreDisplay,
        year,
        releaseDate,
        artworkCacheKey
      );
      replaceMetadataTrackArtists(
        item.trackId,
        artistDisplay ? splitDelimitedValues(artistDisplay) : [],
        "primary",
        this.db.prepare(`
          INSERT INTO artists (name)
          VALUES (?)
          ON CONFLICT(name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        `),
        this.db.prepare(`
          SELECT id
          FROM artists
          WHERE name = ?
        `),
        this.db.prepare(`
          DELETE FROM track_artists
          WHERE track_id = ?
            AND role = ?
        `),
        this.db.prepare(`
          INSERT OR IGNORE INTO track_artists (track_id, artist_id, position, role)
          VALUES (?, ?, ?, ?)
        `)
      );
      replaceMetadataTrackArtists(
        item.trackId,
        albumArtistDisplay ? splitDelimitedValues(albumArtistDisplay) : [],
        "album_artist",
        this.db.prepare(`
          INSERT INTO artists (name)
          VALUES (?)
          ON CONFLICT(name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        `),
        this.db.prepare(`
          SELECT id
          FROM artists
          WHERE name = ?
        `),
        this.db.prepare(`
          DELETE FROM track_artists
          WHERE track_id = ?
            AND role = ?
        `),
        this.db.prepare(`
          INSERT OR IGNORE INTO track_artists (track_id, artist_id, position, role)
          VALUES (?, ?, ?, ?)
        `)
      );
      this.db.prepare(
        `UPDATE tracks
           SET title = ?,
               artist = ?,
               album = ?,
               album_artist = ?,
               year = ?,
               release_date = ?,
               genre = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
      ).run(
        title,
        artistDisplay,
        albumTitle,
        albumArtistDisplay,
        year,
        releaseDate,
        genreDisplay,
        item.trackId
      );
    });
    update(normalizeEditableMetadata(metadata));
  }
}
class MetadataTrackWriter {
  constructor(db) {
    this.db = db;
  }
  updateTrackMetadata(result) {
    const project = prepareFileMetadataProjection(this.db);
    const upsertTrackMetadata = this.db.prepare(`
      INSERT INTO track_metadata (
        track_id,
        title,
        artist_display,
        album_title,
        album_artist_display,
        genre_display,
        year,
        release_date,
        lyrics_text,
        lyrics_format,
        artwork_cache_key,
        source,
        refreshed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'file_tag', CURRENT_TIMESTAMP)
      ON CONFLICT(track_id) DO UPDATE SET
        title = excluded.title,
        artist_display = excluded.artist_display,
        album_title = excluded.album_title,
        album_artist_display = excluded.album_artist_display,
        genre_display = excluded.genre_display,
        year = excluded.year,
        release_date = excluded.release_date,
        lyrics_text = excluded.lyrics_text,
        lyrics_format = excluded.lyrics_format,
        artwork_cache_key = CASE
          WHEN excluded.artwork_cache_key LIKE 'v2-%.webp'
            AND (
              track_metadata.artwork_cache_key IS NULL
              OR track_metadata.artwork_cache_key NOT LIKE 'v2-%.webp'
            )
          THEN excluded.artwork_cache_key
          ELSE track_metadata.artwork_cache_key
        END,
        source = excluded.source,
        refreshed_at = CURRENT_TIMESTAMP
      WHERE track_metadata.source NOT IN ('user_edit', 'legacy_user_edit')
    `);
    const updateTrackTechnical = this.db.prepare(`
      UPDATE tracks
      SET track_no = ?,
          disc_no = ?,
          duration_seconds = ?,
          bitrate_bps = ?,
          codec = ?,
          copyright = ?,
          composer = ?,
          lyrics_text = ?,
          lyrics_format = ?,
          isrc = ?,
          metadata_signature = ?,
          file_size = ?,
          file_mtime_ms = ?,
          lyrics_checked_mtime_ms = ?,
          lyrics_sidecar_fingerprint = NULL,
          metadata_checked_mtime_ms = ?,
          metadata_parser_version = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND file_path = ?
    `);
    const updateTrackFull = this.db.prepare(`
      UPDATE tracks
      SET title = ?,
          artist = ?,
          album = ?,
          album_artist = ?,
          track_no = ?,
          disc_no = ?,
          duration_seconds = ?,
          bitrate_bps = ?,
          codec = ?,
          year = ?,
          release_date = ?,
          copyright = ?,
          composer = ?,
          genre = ?,
          lyrics_text = ?,
          lyrics_format = ?,
          isrc = ?,
          metadata_signature = ?,
          file_size = ?,
          file_mtime_ms = ?,
          lyrics_checked_mtime_ms = ?,
          lyrics_sidecar_fingerprint = NULL,
          metadata_checked_mtime_ms = ?,
          metadata_parser_version = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND file_path = ?
    `);
    const patchUserEditSideData = this.db.prepare(`
      UPDATE track_metadata
      SET lyrics_text = ?,
          lyrics_format = ?,
          artwork_cache_key = CASE
            WHEN ? LIKE 'v2-%.webp'
              AND (
                artwork_cache_key IS NULL
                OR artwork_cache_key NOT LIKE 'v2-%.webp'
              )
            THEN ?
            ELSE artwork_cache_key
          END,
          refreshed_at = CURRENT_TIMESTAMP
      WHERE track_id = ?
        AND source IN ('user_edit', 'legacy_user_edit')
    `);
    const upsertAlbum = this.db.prepare(`
      INSERT INTO albums (title, artist, artwork_cache_key)
      VALUES (?, ?, ?)
      ON CONFLICT(title, artist) DO UPDATE SET
        artwork_cache_key = CASE
          WHEN excluded.artwork_cache_key LIKE 'v2-%.webp'
            AND (
              albums.artwork_cache_key IS NULL
              OR albums.artwork_cache_key NOT LIKE 'v2-%.webp'
            )
          THEN excluded.artwork_cache_key
          ELSE albums.artwork_cache_key
        END,
        updated_at = CURRENT_TIMESTAMP
    `);
    const upsertArtist = this.db.prepare(`
      INSERT INTO artists (name)
      VALUES (?)
      ON CONFLICT(name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    `);
    const getArtistId = this.db.prepare(`
      SELECT id
      FROM artists
      WHERE name = ?
    `);
    const deleteTrackArtists = this.db.prepare(`
      DELETE FROM track_artists
      WHERE track_id = ?
        AND role = ?
    `);
    const insertTrackArtist = this.db.prepare(`
      INSERT OR IGNORE INTO track_artists (track_id, artist_id, position, role)
      VALUES (?, ?, ?, ?)
    `);
    const write = this.db.transaction((metadata) => {
      this.assertTrackIdentity(metadata);
      const previous = captureArtworkAlbum(this.db, metadata.trackId);
      this.db.prepare("UPDATE tracks SET file_stat_fingerprint = ? WHERE id = ? AND file_path = ?").run(
        encodeScanFileFingerprint(metadata.fileFingerprint),
        metadata.trackId,
        metadata.sourceFilePath
      );
      const existingSource = this.db.prepare("SELECT source FROM track_metadata WHERE track_id = ?").get(metadata.trackId);
      const preserveUserEdit = existingSource?.source === "user_edit" || existingSource?.source === "legacy_user_edit";
      const artists = cleanDelimitedValues(
        metadata.artists.length > 0 ? metadata.artists : [metadata.artistDisplay || metadata.artist]
      );
      const artistDisplay = joinDelimitedValues(artists) || "Unknown Artist";
      const albumTitle = metadata.albumTitle || metadata.album;
      const albumArtists = cleanDelimitedValues(
        metadata.albumArtists.length > 0 ? metadata.albumArtists : [metadata.albumArtistDisplay || metadata.albumArtist || artistDisplay]
      );
      const albumArtistDisplay = joinDelimitedValues(albumArtists) || artistDisplay;
      const genreDisplay = joinDelimitedValues(
        cleanDelimitedValues(metadata.genres.length > 0 ? metadata.genres : [metadata.genre])
      );
      const copyright = canonicalizeDelimitedValues(metadata.copyright);
      const composer = canonicalizeDelimitedValues(metadata.composer);
      if (preserveUserEdit) {
        patchUserEditSideData.run(
          metadata.lyricsText,
          metadata.lyricsFormat,
          metadata.artworkCacheKey,
          metadata.artworkCacheKey,
          metadata.trackId
        );
        updateTrackTechnical.run(
          metadata.trackNo,
          metadata.discNo,
          metadata.durationSeconds,
          metadata.bitrateBps,
          metadata.codec ?? null,
          copyright,
          composer,
          metadata.lyricsText,
          metadata.lyricsFormat,
          metadata.isrc,
          metadata.metadataSignature,
          metadata.fileSize,
          metadata.fileMtimeMs,
          metadata.fileMtimeMs,
          metadata.fileMtimeMs,
          metadata.metadataParserVersion ?? "",
          metadata.trackId,
          metadata.sourceFilePath
        );
        project(metadata.trackId, metadata.sourceFilePath, metadata.fileTags, metadata, previous);
        return;
      }
      upsertTrackMetadata.run(
        metadata.trackId,
        metadata.title,
        artistDisplay,
        albumTitle,
        albumArtistDisplay,
        genreDisplay,
        metadata.year,
        metadata.releaseDate,
        metadata.lyricsText,
        metadata.lyricsFormat,
        metadata.artworkCacheKey
      );
      updateTrackFull.run(
        metadata.title,
        artistDisplay,
        albumTitle,
        albumArtistDisplay,
        metadata.trackNo,
        metadata.discNo,
        metadata.durationSeconds,
        metadata.bitrateBps,
        metadata.codec ?? null,
        metadata.year,
        metadata.releaseDate,
        copyright,
        composer,
        genreDisplay,
        metadata.lyricsText,
        metadata.lyricsFormat,
        metadata.isrc,
        metadata.metadataSignature,
        metadata.fileSize,
        metadata.fileMtimeMs,
        metadata.fileMtimeMs,
        metadata.fileMtimeMs,
        metadata.metadataParserVersion ?? "",
        metadata.trackId,
        metadata.sourceFilePath
      );
      upsertAlbum.run(albumTitle, albumArtistDisplay, metadata.artworkCacheKey);
      replaceMetadataTrackArtists(
        metadata.trackId,
        artists,
        "primary",
        upsertArtist,
        getArtistId,
        deleteTrackArtists,
        insertTrackArtist
      );
      replaceMetadataTrackArtists(
        metadata.trackId,
        albumArtists,
        "album_artist",
        upsertArtist,
        getArtistId,
        deleteTrackArtists,
        insertTrackArtist
      );
      project(metadata.trackId, metadata.sourceFilePath, metadata.fileTags, metadata, previous);
    });
    write(result);
  }
  updateTrackLyrics(result) {
    this.db.transaction(() => {
      const fingerprint = this.assertTrackIdentity(result);
      if (fingerprint.fileSize !== result.fileSize || fingerprint.fileMtimeMs !== result.fileMtimeMs) {
        this.updateTrackMetadata(result);
        return;
      }
      this.db.prepare(
        `UPDATE tracks
         SET lyrics_text = ?,
             lyrics_format = ?,
             lyrics_checked_mtime_ms = ?,
             lyrics_sidecar_fingerprint = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND file_path = ?`
      ).run(
        result.lyricsText,
        result.lyricsFormat,
        result.fileMtimeMs,
        result.trackId,
        result.sourceFilePath
      );
      this.db.prepare(
        `UPDATE track_metadata
         SET lyrics_text = ?,
             lyrics_format = ?,
             refreshed_at = CURRENT_TIMESTAMP
         WHERE track_id = ?`
      ).run(result.lyricsText, result.lyricsFormat, result.trackId);
    })();
  }
  assertTrackIdentity(result) {
    if (!Number.isSafeInteger(result.fileSize) || result.fileSize < 0 || !Number.isFinite(result.fileMtimeMs)) {
      throw new Error("Invalid metadata file fingerprint");
    }
    const row = this.db.prepare(
      `SELECT file_size AS fileSize, file_mtime_ms AS fileMtimeMs
      FROM tracks WHERE id = ? AND file_path = ?`
    ).get(result.trackId, result.sourceFilePath);
    if (!row) throw new Error("Metadata track identity changed or track was removed");
    return row;
  }
}
function isUnderRoot(filePath, root) {
  const path = resolve(filePath);
  const base = resolve(root);
  const rel = relative(
    process.platform === "win32" ? base.toLowerCase() : base,
    process.platform === "win32" ? path.toLowerCase() : path
  );
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function clampLimit(limit, fallback = 5e3, max = 1e4) {
  if (limit === void 0 || !Number.isFinite(limit) || !Number.isInteger(limit)) {
    return fallback;
  }
  return Math.min(Math.max(limit, 1), max);
}
class MetadataRefreshRepository extends BaseRepository {
  userEditWriter;
  trackWriter;
  constructor(db) {
    super(db);
    this.userEditWriter = new UserEditedMetadataWriter(db);
    this.trackWriter = new MetadataTrackWriter(db);
  }
  createJob(scope, totalTracks) {
    const result = this.db.prepare(
      `INSERT INTO metadata_refresh_jobs (scope, status, total_tracks)
         VALUES (?, 'running', ?)`
    ).run(scope, totalTracks);
    return Number(result.lastInsertRowid);
  }
  updateJobProgress(jobId, processed, failed) {
    const result = this.db.prepare(
      `UPDATE metadata_refresh_jobs
         SET processed_tracks = ?, failed_tracks = ?
         WHERE id = ?
           AND status = 'running'`
    ).run(processed, failed, jobId);
    return result.changes > 0;
  }
  completeJob(jobId, errorMessage) {
    const result = this.db.prepare(
      `UPDATE metadata_refresh_jobs
         SET status = CASE WHEN ? IS NULL THEN 'completed' ELSE 'failed' END,
             finished_at = CURRENT_TIMESTAMP,
             error_message = ?
         WHERE id = ?
           AND status = 'running'`
    ).run(errorMessage ?? null, errorMessage ?? null, jobId);
    return result.changes > 0;
  }
  markInterruptedJobs() {
    this.db.prepare(
      `UPDATE metadata_refresh_jobs
         SET status = 'failed',
             finished_at = CURRENT_TIMESTAMP,
             error_message = 'Refresh interrupted by application shutdown'
         WHERE status = 'running'`
    ).run();
  }
  addFailure(jobId, trackId, filePath, reason) {
    this.db.prepare(
      `INSERT INTO metadata_refresh_failures (job_id, track_id, file_path, reason)
         VALUES (?, ?, ?, ?)`
    ).run(jobId, trackId, filePath, reason);
  }
  listFailures(limit = 20) {
    this.db.prepare(
      `DELETE FROM metadata_refresh_failures
         WHERE track_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM tracks
             WHERE tracks.id = metadata_refresh_failures.track_id
               AND tracks.availability = 'available'
           )`
    ).run();
    return this.db.prepare(
      `SELECT id,
                job_id AS jobId,
                track_id AS trackId,
                file_path AS filePath,
                reason,
                created_at AS createdAt
         FROM metadata_refresh_failures
         ORDER BY id DESC
         LIMIT ?`
    ).all(Math.min(Math.max(limit, 1), 100));
  }
  clearFailures() {
    return this.db.prepare("DELETE FROM metadata_refresh_failures").run().changes;
  }
  markTrackMissing(trackId) {
    this.db.prepare(
      `UPDATE tracks
         SET availability = 'missing',
             missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND availability = 'available'`
    ).run(trackId);
    this.db.prepare(
      `DELETE FROM metadata_refresh_failures
         WHERE track_id = ?`
    ).run(trackId);
  }
  getTrackFilePath(trackId) {
    const row = this.db.prepare(
      `SELECT file_path AS filePath
         FROM tracks
         WHERE id = ?
           AND availability = 'available'`
    ).get(trackId);
    return row?.filePath ?? null;
  }
  getActiveJob() {
    const row = this.db.prepare(
      `SELECT id, scope, status,
                total_tracks AS totalTracks,
                processed_tracks AS processedTracks,
                failed_tracks AS failedTracks,
                started_at AS startedAt,
                finished_at AS finishedAt,
                error_message AS errorMessage
         FROM metadata_refresh_jobs
         WHERE status = 'running'
         ORDER BY id DESC
         LIMIT 1`
    ).get();
    return row ?? null;
  }
  getJobById(jobId) {
    const row = this.db.prepare(
      `SELECT id, scope, status,
                total_tracks AS totalTracks,
                processed_tracks AS processedTracks,
                failed_tracks AS failedTracks,
                started_at AS startedAt,
                finished_at AS finishedAt,
                error_message AS errorMessage
         FROM metadata_refresh_jobs
         WHERE id = ?`
    ).get(jobId);
    return row ?? null;
  }
  pruneLegacyLyricsJobs() {
    this.db.transaction(() => {
      this.db.prepare(
        `DELETE FROM metadata_refresh_failures WHERE job_id IN
        (SELECT id FROM metadata_refresh_jobs WHERE scope = 'legacy-lyrics' AND status != 'running')`
      ).run();
      this.db.prepare(
        "DELETE FROM metadata_refresh_jobs WHERE scope = 'legacy-lyrics' AND status != 'running'"
      ).run();
    })();
  }
  legacyLyricsRoots() {
    return this.db.prepare("SELECT path FROM library_roots").all().map(
      (row) => row.path
    );
  }
  getLegacyTtmlTracks(afterId, limit) {
    const roots = this.legacyLyricsRoots();
    if (!roots.length) return [];
    const candidates = this.db.prepare(
      `SELECT id AS trackId, file_path AS filePath FROM tracks
      WHERE lyrics_format = 'ttml' AND id > ? ORDER BY id ASC`
    ).iterate(afterId);
    const result = [];
    for (const track of candidates) {
      if (roots.some((root) => isUnderRoot(track.filePath, root))) result.push(track);
      if (result.length >= clampLimit(limit)) break;
    }
    return result;
  }
  getLegacyTtmlFilePath(trackId) {
    const row = this.db.prepare("SELECT file_path AS filePath FROM tracks WHERE id = ? AND lyrics_format = 'ttml'").get(trackId);
    return row && this.legacyLyricsRoots().some((root) => isUnderRoot(row.filePath, root)) ? row.filePath : null;
  }
  updateLegacyTtmlLyrics(result, fingerprint) {
    return this.db.transaction(() => {
      if (this.getLegacyTtmlFilePath(result.trackId) !== result.sourceFilePath) return false;
      const updated = this.db.prepare(
        `UPDATE tracks SET lyrics_text = ?, lyrics_format = ?,
        lyrics_checked_mtime_ms = ?, lyrics_sidecar_fingerprint = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND file_path = ? AND lyrics_format = 'ttml'`
      ).run(
        result.lyricsText,
        result.lyricsFormat,
        result.fileMtimeMs,
        fingerprint,
        result.trackId,
        result.sourceFilePath
      );
      if (!updated.changes) return false;
      this.db.prepare(
        `UPDATE track_metadata SET lyrics_text = ?, lyrics_format = ?, refreshed_at = CURRENT_TIMESTAMP WHERE track_id = ?`
      ).run(result.lyricsText, result.lyricsFormat, result.trackId);
      return true;
    })();
  }
  getTracksWithMissingLyrics(limit) {
    return this.db.prepare(
      `SELECT id AS trackId, file_path AS filePath
         FROM tracks
         WHERE availability = 'available'
           AND lyrics_checked_mtime_ms IS NULL
         ORDER BY id ASC
         LIMIT ?`
    ).all(clampLimit(limit));
  }
  getTracksByIds(trackIds) {
    const uniqueIds = [...new Set(trackIds)].filter(
      (trackId) => Number.isInteger(trackId) && trackId > 0
    );
    if (uniqueIds.length === 0) {
      return [];
    }
    const tracks = [];
    for (let index = 0; index < uniqueIds.length; index += 400) {
      const batch = uniqueIds.slice(index, index + 400);
      const placeholders = batch.map(() => "?").join(", ");
      tracks.push(
        ...this.db.prepare(
          `SELECT id AS trackId, file_path AS filePath
             FROM tracks
             WHERE id IN (${placeholders})
               AND availability = 'available'
             ORDER BY id ASC`
        ).all(...batch)
      );
    }
    return tracks;
  }
  getEditableTrackMetadata(trackId) {
    return this.userEditWriter.getEditableTrackMetadata(trackId);
  }
  getMetadataEditRevision(trackId) {
    return JSON.stringify(
      this.db.prepare(
        `SELECT t.file_path,t.title,t.artist,t.album,t.album_artist,t.genre,t.year,t.release_date,
      tm.title AS override_title,tm.artist_display,tm.album_title,tm.album_artist_display,tm.genre_display,
      tm.year AS override_year,tm.release_date AS override_date,tm.source,tm.override_mask
      FROM tracks t LEFT JOIN track_metadata tm ON tm.track_id=t.id WHERE t.id=?`
      ).get(trackId) ?? null
    );
  }
  getMetadataFileFingerprint(trackId) {
    return decodeScanFileFingerprint(
      this.db.prepare("SELECT file_stat_fingerprint FROM tracks WHERE id=?").pluck().get(trackId)
    );
  }
  getLegacyMetadata(trackId) {
    const row = this.db.prepare(
      `SELECT 1 FROM track_metadata WHERE track_id=?
      AND (override_mask!=0 OR source IN ('user_edit','legacy_user_edit'))`
    ).get(trackId);
    return row ? this.getEditableTrackMetadata(trackId) : null;
  }
  adoptFileMetadata(trackId, path, tags, expectedRevision) {
    this.db.transaction(() => {
      const previous = captureArtworkAlbum(this.db, trackId);
      if (this.getMetadataEditRevision(trackId) !== expectedRevision || this.getTrackFilePath(trackId) !== path)
        throw new Error("Metadata changed before adopting file values");
      this.db.prepare(`UPDATE track_metadata SET source='file_tag',override_mask=0 WHERE track_id=?`).run(trackId);
      prepareFileMetadataProjection(this.db)(trackId, path, tags, {}, previous);
    })();
  }
  commitVerifiedFileEdit(result) {
    this.db.transaction(() => {
      this.trackWriter.assertTrackIdentity(result);
      const previous = captureArtworkAlbum(this.db, result.trackId);
      this.db.prepare(`UPDATE track_metadata SET source='file_tag',override_mask=0 WHERE track_id=?`).run(result.trackId);
      this.updateTrackMetadata(result);
      if (previous) refreshArtworkAlbum(this.db, previous);
    })();
  }
  updateUserEditedMetadata(metadata) {
    this.userEditWriter.updateUserEditedMetadata(metadata);
  }
  updateTrackMetadata(result) {
    this.trackWriter.updateTrackMetadata(result);
  }
  updateTrackLyrics(result) {
    this.trackWriter.updateTrackLyrics(result);
  }
  commitVerifiedUserEdit(metadata, result) {
    this.db.transaction(() => {
      if (metadata.trackId !== result.trackId) throw new Error("Metadata track identity changed");
      this.trackWriter.assertTrackIdentity(result);
      this.updateUserEditedMetadata(metadata);
      this.updateTrackMetadata(result);
    })();
  }
}
function toPlaylist(row) {
  return {
    id: row.id,
    name: row.name,
    viewMode: row.viewMode,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
class PlaylistRepository extends BaseRepository {
  list() {
    const rows = this.db.prepare(
      `SELECT id, name, view_mode AS viewMode,
                sort_order AS sortOrder,
                created_at AS createdAt, updated_at AS updatedAt
         FROM playlists
         ORDER BY sort_order ASC, id ASC`
    ).all();
    return rows.map(toPlaylist);
  }
  getById(id) {
    const row = this.db.prepare(
      `SELECT id, name, view_mode AS viewMode,
                sort_order AS sortOrder,
                created_at AS createdAt, updated_at AS updatedAt
         FROM playlists
         WHERE id = ?`
    ).get(id);
    return row ? toPlaylist(row) : null;
  }
  getTrackIds(id) {
    const rows = this.db.prepare(
      `SELECT track_id AS trackId
         FROM playlist_tracks
         WHERE playlist_id = ?
         ORDER BY position ASC, track_id ASC`
    ).all(id);
    return rows.map((row) => row.trackId);
  }
  /** Available playlist tracks with library display fields, ordered by position. */
  getTracks(id) {
    return this.db.prepare(
      `SELECT d.id, d.title, d.artist, d.album,
                d.album_artist AS albumArtist,
                d.track_no AS trackNo,
                d.disc_no AS discNo,
                d.release_date AS releaseDate,
                d.copyright,
                d.composer,
                d.duration_seconds AS durationSeconds,
                d.bitrate_bps AS bitrateBps,
                d.artwork_cache_key AS artworkCacheKey,
                d.genre,
                d.availability,
                d.play_count AS playCount,
                d.last_played_at AS lastPlayedAt,
                d.created_at AS createdAt
         FROM playlist_tracks pt
         INNER JOIN library_track_display d ON d.id = pt.track_id
         WHERE pt.playlist_id = ?
           AND d.availability = 'available'
         ORDER BY pt.position ASC, pt.track_id ASC`
    ).all(id);
  }
  getTrackCounts() {
    return this.db.prepare(
      `SELECT p.id AS playlistId, COUNT(t.id) AS trackCount
         FROM playlists p
         LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
         LEFT JOIN tracks t ON t.id = pt.track_id AND t.availability = 'available'
         GROUP BY p.id`
    ).all();
  }
  addTracks(playlistId, trackIds) {
    const uniqueTrackIds = [...new Set(trackIds)].filter((trackId) => Number.isInteger(trackId));
    const addBatch = this.db.transaction(() => {
      const result = {
        addedCount: 0,
        alreadyPresentCount: 0,
        unavailableCount: 0,
        playlistExists: this.getById(playlistId) !== null
      };
      if (!result.playlistExists) return result;
      const currentMaxPosition = this.db.prepare("SELECT MAX(position) FROM playlist_tracks WHERE playlist_id = ?").pluck().get(playlistId) ?? -1;
      const available = this.db.prepare(
        "SELECT id FROM tracks WHERE id = ? AND availability = 'available'"
      );
      const insert = this.db.prepare(
        `INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)
         ON CONFLICT(playlist_id, track_id) DO NOTHING`
      );
      for (const trackId of uniqueTrackIds) {
        if (!available.get(trackId)) {
          result.unavailableCount++;
          continue;
        }
        const changes = insert.run(
          playlistId,
          trackId,
          currentMaxPosition + result.addedCount + 1
        ).changes;
        if (changes > 0) result.addedCount++;
        else result.alreadyPresentCount++;
      }
      return result;
    });
    return addBatch.immediate();
  }
  /** Validate and update both sidebar tables while holding one write transaction. */
  reorderSidebarItems(items) {
    return this.db.transaction(() => {
      const existing = this.db.prepare(
        `SELECT 'playlist' AS kind, id FROM playlists
         UNION ALL SELECT 'smart' AS kind, id FROM smart_playlists`
      ).all();
      const key = (item) => `${item.kind}:${item.id}`;
      const existingKeys = new Set(existing.map(key));
      const requestedKeys = new Set(items.map(key));
      if (items.length !== existing.length || requestedKeys.size !== items.length || items.some((item) => !existingKeys.has(key(item))))
        return false;
      const regularUpdate = this.db.prepare(
        "UPDATE playlists SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      );
      const smartUpdate = this.db.prepare(
        "UPDATE smart_playlists SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      );
      items.forEach((item, index) => {
        const update = item.kind === "playlist" ? regularUpdate : smartUpdate;
        update.run(index, item.id);
      });
      return true;
    }).immediate();
  }
  create(name, sortOrder) {
    const result = this.db.prepare(
      `INSERT INTO playlists (name, view_mode, sort_order)
         VALUES (?, 'cover', ?)`
    ).run(name, sortOrder);
    return this.getById(Number(result.lastInsertRowid));
  }
  rename(id, name) {
    this.db.prepare(
      `UPDATE playlists
         SET name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).run(name, id);
    return this.getById(id);
  }
  updateViewMode(id, viewMode) {
    this.db.prepare(
      `UPDATE playlists
         SET view_mode = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).run(viewMode, id);
    return this.getById(id);
  }
  delete(id) {
    return this.db.prepare("DELETE FROM playlists WHERE id = ?").run(id).changes > 0;
  }
  setSortOrder(id, sortOrder) {
    this.db.prepare(
      `UPDATE playlists
         SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).run(sortOrder, id);
  }
}
const dailyListeningTracks = `
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
class PlayStatsRepository extends BaseRepository {
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
      this.db.prepare("UPDATE badge_listening_epoch SET epoch=epoch+1 WHERE id=1").run();
      for (const table of [
        "badge_legacy_daily",
        "badge_listening_daily",
        "badge_track_coverage",
        "badge_listening_sessions"
      ])
        this.db.prepare(`DELETE FROM ${table}`).run();
      this.db.prepare("DELETE FROM daily_track_play_stats").run();
      this.db.prepare("DELETE FROM daily_play_stats").run();
      this.db.prepare("DELETE FROM track_play_stats").run();
      this.db.prepare("DELETE FROM removed_daily_track_play_stats").run();
      this.db.prepare("UPDATE removed_track_history SET play_count=0,last_played_at=NULL").run();
    })();
  }
}
function toSmartPlaylist(row) {
  return {
    id: row.id,
    name: row.name,
    rule: JSON.parse(row.ruleJson),
    viewMode: row.viewMode,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
class SmartPlaylistRepository extends BaseRepository {
  list() {
    const rows = this.db.prepare(
      `SELECT id, name, rule_json AS ruleJson, view_mode AS viewMode,
                sort_order AS sortOrder,
                created_at AS createdAt, updated_at AS updatedAt
         FROM smart_playlists
         ORDER BY sort_order ASC, id ASC`
    ).all();
    return rows.map(toSmartPlaylist);
  }
  getById(id) {
    const row = this.db.prepare(
      `SELECT id, name, rule_json AS ruleJson, view_mode AS viewMode,
                sort_order AS sortOrder,
                created_at AS createdAt, updated_at AS updatedAt
         FROM smart_playlists
         WHERE id = ?`
    ).get(id);
    return row ? toSmartPlaylist(row) : null;
  }
  create(name, rule) {
    const result = this.db.prepare(
      `INSERT INTO smart_playlists (name, rule_json, view_mode, sort_order)
         VALUES (
           ?,
           ?,
           'cover',
           COALESCE(
             (
               SELECT MAX(sort_order) + 1
               FROM (
                 SELECT sort_order FROM smart_playlists
                 UNION ALL
                 SELECT sort_order FROM playlists
               ) AS sidebar_orders
             ),
             0
           )
         )`
    ).run(name, JSON.stringify(rule));
    return this.getById(Number(result.lastInsertRowid));
  }
  rename(id, name) {
    this.db.prepare(
      `UPDATE smart_playlists
         SET name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).run(name, id);
    return this.getById(id);
  }
  updateRule(id, rule) {
    this.db.prepare(
      `UPDATE smart_playlists SET rule_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(JSON.stringify(rule), id);
    return this.getById(id);
  }
  getRecentFrequentTrackIds(startDate, endDate) {
    const rows = this.db.prepare(
      `SELECT track_id AS trackId
       FROM daily_track_play_stats
       WHERE play_date BETWEEN ? AND ?
       GROUP BY track_id
       HAVING SUM(play_count) > 0
       ORDER BY SUM(play_count) DESC, MAX(julianday(last_played_at)) DESC, track_id ASC`
    ).all(startDate, endDate);
    return rows.map((row) => row.trackId);
  }
  getRecentPlayedTrackIds(startDate, endDate) {
    const rows = this.db.prepare(
      `SELECT track_id AS trackId FROM daily_track_play_stats
       WHERE play_date BETWEEN ? AND ?
       GROUP BY track_id HAVING SUM(play_count) > 0
       ORDER BY MAX(julianday(last_played_at)) DESC, track_id ASC`
    ).all(startDate, endDate);
    return rows.map((row) => row.trackId);
  }
  getMostListenedTrackIds() {
    const rows = this.db.prepare(
      `SELECT track_id AS trackId FROM track_play_stats
       WHERE play_count > 0
       ORDER BY play_count DESC, julianday(last_played_at) DESC, track_id ASC`
    ).all();
    return rows.map((row) => row.trackId);
  }
  updateViewMode(id, viewMode) {
    this.db.prepare(
      `UPDATE smart_playlists
         SET view_mode = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).run(viewMode, id);
    return this.getById(id);
  }
  delete(id) {
    return this.db.prepare("DELETE FROM smart_playlists WHERE id = ?").run(id).changes > 0;
  }
  reorder(ids) {
    const update = this.db.prepare(
      `UPDATE smart_playlists
       SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    const reorderAll = this.db.transaction((orderedIds) => {
      orderedIds.forEach((id, index) => update.run(index, id));
    });
    reorderAll(ids);
    return this.list();
  }
  setSortOrder(id, sortOrder) {
    this.db.prepare(
      `UPDATE smart_playlists
         SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
    ).run(sortOrder, id);
  }
}
const LIBRARY_CATALOG_DEFAULT_PAGE_SIZE = 500;
const LIBRARY_CATALOG_MAX_PAGE_SIZE = 5e3;
class LibraryCatalogExpiredError extends Error {
  constructor() {
    super("Library catalog cursor refers to an expired snapshot");
    this.name = "LibraryCatalogExpiredError";
  }
}
function normalizePageSize(limit) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return LIBRARY_CATALOG_DEFAULT_PAGE_SIZE;
  }
  return Math.max(1, Math.min(LIBRARY_CATALOG_MAX_PAGE_SIZE, Math.trunc(limit)));
}
function encodeCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64url");
}
function decodeCursor(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf-8"));
    if (typeof parsed.snapshotId !== "string" || !Number.isSafeInteger(parsed.offset) || Number(parsed.offset) < 0) {
      throw new Error("Invalid library catalog cursor payload");
    }
    return { snapshotId: parsed.snapshotId, offset: Number(parsed.offset) };
  } catch (error) {
    throw new Error("Invalid library catalog cursor", { cause: error });
  }
}
class LibraryCatalogSnapshotStore {
  constructor(loadTracks, now = Date.now, readRevision) {
    this.loadTracks = loadTracks;
    this.now = now;
    this.readRevision = readRevision;
  }
  snapshots = /* @__PURE__ */ new Map();
  currentId = null;
  snapshotSequence = 0;
  getPage(request = {}) {
    if (request.refresh && request.cursor !== void 0) {
      throw new Error("A refreshed library catalog page cannot also provide a cursor");
    }
    let snapshotBuildMs = null;
    let snapshotHeapDeltaBytes = null;
    let offset = 0;
    const cursor = request.cursor === void 0 ? null : decodeCursor(request.cursor);
    for (const [id, retained] of this.snapshots) {
      if (this.now() - retained.lastAccessedAt >= LIBRARY_CATALOG_IDLE_MS) {
        this.snapshots.delete(id);
      }
    }
    let snapshot = this.currentId ? this.snapshots.get(this.currentId) : void 0;
    const revision = cursor ? void 0 : this.readRevision?.();
    if (cursor) {
      snapshot = this.snapshots.get(cursor.snapshotId);
      if (!snapshot) throw new LibraryCatalogExpiredError();
      offset = cursor.offset;
    } else if (!snapshot || request.refresh && (!this.readRevision || snapshot.revision !== revision)) {
      const startedAt = performance.now();
      const heapUsedBefore = process.memoryUsage().heapUsed;
      snapshot = this.createSnapshot(revision);
      this.currentId = snapshot.id;
      this.snapshots.set(snapshot.id, snapshot);
      while (this.snapshots.size > LIBRARY_CATALOG_RETAINED_GENERATIONS) {
        this.snapshots.delete(this.snapshots.keys().next().value);
      }
      snapshotBuildMs = performance.now() - startedAt;
      snapshotHeapDeltaBytes = process.memoryUsage().heapUsed - heapUsedBefore;
    }
    snapshot.lastAccessedAt = this.now();
    const pageSize = normalizePageSize(request.limit);
    if (offset > snapshot.tracks.length) {
      throw new Error("Library catalog cursor offset exceeds snapshot size");
    }
    const pageStartedAt = performance.now();
    const tracks = snapshot.tracks.slice(offset, offset + pageSize);
    const nextOffset = offset + tracks.length;
    const nextCursor = nextOffset < snapshot.tracks.length ? encodeCursor({ snapshotId: snapshot.id, offset: nextOffset }) : null;
    return {
      snapshotId: snapshot.id,
      totalTracks: snapshot.tracks.length,
      tracks,
      nextCursor,
      diagnostics: {
        retainedSnapshots: this.snapshots.size,
        snapshotBuildMs,
        snapshotHeapDeltaBytes,
        pageSliceMs: performance.now() - pageStartedAt
      }
    };
  }
  createSnapshot(revision) {
    this.snapshotSequence += 1;
    return {
      revision,
      lastAccessedAt: this.now(),
      id: `${Date.now().toString(36)}-${this.snapshotSequence.toString(36)}`,
      tracks: Object.freeze(this.loadTracks().map((track) => Object.freeze({ ...track })))
    };
  }
}
const LIBRARY_CATALOG_RETAINED_GENERATIONS = 2;
const LIBRARY_CATALOG_IDLE_MS = 6e4;
function rankAlbumGenres(tracks) {
  const counts = /* @__PURE__ */ new Map();
  for (const track of tracks) {
    const trackGenres = /* @__PURE__ */ new Map();
    for (const genre of splitDelimitedValues(track.genre)) {
      trackGenres.set(normalizeDelimitedValue(genre), genre);
    }
    for (const [key, label] of trackGenres) {
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { label, count: 1, firstSeen: counts.size });
    }
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.firstSeen - right.firstSeen).map((genre) => genre.label);
}
class LibraryService {
  constructor(libraryRepository, trackRepository) {
    this.libraryRepository = libraryRepository;
    this.trackRepository = trackRepository;
    this.catalogSnapshotStore = new LibraryCatalogSnapshotStore(
      () => this.trackRepository.getAll(),
      Date.now,
      () => this.trackRepository.getChangeToken()
    );
  }
  catalogSnapshotStore;
  getStats() {
    return this.libraryRepository.getStats();
  }
  getTracks() {
    return this.trackRepository.getAll();
  }
  getTrackPage(request) {
    return this.catalogSnapshotStore.getPage(request);
  }
  getAlbumDetail(request) {
    const tracks = this.trackRepository.getAlbumDetailTracks(
      request.albumArtist,
      request.albumTitle
    );
    const moreAlbums = request.albumArtist === "Unknown Artist" ? [] : this.trackRepository.getArtistAlbumSummaries(request.albumArtist, request.albumTitle);
    const primaryGenre = moreAlbums.length === 0 ? rankAlbumGenres(tracks)[0] : void 0;
    return {
      tracks,
      moreAlbums,
      genreAlbums: primaryGenre ? this.trackRepository.getGenreAlbumSummaries(
        primaryGenre,
        request.albumArtist,
        request.albumTitle
      ) : []
    };
  }
  getLyrics(trackId) {
    const result = this.trackRepository.getLyricsByTrackId(trackId);
    if (result?.lyricsFormat === "ttml") return { ...result, lyricsText: null, lyricsFormat: null };
    return result;
  }
  getRandomTrack(excludeTrackId) {
    const track = this.trackRepository.getRandomPlayableTrack(excludeTrackId);
    if (track) return track;
    return this.trackRepository.getRandomPlayableTrack();
  }
  getRandomAlbumTracks(excludeAlbumKey) {
    const identity2 = this.trackRepository.getRandomAlbumIdentity(excludeAlbumKey);
    if (!identity2) {
      const fallback = this.trackRepository.getRandomAlbumIdentity();
      if (!fallback) return null;
      const tracks2 = this.trackRepository.getAlbumTracks(fallback.albumArtist, fallback.album);
      if (tracks2.length === 0) return null;
      return { albumArtist: fallback.albumArtist, album: fallback.album, tracks: tracks2 };
    }
    const tracks = this.trackRepository.getAlbumTracks(identity2.albumArtist, identity2.album);
    if (tracks.length === 0) return null;
    return { albumArtist: identity2.albumArtist, album: identity2.album, tracks };
  }
  getAlbumTracks(albumKey2) {
    const tracks = this.trackRepository.getAlbumTracks(albumKey2.albumArtist, albumKey2.album);
    if (tracks.length === 0) return null;
    return { albumArtist: albumKey2.albumArtist, album: albumKey2.album, tracks };
  }
}
class LrcEditorMetadataService {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  async readSource(filePath) {
    const lease = await this.dependencies.files.acquireReadLease(filePath, "lrc-editor");
    try {
      const metadata = await parseAudioMetadata(filePath, { skipCovers: true, duration: false });
      const lyrics = await resolveLyricsForFile(filePath, metadata, true);
      const protectedTag = hasEmbeddedTtml(metadata);
      if (!lyrics && !protectedTag) return null;
      return {
        lyricsText: lyrics?.text ?? "",
        lyricsFormat: lyrics?.format ?? "plain",
        ...protectedTag ? { hasEmbeddedTtml: true } : {}
      };
    } finally {
      this.dependencies.files.releaseReadLease(lease.leaseId);
    }
  }
  async writeTag(trackId, text, beforeCommit) {
    let committed = false;
    let result;
    try {
      result = await this.dependencies.metadata.updateTrackLyrics(
        trackId,
        text,
        beforeCommit,
        () => {
          committed = true;
        }
      );
    } catch (error) {
      if (committed) return { warning: true };
      throw error;
    }
    if (!result.ok && committed) return { warning: true };
    if (!result.ok)
      throw new LyricsEditorError(
        result.reason === "file-changed" || result.reason === "file-not-found" ? "file-changed" : result.reason === "write-in-progress" ? "busy" : "save-failed"
      );
    return { warning: false };
  }
  async reconcile(trackId, filePath, text) {
    let cacheUpdated = false;
    let active = false;
    const lease = await this.dependencies.files.acquireReadLease(filePath, "lrc-editor-reconcile");
    try {
      if (this.dependencies.tracks.getFilePathById(trackId) !== filePath)
        return { cacheUpdated, active };
      const before = await stat(filePath);
      const fingerprint = await getLyricsSidecarFingerprint(filePath);
      const metadata = await parseAudioMetadata(filePath, { skipCovers: true, duration: false });
      const lyrics = await resolveLyricsForFile(filePath, metadata);
      const after = await stat(filePath);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || fingerprint !== await getLyricsSidecarFingerprint(filePath))
        return { cacheUpdated, active };
      this.dependencies.tracks.patchLyrics([
        {
          filePath,
          lyricsText: lyrics?.text ?? null,
          lyricsFormat: lyrics?.format ?? null,
          lyricsCheckedMtimeMs: after.mtimeMs,
          lyricsSidecarFingerprint: fingerprint
        }
      ]);
      cacheUpdated = true;
      active = (lyrics?.text.trim() ?? "") === text.trim();
      return { cacheUpdated, active };
    } finally {
      this.dependencies.files.releaseReadLease(lease.leaseId);
      this.dependencies.libraryChanged({
        reason: "file-change",
        trackIds: [trackId],
        filePaths: [filePath]
      });
      if (!cacheUpdated) {
        try {
          this.dependencies.metadata.refreshTracksFromFileChanges([trackId]);
        } catch (error) {
          logger.warn({ error, trackId }, "LRC save requires cache reconciliation");
        }
      }
    }
  }
}
const AUDIO_PROBE_MAX_BYTES = 1024 * 1024;
const AUDIO_PROBE_CACHE_ENTRIES = 128;
const cache = /* @__PURE__ */ new Map();
async function probeAudioDecode(filePath) {
  try {
    const before = await stat(filePath);
    if (!before.isFile()) return null;
    const cached = cache.get(filePath);
    if (cached && cached.size === before.size && cached.mtime === before.mtimeMs) {
      cache.delete(filePath);
      cache.set(filePath, cached);
      return cached.probe;
    }
    if (![".flac", ".wav", ".mp3", ".m4a"].includes(extname(filePath).toLowerCase())) return null;
    const stream = createReadStream(filePath, { end: AUDIO_PROBE_MAX_BYTES - 1 });
    let probe = null;
    try {
      const metadata = await parseStream(
        stream,
        { path: filePath, size: before.size },
        {
          duration: false,
          skipCovers: true,
          skipPostHeaders: true
        }
      );
      const { duration, numberOfChannels, sampleRate } = metadata.format;
      if ([duration, numberOfChannels, sampleRate].every(
        (n) => typeof n === "number" && Number.isFinite(n) && n > 0
      )) {
        probe = {
          fileSize: before.size,
          fileMtimeMs: before.mtimeMs,
          durationSeconds: duration,
          numberOfChannels,
          sampleRate
        };
      }
    } catch {
    } finally {
      stream.destroy();
    }
    const after = await stat(filePath);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) return null;
    cache.delete(filePath);
    cache.set(filePath, { size: before.size, mtime: before.mtimeMs, probe });
    while (cache.size > AUDIO_PROBE_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    return probe;
  } catch {
    return null;
  }
}
const AUDIO_FILE_SIZE_HEADER = "X-Auralis-File-Size";
const AUDIO_FILE_MTIME_HEADER = "X-Auralis-File-Mtime";
const TRACK_ID_PATH = /^\/(\d+)$/;
const BYTES_RANGE = /^bytes=(\d*)-(\d*)$/i;
const EXT_TO_MIME$1 = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg"
};
const playableExtensions = new Set(supportedAudioExtensions);
function isMissingFileError$1(error) {
  const code = error?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
function buildAudioTrackUrl(trackId) {
  return `auralis-audio://track/${trackId}`;
}
function isPlayableAudioExtension(filePath) {
  return playableExtensions.has(extname(filePath).toLowerCase());
}
function createAudioProtocolHandler(resolver) {
  return async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "track") {
        logger.warn({ url: request.url }, "Invalid audio protocol host");
        return new Response(null, { status: 400 });
      }
      const match = TRACK_ID_PATH.exec(url.pathname);
      if (!match) {
        logger.warn({ url: request.url }, "Invalid audio protocol path");
        return new Response(null, { status: 400 });
      }
      const trackId = Number(match[1]);
      if (!Number.isInteger(trackId) || trackId <= 0) {
        return new Response(null, { status: 400 });
      }
      const filePath = resolver.getFilePathByTrackId(trackId);
      if (!filePath) {
        return new Response(null, { status: 404 });
      }
      if (!isPlayableAudioExtension(filePath)) {
        logger.warn({ trackId, filePath }, "Audio protocol rejected unsupported extension");
        return new Response(null, { status: 415 });
      }
      const roots = resolver.getLibraryRootPaths();
      if (!isPathUnderAnyRoot(filePath, roots)) {
        logger.warn({ trackId, filePath }, "Audio protocol path outside library roots");
        return new Response(null, { status: 403 });
      }
      const resolvedPath = resolve(filePath);
      let fileStats;
      try {
        fileStats = await stat(resolvedPath);
      } catch (error) {
        if (isMissingFileError$1(error)) resolver.onFileMissing?.(trackId, filePath);
        return new Response(null, { status: 404 });
      }
      if (!fileStats.isFile()) {
        resolver.onFileMissing?.(trackId, filePath);
        return new Response(null, { status: 404 });
      }
      const size = fileStats.size;
      if (request.method.toUpperCase() === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": `${AUDIO_FILE_SIZE_HEADER}, ${AUDIO_FILE_MTIME_HEADER}, Range`
          }
        });
      }
      const expectedSize = request.headers.get(AUDIO_FILE_SIZE_HEADER);
      const expectedMtime = request.headers.get(AUDIO_FILE_MTIME_HEADER);
      if ((expectedSize !== null || expectedMtime !== null) && (expectedSize === null || expectedMtime === null || Number(expectedSize) !== size || Number(expectedMtime) !== fileStats.mtimeMs)) {
        return new Response(null, { status: 412, headers: { "Access-Control-Allow-Origin": "*" } });
      }
      const ext = extname(resolvedPath).toLowerCase();
      const contentType = EXT_TO_MIME$1[ext] ?? "application/octet-stream";
      const rangeResult = parseBytesRange(request.headers.get("Range"), size);
      if (rangeResult === "unsatisfiable") {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${size}`,
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      return buildFileResponse(
        resolvedPath,
        size,
        contentType,
        rangeResult,
        request.method.toUpperCase()
      );
    } catch (error) {
      logger.warn({ err: error, url: request.url }, "Audio protocol handler failed");
      return new Response(null, { status: 500 });
    }
  };
}
function registerPrivilegedMediaSchemes() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "auralis-audio",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    },
    {
      scheme: "auralis-artwork",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ]);
}
function parseBytesRange(header, size) {
  if (!header || size <= 0) return null;
  const match = BYTES_RANGE.exec(header.trim());
  if (!match) return null;
  const startToken = match[1];
  const endToken = match[2];
  if (startToken === "" && endToken === "") return null;
  let start;
  let end;
  if (startToken === "") {
    const suffixLength = Number(endToken);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startToken);
    end = endToken === "" ? size - 1 : Number(endToken);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) return null;
    if (start >= size) return "unsatisfiable";
    end = Math.min(end, size - 1);
    if (start > end) return "unsatisfiable";
  }
  return { start, end };
}
function buildFileResponse(filePath, size, contentType, range, method) {
  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache"
  });
  if (range) {
    const { start, end } = range;
    const chunkSize = end - start + 1;
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(chunkSize));
    if (method === "HEAD") {
      return new Response(null, { status: 206, headers });
    }
    const nodeStream2 = createReadStream(filePath, { start, end });
    const body2 = Readable.toWeb(nodeStream2);
    return new Response(body2, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  if (method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  const nodeStream = createReadStream(filePath);
  const body = Readable.toWeb(nodeStream);
  return new Response(body, { status: 200, headers });
}
function registerAudioProtocol(resolver) {
  protocol.handle("auralis-audio", createAudioProtocolHandler(resolver));
}
function isMissingFileError(error) {
  const code = error?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
class PlaybackResourceService {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }
  markFileMissing(filePath) {
    const trackIds = this.dependencies.tracks.markMissingByFilePaths([filePath]);
    if (trackIds.length > 0) {
      this.dependencies.libraryChanged({
        reason: "track-missing",
        trackIds,
        filePaths: [filePath]
      });
    }
  }
  async getAudioUrl(trackId) {
    const filePath = this.dependencies.tracks.getFilePathById(trackId);
    if (!filePath || !isPlayableAudioExtension(filePath)) return null;
    if (!isPathUnderAnyRoot(filePath, this.dependencies.getRootPaths())) return null;
    const probeLease = await this.dependencies.files.acquireReadLease(filePath, "audio-probe");
    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        this.markFileMissing(filePath);
        return null;
      }
      return { url: buildAudioTrackUrl(trackId), decodeProbe: await probeAudioDecode(filePath) };
    } catch (error) {
      if (isMissingFileError(error)) this.markFileMissing(filePath);
      return null;
    } finally {
      this.dependencies.files.releaseReadLease(probeLease.leaseId);
    }
  }
  async resolveTrack(trackId) {
    if (!await this.getAudioUrl(trackId)) throw new Error("Audio file is unavailable");
    const path = this.dependencies.tracks.getFilePathById(trackId);
    if (!path) throw new Error("Audio file is unavailable");
    return path;
  }
}
class PlaylistService {
  constructor(playlistRepository, smartPlaylistRepository, publishChange = () => {
  }) {
    this.playlistRepository = playlistRepository;
    this.smartPlaylistRepository = smartPlaylistRepository;
    this.publishChange = publishChange;
  }
  list() {
    return this.playlistRepository.list();
  }
  listTrackCounts() {
    return this.playlistRepository.getTrackCounts();
  }
  listSidebarItems(smartTrackCounts) {
    const regularItems = this.playlistRepository.list().map((playlist) => ({
      kind: "playlist",
      id: playlist.id,
      name: playlist.name,
      viewMode: playlist.viewMode,
      sortOrder: playlist.sortOrder,
      trackCount: 0,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt
    }));
    const regularCounts = new Map(
      this.playlistRepository.getTrackCounts().map((item) => [item.playlistId, item.trackCount])
    );
    for (const item of regularItems) {
      item.trackCount = regularCounts.get(item.id) ?? 0;
    }
    const smartItems = this.smartPlaylistRepository.list().map((playlist) => this.toSidebarSmartItem(playlist, smartTrackCounts.get(playlist.id) ?? 0));
    return [...regularItems, ...smartItems].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt) || left.kind.localeCompare(right.kind) || left.id - right.id
    );
  }
  getDetail(id) {
    const playlist = this.playlistRepository.getById(id);
    if (!playlist) return null;
    return {
      playlist,
      tracks: this.playlistRepository.getTracks(id)
    };
  }
  create(defaultName = "新建歌单") {
    const allNames = [
      ...this.playlistRepository.list().map((playlist2) => playlist2.name),
      ...this.smartPlaylistRepository.list().map((playlist2) => playlist2.name)
    ];
    const name = this.getAvailableName(defaultName, allNames);
    const playlist = this.playlistRepository.create(name, this.getNextSortOrder());
    this.publishChange({ kind: "playlist", playlistId: playlist.id, reason: "created" });
    return playlist;
  }
  rename(id, name) {
    const playlist = this.playlistRepository.getById(id);
    if (!playlist) return null;
    const otherNames = [
      ...this.playlistRepository.list().filter((item) => item.id !== id).map((item) => item.name),
      ...this.smartPlaylistRepository.list().map((item) => item.name)
    ];
    const renamed = this.playlistRepository.rename(
      id,
      this.getAvailableName(name, otherNames, false)
    );
    if (renamed) this.publishChange({ kind: "playlist", playlistId: id, reason: "renamed" });
    return renamed;
  }
  updateViewMode(id, viewMode) {
    const playlist = this.playlistRepository.updateViewMode(id, viewMode);
    if (playlist)
      this.publishChange({ kind: "playlist", playlistId: id, reason: "view-mode-updated" });
    return playlist;
  }
  delete(id) {
    const deleted = this.playlistRepository.delete(id);
    if (deleted) this.publishChange({ kind: "playlist", playlistId: id, reason: "deleted" });
    return deleted;
  }
  addTracks(id, trackIds) {
    const result = this.playlistRepository.addTracks(id, trackIds);
    if (result.addedCount > 0)
      this.publishChange({ kind: "playlist", playlistId: id, reason: "tracks-added" });
    return result;
  }
  reorderSidebarItems(items) {
    if (this.playlistRepository.reorderSidebarItems(items)) {
      this.publishChange({ kind: "collection", reason: "reordered" });
    }
    return this.listSidebarItems(/* @__PURE__ */ new Map());
  }
  toSidebarSmartItem(playlist, trackCount) {
    return {
      kind: "smart",
      id: playlist.id,
      name: playlist.name,
      viewMode: playlist.viewMode,
      sortOrder: playlist.sortOrder,
      trackCount,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt
    };
  }
  getNextSortOrder() {
    const orders = [
      ...this.playlistRepository.list().map((playlist) => playlist.sortOrder),
      ...this.smartPlaylistRepository.list().map((playlist) => playlist.sortOrder)
    ];
    return orders.length === 0 ? 0 : Math.max(...orders) + 1;
  }
  getAvailableName(base, existingNames, appendInitialSuffix = true) {
    const trimmedBase = base.trim();
    const fallbackBase = trimmedBase.length > 0 ? trimmedBase : "新建歌单";
    const names = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()));
    if (!appendInitialSuffix && !names.has(fallbackBase.toLocaleLowerCase())) {
      return fallbackBase;
    }
    let suffix = appendInitialSuffix ? 1 : 2;
    while (names.has(`${fallbackBase} ${suffix}`.toLocaleLowerCase())) suffix += 1;
    return `${fallbackBase} ${suffix}`;
  }
}
function compare(a, b) {
  return b.playCount - a.playCount || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
function buildAnnualSummary(year, days, rows) {
  const albums = /* @__PURE__ */ new Map();
  const tracks = /* @__PURE__ */ new Map();
  const artists = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const trackKey = `${row.source}:${row.trackId}`;
    const albumArtist = row.albumArtist?.trim() || row.artist?.trim() || null;
    const albumKey2 = JSON.stringify([row.album || "", albumArtist]);
    let track = tracks.get(trackKey);
    if (!track) {
      track = {
        key: trackKey,
        title: row.title,
        artist: row.artist,
        album: row.album,
        artworkCacheKey: row.artworkCacheKey,
        playCount: 0,
        albumKey: albumKey2,
        monthlyPlays: Array(12).fill(0),
        playback: row.source === "library" && row.available ? {
          id: row.trackId,
          title: row.title,
          artist: row.artist,
          album: row.album,
          albumArtist,
          artworkCacheKey: row.artworkCacheKey,
          durationSeconds: row.durationSeconds
        } : null
      };
      tracks.set(trackKey, track);
    }
    track.playCount += row.playCount;
    track.monthlyPlays[row.month - 1] += row.playCount;
    if (row.album?.trim()) {
      let album = albums.get(albumKey2);
      if (!album) {
        album = {
          key: albumKey2,
          album: row.album,
          albumArtist,
          artworkCacheKey: row.artworkCacheKey,
          playCount: 0,
          durationSeconds: 0,
          trackCount: 0,
          trackKeys: /* @__PURE__ */ new Set(),
          firstPlayedDate: row.firstPlayedDate,
          monthlyPlays: Array(12).fill(0),
          available: false
        };
        albums.set(albumKey2, album);
      }
      album.playCount += row.playCount;
      album.durationSeconds += row.recordedDuration;
      album.monthlyPlays[row.month - 1] += row.playCount;
      album.trackKeys.add(trackKey);
      album.trackCount = album.trackKeys.size;
      album.available ||= Boolean(track.playback);
      if (row.firstPlayedDate < album.firstPlayedDate) album.firstPlayedDate = row.firstPlayedDate;
      album.artworkCacheKey ||= row.artworkCacheKey;
    }
    for (const name of cleanDelimitedValues([row.artist || albumArtist])) {
      const key = normalizeDelimitedValue(name);
      let artist = artists.get(key);
      if (!artist) {
        artist = { name, playCount: 0, albums: /* @__PURE__ */ new Map() };
        artists.set(key, artist);
      }
      artist.playCount += row.playCount;
      if (row.album?.trim())
        artist.albums.set(albumKey2, (artist.albums.get(albumKey2) ?? 0) + row.playCount);
    }
  }
  const rankedAlbums = [...albums.values()].sort(compare);
  const rankedTracks = [...tracks.values()].sort(compare);
  const albumDto = (album) => ({
    key: album.key,
    album: album.album,
    albumArtist: album.albumArtist,
    artworkCacheKey: album.artworkCacheKey,
    playCount: album.playCount,
    durationSeconds: album.durationSeconds,
    trackCount: album.trackCount,
    firstPlayedDate: album.firstPlayedDate,
    monthlyPlays: album.monthlyPlays,
    available: album.available
  });
  const albumsForMonths = (months, limit) => rankedAlbums.map((album) => ({
    album,
    key: album.key,
    playCount: months.reduce((total, month) => total + album.monthlyPlays[month - 1], 0)
  })).filter((entry) => entry.playCount > 0).sort(compare).slice(0, limit).map((entry) => albumDto(entry.album));
  const activeDays = days.filter((day) => day.playCount > 0).sort((a, b) => a.date.localeCompare(b.date));
  const peak = [...activeDays].sort(
    (a, b) => b.playCount - a.playCount || a.date.localeCompare(b.date)
  )[0];
  let longestRun = null;
  let run2 = null;
  for (const day of activeDays) {
    if (run2 && Date.parse(`${day.date}T00:00:00Z`) - Date.parse(`${run2.end}T00:00:00Z`) === 864e5) {
      run2 = { start: run2.start, end: day.date, days: run2.days + 1 };
    } else run2 = { start: day.date, end: day.date, days: 1 };
    if (!longestRun || run2.days > longestRun.days) longestRun = run2;
  }
  const available = rankedTracks.filter((track) => track.playback);
  const candidates = Array.from(
    { length: 12 },
    (_, month) => available.filter((track) => track.monthlyPlays[month] > 0).sort((a, b) => b.monthlyPlays[month] - a.monthlyPlays[month] || compare(a, b))[0]
  );
  const selection = [];
  const selected = /* @__PURE__ */ new Set();
  const albumCounts = /* @__PURE__ */ new Map();
  for (const track of [...candidates, ...available]) {
    if (!track?.playback || selected.has(track.key)) continue;
    const group = track.album?.trim() ? track.albumKey : track.key;
    if ((albumCounts.get(group) ?? 0) >= 3) continue;
    selected.add(track.key);
    albumCounts.set(group, (albumCounts.get(group) ?? 0) + 1);
    selection.push(track.playback);
    if (selection.length === 30) break;
  }
  return {
    year,
    playCount: activeDays.reduce((sum, day) => sum + day.playCount, 0),
    activeDays: activeDays.length,
    albumCount: albums.size,
    albums: rankedAlbums.slice(0, 10).map(albumDto),
    tracks: rankedTracks.slice(0, 5).map((track) => ({
      key: track.key,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artworkCacheKey: track.artworkCacheKey,
      playCount: track.playCount,
      playback: track.playback
    })),
    artists: [...artists.entries()].map(([key, artist]) => ({ key, ...artist })).sort(compare).slice(0, 5).map((artist) => ({
      name: artist.name,
      playCount: artist.playCount,
      albums: [...artist.albums.entries()].map(([key, playCount]) => ({ key, playCount })).sort(compare).slice(0, 3).map(({ key }) => albumDto(albums.get(key)))
    })),
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      playCount: activeDays.filter((day) => Number(day.date.slice(5, 7)) === index + 1).reduce((sum, day) => sum + day.playCount, 0),
      albums: albumsForMonths([index + 1], 3)
    })),
    seasons: [
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
      [1, 2, 12]
    ].map((months) => ({ months, album: albumsForMonths(months, 1)[0] ?? null })),
    peakDay: peak ? { date: peak.date, playCount: peak.playCount, album: null } : null,
    longestRun,
    selection
  };
}
function isListeningArchiveDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999) return false;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}
const MAX_SESSION_CACHE = 5e3;
class PlayStatsService {
  constructor(playStatsRepo) {
    this.playStatsRepo = playStatsRepo;
  }
  /** Last N recorded sessionIds; Set preserves insertion order for FIFO eviction. */
  recordedSessions = /* @__PURE__ */ new Set();
  recordEffectivePlay(payload) {
    const { trackId, sessionId, playedAtIso } = payload;
    if (!Number.isInteger(trackId) || trackId <= 0) {
      return { ok: false, recorded: false };
    }
    if (!sessionId?.trim()) {
      return { ok: false, recorded: false };
    }
    if (!playedAtIso || Number.isNaN(Date.parse(playedAtIso))) {
      return { ok: false, recorded: false };
    }
    if (this.recordedSessions.has(sessionId)) {
      return { ok: true, recorded: false };
    }
    if (!this.playStatsRepo.trackExists(trackId)) {
      return { ok: false, recorded: false };
    }
    const playedAt = new Date(playedAtIso);
    const localPlayDate = [
      playedAt.getFullYear(),
      String(playedAt.getMonth() + 1).padStart(2, "0"),
      String(playedAt.getDate()).padStart(2, "0")
    ].join("-");
    this.playStatsRepo.incrementPlayCount(trackId, playedAtIso, localPlayDate);
    this.rememberSession(sessionId);
    return { ok: true, recorded: true };
  }
  rememberSession(sessionId) {
    if (this.recordedSessions.has(sessionId)) return;
    while (this.recordedSessions.size >= MAX_SESSION_CACHE) {
      const first = this.recordedSessions.values().next().value;
      if (first === void 0) break;
      this.recordedSessions.delete(first);
    }
    this.recordedSessions.add(sessionId);
  }
  getAnnualPlayCounts(year) {
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      throw new RangeError("Invalid listening archive year");
    }
    return this.playStatsRepo.getAnnualPlayCounts(year);
  }
  getAnnualSummary(year) {
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      throw new RangeError("Invalid listening archive year");
    }
    return this.playStatsRepo.withAnnualListeningSnapshot(
      year,
      ({ days, rows, getDayTopAlbums }) => {
        const summary = buildAnnualSummary(year, days, rows);
        if (summary.peakDay)
          summary.peakDay.album = getDayTopAlbums(summary.peakDay.date)[0] ?? null;
        return summary;
      }
    );
  }
  getDayTopTracks(date) {
    if (!isListeningArchiveDate(date)) throw new RangeError("Invalid listening archive date");
    return this.playStatsRepo.getDayTopTracks(date);
  }
  getDayTopAlbums(date) {
    if (!isListeningArchiveDate(date)) throw new RangeError("Invalid listening archive date");
    return this.playStatsRepo.getDayTopAlbums(date);
  }
  resetAll() {
    this.playStatsRepo.resetAll();
    this.recordedSessions.clear();
    return { ok: true };
  }
}
class SmartPlaylistQueryError extends Error {
  constructor(message, position) {
    super(message);
    this.position = position;
    this.name = "SmartPlaylistQueryError";
  }
}
function isWordBoundary(character) {
  return character === void 0 || /\s|\(|\)/.test(character);
}
function tokenize(query) {
  const tokens = [];
  let position = 0;
  while (position < query.length) {
    if (/\s/.test(query[position])) {
      position += 1;
      continue;
    }
    if (query[position] === "(") {
      tokens.push({ type: "leftParen", position });
      position += 1;
      continue;
    }
    if (query[position] === ")") {
      tokens.push({ type: "rightParen", position });
      position += 1;
      continue;
    }
    if (query[position] === '"') {
      const start = position;
      position += 1;
      let value = "";
      let closed = false;
      while (position < query.length) {
        const character = query[position];
        if (character === "\\" && query[position + 1] === '"') {
          value += '"';
          position += 2;
          continue;
        }
        if (character === '"') {
          closed = true;
          position += 1;
          break;
        }
        value += character;
        position += 1;
      }
      if (!closed) throw new SmartPlaylistQueryError("缺少英文右双引号", start);
      if (!value.trim()) throw new SmartPlaylistQueryError("查询值不能为空", start);
      tokens.push({ type: "value", value, position: start });
      continue;
    }
    const remaining = query.slice(position);
    const upperRemaining = remaining.toUpperCase();
    const candidates = [
      { text: "ALBUM ARTIST", type: "field", field: "albumArtist" },
      { text: "ARTIST", type: "field", field: "artist" },
      { text: "GENRE", type: "field", field: "genre" },
      { text: "ADDED", type: "field", field: "added" },
      { text: "BEFORE", type: "before" },
      { text: "WITHIN", type: "within" },
      { text: "EMPTY", type: "empty" },
      { text: "HAS", type: "has" },
      { text: "AND", type: "and" },
      { text: "OR", type: "or" },
      { text: "IS", type: "is" }
    ];
    const match = candidates.find(
      (candidate) => upperRemaining.startsWith(candidate.text) && isWordBoundary(remaining[candidate.text.length])
    );
    if (!match) {
      throw new SmartPlaylistQueryError("无法识别的语法，请检查字段、操作符和英文双引号", position);
    }
    tokens.push({
      type: match.type,
      field: match.field,
      position
    });
    position += match.text.length;
  }
  tokens.push({ type: "end", position: query.length });
  return tokens;
}
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
  }
  index = 0;
  parse() {
    if (this.peek().type === "end") {
      throw new SmartPlaylistQueryError("请输入查询语法", 0);
    }
    const expression = this.parseOr();
    const trailing = this.peek();
    if (trailing.type !== "end") {
      throw new SmartPlaylistQueryError("表达式后存在多余内容", trailing.position);
    }
    return expression;
  }
  parseOr() {
    const operands = [this.parseAnd()];
    while (this.peek().type === "or") {
      this.consume("or");
      operands.push(this.parseAnd());
    }
    return operands.length === 1 ? operands[0] : { type: "or", operands };
  }
  parseAnd() {
    const operands = [this.parsePrimary()];
    while (this.peek().type === "and") {
      this.consume("and");
      operands.push(this.parsePrimary());
    }
    return operands.length === 1 ? operands[0] : { type: "and", operands };
  }
  parsePrimary() {
    if (this.peek().type === "leftParen") {
      this.consume("leftParen");
      const expression = this.parseOr();
      this.consume("rightParen", "缺少右括号");
      return expression;
    }
    return this.parsePredicate();
  }
  parsePredicate() {
    const fieldToken = this.consume("field", "此处需要 GENRE、ARTIST 或 ALBUM ARTIST");
    const field2 = fieldToken.field;
    if (field2 === "added") {
      if (this.peek().type === "before") {
        this.consume("before");
        const value = this.consume("value", "ADDED BEFORE 后需要使用英文双引号包裹时间");
        return { type: "predicate", field: field2, operator: "addedBefore", value: value.value };
      }
      if (this.peek().type === "within") {
        this.consume("within");
        const value = this.consume("value", "ADDED WITHIN 后需要使用英文双引号包裹时间");
        return { type: "predicate", field: field2, operator: "addedWithin", value: value.value };
      }
      throw new SmartPlaylistQueryError("ADDED 后只能使用 BEFORE 或 WITHIN", this.peek().position);
    }
    if (this.peek().type === "is") {
      this.consume("is");
      this.consume("empty", "IS 后只能使用 EMPTY");
      return { type: "predicate", field: field2, operator: "isEmpty" };
    }
    this.consume("has", "字段后需要 HAS 或 IS EMPTY");
    const firstValue = this.consume("value", "HAS 后的查询值必须使用英文双引号");
    const predicates = [
      { type: "predicate", field: field2, operator: "has", value: firstValue.value }
    ];
    while (this.peek().type === "or" && this.tokens[this.index + 1]?.type === "value") {
      this.consume("or");
      const value = this.consume("value");
      predicates.push({ type: "predicate", field: field2, operator: "has", value: value.value });
    }
    return predicates.length === 1 ? predicates[0] : { type: "or", operands: predicates };
  }
  peek() {
    return this.tokens[this.index];
  }
  consume(type, message) {
    const token = this.peek();
    if (token.type !== type) {
      throw new SmartPlaylistQueryError(message ?? `此处需要 ${type}`, token.position);
    }
    this.index += 1;
    return token;
  }
}
function parseSmartPlaylistQuery(query) {
  return new Parser(tokenize(query)).parse();
}
const RECENT_ADDED_DAY_OPTIONS = [7, 30, 90, 365];
const DEFAULT_RECENT_ADDED_DAYS = 30;
function assertRecentAddedDays(days) {
  if (!RECENT_ADDED_DAY_OPTIONS.includes(days)) {
    throw new Error("最近添加仅支持 7、30、90、365 天");
  }
}
const DEFAULT_RECENT_FREQUENT_DAYS = 30;
function assertRecentFrequentDays(days) {
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new Error("时间范围必须是正整数天数");
  }
}
function isRecentFrequentRule(rule) {
  return "preset" in rule && rule.preset === "recentFrequent";
}
function resolveRecentFrequentDateRange(days, now = /* @__PURE__ */ new Date()) {
  assertRecentFrequentDays(days);
  if (!Number.isFinite(now.getTime()) || now.getFullYear() < 1 || now.getFullYear() > 9999) {
    throw new Error("无效的当前日期");
  }
  const end = /* @__PURE__ */ new Date(0);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  const earliest = Date.parse("0001-01-01T00:00:00Z");
  const dayMs = 864e5;
  const offset = Math.min(days - 1, Math.floor((end.getTime() - earliest) / dayMs));
  const start = new Date(end.getTime() - offset * dayMs);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
const LEGACY_RULE_FIELDS = /* @__PURE__ */ new Set(["genre", "albumArtist"]);
const QUERY_FIELDS = /* @__PURE__ */ new Set(["genre", "artist", "albumArtist", "added"]);
const PREDICATE_OPERATORS = /* @__PURE__ */ new Set([
  "has",
  "isEmpty",
  "addedBefore",
  "addedWithin"
]);
function normalizeCondition(condition) {
  return {
    field: condition.field,
    value: condition.value === null ? null : condition.value.trim()
  };
}
function assertValidSmartPlaylistRule(rule) {
  if (!rule || typeof rule !== "object") {
    throw new Error("无效的智能歌单规则");
  }
  if ("preset" in rule) {
    if (rule.preset === "mostListened") {
      if (Object.keys(rule).some((key) => key !== "preset")) {
        throw new Error("无效的智能歌单预设");
      }
      return;
    }
    if (rule.preset !== "recentPlayed" && rule.preset !== "recentAdded" && !isRecentFrequentRule(rule) || Object.keys(rule).some((key) => key !== "preset" && key !== "days")) {
      throw new Error("无效的智能歌单预设");
    }
    if (rule.preset === "recentAdded") assertRecentAddedDays(rule.days);
    else assertRecentFrequentDays(rule.days);
    return;
  }
  if (isExpressionRule(rule)) {
    assertValidExpression(rule.expression);
    return;
  }
  if (!("conditions" in rule) || !Array.isArray(rule.conditions)) {
    throw new Error("无效的智能歌单规则");
  }
  if (rule.conditions.length === 0) {
    throw new Error("智能歌单规则不能为空");
  }
  for (const condition of rule.conditions) {
    if (!condition || typeof condition !== "object") {
      throw new Error("无效的智能歌单条件");
    }
    if (!LEGACY_RULE_FIELDS.has(condition.field)) {
      throw new Error(`不支持的规则字段: ${String(condition.field)}`);
    }
    if (condition.value !== null && typeof condition.value !== "string") {
      throw new Error("规则值必须是字符串或 null");
    }
    if (typeof condition.value === "string" && condition.value.trim().length === 0) {
      throw new Error("规则值不能为空字符串");
    }
  }
}
function assertValidExpression(expression) {
  if (!expression || typeof expression !== "object" || !("type" in expression)) {
    throw new Error("无效的智能歌单表达式");
  }
  if (expression.type === "predicate") {
    if (!QUERY_FIELDS.has(expression.field)) {
      throw new Error(`不支持的查询字段: ${String(expression.field)}`);
    }
    if (!PREDICATE_OPERATORS.has(expression.operator)) {
      throw new Error(`不支持的操作符: ${String(expression.operator)}`);
    }
    const field2 = expression.field;
    const operator = expression.operator;
    if (field2 === "added") {
      if (operator !== "addedBefore" && operator !== "addedWithin") {
        throw new Error("ADDED 字段只能使用 BEFORE 或 WITHIN");
      }
      if (typeof expression.value !== "string" || expression.value.trim().length === 0) {
        throw new Error("ADDED 规则需要时间值");
      }
      return;
    }
    if (operator === "isEmpty") {
      return;
    }
    if (operator === "has") {
      if (typeof expression.value !== "string" || expression.value.trim().length === 0) {
        throw new Error("HAS 规则需要非空查询值");
      }
      return;
    }
    throw new Error(`${field2} 字段不支持操作符 ${operator}`);
  }
  if (expression.type === "and" || expression.type === "or") {
    if (!Array.isArray(expression.operands) || expression.operands.length === 0) {
      throw new Error(expression.type === "and" ? "AND 规则不能为空" : "OR 规则不能为空");
    }
    for (const operand of expression.operands) {
      assertValidExpression(operand);
    }
    return;
  }
  throw new Error(`不支持的表达式类型: ${String(expression.type)}`);
}
function isExpressionRule(rule) {
  return "expression" in rule;
}
function normalizeRelativeDuration(value, operator) {
  const normalized = value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const match = normalized.match(
    /^([1-9]\d*) (day|days|week|weeks|month|months|year|years)( ago)?$/
  );
  if (!match) {
    throw new Error(
      operator === "addedBefore" ? 'ADDED BEFORE 需要类似 "30 days ago"、"2 weeks ago" 的时间' : 'ADDED WITHIN 需要类似 "30 days"、"2 weeks" 的时间'
    );
  }
  const [, amount, unit, ago] = match;
  if (operator === "addedBefore" && !ago) {
    throw new Error('ADDED BEFORE 的时间需要以 ago 结尾，例如 "30 days ago"');
  }
  const normalizedUnit = unit.endsWith("s") ? unit : `${unit}s`;
  return operator === "addedBefore" ? `${amount} ${normalizedUnit} ago` : `${amount} ${normalizedUnit}`;
}
function normalizeExpression(expression) {
  if (expression.type === "predicate") {
    if (expression.operator === "addedBefore" || expression.operator === "addedWithin") {
      return {
        ...expression,
        value: normalizeRelativeDuration(expression.value ?? "", expression.operator)
      };
    }
    return {
      ...expression,
      value: expression.value?.trim()
    };
  }
  return {
    type: expression.type,
    operands: expression.operands.map(normalizeExpression)
  };
}
function normalizeRule(rule) {
  if ("preset" in rule) {
    return rule.preset === "mostListened" ? { preset: "mostListened" } : { preset: rule.preset, days: rule.days };
  }
  if (isExpressionRule(rule)) {
    return { expression: normalizeExpression(rule.expression) };
  }
  const fieldOrder = { genre: 0, albumArtist: 1 };
  return {
    conditions: rule.conditions.map(normalizeCondition).sort((left, right) => fieldOrder[left.field] - fieldOrder[right.field])
  };
}
function canonicalRule(rule) {
  if ("preset" in rule) return JSON.stringify(normalizeRule(rule));
  if (isExpressionRule(rule)) {
    const canonicalizeExpression = (expression) => {
      if (expression.type === "predicate") {
        return {
          type: expression.type,
          field: expression.field,
          operator: expression.operator,
          value: expression.value === void 0 ? void 0 : normalizeDelimitedValue(expression.value)
        };
      }
      const operands = expression.operands.map(canonicalizeExpression).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      return { type: expression.type, operands };
    };
    return JSON.stringify(canonicalizeExpression(normalizeExpression(rule.expression)));
  }
  return JSON.stringify({
    conditions: rule.conditions.map((condition) => ({
      field: condition.field,
      value: condition.value === null ? null : normalizeDelimitedValue(condition.value)
    }))
  });
}
function getRawTrackValue(track, field2) {
  if (field2 === "albumArtistOrArtist") return track.albumArtist || track.artist;
  return track[field2];
}
function getTrackFacetMatchValues(track, field2) {
  return splitDelimitedValues(getRawTrackValue(track, field2)).map(normalizeDelimitedValue);
}
function parseRelativeDurationMs(value) {
  const match = value.trim().toLocaleLowerCase().match(/^([1-9]\d*) (days|weeks|months|years)(?: ago)?$/);
  if (!match) return Number.NaN;
  const amount = Number(match[1]);
  const unit = match[2];
  const dayMs = 24 * 60 * 60 * 1e3;
  if (unit === "days") return amount * dayMs;
  if (unit === "weeks") return amount * 7 * dayMs;
  if (unit === "months") return amount * 30 * dayMs;
  return amount * 365 * dayMs;
}
function parseTrackCreatedAt(value) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).getTime();
}
function compareTracksByCreatedAtDesc(left, right) {
  const leftCreatedAt = parseTrackCreatedAt(left.createdAt);
  const rightCreatedAt = parseTrackCreatedAt(right.createdAt);
  if (Number.isFinite(leftCreatedAt) && Number.isFinite(rightCreatedAt)) {
    return rightCreatedAt - leftCreatedAt || right.id - left.id;
  }
  if (Number.isFinite(leftCreatedAt)) return -1;
  if (Number.isFinite(rightCreatedAt)) return 1;
  return right.id - left.id;
}
function getValues(context, field2) {
  const cached = context.values[field2];
  if (cached) return cached;
  const values = getTrackFacetMatchValues(context.track, field2);
  context.values[field2] = values;
  return values;
}
function compileValue(field2, expected) {
  if (expected === null) return (context) => getValues(context, field2).length === 0;
  const normalized = normalizeDelimitedValue(expected);
  return (context) => getValues(context, field2).includes(normalized);
}
function isValuePredicate(expression) {
  return expression.type === "predicate" && expression.field !== "added" && (expression.operator === "has" || expression.operator === "isEmpty");
}
function compileExpression(expression, now) {
  if (expression.type !== "predicate") {
    const first = expression.operands[0];
    if (expression.type === "or" && first && isValuePredicate(first) && expression.operands.every(
      (operand) => isValuePredicate(operand) && operand.field === first.field
    )) {
      const predicates = expression.operands;
      const expected = new Set(
        predicates.filter((item) => item.operator === "has").map((item) => normalizeDelimitedValue(item.value))
      );
      const matchesEmpty = predicates.some((item) => item.operator === "isEmpty");
      return (context) => {
        const values = getValues(context, first.field);
        return matchesEmpty && values.length === 0 || values.some((value) => expected.has(value));
      };
    }
    const operands = expression.operands.map((operand) => compileExpression(operand, now));
    return expression.type === "and" ? (context) => operands.every((operand) => operand(context)) : (context) => operands.some((operand) => operand(context));
  }
  if (expression.operator === "addedBefore" || expression.operator === "addedWithin") {
    const threshold = now - parseRelativeDurationMs(expression.value);
    return (context) => {
      const createdAt = parseTrackCreatedAt(context.track.createdAt);
      if (!Number.isFinite(createdAt) || !Number.isFinite(threshold)) return false;
      return expression.operator === "addedBefore" ? createdAt <= threshold : createdAt >= threshold;
    };
  }
  return compileValue(
    expression.field,
    expression.operator === "isEmpty" ? null : expression.value
  );
}
function compileRule(rule, now = Date.now()) {
  if ("preset" in rule) throw new Error("播放统计预设必须按播放记录查询");
  const matches = isExpressionRule(rule) ? compileExpression(rule.expression, now) : (() => {
    const conditions = rule.conditions.map(
      (condition) => compileValue(
        condition.field === "genre" ? "genre" : "albumArtistOrArtist",
        condition.value
      )
    );
    return (context) => conditions.every((condition) => condition(context));
  })();
  return (track) => matches({ track, values: {} });
}
function hasAddedWithinPredicate(expression) {
  if (expression.type === "predicate") {
    return expression.field === "added" && expression.operator === "addedWithin";
  }
  return expression.operands.some(hasAddedWithinPredicate);
}
function sortRecentAddedTracks(tracks) {
  const albums = /* @__PURE__ */ new Map();
  for (const track of [...tracks].sort(compareTracksByCreatedAtDesc)) {
    const key = `${track.albumArtist || track.artist || ""}\0${track.album || ""}`;
    const album = albums.get(key);
    if (album) album.push(track);
    else albums.set(key, [track]);
  }
  return [...albums.values()].flatMap(
    (album) => album.sort(
      (left, right) => (left.discNo ?? 1) - (right.discNo ?? 1) || (left.trackNo ?? Infinity) - (right.trackNo ?? Infinity) || compareTracksByCreatedAtDesc(left, right)
    )
  );
}
function isRecentAddedSmartPlaylist(playlist) {
  return playlist.name.trim() === "最近添加" && isExpressionRule(playlist.rule) && hasAddedWithinPredicate(playlist.rule.expression);
}
const TRACK_LIST_CACHE_TTL_MS = 3e3;
class SmartPlaylistService {
  constructor(smartPlaylistRepository, trackRepository, publishChange = () => {
  }) {
    this.smartPlaylistRepository = smartPlaylistRepository;
    this.trackRepository = trackRepository;
    this.publishChange = publishChange;
  }
  /**
   * Brief in-process cache of getAll() tracks.
   * Database revisions invalidate this cache before an immediate post-change refresh.
   */
  trackListCache = null;
  list() {
    return this.smartPlaylistRepository.list();
  }
  listTrackCounts() {
    const playlists = this.smartPlaylistRepository.list();
    if (playlists.length === 0) {
      this.clearTrackListCache();
      return [];
    }
    const tracks = this.getTracksCached();
    const now = /* @__PURE__ */ new Date();
    const presetTracks = /* @__PURE__ */ new Map();
    return playlists.map((playlist) => ({
      playlistId: playlist.id,
      trackCount: this.getPlaylistTracks(playlist, tracks, now, presetTracks).length
    }));
  }
  getDetail(id) {
    const playlist = this.smartPlaylistRepository.getById(id);
    if (!playlist) return null;
    const tracks = this.getPlaylistTracks(playlist, this.getTracksCached(), /* @__PURE__ */ new Date());
    return {
      playlist,
      tracks: isRecentAddedSmartPlaylist(playlist) ? sortRecentAddedTracks(tracks) : tracks
    };
  }
  create(name, rule) {
    assertValidSmartPlaylistRule(rule);
    const normalizedRule = normalizeRule(rule);
    assertValidSmartPlaylistRule(normalizedRule);
    const canonical = canonicalRule(normalizedRule);
    const playlists = this.smartPlaylistRepository.list();
    const existing = playlists.find((playlist2) => canonicalRule(playlist2.rule) === canonical);
    if (existing) return { playlist: existing, created: false };
    const playlist = this.smartPlaylistRepository.create(
      this.getAvailableName(name, playlists),
      normalizedRule
    );
    this.publishChange({ kind: "smart", playlistId: playlist.id, reason: "created" });
    return { playlist, created: true };
  }
  createFromQuery(query) {
    const expression = parseSmartPlaylistQuery(query);
    const playlists = this.smartPlaylistRepository.list();
    return this.create(this.getAvailableManualName(playlists), { expression });
  }
  createRecentAdded(days = DEFAULT_RECENT_ADDED_DAYS, defaultName = "最近添加") {
    return this.create(defaultName, { preset: "recentAdded", days });
  }
  updateRecentAddedDays(id, days) {
    assertRecentAddedDays(days);
    const playlist = this.smartPlaylistRepository.getById(id);
    if (!playlist) return null;
    if (!("preset" in playlist.rule) || playlist.rule.preset !== "recentAdded") {
      throw new Error("仅最近添加歌单支持修改此时间范围");
    }
    const updated = this.smartPlaylistRepository.updateRule(id, { preset: "recentAdded", days });
    if (updated) this.publishChange({ kind: "smart", playlistId: id, reason: "rule-updated" });
    return updated;
  }
  createRecentFrequent(days = DEFAULT_RECENT_FREQUENT_DAYS) {
    return this.create("最近常听", { preset: "recentFrequent", days });
  }
  updateRecentFrequentDays(id, days) {
    assertRecentFrequentDays(days);
    const playlist = this.smartPlaylistRepository.getById(id);
    if (!playlist) return null;
    if (!isRecentFrequentRule(playlist.rule)) {
      throw new Error("仅最近常听歌单支持修改时间范围");
    }
    const updated = this.smartPlaylistRepository.updateRule(id, { preset: "recentFrequent", days });
    if (updated) this.publishChange({ kind: "smart", playlistId: id, reason: "rule-updated" });
    return updated;
  }
  getPlaylistTracks(playlist, tracks, now, presetTracks = /* @__PURE__ */ new Map()) {
    if (!("preset" in playlist.rule)) {
      return tracks.filter(compileRule(playlist.rule, now.getTime()));
    }
    const rule = playlist.rule;
    const key = canonicalRule(rule);
    const cached = presetTracks.get(key);
    if (cached) return cached;
    if (rule.preset === "recentAdded") {
      const end = now.getTime();
      const start = end - rule.days * 864e5;
      const result2 = sortRecentAddedTracks(
        tracks.filter((track) => {
          const added = parseTrackCreatedAt(track.createdAt);
          return added >= start && added <= end;
        })
      );
      presetTracks.set(key, result2);
      return result2;
    }
    let ids;
    if (rule.preset === "mostListened") {
      ids = this.smartPlaylistRepository.getMostListenedTrackIds();
    } else {
      const { startDate, endDate } = resolveRecentFrequentDateRange(rule.days, now);
      ids = rule.preset === "recentPlayed" ? this.smartPlaylistRepository.getRecentPlayedTrackIds(startDate, endDate) : this.smartPlaylistRepository.getRecentFrequentTrackIds(startDate, endDate);
    }
    const byId = new Map(tracks.map((track) => [track.id, track]));
    const result = ids.flatMap((id) => {
      const track = byId.get(id);
      return track ? [track] : [];
    });
    presetTracks.set(key, result);
    return result;
  }
  /** Drop the short-lived track list cache (e.g. after a known library mutation if wired). */
  clearTrackListCache() {
    this.trackListCache = null;
  }
  /**
   * Load available tracks once per batch evaluation window.
   * listTrackCounts reuses one getAll() for all smart playlists; getDetail shares the same TTL cache.
   */
  getTracksCached() {
    const now = Date.now();
    const revision = this.trackRepository.getChangeToken();
    if (this.trackListCache && this.trackListCache.expiresAt > now && this.trackListCache.revision === revision) {
      return this.trackListCache.tracks;
    }
    const tracks = this.trackRepository.getAll();
    this.trackListCache = {
      tracks,
      expiresAt: now + TRACK_LIST_CACHE_TTL_MS,
      revision
    };
    return tracks;
  }
  rename(id, name) {
    const playlist = this.smartPlaylistRepository.getById(id);
    if (!playlist) return null;
    const others = this.smartPlaylistRepository.list().filter((item) => item.id !== id);
    const renamed = this.smartPlaylistRepository.rename(id, this.getAvailableName(name, others));
    if (renamed) this.publishChange({ kind: "smart", playlistId: id, reason: "renamed" });
    return renamed;
  }
  updateViewMode(id, viewMode) {
    const playlist = this.smartPlaylistRepository.updateViewMode(id, viewMode);
    if (playlist) this.publishChange({ kind: "smart", playlistId: id, reason: "view-mode-updated" });
    return playlist;
  }
  delete(id) {
    const deleted = this.smartPlaylistRepository.delete(id);
    if (deleted) this.publishChange({ kind: "smart", playlistId: id, reason: "deleted" });
    return deleted;
  }
  reorder(ids) {
    const existing = this.smartPlaylistRepository.list();
    const existingIds = new Set(existing.map((playlist) => playlist.id));
    const uniqueIds = new Set(ids);
    if (ids.length !== existing.length || uniqueIds.size !== ids.length || ids.some((id) => !existingIds.has(id))) {
      return existing;
    }
    const reordered = this.smartPlaylistRepository.reorder(ids);
    this.publishChange({ kind: "collection", reason: "reordered" });
    return reordered;
  }
  getAvailableName(name, playlists) {
    const baseName = name.trim();
    const names = new Set(playlists.map((playlist) => playlist.name.trim().toLocaleLowerCase()));
    if (!names.has(baseName.toLocaleLowerCase())) return baseName;
    let suffix = 2;
    while (names.has(`${baseName} (${suffix})`.toLocaleLowerCase())) suffix += 1;
    return `${baseName} (${suffix})`;
  }
  getAvailableManualName(playlists) {
    const names = new Set(playlists.map((playlist) => playlist.name.trim().toLocaleLowerCase()));
    let suffix = 1;
    while (names.has(`智能歌单${suffix}`.toLocaleLowerCase())) suffix += 1;
    return `智能歌单${suffix}`;
  }
}
async function revealLibraryInExplorer(trackIds, dependencies) {
  const roots = dependencies.getRootPaths();
  let sawOutside = false;
  let sawLibraryPath = false;
  for (const trackId of trackIds) {
    const stored = dependencies.getFilePathById(trackId);
    if (!stored) continue;
    if (!isPathUnderAnyRoot(stored, [...roots])) {
      sawOutside = true;
      continue;
    }
    sawLibraryPath = true;
    const filePath = resolve(stored);
    const filePresence = await readPresence(dependencies, filePath);
    if (filePresence === "file") {
      return revealFile(dependencies, filePath);
    }
    if (filePresence !== "missing") continue;
    const parent = dirname(filePath);
    if (!isLibraryDirectory(parent, roots)) continue;
    if (await readPresence(dependencies, parent) !== "directory") continue;
    return revealDirectory(dependencies, parent);
  }
  if (sawLibraryPath) return { ok: false, reason: "unavailable" };
  if (sawOutside) return { ok: false, reason: "outside-library" };
  return { ok: false, reason: "not-found" };
}
async function revealFile(dependencies, filePath) {
  try {
    dependencies.showItemInFolder(filePath);
    return { ok: true };
  } catch {
    return { ok: false, reason: "reveal-failed" };
  }
}
async function revealDirectory(dependencies, directoryPath) {
  try {
    const error = await dependencies.openPath(directoryPath);
    return error ? { ok: false, reason: "reveal-failed" } : { ok: true };
  } catch {
    return { ok: false, reason: "reveal-failed" };
  }
}
function isLibraryDirectory(candidate, rootPaths) {
  return rootPaths.some((rootPath) => {
    if (isPathUnderRoot(candidate, rootPath)) return true;
    return sameResolvedPath(candidate, rootPath);
  });
}
function sameResolvedPath(left, right) {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  if (process.platform === "win32") {
    return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase();
  }
  return resolvedLeft === resolvedRight;
}
async function readPresence(dependencies, filePath) {
  try {
    const stats = await dependencies.stat(filePath);
    if (stats.isFile()) return "file";
    if (stats.isDirectory()) return "directory";
    return "unreadable";
  } catch (error) {
    const code = error?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return "missing";
    return "unreadable";
  }
}
function registerLibraryIpcHandlers(registrar, dependencies) {
  const { libraryService, libraryScanService, metadataWatchService, revealInExplorer } = dependencies;
  registrar.handle(ipcChannels.library.getStats, () => libraryService.getStats());
  registrar.handle(ipcChannels.library.selectRoot, async () => {
    const result = await libraryScanService.selectRoot();
    metadataWatchService.syncRoots();
    return result;
  });
  registrar.handle(ipcChannels.library.getRoots, () => libraryScanService.getRoots());
  registrar.handle(
    ipcChannels.library.startScan,
    (_event, payload) => libraryScanService.startScan(payload.rootId)
  );
  registrar.handle(
    ipcChannels.library.cancelScan,
    (_event, payload) => libraryScanService.cancelScan(payload.jobId)
  );
  registrar.handle(
    ipcChannels.library.getScanStatus,
    (_event, payload) => libraryScanService.getScanStatus(payload?.jobId)
  );
  registrar.handle(ipcChannels.library.getTracks, () => libraryService.getTracks());
  registrar.handle(ipcChannels.library.getTrackPage, (_event, payload) => {
    try {
      return libraryService.getTrackPage(payload);
    } catch (error) {
      if (error instanceof LibraryCatalogExpiredError) {
        return { error: { code: "CATALOG_SNAPSHOT_EXPIRED" } };
      }
      throw error;
    }
  });
  registrar.handle(
    ipcChannels.library.getAlbumDetail,
    (_event, payload) => libraryService.getAlbumDetail(payload)
  );
  registrar.handle(
    ipcChannels.library.revealInExplorer,
    (_event, payload) => revealLibraryInExplorer(payload.trackIds, revealInExplorer)
  );
  registrar.handle(
    ipcChannels.lyrics.getByTrackId,
    (_event, payload) => libraryService.getLyrics(payload.trackId)
  );
}
function registerMetadataIpcHandlers(registrar, dependencies) {
  const { metadataRefreshService, playbackFileCoordinator } = dependencies;
  registrar.handle(
    ipcChannels.metadata.getTrackEditState,
    (_event, payload) => playbackFileCoordinator.getTrackState(payload.trackId)
  );
  registrar.handle(
    ipcChannels.metadata.refreshTrack,
    (_event, payload) => metadataRefreshService.refreshTrack(payload.trackId)
  );
  registrar.handle(
    ipcChannels.metadata.refreshTracks,
    (_event, payload) => metadataRefreshService.refreshTracks(payload.trackIds)
  );
  registrar.handle(
    ipcChannels.metadata.refreshLyricsMissing,
    (_event, payload) => metadataRefreshService.refreshLyricsForMissing(payload?.limit)
  );
  registrar.handle(
    ipcChannels.metadata.getRefreshStatus,
    (_event, payload) => metadataRefreshService.getJobStatus(payload.jobId)
  );
  registrar.handle(
    ipcChannels.metadata.listRefreshFailures,
    (_event, payload) => metadataRefreshService.listFailures(payload?.limit)
  );
  registrar.handle(
    ipcChannels.metadata.clearRefreshFailures,
    () => metadataRefreshService.clearFailures()
  );
  registrar.handle(
    ipcChannels.metadata.getTrackMetadata,
    (_event, payload) => metadataRefreshService.getTrackMetadata(payload.trackId)
  );
  registrar.handle(
    ipcChannels.metadata.getTrackEditSnapshot,
    (_event, payload) => metadataRefreshService.getTrackEditSnapshot(payload.trackId)
  );
  registrar.handle(
    ipcChannels.metadata.updateTrackMetadata,
    async (_event, payload) => {
      try {
        return await metadataRefreshService.saveTrackMetadata(payload);
      } catch (error) {
        return { ok: false, reason: metadataSaveFailureReason(error) ?? "save-failed" };
      }
    }
  );
}
function registerLyricsEditorIpcHandlers(registrar, lrcService) {
  const owners = /* @__PURE__ */ new WeakSet();
  function owner(sender) {
    const ownerId = sender.id;
    if (!owners.has(sender)) {
      owners.add(sender);
      sender.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) {
          lrcService.releaseOwner(ownerId);
        }
      });
      sender.on("render-process-gone", () => {
        lrcService.releaseOwner(ownerId);
      });
      sender.once("destroyed", () => {
        lrcService.releaseOwner(ownerId);
      });
    }
    return ownerId;
  }
  async function result(operation) {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      return editorFailure(error);
    }
  }
  registrar.handle(
    ipcChannels.lyrics.openLrcEditor,
    (event, request) => result(() => lrcService.open(owner(event.sender), request.trackId))
  );
  registrar.handle(
    ipcChannels.lyrics.saveLrcEditor,
    (event, request) => result(() => lrcService.save(owner(event.sender), request))
  );
  registrar.handle(
    ipcChannels.lyrics.closeLrcEditor,
    (event, request) => result(() => {
      lrcService.close(owner(event.sender), request.sessionId);
      return null;
    })
  );
}
function registerPlaybackArchiveIpcHandlers(registrar, dependencies) {
  const { libraryService, playStatsService, getAudioUrl, notifyLibraryChanged } = dependencies;
  registrar.handle(
    ipcChannels.playback.getAudioUrl,
    (_event, payload) => getAudioUrl(payload.trackId)
  );
  registrar.handle(
    ipcChannels.playback.getRandomTrack,
    (_event, payload) => libraryService.getRandomTrack(payload?.excludeTrackId)
  );
  registrar.handle(
    ipcChannels.playback.getRandomAlbumTracks,
    (_event, payload) => libraryService.getRandomAlbumTracks(payload?.excludeAlbumKey)
  );
  registrar.handle(
    ipcChannels.playback.getAlbumTracks,
    (_event, payload) => libraryService.getAlbumTracks(payload.albumKey)
  );
  registrar.handle(
    ipcChannels.playback.recordEffectivePlay,
    (_event, payload) => {
      const result = playStatsService.recordEffectivePlay(payload);
      if (result.ok && result.recorded) {
        notifyLibraryChanged({
          reason: "play-stats-updated",
          trackIds: [payload.trackId],
          filePaths: []
        });
      }
      return result;
    }
  );
  registrar.handle(
    ipcChannels.archive.getAnnualPlayCounts,
    (_event, payload) => playStatsService.getAnnualPlayCounts(payload.year)
  );
  registrar.handle(
    ipcChannels.archive.getAnnualSummary,
    (_event, payload) => playStatsService.getAnnualSummary(payload.year)
  );
  registrar.handle(
    ipcChannels.archive.getDayTopTracks,
    (_event, payload) => playStatsService.getDayTopTracks(payload.date)
  );
  registrar.handle(
    ipcChannels.archive.getDayTopAlbums,
    (_event, payload) => playStatsService.getDayTopAlbums(payload.date)
  );
  registrar.handle(ipcChannels.archive.resetPlayStats, () => {
    const result = playStatsService.resetAll();
    notifyLibraryChanged({
      reason: "play-stats-reset",
      trackIds: [],
      filePaths: []
    });
    return result;
  });
}
function registerPlaylistIpcHandlers(registrar, dependencies) {
  const { playlistService, smartPlaylistService, getSmartTrackCounts } = dependencies;
  registrar.handle(ipcChannels.smartPlaylists.list, () => smartPlaylistService.list());
  registrar.handle(
    ipcChannels.smartPlaylists.listTrackCounts,
    () => smartPlaylistService.listTrackCounts()
  );
  registrar.handle(
    ipcChannels.smartPlaylists.getDetail,
    (_event, payload) => smartPlaylistService.getDetail(payload.id)
  );
  registrar.handle(
    ipcChannels.smartPlaylists.create,
    (_event, payload) => smartPlaylistService.create(payload.name, payload.rule)
  );
  registrar.handle(
    ipcChannels.smartPlaylists.createFromQuery,
    (_event, payload) => smartPlaylistService.createFromQuery(payload.query)
  );
  registrar.handle(
    ipcChannels.smartPlaylists.createRecentAdded,
    (_event, payload) => smartPlaylistService.createRecentAdded(payload.days, getNativeUiMessages().recentAdded)
  );
  registrar.handle(
    ipcChannels.smartPlaylists.updateRecentAddedDays,
    (_event, payload) => smartPlaylistService.updateRecentAddedDays(payload.id, payload.days)
  );
  registrar.handle(
    ipcChannels.smartPlaylists.rename,
    (_event, payload) => smartPlaylistService.rename(payload.id, payload.name)
  );
  registrar.handle(
    ipcChannels.smartPlaylists.updateViewMode,
    (_event, payload) => smartPlaylistService.updateViewMode(payload.id, payload.viewMode)
  );
  registrar.handle(ipcChannels.smartPlaylists.delete, (_event, payload) => ({
    deleted: smartPlaylistService.delete(payload.id)
  }));
  registrar.handle(
    ipcChannels.smartPlaylists.reorder,
    (_event, payload) => smartPlaylistService.reorder(payload.ids)
  );
  registrar.handle(ipcChannels.playlists.list, () => playlistService.list());
  registrar.handle(ipcChannels.playlists.listTrackCounts, () => playlistService.listTrackCounts());
  registrar.handle(
    ipcChannels.playlists.listSidebarItems,
    () => playlistService.listSidebarItems(getSmartTrackCounts())
  );
  registrar.handle(
    ipcChannels.playlists.getDetail,
    (_event, payload) => playlistService.getDetail(payload.id)
  );
  registrar.handle(
    ipcChannels.playlists.create,
    () => playlistService.create(getNativeUiMessages().newPlaylist)
  );
  registrar.handle(
    ipcChannels.playlists.rename,
    (_event, payload) => playlistService.rename(payload.id, payload.name)
  );
  registrar.handle(
    ipcChannels.playlists.updateViewMode,
    (_event, payload) => playlistService.updateViewMode(payload.id, payload.viewMode)
  );
  registrar.handle(ipcChannels.playlists.delete, (_event, payload) => ({
    deleted: playlistService.delete(payload.id)
  }));
  registrar.handle(
    ipcChannels.playlists.addTracks,
    (_event, payload) => playlistService.addTracks(payload.id, payload.trackIds)
  );
  registrar.handle(
    ipcChannels.playlists.reorderSidebarItems,
    (_event, payload) => {
      playlistService.reorderSidebarItems(payload.items);
      return playlistService.listSidebarItems(getSmartTrackCounts());
    }
  );
}
function createMetadataRefreshEvents(send) {
  return {
    libraryChanged: (event) => send(ipcChannels.library.changed, event),
    refreshProgress: (progress) => send(ipcChannels.metadata.refreshProgress, progress)
  };
}
let store$4;
const DEFAULT_CONFIG = {
  lang: void 0,
  message: void 0,
  abortEarly: void 0,
  abortPipeEarly: void 0
};
// @__NO_SIDE_EFFECTS__
function getGlobalConfig(config$1) {
  if (!config$1 && !store$4) return DEFAULT_CONFIG;
  return {
    lang: config$1?.lang ?? store$4?.lang,
    message: config$1?.message,
    abortEarly: config$1?.abortEarly ?? store$4?.abortEarly,
    abortPipeEarly: config$1?.abortPipeEarly ?? store$4?.abortPipeEarly
  };
}
let store$3;
// @__NO_SIDE_EFFECTS__
function getGlobalMessage(lang) {
  return store$3?.get(lang);
}
let store$2;
// @__NO_SIDE_EFFECTS__
function getSchemaMessage(lang) {
  return store$2?.get(lang);
}
let store$1;
// @__NO_SIDE_EFFECTS__
function getSpecificMessage(reference, lang) {
  return store$1?.get(reference)?.get(lang);
}
// @__NO_SIDE_EFFECTS__
function _stringify(input) {
  const type = typeof input;
  if (type === "string") return `"${input}"`;
  if (type === "number" || type === "bigint" || type === "boolean") return `${input}`;
  if (type === "object" || type === "function") return (input && Object.getPrototypeOf(input)?.constructor?.name) ?? "null";
  return type;
}
function _addIssue(context, label, dataset, config$1, other) {
  const input = other && "input" in other ? other.input : dataset.value;
  const expected = other?.expected ?? context.expects ?? null;
  const received = other?.received ?? /* @__PURE__ */ _stringify(input);
  const issue = {
    kind: context.kind,
    type: context.type,
    input,
    expected,
    received,
    message: `Invalid ${label}: ${expected ? `Expected ${expected} but r` : "R"}eceived ${received}`,
    requirement: context.requirement,
    path: other?.path,
    issues: other?.issues,
    lang: config$1.lang,
    abortEarly: config$1.abortEarly,
    abortPipeEarly: config$1.abortPipeEarly
  };
  const isSchema = context.kind === "schema";
  const message$1 = other?.message ?? context.message ?? /* @__PURE__ */ getSpecificMessage(context.reference, issue.lang) ?? (isSchema ? /* @__PURE__ */ getSchemaMessage(issue.lang) : null) ?? config$1.message ?? /* @__PURE__ */ getGlobalMessage(issue.lang);
  if (message$1 !== void 0) issue.message = typeof message$1 === "function" ? message$1(issue) : message$1;
  if (isSchema) dataset.typed = false;
  if (dataset.issues) dataset.issues.push(issue);
  else dataset.issues = [issue];
}
// @__NO_SIDE_EFFECTS__
function _joinExpects(values$1, separator) {
  const list = [...new Set(values$1)];
  if (list.length > 1) return `(${list.join(` ${separator} `)})`;
  return list[0] ?? "never";
}
function _standardSchema(schema) {
  schema["~standard"] = {
    version: 1,
    vendor: "valibot",
    validate: (value$1) => schema["~run"]({ value: value$1 }, /* @__PURE__ */ getGlobalConfig())
  };
  return schema;
}
// @__NO_SIDE_EFFECTS__
function finite(message$1) {
  return {
    kind: "validation",
    type: "finite",
    reference: finite,
    async: false,
    expects: null,
    requirement: Number.isFinite,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !this.requirement(dataset.value)) _addIssue(this, "finite", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function maxLength(requirement, message$1) {
  return {
    kind: "validation",
    type: "max_length",
    reference: maxLength,
    async: false,
    expects: `<=${requirement}`,
    requirement,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && dataset.value.length > this.requirement) _addIssue(this, "length", dataset, config$1, { received: `${dataset.value.length}` });
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function maxValue(requirement, message$1) {
  return {
    kind: "validation",
    type: "max_value",
    reference: maxValue,
    async: false,
    expects: `<=${requirement instanceof Date ? requirement.toJSON() : /* @__PURE__ */ _stringify(requirement)}`,
    requirement,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !(dataset.value <= this.requirement)) _addIssue(this, "value", dataset, config$1, { received: dataset.value instanceof Date ? dataset.value.toJSON() : /* @__PURE__ */ _stringify(dataset.value) });
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function minLength(requirement, message$1) {
  return {
    kind: "validation",
    type: "min_length",
    reference: minLength,
    async: false,
    expects: `>=${requirement}`,
    requirement,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && dataset.value.length < this.requirement) _addIssue(this, "length", dataset, config$1, { received: `${dataset.value.length}` });
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function minValue(requirement, message$1) {
  return {
    kind: "validation",
    type: "min_value",
    reference: minValue,
    async: false,
    expects: `>=${requirement instanceof Date ? requirement.toJSON() : /* @__PURE__ */ _stringify(requirement)}`,
    requirement,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !(dataset.value >= this.requirement)) _addIssue(this, "value", dataset, config$1, { received: dataset.value instanceof Date ? dataset.value.toJSON() : /* @__PURE__ */ _stringify(dataset.value) });
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function safeInteger(message$1) {
  return {
    kind: "validation",
    type: "safe_integer",
    reference: safeInteger,
    async: false,
    expects: null,
    requirement: Number.isSafeInteger,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !this.requirement(dataset.value)) _addIssue(this, "safe integer", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function getFallback(schema, dataset, config$1) {
  return typeof schema.fallback === "function" ? schema.fallback(dataset, config$1) : schema.fallback;
}
// @__NO_SIDE_EFFECTS__
function getDefault(schema, dataset, config$1) {
  return typeof schema.default === "function" ? schema.default(dataset, config$1) : schema.default;
}
// @__NO_SIDE_EFFECTS__
function array(item, message$1) {
  return _standardSchema({
    kind: "schema",
    type: "array",
    reference: array,
    expects: "Array",
    async: false,
    item,
    message: message$1,
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (Array.isArray(input)) {
        dataset.typed = true;
        dataset.value = [];
        for (let key = 0; key < input.length; key++) {
          const value$1 = input[key];
          const itemDataset = this.item["~run"]({ value: value$1 }, config$1);
          if (itemDataset.issues) {
            const pathItem = {
              type: "array",
              origin: "value",
              input,
              key,
              value: value$1
            };
            for (const issue of itemDataset.issues) {
              if (issue.path) issue.path.unshift(pathItem);
              else issue.path = [pathItem];
              dataset.issues?.push(issue);
            }
            if (!dataset.issues) dataset.issues = itemDataset.issues;
            if (config$1.abortEarly) {
              dataset.typed = false;
              break;
            }
          }
          if (!itemDataset.typed) dataset.typed = false;
          dataset.value.push(itemDataset.value);
        }
      } else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
// @__NO_SIDE_EFFECTS__
function boolean(message$1) {
  return _standardSchema({
    kind: "schema",
    type: "boolean",
    reference: boolean,
    expects: "boolean",
    async: false,
    message: message$1,
    "~run"(dataset, config$1) {
      if (typeof dataset.value === "boolean") dataset.typed = true;
      else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
// @__NO_SIDE_EFFECTS__
function custom(check$1, message$1) {
  return _standardSchema({
    kind: "schema",
    type: "custom",
    reference: custom,
    expects: "unknown",
    async: false,
    check: check$1,
    message: message$1,
    "~run"(dataset, config$1) {
      if (this.check(dataset.value)) dataset.typed = true;
      else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
// @__NO_SIDE_EFFECTS__
function nullable$1(wrapped, default_) {
  return _standardSchema({
    kind: "schema",
    type: "nullable",
    reference: nullable$1,
    expects: `(${wrapped.expects} | null)`,
    async: false,
    wrapped,
    default: default_,
    "~run"(dataset, config$1) {
      if (dataset.value === null) {
        if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
        if (dataset.value === null) {
          dataset.typed = true;
          return dataset;
        }
      }
      return this.wrapped["~run"](dataset, config$1);
    }
  });
}
// @__NO_SIDE_EFFECTS__
function number(message$1) {
  return _standardSchema({
    kind: "schema",
    type: "number",
    reference: number,
    expects: "number",
    async: false,
    message: message$1,
    "~run"(dataset, config$1) {
      if (typeof dataset.value === "number" && !isNaN(dataset.value)) dataset.typed = true;
      else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
// @__NO_SIDE_EFFECTS__
function optional$1(wrapped, default_) {
  return _standardSchema({
    kind: "schema",
    type: "optional",
    reference: optional$1,
    expects: `(${wrapped.expects} | undefined)`,
    async: false,
    wrapped,
    default: default_,
    "~run"(dataset, config$1) {
      if (dataset.value === void 0) {
        if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
        if (dataset.value === void 0) {
          dataset.typed = true;
          return dataset;
        }
      }
      return this.wrapped["~run"](dataset, config$1);
    }
  });
}
// @__NO_SIDE_EFFECTS__
function picklist(options, message$1) {
  return _standardSchema({
    kind: "schema",
    type: "picklist",
    reference: picklist,
    expects: /* @__PURE__ */ _joinExpects(options.map(_stringify), "|"),
    async: false,
    options,
    message: message$1,
    "~run"(dataset, config$1) {
      if (this.options.includes(dataset.value)) dataset.typed = true;
      else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
// @__NO_SIDE_EFFECTS__
function strictObject(entries$1, message$1) {
  return _standardSchema({
    kind: "schema",
    type: "strict_object",
    reference: strictObject,
    expects: "Object",
    async: false,
    entries: entries$1,
    message: message$1,
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (input && typeof input === "object") {
        dataset.typed = true;
        dataset.value = {};
        for (const key in this.entries) {
          const valueSchema = this.entries[key];
          if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && valueSchema.default !== void 0) {
            const value$1 = key in input ? input[key] : /* @__PURE__ */ getDefault(valueSchema);
            const valueDataset = valueSchema["~run"]({ value: value$1 }, config$1);
            if (valueDataset.issues) {
              const pathItem = {
                type: "object",
                origin: "value",
                input,
                key,
                value: value$1
              };
              for (const issue of valueDataset.issues) {
                if (issue.path) issue.path.unshift(pathItem);
                else issue.path = [pathItem];
                dataset.issues?.push(issue);
              }
              if (!dataset.issues) dataset.issues = valueDataset.issues;
              if (config$1.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            if (!valueDataset.typed) dataset.typed = false;
            dataset.value[key] = valueDataset.value;
          } else if (valueSchema.fallback !== void 0) dataset.value[key] = /* @__PURE__ */ getFallback(valueSchema);
          else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
            _addIssue(this, "key", dataset, config$1, {
              input: void 0,
              expected: `"${key}"`,
              path: [{
                type: "object",
                origin: "key",
                input,
                key,
                value: input[key]
              }]
            });
            if (config$1.abortEarly) break;
          }
        }
        if (!dataset.issues || !config$1.abortEarly) {
          for (const key in input) if (!Object.prototype.hasOwnProperty.call(this.entries, key)) {
            _addIssue(this, "key", dataset, config$1, {
              input: key,
              expected: "never",
              path: [{
                type: "object",
                origin: "key",
                input,
                key,
                value: input[key]
              }]
            });
            break;
          }
        }
      } else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
// @__NO_SIDE_EFFECTS__
function string(message$1) {
  return _standardSchema({
    kind: "schema",
    type: "string",
    reference: string,
    expects: "string",
    async: false,
    message: message$1,
    "~run"(dataset, config$1) {
      if (typeof dataset.value === "string") dataset.typed = true;
      else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
// @__NO_SIDE_EFFECTS__
function pipe(...pipe$1) {
  return _standardSchema({
    ...pipe$1[0],
    pipe: pipe$1,
    "~run"(dataset, config$1) {
      for (const item of pipe$1) if (item.kind !== "metadata") {
        if (dataset.issues && (item.kind === "schema" || item.kind === "transformation")) {
          dataset.typed = false;
          break;
        }
        if (!dataset.issues || !config$1.abortEarly && !config$1.abortPipeEarly) dataset = item["~run"](dataset, config$1);
      }
      return dataset;
    }
  });
}
// @__NO_SIDE_EFFECTS__
function safeParse(schema, input, config$1) {
  const dataset = schema["~run"]({ value: input }, /* @__PURE__ */ getGlobalConfig(config$1));
  return {
    typed: dataset.typed,
    success: !dataset.issues,
    output: dataset.value,
    issues: dataset.issues
  };
}
const WINDOW_CLOSE_BEHAVIORS = ["quit", "tray"];
function isWindowCloseBehavior(value) {
  return WINDOW_CLOSE_BEHAVIORS.some((behavior) => behavior === value);
}
const SMART_PLAYLIST_MAX_OPERANDS = 64;
const MAX_TEXT_LENGTH = 8192;
const MAX_QUERY_LENGTH = 4096;
const MAX_CURSOR_LENGTH = 4096;
const MAX_SESSION_ID_LENGTH = 256;
const MAX_ID_LIST_LENGTH = 1e4;
const MAX_REORDER_LIST_LENGTH = 5e3;
const MAX_VALIDATION_NODES = 5e4;
const MAX_PAYLOAD_STRING_UNITS = 262144;
const MAX_RULE_DEPTH = 16;
const MAX_RULE_NODES = 256;
const dangerousPropertyNames = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
class PayloadValidationFailure extends Error {
}
class IpcPayloadValidationError extends Error {
  constructor(channel, reason) {
    super(`Invalid IPC payload for "${channel}": ${reason}`);
    this.name = "IpcPayloadValidationError";
  }
}
function fail(path, expectation) {
  throw new PayloadValidationFailure(`${path} ${expectation}`);
}
function touch(context, path) {
  context.nodes += 1;
  if (context.nodes > MAX_VALIDATION_NODES) {
    fail(path, "exceeds the structural size limit");
  }
}
function parseSchema(schema, value, path) {
  const result = /* @__PURE__ */ safeParse(schema, value, { abortEarly: true, abortPipeEarly: true });
  if (!result.success) {
    const issue = result.issues[0];
    const suffix = (issue.path ?? []).map(({ key }) => typeof key === "number" ? `[${key}]` : `.${key}`).join("");
    fail(`${path}${suffix}`, issue.message);
  }
  return result.output;
}
function schemaValidator(schema) {
  return (value, path, context) => {
    touch(context, path);
    parseSchema(schema, value, path);
  };
}
const booleanValue = schemaValidator(/* @__PURE__ */ boolean("must be a boolean"));
function stringValue(options = { max: MAX_TEXT_LENGTH }) {
  const schema = /* @__PURE__ */ pipe(
    /* @__PURE__ */ string("must be a string"),
    /* @__PURE__ */ minLength(options.min ?? 0, "has an invalid length"),
    /* @__PURE__ */ maxLength(options.max, "has an invalid length")
  );
  return (value, path, context) => {
    touch(context, path);
    const text = parseSchema(schema, value, path);
    context.stringUnits += text.length;
    if (context.stringUnits > MAX_PAYLOAD_STRING_UNITS) {
      fail(path, "exceeds the aggregate string size limit");
    }
  };
}
const listeningArchiveDateValue = (value, path, context) => {
  stringValue({ min: 10, max: 10 })(value, path, context);
  if (!isListeningArchiveDate(value)) fail(path, "must be a valid local calendar date");
};
function finiteNumber(options = {}) {
  const number$1 = /* @__PURE__ */ pipe(/* @__PURE__ */ number("must be a finite number"), /* @__PURE__ */ finite("must be a finite number"));
  return schemaValidator(
    /* @__PURE__ */ pipe(
      options.integer ? /* @__PURE__ */ pipe(number$1, /* @__PURE__ */ safeInteger("must be a safe integer")) : number$1,
      /* @__PURE__ */ minValue(options.min ?? -Infinity, "is below the minimum"),
      /* @__PURE__ */ maxValue(options.max ?? Infinity, "exceeds the maximum")
    )
  );
}
const positiveId = finiteNumber({ integer: true, min: 1 });
function dataProperty(value, key) {
  if (value === null || typeof value !== "object") return void 0;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : void 0;
}
const recentAddedDays = (value, path, context) => {
  finiteNumber({ min: 1, integer: true })(value, path, context);
  try {
    assertRecentAddedDays(value);
  } catch {
    fail(path, "must be 7, 30, 90 or 365 days");
  }
};
const nativePlaybackCommand = (value, path, context) => {
  const action = dataProperty(value, "action");
  const fields = {
    session: field(finiteNumber({ integer: true, min: 0 })),
    action: field(
      enumValue(["start", "next", "pause", "resume", "stop", "cancel-next", "seek", "volume"])
    )
  };
  if (action === "start" || action === "next") fields.trackId = field(positiveId);
  if (action === "start" || action === "volume") {
    fields.volume = field(finiteNumber({ min: 0, max: 1 }));
    fields.muted = field(booleanValue);
  }
  if (action === "next") {
    fields.trimDigitalSilence = field(booleanValue);
    fields.softTransition = field(booleanValue, true);
    fields.softTransitionDurationSeconds = field(
      schemaValidator(
        /* @__PURE__ */ custom(isSoftTransitionDuration, "must be 1–6 seconds in 0.5-second steps")
      ),
      true
    );
  }
  if (action === "seek") fields.time = field(finiteNumber({ min: 0, max: 604800 }));
  objectShape(fields)(value, path, context);
};
const positiveLimit = finiteNumber({ integer: true, min: 1, max: MAX_ID_LIST_LENGTH });
function enumValue(values) {
  return schemaValidator(/* @__PURE__ */ picklist(values, "has an unsupported value"));
}
function nullable(validator) {
  return (value, path, context) => {
    if (value === null) touch(context, path);
    parseSchema(
      /* @__PURE__ */ nullable$1(
        /* @__PURE__ */ custom((candidate) => {
          validator(candidate, path, context);
          return true;
        }, "has an invalid value")
      ),
      value,
      path
    );
  };
}
function arrayOf(validator, options) {
  const bounds = /* @__PURE__ */ pipe(
    /* @__PURE__ */ custom(
      (value) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype,
      "must be a plain array"
    ),
    /* @__PURE__ */ minLength(options.min ?? 0, "has an invalid item count"),
    /* @__PURE__ */ maxLength(options.max, "has an invalid item count")
  );
  return (value, path, context) => {
    touch(context, path);
    const items = parseSchema(bounds, value, path);
    for (let index2 = 0; index2 < items.length; index2 += 1) {
      if (!Object.hasOwn(items, index2)) fail(`${path}[${index2}]`, "must be present");
    }
    let index = 0;
    parseSchema(
      /* @__PURE__ */ array(
        /* @__PURE__ */ custom((item) => {
          validator(item, `${path}[${index++}]`, context);
          return true;
        }, "has an invalid item"),
        "must be a plain array"
      ),
      items,
      path
    );
  };
}
function objectShape(fields) {
  const entries = Object.entries(fields);
  const allowedKeys = new Set(entries.map(([key]) => key));
  return (value, path, context) => {
    touch(context, path);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail(path, "must be a plain object");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail(path, "must not have a custom prototype");
    }
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (typeof key !== "string") fail(path, "must not contain symbol properties");
      if (dangerousPropertyNames.has(key)) fail(path, "contains a forbidden property");
      if (!allowedKeys.has(key)) fail(path, "contains an unexpected property");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor)) fail(`${path}.${key}`, "must be a data property");
    }
    const schemaEntries = /* @__PURE__ */ Object.create(null);
    for (const [key, field2] of entries) {
      const schema = /* @__PURE__ */ custom((candidate) => {
        field2.validator(candidate, `${path}.${key}`, context);
        return true;
      }, "has an invalid value");
      schemaEntries[key] = field2.optional ? /* @__PURE__ */ optional$1(schema) : schema;
    }
    const record = Object.create(null, descriptors);
    parseSchema(/* @__PURE__ */ strictObject(schemaEntries, "is required"), record, path);
  };
}
function required(validator) {
  return { kind: "required", validator };
}
function optional(validator) {
  return { kind: "optional", validator };
}
function voidPayload() {
  return { kind: "void" };
}
function field(validator, optional2 = false) {
  return { optional: optional2, validator };
}
const idPayload = (key) => objectShape({ [key]: field(positiveId) });
const namePayload = objectShape({
  id: field(positiveId),
  name: field(stringValue({ min: 1, max: 512 }))
});
const viewModePayload = objectShape({
  id: field(positiveId),
  viewMode: field(enumValue(["flat", "cover"]))
});
const albumKey = objectShape({
  albumArtist: field(stringValue({ max: MAX_TEXT_LENGTH })),
  album: field(stringValue({ max: MAX_TEXT_LENGTH }))
});
const partialDate = (value, path, context) => {
  stringValue({ min: 4, max: 10 })(value, path, context);
  if (typeof value !== "string" || !/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.test(value)) {
    fail(path, "must use YYYY, YYYY-MM, or YYYY-MM-DD");
  }
};
const isoTimestamp = (value, path, context) => {
  stringValue({ min: 20, max: 64 })(value, path, context);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) {
    fail(path, "must be an ISO-8601 timestamp with a timezone");
  }
};
const smartPlaylistRule = (value, path, context) => {
  if (value && typeof value === "object" && "preset" in value) {
    const preset = dataProperty(value, "preset");
    if (preset === "mostListened") {
      objectShape({ preset: field(enumValue(["mostListened"])) })(value, path, context);
      return;
    }
    objectShape({
      preset: field(enumValue(["recentPlayed", "recentAdded"])),
      days: field(
        preset === "recentAdded" ? recentAddedDays : finiteNumber({ min: 1, integer: true })
      )
    })(value, path, context);
    return;
  }
  let ruleNodes = 0;
  const countRuleNode = (nodePath, depth) => {
    ruleNodes += 1;
    if (depth > MAX_RULE_DEPTH) fail(nodePath, "exceeds the rule depth limit");
    if (ruleNodes > MAX_RULE_NODES) fail(nodePath, "exceeds the rule node limit");
  };
  const expression = (node, nodePath, nodeContext) => {
    const validateExpression = (candidate, candidatePath, depth) => {
      countRuleNode(candidatePath, depth);
      objectShape({
        type: field(enumValue(["predicate", "and", "or"])),
        field: field(enumValue(["genre", "artist", "albumArtist", "added"]), true),
        operator: field(enumValue(["has", "isEmpty", "addedBefore", "addedWithin"]), true),
        value: field(stringValue({ min: 1, max: MAX_TEXT_LENGTH }), true),
        operands: field(
          arrayOf((operand, operandPath) => validateExpression(operand, operandPath, depth + 1), {
            min: 1,
            max: SMART_PLAYLIST_MAX_OPERANDS
          }),
          true
        )
      })(candidate, candidatePath, nodeContext);
    };
    validateExpression(node, nodePath, 1);
  };
  const legacyCondition = objectShape({
    field: field(enumValue(["genre", "albumArtist"])),
    value: field(nullable(stringValue({ max: MAX_TEXT_LENGTH })))
  });
  objectShape({
    conditions: field(arrayOf(legacyCondition, { min: 1, max: 128 }), true),
    expression: field(expression, true)
  })(value, path, context);
};
const editableMetadata = objectShape({
  trackId: field(positiveId),
  editToken: field(stringValue({ min: 1, max: 128 })),
  legacyAction: field(enumValue(["adopt-file", "write-legacy"]), true),
  changes: field(
    objectShape({
      title: field(nullable(stringValue({ max: MAX_TEXT_LENGTH })), true),
      artistDisplay: field(nullable(stringValue({ max: MAX_TEXT_LENGTH })), true),
      albumTitle: field(nullable(stringValue({ max: MAX_TEXT_LENGTH })), true),
      albumArtistDisplay: field(nullable(stringValue({ max: MAX_TEXT_LENGTH })), true),
      genreDisplay: field(nullable(stringValue({ max: MAX_TEXT_LENGTH })), true),
      releaseDate: field(nullable(partialDate), true)
    })
  )
});
const domainIpcPayloadPolicies = {
  [ipcChannels.database.exportBackup]: voidPayload(),
  [ipcChannels.database.restoreBackup]: voidPayload(),
  [ipcChannels.app.getInfo]: voidPayload(),
  [ipcChannels.app.setLocale]: required(
    objectShape({ locale: field(enumValue(["zh-Hans", "en"])) })
  ),
  [ipcChannels.app.claimCdStartupEntry]: voidPayload(),
  [ipcChannels.app.claimStartupAlbum]: optional(
    objectShape({
      excludeAlbumKey: field(albumKey, true),
      recentAlbums: field(arrayOf(albumKey, { max: STARTUP_ALBUM_HISTORY_LIMIT }), true)
    })
  ),
  [ipcChannels.app.exportDiagnostics]: voidPayload(),
  [ipcChannels.app.drawStartupAlbum]: required(
    objectShape({
      recentAlbums: field(arrayOf(albumKey, { max: STARTUP_ALBUM_HISTORY_LIMIT }))
    })
  ),
  [ipcChannels.library.getStats]: voidPayload(),
  [ipcChannels.library.selectRoot]: voidPayload(),
  [ipcChannels.library.getRoots]: voidPayload(),
  [ipcChannels.library.startScan]: required(idPayload("rootId")),
  [ipcChannels.library.cancelScan]: required(idPayload("jobId")),
  [ipcChannels.library.getScanStatus]: optional(objectShape({ jobId: field(positiveId, true) })),
  [ipcChannels.library.getTracks]: voidPayload(),
  [ipcChannels.library.getTrackPage]: required(
    objectShape({
      cursor: field(stringValue({ min: 1, max: MAX_CURSOR_LENGTH }), true),
      limit: field(
        finiteNumber({ integer: true, min: 1, max: LIBRARY_CATALOG_MAX_PAGE_SIZE }),
        true
      ),
      refresh: field(booleanValue, true)
    })
  ),
  [ipcChannels.library.getAlbumDetail]: required(
    objectShape({
      albumArtist: field(stringValue({ max: MAX_TEXT_LENGTH })),
      albumTitle: field(stringValue({ max: MAX_TEXT_LENGTH }))
    })
  ),
  [ipcChannels.library.revealInExplorer]: required(
    objectShape({
      trackIds: field(arrayOf(positiveId, { min: 1, max: MAX_ID_LIST_LENGTH }))
    })
  ),
  [ipcChannels.smartPlaylists.list]: voidPayload(),
  [ipcChannels.smartPlaylists.listTrackCounts]: voidPayload(),
  [ipcChannels.smartPlaylists.getDetail]: required(idPayload("id")),
  [ipcChannels.smartPlaylists.create]: required(
    objectShape({
      name: field(stringValue({ min: 1, max: 512 })),
      rule: field(smartPlaylistRule)
    })
  ),
  [ipcChannels.smartPlaylists.createFromQuery]: required(
    objectShape({ query: field(stringValue({ min: 1, max: MAX_QUERY_LENGTH })) })
  ),
  [ipcChannels.smartPlaylists.createRecentAdded]: required(
    objectShape({ days: field(recentAddedDays, true) })
  ),
  [ipcChannels.smartPlaylists.updateRecentAddedDays]: required(
    objectShape({ id: field(positiveId), days: field(recentAddedDays) })
  ),
  [ipcChannels.smartPlaylists.rename]: required(namePayload),
  [ipcChannels.smartPlaylists.updateViewMode]: required(viewModePayload),
  [ipcChannels.smartPlaylists.delete]: required(idPayload("id")),
  [ipcChannels.smartPlaylists.reorder]: required(
    objectShape({ ids: field(arrayOf(positiveId, { max: MAX_REORDER_LIST_LENGTH })) })
  ),
  [ipcChannels.playlists.list]: voidPayload(),
  [ipcChannels.playlists.listTrackCounts]: voidPayload(),
  [ipcChannels.playlists.listSidebarItems]: voidPayload(),
  [ipcChannels.playlists.getDetail]: required(idPayload("id")),
  [ipcChannels.playlists.create]: voidPayload(),
  [ipcChannels.playlists.rename]: required(namePayload),
  [ipcChannels.playlists.updateViewMode]: required(viewModePayload),
  [ipcChannels.playlists.delete]: required(idPayload("id")),
  [ipcChannels.playlists.addTracks]: required(
    objectShape({
      id: field(positiveId),
      trackIds: field(arrayOf(positiveId, { max: MAX_ID_LIST_LENGTH }))
    })
  ),
  [ipcChannels.playlists.reorderSidebarItems]: required(
    objectShape({
      items: field(
        arrayOf(
          objectShape({
            kind: field(enumValue(["playlist", "smart"])),
            id: field(positiveId)
          }),
          { max: MAX_REORDER_LIST_LENGTH }
        )
      )
    })
  ),
  [ipcChannels.lyrics.getByTrackId]: required(idPayload("trackId")),
  [ipcChannels.lyrics.openLrcEditor]: required(idPayload("trackId")),
  [ipcChannels.lyrics.saveLrcEditor]: required(
    objectShape({
      sessionId: field(stringValue({ min: 36, max: 36 })),
      expectedRevision: field(stringValue({ min: 64, max: 64 })),
      text: field(stringValue({ max: MAX_LRC_EDITOR_CHARACTERS })),
      target: field(enumValue(["tag", "file"]))
    })
  ),
  [ipcChannels.lyrics.closeLrcEditor]: required(
    objectShape({
      sessionId: field(stringValue({ min: 36, max: 36 }))
    })
  ),
  [ipcChannels.playback.getAudioUrl]: required(idPayload("trackId")),
  [ipcChannels.playback.nativeAvailability]: voidPayload(),
  [ipcChannels.playback.spectrumSubscribe]: required(
    objectShape({
      subscriptionId: field(finiteNumber({ integer: true, min: 0 })),
      revision: field(finiteNumber({ integer: true, min: 0 })),
      enabled: field(booleanValue),
      trackId: field(nullable(positiveId)),
      currentTime: field(finiteNumber({ min: 0, max: 604800 })),
      isPlaying: field(booleanValue)
    })
  ),
  [ipcChannels.playback.nativeCommand]: required(nativePlaybackCommand),
  [ipcChannels.playback.getRandomTrack]: optional(
    objectShape({ excludeTrackId: field(positiveId, true) })
  ),
  [ipcChannels.playback.getRandomAlbumTracks]: optional(
    objectShape({ excludeAlbumKey: field(albumKey, true) })
  ),
  [ipcChannels.playback.getAlbumTracks]: required(objectShape({ albumKey: field(albumKey) })),
  [ipcChannels.archive.getBadgeAchievements]: voidPayload(),
  [ipcChannels.playback.recordListeningProgress]: required(
    objectShape({
      epoch: field(finiteNumber({ integer: true, min: 0, max: Number.MAX_SAFE_INTEGER })),
      sessionId: field(stringValue({ min: 1, max: MAX_SESSION_ID_LENGTH })),
      sequence: field(positiveId),
      trackId: field(positiveId),
      samples: field(
        arrayOf(
          objectShape({
            startedAtIso: field(isoTimestamp),
            startSeconds: field(finiteNumber({ min: 0, max: 86400 })),
            endSeconds: field(finiteNumber({ min: 0, max: 86400 })),
            playedSeconds: field(finiteNumber({ min: 1e-3, max: 2.5 }))
          }),
          { min: 1, max: 32 }
        )
      )
    })
  ),
  [ipcChannels.playback.recordEffectivePlay]: required(
    objectShape({
      trackId: field(positiveId),
      sessionId: field(stringValue({ min: 1, max: MAX_SESSION_ID_LENGTH })),
      playedAtIso: field(isoTimestamp)
    })
  ),
  [ipcChannels.playback.acquireReadLease]: required(idPayload("trackId")),
  [ipcChannels.playback.releaseReadLease]: required(
    objectShape({ leaseId: field(stringValue({ min: 1, max: 128 })) })
  ),
  [ipcChannels.archive.getAnnualPlayCounts]: required(
    objectShape({ year: field(finiteNumber({ integer: true, min: 1900, max: 9999 })) })
  ),
  [ipcChannels.archive.getAnnualSummary]: required(
    objectShape({ year: field(finiteNumber({ integer: true, min: 1900, max: 9999 })) })
  ),
  [ipcChannels.archive.getDayTopTracks]: required(
    objectShape({ date: field(listeningArchiveDateValue) })
  ),
  [ipcChannels.archive.getDayTopAlbums]: required(
    objectShape({ date: field(listeningArchiveDateValue) })
  ),
  [ipcChannels.archive.resetPlayStats]: voidPayload(),
  [ipcChannels.metadata.refreshTrack]: required(idPayload("trackId")),
  [ipcChannels.metadata.refreshTracks]: required(
    objectShape({ trackIds: field(arrayOf(positiveId, { min: 1, max: MAX_ID_LIST_LENGTH })) })
  ),
  [ipcChannels.metadata.refreshLyricsMissing]: optional(
    objectShape({ limit: field(positiveLimit, true) })
  ),
  [ipcChannels.metadata.getRefreshStatus]: required(idPayload("jobId")),
  [ipcChannels.metadata.listRefreshFailures]: optional(
    objectShape({ limit: field(positiveLimit, true) })
  ),
  [ipcChannels.metadata.clearRefreshFailures]: voidPayload(),
  [ipcChannels.metadata.getTrackMetadata]: required(idPayload("trackId")),
  [ipcChannels.metadata.getTrackEditState]: required(idPayload("trackId")),
  [ipcChannels.metadata.updateTrackMetadata]: required(editableMetadata),
  [ipcChannels.metadata.getTrackEditSnapshot]: required(
    objectShape({ trackId: field(positiveId) })
  ),
  [ipcChannels.window.control]: required(
    objectShape({ action: field(enumValue(["minimize", "toggle-maximize", "close"])) })
  ),
  [ipcChannels.window.getMaximized]: voidPayload(),
  [ipcChannels.window.getVisibility]: voidPayload(),
  [ipcChannels.window.getCloseBehavior]: voidPayload(),
  [ipcChannels.window.setCloseBehavior]: required(
    objectShape({ behavior: field(enumValue(WINDOW_CLOSE_BEHAVIORS)) })
  )
};
function parseDomainIpcPayload(channel, args) {
  const policy = domainIpcPayloadPolicies[channel];
  try {
    if (args.length > 1) fail("payload", "must be the only invoke argument");
    const value = args[0];
    if (policy.kind === "void") {
      if (value !== void 0) fail("payload", "must be omitted");
      return void 0;
    }
    if (value === void 0) {
      if (policy.kind === "optional") return void 0;
      fail("payload", "is required");
    }
    policy.validator?.(value, "payload", { nodes: 0, stringUnits: 0 });
    return value;
  } catch (error) {
    const reason = error instanceof PayloadValidationFailure ? error.message : "could not be validated safely";
    throw new IpcPayloadValidationError(channel, reason);
  }
}
class IpcInvokeSourceError extends Error {
  constructor(channel) {
    super(`IPC invoke rejected for "${channel}": untrusted sender`);
    this.name = "IpcInvokeSourceError";
  }
}
function createValidatedIpcRegistrar(options) {
  let stopping = false;
  const pending = /* @__PURE__ */ new Set();
  return {
    async shutdown() {
      stopping = true;
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    handle(channel, listener) {
      options.register(channel, (event, ...args) => {
        if (!options.isTrustedSender(event)) {
          throw new IpcInvokeSourceError(channel);
        }
        if (stopping) throw new Error("Application is shutting down");
        const payload = parseDomainIpcPayload(channel, args);
        const result = listener(event, payload);
        if (result instanceof Promise) {
          pending.add(result);
          void result.then(
            () => pending.delete(result),
            () => pending.delete(result)
          );
        }
        return result;
      });
    }
  };
}
function createTrustedMainWindowSourcePolicy(options) {
  return (event) => {
    try {
      const sender = event.sender;
      if (!sender || sender.isDestroyed()) return false;
      if (!event.senderFrame || event.senderFrame !== sender.mainFrame) return false;
      const window = options.fromWebContents(event.sender);
      if (!window || window.webContents !== event.sender || window.webContents.isDestroyed()) {
        return false;
      }
      if (!options.isAllowedWindow(window)) return false;
      return options.isTrustedRendererUrl(sender.getURL());
    } catch {
      return false;
    }
  };
}
function registerIpcHandlers(db, artworkCacheDir, windowBehavior2) {
  const sendToRenderer = createRendererEventSender(() => BrowserWindow.getAllWindows());
  const audioPaths = resolveAudioRuntimePaths({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath
  });
  const libraryService = new LibraryService(new LibraryRepository(db), new TrackRepository(db));
  const startupAlbumWorker = new StartupAlbumWorkerHost(db.name);
  const scanEvents = createLibraryScanEvents(sendToRenderer);
  const libraryScanService = new LibraryScanService(
    db,
    artworkCacheDir,
    selectLibraryDirectory,
    scanEvents
  );
  const trackRepository = new TrackRepository(db);
  const libraryRootRepository = new LibraryRootRepository(db);
  const playbackFileCoordinator = new PlaybackFileCoordinator({
    getTrackFilePath: (trackId) => trackRepository.getFilePathById(trackId),
    getTrackIdsByFilePath: (filePath) => trackRepository.getTrackIdsByPlaybackPath(filePath),
    sendToRenderer
  });
  const metadataRefreshService = new MetadataRefreshService(
    new MetadataRefreshRepository(db),
    artworkCacheDir,
    createMetadataRefreshEvents(sendToRenderer),
    audioPaths.ffmpegPath,
    playbackFileCoordinator,
    () => trackRepository.getChangeToken()
  );
  const incrementalImportService = new LibraryIncrementalImportService(
    trackRepository,
    artworkCacheDir,
    scanEvents.changed
  );
  const notifyLibraryChanged = (data) => sendToRenderer(ipcChannels.library.changed, data);
  const playbackResources = new PlaybackResourceService({
    tracks: trackRepository,
    getRootPaths: () => libraryRootRepository.list().map((root) => root.path),
    files: playbackFileCoordinator,
    libraryChanged: (event) => sendToRenderer(ipcChannels.library.changed, event)
  });
  const getAudioUrl = (trackId) => playbackResources.getAudioUrl(trackId);
  const metadataWatchService = new MetadataWatchService(
    libraryRootRepository,
    trackRepository,
    metadataRefreshService,
    incrementalImportService,
    sendToRenderer
  );
  const lrcEditorMetadata = new LrcEditorMetadataService({
    tracks: trackRepository,
    metadata: metadataRefreshService,
    files: playbackFileCoordinator,
    libraryChanged: (event) => sendToRenderer(ipcChannels.library.changed, event)
  });
  const lrcEditorService = new LrcEditorService({
    getFilePath: (id) => trackRepository.getFilePathById(id),
    getRoots: () => libraryRootRepository.list().map((root) => root.path),
    readSource: (filePath) => lrcEditorMetadata.readSource(filePath),
    writeTag: (trackId, text, beforeCommit) => lrcEditorMetadata.writeTag(trackId, text, beforeCommit),
    reconcile: (trackId, filePath, text) => lrcEditorMetadata.reconcile(trackId, filePath, text)
  });
  metadataRefreshService.setTagWriteSuccessHandler((filePath) => {
    metadataWatchService.suppressRefreshForPath(filePath);
  });
  const artworkMaintenanceService = new ArtworkCacheMaintenanceService(
    new ArtworkCacheMigrationService(db, artworkCacheDir),
    new ArtworkCacheGarbageCollector(db, artworkCacheDir),
    {
      isScanActive: () => libraryScanService.isScanActive(),
      isRefreshActive: () => metadataRefreshService.hasActiveArtworkWrites(),
      isImportActive: () => incrementalImportService.isImportActive()
    }
  );
  artworkMaintenanceService.scheduleStartupMaintenance();
  libraryScanService.setScanLifecycleHooks({
    onStart: () => Promise.all([
      metadataWatchService.pauseFlush(),
      metadataRefreshService.pauseLegacyLyricsRecovery()
    ]).then(() => void 0),
    onEnd: () => {
      metadataWatchService.resumeFlush();
      metadataRefreshService.resumeLegacyLyricsRecovery();
      queueMicrotask(() => {
        void artworkMaintenanceService.runAfterScanGarbageCollection().catch((error) => {
          logger.warn({ error }, "Failed to run after-scan artwork garbage collection");
        });
      });
    }
  });
  libraryScanService.setRootChangeHooks({
    onStart: () => Promise.all([
      metadataWatchService.pauseFlush(),
      metadataRefreshService.pauseLegacyLyricsRecovery()
    ]).then(() => void 0),
    onEnd: () => {
      metadataWatchService.syncRoots();
      metadataWatchService.resumeFlush();
      metadataRefreshService.resumeLegacyLyricsRecovery();
    }
  });
  const playStatsService = new PlayStatsService(new PlayStatsRepository(db));
  const playlistRepository = new PlaylistRepository(db);
  const smartPlaylistRepository = new SmartPlaylistRepository(db);
  const publishPlaylistChange = (event) => sendToRenderer(ipcChannels.playlists.changed, event);
  const smartPlaylistService = new SmartPlaylistService(
    smartPlaylistRepository,
    trackRepository,
    publishPlaylistChange
  );
  const playlistService = new PlaylistService(
    playlistRepository,
    smartPlaylistRepository,
    publishPlaylistChange
  );
  const getSmartTrackCounts = () => new Map(
    smartPlaylistService.listTrackCounts().map((item) => [item.playlistId, item.trackCount])
  );
  const rendererEntry = process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL : join(__dirname, "../renderer/index.html");
  const electronIpcRegistrar = createValidatedIpcRegistrar({
    register: (channel, listener) => ipcMain.handle(channel, listener),
    isTrustedSender: createTrustedMainWindowSourcePolicy({
      fromWebContents: (sender) => BrowserWindow.fromWebContents(sender),
      isAllowedWindow: (window) => isRegisteredMainWindow(window),
      isTrustedRendererUrl: (url) => isTrustedRendererUrl(url, rendererEntry)
    })
  });
  metadataWatchService.start();
  metadataRefreshService.startLegacyLyricsRecovery();
  const resolvePlaybackTrack = (trackId) => playbackResources.resolveTrack(trackId);
  const spectrum = new PlaybackSpectrumService({
    ffmpegPath: audioPaths.ffmpegPath,
    resolveTrack: resolvePlaybackTrack,
    coordinator: playbackFileCoordinator,
    emit: (frame) => sendToRenderer(ipcChannels.playback.spectrumFrame, frame),
    warn: (error) => logger.warn({ error }, "Playback spectrum analysis failed")
  });
  const spectrumOwners = /* @__PURE__ */ new WeakSet();
  electronIpcRegistrar.handle(ipcChannels.playback.spectrumSubscribe, (event, request) => {
    if (!spectrumOwners.has(event.sender)) {
      spectrumOwners.add(event.sender);
      event.sender.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) void spectrum.dispose();
      });
      event.sender.once("destroyed", () => {
        void spectrum.dispose();
      });
      event.sender.on("render-process-gone", () => {
        void spectrum.dispose();
      });
    }
    return spectrum.subscribe(request, nativePlayback.getSpectrumSource());
  });
  const nativePlayback = new NativePlaybackService({
    ...audioPaths,
    isLiveAlbum: (trackId) => trackRepository.isLiveAlbum(trackId),
    resolveTrack: resolvePlaybackTrack,
    coordinator: playbackFileCoordinator,
    suspendFileReaders: (filePath) => spectrum.suspendFileReaders(filePath),
    emit: (event) => {
      sendToRenderer(ipcChannels.playback.nativeEvent, event);
      spectrum.syncNative(nativePlayback.getSpectrumSource());
    },
    warn: (error) => logger.warn({ error }, "Native playback operation failed"),
    onBoundaryStatus: (event) => logger.debug(event, "Digital silence boundary analysis")
  });
  playbackFileCoordinator.setMetadataWriteActivity(
    (filePath) => metadataRefreshService.isWritingFile(filePath)
  );
  playbackFileCoordinator.setBufferedWriteCapability(
    (filePath) => nativePlayback.canWriteMetadata(filePath)
  );
  playbackFileCoordinator.setFileReplacementCapability(
    (filePath) => nativePlayback.canReplaceMetadata(filePath)
  );
  metadataRefreshService.setPlaybackTagWriteHandler(
    (filePath, metadata, commitAndReconcile) => nativePlayback.writeMetadata(filePath, metadata, commitAndReconcile)
  );
  const nativeOwners = /* @__PURE__ */ new WeakSet();
  electronIpcRegistrar.handle(ipcChannels.playback.nativeAvailability, () => {
    const available = existsSync(audioPaths.mpvPath);
    return { available, ...!available ? { reason: "mpv runtime is not installed" } : {} };
  });
  electronIpcRegistrar.handle(ipcChannels.playback.nativeCommand, (event, request) => {
    if (!nativeOwners.has(event.sender)) {
      nativeOwners.add(event.sender);
      event.sender.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) nativePlayback.dispose();
      });
      event.sender.once("destroyed", () => nativePlayback.dispose());
      event.sender.on("render-process-gone", () => nativePlayback.dispose());
    }
    return nativePlayback.command(request);
  });
  const rendererLeaseOwners = new RendererReadLeaseOwner(playbackFileCoordinator);
  electronIpcRegistrar.handle(ipcChannels.playback.acquireReadLease, async (event, payload) => {
    const filePath = trackRepository.getFilePathById(payload.trackId);
    if (!filePath) throw new Error(`Audio file not found for track ${payload.trackId}`);
    return rendererLeaseOwners.acquire(event.sender, filePath);
  });
  electronIpcRegistrar.handle(ipcChannels.playback.releaseReadLease, (event, payload) => {
    rendererLeaseOwners.release(event.sender, payload.leaseId);
    return { ok: true };
  });
  electronIpcRegistrar.handle(ipcChannels.app.claimCdStartupEntry, claimCdStartupEntry);
  electronIpcRegistrar.handle(
    ipcChannels.app.claimStartupAlbum,
    (_event, request) => claimStartupAlbum(
      () => startupAlbumWorker.getStartupAlbumTracks(
        request?.recentAlbums ?? (request?.excludeAlbumKey ? [request.excludeAlbumKey] : [])
      )
    )
  );
  electronIpcRegistrar.handle(ipcChannels.app.drawStartupAlbum, async (_event, request) => ({
    album: await startupAlbumWorker.getStartupAlbumTracks(request.recentAlbums)
  }));
  electronIpcRegistrar.handle(ipcChannels.app.setLocale, (_event, payload) => {
    setNativeUiLocale(payload.locale);
  });
  electronIpcRegistrar.handle(ipcChannels.app.getInfo, () => ({
    name: "Auralis",
    version: app.getVersion(),
    databasePath: getDatabasePath()
  }));
  electronIpcRegistrar.handle(ipcChannels.app.exportDiagnostics, async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    if (!parentWindow) return { status: "failed" };
    return exportDiagnostics({
      appVersion: app.getVersion(),
      logsDirectory: join(app.getPath("userData"), "logs"),
      showSaveDialog: (options) => dialog.showSaveDialog(parentWindow, options)
    });
  });
  electronIpcRegistrar.handle(ipcChannels.database.exportBackup, async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    if (!parentWindow) return { status: "failed", error: "Window unavailable" };
    return exportDatabaseBackup({
      db,
      databasePath: getDatabasePath(),
      showSaveDialog: (options) => dialog.showSaveDialog(parentWindow, {
        ...options,
        title: getNativeUiMessages().exportBackup,
        filters: options.filters?.map((filter) => ({
          ...filter,
          name: getNativeUiMessages().backupFilter
        }))
      })
    });
  });
  electronIpcRegistrar.handle(ipcChannels.database.restoreBackup, async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    if (!parentWindow) return { status: "failed", error: "Window unavailable" };
    return stageDatabaseRestore({
      currentDbPath: getDatabasePath(),
      showOpenDialog: (options) => dialog.showOpenDialog(parentWindow, {
        ...options,
        title: getNativeUiMessages().restoreBackup,
        filters: options.filters?.map((filter) => ({
          ...filter,
          name: getNativeUiMessages().backupFilter
        }))
      })
    });
  });
  electronIpcRegistrar.handle(ipcChannels.window.getMaximized, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !isRegisteredMainWindow(window)) {
      throw new Error("Main window controls are unavailable.");
    }
    return { isMaximized: window.isMaximized() };
  });
  electronIpcRegistrar.handle(ipcChannels.window.getVisibility, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !isRegisteredMainWindow(window)) {
      throw new Error("Main window visibility is unavailable.");
    }
    return getWindowVisibility(window);
  });
  electronIpcRegistrar.handle(ipcChannels.window.getCloseBehavior, () => windowBehavior2.getState());
  electronIpcRegistrar.handle(
    ipcChannels.window.setCloseBehavior,
    (_event, payload) => windowBehavior2.setBehavior(payload.behavior)
  );
  electronIpcRegistrar.handle(ipcChannels.window.control, (event, payload) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !isRegisteredMainWindow(window)) {
      throw new Error("Main window controls are unavailable.");
    }
    switch (payload.action) {
      case "minimize":
        window.minimize();
        break;
      case "toggle-maximize":
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
        break;
      case "close":
        setImmediate(() => {
          if (!window.isDestroyed()) window.close();
        });
        break;
    }
    return { isMaximized: window.isMaximized() };
  });
  registerLibraryIpcHandlers(electronIpcRegistrar, {
    libraryService,
    libraryScanService,
    metadataWatchService,
    revealInExplorer: {
      getFilePathById: (trackId) => trackRepository.getFilePathById(trackId),
      getRootPaths: () => libraryRootRepository.list().map((root) => root.path),
      stat,
      showItemInFolder: (filePath) => {
        shell.showItemInFolder(filePath);
      },
      openPath: (directoryPath) => shell.openPath(directoryPath)
    }
  });
  registerLyricsEditorIpcHandlers(electronIpcRegistrar, lrcEditorService);
  registerPlaylistIpcHandlers(electronIpcRegistrar, {
    playlistService,
    smartPlaylistService,
    getSmartTrackCounts
  });
  registerBadgeAchievementIpcHandlers(
    electronIpcRegistrar,
    new BadgeAchievementRepository(db),
    () => notifyLibraryChanged({ reason: "play-stats-updated", trackIds: [], filePaths: [] })
  );
  registerPlaybackArchiveIpcHandlers(electronIpcRegistrar, {
    libraryService,
    playStatsService,
    getAudioUrl,
    notifyLibraryChanged
  });
  registerMetadataIpcHandlers(electronIpcRegistrar, {
    metadataRefreshService,
    playbackFileCoordinator
  });
  return {
    async shutdown() {
      rendererLeaseOwners.dispose();
      const early = await Promise.allSettled([
        electronIpcRegistrar.shutdown(),
        startupAlbumWorker.shutdown(),
        artworkMaintenanceService.shutdown()
      ]);
      const library = await Promise.allSettled([
        libraryScanService.shutdown(),
        metadataRefreshService.shutdown()
      ]);
      const playback = await Promise.allSettled([
        metadataWatchService.stop(),
        spectrum.dispose(),
        Promise.resolve().then(() => nativePlayback.dispose())
      ]);
      lrcEditorService.dispose();
      const failures = [...early, ...library, ...playback].filter(
        (result) => result.status === "rejected"
      );
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((result) => result.reason),
          "Service shutdown failed"
        );
      }
    }
  };
}
const VALID_KEY = /^(?:[a-f0-9]{64}\.(jpg|png|webp)|v2-[a-f0-9]{64}\.webp)$/;
const EXT_TO_MIME = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
function isPathUnderCacheDir(filePath, cacheDir) {
  const resolvedFile = resolve(filePath);
  const resolvedCache = resolve(cacheDir);
  const fileForCompare = process.platform === "win32" ? resolvedFile.toLowerCase() : resolvedFile;
  const cacheForCompare = process.platform === "win32" ? resolvedCache.toLowerCase() : resolvedCache;
  const rel = relative(cacheForCompare, fileForCompare);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
function registerArtworkProtocol(cacheDir) {
  const resolvedCacheDir = resolve(cacheDir);
  protocol.handle("auralis-artwork", async (request) => {
    const url = new URL(request.url);
    const pathPart = url.pathname === "/" ? "" : url.pathname;
    const key = decodeURIComponent(url.hostname + pathPart);
    if (!VALID_KEY.test(key)) {
      logger.warn({ key }, "Invalid artwork protocol key");
      return new Response(null, { status: 400 });
    }
    const filePath = resolve(join(resolvedCacheDir, key));
    if (!isPathUnderCacheDir(filePath, resolvedCacheDir)) {
      logger.warn({ key }, "Artwork protocol path traversal attempt");
      return new Response(null, { status: 403 });
    }
    try {
      const data = await readFile(filePath);
      const ext = key.split(".").pop();
      const contentType = EXT_TO_MIME[ext] ?? "application/octet-stream";
      return new Response(data, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000",
          // Enables canvas palette extraction if the renderer sets crossOrigin.
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
const registrations = /* @__PURE__ */ new WeakMap();
function safeLog(logger2, level, fields, message) {
  try {
    logger2[level](fields, message);
  } catch {
  }
}
function boundedLabel(value) {
  return typeof value === "string" && value.length > 0 ? sanitizeDiagnosticText(value, 160) : void 0;
}
function rendererDetails(details) {
  return {
    reason: boundedLabel(details.reason) ?? "unknown",
    exitCode: Number.isSafeInteger(details.exitCode) ? details.exitCode : void 0
  };
}
function childDetails(details) {
  return {
    type: boundedLabel(details.type) ?? "unknown",
    reason: boundedLabel(details.reason) ?? "unknown",
    exitCode: Number.isSafeInteger(details.exitCode) ? details.exitCode : void 0,
    name: boundedLabel(details.name),
    serviceName: boundedLabel(details.serviceName)
  };
}
function webContentsIdentity(webContents) {
  let type;
  try {
    type = boundedLabel(webContents.getType());
  } catch {
  }
  return {
    webContentsId: Number.isSafeInteger(webContents.id) ? webContents.id : void 0,
    webContentsType: type
  };
}
function installMainProcessDiagnostics(options) {
  const existingRegistration = registrations.get(options.process);
  if (existingRegistration) return existingRegistration;
  let disposed = false;
  let fatalExitStarted = false;
  const exitAfterFatalError = () => {
    if (fatalExitStarted) return;
    fatalExitStarted = true;
    options.process.exitCode = 1;
    try {
      options.app.exit(1);
    } catch {
    }
  };
  const handleUncaughtException = (error, origin) => {
    safeLog(
      options.logger,
      "error",
      {
        diagnosticEvent: "uncaught-exception",
        origin,
        error: normalizeDiagnosticError(error)
      },
      "Fatal uncaught exception in Electron main process"
    );
    exitAfterFatalError();
  };
  const handleUnhandledRejection = (reason) => {
    safeLog(
      options.logger,
      "error",
      {
        diagnosticEvent: "unhandled-rejection",
        error: normalizeDiagnosticError(reason)
      },
      "Fatal unhandled rejection in Electron main process"
    );
    exitAfterFatalError();
  };
  const reportStartupFailure = (error) => {
    safeLog(
      options.logger,
      "error",
      {
        diagnosticEvent: "startup-failure",
        error: normalizeDiagnosticError(error)
      },
      "Auralis failed during main-process startup"
    );
    exitAfterFatalError();
  };
  const handleRenderProcessGone = (_event, webContents, details) => {
    const fields = {
      diagnosticEvent: "render-process-gone",
      ...webContentsIdentity(webContents),
      ...rendererDetails(details)
    };
    const level = details.reason === "clean-exit" || details.reason === "killed" ? "warn" : "error";
    safeLog(options.logger, level, fields, "Electron renderer process exited");
  };
  const handleChildProcessGone = (_event, details) => {
    const fields = {
      diagnosticEvent: "child-process-gone",
      ...childDetails(details)
    };
    const level = details.reason === "clean-exit" || details.reason === "killed" ? "warn" : "error";
    safeLog(options.logger, level, fields, "Electron child process exited");
  };
  options.process.on("uncaughtException", handleUncaughtException);
  options.process.on("unhandledRejection", handleUnhandledRejection);
  options.app.on("render-process-gone", handleRenderProcessGone);
  options.app.on("child-process-gone", handleChildProcessGone);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    options.process.removeListener("uncaughtException", handleUncaughtException);
    options.process.removeListener("unhandledRejection", handleUnhandledRejection);
    options.app.removeListener("render-process-gone", handleRenderProcessGone);
    options.app.removeListener("child-process-gone", handleChildProcessGone);
    registrations.delete(options.process);
  };
  const registration = { dispose, reportStartupFailure };
  registrations.set(options.process, registration);
  return registration;
}
const SMOKE_FLAG = "AURALIS_SMOKE_TEST";
const SMOKE_USER_DATA = "AURALIS_SMOKE_USER_DATA";
function configureElectronSmokeEnvironment(app2) {
  if (process.env[SMOKE_FLAG] !== "1") {
    return false;
  }
  const userDataPath = process.env[SMOKE_USER_DATA];
  if (!userDataPath || !isAbsolute(userDataPath)) {
    throw new Error(`${SMOKE_USER_DATA} must be an absolute path in smoke mode`);
  }
  const cachePath = join(userDataPath, "cache");
  const dataPath = join(userDataPath, "data");
  mkdirSync(userDataPath, { recursive: true });
  mkdirSync(cachePath, { recursive: true });
  mkdirSync(dataPath, { recursive: true });
  closeSync(openSync(join(dataPath, "auralis.sqlite"), "wx"));
  app2.setPath("userData", userDataPath);
  app2.setPath("cache", cachePath);
  app2.commandLine.appendSwitch("disk-cache-dir", cachePath);
  app2.disableHardwareAcceleration();
  app2.commandLine.appendSwitch("disable-gpu");
  app2.commandLine.appendSwitch("disable-gpu-compositing");
  return true;
}
async function runSidebarSmokeChecks(window) {
  if (process.env.AURALIS_SMOKE_TEST !== "1" || !process.env.AURALIS_SMOKE_USER_DATA) {
    throw new Error("Sidebar smoke requires the isolated smoke environment");
  }
  await window.webContents.executeJavaScript(
    `(async () => {
      const until = async (description, predicate) => {
        const deadline = Date.now() + 5000
        while (Date.now() < deadline) {
          if (predicate()) return
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        throw new Error('Sidebar smoke timed out: ' + description)
      }
      const visible = (element) => Boolean(element && element.getClientRects().length &&
        getComputedStyle(element).visibility !== 'hidden')
      const press = (key) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
        key, bubbles: true, cancelable: true,
      }))
      const createButton = document.querySelector('.app-sidebar .smart-playlist-add-button')
      if (!createButton) throw new Error('Sidebar create trigger is missing')
      createButton.focus()
      createButton.click()
      await until('create menu focus', () => document.querySelector('#sidebar-create-menu')?.contains(document.activeElement))
      const smartTrigger = document.querySelector('#sidebar-create-menu [aria-controls="sidebar-smart-create-submenu"]')
      smartTrigger.focus()
      press('ArrowRight')
      await until('smart submenu focus', () => document.querySelector('#sidebar-smart-create-submenu')?.contains(document.activeElement))
      press('Escape')
      await until('submenu closes before parent', () => !document.querySelector('#sidebar-smart-create-submenu') &&
        document.querySelector('#sidebar-create-menu') && document.activeElement === smartTrigger)
      press('Escape')
      await until('create trigger focus returns', () => !document.querySelector('#sidebar-create-menu') && document.activeElement === createButton)

      const recent = document.querySelector('.app-sidebar [aria-keyshortcuts="ContextMenu Shift+F10"]')
      recent.focus()
      press('ContextMenu')
      await until('recent menu focus and position', () => {
        const menu = document.querySelector('#sidebar-recent-added-context-menu')
        return visible(menu) && menu.contains(document.activeElement)
      })
      document.querySelector('#sidebar-recent-added-context-menu button').click()
      await until('recent range slider focus', () => document.activeElement?.matches('#sidebar-recent-added-range-selector input[type="range"]'))
      const slider = document.activeElement
      slider.value = '1'
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
      await until('recent range navigation target updates', () => recent.getAttribute('href').includes('range=30'))
      press('Escape')
      await until('recent trigger focus returns', () => !document.querySelector('#sidebar-recent-added-context-menu') && document.activeElement === recent)

      const playlist = await window.auralis.playlists.create()
      const rowSelector = '[data-sidebar-playlist-key="playlist:' + playlist.id + '"]'
      const row = () => document.querySelector(rowSelector)
      const contextMenu = () => document.querySelector('.sidebar-overlay .collection-context-menu')
      await until('new playlist row loads', () => row())
      row().focus()
      press('ContextMenu')
      await until('playlist menu focus and position', () => visible(contextMenu()) && contextMenu().contains(document.activeElement))
      contextMenu().querySelector('.i-ph-pencil-simple').closest('button').click()
      await until('rename dialog focus', () => document.querySelector('.smart-playlist-dialog input') === document.activeElement &&
        document.querySelector('[data-app-shell-root]').inert)
      const input = document.activeElement
      input.value = 'Sidebar smoke playlist'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await until('rename updates the row and returns focus', () => !document.querySelector('.smart-playlist-dialog') &&
        row()?.textContent.includes('Sidebar smoke playlist') && document.activeElement === row() &&
        !document.querySelector('[data-app-shell-root]').inert)
      press('ContextMenu')
      await until('playlist delete menu focus', () => visible(contextMenu()) && contextMenu().contains(document.activeElement))
      contextMenu().querySelector('[data-delete-playlist]').click()
      await until('delete confirmation', () => contextMenu()?.querySelector('[data-delete-playlist]')?.textContent.match(/确认|Confirm/))
      if (!row()) throw new Error('First delete press removed the playlist without confirmation')
      contextMenu().querySelector('[data-delete-playlist]').click()
      await until('delete removes row and restores fallback focus', () => !row() && !contextMenu() && document.activeElement === createButton)
    })()`,
    true
  );
}
const CHECK_TIMEOUT_MS = 1e4;
const SUITE_TIMEOUT_MS = 35e3;
const POLL_INTERVAL_MS = 25;
const SMOKE_RESULT_PREFIX = "AURALIS_SMOKE_RESULT ";
function describeError(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}
function assertPlayerBarBottomGap(probe) {
  if (!Number.isFinite(probe.bottomGap) || probe.bottomGap <= 0) {
    throw new Error("PlayerBar bottom-gap token must be a positive pixel value");
  }
  if (probe.bottomDistance === null || !Number.isFinite(probe.bottomDistance) || Math.abs(probe.bottomDistance - probe.bottomGap) > 2) {
    throw new Error(
      `PlayerBar bottom distance expected ~${probe.bottomGap}px, received: ${String(probe.bottomDistance)}`
    );
  }
}
function delay(milliseconds) {
  return new Promise((resolve2) => setTimeout(resolve2, milliseconds));
}
async function waitFor(description, predicate, timeoutMs = CHECK_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
async function withTimeout(description, work, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      work,
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${description} timed out`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
async function waitForStartupPresentation(mainWindow) {
  return await mainWindow.webContents.executeJavaScript(
    `(async () => {
      const deadline = Date.now() + ${CHECK_TIMEOUT_MS}
      while (Date.now() < deadline) {
        const shellMounted = Boolean(document.querySelector('[data-app-shell-root]'))
        if (shellMounted) return { shellMounted }
        await new Promise((resolve) => setTimeout(resolve, ${POLL_INTERVAL_MS}))
      }

      return {
        shellMounted: Boolean(document.querySelector('[data-app-shell-root]')),
      }
    })()`,
    true
  );
}
async function runChecks(mainWindow) {
  const checks = [];
  const loadFailures = [];
  const finishedLoads = /* @__PURE__ */ new WeakSet();
  const trackedContents = /* @__PURE__ */ new WeakSet();
  const trackWebContents = (webContents) => {
    if (trackedContents.has(webContents)) return;
    trackedContents.add(webContents);
    webContents.on("did-finish-load", () => finishedLoads.add(webContents));
    webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        if (isMainFrame) {
          loadFailures.push(`${errorCode} ${errorDescription} ${validatedUrl}`);
        }
      }
    );
    webContents.on("render-process-gone", (_event, details) => {
      loadFailures.push(`renderer gone: ${details.reason} (${details.exitCode})`);
    });
  };
  const record = async (name, assertion) => {
    try {
      await assertion();
      checks.push({ name, ok: true });
    } catch (error) {
      checks.push({ name, ok: false, detail: describeError(error) });
      throw error;
    }
  };
  trackWebContents(mainWindow.webContents);
  const handleWebContentsCreated = (_event, webContents) => {
    trackWebContents(webContents);
  };
  app.on("web-contents-created", handleWebContentsCreated);
  try {
    await record("runs under Electron 38", () => {
      const majorVersion = Number.parseInt(process.versions.electron?.split(".")[0] ?? "", 10);
      if (majorVersion !== 38) {
        throw new Error(`Expected Electron 38, received ${process.versions.electron ?? "unknown"}`);
      }
    });
    await record("main window finishes loading without failure", async () => {
      await waitFor("main window did-finish-load", () => finishedLoads.has(mainWindow.webContents));
      if (loadFailures.length > 0) throw new Error(loadFailures.join("\n"));
    });
    await record("unconfigured library shows the direct folder entry", async () => {
      await waitFor(
        "initial library folder action",
        async () => await mainWindow.webContents.executeJavaScript(
          `Boolean(document.querySelector('.library-status-state--initial button'))`
        )
      );
      const probe = await mainWindow.webContents.executeJavaScript(
        `(() => {
          const state = document.querySelector('.library-status-state--initial')
          const button = state?.querySelector('button')
          return {
            title: state?.querySelector('h3')?.textContent?.trim(),
            label: button?.textContent?.trim(),
            disabled: button?.disabled,
            height: button?.getBoundingClientRect().height,
            settingsOpen: Boolean(document.querySelector('[data-settings-dialog] .settings-surface')),
          }
        })()`
      );
      if (probe.title !== "暂无曲目" || probe.label !== "选择文件夹" || probe.disabled || !probe.height || probe.height < 40 || probe.settingsOpen) {
        throw new Error(`Initial library folder entry is incorrect: ${JSON.stringify(probe)}`);
      }
    });
    await record("native playback preload and IPC reject invalid capabilities", async () => {
      const result = await mainWindow.webContents.executeJavaScript(`(async () => {
        const playback = window.auralis.playback
        const availability = await playback.nativeAvailability()
        const unsubscribe = playback.onNativeEvent(() => {})
        unsubscribe()
        let rejected = false
        try { await playback.nativeCommand({ action: 'run', session: 1, command: ['quit'] }) }
        catch { rejected = true }
        return typeof availability.available === 'boolean' && rejected
      })()`);
      if (!result) throw new Error("Native playback capability check failed");
    });
    await record("legacy visual-style preference does not affect startup", async () => {
      await mainWindow.webContents.executeJavaScript(
        `localStorage.setItem('auralis-visual-style', 'manuscript')`,
        true
      );
      finishedLoads.delete(mainWindow.webContents);
      mainWindow.webContents.reload();
      await waitFor(
        "main window reload with legacy preference",
        () => finishedLoads.has(mainWindow.webContents)
      );
      const presentation = await waitForStartupPresentation(mainWindow);
      if (!presentation.shellMounted || loadFailures.length > 0) {
        throw new Error(
          `Legacy visual-style preference prevented the modern shell from mounting: ${JSON.stringify(presentation)}`
        );
      }
    });
    await record("custom window controls toggle maximized state", async () => {
      const controlsMounted = await mainWindow.webContents.executeJavaScript(`(() => {
        return ['close', 'minimize', 'maximize'].every((action) =>
          document.querySelector('.window-traffic-light--' + action)
        )
      })()`);
      if (!controlsMounted) throw new Error("Main window traffic lights are missing");
      const originalMaximized = mainWindow.isMaximized();
      const originalHeight = await mainWindow.webContents.executeJavaScript(
        `window.innerHeight`
      );
      await mainWindow.webContents.executeJavaScript(
        `document.querySelector('.window-traffic-light--maximize').click()`
      );
      await waitFor("custom maximize button", () => mainWindow.isMaximized() !== originalMaximized);
      await mainWindow.webContents.executeJavaScript(
        `document.querySelector('.window-traffic-light--maximize').click()`
      );
      await waitFor("custom restore button", () => mainWindow.isMaximized() === originalMaximized);
      await waitFor("restored renderer viewport", async () => {
        const height = await mainWindow.webContents.executeJavaScript(
          `window.innerHeight`
        );
        return height === originalHeight;
      });
    });
    await record("playerbar layout contract holds at idle startup", async () => {
      const probe = await mainWindow.webContents.executeJavaScript(
        `(async () => {
          const el = document.querySelector('.player-bar')
          const style = el ? getComputedStyle(el) : null
          const rect = el?.getBoundingClientRect()
          const island = document.querySelector('.player-bar-island')
          const islandStyle = island ? getComputedStyle(island) : null
          const primaryBtn = document.querySelector('.transport-control-primary')
          const queueButtons = document.querySelectorAll('[data-testid="player-queue-button"]')
          const queueBtn = queueButtons.length === 1 ? queueButtons[0] : null

          const inViewport = Boolean(rect) &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > 0 &&
            rect.left < window.innerWidth &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight

          let clickVerification = false
          if (queueBtn instanceof HTMLElement) {
            const initialExpanded = queueBtn.getAttribute('aria-expanded')
            queueBtn.click()
            await new Promise((resolve) => setTimeout(resolve, 50))
            const expandedAfterFirstClick = queueBtn.getAttribute('aria-expanded')
            queueBtn.click()
            await new Promise((resolve) => setTimeout(resolve, 50))
            const closedAfterSecondClick = queueBtn.getAttribute('aria-expanded')
            clickVerification =
              initialExpanded === 'false' &&
              expandedAfterFirstClick === 'true' &&
              closedAfterSecondClick === 'false'
          }

          return {
            mounted: Boolean(el),
            className: el?.className ?? '',
            position: style?.position ?? null,
            zIndex: style?.zIndex ?? null,
            display: style?.display ?? null,
            visibility: style?.visibility ?? null,
            opacity: style?.opacity ?? null,
            pointerEvents: style?.pointerEvents ?? null,
            islandMounted: Boolean(island),
            islandPointerEvents: islandStyle?.pointerEvents ?? null,
            primaryButtonMounted: Boolean(primaryBtn),
            primaryButtonDisabled: Boolean(primaryBtn && 'disabled' in primaryBtn && primaryBtn.disabled),
            queueButtonMatchCount: queueButtons.length,
            clickVerification,
            rect: rect ? {
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              width: rect.width,
              height: rect.height,
            } : null,
            inViewport,
            bottomDistance: rect ? window.innerHeight - rect.bottom : null,
            bottomGap: Number.parseFloat(style?.getPropertyValue('--auralis-player-bottom-gap') ?? ''),
            horizontalIntersection: Boolean(rect) && rect.right > 0 && rect.left < window.innerWidth,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          }
        })()`,
        true
      );
      if (!probe.mounted) throw new Error("PlayerBar is not mounted");
      if (probe.className.includes("relative")) {
        throw new Error(`PlayerBar unexpectedly retained relative class: ${probe.className}`);
      }
      if (probe.position !== "fixed") {
        throw new Error(`Expected PlayerBar position fixed, received: ${String(probe.position)}`);
      }
      if (probe.zIndex !== "50") {
        throw new Error(`Expected PlayerBar z-index 50, received: ${String(probe.zIndex)}`);
      }
      if (probe.pointerEvents !== "none") {
        throw new Error(
          `Expected PlayerBar host pointer-events none, received: ${String(probe.pointerEvents)}`
        );
      }
      if (!probe.islandMounted) throw new Error("PlayerBar island is not mounted");
      if (probe.islandPointerEvents !== "auto") {
        throw new Error(
          `Expected PlayerBar island pointer-events auto, received: ${String(probe.islandPointerEvents)}`
        );
      }
      if (!probe.inViewport) {
        throw new Error(`PlayerBar is outside viewport: ${JSON.stringify(probe.rect)}`);
      }
      assertPlayerBarBottomGap(probe);
      if (!probe.primaryButtonMounted || !probe.primaryButtonDisabled) {
        throw new Error("Expected idle transport primary button to be present and disabled");
      }
      if (probe.queueButtonMatchCount !== 1) {
        throw new Error(
          `Expected one PlayerBar queue button test target, received: ${probe.queueButtonMatchCount}`
        );
      }
      if (!probe.clickVerification) {
        throw new Error(
          "PlayerBar island click interaction failed to trigger expected state change"
        );
      }
    });
    await record("sandboxed main preload exposes working app.getInfo", async () => {
      const probe = await mainWindow.webContents.executeJavaScript(
        `(async () => {
          const api = window.auralis
          const info = await api?.app?.getInfo?.()
          return {
            apiExists: typeof api === 'object',
            name: info?.name,
            version: info?.version,
            databasePath: info?.databasePath
          }
        })()`,
        true
      );
      if (!probe.apiExists) throw new Error("window.auralis is missing");
      if (probe.name !== "Auralis") throw new Error(`Unexpected app name: ${String(probe.name)}`);
      if (typeof probe.version !== "string" || probe.version.length === 0) {
        throw new Error("app.getInfo returned no version");
      }
      if (typeof probe.databasePath !== "string" || probe.databasePath.length === 0) {
        throw new Error("app.getInfo returned no database path");
      }
      const configuredUserData = process.env.AURALIS_SMOKE_USER_DATA;
      if (!configuredUserData || !probe.databasePath.startsWith(configuredUserData)) {
        throw new Error("Smoke database escaped the isolated userData directory");
      }
    });
    await record(
      "settings opens as a modal without navigating or replacing the library",
      async () => {
        const probe = await mainWindow.webContents.executeJavaScript(
          `(async () => {
          const beforeHash = window.location.hash
          const page = document.querySelector('.library-page')
          const trigger = document.querySelector('[data-settings-trigger]')
          if (!page || !trigger) throw new Error('Settings entry or library page is missing')
          trigger.focus()
          trigger.click()
          const deadline = Date.now() + 5000
          while (!document.querySelector('.settings-surface') && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          if (window.location.hash !== beforeHash || document.querySelector('.library-page') !== page) {
            throw new Error('Opening settings replaced the current page')
          }
          return {
            hash: window.location.hash,
            settingsMounted: Boolean(document.querySelector('[data-settings-dialog] .settings-surface')),
            backgroundInert: document.querySelector('[data-app-shell-root]').inert,
            focusOnClose: document.activeElement === document.querySelector('.settings-dialog-close'),
          }
        })()`,
          true
        );
        if (probe.hash !== "#/songs" || !probe.settingsMounted || !probe.backgroundInert || !probe.focusOnClose) {
          throw new Error(`Settings modal did not mount correctly: ${JSON.stringify(probe)}`);
        }
        const playerBarOnRoute = await mainWindow.webContents.executeJavaScript(
          `(() => {
          const el = document.querySelector('.player-bar')
          const style = el ? getComputedStyle(el) : null
          const rect = el?.getBoundingClientRect()
          const inViewport = Boolean(rect) &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > 0 &&
            rect.left < window.innerWidth &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight
          return {
            mounted: Boolean(el),
            position: style?.position,
            inViewport,
            bottomDistance: rect ? window.innerHeight - rect.bottom : null,
          }
        })()`,
          true
        );
        if (!playerBarOnRoute.mounted || playerBarOnRoute.position !== "fixed" || !playerBarOnRoute.inViewport) {
          throw new Error(
            `PlayerBar layout degraded on route navigation: ${JSON.stringify(playerBarOnRoute)}`
          );
        }
      }
    );
    await record(
      "settings preserves child Escape, section selection and return focus",
      async () => {
        await mainWindow.webContents.executeJavaScript(
          `(async () => {
        const wait = () => new Promise((resolve) => setTimeout(resolve, 180))
        const waitForClosed = async () => {
          const deadline = Date.now() + 2000
          while (document.querySelector('[data-settings-dialog]') && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
        }
        const escape = (target) => target.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', bubbles: true, cancelable: true,
        }))
        const page = document.querySelector('.library-page')
        const trigger = document.querySelector('[data-settings-trigger]')
        const close = document.querySelector('.settings-dialog-close')
        close.focus()
        close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
        if (!document.querySelector('[data-settings-dialog]').contains(document.activeElement) || document.activeElement === close) {
          throw new Error('Shift+Tab escaped the settings dialog')
        }
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
        if (document.activeElement !== close) throw new Error('Tab did not wrap to the close button')

        const picker = document.querySelector('.dark-accent-toggle')
        picker.click()
        await wait()
        const pickerInput = document.querySelector('.dark-accent-picker-host input')
        pickerInput.focus()
        escape(pickerInput)
        await wait()
        if (!document.querySelector('[data-settings-dialog]') || picker.getAttribute('aria-expanded') !== 'false') {
          throw new Error('Color picker Escape closed the parent dialog')
        }

        document.querySelector('[data-settings-section="about"]').click()
        await wait()
        document.querySelector('.settings-dialog-backdrop').click()
        await waitForClosed()
        if (document.querySelector('[data-settings-dialog]') || document.querySelector('[data-app-shell-root]').inert || document.activeElement !== trigger) {
          throw new Error('Closing settings did not restore background interaction and focus: ' + JSON.stringify({
            dialogPresent: Boolean(document.querySelector('[data-settings-dialog]')),
            inert: document.querySelector('[data-app-shell-root]').inert,
            focused: document.activeElement?.outerHTML?.slice(0, 300),
            triggerConnected: trigger.isConnected,
          }))
        }
        trigger.click()
        await wait()
        if (!document.querySelector('[data-settings-section="about"][aria-current="true"]') || document.querySelector('.settings-dialog-content').scrollTop !== 0) {
          throw new Error('Settings did not reopen on the remembered section from the top')
        }
        escape(document.activeElement)
        await waitForClosed()
        if (document.querySelector('[data-settings-dialog]') || document.querySelector('.library-page') !== page) {
          throw new Error('Escape did not return to the original library page')
        }
      })()`,
          true
        );
      }
    );
    await record(
      "page parameters preserve font menu Escape, selection and return focus",
      async () => {
        await mainWindow.webContents.executeJavaScript(
          `(async () => {
        const waitFor = async (description, predicate) => {
          const deadline = Date.now() + 2000
          while (Date.now() < deadline) {
            if (predicate()) return
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          throw new Error('Timed out waiting for ' + description)
        }
        const keydown = (target, key) => target.dispatchEvent(new KeyboardEvent('keydown', {
          key, bubbles: true, cancelable: true,
        }))
        const page = document.querySelector('.library-page')
        const launcher = page?.querySelector('.library-flat-search-launcher')
        if (launcher instanceof HTMLElement) {
          launcher.click()
        } else {
          const zone = page?.querySelector('.library-search-zone')
          if (zone) {
            const rect = zone.getBoundingClientRect()
            page.dispatchEvent(new MouseEvent('mousemove', {
              bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + 20,
            }))
          }
        }
        await waitFor('search tools parameter entry', () =>
          Boolean(page?.querySelector('.page-search-tools [data-page-parameters-trigger]')))
        const trigger = page.querySelector('.page-search-tools [data-page-parameters-trigger]')
        const panel = document.getElementById('page-parameter-panel')
        if (!page || !trigger || !panel || trigger.disabled) {
          throw new Error('Song page parameters entry is unavailable')
        }
        const beforeHash = window.location.hash
        const panelIsOpen = () => trigger.getAttribute('aria-expanded') === 'true' &&
          getComputedStyle(panel).display !== 'none' && !panel.inert
        const assertClosed = async () => {
          await waitFor('page parameters close and return focus', () =>
            trigger.getAttribute('aria-expanded') === 'false' &&
            getComputedStyle(panel).display === 'none' && document.activeElement === trigger)
          if (document.querySelector('[role="listbox"]') || document.querySelector('[data-app-shell-root]').inert) {
            throw new Error('Closing page parameters left a menu or inert background')
          }
        }
        trigger.focus()
        trigger.click()
        await waitFor('song page parameters open', () => panelIsOpen() &&
          document.activeElement === panel.querySelector('.parameter-panel-close'))
        if (panel.getAttribute('role') !== 'dialog' || panel.getAttribute('aria-modal') !== 'false' ||
            document.querySelector('[data-app-shell-root]').inert ||
            window.location.hash !== beforeHash || document.querySelector('.library-page') !== page) {
          throw new Error('Page parameters did not preserve the interactive library')
        }

        let weight = panel.querySelector('#song-font-weight-list-title[role="combobox"]')
        if (!weight || weight.disabled) throw new Error('Song title font weight control is unavailable')
        const menu = () => document.getElementById(weight.getAttribute('aria-controls'))
        const openMenu = async () => {
          weight.focus()
          weight.click()
          await waitFor('font weight listbox', () => weight.getAttribute('aria-expanded') === 'true' &&
            menu()?.getAttribute('role') === 'listbox')
        }
        await openMenu()
        keydown(weight, 'Escape')
        await waitFor('font menu Escape', () => weight.getAttribute('aria-expanded') === 'false' &&
          !document.querySelector('[role="listbox"]'))
        if (!panelIsOpen() || document.activeElement !== weight) {
          throw new Error('Font menu Escape closed the page parameters or lost focus')
        }

        await openMenu()
        keydown(weight, 'Home')
        keydown(weight, 'ArrowDown')
        await waitFor('font menu keyboard navigation', () => {
          const active = document.getElementById(weight.getAttribute('aria-activedescendant'))
          return active?.getAttribute('role') === 'option' && active.textContent.includes('400')
        })
        const option = document.getElementById(weight.getAttribute('aria-activedescendant'))
        if (option.getAttribute('aria-selected') !== 'false') {
          throw new Error('Expected a different font weight option to select')
        }
        const selectedLabel = option.textContent.trim()
        option.click()
        await waitFor('font weight selection applies and persists', () =>
          weight.getAttribute('aria-expanded') === 'false' &&
          document.getElementById(weight.id + '-value').textContent.trim() === selectedLabel &&
          JSON.parse(localStorage.getItem('auralis-song-font-weights') ?? 'null')?.list?.title === 400 &&
          getComputedStyle(page).getPropertyValue('--auralis-song-list-title-weight').trim() === '400')
        if (!panelIsOpen() || document.querySelector('[role="listbox"]') || document.activeElement !== weight) {
          throw new Error('Teleported font option did not close its menu and return focus inside page parameters')
        }

        keydown(weight, 'Escape')
        await assertClosed()
        trigger.click()
        await waitFor('page parameters reopen', () => panelIsOpen() &&
          document.activeElement === panel.querySelector('.parameter-panel-close'))
        weight = panel.querySelector('#song-font-weight-list-title[role="combobox"]')
        if (!weight || weight.disabled) throw new Error('Font weight control did not remount')
        await openMenu()
        if (menu().querySelector('[role="option"][aria-selected="true"]')?.textContent.trim() !== selectedLabel ||
            document.getElementById(weight.getAttribute('aria-activedescendant'))?.textContent.trim() !== selectedLabel) {
          throw new Error('Page parameters did not retain the selected font weight')
        }
        keydown(weight, 'Escape')
        await waitFor('reopened font menu close', () => weight.getAttribute('aria-expanded') === 'false')
        panel.querySelector('.parameter-panel-close').click()
        await assertClosed()
        if (window.location.hash !== beforeHash || document.querySelector('.library-page') !== page) {
          throw new Error('Page parameters changed the current library page')
        }
      })()`,
          true
        );
      }
    );
    await record("retired settings URL redirects to the library", async () => {
      await mainWindow.webContents.executeJavaScript(`window.location.hash = '#/settings'`, true);
      await waitFor(
        "settings compatibility redirect",
        async () => mainWindow.webContents.executeJavaScript(
          `window.location.hash === '#/songs' && !document.querySelector('[data-settings-dialog]')`
        )
      );
    });
    await record("playerbar geometry anchors correctly across window resize", async () => {
      const originalBounds = mainWindow.getBounds();
      try {
        mainWindow.setSize(900, 600);
        await delay(100);
        const probe = await mainWindow.webContents.executeJavaScript(
          `(() => {
            const el = document.querySelector('.player-bar')
            const style = el ? getComputedStyle(el) : null
            const rect = el?.getBoundingClientRect()
            const inViewport = Boolean(rect) &&
              rect.width > 0 &&
              rect.height > 0 &&
              rect.right > 0 &&
              rect.left < window.innerWidth &&
              rect.bottom > 0 &&
              rect.top < window.innerHeight
            return {
              mounted: Boolean(el),
              position: style?.position,
              inViewport,
              bottomDistance: rect ? window.innerHeight - rect.bottom : null,
              bottomGap: Number.parseFloat(style?.getPropertyValue('--auralis-player-bottom-gap') ?? ''),
            }
          })()`,
          true
        );
        if (!probe.mounted || probe.position !== "fixed" || !probe.inViewport) {
          throw new Error(`PlayerBar layout degraded after window resize: ${JSON.stringify(probe)}`);
        }
        assertPlayerBarBottomGap(probe);
      } finally {
        mainWindow.setBounds(originalBounds);
        await delay(100);
      }
    });
    await record("window.open is denied", async () => {
      const windowCount = BrowserWindow.getAllWindows().length;
      const returnedNull = await mainWindow.webContents.executeJavaScript(
        `window.open('https://example.invalid/auralis-smoke') === null`,
        true
      );
      await delay(100);
      if (!returnedNull) throw new Error("window.open returned a Window proxy");
      if (BrowserWindow.getAllWindows().length !== windowCount) {
        throw new Error("window.open created another BrowserWindow");
      }
    });
    await record("untrusted renderer navigation is blocked", async () => {
      const trustedUrl = mainWindow.webContents.getURL();
      let sawBlockedNavigation = false;
      const observeNavigation = (event, url) => {
        if (url.startsWith("https://example.invalid/")) {
          sawBlockedNavigation = event.defaultPrevented;
        }
      };
      mainWindow.webContents.on("will-navigate", observeNavigation);
      try {
        await mainWindow.webContents.executeJavaScript(
          `window.location.assign('https://example.invalid/auralis-smoke-navigation')`,
          true
        );
        await waitFor("blocked will-navigate event", () => sawBlockedNavigation);
        await delay(100);
      } finally {
        mainWindow.webContents.removeListener("will-navigate", observeNavigation);
      }
      if (mainWindow.webContents.getURL() !== trustedUrl) {
        throw new Error(`Renderer escaped trusted entry: ${mainWindow.webContents.getURL()}`);
      }
    });
    await record("removed presentation APIs are absent from the real preload", async () => {
      const absent = await mainWindow.webContents.executeJavaScript(`(() => {
        const retired = ['enterMiniPlayer', 'restoreFromMiniPlayer', 'getMiniPlayerState',
          'setMiniPlayerPopover', 'onMiniPlayerStateChanged']
        return retired.every((key) => !(key in window.auralis.window))
      })()`);
      if (!absent) throw new Error("Retired presentation APIs remain exposed");
    });
    await record("registered main window retains library IPC and four sidebar tools", async () => {
      const probe = await mainWindow.webContents.executeJavaScript(`(async () => {
        const roots = await window.auralis.library.getRoots()
        const tracks = await window.auralis.library.getTracks()
        const rail = document.querySelector('.app-sidebar')?.classList.contains('app-sidebar--collapsed') === true
        const toolbar = document.querySelector('.sidebar-tools-grid')
        const tools = [...document.querySelectorAll('.sidebar-footer button')]
        const settings = document.querySelector('.sidebar-footer [data-settings-trigger]')
        const themeToggle = toolbar?.querySelector('[data-theme-toggle]')
        const groupedTools = toolbar ? [...toolbar.querySelectorAll('button.sidebar-tool-button')] : []
        const refresh = tools.find((el) => el.hasAttribute('aria-busy') &&
          ['刷新曲库', '正在刷新曲库', 'Refresh library', 'Refreshing library'].includes(el.getAttribute('aria-label')))
        const filters = groupedTools.find((el) =>
          ['筛选面板', 'Filter panel'].includes(el.getAttribute('aria-label')))
        const valid = Array.isArray(roots) && Array.isArray(tracks) && tools.length === 4 &&
          groupedTools.length === (rail ? 3 : 2) && Boolean(refresh) && Boolean(filters) &&
          toolbar.contains(refresh) === rail &&
          Boolean(settings) && !toolbar.contains(settings) && Boolean(themeToggle) &&
          !document.querySelector('.sidebar-footer [data-page-parameters-trigger]') &&
          tools.every((el) => {
            const rect = el.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0 && rect.left >= 0 &&
              rect.right <= window.innerWidth
          })
        return { valid, rail, toolCount: tools.length, groupedCount: groupedTools.length,
          refresh: Boolean(refresh), filters: Boolean(filters), settings: Boolean(settings),
          themeToggle: Boolean(themeToggle) }
      })()`);
      if (!probe.valid)
        throw new Error(`Library IPC or sidebar tools are unavailable: ${JSON.stringify(probe)}`);
    });
    await record(
      "sidebar menus preserve keyboard focus and isolated playlist edits",
      () => runSidebarSmokeChecks(mainWindow)
    );
    await record("playerbar layout contract holds after window operations", async () => {
      const probe = await mainWindow.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector('.player-bar')
          const style = el ? getComputedStyle(el) : null
          const rect = el?.getBoundingClientRect()
          const island = document.querySelector('.player-bar-island')
          const islandStyle = island ? getComputedStyle(island) : null
          const inViewport = Boolean(rect) &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.right > 0 &&
            rect.left < window.innerWidth &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight
          return {
            mounted: Boolean(el),
            position: style?.position,
            zIndex: style?.zIndex,
            inViewport,
            bottomDistance: rect ? window.innerHeight - rect.bottom : null,
            islandMounted: Boolean(island),
            bottomGap: Number.parseFloat(style?.getPropertyValue('--auralis-player-bottom-gap') ?? ''),
            islandPointerEvents: islandStyle?.pointerEvents,
          }
        })()`,
        true
      );
      if (!probe.mounted || probe.position !== "fixed" || !probe.inViewport) {
        throw new Error(
          `PlayerBar layout degraded after window operations: ${JSON.stringify(probe)}`
        );
      }
      if (probe.islandPointerEvents !== "auto") {
        throw new Error(
          `PlayerBar island pointer-events degraded after window operations: ${String(probe.islandPointerEvents)}`
        );
      }
      assertPlayerBarBottomGap(probe);
    });
    await record("later windows skip splash and retain the saved light theme", async () => {
      await mainWindow.webContents.executeJavaScript(
        `localStorage.setItem('auralis-theme', 'light')`
      );
      const laterWindow = createWindow({ showSplash: false });
      try {
        await waitFor(
          "later window did-finish-load",
          () => finishedLoads.has(laterWindow.webContents)
        );
        await waitFor(
          "later window renderer ready",
          () => laterWindow.webContents.executeJavaScript(`window.__auralisAppReady === true`)
        );
        const probe = await laterWindow.webContents.executeJavaScript(`(() => ({
          search: window.location.search,
          theme: document.documentElement.dataset.theme,
          splashPresent: Boolean(document.getElementById('splash')),
          appInert: document.getElementById('app')?.hasAttribute('inert'),
        }))()`);
        if (probe.search !== "?splash=0" || probe.theme !== "light" || probe.splashPresent || probe.appInert || laterWindow.getBackgroundColor().toLowerCase() !== "#f0f1f2") {
          throw new Error(`Later window startup did not skip splash: ${JSON.stringify(probe)}`);
        }
      } finally {
        laterWindow.destroy();
      }
    });
    await record("initial folder action scans an isolated music folder", async () => {
      const userData = process.env.AURALIS_SMOKE_USER_DATA;
      if (!userData) throw new Error("Smoke profile is missing");
      const musicFolder = join(userData, "initial-music");
      await mkdir(musicFolder);
      const samples = 8e3;
      const wav = Buffer.alloc(44 + samples * 2);
      wav.write("RIFF", 0);
      wav.writeUInt32LE(wav.length - 8, 4);
      wav.write("WAVEfmt ", 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8e3, 24);
      wav.writeUInt32LE(16e3, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write("data", 36);
      wav.writeUInt32LE(samples * 2, 40);
      await writeFile(join(musicFolder, "Initial Smoke.wav"), wav);
      const originalShowOpenDialog = Object.getOwnPropertyDescriptor(dialog, "showOpenDialog");
      Object.defineProperty(dialog, "showOpenDialog", {
        configurable: true,
        value: async (_window, options) => {
          if (!options.properties?.includes("openDirectory")) {
            throw new Error("Initial folder action did not request a directory picker");
          }
          return { canceled: false, filePaths: [musicFolder] };
        }
      });
      try {
        await mainWindow.webContents.executeJavaScript(
          `document.querySelector('.library-status-state--initial button').click()`
        );
        await waitFor(
          "initial scan and imported track",
          async () => await mainWindow.webContents.executeJavaScript(
            `(async () => {
              const [roots, scan] = await Promise.all([
                window.auralis.library.getRoots(),
                window.auralis.library.getScanStatus(),
              ])
              return roots.length === 1 && scan?.status === 'completed' &&
                Boolean(document.querySelector('.library-page [data-track-id]')) &&
                !document.querySelector('.library-status-state--initial')
            })()`
          )
        );
        const roots = await mainWindow.webContents.executeJavaScript(
          `window.auralis.library.getRoots()`
        );
        if (roots[0]?.path !== musicFolder) throw new Error("Selected root was not saved");
      } finally {
        if (originalShowOpenDialog)
          Object.defineProperty(dialog, "showOpenDialog", originalShowOpenDialog);
        else Reflect.deleteProperty(dialog, "showOpenDialog");
      }
    });
    await record("no main-frame load or renderer failure occurred", () => {
      if (loadFailures.length > 0) throw new Error(loadFailures.join("\n"));
    });
    return { ok: true, checks, loadFailures };
  } catch (error) {
    return { ok: false, checks, loadFailures, fatalError: describeError(error) };
  } finally {
    app.removeListener("web-contents-created", handleWebContentsCreated);
  }
}
async function runElectronSmokeTest(mainWindow) {
  let result;
  try {
    result = await withTimeout("Electron smoke suite", runChecks(mainWindow), SUITE_TIMEOUT_MS);
  } catch (error) {
    result = { ok: false, checks: [], loadFailures: [], fatalError: describeError(error) };
  }
  process.stdout.write(`${SMOKE_RESULT_PREFIX}${JSON.stringify(result)}
`);
  if (!result.ok) app.once("will-quit", () => app.exit(1));
  app.quit();
  return new Promise(() => void 0);
}
function createAppShutdownHandler(options) {
  let pending = null;
  let complete = false;
  return (event) => {
    if (complete) return;
    event.preventDefault();
    if (pending) return;
    pending = Promise.resolve().then(() => options.shutdownServices()).then(() => {
      options.closeResources();
      complete = true;
      options.quit();
    }).catch((error) => {
      pending = null;
      options.reportError(error);
    });
  };
}
function createWindowBehaviorPreference(userDataPath, reportError) {
  const file = join(userDataPath, "window-preferences.json");
  let behavior = "quit";
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    if (saved && typeof saved === "object" && "closeBehavior" in saved) {
      if (isWindowCloseBehavior(saved.closeBehavior)) behavior = saved.closeBehavior;
      else if (saved.closeBehavior === "minimize") behavior = "tray";
    }
  } catch (error) {
    if (error.code !== "ENOENT") reportError(error);
  }
  return {
    get: () => behavior,
    set(value) {
      if (!isWindowCloseBehavior(value)) throw new Error("Invalid window close behavior");
      const temporary = `${file}.${process.pid}.tmp`;
      try {
        mkdirSync(userDataPath, { recursive: true });
        writeFileSync(temporary, JSON.stringify({ closeBehavior: value }), {
          encoding: "utf8",
          flag: "w"
        });
        renameSync(temporary, file);
        behavior = value;
      } catch (error) {
        try {
          rmSync(temporary, { force: true });
        } catch (cleanupError) {
          reportError(cleanupError);
        }
        reportError(error);
        throw new Error("Could not save window close behavior");
      }
    }
  };
}
function createWindowBehaviorController(options) {
  let quitting = false;
  let closeAllowed = false;
  let currentWindow;
  const windows = /* @__PURE__ */ new Map();
  function beginQuit() {
    quitting = true;
  }
  function allowWindowClose() {
    quitting = true;
    closeAllowed = true;
  }
  function requestQuit() {
    if (quitting) return;
    beginQuit();
    options.quit();
  }
  function restoreWindow() {
    if (!currentWindow || currentWindow.isDestroyed()) return false;
    if (currentWindow.isMinimized()) currentWindow.restore();
    currentWindow.show();
    currentWindow.focus();
    return true;
  }
  return {
    beginQuit,
    allowWindowClose,
    requestQuit,
    restoreWindow,
    shutdownFailed() {
      quitting = false;
      closeAllowed = false;
      restoreWindow();
    },
    getState() {
      return { behavior: options.preference.get(), trayAvailable: options.trayAvailable() };
    },
    setBehavior(value) {
      if (quitting) throw new Error("Application is shutting down");
      if (value === "tray" && !options.trayAvailable())
        throw new Error("System tray is unavailable");
      options.preference.set(value);
      return this.getState();
    },
    attachWindow(window) {
      if (windows.has(window) || window.isDestroyed()) return;
      currentWindow = window;
      const onClose = (event) => {
        if (closeAllowed) return;
        event.preventDefault();
        if (quitting) return;
        switch (options.preference.get()) {
          case "quit":
            requestQuit();
            break;
          case "tray":
            if (options.trayAvailable()) window.hide();
            else restoreWindow();
            break;
        }
      };
      const onClosed = () => {
        if (currentWindow === window) currentWindow = void 0;
        windows.get(window)?.();
        windows.delete(window);
      };
      window.on("close", onClose);
      window.on("closed", onClosed);
      window.on("query-session-end", allowWindowClose);
      windows.set(window, () => {
        window.removeListener("close", onClose);
        window.removeListener("closed", onClosed);
        window.removeListener("query-session-end", allowWindowClose);
      });
    },
    dispose() {
      for (const dispose of windows.values()) dispose();
      windows.clear();
      currentWindow = void 0;
    }
  };
}
function createSystemTray(options) {
  let tray;
  let unsubscribe = () => {
  };
  try {
    const path = resolveAppIconPath();
    if (!path) throw new Error("System tray icon is missing");
    const icon = nativeImage.createFromPath(path);
    if (icon.isEmpty()) throw new Error("System tray icon is empty");
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip("Auralis");
    tray.on("click", options.restoreWindow);
    const updateMenu = () => {
      if (!tray || tray.isDestroyed()) return;
      const messages = getNativeUiMessages();
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: messages.showMainWindow, click: options.restoreWindow },
          { type: "separator" },
          { label: messages.quitApp, click: options.quit }
        ])
      );
    };
    updateMenu();
    unsubscribe = onNativeUiLocaleChanged(updateMenu);
  } catch (error) {
    tray?.removeAllListeners();
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = void 0;
    options.reportError(error);
  }
  return {
    isAvailable: () => !!tray && !tray.isDestroyed(),
    dispose() {
      unsubscribe();
      tray?.removeAllListeners();
      if (tray && !tray.isDestroyed()) tray.destroy();
      tray = void 0;
    }
  };
}
registerPrivilegedMediaSchemes();
app.setName("Auralis");
const isElectronSmokeTest = configureElectronSmokeEnvironment(app);
app.setAppUserModelId("com.bobo.auralis");
const useSoftwareRendering = !app.isPackaged && process.env.AURALIS_SOFTWARE_RENDERING === "1";
if (process.platform === "win32" && !useSoftwareRendering && !isElectronSmokeTest) {
  app.commandLine.appendSwitch("force_high_performance_gpu");
}
if (!app.isPackaged && !isElectronSmokeTest) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "1";
  const devUserDataPath = join(app.getAppPath(), "data", "user-data");
  const devCachePath = join(devUserDataPath, "cache");
  const useHardwareVideoProcessing = process.env.AURALIS_HARDWARE_VIDEO_PROCESSING === "1";
  const disableDirectComposition = process.env.AURALIS_DISABLE_DIRECT_COMPOSITION === "1";
  const quietGpuLogs = process.env.AURALIS_QUIET_GPU_LOGS === "1";
  const disabledFeatures = [];
  mkdirSync(devUserDataPath, { recursive: true });
  mkdirSync(devCachePath, { recursive: true });
  app.setPath("userData", devUserDataPath);
  app.setPath("cache", devCachePath);
  if (!useHardwareVideoProcessing) {
    app.commandLine.appendSwitch("disable-accelerated-video-decode");
    disabledFeatures.push("DirectCompositionVideoOverlays");
  }
  if (disableDirectComposition) {
    app.commandLine.appendSwitch("disable-direct-composition");
  }
  if (quietGpuLogs) {
    app.commandLine.appendSwitch("log-level", "3");
  }
  if (useSoftwareRendering) {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-gpu-sandbox");
    app.commandLine.appendSwitch("disable-gpu-compositing");
    app.commandLine.appendSwitch("disable-accelerated-2d-canvas");
    disabledFeatures.push("UseSkiaRenderer", "Vulkan", "CanvasOopRasterization");
    app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
  }
  if (disabledFeatures.length > 0) {
    app.commandLine.appendSwitch("disable-features", disabledFeatures.join(","));
  }
  app.commandLine.appendSwitch("disk-cache-dir", devCachePath);
  app.once("gpu-info-update", () => {
    void app.getGPUInfo("basic").then((gpuInfo) => {
      logger.info(
        {
          hardwareAcceleration: app.isHardwareAccelerationEnabled(),
          featureStatus: app.getGPUFeatureStatus(),
          gpuInfo
        },
        "GPU diagnostics"
      );
    }).catch((error) => {
      logger.warn({ error }, "Failed to collect GPU diagnostics");
    });
  });
}
initializeLogger({
  development: !app.isPackaged,
  logsDirectory: join(app.getPath("userData"), "logs"),
  persistToFile: app.isPackaged,
  transportPath: join(__dirname, "logging/rollingLogTransport.js")
});
const mainProcessDiagnostics = installMainProcessDiagnostics({ app, process, logger });
let runtime;
let shuttingDown = false;
let systemTray;
const windowBehavior = createWindowBehaviorController({
  preference: createWindowBehaviorPreference(
    app.getPath("userData"),
    (error) => logger.warn({ error }, "Unable to read or save window close preference")
  ),
  trayAvailable: () => systemTray?.isAvailable() ?? false,
  quit: () => app.quit()
});
void app.whenReady().then(() => {
  if (shuttingDown) return;
  const artworkCacheDir = ensureArtworkCacheDir(app.getPath("userData"));
  registerArtworkProtocol(artworkCacheDir);
  const db = initializeDatabase();
  const trackRepository = new TrackRepository(db);
  const libraryRootRepository = new LibraryRootRepository(db);
  const sendToRenderer = createRendererEventSender(() => BrowserWindow.getAllWindows());
  registerAudioProtocol({
    getFilePathByTrackId: (trackId) => shuttingDown ? null : trackRepository.getFilePathById(trackId),
    getLibraryRootPaths: () => shuttingDown ? [] : libraryRootRepository.list().map((root) => root.path),
    onFileMissing: (_trackId, filePath) => {
      if (shuttingDown) return;
      const trackIds = trackRepository.markMissingByFilePaths([filePath]);
      if (trackIds.length === 0) return;
      sendToRenderer(ipcChannels.library.changed, {
        reason: "track-missing",
        trackIds,
        filePaths: [filePath]
      });
    }
  });
  systemTray = createSystemTray({
    restoreWindow: () => {
      windowBehavior.restoreWindow();
    },
    quit: windowBehavior.requestQuit,
    reportError: (error) => logger.warn({ error }, "System tray is unavailable")
  });
  runtime = registerIpcHandlers(db, artworkCacheDir, windowBehavior);
  const mainWindow = createWindow();
  windowBehavior.attachWindow(mainWindow);
  if (isElectronSmokeTest) {
    void runElectronSmokeTest(mainWindow);
  } else {
    app.on("activate", () => {
      if (windowBehavior.restoreWindow() || shuttingDown) return;
      windowBehavior.attachWindow(createWindow({ showSplash: false }));
    });
  }
}).catch(mainProcessDiagnostics.reportStartupFailure);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
const handleShutdown = createAppShutdownHandler({
  shutdownServices: async () => {
    shuttingDown = true;
    await runtime?.shutdown();
  },
  closeResources: () => {
    closeDatabase();
    logger.info("Auralis shutdown complete");
    mainProcessDiagnostics.dispose();
    shutdownLogger();
  },
  quit: () => {
    windowBehavior.allowWindowClose();
    app.quit();
  },
  reportError: (error) => {
    windowBehavior.shutdownFailed();
    logger.error({ error }, "Unable to finish shutdown; resources remain open");
  }
});
app.on("before-quit", (event) => {
  windowBehavior.beginQuit();
  handleShutdown(event);
});
app.once("will-quit", () => {
  systemTray?.dispose();
  windowBehavior.dispose();
});
