import { Worker } from 'node:worker_threads'
import { buildSync } from 'esbuild'
import { afterEach, expect, it, vi } from 'vitest'
import { setTimeout as delay } from 'node:timers/promises'
import {
  closeWorkerMessageCredits,
  createWorkerMessageCredits,
  releaseWorkerMessageCredit,
  takeWorkerMessageCredit,
} from './workerMessageCredits'

const workers: Worker[] = []
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.terminate()))
})

function producer(credits: SharedArrayBuffer) {
  const compiled = buildSync({
    entryPoints: ['src/main/shared/workerMessageCredits.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  }).outputFiles[0].text
  const worker = new Worker(
    `${compiled}
    const {parentPort, workerData} = require('node:worker_threads');
    for (let sequence = 1; sequence <= 100; sequence++) {
      module.exports.takeWorkerMessageCredit(workerData);
      parentPort.postMessage(sequence);
    }
  `,
    { eval: true, workerData: credits },
  )
  workers.push(worker)
  const received: number[] = []
  worker.on('message', (sequence: number) => received.push(sequence))
  return { worker, received }
}

it('bounds a real producer and resumes in order only after consumption while the main loop stays live', async () => {
  const credits = createWorkerMessageCredits(2)
  const { received } = producer(credits)
  await vi.waitFor(() => expect(received).toEqual([1, 2]))
  await delay(25)
  expect(received).toEqual([1, 2])
  expect(Atomics.load(new Int32Array(credits), 0)).toBe(0)
  releaseWorkerMessageCredit(credits)
  await vi.waitFor(() => expect(received).toEqual([1, 2, 3]))
  for (let sequence = 4; sequence <= 100; sequence++) {
    releaseWorkerMessageCredit(credits)
    await vi.waitFor(() => expect(received.at(-1)).toBe(sequence), { interval: 1 })
  }
  expect(received).toEqual(Array.from({ length: 100 }, (_, index) => index + 1))
})

it('can terminate a worker waiting for credit and never waits in the main process', async () => {
  const credits = createWorkerMessageCredits(1)
  expect(() => takeWorkerMessageCredit(credits)).toThrow('cannot block the main thread')
  const { worker, received } = producer(credits)
  await vi.waitFor(() => expect(received).toEqual([1]))
  await expect(worker.terminate()).resolves.toBeTypeOf('number')
  expect(received).toEqual([1])
})

it('wakes and exits a blocked producer when the consumer closes its channel', async () => {
  const credits = createWorkerMessageCredits(1)
  const { worker, received } = producer(credits)
  const stopped = new Promise<number>((resolve) => {
    worker.on('error', () => undefined)
    worker.on('exit', resolve)
  })
  await vi.waitFor(() => expect(received).toEqual([1]))
  closeWorkerMessageCredits(credits)
  await expect(stopped).resolves.toBe(1)
  expect(received).toEqual([1])
})

it('does not lose close between checking the credits and entering the wait', async () => {
  const credits = createWorkerMessageCredits(1)
  Atomics.store(new Int32Array(credits), 0, 0)
  const barrier = new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT)
  const compiled = buildSync({
    entryPoints: ['src/main/shared/workerMessageCredits.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  }).outputFiles[0].text
  const worker = new Worker(
    `${compiled}
    const {parentPort, workerData} = require('node:worker_threads');
    const control = new Int32Array(workerData.barrier);
    const wait = Atomics.wait;
    Atomics.wait = (view, index, expected) => {
      Atomics.store(control, 0, 1);
      wait(control, 1, 0);
      const result = wait(view, index, expected, 60);
      parentPort.postMessage(result);
      return result;
    };
    try { module.exports.takeWorkerMessageCredit(workerData.credits) }
    catch (error) { parentPort.postMessage(error.message) }
  `,
    { eval: true, workerData: { credits, barrier } },
  )
  workers.push(worker)
  const messages: string[] = []
  worker.on('message', (message: string) => messages.push(message))
  await vi.waitFor(() => expect(Atomics.load(new Int32Array(barrier), 0)).toBe(1))
  closeWorkerMessageCredits(credits)
  Atomics.store(new Int32Array(barrier), 1, 1)
  Atomics.notify(new Int32Array(barrier), 1)
  await vi.waitFor(() =>
    expect(messages).toEqual(['not-equal', 'Worker message channel is closed']),
  )
})
