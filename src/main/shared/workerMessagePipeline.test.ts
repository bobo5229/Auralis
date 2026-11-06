import { Worker } from 'node:worker_threads'
import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorkerMessageCredits, releaseWorkerMessageCredit } from './workerMessageCredits'
import type { LibraryScanWorkerMessage } from '../features/libraryScan/libraryScanTypes'
import type { MetadataRefreshWorkerMessage } from '../features/metadata/metadataRefreshTypes'

let directory: string
const workers: Worker[] = []
beforeAll(async () => {
  directory = mkdtempSync(join(resolve('output'), 'worker-pipeline-'))
  for (const [entry, name] of [
    ['libraryScan/libraryScanWorker', 'scan'],
    ['metadata/metadataRefreshWorker', 'metadata'],
  ]) {
    await build({
      entryPoints: [`src/main/features/${entry}.ts`],
      outfile: join(directory, `${name}.cjs`),
      bundle: true,
      platform: 'node',
      format: 'cjs',
      external: ['electron', 'sharp', 'music-metadata', 'pino'],
      alias: { '@main': resolve('src/main'), '@shared': resolve('src/shared') },
      logLevel: 'silent',
    })
  }
}, 15_000)
afterAll(async () => {
  await Promise.all(workers.map((worker) => worker.terminate()))
  if (directory && directory.startsWith(join(resolve('output'), 'worker-pipeline-')))
    rmSync(directory, { recursive: true, force: true })
})

function wave(): Buffer {
  const b = Buffer.alloc(44 + 160)
  b.write('RIFF', 0)
  b.writeUInt32LE(b.length - 8, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(8000, 24)
  b.writeUInt32LE(16000, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(160, 40)
  return b
}

it.each(['scan', 'metadata'] as const)(
  'bounds the actual %s worker, then drains every result and its terminal',
  async (name) => {
    const root = join(directory, name)
    mkdirSync(root)
    const paths = Array.from({ length: 70 }, (_, i) => join(root, `${i}.wav`))
    for (const path of paths) writeFileSync(path, wave())
    const bad = join(root, 'bad.flac')
    writeFileSync(bad, 'invalid audio')
    const credits = createWorkerMessageCredits(4)
    const worker = new Worker(join(directory, `${name}.cjs`), {
      workerData: {
        jobId: 1,
        rootPath: root,
        knownFiles: [],
        artworkCacheDir: join(directory, 'cache'),
        tracks: [...paths, bad].map((filePath, i) => ({ trackId: i + 1, filePath })),
        messageCredits: credits,
      },
    })
    workers.push(worker)
    const messages: Array<LibraryScanWorkerMessage | MetadataRefreshWorkerMessage> = []
    let consume = false
    const exited = new Promise<number>((done, reject) => {
      worker.once('exit', done)
      worker.once('error', reject)
    })
    worker.on('message', (message: LibraryScanWorkerMessage | MetadataRefreshWorkerMessage) => {
      messages.push(message)
      if (consume) releaseWorkerMessageCredit(credits)
    })
    await vi.waitFor(() => expect(messages).toHaveLength(4), { timeout: 5000 })
    await delay(40)
    expect(messages).toHaveLength(4)
    expect(Atomics.load(new Int32Array(credits), 0)).toBe(0)
    expect(messages.some((m) => m.type === 'complete')).toBe(false)
    consume = true
    for (let i = 0; i < 4; i++) releaseWorkerMessageCredit(credits)
    await expect(exited).resolves.toBe(0)
    expect(messages.at(-1)?.type).toBe('complete')
    expect(messages.map((m) => m.sequence)).toEqual(messages.map((_, i) => i + 1))
    expect(messages.filter((m) => m.type === 'failure')).toHaveLength(1)
    if (name === 'metadata') expect(messages.filter((m) => m.type === 'result')).toHaveLength(70)
    else {
      const complete = messages.at(-1) as Extract<LibraryScanWorkerMessage, { type: 'complete' }>
      expect(new Set(complete.payload.foundFilePaths)).toEqual(new Set([...paths, bad]))
      expect(messages.filter((m) => m.type === 'tracks').flatMap((m) => m.payload)).toHaveLength(70)
      expect(messages.filter((m) => m.type === 'progress').at(-1)?.payload).toMatchObject({
        totalFiles: 71,
        scannedFiles: 71,
        failedFiles: 1,
      })
    }
  },
  15_000,
)
