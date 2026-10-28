import { workerData, parentPort } from "node:worker_threads";
import { cpus } from "node:os";
import { c as collectAudioFiles } from "../../chunks/libraryScanInventory-EHqOAaYv.js";
import { dirname, extname } from "node:path";
import { r as readDirectoryArtwork, a as readArtworkForFile, n as normalizeReleaseDate, g as getMetadataParserVersion, b as getDirectoryArtworkFingerprint, s as sameLyricsSidecarFingerprint, c as getLyricsSidecarFingerprint, i as isCurrentArtworkCacheKey, p as parseAudioMetadata, d as normalizeMetadata, e as normalizeIdentityText, f as readLyricsSnapshot, h as buildMetadataSignature } from "../../chunks/resolveLyricsForFile-COlnUOK3.js";
import { open, stat } from "node:fs/promises";
import { h as hasSameScanFileFingerprint, e as encodeScanFileFingerprint, s as scanFileFingerprint } from "../../chunks/delimitedValues-CpE_2YHT.js";
import "node:fs";
import "sharp";
import "pino";
import "../../chunks/logSanitizer-BxKsoqIP.js";
import "node:crypto";
import "node:zlib";
import "tty";
import "util";
import "os";
class LibraryScanArtwork {
  constructor(artworkCacheDir) {
    this.artworkCacheDir = artworkCacheDir;
  }
  directoryCoverCache = /* @__PURE__ */ new Map();
  async resolveDirectoryCover(filePath) {
    return (await this.readDirectoryCover(filePath)).cacheKey;
  }
  readDirectoryCover(filePath) {
    const dir = dirname(filePath);
    const cached = this.directoryCoverCache.get(dir);
    if (cached !== void 0) {
      return cached;
    }
    const pending = readDirectoryArtwork(filePath, this.artworkCacheDir);
    this.directoryCoverCache.set(dir, pending);
    return pending;
  }
  async resolveArtwork(filePath, metadata) {
    return (await this.readArtwork(filePath, metadata)).artworkCacheKey;
  }
  readArtwork(filePath, metadata) {
    return readArtworkForFile(
      filePath,
      metadata,
      this.artworkCacheDir,
      () => this.readDirectoryCover(filePath)
    );
  }
}
const MAX_TEXT_BYTES = 1024 * 1024;
const CONTAINERS = /* @__PURE__ */ new Set(["moov", "udta", "meta", "ilst"]);
const ID3V1_GENRES = [
  "Blues",
  "Classic Rock",
  "Country",
  "Dance",
  "Disco",
  "Funk",
  "Grunge",
  "Hip-Hop",
  "Jazz",
  "Metal",
  "New Age",
  "Oldies",
  "Other",
  "Pop",
  "R&B",
  "Rap",
  "Reggae",
  "Rock",
  "Techno",
  "Industrial",
  "Alternative",
  "Ska",
  "Death Metal",
  "Pranks",
  "Soundtrack",
  "Euro-Techno",
  "Ambient",
  "Trip-Hop",
  "Vocal",
  "Jazz+Funk",
  "Fusion",
  "Trance",
  "Classical",
  "Instrumental",
  "Acid",
  "House",
  "Game",
  "Sound Clip",
  "Gospel",
  "Noise",
  "Alt. Rock",
  "Bass",
  "Soul",
  "Punk",
  "Space",
  "Meditative",
  "Instrumental Pop",
  "Instrumental Rock",
  "Ethnic",
  "Gothic",
  "Darkwave",
  "Techno-Industrial",
  "Electronic",
  "Pop-Folk",
  "Eurodance",
  "Dream",
  "Southern Rock",
  "Comedy",
  "Cult",
  "Gangsta Rap",
  "Top 40",
  "Christian Rap",
  "Pop/Funk",
  "Jungle",
  "Native American",
  "Cabaret",
  "New Wave",
  "Psychedelic",
  "Rave",
  "Showtunes",
  "Trailer",
  "Lo-Fi",
  "Tribal",
  "Acid Punk",
  "Acid Jazz",
  "Polka",
  "Retro",
  "Musical",
  "Rock & Roll",
  "Hard Rock",
  "Folk",
  "Folk/Rock",
  "National Folk",
  "Swing",
  "Fast-Fusion",
  "Bebob",
  "Latin",
  "Revival",
  "Celtic",
  "Bluegrass",
  "Avantgarde",
  "Gothic Rock",
  "Progressive Rock",
  "Psychedelic Rock",
  "Symphonic Rock",
  "Slow Rock",
  "Big Band",
  "Chorus",
  "Easy Listening",
  "Acoustic",
  "Humour",
  "Speech",
  "Chanson",
  "Opera",
  "Chamber Music",
  "Sonata",
  "Symphony",
  "Booty Bass",
  "Primus",
  "Porn Groove",
  "Satire",
  "Slow Jam",
  "Club",
  "Tango",
  "Samba",
  "Folklore",
  "Ballad",
  "Power Ballad",
  "Rhythmic Soul",
  "Freestyle",
  "Duet",
  "Punk Rock",
  "Drum Solo",
  "A Cappella",
  "Euro-House",
  "Dance Hall",
  "Goa",
  "Drum & Bass",
  "Club-House",
  "Hardcore",
  "Terror",
  "Indie",
  "BritPop",
  "Negerpunk",
  "Polsk Punk",
  "Beat",
  "Christian Gangsta Rap",
  "Heavy Metal",
  "Black Metal",
  "Crossover",
  "Contemporary Christian",
  "Christian Rock",
  "Merengue",
  "Salsa",
  "Thrash Metal",
  "Anime",
  "JPop",
  "Synthpop",
  "Abstract",
  "Art Rock",
  "Baroque",
  "Bhangra",
  "Big Beat",
  "Breakbeat",
  "Chillout",
  "Downtempo",
  "Dub",
  "EBM",
  "Eclectic",
  "Electro",
  "Electroclash",
  "Emo",
  "Experimental",
  "Garage",
  "Global",
  "IDM",
  "Illbient",
  "Industro-Goth",
  "Jam Band",
  "Krautrock",
  "Leftfield",
  "Lounge",
  "Math Rock",
  "New Romantic",
  "Nu-Breakz",
  "Post-Punk",
  "Post-Rock",
  "Psytrance",
  "Shoegaze",
  "Space Rock",
  "Trop Rock",
  "World Music",
  "Neoclassical",
  "Audiobook",
  "Audio Theatre",
  "Neue Deutsche Welle",
  "Podcast",
  "Indie Rock",
  "G-Funk",
  "Dubstep",
  "Garage Rock",
  "Psybient"
];
async function readM4aTextMetadata(filePath) {
  const file = await open(filePath, "r");
  try {
    const { size } = await file.stat();
    return await readM4aTextMetadataFromReader({
      size,
      async readAt(position, length) {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await file.read(buffer, 0, length, position);
        if (bytesRead !== length) throw new Error("Incomplete MP4 atom");
        return buffer;
      }
    });
  } finally {
    await file.close();
  }
}
async function readM4aTextMetadataFromReader(reader) {
  const tags = [];
  await walkAtoms(reader, 0, reader.size, null, tags);
  return metadataFromTags(tags);
}
async function walkAtoms(reader, start, end, parent, tags) {
  let position = start;
  while (end - position >= 8) {
    const span = await readSpan(reader, position, end);
    if (!span) return;
    if (parent === "ilst") {
      if (span.type !== "covr") await readIlstItem(reader, span, tags);
    } else if (CONTAINERS.has(span.type)) {
      let childStart = span.payloadStart;
      if (span.type === "meta") childStart += await metaPadding(reader, span);
      await walkAtoms(reader, childStart, span.end, span.type, tags);
    }
    position = span.end;
  }
}
async function readSpan(reader, position, parentEnd) {
  const header = await reader.readAt(position, 8);
  const type = header.toString("latin1", 4, 8);
  if (type === "\0\0\0\0") return null;
  let size = header.readUInt32BE(0);
  let headerLength = 8;
  if (size === 1) {
    if (parentEnd - position < 16) throw new Error("Incomplete MP4 extended atom size");
    const extended = await reader.readAt(position + 8, 8);
    const big = extended.readBigUInt64BE(0);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MP4 atom is too large");
    size = Number(big);
    headerLength = 16;
  } else if (size === 0) {
    size = parentEnd - position;
  }
  if (!Number.isInteger(size) || size < headerLength || size > parentEnd - position) {
    throw new Error(`Invalid MP4 atom ${type}`);
  }
  return {
    type,
    start: position,
    end: position + size,
    payloadStart: position + headerLength
  };
}
async function metaPadding(reader, span) {
  if (span.end - span.payloadStart < 8) throw new Error("Incomplete MP4 meta atom");
  const peek = await reader.readAt(span.payloadStart, 8);
  return peek.toString("latin1", 4, 8) === "hdlr" ? 0 : 4;
}
async function readIlstItem(reader, item, tags) {
  let key = item.type;
  let position = item.payloadStart;
  while (item.end - position >= 8) {
    const child = await readSpan(reader, position, item.end);
    if (!child) return;
    if (child.type === "data") await readDataAtom(reader, key, child, tags);
    else if (child.type === "mean" || child.type === "name") {
      key += `:${await readName(reader, child)}`;
    }
    position = child.end;
  }
}
async function readName(reader, span) {
  const length = span.end - span.payloadStart;
  if (length < 4) throw new Error("Incomplete MP4 name atom");
  if (length - 4 > MAX_TEXT_BYTES) throw new Error("MP4 name atom exceeds read limit");
  const bytes = await reader.readAt(span.payloadStart + 4, length - 4);
  return decodeUtf8(bytes);
}
async function readDataAtom(reader, key, span, tags) {
  const payloadLength = span.end - span.payloadStart;
  if (payloadLength < 8) throw new Error("Incomplete MP4 data atom");
  const prefix = await reader.readAt(span.payloadStart, 8);
  if (prefix[0] !== 0) throw new Error("Unsupported MP4 data type set");
  const dataType = prefix.readUIntBE(1, 3);
  const valueStart = span.payloadStart + 8;
  const valueLength = span.end - valueStart;
  if (dataType === 13 || dataType === 14) return;
  if (dataType === 1 || dataType === 18) {
    if (valueLength > MAX_TEXT_BYTES) throw new Error("MP4 text atom exceeds read limit");
    const bytes = valueLength === 0 ? Buffer.alloc(0) : await reader.readAt(valueStart, valueLength);
    tags.push({ id: key, value: decodeUtf8(bytes) });
    return;
  }
  if (dataType !== 0 || valueLength > 64) return;
  const value = valueLength === 0 ? Buffer.alloc(0) : await reader.readAt(valueStart, valueLength);
  if ((key === "trkn" || key === "disk") && value.length >= 6) {
    tags.push({ id: key, value: `${value[3]}/${value[5]}` });
    return;
  }
  if (key === "gnre" && value.length >= 2) {
    const genre = ID3V1_GENRES[value[1] - 1];
    if (genre) tags.push({ id: key, value: genre });
  }
}
function decodeUtf8(bytes) {
  return bytes.toString("utf8").replace(/\0+$/g, "");
}
function metadataFromTags(tags) {
  let title;
  let album;
  let date;
  let year;
  const warnings = [];
  const track = { no: null, of: null };
  const disk = { no: null, of: null };
  for (const tag of tags) {
    const value = typeof tag.value === "string" ? tag.value : "";
    if (tag.id === "©nam") title = value;
    else if (tag.id === "©alb") album = value;
    else if (tag.id === "©day") {
      date = value;
      try {
        normalizeReleaseDate(value);
      } catch {
        warnings.push({ message: "Invalid release date in audio tags" });
      }
      const parsed = Number.parseInt(value.slice(0, 4), 10);
      if (!Number.isNaN(parsed)) year = parsed;
    } else if (tag.id === "trkn" || tag.id === "disk") {
      const [number, total] = value.split("/");
      const target = tag.id === "trkn" ? track : disk;
      target.no = Number.parseInt(number ?? "", 10) || null;
      target.of = Number.parseInt(total ?? "", 10) || null;
    }
  }
  const tagTypes = tags.length > 0 ? ["iTunes"] : [];
  return {
    format: { trackInfo: [], tagTypes },
    native: tags.length > 0 ? { iTunes: tags } : {},
    quality: { warnings },
    common: {
      title,
      album,
      date,
      year,
      track,
      disk,
      movementIndex: { no: null, of: null }
    }
  };
}
class LibraryScanTrackReader {
  constructor(knownFiles, artwork, onFailure) {
    this.artwork = artwork;
    this.onFailure = onFailure;
    this.knownFiles = new Map(knownFiles.map((file) => [file.filePath, file]));
  }
  knownFiles;
  async read(filePath) {
    let fileSize;
    let fileMtimeMs;
    let fileStat;
    try {
      fileStat = await stat(filePath);
      fileSize = Number(fileStat.size);
      fileMtimeMs = Number(fileStat.mtimeMs);
    } catch (statError) {
      this.onFailure(
        filePath,
        statError instanceof Error ? statError.message : "Unable to stat file"
      );
      return { kind: "skip" };
    }
    const knownFile = this.knownFiles.get(filePath);
    const fileUnchanged = knownFile && knownFile.fileFingerprint && knownFile.fileSize === fileSize && knownFile.fileMtimeMs === fileMtimeMs && hasSameScanFileFingerprint(fileStat, knownFile.fileFingerprint);
    const metadataChecked = knownFile?.metadataCheckedMtimeMs !== null && knownFile?.metadataCheckedMtimeMs === fileMtimeMs && knownFile.metadataParserVersion === getMetadataParserVersion(filePath);
    const needsMetadataBackfill = Boolean(fileUnchanged && knownFile && !metadataChecked);
    let artworkChecked = knownFile?.artworkCheckedFingerprint === encodeScanFileFingerprint(scanFileFingerprint(fileStat));
    if (artworkChecked && !knownFile?.embeddedArtworkCacheKey) {
      try {
        artworkChecked = knownFile?.directoryArtworkFingerprint === await getDirectoryArtworkFingerprint(filePath);
      } catch {
        artworkChecked = false;
      }
    }
    try {
      const lyricsChecked = knownFile?.lyricsCheckedMtimeMs === fileMtimeMs && sameLyricsSidecarFingerprint(
        knownFile.lyricsSidecarFingerprint,
        await getLyricsSidecarFingerprint(filePath)
      );
      const needsLyricsBackfill = Boolean(fileUnchanged && !lyricsChecked);
      if (fileUnchanged && artworkChecked && !needsLyricsBackfill && !needsMetadataBackfill) {
        return { kind: "skip" };
      }
      if (!fileUnchanged) {
        const result = await this.readFullTrack(filePath, fileStat);
        await this.assertArtworkUnchanged(filePath, result);
        await this.assertUnchanged(filePath, fileStat);
        return result;
      }
      if (needsMetadataBackfill && knownFile) {
        const result = await this.readUnchangedTags(
          filePath,
          fileStat,
          knownFile,
          needsLyricsBackfill,
          !artworkChecked
        );
        await this.assertArtworkUnchanged(filePath, result);
        await this.assertUnchanged(filePath, fileStat);
        return result;
      }
      if (fileUnchanged) {
        const result = await this.readBackfill(
          filePath,
          fileStat,
          knownFile,
          needsLyricsBackfill,
          !artworkChecked
        );
        await this.assertArtworkUnchanged(filePath, result);
        await this.assertUnchanged(filePath, fileStat);
        return result;
      }
    } catch (error) {
      this.onFailure(filePath, error instanceof Error ? error.message : "Unable to parse metadata");
      return { kind: "skip" };
    }
    return { kind: "skip" };
  }
  async assertUnchanged(filePath, expected) {
    const after = await stat(filePath);
    if (!hasSameScanFileFingerprint(after, expected)) {
      throw new Error("Audio file changed while metadata was being read");
    }
  }
  async assertArtworkUnchanged(filePath, result) {
    const state = result.kind === "track" ? result.track : result.kind === "tags" ? result.patch : result.kind === "artwork" ? result.patch : result.kind === "patches" ? result.artworkPatch ?? void 0 : void 0;
    if (state?.directoryArtworkFingerprint !== void 0 && state.directoryArtworkFingerprint !== await getDirectoryArtworkFingerprint(filePath))
      throw new Error("Directory artwork changed while being read");
  }
  async readUnchangedTags(filePath, fileStat, knownFile, needsLyricsBackfill, needsArtworkBackfill) {
    const { size: fileSize, mtimeMs: fileMtimeMs } = fileStat;
    const carriedArtworkKey = isCurrentArtworkCacheKey(knownFile.artworkCacheKey) ? knownFile.artworkCacheKey : null;
    const metadata = extname(filePath).toLowerCase() === ".m4a" && !needsArtworkBackfill ? await readM4aTextMetadata(filePath) : await parseAudioMetadata(filePath, { duration: false, skipCovers: !needsArtworkBackfill });
    const normalized = normalizeMetadata(metadata, filePath);
    const identity = normalizeIdentityText(metadata);
    const artwork = needsArtworkBackfill ? await this.artwork.readArtwork(filePath, metadata) : { artworkCacheKey: carriedArtworkKey };
    let lyricsPatch = null;
    if (needsLyricsBackfill) {
      const { lyrics, lyricsSidecarFingerprint } = await readLyricsSnapshot(filePath, metadata);
      lyricsPatch = {
        filePath,
        fileFingerprint: scanFileFingerprint(fileStat),
        lyricsText: lyrics?.text ?? null,
        lyricsFormat: lyrics?.format ?? null,
        lyricsCheckedMtimeMs: fileMtimeMs,
        lyricsSidecarFingerprint
      };
    }
    return {
      kind: "tags",
      lyricsPatch,
      patch: {
        filePath,
        fileTags: normalized.fileTags,
        ...artwork,
        fileFingerprint: scanFileFingerprint(fileStat),
        fileMtimeMs,
        title: normalized.title,
        artist: normalized.artist,
        album: normalized.album,
        albumArtist: normalized.albumArtist,
        trackNo: normalized.trackNo,
        discNo: normalized.discNo,
        year: normalized.year,
        releaseDate: normalized.releaseDate,
        copyright: normalized.copyright,
        composer: normalized.composer,
        genre: normalized.genre,
        isrc: identity.isrc,
        metadataSignature: buildMetadataSignature(
          identity,
          knownFile.durationSeconds ?? null,
          fileSize
        ),
        metadataParserVersion: getMetadataParserVersion(filePath),
        artworkCacheKey: artwork.artworkCacheKey
      }
    };
  }
  async readFullTrack(filePath, fileStat) {
    const metadata = await parseAudioMetadata(filePath, { duration: true });
    return {
      kind: "track",
      track: await this.createScannedTrack(filePath, fileStat, metadata)
    };
  }
  async readBackfill(filePath, fileStat, knownFile, needsLyricsBackfill, needsArtworkBackfill) {
    let artworkPatch = null;
    let lyricsPatch = null;
    const knownKey = knownFile.artworkCacheKey;
    const skipCovers = !needsArtworkBackfill;
    const metadata = await parseAudioMetadata(filePath, { duration: false, skipCovers });
    if (needsLyricsBackfill) {
      const { lyrics, lyricsSidecarFingerprint } = await readLyricsSnapshot(filePath, metadata);
      lyricsPatch = {
        filePath,
        fileFingerprint: scanFileFingerprint(fileStat),
        lyricsText: lyrics?.text ?? null,
        lyricsFormat: lyrics?.format ?? null,
        lyricsCheckedMtimeMs: fileStat.mtimeMs,
        lyricsSidecarFingerprint
      };
    }
    const artwork = skipCovers ? { artworkCacheKey: knownKey, artworkRead: { status: "unread" } } : await this.artwork.readArtwork(filePath, metadata);
    const artworkCacheKey = artwork.artworkCacheKey;
    if (!skipCovers || artworkCacheKey) {
      artworkPatch = {
        filePath,
        fileFingerprint: scanFileFingerprint(fileStat),
        ...artwork,
        album: knownFile.album || "Unknown Album",
        artist: knownFile.albumArtist || "Unknown Artist",
        artworkCacheKey
      };
    }
    if (artworkPatch || lyricsPatch) {
      return {
        kind: "patches",
        artworkPatch,
        lyricsPatch
      };
    }
    return { kind: "skip" };
  }
  async createScannedTrack(filePath, fileStat, metadata) {
    const normalized = normalizeMetadata(metadata, filePath);
    const artwork = await this.artwork.readArtwork(filePath, metadata);
    const { lyrics, lyricsSidecarFingerprint } = await readLyricsSnapshot(filePath, metadata);
    const identity = normalizeIdentityText(metadata);
    return {
      filePath,
      fileTags: normalized.fileTags,
      ...artwork,
      fileFingerprint: scanFileFingerprint(fileStat),
      metadataParserVersion: getMetadataParserVersion(filePath),
      fileSize: Number(fileStat.size),
      fileMtimeMs: Number(fileStat.mtimeMs),
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
      lyricsSidecarFingerprint,
      isrc: identity.isrc,
      metadataSignature: buildMetadataSignature(
        identity,
        normalized.durationSeconds,
        Number(fileStat.size)
      )
    };
  }
}
class LibraryScanReporter {
  constructor(jobId, postMessage2) {
    this.jobId = jobId;
    this.postMessage = postMessage2;
  }
  trackBatch = [];
  tagBatch = [];
  artworkBatch = [];
  lyricsBatch = [];
  foundFilePaths = [];
  unreadableDirectoryPaths = [];
  totalFiles = 0;
  scannedFiles = 0;
  failedFiles = 0;
  lastProgressAt = 0;
  beginCollection() {
    this.postProgress(null, "Collecting audio files", true);
  }
  beginScanning(totalFiles) {
    this.totalFiles = totalFiles;
    this.postProgress(null, "Scanning audio files", true);
  }
  reportUnreadableDirectory(directoryPath) {
    this.unreadableDirectoryPaths.push(directoryPath);
    this.postMessage({
      type: "failure",
      payload: { jobId: this.jobId, filePath: directoryPath, reason: "Unable to read directory" }
    });
    this.failedFiles += 1;
  }
  reportFileFailure(filePath, reason) {
    this.failedFiles += 1;
    this.postMessage({ type: "failure", payload: { jobId: this.jobId, filePath, reason } });
  }
  complete() {
    this.flushTrackBatch();
    this.flushTagBatch();
    this.flushArtworkBatch();
    this.flushLyricsBatch();
    this.postProgress(null, "Scan complete", true);
    this.postMessage({
      type: "complete",
      payload: {
        foundFilePaths: this.foundFilePaths,
        unreadableDirectoryPaths: this.unreadableDirectoryPaths
      }
    });
  }
  postProgress(currentFile, message, force = false) {
    const now = Date.now();
    if (!force && this.scannedFiles % 100 !== 0 && now - this.lastProgressAt < 200) return;
    this.lastProgressAt = now;
    this.postMessage({
      type: "progress",
      payload: {
        jobId: this.jobId,
        status: "scanning",
        totalFiles: this.totalFiles,
        scannedFiles: this.scannedFiles,
        failedFiles: this.failedFiles,
        currentFile,
        message
      }
    });
  }
  handleReadResult(result, filePath) {
    this.scannedFiles += 1;
    this.foundFilePaths.push(filePath);
    if (result.kind === "track") {
      this.trackBatch.push(result.track);
      if (this.trackBatch.length >= 300) {
        this.flushTrackBatch();
      }
    } else if (result.kind === "tags") {
      this.tagBatch.push(result.patch);
      if (result.lyricsPatch) this.lyricsBatch.push(result.lyricsPatch);
      if (this.tagBatch.length >= 300) this.flushTagBatch();
      if (this.lyricsBatch.length >= 300) this.flushLyricsBatch();
    } else if (result.kind === "artwork") {
      this.artworkBatch.push(result.patch);
      if (this.artworkBatch.length >= 300) {
        this.flushArtworkBatch();
      }
    } else if (result.kind === "patches") {
      if (result.artworkPatch) {
        this.artworkBatch.push(result.artworkPatch);
      }
      if (result.lyricsPatch) {
        this.lyricsBatch.push(result.lyricsPatch);
      }
      if (this.artworkBatch.length >= 300) {
        this.flushArtworkBatch();
      }
      if (this.lyricsBatch.length >= 300) {
        this.flushLyricsBatch();
      }
    }
    this.postProgress(filePath, null);
  }
  flushTrackBatch() {
    if (this.trackBatch.length === 0) {
      return;
    }
    this.postMessage({ type: "tracks", payload: this.trackBatch.splice(0, this.trackBatch.length) });
  }
  flushTagBatch() {
    if (this.tagBatch.length === 0) return;
    this.postMessage({ type: "trackTags", payload: this.tagBatch.splice(0, this.tagBatch.length) });
  }
  flushArtworkBatch() {
    if (this.artworkBatch.length === 0) {
      return;
    }
    this.postMessage({
      type: "albumArtwork",
      payload: this.artworkBatch.splice(0, this.artworkBatch.length)
    });
  }
  flushLyricsBatch() {
    if (this.lyricsBatch.length === 0) {
      return;
    }
    this.postMessage({
      type: "trackLyrics",
      payload: this.lyricsBatch.splice(0, this.lyricsBatch.length)
    });
  }
}
const SCAN_CONCURRENCY = Math.max(4, Math.min(cpus().length || 4, 8));
async function runLibraryScan(input2, postMessage2) {
  const reporter = new LibraryScanReporter(input2.jobId, postMessage2);
  const artwork = new LibraryScanArtwork(input2.artworkCacheDir);
  const reader = new LibraryScanTrackReader(
    input2.knownFiles,
    artwork,
    (filePath, reason) => reporter.reportFileFailure(filePath, reason)
  );
  reporter.beginCollection();
  const audioFiles = await collectAudioFiles(
    input2.rootPath,
    (directoryPath) => reporter.reportUnreadableDirectory(directoryPath)
  );
  reporter.beginScanning(audioFiles.length);
  let index = 0;
  const executing = /* @__PURE__ */ new Set();
  while (index < audioFiles.length) {
    const filePath = audioFiles[index++];
    const p = Promise.resolve().then(() => reader.read(filePath));
    const tracker = p.then(
      (res) => {
        executing.delete(tracker);
        reporter.handleReadResult(res, filePath);
      },
      () => {
        executing.delete(tracker);
      }
    );
    executing.add(tracker);
    if (executing.size >= SCAN_CONCURRENCY) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  reporter.complete();
}
const input = workerData;
function postMessage(message) {
  parentPort?.postMessage(message);
}
runLibraryScan(input, postMessage).catch((error) => {
  postMessage({
    type: "fatal",
    payload: {
      jobId: input.jobId,
      reason: error instanceof Error ? error.message : "Scan worker failed"
    }
  });
});
