// src/main/features/audio/mpvClient.ts
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
async function openMpvClient(executable, onEvent, onFailure, signal, extraArgs = []) {
  const pipe = `\\\\.\\pipe\\auralis-audio-${randomUUID()}`;
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
      `--input-ipc-server=${pipe}`,
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
  function fail(error) {
    if (closed) return;
    close();
    if (ready) onFailure(error);
  }
  signal.addEventListener("abort", close, { once: true });
  child.on("exit", (code) => fail(new Error(`mpv exited (${code}): ${stderr}`)));
  try {
    const deadline = Date.now() + 8e3;
    while (!socket) {
      if (signal.aborted || closed) throw new Error("mpv startup cancelled");
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`mpv failed to start: ${stderr}`);
      try {
        socket = await new Promise((resolve2, reject) => {
          const candidate = connect(pipe);
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
        await delay(40);
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
  socket.on("error", fail);
  socket.on("close", () => fail(new Error("mpv IPC disconnected")));
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > 1048576) {
      fail(new Error("mpv IPC response too large"));
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
        fail(new Error("Invalid mpv IPC response"));
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

// src/main/features/audio/bufferedTagPlayback.ts
import { extname as extname3 } from "node:path";

// src/main/features/metadata/parseAudioMetadata.ts
import { open } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { parseFile } from "music-metadata";

// src/shared/utils/delimitedValues.ts
function splitDelimitedValues(value) {
  if (!value) return [];
  return value.split("; ").map((part) => part.trim()).filter(Boolean);
}
function normalizeDelimitedValue(value) {
  return value.trim().toLocaleLowerCase();
}
function joinDelimitedValues(values) {
  const cleaned = values.map((val) => val?.trim()).filter((val) => Boolean(val));
  return cleaned.length > 0 ? cleaned.join("; ") : null;
}
function cleanDelimitedValues(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const raw of values) {
    for (const part of splitDelimitedValues(raw)) {
      const key = normalizeDelimitedValue(part);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(part);
    }
  }
  return result;
}
function canonicalizeDelimitedValues(value) {
  return joinDelimitedValues(cleanDelimitedValues([value]));
}

// src/shared/utils/releaseDate.ts
function normalizeReleaseDate(value) {
  const normalized = value?.trim() || null;
  if (!normalized) return null;
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(normalized);
  if (!match) throw new Error("Release Date must use YYYY, YYYY-MM, or YYYY-MM-DD");
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : null;
  const day = match[3] ? Number(match[3]) : null;
  if (month !== null && (month < 1 || month > 12))
    throw new Error("Release Date month must be between 01 and 12");
  if (day !== null && (day < 1 || day > 31))
    throw new Error("Release Date day must be between 01 and 31");
  if (month !== null && day !== null) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (day > days) throw new Error("Release Date does not exist on the calendar");
  }
  return normalized;
}
function releaseDateYear(date) {
  return date === null ? null : Number(date.slice(0, 4));
}

// src/main/features/metadata/editableMetadataValidation.ts
function normalizeEditableText(value) {
  if (value === null) {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}
var normalizeEditableReleaseDate = normalizeReleaseDate;
function normalizeEditableMetadata(metadata) {
  const releaseDate = normalizeReleaseDate(metadata.releaseDate);
  return {
    ...metadata,
    title: normalizeEditableText(metadata.title),
    artistDisplay: canonicalizeDelimitedValues(metadata.artistDisplay),
    albumTitle: normalizeEditableText(metadata.albumTitle),
    albumArtistDisplay: canonicalizeDelimitedValues(metadata.albumArtistDisplay),
    genreDisplay: canonicalizeDelimitedValues(metadata.genreDisplay),
    year: releaseDateYear(releaseDate),
    releaseDate
  };
}

// src/main/features/metadata/parseAudioMetadata.ts
var MAX_TAG_BYTES = 64 * 1024 * 1024;
var MAX_TEXT_BYTES = 1024 * 1024;
var TEXT_FIELDS = {
  TPE1: "artists",
  TP1: "artists",
  TCON: "genre",
  TCO: "genre",
  TCOM: "composer",
  TCM: "composer"
};
function decodeId3v23Date(metadata) {
  if (metadata.common.date) {
    try {
      normalizeEditableReleaseDate(metadata.common.date);
    } catch {
      metadata.quality.warnings.push({ message: "Invalid release date in audio tags" });
    }
    return;
  }
  const tags = metadata.native["ID3v2.3"] ?? [];
  for (const tag of tags) {
    if (tag.id !== "TYER" || typeof tag.value !== "string") continue;
    const value = tag.value.trim();
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(value)) {
      if (!/^\d{4}$/.test(value))
        metadata.quality.warnings.push({ message: "Invalid ID3v2.3 TYER release date" });
      continue;
    }
    if (metadata.common.year !== void 0 && metadata.common.year !== Number(value.slice(0, 4)))
      continue;
    try {
      metadata.common.date = normalizeEditableReleaseDate(value) ?? void 0;
      return;
    } catch {
      metadata.quality.warnings.push({ message: "Invalid ID3v2.3 TYER release date" });
    }
  }
  const year = tags.find((tag) => tag.id === "TYER" && typeof tag.value === "string")?.value;
  const dayMonth = tags.find((tag) => tag.id === "TDAT" && typeof tag.value === "string")?.value;
  if (typeof year !== "string" || !/^\d{4}$/.test(year.trim())) return;
  if (typeof dayMonth !== "string") return;
  if (!/^\d{4}$/.test(dayMonth.trim())) {
    metadata.quality.warnings.push({ message: "Invalid ID3v2.3 TDAT release date" });
    return;
  }
  const normalizedYear = year.trim();
  if (metadata.common.year !== void 0 && metadata.common.year !== Number(normalizedYear)) return;
  const normalizedDayMonth = dayMonth.trim();
  try {
    metadata.common.date = normalizeEditableReleaseDate(
      `${normalizedYear}-${normalizedDayMonth.slice(2)}-${normalizedDayMonth.slice(0, 2)}`
    ) ?? void 0;
  } catch {
    metadata.quality.warnings.push({ message: "Invalid ID3v2.3 TDAT release date" });
  }
}
function decodeId3v23Genres(metadata) {
  const tags = metadata.native["ID3v2.3"];
  if (!tags) return metadata;
  const originalValues = new Set(
    tags.filter((tag) => tag.id === "TCON" && typeof tag.value === "string").map((tag) => tag.value)
  );
  if (![...originalValues].some((value) => value.includes(";"))) return metadata;
  const parts = (value) => value.split(";").map((part) => part.trim()).filter(Boolean);
  metadata.native["ID3v2.3"] = tags.flatMap(
    (tag) => tag.id === "TCON" && typeof tag.value === "string" ? parts(tag.value).map((value) => ({ ...tag, value })) : [tag]
  );
  metadata.common.genre = metadata.common.genre ? metadata.common.genre.flatMap((value) => originalValues.has(value) ? parts(value) : [value]) : [...originalValues].flatMap(parts);
  return metadata;
}
function removeUnsynchronization(bytes) {
  const result = Buffer.allocUnsafe(bytes.length);
  let length = 0;
  for (let index = 0; index < bytes.length; index++) {
    result[length++] = bytes[index];
    if (bytes[index] === 255 && bytes[index + 1] === 0) index++;
  }
  return result.subarray(0, length);
}
function decodeText(bytes) {
  const encoding = bytes[0];
  let text;
  let content = bytes.subarray(1);
  if (encoding === 0) text = content.toString("latin1");
  else if (encoding === 3) text = content.toString("utf8");
  else if (encoding === 1 || encoding === 2) {
    const bigEndian = encoding === 2 || content[0] === 254 && content[1] === 255;
    if (content[0] === 254 && content[1] === 255 || content[0] === 255 && content[1] === 254)
      content = content.subarray(2);
    content = Buffer.from(content.subarray(0, content.length - content.length % 2));
    if (bigEndian) content.swap16();
    text = content.toString("utf16le");
  } else return [];
  return text.split("\0").map((value) => value.trim()).filter(Boolean);
}
async function legacyTextValues(filePath) {
  const file = await open(filePath, "r");
  try {
    const header = Buffer.alloc(10);
    if ((await file.read(header, 0, 10, 0)).bytesRead !== 10 || header.toString("ascii", 0, 3) !== "ID3")
      return /* @__PURE__ */ new Map();
    const major = header[3];
    if (major !== 2 && major !== 3) return /* @__PURE__ */ new Map();
    if (major === 2 && header[5] & 64) throw new Error("Compressed ID3v2.2 text is unsupported");
    if (header.subarray(6, 10).some((byte) => byte >= 128)) throw new Error("Invalid ID3 tag size");
    const size = header.subarray(6, 10).reduce((value, byte) => value * 128 + byte, 0);
    if (size > MAX_TAG_BYTES) throw new Error("ID3 tag exceeds text preservation read limit");
    let body = Buffer.alloc(size);
    if ((await file.read(body, 0, size, 10)).bytesRead !== size)
      throw new Error("Incomplete ID3 tag");
    if (header[5] & 128) body = removeUnsynchronization(body);
    let offset = 0;
    if (major === 3 && header[5] & 64) {
      if (body.length < 4) throw new Error("Incomplete ID3 extended header");
      offset = 4 + body.readUInt32BE(0);
    }
    const headerBytes = major === 2 ? 6 : 10;
    const idBytes = major === 2 ? 3 : 4;
    const values = /* @__PURE__ */ new Map();
    while (offset + headerBytes <= body.length) {
      const id = body.toString("ascii", offset, offset + idBytes);
      if (!new RegExp(`^[A-Z0-9]{${idBytes}}$`).test(id)) break;
      const frameSize = major === 2 ? body.readUIntBE(offset + 3, 3) : body.readUInt32BE(offset + 4);
      const flags = major === 3 ? body[offset + 9] : 0;
      const start = offset + headerBytes;
      offset = start + frameSize;
      if (offset > body.length || frameSize === 0) throw new Error("Invalid ID3 frame size");
      if (!(id in TEXT_FIELDS)) continue;
      if (frameSize > MAX_TEXT_BYTES) throw new Error("ID3 text frame exceeds read limit");
      if (flags & 64) throw new Error("Encrypted ID3 text cannot be normalized");
      let text = body.subarray(start, offset);
      const compressed = Boolean(flags & 128);
      if (compressed) {
        if (text.length < 4) throw new Error("Incomplete compressed ID3 text");
        text = text.subarray(4);
      }
      if (flags & 32) text = text.subarray(1);
      if (compressed) text = inflateSync(text, { maxOutputLength: MAX_TEXT_BYTES });
      values.set(id, [...values.get(id) ?? [], ...decodeText(text)]);
    }
    return values;
  } finally {
    await file.close();
  }
}
async function parseAudioMetadata(filePath, options) {
  const metadata = await parseFile(filePath, options);
  decodeId3v23Date(metadata);
  const tagType = ["ID3v2.3", "ID3v2.2"].find((type) => metadata.native[type]);
  if (!tagType) return metadata;
  const tags = metadata.native[tagType];
  const needsOriginalText = Object.keys(TEXT_FIELDS).some(
    (id) => tags.filter((tag) => tag.id === id).length > 1
  );
  if (!needsOriginalText) return decodeId3v23Genres(metadata);
  const original = await legacyTextValues(filePath);
  for (const [id, values] of original) {
    if (!values.some((value) => value.includes("/"))) continue;
    const field = TEXT_FIELDS[id];
    metadata.common[field] = values;
    if (field === "artists") metadata.common.artist = values.join("; ");
    metadata.native[tagType] = metadata.native[tagType].filter((tag) => tag.id !== id);
    metadata.native[tagType].push(...values.map((value) => ({ id, value })));
  }
  return decodeId3v23Genres(metadata);
}

// src/main/shared/normalizeAudioFilePath.ts
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
function normalizeAudioFilePath(filePath) {
  let normalized = resolve(filePath);
  try {
    normalized = realpathSync.native(normalized);
  } catch {
  }
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

// src/main/features/audio/tagAudioBuffer.ts
import { spawn as spawn4 } from "node:child_process";
import { copyFile, mkdtemp as mkdtemp2, readFile, rmdir as rmdir2, stat as stat3, unlink as unlink2 } from "node:fs/promises";
import { extname, join as join2 } from "node:path";
import { tmpdir as tmpdir2 } from "node:os";
import { setTimeout as delay3 } from "node:timers/promises";
import { parseFile as parseFile4 } from "music-metadata";

// src/main/features/audio/softTransition.ts
import { spawn as spawn3 } from "node:child_process";

// src/shared/audio/softTransitionSettings.ts
var SOFT_TRANSITION_MIN_SECONDS = 1;
var SOFT_TRANSITION_MAX_SECONDS = 6;
var SOFT_TRANSITION_STEP_SECONDS = 0.5;
var SOFT_TRANSITION_DEFAULT_SECONDS = 2;
function isSoftTransitionDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= SOFT_TRANSITION_MIN_SECONDS && value <= SOFT_TRANSITION_MAX_SECONDS && Number.isInteger(value / SOFT_TRANSITION_STEP_SECONDS);
}

// src/main/features/audio/softTransition.ts
import { mkdtemp, rmdir, stat as stat2, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay2 } from "node:timers/promises";
import { parseFile as parseFile3 } from "music-metadata";

// src/main/features/audio/digitalSilence.ts
import { spawn as spawn2 } from "node:child_process";
import { stat } from "node:fs/promises";
import { parseFile as parseFile2 } from "music-metadata";

// src/main/features/audio/audioTimestamp.ts
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

// src/main/features/audio/digitalSilence.ts
var DigitalZeroCounter = class {
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
};
function isConsecutiveAlbumPair(left, right) {
  const normalize = (value) => value?.trim().toLocaleLowerCase() || "";
  return Boolean(
    normalize(left.album) && normalize(left.album) === normalize(right.album) && normalize(left.albumartist || left.artist) && normalize(left.albumartist || left.artist) === normalize(right.albumartist || right.artist) && left.disk.no !== null && left.disk.no > 0 && left.disk.no === right.disk.no && left.track.no !== null && left.track.no > 0 && right.track.no === left.track.no + 1
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
var DigitalSilenceAnalyzer = class {
  constructor(executable, mpvExecutable) {
    this.executable = executable;
    this.mpvExecutable = mpvExecutable;
  }
  cache = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  serial = Promise.resolve();
  async boundary(left, right, signal) {
    const [a, b] = await Promise.all([
      parseFile2(left, { skipCovers: true, duration: false }),
      parseFile2(right, { skipCovers: true, duration: false })
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
      const child = spawn2(
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
};

// src/main/features/audio/softTransition.ts
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
    const child = spawn3(
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
var SoftTransitionPreparer = class {
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
      parseFile3(left, { skipCovers: true }),
      parseFile3(right, { skipCovers: true })
    ]);
    if (left === right) return null;
    const rate = a.format.sampleRate;
    const channels = a.format.numberOfChannels;
    if (!rate || !channels || ![1, 2].includes(channels) || rate > 192e3 || rate !== b.format.sampleRate || channels !== b.format.numberOfChannels || !a.format.duration || !b.format.duration || Math.max(a.format.duration, b.format.duration) > 7200)
      return null;
    const windowSeconds = durationSeconds + 0.1;
    const scan = async (path2) => {
      signal.throwIfAborted();
      const before = await stat2(path2);
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
      const after = await stat2(path2);
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
          await delay2(100);
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
};

// src/main/features/audio/tagAudioBuffer.ts
var TAG_BUFFER_SECONDS = 8;
var TAG_BUFFER_MAX_BYTES = 64 * 1024 * 1024;
var TAG_BUFFER_LEAD_SECONDS = 2;
var TAG_PLAYBACK_EXTENSIONS = [".wav", ".flac", ".ogg"];
function tagAudioContinuation(source2, start, duration, rate, origin = 0) {
  return `edl://%${Buffer.byteLength(source2, "utf8")}%${source2},${start + origin + 0.25 / rate},${duration - start}`;
}
async function removeTemporaryFiles(directory, paths) {
  for (const path of paths) {
    for (let attempt = 0; ; attempt++) {
      try {
        await unlink2(path);
        break;
      } catch (error) {
        const code = error.code;
        if (code === "ENOENT") break;
        if (attempt >= 49 || code !== "EBUSY" && code !== "EPERM") throw error;
        await delay3(100);
      }
    }
  }
  await rmdir2(directory).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}
async function createTagAudioSnapshot(source2) {
  const directory = await mkdtemp2(join2(tmpdir2(), "auralis-tag-source-"));
  const path = join2(directory, `source${extname(source2)}`);
  try {
    const before = await stat3(source2);
    await copyFile(source2, path);
    const after = await stat3(source2);
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
    const child = spawn4(executable, args, {
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
  const metadata = await parseFile4(source2, { skipCovers: true });
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
  const directory = await mkdtemp2(join2(tmpdir2(), "auralis-tag-buffer-"));
  const raw = join2(directory, "buffer.pcm");
  const path = join2(directory, "buffer.wav");
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
    const bytes = (await stat3(raw)).size;
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
    await unlink2(raw);
    return { path, start, end, rate, origin, frames: endFrame - startFrame, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

// src/main/features/audio/bufferedTagPlaybackState.ts
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
  const entered = new Promise((yes, no) => {
    enter = yes;
    reject = no;
  });
  void entered.catch(() => void 0);
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
    entered,
    enter,
    reject,
    resumed,
    resume,
    resumeFailed: false
  };
}
function isCurrentTagWrite({ state, runtime }, { window, client, session, signal }) {
  return !signal.aborted && runtime.isCurrent(session, client) && state.tagWindow === window;
}
function assertCurrentTagWrite(context, attempt) {
  if (!isCurrentTagWrite(context, attempt)) throw new Error("Tag playback changed");
}

// src/main/features/audio/bufferedTagPlaybackTransaction.ts
import { stat as stat5 } from "node:fs/promises";

// src/main/features/metadata/audioTagWriteService.ts
import { spawn as spawn5 } from "node:child_process";
import { copyFile as copyFile2, link, rename, rm, unlink as unlink3, writeFile as writeFile2, stat as stat4 } from "node:fs/promises";
import { basename, extname as extname2, join as join4 } from "node:path";
import { tmpdir as tmpdir3 } from "node:os";
import { randomUUID as randomUUID2 } from "node:crypto";
import { parseFile as parseFile5 } from "music-metadata";

// src/shared/utils/lrcTiming.ts
var LRC_TIMESTAMP_SOURCE = String.raw`\[(\d+):([0-5]\d)(?:[.:](\d{1,3}))?\]`;

// src/main/features/metadata/classifyLyrics.ts
var LRC_TIMESTAMP = new RegExp(LRC_TIMESTAMP_SOURCE);
var TTML_ROOT = /<(?:[\w.-]+:)?tt(?=[\s>])/u;
function isTtmlLike(text) {
  return TTML_ROOT.test(text);
}
function classifyLyrics(text) {
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized || isTtmlLike(normalized)) return null;
  return { text: normalized, format: LRC_TIMESTAMP.test(normalized) ? "lrc" : "plain" };
}

// src/main/features/metadata/metadataNormalizer.ts
function resolveFileDate(metadata) {
  const parse = (value) => {
    try {
      return normalizeReleaseDate(value ?? null);
    } catch {
      return null;
    }
  };
  const date = parse(metadata.common.date);
  if (date) return date;
  const tags = metadata.native["ID3v2.3"] ?? [];
  const year = tags.find((tag) => tag.id === "TYER" && typeof tag.value === "string")?.value;
  if (typeof year === "string") {
    const parsed = parse(year);
    const matchesYear = metadata.common.year === void 0 || parsed !== null && metadata.common.year === releaseDateYear(parsed);
    if (parsed && parsed.length > 4 && matchesYear) return parsed;
    const dayMonth = tags.find((tag) => tag.id === "TDAT" && typeof tag.value === "string")?.value;
    if (parsed && parsed.length === 4 && matchesYear && typeof dayMonth === "string" && /^\d{4}$/.test(dayMonth.trim())) {
      const value = dayMonth.trim();
      const complete = parse(`${parsed}-${value.slice(2)}-${value.slice(0, 2)}`);
      if (complete) return complete;
    }
  }
  const commonYear = metadata.common.year;
  if (typeof commonYear === "number" && Number.isInteger(commonYear) && commonYear >= 0 && commonYear <= 9999)
    return String(commonYear).padStart(4, "0");
  return typeof year === "string" ? parse(year) : null;
}
function normalizeArtists(artists, artist) {
  const values = cleanDelimitedValues(artists ?? []);
  return values.length > 0 ? values : cleanDelimitedValues([artist]);
}
var NATIVE_LYRICS_KEYS = /* @__PURE__ */ new Set(["USLT", "SYLT", "LYR", "LYRI", "LYRICS", "UNSYNCEDLYRICS"]);
var NATIVE_GENRE_KEYS = /* @__PURE__ */ new Set(["GEN", "GNRE", "GENRE", "TCON", "TCO", "STYLE"]);
var NATIVE_ARTIST_KEYS = /* @__PURE__ */ new Set(["ARTIST", "ART", "TPE1", "TP1", "IART", "AUTHOR", "AUTH"]);
var NATIVE_ALBUM_ARTIST_KEYS = /* @__PURE__ */ new Set(["ALBUMARTIST", "AART", "TPE2", "TP2", "BAND"]);
function getTextValuesFromUnknown(value) {
  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(getTextValuesFromUnknown);
  }
  if (value && typeof value === "object" && "text" in value) {
    const text = value.text;
    return getTextValuesFromUnknown(text);
  }
  return [];
}
function getNativeTagGroups(metadata) {
  const native = metadata.native;
  if (!native || typeof native !== "object") {
    return [];
  }
  if ("values" in native && typeof native.values === "function") {
    return Array.from(native.values()).filter(Array.isArray);
  }
  return Object.values(native).filter(Array.isArray);
}
function isNativeLyricsTag(id) {
  const normalized = id.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return NATIVE_LYRICS_KEYS.has(normalized) || normalized.endsWith("LYRICS");
}
function isNativeGenreTag(id) {
  return NATIVE_GENRE_KEYS.has(nativeTextKey(id));
}
function nativeTextKey(id) {
  return (id.split(":").at(-1) ?? id).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
function nativeTextValues(metadata, keys) {
  return cleanDelimitedValues(
    getNativeTagGroups(metadata).flatMap(
      (tags) => tags.flatMap((tag) => {
        const freeform = /^----:([^:]+):(.+)$/.exec(tag.id);
        if (freeform && (keys.has("ARTISTS") || keys.has("ALBUMARTISTS")) && freeform[1].toLowerCase() !== "com.apple.itunes")
          return [];
        return keys.has(nativeTextKey(tag.id)) ? getTextValuesFromUnknown(tag.value) : [];
      })
    )
  );
}
function resolveArtists(metadata) {
  const plural = nativeTextValues(metadata, /* @__PURE__ */ new Set(["ARTISTS"]));
  if (plural.length > 0) return plural;
  const common = normalizeArtists(metadata.common.artists);
  if (common.length > 0) return common;
  const native = nativeTextValues(metadata, NATIVE_ARTIST_KEYS);
  return native.length > 0 ? native : normalizeArtists(void 0, metadata.common.artist);
}
function resolveAlbumArtists(metadata) {
  const plural = nativeTextValues(metadata, /* @__PURE__ */ new Set(["ALBUMARTISTS"]));
  if (plural.length > 0) return plural;
  const common = normalizeArtists(metadata.common.albumartists);
  if (common.length > 0) return common;
  const native = nativeTextValues(metadata, NATIVE_ALBUM_ARTIST_KEYS);
  if (native.length > 0) return native;
  return normalizeArtists(void 0, metadata.common.albumartist);
}
function lyricCandidates(metadata, preserveText = false) {
  const nativeCandidates = [];
  for (const tags of getNativeTagGroups(metadata)) {
    for (const tag of tags) {
      if (!isNativeLyricsTag(tag.id)) continue;
      nativeCandidates.push(...getTextValuesFromUnknown(tag.value));
    }
  }
  const commonCandidates = getTextValuesFromUnknown(metadata.common.lyrics);
  return preserveText ? [...nativeCandidates, ...commonCandidates] : [...commonCandidates, ...nativeCandidates];
}
function hasEmbeddedTtml(metadata) {
  if (getTextValuesFromUnknown(metadata.common.lyrics).some(isTtmlLike)) return true;
  return getNativeTagGroups(metadata).some(
    (tags) => tags.some((tag) => {
      const id = tag.id.replace(/[^a-zA-Z]/g, "").toUpperCase();
      const lyricTag = isNativeLyricsTag(tag.id) || id.includes("USLT") || id.includes("SYLT") || id === "ULT";
      return lyricTag && getTextValuesFromUnknown(tag.value).some(isTtmlLike);
    })
  );
}
function resolveLyrics(metadata, preserveText = false) {
  const candidates = lyricCandidates(metadata, preserveText);
  const resolved = [...new Set(candidates)].flatMap((candidate) => {
    const lyrics = classifyLyrics(candidate);
    return lyrics ? [{ ...lyrics, text: preserveText ? candidate : lyrics.text }] : [];
  });
  return resolved.find((lyrics) => lyrics.format === "lrc") ?? resolved[0] ?? null;
}
function resolveGenres(metadata) {
  const candidates = [...metadata.common.genre ?? []];
  for (const tags of getNativeTagGroups(metadata)) {
    for (const tag of tags) {
      if (!isNativeGenreTag(tag.id)) continue;
      candidates.push(...getTextValuesFromUnknown(tag.value));
    }
  }
  return cleanDelimitedValues(candidates);
}

// src/main/features/metadata/metadataSaveError.ts
var MetadataSaveError = class extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
    this.name = "MetadataSaveError";
  }
};
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

// src/main/features/metadata/verifyWrittenMetadata.ts
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

// src/main/features/metadata/verifyPreservedAudioTags.ts
import { isDeepStrictEqual } from "node:util";
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
    for (const field of editedFields) for (const key of commonGroups[field]) edited.add(key);
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
    "\xA9nam",
    "\xA9art",
    "aart",
    "\xA9alb",
    "\xA9gen",
    "gnre",
    // This freeform MP4 field is part of the editable genre list, whose final
    // value is checked by verifyWrittenMetadata rather than preserved verbatim.
    "----:com.apple.itunes:genre",
    "\xA9day",
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
    "\xA9too"
  ]);
  if (lyricsOnly) {
    editedNative.clear();
    for (const id of ["uslt", "ult", "lyrics", "unsyncedlyrics", "\xA9lyr"]) editedNative.add(id);
  }
  if (editedFields && !lyricsOnly) {
    const nativeGroups = {
      title: ["title", "tit2", "tt2", "\xA9nam", "inam"],
      artistDisplay: ["artist", "artists", "tpe1", "tp1", "\xA9art", "iart"],
      albumTitle: ["album", "talb", "tal", "\xA9alb", "iprd"],
      albumArtistDisplay: [
        "album_artist",
        "albumartist",
        "tpe2",
        "tp2",
        "aart",
        "txxx:album_artist"
      ],
      genreDisplay: ["genre", "tcon", "tco", "\xA9gen", "gnre", "ignr", "----:com.apple.itunes:genre"],
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
        "\xA9day",
        "icrd"
      ]
    };
    for (const field of Object.keys(nativeGroups))
      if (!editedFields.includes(field))
        for (const id of nativeGroups[field]) editedNative.delete(id);
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

// src/main/features/metadata/m4aTagWriter.ts
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
var workerSource = `
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
  const changed = (field) => !metadata.editedFields || metadata.editedFields.includes(field);
  const patch = (id, actual, requested) => {
    const field = {
      "\xA9nam": "title",
      "\xA9ART": "artistDisplay",
      "\xA9alb": "albumTitle",
      aART: "albumArtistDisplay",
      "\xA9day": "releaseDate"
    }[id];
    if (field && !changed(field)) return;
    if (JSON.stringify(actual) !== JSON.stringify(requested)) fields.push([id, requested]);
  };
  patch("\xA9nam", textValues(before.common.title), textValues(metadata.title));
  const artists = splitDelimitedValues(metadata.artistDisplay);
  const albumArtists = splitDelimitedValues(metadata.albumArtistDisplay);
  const artistsChanged = changed("artistDisplay") && JSON.stringify(resolveArtists(before)) !== JSON.stringify(artists);
  const albumArtistsChanged = changed("albumArtistDisplay") && JSON.stringify(resolveAlbumArtists(before)) !== JSON.stringify(albumArtists);
  patch("\xA9ART", resolveArtists(before), artists);
  patch("\xA9alb", textValues(before.common.album), textValues(metadata.albumTitle));
  patch("aART", resolveAlbumArtists(before), albumArtists);
  patch(
    "\xA9day",
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
    fields.push(["\xA9gen", genres], ["gnre", []]);
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

// src/main/features/metadata/windowsM4aPublication.ts
import { existsSync } from "node:fs";
import { dirname, join as join3 } from "node:path";
import { execFile } from "node:child_process";
function m4aPublicationHelper(ffmpegPath) {
  return join3(dirname(ffmpegPath), "auralis-file-replace.exe");
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

// src/main/features/metadata/windowsAudioSourceLock.ts
import { execFile as execFile2 } from "node:child_process";
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
    const child = execFile2(
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

// src/main/features/metadata/lyricsTagWriter.ts
import { createRequire as createRequire2 } from "node:module";
import { Worker as Worker2 } from "node:worker_threads";
var LYRICS_TAG_EXTENSIONS = /* @__PURE__ */ new Set([".mp3", ".flac", ".m4a", ".ogg", ".opus"]);
var source = `
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
    const worker = new Worker2(source, {
      eval: true,
      workerData: {
        modulePath: createRequire2(import.meta.url).resolve("node-taglib-sharp"),
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

// src/main/logging/logger.ts
import pino from "pino";

// src/main/logging/diagnosticError.ts
var MAX_NAME_LENGTH = 120;
var MAX_CODE_LENGTH = 120;
var MAX_MESSAGE_LENGTH = 1024;
var MAX_STACK_LENGTH = 6e3;
var WINDOWS_PATH_PATTERN = /(?:file:\/{3})?[a-z]:[\\/][^)\]}>,;"'\r\n]+/gi;
var UNC_PATH_PATTERN = /\\\\[^\\/\r\n]+[\\/][^)\]}>,;"'\r\n]+/g;
var COMMON_POSIX_PATH_PATTERN = /(?:file:\/{2})?\/(?:Users|home|private|tmp|var|opt|workspace)\/[^)\]}>,;"'\r\n]+/g;
var URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s)\]}>,;"']+/gi;
function truncate(value, maximumLength) {
  if (value.length <= maximumLength) return value;
  return `${value.slice(0, maximumLength - 1)}\u2026`;
}
function sanitizeDiagnosticText(value, maximumLength) {
  const sanitized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(URL_PATTERN, "<redacted-url>").replace(WINDOWS_PATH_PATTERN, "<redacted-path>").replace(UNC_PATH_PATTERN, "<redacted-path>").replace(COMMON_POSIX_PATH_PATTERN, "<redacted-path>");
  return truncate(sanitized, maximumLength);
}
function readStringProperty(value, key, maximumLength) {
  try {
    const property = Reflect.get(value, key);
    if (typeof property === "string" && property.length > 0) {
      return sanitizeDiagnosticText(property, maximumLength);
    }
    if (typeof property === "number" || typeof property === "bigint") {
      return truncate(String(property), maximumLength);
    }
  } catch {
  }
  return void 0;
}
function normalizeDiagnosticError(value) {
  if (typeof value === "string") {
    return {
      name: "Error",
      message: sanitizeDiagnosticText(value, MAX_MESSAGE_LENGTH)
    };
  }
  if (value === null || value === void 0) {
    return {
      name: "Error",
      message: String(value)
    };
  }
  if (typeof value !== "object" && typeof value !== "function") {
    return {
      name: "Error",
      message: truncate(String(value), MAX_MESSAGE_LENGTH)
    };
  }
  const name = readStringProperty(value, "name", MAX_NAME_LENGTH) ?? "Error";
  const message = readStringProperty(value, "message", MAX_MESSAGE_LENGTH) ?? "Unknown object rejection";
  const code = readStringProperty(value, "code", MAX_CODE_LENGTH);
  const stack = readStringProperty(value, "stack", MAX_STACK_LENGTH);
  return {
    name,
    message,
    ...code ? { code } : {},
    ...stack ? { stack } : {}
  };
}

// src/main/logging/logSanitizer.ts
var MAX_LOG_STRING_LENGTH = 8192;
var MAX_COLLECTION_ITEMS = 128;
var MAX_OBJECT_DEPTH = 12;
var REDACTED_VALUE = "<redacted>";
var sensitiveKeyPattern = /(?:^|[_-])(authorization|cookie|credential|password|passwd|secret|session|token|api[_-]?key)(?:$|[_-])/i;
function isSensitiveKey(key) {
  const compactKey = key.replace(/[_-]/g, "").toLowerCase();
  return sensitiveKeyPattern.test(key) || /^(authorization|cookie|credentials?|password|passwd|secret|sessionid)$/.test(compactKey) || compactKey.endsWith("token") || compactKey.endsWith("apikey");
}
function sanitizeInternal(value, depth, seen) {
  if (typeof value === "string") {
    return sanitizeDiagnosticText(value, MAX_LOG_STRING_LENGTH);
  }
  if (value === null || value === void 0 || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value === "symbol" || typeof value === "function") return void 0;
  if (value instanceof Error) return normalizeDiagnosticError(value);
  if (depth >= MAX_OBJECT_DEPTH) return "<truncated-depth>";
  if (seen.has(value)) return "<circular>";
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_COLLECTION_ITEMS).map((item) => sanitizeInternal(item, depth + 1, seen));
      if (value.length > MAX_COLLECTION_ITEMS) items.push("<truncated-items>");
      return items;
    }
    const output = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entries = Object.entries(descriptors).slice(0, MAX_COLLECTION_ITEMS);
    for (const [key, descriptor] of entries) {
      if (!("value" in descriptor)) continue;
      output[key] = isSensitiveKey(key) ? REDACTED_VALUE : sanitizeInternal(descriptor.value, depth + 1, seen);
    }
    if (Object.keys(descriptors).length > MAX_COLLECTION_ITEMS) {
      output.truncatedFields = true;
    }
    return output;
  } catch {
    return "<unavailable>";
  } finally {
    seen.delete(value);
  }
}
function sanitizeLogValue(value) {
  return sanitizeInternal(value, 0, /* @__PURE__ */ new WeakSet());
}

