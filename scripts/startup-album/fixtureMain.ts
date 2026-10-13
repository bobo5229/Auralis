import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdirSync, existsSync, closeSync, openSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { createWindow } from '../../src/main/app/createWindow'
import { initializeDatabase, closeDatabase } from '../../src/main/database/connection'
import { TrackRepository } from '../../src/main/repositories/trackRepository'
import { LibraryRootRepository } from '../../src/main/repositories/libraryRootRepository'
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers'
import {
  registerAudioProtocol,
  registerPrivilegedMediaSchemes,
} from '../../src/main/features/audio/audioProtocol'
import { registerArtworkProtocol } from '../../src/main/features/artwork/artworkProtocol'
import {
  ensureArtworkCacheDir,
  writeArtworkToCache,
} from '../../src/main/features/artwork/artworkCache'
import type { ScannedTrack } from '../../src/shared/types/libraryScan'

// Test-only entry: same production window, handlers, database and renderer; isolated files only.
const profile = process.env.AURALIS_STARTUP_ALBUM_PROFILE!
const output = process.env.AURALIS_STARTUP_ALBUM_OUTPUT!
const testCase = process.env.AURALIS_STARTUP_ALBUM_CASE!
const contrastCase = testCase === 'contrast-dark' || testCase === 'contrast-light'
const textCase = testCase.startsWith('text-')
const playCase = testCase === 'play' || testCase.startsWith('play-')
// Optional local artwork is read only and copied into the isolated fixture cache.
const previewCase = textCase || playCase
const previewCover = previewCase ? process.env.AURALIS_STARTUP_ALBUM_COVER : undefined
const fixtureArtist = (previewCase && process.env.AURALIS_STARTUP_ALBUM_ARTIST) || 'Auralis Fixture'
const redSurfaceCase = testCase === 'surface-red'
if (!profile || !output || !testCase) throw new Error('Use node scripts/startup-album/run.mjs')
mkdirSync(join(profile, 'data'), { recursive: true })
const databasePath = join(profile, 'data/auralis.sqlite')
if (!existsSync(databasePath)) closeSync(openSync(databasePath, 'wx'))
app.setPath('userData', profile)
app.commandLine.appendSwitch('log-level', '3')
if (testCase === 'text-hidpi' || testCase === 'hover-hidpi' || testCase === 'play-hidpi')
  app.commandLine.appendSwitch('force-device-scale-factor', '2')
