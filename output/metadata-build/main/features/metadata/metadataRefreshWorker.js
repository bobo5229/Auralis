import { workerData, parentPort } from "node:worker_threads";
import { r as readStableMetadata } from "../../chunks/readStableMetadata-Bn1i4569.js";
import { c as getLyricsSidecarFingerprint } from "../../chunks/resolveLyricsForFile-COlnUOK3.js";
import "node:fs/promises";
import "../../chunks/delimitedValues-CpE_2YHT.js";
import "node:fs";
import "node:path";
import "sharp";
import "pino";
import "../../chunks/logSanitizer-BxKsoqIP.js";
import "node:crypto";
import "node:zlib";
import "tty";
import "util";
import "os";
const input = workerData;
let processed = 0;
let failed = 0;
function postMessage(message) {
  parentPort?.postMessage(message);
}
async function run() {
  for (const track of input.tracks) {
    try {
      const before = input.writeMode === "legacy-ttml" ? await getLyricsSidecarFingerprint(track.filePath) : void 0;
      const result = await readStableMetadata(track.trackId, track.filePath, input.artworkCacheDir);
      if (before !== void 0 && before !== await getLyricsSidecarFingerprint(track.filePath))
        throw new Error("Lyrics sidecar changed while being read");
      postMessage({
        type: "result",
        payload: {
          ...result,
          lyricsSidecarFingerprint: before,
          jobId: input.jobId,
          generation: track.generation ?? 0
        }
      });
      processed++;
    } catch (error) {
      failed++;
      postMessage({
        type: "failure",
        payload: {
          jobId: input.jobId,
          trackId: track.trackId,
          filePath: track.filePath,
          reason: error instanceof Error ? error.message : "Unable to parse metadata"
        }
      });
    }
    postMessage({ type: "progress", payload: { jobId: input.jobId, processed, failed } });
  }
  postMessage({ type: "complete" });
}
run().catch((error) => {
  postMessage({
    type: "fatal",
    payload: {
      jobId: input.jobId,
      reason: error instanceof Error ? error.message : "Metadata refresh worker failed"
    }
  });
});
