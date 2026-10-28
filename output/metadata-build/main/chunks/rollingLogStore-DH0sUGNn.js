import { readdirSync, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, rm, rename } from "node:fs/promises";
import { once } from "node:events";
import { join } from "node:path";
import { s as sanitizeSerializedLogLine } from "./logSanitizer-BxKsoqIP.js";
const DEFAULT_LOG_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_LOG_FILE_COUNT = 4;
const CURRENT_LOG_FILE_NAME = "auralis.log";
const managedLogPattern = /^auralis(?:\.([1-9]\d*))?\.log$/;
function isManagedLogFileName(fileName) {
  return managedLogPattern.test(fileName);
}
function listManagedLogFileNames(logsDirectory) {
  try {
    return readdirSync(logsDirectory).filter(isManagedLogFileName).sort((left, right) => {
      if (left === CURRENT_LOG_FILE_NAME) return -1;
      if (right === CURRENT_LOG_FILE_NAME) return 1;
      const leftIndex = Number(managedLogPattern.exec(left)?.[1] ?? 0);
      const rightIndex = Number(managedLogPattern.exec(right)?.[1] ?? 0);
      return leftIndex - rightIndex;
    });
  } catch {
    return [];
  }
}
class RollingLogStore {
  constructor(logsDirectory, options = {}) {
    this.logsDirectory = logsDirectory;
    this.maximumFileBytes = Math.max(1024, options.maximumFileBytes ?? DEFAULT_LOG_FILE_BYTES);
    this.maximumFileCount = Math.max(1, options.maximumFileCount ?? DEFAULT_LOG_FILE_COUNT);
    this.currentPath = join(logsDirectory, CURRENT_LOG_FILE_NAME);
    this.pending = this.initialize();
  }
  maximumFileBytes;
  maximumFileCount;
  currentPath;
  currentBytes = 0;
  closed = false;
  writable = true;
  stream;
  pending;
  async initialize() {
    try {
      await mkdir(this.logsDirectory, { recursive: true });
      for (const fileName of (await readdir(this.logsDirectory)).filter(isManagedLogFileName)) {
        const match = managedLogPattern.exec(fileName);
        const archiveIndex = Number(match?.[1] ?? 0);
        const filePath = join(this.logsDirectory, fileName);
        if (archiveIndex >= this.maximumFileCount || (await stat(filePath)).size > this.maximumFileBytes) {
          await rm(filePath, { force: true });
        }
      }
      this.currentBytes = await stat(this.currentPath).then(
        (entry) => entry.size,
        () => 0
      );
    } catch {
      this.writable = false;
      this.currentBytes = 0;
    }
  }
  async closeStream() {
    const stream = this.stream;
    this.stream = void 0;
    if (!stream || stream.closed) return;
    const closing = once(stream, "close");
    stream.end();
    await closing;
  }
  async rotate() {
    await this.closeStream();
    const oldestPath = join(this.logsDirectory, `auralis.${this.maximumFileCount - 1}.log`);
    if (this.maximumFileCount > 1) await rm(oldestPath, { force: true });
    for (let index = this.maximumFileCount - 2; index >= 1; index -= 1) {
      const source = join(this.logsDirectory, `auralis.${index}.log`);
      await this.renameIfPresent(source, join(this.logsDirectory, `auralis.${index + 1}.log`));
    }
    if (this.maximumFileCount > 1)
      await this.renameIfPresent(this.currentPath, join(this.logsDirectory, "auralis.1.log"));
    else await rm(this.currentPath, { force: true });
    this.currentBytes = 0;
  }
  async renameIfPresent(source, destination) {
    try {
      await rename(source, destination);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  write(serializedLine) {
    if (this.closed) return this.pending;
    this.pending = this.pending.then(() => this.append(serializedLine));
    return this.pending;
  }
  async append(serializedLine) {
    if (!this.writable) return;
    try {
      let safeLine = sanitizeSerializedLogLine(serializedLine);
      if (!safeLine.endsWith("\n")) safeLine += "\n";
      let bytes = Buffer.byteLength(safeLine, "utf8");
      if (bytes > this.maximumFileBytes) {
        safeLine = `${JSON.stringify({
          level: 40,
          time: Date.now(),
          msg: "Oversized log entry omitted"
        })}
`;
        bytes = Buffer.byteLength(safeLine, "utf8");
      }
      if (this.currentBytes > 0 && this.currentBytes + bytes > this.maximumFileBytes) {
        await this.rotate();
      }
      if (!this.stream) {
        const stream2 = createWriteStream(this.currentPath, { flags: "a", encoding: "utf8" });
        this.stream = stream2;
        stream2.on("error", () => {
          this.writable = false;
        });
        await once(stream2, "open");
      }
      const stream = this.stream;
      await new Promise((resolve, reject) => {
        stream.write(safeLine, (error) => error ? reject(error) : resolve());
      });
      this.currentBytes += bytes;
    } catch {
      this.writable = false;
      this.stream?.destroy();
    }
  }
  close() {
    this.closed = true;
    this.pending = this.pending.then(() => this.closeStream()).catch(() => {
      this.stream?.destroy();
      this.stream = void 0;
    });
    return this.pending;
  }
}
export {
  DEFAULT_LOG_FILE_COUNT as D,
  RollingLogStore as R,
  DEFAULT_LOG_FILE_BYTES as a,
  listManagedLogFileNames as l
};
