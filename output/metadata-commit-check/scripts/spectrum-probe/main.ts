import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { NativePlaybackService } from '../../src/main/features/audio/nativePlaybackService'
import { PlaybackSpectrumService } from '../../src/main/features/audio/playbackSpectrumService'
import { PlaybackFileCoordinator } from '../../src/main/features/audio/playbackFileCoordinator'
import {
  createAudioProtocolHandler,
  buildAudioTrackUrl,
} from '../../src/main/features/audio/audioProtocol'
import {
  createValidatedIpcRegistrar,
  createTrustedMainWindowSourcePolicy,
} from '../../src/main/ipc/validatedIpcRegistrar'
import { ipcChannels } from '../../src/shared/ipc/channels'

const root = dirname(fileURLToPath(import.meta.url))
const options = JSON.parse(readFileSync(join(root, 'options.json'), 'utf8')) as {
  verify: boolean
  normalMotion?: boolean
  tracks: string[]
}
// Verification persists volume=0 and fallback preferences: keep them out of listening sessions.
app.setPath('userData', join(root, options.verify ? 'verification-profile' : 'listening-profile'))
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'auralis-audio',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])
void app
  .whenReady()
  .then(async () => {
    const html = join(
      root,
      `renderer/demo/albums/${options.normalMotion ? 'cd-normal-motion' : 'cd-spectrum-live'}.html`,
    )
    const win = new BrowserWindow({
      show: !options.verify,
      width: options.normalMotion ? 1240 : 1040,
      height: options.normalMotion ? 900 : 800,
      webPreferences: {
        preload: join(root, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        // Hidden verification must paint like a visible listening window.
        backgroundThrottling: !options.verify,
      },
    })
    const paths = new Map(options.tracks.map((path, index) => [index + 1, path]))
    const readTrack = async (id: number) => {
      const path = paths.get(id)
      if (!path) throw new Error('Unknown demo track')
      await stat(path)
      return path
    }
    const coordinator = new PlaybackFileCoordinator({
      getTrackFilePath: (id) => paths.get(id) ?? null,
      getTrackIdsByFilePath: (path) =>
        [...paths].filter(([, value]) => value === path).map(([id]) => id),
      sendToRenderer: () => {},
    })
    protocol.handle(
      'auralis-audio',
      createAudioProtocolHandler({
        getFilePathByTrackId: (id) => paths.get(id) ?? null,
        getLibraryRootPaths: () => options.tracks.map(dirname),
      }),
    )
    const warnings: unknown[] = [],
      trace: unknown[] = [],
      syncErrors: number[] = []
    const spectrum = new PlaybackSpectrumService({
      ffmpegPath: resolve('resources/audio/ffmpeg.exe'),
      resolveTrack: readTrack,
      coordinator,
      emit: (frame) => {
        const clock = player.getSpectrumSource()
        if (frame.status === 'ready' && clock?.trackId === frame.trackId)
          syncErrors.push(Math.abs(frame.currentTime - clock.currentTime))
        trace.push(frame)
        if (trace.length > 2000) trace.shift()
        if (!win.isDestroyed()) win.webContents.send(ipcChannels.playback.spectrumFrame, frame)
      },
      warn: (error) => warnings.push(String(error)),
    })
    const player = new NativePlaybackService({
      mpvPath: resolve('resources/audio/mpv.exe'),
      ffmpegPath: resolve('resources/audio/ffmpeg.exe'),
      resolveTrack: readTrack,
      coordinator,
      mpvArgs: options.verify ? ['--ao=null'] : [],
      emit: (event) => {
        if (!win.isDestroyed()) win.webContents.send(ipcChannels.playback.nativeEvent, event)
        spectrum.syncNative(player.getSpectrumSource())
      },
      warn: (error) => warnings.push(String(error)),
    })
    const registrar = createValidatedIpcRegistrar({
      register: (channel, handler) => ipcMain.handle(channel, handler),
      isTrustedSender: createTrustedMainWindowSourcePolicy({
        fromWebContents: (sender) => BrowserWindow.fromWebContents(sender),
        isAllowedWindow: (window) => window === win,
        isTrustedRendererUrl: (url) => url.split('#')[0] === pathToFileURL(html).href,
      }),
    })
    registrar.handle(ipcChannels.playback.nativeAvailability, () => ({ available: true }))
    registrar.handle(ipcChannels.playback.nativeCommand, (_event, request) =>
      player.command(request),
    )
    registrar.handle(ipcChannels.playback.spectrumSubscribe, (_event, request) =>
      spectrum.subscribe(request, player.getSpectrumSource()),
    )
    registrar.handle(ipcChannels.playback.getAudioUrl, async (_event, { trackId }) => {
      await readTrack(trackId)
      return { url: buildAudioTrackUrl(trackId) }
    })
    registrar.handle(ipcChannels.playback.recordEffectivePlay, () => ({
      ok: true,
      recorded: false,
    }))
    registrar.handle(ipcChannels.playback.acquireReadLease, async (_event, { trackId }) => ({
      ok: true as const,
      ...(await coordinator.acquireReadLease(await readTrack(trackId), 'demo-renderer')),
    }))
    registrar.handle(ipcChannels.playback.releaseReadLease, (_event, { leaseId }) => {
      coordinator.releaseReadLease(leaseId)
      return { ok: true as const }
    })
    let closing = false
    app.on('before-quit', (event) => {
      if (closing) return
      event.preventDefault()
      closing = true
      if (!win.isDestroyed()) win.destroy()
      void Promise.all([player.dispose(), spectrum.dispose(), registrar.shutdown()]).finally(() =>
        app.quit(),
      )
    })
    app.on('window-all-closed', () => app.quit())
    await win.loadFile(html)
    if (!options.verify) {
      if (options.normalMotion) {
        await win.webContents.executeJavaScript('window.normalMotionProbe.play(1)')
        await delay(350)
        await win.webContents.executeJavaScript('window.normalMotionProbe.seek(30)')
      }
      console.log(
        'Spectrum listening state:',
        await win.webContents.executeJavaScript(
          `window.${options.normalMotion ? 'normalMotionProbe' : 'spectrumProbe'}.snapshot()`,
        ),
      )
      win.show()
      win.focus()
    }
    if (options.verify && options.normalMotion) {
      const js = (code: string) => win.webContents.executeJavaScript(code)
      const timeout = setTimeout(() => app.exit(1), 30000)
      try {
        const results: unknown[] = []
        await js('window.normalMotionProbe.motionForTest(false)')
        for (const id of [1, 2]) {
          await js(`window.normalMotionProbe.play(${id})`)
          await delay(350)
          await js('window.normalMotionProbe.seek(30)')
          await delay(850)
          const samples: { offsets: number[]; bass: number; level: number }[] = []
          for (let i = 0; i < 70; i++) {
            samples.push(await js('window.normalMotionProbe.snapshot()'))
            await delay(70)
          }
          const snapshot = await js('window.normalMotionProbe.snapshot()')
          assert.equal(snapshot.status, 'ready')
          assert(snapshot.playing)
          assert(samples.some((sample) => sample.bass > 0.00025))
          assert.equal(snapshot.offsets.length, 2)
          assert(
            Math.max(...samples.map((sample) => sample.level)) -
              Math.min(...samples.map((sample) => sample.level)) >
              0.03,
          )
          for (let index = 0; index < 2; index++) {
            assert(samples.some((sample) => Math.abs(sample.offsets[index]) > 0.01))
            assert(samples.every((sample) => Math.abs(sample.offsets[index]) <= 6))
          }
          await writeFile(
            join(root, `normal-track-${id}.png`),
            (await win.webContents.capturePage()).toPNG(),
          )
          await js('window.normalMotionProbe.pause()')
          await delay(150)
          assert.deepEqual((await js('window.normalMotionProbe.snapshot()')).offsets, [0, 0])
          results.push({
            id,
            frameCount: snapshot.frameCount,
            levelRange: [
              Math.min(...samples.map((sample) => sample.level)),
              Math.max(...samples.map((sample) => sample.level)),
            ],
            nearLimitFraction:
              samples.filter((sample) => sample.level > 0.95).length / samples.length,
            maxOffsets: [0, 1].map((index) =>
              Math.max(...samples.map((sample) => Math.abs(sample.offsets[index]))),
            ),
          })
        }
        await js('window.normalMotionProbe.seek(65);window.normalMotionProbe.resume()')
        await delay(700)
        assert.equal((await js('window.normalMotionProbe.snapshot()')).status, 'ready')
        await js('window.normalMotionProbe.enable(false)')
        await delay(150)
        assert.deepEqual((await js('window.normalMotionProbe.snapshot()')).offsets, [0, 0])
        await js(
          'window.normalMotionProbe.enable(true);window.normalMotionProbe.motionForTest(true)',
        )
        await delay(200)
        assert.deepEqual((await js('window.normalMotionProbe.snapshot()')).offsets, [0, 0])
        assert.equal(spectrum.decoderPid, null)
        win.setSize(540, 900)
        await delay(150)
        await writeFile(
          join(root, 'normal-narrow.png'),
          (await win.webContents.capturePage()).toPNG(),
        )
        assert(await js('document.documentElement.scrollWidth <= window.innerWidth'))
        assert.deepEqual(warnings, [])
        await writeFile(
          join(root, 'results.json'),
          JSON.stringify(
            { result: 'passed', results, warnings, diagnostics: spectrum.diagnostics },
            null,
            2,
          ),
        )
        console.log(JSON.stringify({ result: 'passed', results }))
        clearTimeout(timeout)
        app.quit()
      } catch (error) {
        console.error(error)
        clearTimeout(timeout)
        await Promise.all([player.dispose(), spectrum.dispose()])
        app.exit(1)
      }
      return
    }
    if (options.verify) {
      const timeout = setTimeout(() => {
        console.error('Spectrum demo verification timed out')
        app.exit(1)
      }, 55000)
      const js = (code: string) => win.webContents.executeJavaScript(code)
      const hashes = await Promise.all(
        options.tracks.map(async (path) =>
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        ),
      )
      await js(`localStorage.setItem('auralis-gapless-playback-enabled','true')`)
      await js(
        `window.spectrumProbe.motionForTest(false);window.spectrumProbe.nativeForTest(true);window.spectrumProbe.muteForTest()`,
      )
      const results: unknown[] = []
      const execute = promisify(execFile)
      const sampleDecoder = async () => {
        const pid = spectrum.decoderPid
        assert(pid && Number.isInteger(pid))
        const { stdout } = await execute(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `$spectrumProcess = Get-Process -Id ${pid}; @{ cpuMs = $spectrumProcess.TotalProcessorTime.TotalMilliseconds; memoryBytes = $spectrumProcess.WorkingSet64 } | ConvertTo-Json -Compress`,
          ],
          { windowsHide: true },
        )
        return JSON.parse(stdout) as { cpuMs: number; memoryBytes: number }
      }
      try {
        for (const id of [1, 2]) {
          await js(`window.spectrumProbe.play(${id})`)
          await delay(250)
          await js(`window.spectrumProbe.seek(30)`)
          await delay(650)
          const started = performance.now(),
            cpu = process.cpuUsage()
          const decoderBefore = await sampleDecoder()
          const snapshots: unknown[] = []
          while (performance.now() - started < 2400) {
            snapshots.push(await js('window.spectrumProbe.snapshot()'))
            await delay(100)
          }
          const current = await js('window.spectrumProbe.snapshot()')
          const decoderAfter = await sampleDecoder()
          const ready = current.frames.filter(
            (frame: { status: string; trackId: number; currentTime: number }) =>
              frame.status === 'ready' && frame.trackId === id && frame.currentTime >= 30,
          )
          assert(ready.length > 20)
          assert(ready.some((frame: { bands: number[] }) => frame.bands.some((value) => value > 0)))
          assert(ready.some((frame: { bass: number }) => frame.bass > 0.00025))
          const offsets = snapshots.map(
            (snapshot) => (snapshot as { vibration: { offset: number } }).vibration.offset,
          )
          assert(offsets.some((offset: number) => Math.abs(offset) > 0.01))
          assert(offsets.every((offset: number) => Math.abs(offset) <= 6))
          await writeFile(
            join(root, `track-${id}.png`),
            (await win.webContents.capturePage()).toPNG(),
          )
          await js('window.spectrumProbe.pause()')
          await delay(150)
          assert.equal((await js('window.spectrumProbe.snapshot()')).vibration.offset, 0)
          const count = spectrum.diagnostics.analyzedFrames
          await delay(200)
          assert.equal(spectrum.diagnostics.analyzedFrames, count)
          await js('window.spectrumProbe.seek(65)')
          await delay(70)
          await js('window.spectrumProbe.resume()')
          await delay(550)
          const sought = await js('window.spectrumProbe.snapshot()')
          assert(
            sought.frames.some(
              (frame: { status: string; trackId: number; currentTime: number }) =>
                frame.status === 'ready' && frame.trackId === id && frame.currentTime >= 65,
            ),
          )
          results.push({
            id,
            readyFrames: ready.length,
            position: current.time,
            seekPosition: sought.time,
            mainCpuMs: (process.cpuUsage(cpu).user + process.cpuUsage(cpu).system) / 1000,
            snapshots: snapshots.length,
            decoderCpuMs: decoderAfter.cpuMs - decoderBefore.cpuMs,
            decoderMemoryBytes: Math.max(decoderBefore.memoryBytes, decoderAfter.memoryBytes),
            vibrationMaxOffsetPx: Math.max(...offsets.map(Math.abs)),
            vibrationMaxPaintMs: current.vibration.maxPaintMs,
          })
        }
        win.setSize(540, 730)
        await delay(150)
        await writeFile(join(root, 'narrow.png'), (await win.webContents.capturePage()).toPNG())
        await js('window.spectrumProbe.nativeForTest(false);window.spectrumProbe.play(1)')
        await delay(700)
        await js('window.spectrumProbe.seek(45)')
        await delay(900)
        const fallback = await js('window.spectrumProbe.snapshot()')
        assert(fallback.playing)
        assert.equal(fallback.status, 'ready')
        assert(
          fallback.frames.some(
            (frame: { status: string; trackId: number; currentTime: number }) =>
              frame.status === 'ready' &&
              frame.trackId === 1 &&
              frame.currentTime >= 45 &&
              Math.abs(frame.currentTime - fallback.time) < 0.3,
          ),
        )
        results.push({ backend: 'HTMLAudio', position: fallback.time, status: fallback.status })
        await js('window.spectrumProbe.enableVibration(false)')
        assert.equal((await js('window.spectrumProbe.snapshot()')).vibration.offset, 0)
        await js('window.spectrumProbe.enableVibration(true)')
        await js('window.spectrumProbe.motionForTest(true)')
        await delay(150)
        const reducedCount = spectrum.diagnostics.analyzedFrames
        await delay(250)
        assert.equal(spectrum.diagnostics.analyzedFrames, reducedCount)
        assert.equal(spectrum.decoderPid, null)
        assert.equal((await js('window.spectrumProbe.snapshot()')).vibration.offset, 0)
        assert(await js("document.querySelector('.labels').textContent.includes('动效已关闭')"))
        assert(
          await js(
            "new Promise(resolve => requestAnimationFrame(() => resolve([...document.querySelectorAll('.spectrum span')].every(bar => bar.style.transform === 'scaleY(0.015)'))))",
          ),
        )
        results.push({ reducedMotion: 'analysis stopped, static bars' })
        await js('window.spectrumProbe.motionForTest(false)')
        await delay(400)
        assert.equal((await js('window.spectrumProbe.snapshot()')).status, 'ready')
        await js('window.spectrumProbe.pause()')
        await delay(150)
        await js('window.spectrumProbe.enable(false)')
        await delay(150)
        const count = spectrum.diagnostics.analyzedFrames
        await delay(250)
        assert.equal(spectrum.diagnostics.analyzedFrames, count)
        await player.dispose()
        await spectrum.dispose()
        const after = await Promise.all(
          options.tracks.map(async (path) =>
            createHash('sha256')
              .update(await readFile(path))
              .digest('hex'),
          ),
        )
        assert.deepEqual(after, hashes)
        assert.deepEqual(warnings, [])
        assert(Math.max(...syncErrors) < 0.2)
        await writeFile(
          join(root, 'results.json'),
          JSON.stringify(
            {
              results,
              diagnostics: spectrum.diagnostics,
              warnings,
              sourceFilesUnchanged: true,
              maxTimestampErrorSeconds: Math.max(...syncErrors),
            },
            null,
            2,
          ),
        )
        await writeFile(join(root, 'frames.json'), JSON.stringify(trace))
        console.log(
          JSON.stringify({
            result: 'passed',
            results,
            diagnostics: spectrum.diagnostics,
            sourceFilesUnchanged: true,
            maxTimestampErrorSeconds: Math.max(...syncErrors),
          }),
        )
        clearTimeout(timeout)
        app.quit()
      } catch (error) {
        console.error(error)
        clearTimeout(timeout)
        await Promise.all([player.dispose(), spectrum.dispose()])
        app.exit(1)
      }
    }
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