registerPrivilegedMediaSchemes()
app.on('window-all-closed', () => {
  /* The fixture recreates windows before explicit shutdown. */
})
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const errors: string[] = []
let skipElapsedMs: number | null = null
let playElapsedMs: number | null = null
const audioRequests: { at: number; trackId: number }[] = []
let runtime: ReturnType<typeof registerIpcHandlers> | undefined
const watchdog = setTimeout(() => {
  console.error('Startup album fixture timeout')
  app.exit(1)
}, 45000)
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function wait(win: BrowserWindow, code: string, timeout = 10000): Promise<void> {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await win.webContents.executeJavaScript(code)) return
    await pause(20)
  }
  throw new Error(`Timeout: ${code}`)
}
async function click(win: BrowserWindow, selector: string) {
  const point = await win.webContents.executeJavaScript(
    `(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r && {x: Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`,
  )
  assert(point, `Missing ${selector}`)
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
}
async function settleCard(win: BrowserWindow) {
  await wait(win, 'Boolean(document.querySelector(".startup-album-canvas canvas"))')
  await win.webContents.executeJavaScript(`(() => {
    const gl = document.querySelector('.startup-album-canvas canvas').getContext('webgl2');
    window.__fixtureSettleDraws = 0; window.__fixtureLastSettleDraw = performance.now();
    for (const name of ['drawArrays', 'drawElements']) {
      const draw = gl[name].bind(gl);
      gl[name] = (...args) => { window.__fixtureSettleDraws++; window.__fixtureLastSettleDraw = performance.now(); return draw(...args) };
    }
    window.dispatchEvent(new Event('resize'));
  })()`)
  await wait(
    win,
    'window.__fixtureSettleDraws > 0 && performance.now() - window.__fixtureLastSettleDraw > 200',
  )
}
async function skip(win: BrowserWindow) {
  await win.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-startup-skip]');
    const canvas = document.querySelector('.startup-album-canvas canvas');
    window.__fixtureSkipDraws = 0;
    const gl = canvas?.getContext('webgl2');
    if (gl && !gl.isContextLost()) for (const name of ['drawArrays', 'drawElements']) {
      const draw = gl[name].bind(gl);
      gl[name] = (...args) => { window.__fixtureSkipDraws++; return draw(...args) };
    }
    window.__fixtureSkipClosed = new Promise(resolve => {
      button.addEventListener('click', () => {
        const started = performance.now();
        window.__fixtureSkipStarted = started;
        requestAnimationFrame(() => { window.__fixtureSkipLocked =
          Boolean(document.querySelector('.startup-album-overlay.is-exiting')) &&
          document.querySelector('.app-window').inert &&
          Boolean(document.activeElement?.closest('.startup-album-overlay')) &&
          !document.querySelector('[data-startup-play], [data-startup-skip]');
        });
        const observer = new MutationObserver(() => {
          if (document.querySelector('.startup-album-overlay')) return;
          observer.disconnect();
          window.__fixtureSkipElapsed = performance.now() - started;
          requestAnimationFrame(() => resolve(
            !document.querySelector('.app-window').inert &&
            (!canvas || !canvas.isConnected) &&
            !document.activeElement?.closest('.startup-album-overlay')
          ));
        });
        observer.observe(document.body, {childList: true, subtree: true});
      }, {once: true});
    });
  })()`)
  await click(win, '[data-startup-skip]')
  await wait(win, 'window.__fixtureSkipLocked === true')
  if (testCase === 'skip-settled') {
    await pause(220)
    await capture(win, 'cracks')
    // Escape and background playback shortcuts must not interrupt a skip exit.
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
    await pause(350)
    assert(
      await win.webContents.executeJavaScript(
        'Boolean(document.querySelector(".startup-album-overlay"))',
      ),
      'Exit shortcuts prematurely closed the card',
    )
    await capture(win, 'separating')
    await pause(360)
    await capture(win, 'fading')
  }
  if (testCase === 'skip-hidden') {
    await pause(180)
    win.hide()
    await pause(80)
    win.showInactive()
  }
  if (testCase === 'skip-context-loss') {
    await pause(180)
    await win.webContents.executeJavaScript(
      `document.querySelector('.startup-album-canvas canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`,
    )
  }
  assert(
    await win.webContents.executeJavaScript('window.__fixtureSkipClosed'),
    'Skip did not remove the card and canvas or restore interaction after its exit',
  )
  const elapsed = await win.webContents.executeJavaScript('window.__fixtureSkipElapsed')
  skipElapsedMs = elapsed
  const shortened = [
    'fallback',
    'light',
    'skip-reduced',
    'skip-hidden',
    'skip-context-loss',
  ].includes(testCase)
  assert(
    shortened ? elapsed < 1000 : elapsed >= 1300 && elapsed < 2200,
    `Unexpected skip exit duration: ${elapsed} ms`,
  )
  const draws = await win.webContents.executeJavaScript('window.__fixtureSkipDraws')
  await pause(100)
  assert(
    await win.webContents.executeJavaScript(`window.__fixtureSkipDraws === ${draws}`),
    'Disposed card kept rendering',
  )
}
async function capture(win: BrowserWindow, name: string) {
  writeFileSync(
    join(output, `${testCase}-${name}.png`),
    (await win.webContents.capturePage()).toPNG(),
  )
}
async function playAlbum(win: BrowserWindow) {
  if (testCase === 'play-small') win.setSize(900, 620)
  if (testCase !== 'play' && !['play-reduced', 'play-fallback'].includes(testCase))
    await settleCard(win)
  else if (testCase === 'play')
    await wait(win, "Boolean(document.querySelector('.startup-album-canvas canvas'))")
  if (testCase === 'play-no-target')
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-playbar-drop-target]').removeAttribute('data-playbar-drop-target')`,
    )
  await win.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('[data-startup-play]');
    const canvas = document.querySelector('.startup-album-canvas canvas');
    window.__fixturePlayButton = button;
    window.__fixturePlayDraws = 0;
    window.__fixtureDropFrames = [];
    window.__fixtureTransportPlayingAt = null;
    const transportObserver = new MutationObserver(() => {
      if (
        window.__fixtureTransportPlayingAt === null &&
        document.querySelector('.transport-control-primary--playing')
      )
        window.__fixtureTransportPlayingAt = performance.now();
    });
    transportObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
    const gl = canvas?.getContext('webgl2');
    if (gl && !gl.isContextLost()) for (const name of ['drawArrays', 'drawElements']) {
      const draw = gl[name].bind(gl);
      gl[name] = (...args) => {
        window.__fixturePlayDraws++;
        if (window.__fixturePlayStarted) {
          const program = gl.getParameter(gl.CURRENT_PROGRAM);
          if (program && !gl.isContextLost() && gl.getUniformLocation(program, 'uCardFinish')) {
            const bar = document.querySelector('.player-bar-island').getBoundingClientRect();
            window.__fixtureDropFrames.push({
              elapsed: performance.now() - window.__fixturePlayStarted,
              matrix: Array.from(gl.getUniform(program, gl.getUniformLocation(program, 'modelViewMatrix'))),
              projection: Array.from(gl.getUniform(program, gl.getUniformLocation(program, 'projectionMatrix'))),
              scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX)),
              clipping: gl.isEnabled(gl.SCISSOR_TEST),
              overlayVisible: Boolean(document.querySelector('.startup-album-overlay')),
              inert: document.querySelector('.app-window')?.inert ?? null,
              canvasConnected: canvas.isConnected,
              canvas: {width:canvas.width,height:canvas.height,cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight},
              bar: {top:bar.top,left:bar.left,width:bar.width},
            });
          }
        }
        return draw(...args);
      };
    }
    window.__fixturePlayClosed = new Promise(resolve => {
      button.addEventListener('click', () => {
        window.__fixturePlayStarted = performance.now();
        requestAnimationFrame(() => { window.__fixturePlayLocked =
          Boolean(document.querySelector('.startup-album-overlay.is-exiting')) &&
          document.querySelector('.app-window').inert &&
          Boolean(document.activeElement?.closest('.startup-album-overlay')) &&
          !document.querySelector('[data-startup-play], [data-startup-skip]');
        });
        const observer = new MutationObserver(() => {
          if (document.querySelector('.startup-album-overlay')) return;
          observer.disconnect();
          window.__fixturePlayElapsed = performance.now() - window.__fixturePlayStarted;
          requestAnimationFrame(() => resolve(
            !document.querySelector('.app-window').inert &&
            (!canvas || !canvas.isConnected) &&
            !document.activeElement?.closest('.startup-album-overlay')
          ));
        });
        observer.observe(document.body, {childList:true,subtree:true});
      }, {once:true});
    });
  })()`)
  const requestedAt = Date.now()
  await click(win, '[data-startup-play]')
  await wait(win, 'window.__fixturePlayLocked === true')
  // Even a queued activation of the detached button must not start another session.
  await win.webContents.executeJavaScript(
    'window.__fixturePlayButton.click(); window.__fixturePlayButton.click()',
  )
  const shortened = ['play-reduced', 'play-fallback', 'play-no-target'].includes(testCase)
  if (!shortened) {
    try {
      const requestDeadline = requestedAt + 1000
      while (
        !audioRequests.some((request) => request.at >= requestedAt) &&
        Date.now() < requestDeadline
      )
        await pause(10)
      const firstAudioRequest = audioRequests.find((request) => request.at >= requestedAt)
      assert(
        firstAudioRequest && firstAudioRequest.at - requestedAt < 1000,
        'Playback waited for drop completion before requesting the first audio URL',
      )
      // Deliver shortcut probes as soon as playback has started so slow
      // renderer round-trips cannot postpone them until after the overlay exits.
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
      await wait(
        win,
        'Boolean(window.__fixtureDropFrames?.length)',
        Math.max(1, requestDeadline - Date.now()),
      )
      const activeFrame = await win.webContents.executeJavaScript(`(() => {
        const frame = (window.__fixtureDropFrames || []).find(value => value.elapsed < 1000);
        return frame ? {
          elapsed: frame.elapsed,
          overlayVisible: frame.overlayVisible,
          inert: frame.inert,
          canvasConnected: frame.canvasConnected,
          clipping: frame.clipping,
        } : null;
      })()`)
      assert(
        activeFrame &&
          activeFrame.overlayVisible &&
          activeFrame.inert &&
          activeFrame.canvasConnected &&
          activeFrame.clipping,
        'No active rendered drop frame was observed before the overlay exited',
      )
    } catch (error) {
      const requests = audioRequests.filter((request) => request.at >= requestedAt)
      const requestOffset = requests.length ? requests[0].at - requestedAt : null
      if (requestOffset !== null)
        await win.webContents.executeJavaScript(
          `window.__fixturePlayRequestOffset = ${requestOffset}`,
        )
      const rendererState = await win.webContents.executeJavaScript(`(() => {
        const overlay = document.querySelector('.startup-album-overlay');
        const appWindow = document.querySelector('.app-window');
        const canvas = document.querySelector('.startup-album-canvas canvas');
        const primary = document.querySelector('.transport-control-primary');
        const frames = window.__fixtureDropFrames || [];
        return {
          observedAt: performance.now(),
          playStartedAt: window.__fixturePlayStarted ?? null,
          playElapsedNow: window.__fixturePlayStarted == null ? null : performance.now() - window.__fixturePlayStarted,
          playEndedAt: window.__fixturePlayElapsed ?? null,
          playClosed: window.__fixturePlayElapsed != null,
          locked: window.__fixturePlayLocked ?? null,
          overlay: overlay ? {className: overlay.className, connected: overlay.isConnected} : null,
          inert: appWindow?.inert ?? null,
          canvas: canvas ? {
            connected: canvas.isConnected,
            rect: (() => { const r = canvas.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height} })(),
            style: {position:canvas.style.position,left:canvas.style.left,top:canvas.style.top,width:canvas.style.width,height:canvas.style.height,opacity:canvas.style.opacity},
          } : null,
          transport: {
            primaryClass: primary?.className ?? null,
            playing: Boolean(document.querySelector('.transport-control-primary--playing')),
            firstPlayingAt: window.__fixtureTransportPlayingAt ?? null,
          },
          drop: {
            frameCount: frames.length,
            firstFrameElapsed: frames[0]?.elapsed ?? null,
            lastFrameElapsed: frames.at(-1)?.elapsed ?? null,
            nearestRequestFrame: window.__fixturePlayRequestOffset == null ? null : frames.reduce((nearest, frame) =>
              !nearest || Math.abs(frame.elapsed - window.__fixturePlayRequestOffset) < Math.abs(nearest.elapsed - window.__fixturePlayRequestOffset) ? frame : nearest,
              null),
          },
        };
      })()`)
      const diagnostic = {
        testCase,
        requestedAt,
        requests: requests.map((request) => ({
          ...request,
          millisecondsAfterRequest: request.at - requestedAt,
        })),
        rendererState,
        consoleErrors: errors,
        waitError: String(error),
      }
      writeFileSync(
        join(output, `${testCase}-playback-wait-diagnostic.json`),
        JSON.stringify(diagnostic, null, 2),
      )
      throw new Error(
        `${String(error)}; diagnostic saved to ${testCase}-playback-wait-diagnostic.json`,
      )
    }
    assert(
      audioRequests.some((request) => request.at >= requestedAt && request.at - requestedAt < 1000),
      'Playback waited for drop completion',
    )
    const interrupt = [
      'play-hidden',
      'play-resize',
      'play-context-loss',
      'play-motion-change',
      'play-target-lost',
    ].includes(testCase)
    if (interrupt) {
      await pause(150)
      if (testCase === 'play-hidden') {
        win.hide()
        await pause(80)
        win.showInactive()
      }
      if (testCase === 'play-resize') win.setSize(980, 700)
      if (testCase === 'play-context-loss')
        await win.webContents.executeJavaScript(
          `document.querySelector('.startup-album-canvas canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`,
        )
      if (testCase === 'play-motion-change')
        await win.webContents.executeJavaScript(
          `window.dispatchEvent(new StorageEvent('storage', {key:'auralis-reduced-motion',newValue:'reduce'})); localStorage.setItem('auralis-reduced-motion','reduce'); window.dispatchEvent(new StorageEvent('storage', {key:'auralis-reduced-motion',newValue:'reduce'}))`,
        )
      if (testCase === 'play-target-lost')
        await win.webContents.executeJavaScript(
          `document.querySelector('[data-playbar-drop-target]').style.display='none'`,
        )
    } else {
      for (const [ms, name] of [
        [100, 'lift'],
        [550, 'half-turn'],
        [800, 'approach'],
        [955, 'contact'],
        [1000, 'inserting'],
      ] as const) {
        if (testCase === 'play-inserting' && name !== 'inserting') continue
        if (testCase === 'play-half-turn' && name !== 'half-turn') continue
        const elapsed = await win.webContents.executeJavaScript(
          'performance.now()-window.__fixturePlayStarted',
        )
        if (ms > elapsed) await pause(ms - elapsed)
        await capture(win, name)
      }
    }
  }
  assert(
    await win.webContents.executeJavaScript('window.__fixturePlayClosed'),
    'Drop did not release focus, inert state and canvas',
  )
  playElapsedMs = await win.webContents.executeJavaScript('window.__fixturePlayElapsed')
  const interrupted = [
    'play-hidden',
    'play-resize',
    'play-context-loss',
    'play-motion-change',
    'play-target-lost',
  ].includes(testCase)
  assert(
    shortened || interrupted
      ? playElapsedMs! < 1000
      : playElapsedMs! >= 1150 && playElapsedMs! < 1800,
    `Unexpected drop duration: ${playElapsedMs}`,
  )
  const draws = await win.webContents.executeJavaScript('window.__fixturePlayDraws')
  await pause(100)
  assert(
    await win.webContents.executeJavaScript(`window.__fixturePlayDraws === ${draws}`),
    'Disposed drop kept rendering',
  )
  const frames = await win.webContents.executeJavaScript('window.__fixtureDropFrames')
  if (!shortened && !interrupted) {
    assert(frames.length > 20, 'Drop did not render enough observable frames')
    assert(
      frames.every((frame: { clipping: boolean }) => frame.clipping),
      'Card did not clip against the receiving edge',
    )
    assert(
      frames.every(
        (frame: {
          scissor: number[]
          canvas: { height: number; cssHeight: number }
          bar: { top: number }
        }) => {
          const ratio = frame.canvas.height / frame.canvas.cssHeight
          const edge = frame.canvas.cssHeight - frame.scissor[1] / ratio
          return Math.abs(edge - frame.bar.top) < 1.5
        },
      ),
      'Scissor did not follow the actual Playbar edge at this screen scale',
    )
    const tops = frames.map((frame: { bar: { top: number } }) => frame.bar.top)
    assert(Math.max(...tops) - Math.min(...tops) > 0.5, 'Playbar did not react to contact')
  }
  const requests = audioRequests.filter((request) => request.at >= requestedAt)
  assert(
    requests.length > 0 &&
      requests.filter((request) => request.trackId === requests[0].trackId).length === 1,
    'Repeated activation requested the first track multiple times',
  )
  const transportTiming = await win.webContents.executeJavaScript(`(() => ({
    rendererClickAt: window.__fixturePlayStarted ?? null,
    transportPlayingAt: window.__fixtureTransportPlayingAt ?? null,
    transportPlayingDelayMs: window.__fixturePlayStarted == null || window.__fixtureTransportPlayingAt == null
      ? null
      : window.__fixtureTransportPlayingAt - window.__fixturePlayStarted,
  }))()`)
  const firstAudioRequestDelayMs = requests[0].at - requestedAt
  const nearestRequestFrame = frames.reduce(
    (nearest: (typeof frames)[number] | null, frame: (typeof frames)[number]) =>
      !nearest ||
      Math.abs(frame.elapsed - firstAudioRequestDelayMs) <
        Math.abs(nearest.elapsed - firstAudioRequestDelayMs)
        ? frame
        : nearest,
    null,
  )
  writeFileSync(
    join(output, `${testCase}-drop.json`),
    JSON.stringify(
      {
        elapsedMs: playElapsedMs,
        timing: {
          hostClickRequestStartedAt: requestedAt,
          firstAudioUrlRequestedAfterClickMs: firstAudioRequestDelayMs,
          firstAudioUrlTrackId: requests[0].trackId,
          ...transportTiming,
          nearestWebglFrameToAudioUrlRequest: nearestRequestFrame
            ? {
                elapsedMs: nearestRequestFrame.elapsed,
                deltaFromHostRequestEstimateMs:
                  nearestRequestFrame.elapsed - firstAudioRequestDelayMs,
                overlayVisible: nearestRequestFrame.overlayVisible,
                inert: nearestRequestFrame.inert,
                clipping: nearestRequestFrame.clipping,
                canvas: nearestRequestFrame.canvas,
              }
            : null,
        },
        requests,
        frames,
      },
      null,
      2,
    ),
  )
  await wait(win, `Boolean(document.querySelector('.transport-control-primary--playing'))`)
  const end = Date.now() + 8000
  while (!win.webContents.isCurrentlyAudible() && Date.now() < end) await pause(50)
  assert(win.webContents.isCurrentlyAudible(), 'Real playback did not become audible')
  if (testCase === 'play-target-lost')
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-playbar-drop-target]').style.display=''`,
    )
  await capture(win, 'landed')
  await click(win, '[data-testid="player-queue-button"]')
  await wait(win, 'document.querySelectorAll(".queue-item-title").length === 12')
  assert(
    await win.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.queue-item-title')).every((node,i)=>node.textContent.includes(String(i+1).padStart(2,'0')))`,
    ),
    'Playback queue is not the complete ordered album',
  )
}
async function verifyCardHover(win: BrowserWindow) {
  // Observe the matrices actually submitted to WebGL, without a production probe.
  await win.webContents.executeJavaScript(`(() => {
    const gl = document.querySelector('.startup-album-canvas canvas').getContext('webgl2');
    window.__fixtureLastDraw = performance.now();
    window.__fixtureDraws = 0;
    for (const name of ['drawArrays', 'drawElements']) {
      const draw = gl[name].bind(gl);
      gl[name] = (...args) => {
        window.__fixtureLastDraw = performance.now();
        window.__fixtureDraws++;
        const program = gl.getParameter(gl.CURRENT_PROGRAM);
        if (gl.getUniformLocation(program, 'uCardFinish')) {
          const matrix = gl.getUniform(program, gl.getUniformLocation(program, 'modelViewMatrix'));
          if (matrix[0] > 0) window.__fixtureCardFrame = {
            matrix: Array.from(matrix),
            projection: Array.from(gl.getUniform(program, gl.getUniformLocation(program, 'projectionMatrix'))),
            printMask: Boolean(gl.getUniformLocation(program, 'uPrintMask')),
            redSurface: gl.getUniform(program, gl.getUniformLocation(program, 'uRedSurface'))
          };
        }
        return draw(...args);
      };
    }
  })()`)
  if (testCase === 'hover-small') win.setSize(900, 620)
  // A resize guarantees a frame even if entrance finished before observation began.
  await win.webContents.executeJavaScript('window.dispatchEvent(new Event("resize"))')
  const settle = () =>
    wait(win, 'window.__fixtureCardFrame && performance.now() - window.__fixtureLastDraw > 250')
  await settle()
  const baseline: number[] = await win.webContents.executeJavaScript(
    'window.__fixtureCardFrame.matrix',
  )
  const point = async (x: number, y: number) =>
    win.webContents.executeJavaScript(`(() => {
      const {matrix: m, projection: p} = window.__fixtureCardFrame;
      const r = document.querySelector('.startup-album-canvas canvas').getBoundingClientRect();
      const v = [m[0]*${x}+m[4]*${y}+m[12], m[1]*${x}+m[5]*${y}+m[13], m[2]*${x}+m[6]*${y}+m[14], 1];
      const clip = [0,1,2,3].map(i => p[i]*v[0]+p[4+i]*v[1]+p[8+i]*v[2]+p[12+i]);
      return {x: Math.round(r.left+(clip[0]/clip[3]+1)*r.width/2), y: Math.round(r.top+(1-clip[1]/clip[3])*r.height/2)};
    })()`)
  const move = (position: { x: number; y: number }) =>
    win.webContents.sendInputEvent({ type: 'mouseMove', ...position })
  const outside = await win.webContents.executeJavaScript(`(() => {
    const r = document.querySelector('.startup-album-canvas canvas').getBoundingClientRect();
    return {x: Math.round(r.left+10), y: Math.round(r.top+10)};
  })()`)
  const results: { corner: string; matrix: number[] }[] = []
  for (const [name, x, y] of [
    ['top-left', -1, 1],
    ['top-right', 1, 1],
    ['bottom-right', 1, -1],
    ['bottom-left', -1, -1],
  ] as const) {
    move(outside)
    await pause(50)
    await settle()
    const returned: number[] = await win.webContents.executeJavaScript(
      'window.__fixtureCardFrame.matrix',
    )
    assert(
      returned.every((n, i) => Math.abs(n - baseline[i]) < 0.0001),
      `${name}: did not return to fixed pose`,
    )
    // The rounded cutout must remain whitespace; the nearby printed corner must hover.
    const cutout = await point(x * 1.325, y * 1.9)
    const corner = await point(x * (1.325 - 0.06), y * (1.9 - 0.06))
    const idleDraws = await win.webContents.executeJavaScript('window.__fixtureDraws')
    move(cutout)
    await pause(100)
    assert(
      await win.webContents.executeJavaScript(`window.__fixtureDraws === ${idleDraws}`),
      `${name}: rounded cutout triggered hover`,
    )
    move(corner)
    await pause(100)
    await settle()
    const matrix: number[] = await win.webContents.executeJavaScript(
      'window.__fixtureCardFrame.matrix',
    )
    assert(
      Math.abs(matrix[2] - baseline[2]) > 0.2 && Math.abs(matrix[6] - baseline[6]) > 0.2,
      `${name}: corner lost hover after tilting`,
    )
    const heldDraws = await win.webContents.executeJavaScript('window.__fixtureDraws')
    await pause(300)
    assert(
      await win.webContents.executeJavaScript(`window.__fixtureDraws === ${heldDraws}`),
      `${name}: stationary corner kept oscillating`,
    )
    results.push({ corner: name, matrix })
    await capture(win, name)
  }
  move(outside)
  await pause(50)
  await settle()
  const returned: number[] = await win.webContents.executeJavaScript(
    'window.__fixtureCardFrame.matrix',
  )
  assert(
    returned.every((n, i) => Math.abs(n - baseline[i]) < 0.0001),
    'Final hover changed fixed pose',
  )
  writeFileSync(
    join(output, `${testCase}-corners.json`),
    JSON.stringify({ baseline, results, returned }, null, 2),
  )
  if (redSurfaceCase) {
    const shader = await win.webContents.executeJavaScript('window.__fixtureCardFrame')
    assert(shader.printMask, 'Production card is missing the semantic print mask')
    assert(
      shader.redSurface === 0 || shader.redSurface > 0.95,
      'Red cover did not update the material',
    )
    const sample = await point(0, -1.5)
    const bitmap = (
      await win.capturePage({ x: sample.x - 12, y: sample.y - 12, width: 24, height: 24 })
    ).toBitmap()
    const sum = [0, 0, 0]
    for (let i = 0; i < bitmap.length; i += 4)
      for (let ch = 0; ch < 3; ch++) sum[ch] += bitmap[i + ch]
    const [b, g, r] = sum.map((value) => value / (bitmap.length / 4))
    assert(r > g + 15 && r > b + 15, 'Production red cover background lost its red hue')
    writeFileSync(
      join(output, `${testCase}-surface.json`),
      JSON.stringify({ r, g, b, shader }, null, 2),
    )
    await capture(win, 'rest')
  }
}
async function verifyCardText(win: BrowserWindow) {
  await win.webContents.executeJavaScript(`(() => {
    const gl = document.querySelector('.startup-album-canvas canvas').getContext('webgl2');
    window.__fixtureLastDraw = performance.now();
    for (const name of ['drawArrays', 'drawElements']) {
      const draw = gl[name].bind(gl);
      gl[name] = (...args) => { window.__fixtureLastDraw = performance.now(); return draw(...args) };
    }
  })()`)
  const idle = () => wait(win, 'performance.now() - window.__fixtureLastDraw > 250', 10000)
  await idle()
  if (testCase === 'text-small') {
    win.setSize(900, 620)
    await pause(100)
    await idle()
  }
  await capture(win, 'rest')
  const metrics = await win.webContents.executeJavaScript(`(() => {
    const canvas = document.querySelector('.startup-album-canvas canvas');
    const r = canvas.getBoundingClientRect();
    return {dpr:devicePixelRatio, width:innerWidth, height:innerHeight,
      bufferWidth:canvas.width, bufferHeight:canvas.height, canvasWidth:r.width,
      canvasHeight:r.height, x:Math.round(r.x+r.width/2+r.height*.14),
      y:Math.round(r.y+r.height/2-r.height*.21)};
  })()`)
  assert(
    metrics.bufferWidth === Math.floor(metrics.canvasWidth * Math.min(metrics.dpr, 2)) &&
      metrics.bufferHeight === Math.floor(metrics.canvasHeight * Math.min(metrics.dpr, 2)),
    'Card canvas undersamples the display',
  )
  if (testCase === 'text-hidpi') assert(metrics.dpr === 2, 'HiDPI case did not use 2x scaling')
  win.webContents.sendInputEvent({ type: 'mouseMove', x: metrics.x, y: metrics.y })
  await pause(100)
  await idle()
  await capture(win, 'hover')
  assert(
    await win.webContents.executeJavaScript(
      "document.querySelector('[data-startup-play]').getBoundingClientRect().bottom <= innerHeight",
    ),
    'Text case controls are clipped',
  )
  writeFileSync(join(output, `${testCase}-resolution.json`), JSON.stringify(metrics, null, 2))
}
async function verifyCardContrast(win: BrowserWindow) {
  // Observe the actual GL draws without exposing a production test API.
  await win.webContents.executeJavaScript(`(() => {
    const gl = document.querySelector('.startup-album-canvas canvas').getContext('webgl2');
    window.__fixtureLastDraw = performance.now();
    window.__fixtureForceSweep = false;
    window.__fixtureForcedSweepDraws = 0;
    for (const name of ['drawArrays', 'drawElements']) {
      const draw = gl[name].bind(gl);
      gl[name] = (...args) => {
        window.__fixtureLastDraw = performance.now();
        const program = gl.getParameter(gl.CURRENT_PROGRAM);
        const position = gl.getUniformLocation(program, 'uSweepPosition');
        const strength = gl.getUniformLocation(program, 'uSweepStrength');
        if (!window.__fixtureForceSweep || !position || !strength) return draw(...args);
        window.__fixtureForcedSweepDraws++;
        const previousPosition = gl.getUniform(program, position);
        const previousStrength = gl.getUniform(program, strength);
        // Stress the real shader at full sweep strength, including during hover.
        gl.uniform1f(position, .6);
        gl.uniform1f(strength, 1);
        const result = draw(...args);
        gl.uniform1f(position, previousPosition);
        gl.uniform1f(strength, previousStrength);
        return result;
      };
    }
  })()`)
  const idle = () => wait(win, 'performance.now() - window.__fixtureLastDraw > 250', 10000)
  await idle()
  const rect = await win.webContents.executeJavaScript(`(() => {
    const r = document.querySelector('.startup-album-canvas canvas').getBoundingClientRect();
    return {x:r.x, y:r.y, width:r.width, height:r.height, viewportWidth:innerWidth};
  })()`)
  const metrics: { name: string; dark: number; light: number }[] = []
  const measure = async (name: string) => {
    const page = (await win.webContents.capturePage()).toPNG()
    const metadata = await sharp(page).metadata()
    const ratio = metadata.width! / rect.viewportWidth
    // Sample the central checkerboard on the real cover, away from card edges.
    const { data, info } = await sharp(page)
      .extract({
        left: Math.round((rect.x + rect.width / 2 - rect.height * 0.09) * ratio),
        top: Math.round((rect.y + rect.height * 0.3) * ratio),
        width: Math.round(rect.height * 0.18 * ratio),
        height: Math.round(rect.height * 0.12 * ratio),
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const luminance = [] as number[]
    for (let i = 0; i < data.length; i += info.channels)
      luminance.push(data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722)
    luminance.sort((a, b) => a - b)
    const dark = luminance[Math.floor(luminance.length * 0.2)]
    const light = luminance[Math.floor(luminance.length * 0.8)]
    if (name === 'rest' || name === 'hover-1-1' || name === 'sweep' || name === 'returned')
      writeFileSync(join(output, `${testCase}-${name}.png`), page)
    assert(dark < 65 && light > 190, `Cover contrast lost at ${name}: ${dark}/${light}`)
    metrics.push({ name, dark, light })
  }
  await measure('rest')
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      win.webContents.sendInputEvent({
        type: 'mouseMove',
        x: Math.round(rect.x + rect.width / 2 + x * rect.height * 0.14),
        y: Math.round(rect.y + rect.height / 2 + y * rect.height * 0.21),
      })
      await pause(100)
      await idle()
      await measure(`hover-${x}-${y}`)
    }
  }
  await win.webContents.executeJavaScript('void (window.__fixtureForceSweep = true)')
  win.webContents.sendInputEvent({
    type: 'mouseMove',
    x: Math.round(rect.x + rect.width / 2 - rect.height * 0.14),
    y: Math.round(rect.y + rect.height / 2 - rect.height * 0.21),
  })
  await pause(100)
  await idle()
  assert(
    await win.webContents.executeJavaScript('window.__fixtureForcedSweepDraws > 0'),
    'Full-strength sweep was not rendered',
  )
  await measure('sweep')
  await win.webContents.executeJavaScript('void (window.__fixtureForceSweep = false)')
  win.webContents.sendInputEvent({ type: 'mouseMove', x: rect.x + 5, y: rect.y + 5 })
  await pause(100)
  await idle()
  await measure('returned')
  writeFileSync(join(output, `${testCase}-contrast.json`), JSON.stringify(metrics, null, 2))
}
function tone() {
  const rate = 44100,
    samples = rate * 12,
    data = Buffer.alloc(44 + samples * 2)
  data.write('RIFF')
  data.writeUInt32LE(data.length - 8, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(rate, 24)
  data.writeUInt32LE(rate * 2, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++)
    data.writeInt16LE(Math.round(Math.sin((i / rate) * 440 * Math.PI * 2) * 600), 44 + i * 2)
  return data
}

void app
  .whenReady()
  .then(async () => {
    const db = initializeDatabase()
    const tracks = new TrackRepository(db)
    const roots = new LibraryRootRepository(db)
    const music = join(profile, 'fixture-music')
    mkdirSync(music, { recursive: true })
    roots.upsertByPath(music)
    const artwork = ensureArtworkCacheDir(profile)
    const artworkKeys: string[] = []
    for (const color of redSurfaceCase ? ['#ed0011', '#ed0011'] : ['#22334e', '#dedbc3']) {
      const checkerboard = `<svg width="600" height="600" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="checks" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" fill="#181818"/><path d="M0 0h60v60H0zM60 60h60v60H60z" fill="#e8e8e8"/></pattern></defs><rect width="600" height="600" fill="url(#checks)"/></svg>`
      const data = await sharp(
        previewCover ??
          (contrastCase
            ? Buffer.from(checkerboard)
            : { create: { width: 600, height: 600, channels: 3, background: color } }),
      )
        .png()
        .toBuffer()
      // Seed the current cache format; legacy migration must not race a cover load.
      const key = await writeArtworkToCache(artwork, { data, mimeType: 'image/png' })
      assert(key, 'Could not create fixture artwork')
      artworkKeys.push(key)
    }
    const scanned: ScannedTrack[] = Array.from({ length: 24 }, (_, i) => {
      const filePath = join(music, `${i + 1}.wav`)
      const data = tone()
      writeFileSync(filePath, data)
      return {
        filePath,
        fileSize: data.length,
        fileMtimeMs: 100,
        title: `曲目 ${String((i % 12) + 1).padStart(2, '0')} · Track`,
        artist: fixtureArtist,
        albumArtist: fixtureArtist,
        album:
          i < 12
            ? (previewCase && process.env.AURALIS_STARTUP_ALBUM_TITLE) || '夜航 · Night Flight'
            : '在所有未被命名的夜晚里，重新听见你 · A Very Long Album Title',
        trackNo: (i % 12) + 1,
        discNo: 1,
        durationSeconds: 12,
        year: 2026,
        releaseDate: '2026',
        copyright: null,
        composer: null,
        genre: null,
        artworkCacheKey: artworkKeys[i < 12 ? 0 : 1],
        lyricsText: null,
        lyricsFormat: null,
        isrc: null,
        metadataSignature: `fixture-${i}`,
      }
    })
    tracks.upsertMany(scanned)
    db.prepare('UPDATE albums SET artwork_cache_key = CASE WHEN title = ? THEN ? ELSE ? END').run(
      scanned[0].album,
      artworkKeys[0],
      artworkKeys[1],
    )
    db.prepare('UPDATE track_metadata SET artwork_cache_key = NULL').run()
    if (testCase === 'empty') db.prepare("UPDATE tracks SET availability = 'missing'").run()
    if (testCase === 'fallback') {
      db.prepare('UPDATE albums SET artwork_cache_key = NULL').run()
      db.prepare('UPDATE track_metadata SET artwork_cache_key = NULL').run()
    }
    registerArtworkProtocol(artwork)
    registerAudioProtocol({
      getFilePathByTrackId: (id) => tracks.getFilePathById(id),
      getLibraryRootPaths: () => [music],
    })
    const register = ipcMain.handle.bind(ipcMain)
    ipcMain.handle = (channel, listener) =>
      register(channel, (event, ...args) => {
        if (channel === 'playback:get-audio-url')
          audioRequests.push({ at: Date.now(), trackId: args[0].trackId })
        return listener(event, ...args)
      })
    try {
      runtime = registerIpcHandlers(db, artwork)
    } finally {
      ipcMain.handle = register
    }

    // Seed preferences on the production origin using a window explicitly excluded from startup.
    const seed = createWindow({ showSplash: false })
    await wait(seed, 'window.__auralisAppReady === true')
    let previous = await seed.webContents.executeJavaScript(
      "localStorage.getItem('auralis-last-startup-album')",
    )
    await seed.webContents.executeJavaScript(
      `localStorage.setItem('auralis-startup-album-enabled', '${testCase === 'disabled' ? 'false' : 'true'}'); localStorage.setItem('auralis-theme', '${testCase === 'light' || testCase === 'contrast-light' || testCase === 'play-light' ? 'light' : 'dark'}'); localStorage.setItem('auralis-reduced-motion', '${testCase === 'light' || testCase === 'skip-reduced' || testCase === 'play-reduced' ? 'reduce' : 'system'}'); localStorage.setItem('auralis-volume', '0.5')`,
    )
    if (textCase || (playCase && previewCover)) {
      // Use the same album before/after a rendering change; retain real selection.
      previous = JSON.stringify({
        albumArtist: fixtureArtist,
        album: scanned[testCase === 'text-long' ? 0 : 12].album,
      })
      await seed.webContents.executeJavaScript(
        `localStorage.setItem('auralis-last-startup-album', ${JSON.stringify(previous)})`,
      )
    }
    if (testCase === 'recommendation-history') {
      const history = [0, 12].map((i) => ({
        albumArtist: fixtureArtist,
        album: scanned[i].album,
      }))
      previous = JSON.stringify(history[0])
      // Conflicting legacy preference proves the new history travels through the real IPC path.
      await seed.webContents.executeJavaScript(
        `localStorage.setItem('auralis-last-startup-album', ${JSON.stringify(JSON.stringify(history[1]))}); localStorage.setItem('auralis-startup-album-history', ${JSON.stringify(JSON.stringify(history))})`,
      )
    }
    const initialHistory = await seed.webContents.executeJavaScript(
      "localStorage.getItem('auralis-startup-album-history')",
    )
    seed.destroy()
    const win = createWindow()
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message)
    })
    win.webContents.on('render-process-gone', (_event, detail) =>
      errors.push(JSON.stringify(detail)),
    )
    // Place the real native window offscreen; input still goes through Electron.
    win.setPosition(-12000, -12000)
    const loaded = await new Promise<void>((resolve) =>
      win.webContents.once('did-finish-load', () => resolve()),
    )
    void loaded
    // Observe the real card draw and storage boundary before the splash ends.
    // A mounted button or an empty scene frame is not an actual presentation.
    await win.webContents.executeJavaScript(`(() => {
      window.__fixtureCardDraws = 0;
      window.__fixtureShownWrites = [];
      for (const name of ['drawArrays', 'drawElements']) {
        const draw = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function(...args) {
          const result = Reflect.apply(draw, this, args);
          const program = this.getParameter(this.CURRENT_PROGRAM);
          if (program && !this.isContextLost() && this.getUniformLocation(program, 'uCardFinish'))
            window.__fixtureCardDraws++;
          return result;
        };
      }
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'auralis-startup-album-history') {
          const card = document.querySelector('.startup-album-static');
          const image = card?.querySelector('img');
          const staticReady = Boolean(card && card.getBoundingClientRect().width > 0 &&
            (!card.classList.contains('has-artwork') || image?.complete && image.naturalWidth > 0));
          window.__fixtureShownWrites.push({cardDraws: window.__fixtureCardDraws, staticReady});
        }
        return Reflect.apply(setItem, this, [key, value]);
      };
    })()`)
    if (testCase === 'first-frame-cancel')
      await win.webContents.executeJavaScript(`(() => {
        const observer = new MutationObserver(() => {
          const overlay = document.querySelector('.startup-album-overlay');
          if (!overlay) return;
          observer.disconnect();
          window.__fixtureCancelledBeforeDraw = window.__fixtureCardDraws === 0;
          overlay.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
        });
        observer.observe(document.body, {childList:true, subtree:true});
      })()`)
    if (testCase === 'fallback' || testCase === 'play-fallback')
      await win.webContents.executeJavaScript(
        `void (HTMLCanvasElement.prototype.getContext = new Proxy(HTMLCanvasElement.prototype.getContext, {apply(target, self, args) { return self.dataset.engine?.startsWith('three.js') && String(args[0]).startsWith('webgl') ? null : Reflect.apply(target, self, args) }}))`,
      )
    const start = Date.now()
    if (testCase === 'controls-timing') {
      await win.webContents.executeJavaScript(`(() => {
        const probe = window.__fixtureControlsTiming = { samples: [], settledAt: null, controlsAt: null };
        for (const name of ['drawArrays', 'drawElements']) {
          const draw = WebGL2RenderingContext.prototype[name];
          WebGL2RenderingContext.prototype[name] = function(...args) {
            const result = Reflect.apply(draw, this, args);
            const program = this.getParameter(this.CURRENT_PROGRAM);
            if (program && !this.isContextLost() && this.getUniformLocation(program, 'uCardFinish')) {
              const position = this.getUniformLocation(program, 'uSweepPosition');
              if (probe.settledAt === null && position && this.getUniform(program, position) === 1.5)
                probe.settledAt = performance.now();
            }
            return result;
          };
        }
        const sample = () => {
          const overlay = document.querySelector('.startup-album-overlay');
          if (overlay) {
            const at = performance.now();
            const buttons = overlay.querySelectorAll('[data-startup-play], [data-startup-skip]').length;
            probe.samples.push({at, buttons, cardDraws: window.__fixtureCardDraws});
            if (buttons && probe.controlsAt === null) probe.controlsAt = at;
          }
        };
        const observer = new MutationObserver(sample);
        observer.observe(document.body, {childList: true, subtree: true});
      })()`)
      await wait(win, "Boolean(document.querySelector('.startup-album-overlay'))")
      await capture(win, 'entrance')
    }
    if (testCase === 'backdrop')
      await win.webContents.executeJavaScript(`(() => {
        const probe = window.__fixtureBackdrop = { samples: [], events: [], firstSceneFrame: null, firstCardFrame: null };
        const clear = WebGL2RenderingContext.prototype.clear;
        WebGL2RenderingContext.prototype.clear = function(...args) {
          if (probe.firstSceneFrame === null && this.canvas.closest?.('.startup-album-canvas') &&
              this.getParameter(this.FRAMEBUFFER_BINDING) === null)
            probe.firstSceneFrame = performance.now();
          return Reflect.apply(clear, this, args);
        };
        for (const name of ['drawArrays', 'drawElements']) {
          const draw = WebGL2RenderingContext.prototype[name];
          WebGL2RenderingContext.prototype[name] = function(...args) {
            const program = this.getParameter(this.CURRENT_PROGRAM);
            if (probe.firstCardFrame === null && program && !this.isContextLost() &&
                this.getUniformLocation(program, 'uCardFinish')) {
              probe.firstCardFrame = performance.now();
              // The second pass of a double-sided material may compile here.
              // Observe completion of the whole first card render batch.
              queueMicrotask(() => { probe.firstCardFrameCompleted = performance.now() });
            }
            return Reflect.apply(draw, this, args);
          };
        }
        const observer = new MutationObserver(() => {
          const layer = document.querySelector('.startup-album-backdrop');
          if (!layer) return;
          observer.disconnect();
          probe.mountedAt = performance.now();
          for (const type of ['transitionrun', 'transitionstart', 'transitionend'])
            layer.addEventListener(type, event => probe.events.push({
              type, at: performance.now(), property: event.propertyName, elapsed: event.elapsedTime,
            }));
          const sample = () => {
            const style = getComputedStyle(layer);
            probe.samples.push({ at: performance.now(), opacity: Number(style.opacity), background: style.backgroundColor });
            if (!probe.events.some(event => event.type === 'transitionend')) requestAnimationFrame(sample);
            else probe.done = true;
          };
          sample();
        });
        observer.observe(document.body, {childList: true, subtree: true});
      })()`)
    if (testCase === 'hidden-timeout') {
      await wait(win, "Boolean(document.querySelector('#splash.is-exiting'))")
      win.hide()
      await wait(win, 'window.__auralisSplashFinished === true')
      await pause(1600)
      assert(
        await win.webContents.executeJavaScript(
          "!document.querySelector('.startup-album-overlay')",
        ),
        'Card displayed while hidden',
      )
      win.showInactive()
      await pause(1500)
      assert(
        await win.webContents.executeJavaScript(
          "!document.querySelector('.startup-album-overlay') && !document.querySelector('.app-window').inert && localStorage.getItem('auralis-last-startup-album') === " +
            JSON.stringify(previous),
        ),
        'Expired hidden welcome displayed or remembered an album after restore',
      )
      await capture(win, 'restored-without-card')
    } else if (testCase === 'interrupted') {
      await wait(win, 'window.__auralisAppReady === true')
      assert(
        await win.webContents.executeJavaScript('!window.__auralisSplashFinished'),
        'Missed splash interruption window',
      )
      win.webContents.reload()
      await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
      await wait(win, 'window.__auralisAppReady === true')
      await pause(1500)
      assert(
        await win.webContents.executeJavaScript(
          "!document.querySelector('.startup-album-overlay') && localStorage.getItem('auralis-last-startup-album') === " +
            JSON.stringify(previous),
        ),
        'Interrupted welcome displayed or remembered an album',
      )
    } else if (testCase === 'first-frame-cancel') {
      await wait(win, 'window.__fixtureCancelledBeforeDraw === true')
      await wait(win, "!document.querySelector('.startup-album-overlay')")
      await pause(250)
      assert(
        await win.webContents.executeJavaScript(
          `window.__fixtureShownWrites.length === 0 && window.__fixtureCardDraws === 0 &&
            localStorage.getItem('auralis-startup-album-history') === ${JSON.stringify(initialHistory)} &&
            localStorage.getItem('auralis-last-startup-album') === ${JSON.stringify(previous)} &&
            !document.querySelector('.app-window').inert`,
        ),
        'Cancelling before the first card frame wrote presentation history or left the page locked',
      )
    } else if (testCase === 'disabled' || testCase === 'empty') {
      await wait(win, 'window.__auralisSplashFinished === true')
      await pause(1500)
      assert(
        await win.webContents.executeJavaScript(
          "!document.querySelector('.startup-album-overlay')",
        ),
        'Unexpected startup card',
      )
    } else {
      await wait(win, "Boolean(document.querySelector('[data-startup-play]'))")
      assert(
        await win.webContents.executeJavaScript(
          "!document.querySelector('#splash') && document.querySelector('.app-window').inert",
        ),
        'Card precedes splash or background is interactive',
      )
      assert(
        await win.webContents.executeJavaScript(
          "document.querySelectorAll('.startup-album-controls button').length === 2 && !document.querySelector('.startup-album-controls h1, .startup-album-eyebrow, .startup-album-artist, [data-startup-flip], [data-startup-details]')",
        ),
        'Startup actions contain removed copy or controls',
      )
      await wait(win, 'window.__fixtureShownWrites.length === 1')
      assert(
        await win.webContents.executeJavaScript(
          'window.__fixtureShownWrites[0].cardDraws > 0 || window.__fixtureShownWrites[0].staticReady',
        ),
        'Presentation history was written before a WebGL card draw or a loaded static card',
      )
      const shownHistory = await win.webContents.executeJavaScript(
        "localStorage.getItem('auralis-startup-album-history')",
      )
      if (testCase === 'controls-timing') {
        const probe = await win.webContents.executeJavaScript('window.__fixtureControlsTiming')
        writeFileSync(join(output, 'controls-timing.json'), JSON.stringify(probe, null, 2))
        assert(probe.samples[0]?.buttons === 0, 'Actions appeared when the overlay first mounted')
        assert(
          probe.settledAt !== null && probe.controlsAt >= probe.settledAt,
          'Actions appeared before the card entrance finished',
        )
        await capture(win, 'settled')
      }
      if (testCase === 'backdrop') {
        await wait(win, 'window.__fixtureBackdrop?.done === true')
        const probe = await win.webContents.executeJavaScript('window.__fixtureBackdrop')
        writeFileSync(join(output, 'backdrop-fade.json'), JSON.stringify(probe, null, 2))
        assert(probe.samples[0].opacity === 0, 'Backdrop did not start transparent')
        assert(
          probe.samples.some(
            (sample: { opacity: number }) => sample.opacity > 0.2 && sample.opacity < 0.8,
          ),
          'Backdrop jumped instead of fading',
        )
        assert(probe.samples.at(-1).opacity === 1, 'Backdrop did not reach its full concentration')
        const transition = probe.events.find(
          (event: { type: string }) => event.type === 'transitionend',
        )
        assert(
          transition.property === 'opacity' && Math.abs(transition.elapsed - 0.2) < 0.001,
          'Backdrop fade is not 200ms',
        )
        const begin = probe.events.find(
          (event: { type: string }) => event.type === 'transitionstart',
        )
        assert(
          probe.firstCardFrameCompleted !== undefined &&
            begin.at >= probe.firstCardFrameCompleted &&
            begin.at - probe.firstCardFrameCompleted < 120,
          'Backdrop was not synchronized with the first visible card frame',
        )
        await settleCard(win)
        await capture(win, 'settled')
        await skip(win)
      } else if (testCase.startsWith('hover-') || redSurfaceCase) {
        await verifyCardHover(win)
        await skip(win)
      } else if (textCase) {
        await verifyCardText(win)
        await skip(win)
      } else if (contrastCase) {
        await verifyCardContrast(win)
        await skip(win)
      } else if (playCase) {
        await playAlbum(win)
      } else if (testCase === 'controls') {
        await wait(win, 'document.activeElement?.hasAttribute("data-startup-play")')
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
        await wait(win, 'document.activeElement?.hasAttribute("data-startup-skip")')
        for (const selector of ['[data-startup-skip]', '[data-startup-play]']) {
          if (selector === '[data-startup-play]') {
            win.webContents.sendInputEvent({
              type: 'keyDown',
              keyCode: 'Tab',
              modifiers: ['shift'],
            })
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab', modifiers: ['shift'] })
          }
          await wait(win, `document.activeElement?.matches(${JSON.stringify(selector)})`)
          assert(
            await win.webContents.executeJavaScript(`(() => {
              const button = document.querySelector(${JSON.stringify(selector)});
              const style = getComputedStyle(button);
              return button.matches(':focus-visible') && style.outlineStyle !== 'none' &&
                parseFloat(style.outlineWidth) >= 2 && style.outlineColor !== 'rgba(0, 0, 0, 0)';
            })()`),
            `Missing visible keyboard focus: ${selector}`,
          )
        }
        await pause(1600)
        await capture(win, 'simplified-actions')
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      } else if (testCase === 'escape') {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      } else if (testCase === 'skip' || testCase.startsWith('skip-')) {
        if (testCase !== 'skip' && testCase !== 'skip-reduced') await settleCard(win)
        await skip(win)
        await wait(win, "!document.querySelector('.app-window').inert")
        assert(
          await win.webContents.executeJavaScript(
            "!document.querySelector('.transport-control-primary--playing')",
          ),
          'Skip started playback',
        )
        await capture(win, 'closed')
      } else {
        await pause(1600)
        await capture(win, 'ready')
        if (testCase === 'context') {
          await win.webContents.executeJavaScript(`(() => {
            const gl = document.querySelector('.startup-album-canvas canvas').getContext('webgl2');
            window.__fixtureDraws = 0;
            for (const name of ['drawArrays', 'drawElements']) { const draw = gl[name].bind(gl); gl[name] = (...args) => { window.__fixtureDraws++; return draw(...args) } }
            window.__fixtureContext = gl.getExtension('WEBGL_lose_context');
          })()`)
          let idleDraws = -1
          const settleDeadline = Date.now() + 5000
          while (Date.now() < settleDeadline) {
            const draws = await win.webContents.executeJavaScript('window.__fixtureDraws')
            if (draws === idleDraws) break
            idleDraws = draws
            await pause(250)
          }
          await pause(200)
          assert(
            await win.webContents.executeJavaScript(`window.__fixtureDraws === ${idleDraws}`),
            'Idle card kept drawing',
          )
          const hover = await win.webContents.executeJavaScript(`(() => {
            const r = document.querySelector('.startup-album-canvas canvas').getBoundingClientRect();
            return {x: Math.round(r.left + r.width / 2 + 45), y: Math.round(r.top + r.height / 2 + 25), outsideX: Math.round(r.left + 10), outsideY: Math.round(r.top + 10)};
          })()`)
          win.webContents.sendInputEvent({
            type: 'mouseMove',
            x: hover.outsideX,
            y: hover.outsideY,
          })
          await pause(150)
          assert(
            await win.webContents.executeJavaScript(`window.__fixtureDraws === ${idleDraws}`),
            'Whitespace woke idle card rendering',
          )
          win.webContents.sendInputEvent({ type: 'mouseMove', x: hover.x, y: hover.y })
          await pause(100)
          assert(
            await win.webContents.executeJavaScript(`window.__fixtureDraws > ${idleDraws}`),
            'Pointer did not drive foil tilt',
          )
          win.hide()
          await pause(100)
          const hiddenDraws = await win.webContents.executeJavaScript('window.__fixtureDraws')
          await pause(200)
          assert(
            await win.webContents.executeJavaScript(`window.__fixtureDraws === ${hiddenDraws}`),
            'Hidden card kept drawing',
          )
          win.showInactive()
          await win.webContents.executeJavaScript('window.__fixtureContext.loseContext()')
          await wait(win, "Boolean(document.querySelector('.startup-album-static'))")
          await pause(100)
          await win.webContents.executeJavaScript('window.__fixtureContext.restoreContext()')
          await wait(win, "!document.querySelector('.startup-album-static')")
          await capture(win, 'restored')
        }
        if (testCase === 'fallback')
          assert(
            await win.webContents.executeJavaScript(
              "Boolean(document.querySelector('.startup-album-static'))",
            ),
            'Missing static fallback',
          )
        if (testCase === 'light') {
          win.setSize(900, 620)
          await win.webContents.executeJavaScript(
            'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
          )
          await pause(200)
          await capture(win, 'compact')
          assert(
            await win.webContents.executeJavaScript(
              "document.querySelector('[data-startup-play]').getBoundingClientRect().bottom <= innerHeight",
            ),
            'Controls are clipped',
          )
        }
        await skip(win)
      }
      await wait(win, "!document.querySelector('.startup-album-overlay')")
      const current = await win.webContents.executeJavaScript(
        "localStorage.getItem('auralis-last-startup-album')",
      )
      assert(current, 'Shown album was not persisted')
      if (previous) assert(current !== previous, 'Cold start repeated the previous album')
      const savedHistory = await win.webContents.executeJavaScript(
        "localStorage.getItem('auralis-startup-album-history')",
      )
      assert(savedHistory === shownHistory, 'Closing or skipping changed presentation history')
      assert(
        await win.webContents.executeJavaScript('window.__fixtureShownWrites.length === 1'),
        'Context restoration or exit recorded the same presentation again',
      )
      const history = JSON.parse(savedHistory)
      for (const entry of [...history, JSON.parse(current)])
        assert(
          Object.keys(entry).sort().join(',') === 'album,albumArtist',
          'Presentation preferences contain fields beyond the album identity',
        )
      assert(
        history.length <= 10 && JSON.stringify(history[0]) === current,
        'Presentation history is unbounded or does not start with the shown album',
      )
      if (testCase === 'recommendation-history') {
        assert(
          history.length === 2 &&
            history[0].album === scanned[12].album &&
            history[1].album === scanned[0].album,
          'Small-library cooldown did not release the oldest album',
        )
      }
    }
    if (testCase === 'settings') {
      await click(win, '[data-settings-trigger]')
      await wait(win, "Boolean(document.querySelector('[data-startup-setting]'))")
      await click(win, '[data-startup-setting]')
      assert(
        await win.webContents.executeJavaScript(
          "localStorage.getItem('auralis-startup-album-enabled') === 'false'",
        ),
        'Settings switch did not persist',
      )
      await capture(win, 'switch-off')
    }
    // A renderer reload must not claim or present another card.
    win.webContents.reload()
    await new Promise<void>((resolve) => win.webContents.once('did-finish-load', () => resolve()))
    await wait(win, 'window.__auralisAppReady === true')
    await pause(1300)
    assert(
      await win.webContents.executeJavaScript("!document.querySelector('.startup-album-overlay')"),
      'Reload repeated startup card',
    )
    const later = createWindow({ showSplash: false })
    await wait(later, 'window.__auralisAppReady === true')
    await pause(1100)
    assert(
      await later.webContents.executeJavaScript(
        "!document.querySelector('.startup-album-overlay')",
      ),
      'Later window repeated startup card',
    )
    later.destroy()
    const unexpectedErrors = errors.filter(
      (message) =>
        !(
          (testCase === 'fallback' || testCase === 'play-fallback') &&
          message.includes('THREE.WebGLRenderer: Error creating WebGL context')
        ),
    )
    assert(!unexpectedErrors.length, `Console errors: ${unexpectedErrors.join('\n')}`)
    console.log(
      'STARTUP_ALBUM_RESULT ' +
        JSON.stringify({
          testCase,
          ok: true,
          elapsedMs: Date.now() - start,
          reload: true,
          laterWindow: true,
          audible: playCase,
          errors: unexpectedErrors,
          expectedWebglFailure: testCase === 'fallback' || testCase === 'play-fallback',
          skipElapsedMs,
          playElapsedMs,
        }),
    )
  })
  .then(async () => {
    clearTimeout(watchdog)
    for (const win of BrowserWindow.getAllWindows()) win.destroy()
    await runtime?.shutdown()
    closeDatabase()
    app.quit()
  })
  .catch(async (error: unknown) => {
    console.error(error)
    clearTimeout(watchdog)
    await runtime?.shutdown()
    closeDatabase()
    app.exit(1)
  })
