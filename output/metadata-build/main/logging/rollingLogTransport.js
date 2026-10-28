import { Writable } from "node:stream";
import { R as RollingLogStore } from "../chunks/rollingLogStore-DH0sUGNn.js";
import "node:fs";
import "node:fs/promises";
import "node:events";
import "node:path";
import "../chunks/logSanitizer-BxKsoqIP.js";
function createRollingLogTransport(options) {
  const store = new RollingLogStore(options.logsDirectory, options);
  let remainder = "";
  return new Writable({
    // ThreadStream waits for drain, so flush/exit also wait for the file writes.
    highWaterMark: 1,
    decodeStrings: false,
    write(chunk, _encoding, done) {
      const lines = (remainder + chunk).split("\n");
      remainder = lines.pop() ?? "";
      void (async () => {
        for (const line of lines) if (line) await store.write(line);
      })().then(() => done(), done);
    },
    final(done) {
      void (async () => {
        if (remainder) await store.write(remainder);
        await store.close();
      })().then(() => done(), done);
    },
    destroy(_error, done) {
      void store.close().then(() => done(), done);
    }
  });
}
export {
  createRollingLogTransport as default
};
