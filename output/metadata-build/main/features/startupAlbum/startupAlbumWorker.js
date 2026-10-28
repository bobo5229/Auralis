import Database from "better-sqlite3";
import { workerData, parentPort } from "node:worker_threads";
import { S as STARTUP_ALBUM_HISTORY_LIMIT, T as TrackQueryRepository } from "../../chunks/startupAlbum-X8KWrNIq.js";
import "../../chunks/delimitedValues-CpE_2YHT.js";
import "node:path";
const STARTUP_ALBUM_MIX = { lessPlayed: 0.6, rediscover: 0.25 };
function key(album) {
  return JSON.stringify([album.albumArtist, album.album]);
}
function selectStartupAlbum(candidates, history = [], random = Math.random, now = Date.now()) {
  if (!candidates.length) return null;
  const recent = history.slice(0, STARTUP_ALBUM_HISTORY_LIMIT);
  const blocked = new Set(recent.map(key));
  let eligible = candidates.filter((album) => !blocked.has(key(album)));
  for (let i = recent.length - 1; !eligible.length && i >= 0; i--) {
    blocked.delete(key(recent[i]));
    eligible = candidates.filter((album) => !blocked.has(key(album)));
  }
  const branch = random();
  const rediscover = branch >= STARTUP_ALBUM_MIX.lessPlayed && branch < STARTUP_ALBUM_MIX.lessPlayed + STARTUP_ALBUM_MIX.rediscover;
  if (rediscover) {
    const heard = eligible.filter((album) => Number.isFinite(Date.parse(album.lastPlayedAt ?? "")));
    if (heard.length) eligible = heard;
    else return identity(eligible[Math.floor(random() * eligible.length)]);
  }
  if (branch >= STARTUP_ALBUM_MIX.lessPlayed + STARTUP_ALBUM_MIX.rediscover) {
    return identity(eligible[Math.floor(random() * eligible.length)]);
  }
  const weights = eligible.map((album) => {
    const artistAppearances = recent.slice(0, 3).filter((shown) => shown.albumArtist === album.albumArtist).length;
    const artistWeight = 1 / (1 + 0.5 * artistAppearances);
    if (rediscover) {
      const days = Math.max(0, (now - Date.parse(album.lastPlayedAt)) / 864e5);
      return (0.1 + 0.9 * Math.min(days / 90, 1)) * artistWeight;
    }
    return (1 + 0.5 * album.unheardFraction) / Math.sqrt(1 + album.averagePlayCount) * artistWeight;
  });
  let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < eligible.length; i++) {
    draw -= weights[i];
    if (draw < 0) return identity(eligible[i]);
  }
  return identity(eligible[eligible.length - 1]);
}
function identity(album) {
  return { albumArtist: album.albumArtist, album: album.album };
}
function queryStartupAlbum(db2, history = []) {
  return db2.transaction(() => {
    const tracks = new TrackQueryRepository(db2);
    const identity2 = selectStartupAlbum(tracks.getStartupAlbumCandidates(), history);
    if (!identity2) return null;
    const albumTracks = tracks.getAlbumTracks(identity2.albumArtist, identity2.album);
    return albumTracks.length ? { ...identity2, tracks: albumTracks } : null;
  })();
}
const input = workerData;
let message;
let db;
try {
  db = new Database(input.databasePath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  message = { type: "result", album: queryStartupAlbum(db, input.history) };
} catch (error) {
  message = {
    type: "error",
    reason: error instanceof Error ? error.message : "Startup album query failed"
  };
} finally {
  db?.close();
}
parentPort?.postMessage(message);
parentPort?.close();