// src/main/logging/logger.ts
var SUPPORTED_LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"];
var isDevelopment = process.env.NODE_ENV !== "production";
function isSupportedLogLevel(value) {
  return SUPPORTED_LOG_LEVELS.includes(value);
}
function resolveLogLevel(development, configuredLevel = process.env.AURALIS_LOG_LEVEL) {
  const defaultLevel = development ? "debug" : "info";
  return configuredLevel && isSupportedLogLevel(configuredLevel) ? configuredLevel : defaultLevel;
}
function createLogger(destination, development = isDevelopment) {
  return pino(
    {
      level: resolveLogLevel(development),
      hooks: {
        logMethod(args, method) {
          method.apply(this, args.map(sanitizeLogValue));
        }
      }
    },
    destination
  );
}
var logger = createLogger(void 0, isDevelopment);

// src/shared/utils/trackFileFingerprint.ts
function hasSameScanFileFingerprint(file, expected) {
  return file.size === expected.size && file.mtimeMs === expected.mtimeMs && file.ctimeMs === expected.ctimeMs && file.dev === expected.dev && file.ino === expected.ino;
}

// src/main/features/metadata/audioTagWriteService.ts
var FFMPEG_NOT_FOUND_MESSAGE = "Unable to write audio tags because the bundled FFmpeg runtime is unavailable.";
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
  return fields.filter(([field]) => !metadata.editedFields || metadata.editedFields.includes(field)).flatMap(([, value]) => [flag, value]);
}
function resolveCoverFileExtension(mimeType) {
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  return ".jpg";
}
async function readEmbeddedPicture(filePath) {
  try {
    const metadata = await parseFile5(filePath, { skipCovers: false });
    const picture = metadata.common.picture?.[0];
    if (!picture?.data || picture.data.length === 0) return null;
    return { data: Buffer.from(picture.data), mimeType: picture.format || "image/jpeg" };
  } catch {
    return null;
  }
}
async function runFfmpegProcess(ffmpegPath, arguments_) {
  await new Promise((resolve2, reject) => {
    const process2 = spawn5(ffmpegPath, arguments_, {
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
      [".ogg", ".opus"].includes(extname2(inputPath).toLowerCase()) ? "-metadata:s:a:0" : "-metadata"
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
  const operationId = randomUUID2();
  const backupPath = `${originalPath}.auralis-backup-${operationId}`;
  const probePath = `${stagingPath}.probe`;
  let probeOwned = false;
  let source2 = null;
  try {
    await link(stagingPath, probePath);
    probeOwned = true;
    await unlink3(probePath);
    probeOwned = false;
    if (!sameFileIdentity(await stat4(originalPath, { bigint: true }), expected)) {
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
      const backup = await stat4(backupPath, { bigint: true });
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
  const extension = extname2(filePath);
  if (!extension) {
    throw new Error(`Unable to determine the audio format for ${basename(filePath)}.`);
  }
  if (metadata.lyricsText === void 0 && (!metadata.editedFields || metadata.editedFields.includes("releaseDate")) && extension.toLowerCase() === ".mp3" && metadata.releaseDate?.length === 7)
    throw new MetadataSaveError(
      "unsupported-date-precision",
      "ID3v2.3 cannot preserve month-precision dates"
    );
  const nativePublication = extension.toLowerCase() === ".m4a" && hasM4aPublicationHelper(ffmpegPath);
  const originalIdentity = await stat4(filePath, { bigint: true });
  if (metadata.expectedFingerprint && !hasSameScanFileFingerprint(await stat4(filePath), metadata.expectedFingerprint))
    throw new MetadataSaveError("metadata-conflict", "Audio file changed since the editor opened");
  const assertUnchanged = async () => {
    if (!sameFileIdentity(await stat4(filePath, { bigint: true }), originalIdentity))
      throw new MetadataSaveError(
        "file-changed",
        "Audio file changed during tag writing; original was not replaced"
      );
  };
  let outputPath = null;
  let coveredPath = null;
  let coverPath = null;
  const stagingPath = `${filePath}.auralis-replacement-${randomUUID2()}`;
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
      await copyFile2(filePath, stagingPath);
      await writeLyricsStagingTag(stagingPath, extension.toLowerCase(), metadata.lyricsText);
    } else if (extension.toLowerCase() === ".m4a") {
      await copyFile2(filePath, stagingPath);
      await writeM4aStagingTags(stagingPath, metadata);
    } else {
      outputPath = join4(tmpdir3(), `auralis-tag-edit-${randomUUID2()}${extension}`);
      coveredPath = join4(tmpdir3(), `auralis-tag-cover-${randomUUID2()}${extension}`);
      const picture = await readEmbeddedPicture(filePath);
      await remuxWithTags(filePath, outputPath, metadata, ffmpegPath);
      let taggedPath = outputPath;
      const preservedPicture = picture ? await readEmbeddedPicture(outputPath) : null;
      if (picture && !preservedPicture?.data.equals(picture.data)) {
        coverPath = join4(
          tmpdir3(),
          `auralis-tag-cover-${randomUUID2()}${resolveCoverFileExtension(picture.mimeType)}`
        );
        await writeFile2(coverPath, picture.data);
        try {
          await remuxWithCover(outputPath, coverPath, coveredPath, metadata, ffmpegPath);
          taggedPath = coveredPath;
        } catch (error) {
          const actual = await readEmbeddedPicture(outputPath);
          if (!actual || !actual.data.equals(picture.data)) throw error;
        }
      }
      await copyFile2(taggedPath, stagingPath);
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

// src/main/features/audio/bufferedTagPlaybackBridge.ts
async function installTagPlaybackBuffer(context, write) {
  const { state, options, runtime, read } = context;
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
    const installed = await runtime.enqueue(async () => {
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
  const { options, runtime, read } = context;
  const { window, client, signal } = attempt;
  const current = () => isCurrentTagWrite(context, attempt);
  const check = () => assertCurrentTagWrite(context, attempt);
  const heldLeaseId = runtime.currentLeaseId;
  if (!heldLeaseId) {
    const lease = await options.coordinator.acquireReadLease(filePath, "mpv-current", signal);
    if (!current()) {
      options.coordinator.releaseReadLease(lease.leaseId);
      check();
    }
    runtime.holdCurrentLease(lease.leaseId);
  } else if (!current()) {
    options.coordinator.releaseReadLease(heldLeaseId);
    runtime.holdCurrentLease(null);
    check();
  }
  await runtime.enqueue(async () => {
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
      new Promise((_, fail) => {
        if (signal.aborted) fail(new Error("Tag playback changed"));
        else {
          failOnAbort = () => fail(new Error("Tag playback changed"));
          signal.addEventListener("abort", failOnAbort, { once: true });
        }
      })
    ]);
  } finally {
    clearTimeout(timeout);
    if (failOnAbort) signal.removeEventListener("abort", failOnAbort);
  }
}

// src/main/features/audio/bufferedTagPlaybackTransaction.ts
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
  const { state, options, runtime, read, scheduling } = context;
  const coordinator = options.coordinator;
  const intent = coordinator?.reserveWriteIntent?.(filePath);
  if (!intent) return { ok: false, reason: "playback-in-use" };
  const client = runtime.client;
  const session = runtime.id;
  const window = createTagPlaybackWindow();
  const signal = AbortSignal.any([window.abort.signal, runtime.signal]);
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
    await runtime.enqueue(async () => {
      check();
      await scheduling.cancelNext(client);
    });
    scheduling.deferPrevious(nextRequest);
    await scheduling.drainAnalysis();
    check();
    const original = await stat5(filePath);
    window.source = await createTagAudioSnapshot(state.tagFallback?.path ?? read().path);
    state.tagFiles.add(window.source);
    prepared = await prepareAudioTagWrite(filePath, metadata, options.ffmpegPath);
    check();
    const actual = await stat5(filePath);
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
    runtime.releaseCurrentLease();
    coordinator.promoteWriteIntent(intent);
    reason = "file-in-use";
    await commitAndReconcile(async () => {
      check();
      await prepared.commit(check);
      committed = true;
    });
    retainCommittedPlaybackLease({
      current,
      currentLeaseId: () => runtime.currentLeaseId,
      coordinator,
      intent,
      hold: (leaseId) => runtime.holdCurrentLease(leaseId)
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
  const { state, options, runtime, read, scheduling } = context;
  options.coordinator.releaseWriteLease(intent);
  resumeReaders?.();
  if (prepared) await prepared.dispose().catch(options.warn);
  if (session === runtime.id && client === runtime.client && state.tagWindow === window) {
    if (window.phase === "queued" && window.loading && window.source) {
      await runtime.enqueue(async () => {
        if (client !== runtime.client || session !== runtime.id || state.tagWindow !== window)
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
      await runtime.enqueue(async () => {
        if (client !== runtime.client || session !== runtime.id) return;
        await client.command("playlist-clear");
        await client.command("set_property", "file-local-options/end", "none");
      }).catch(options.warn);
      state.tagWindow = null;
      scheduling.restoreDeferredNext();
    } else if (window.phase === "resume" && !window.loading)
      finishTagPlaybackWindow(context, window);
  }
  if (session === runtime.id && client === runtime.client) {
    if (!runtime.currentLeaseId && read().loaded) {
      const lease = await options.coordinator.acquireReadLease(filePath, "mpv-current", runtime.signal).catch(() => null);
      if (lease && session === runtime.id && client === runtime.client)
        runtime.holdCurrentLease(lease.leaseId);
      else if (lease) options.coordinator.releaseReadLease(lease.leaseId);
    }
    options.coordinator.refreshPlaybackCapability?.(filePath);
  }
  if (client !== runtime.client || session !== runtime.id) {
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

// src/main/features/audio/bufferedTagPlayback.ts
var BufferedTagPlayback = class {
  constructor(options, runtime, read, scheduling, loaded, failure) {
    this.options = options;
    this.runtime = runtime;
    this.read = read;
    this.scheduling = scheduling;
    this.loaded = loaded;
    this.failure = failure;
    this.context = { state: this.state, options, runtime, read, scheduling };
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
    return this.read().loaded && this.state.tagAudioEligible && this.scheduling.canBeginTagWrite() && !this.state.tagWindow && normalizeAudioFilePath(filePath) === normalizeAudioFilePath(this.read().path) && TAG_PLAYBACK_EXTENSIONS.includes(extname3(filePath).toLowerCase());
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
};

// src/main/features/audio/softTransitionContinuation.ts
var FILTER_LABEL = "auralis-soft-transition";
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

// src/main/features/audio/nativeBoundaryUpdate.ts
var BOUNDARY_UPDATE_MARGIN_SECONDS = 2;
var NativeBoundaryUpdater = class {
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
};

// src/main/features/audio/liveSilence.ts
import { spawn as spawn6 } from "node:child_process";
import { stat as stat6 } from "node:fs/promises";
var LIVE_SILENCE_DB = -60;
var LIVE_SILENCE_MINIMUM_SECONDS = 1;
var LiveSilenceEdges = class {
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
};
var LiveSilenceAnalyzer = class {
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
    const before = await stat6(path);
    signal.throwIfAborted();
    const key = `${path}\0${before.size}\0${before.mtimeMs}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const work = this.serial.then(async () => {
      signal.throwIfAborted();
      const existing = this.cache.get(key);
      if (existing) return existing;
      const result = await this.decode(path, rate, channels, signal);
      const after = await stat6(path);
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
      const child = spawn6(
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
};

// src/main/features/audio/nativeNextTrackScheduler.ts
var NativeNextTrackScheduler = class {
  constructor(options, runtime, read, tag, onRecoverySettled) {
    this.options = options;
    this.runtime = runtime;
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
};

// src/main/features/audio/nativePlaybackSession.ts
var NativePlaybackSession = class {
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
};

// src/main/features/audio/m4aFileReplacement.ts
import { extname as extname4 } from "node:path";
function canReplacePlayingM4a(filePath, ffmpegPath) {
  return extname4(filePath).toLowerCase() === ".m4a" && hasM4aPublicationHelper(ffmpegPath);
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

// src/main/features/audio/nativePlaybackService.ts
var NativePlaybackService = class {
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
};
export {
  NativePlaybackService
};
