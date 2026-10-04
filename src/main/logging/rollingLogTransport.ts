import { Writable } from 'node:stream'
import { RollingLogStore, type RollingLogStoreOptions } from './rollingLogStore'

export interface RollingLogTransportOptions extends RollingLogStoreOptions {
  logsDirectory: string
}

/** Runs inside Pino's Worker. Acknowledge only after all complete JSONL records are written. */
export default function createRollingLogTransport(options: RollingLogTransportOptions): Writable {
  const store = new RollingLogStore(options.logsDirectory, options)
  let remainder = ''
  return new Writable({
    // ThreadStream waits for drain, so flush/exit also wait for the file writes.
    highWaterMark: 1,
    decodeStrings: false,
    write(chunk: string, _encoding, done) {
      const lines = (remainder + chunk).split('\n')
      remainder = lines.pop() ?? ''
      void (async () => {
        for (const line of lines) if (line) await store.write(line)
      })().then(() => done(), done)
    },
    final(done) {
      void (async () => {
        if (remainder) await store.write(remainder)
        await store.close()
      })().then(() => done(), done)
    },
    destroy(_error, done) {
      void store.close().then(() => done(), done)
    },
  })
}
