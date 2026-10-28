import { app, BrowserWindow } from 'electron'
import { mkdtempSync } from 'node:fs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'auralis-inspection-perf-')))
const output = path.resolve(
  process.env.PERF_OUTPUT || 'output/badge-case-material/performance-2026-10-25',
)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const variants = (process.env.PERF_VARIANTS || 'baseline').split(',')
const rounds = Number(process.env.PERF_WARM_ROUNDS || 3)
let win, server
const timeout = setTimeout(() => {
  console.error('Performance capture timed out')
  app.exit(1)
}, 180000)
const instrument = String.raw`(() => {
  const config=window.__perfConfig;
  const nativeRaf=window.requestAnimationFrame.bind(window);
  const phase=()=>window.badgeInspector.snapshot().phase;
  const probe={active:false,callbacks:[],intervals:[],calls:{},frames:[],firstEntering:null,firstInspecting:null,skippedFoam:0};
  window.__perf=probe;
  window.requestAnimationFrame=callback=>nativeRaf(time=>{
    if(config.freezeFoam&&callback.name==='tick'){probe.skippedFoam++;return}
    if(!probe.active){callback(time);return}
    const before=phase(),foamBefore=window.foamMaterial.snapshot().frames,start=performance.now();
    callback(time);
    const duration=performance.now()-start,foam=window.foamMaterial.snapshot();
    probe.callbacks.push({name:callback.name,phase:before,duration,time,start,foam:foam.frames>foamBefore?foam.lastDrawMs:0});
  });
  for(const method of ['compileShader','linkProgram','getProgramParameter','texImage2D','texSubImage2D','generateMipmap','drawArrays','drawElements']){
    const original=WebGL2RenderingContext.prototype[method];
    WebGL2RenderingContext.prototype[method]=function(...args){
      if(!probe.active)return original.apply(this,args);
      const start=performance.now(),result=original.apply(this,args),duration=performance.now()-start;
      const stat=probe.calls[method]??={count:0,total:0,max:0};stat.count++;stat.total+=duration;stat.max=Math.max(stat.max,duration);
      return result;
    };
  }
  if(config.noShadow)document.querySelector('.inspect-canvas').style.filter='none';
  if(config.badgeDpr)Object.defineProperty(window,'devicePixelRatio',{configurable:true,get:()=>config.badgeDpr});
  window.__startPerf=(badgeId='hours-100')=>{
    Object.assign(probe,{active:true,callbacks:[],intervals:[],calls:{},frames:[],firstEntering:null,firstInspecting:null,clicked:performance.now(),skippedFoam:0,foamStart:window.foamMaterial.snapshot()});
    let previous,previousPhase;
    const sample=time=>{
      const state=window.badgeInspector.snapshot(),now=performance.now();
      if(state.phase==='entering'){
        probe.firstEntering??=now;
        if(previousPhase==='entering')probe.intervals.push(time-previous);
        probe.frames.push({time,now,progress:state.progress,rendered:state.renderer.frames});
      }
      if(state.phase==='inspecting'){probe.firstInspecting=now;probe.foamEnd=window.foamMaterial.snapshot();probe.active=false;return}
      previous=time;previousPhase=state.phase;
      if(probe.active)nativeRaf(sample);
    };
    nativeRaf(sample);
    document.querySelector('[data-badge="'+badgeId+'"]').click();
  };
})()`

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b),
    count = sorted.length
  const total = values.reduce((a, b) => a + b, 0)
  return {
    count,
    total,
    mean: total / (count || 1),
    p50: sorted[Math.floor((count - 1) * 0.5)] ?? 0,
    p95: sorted[Math.floor((count - 1) * 0.95)] ?? 0,
    max: sorted.at(-1) ?? 0,
  }
}
function summarize(raw) {
  const entry = raw.callbacks.filter((value) => value.phase === 'entering')
  const groups = {}
  for (const item of entry) (groups[item.name] ??= []).push(item.duration)
  const wall = raw.frames.slice(1).map((value, i) => value.now - raw.frames[i].now)
  const rendered = entry.filter((value) => value.name === 'draw')
  const drawIntervals = rendered.slice(1).map((value, i) => value.start - rendered[i].start)
  return {
    loadingToFirstEntering: raw.firstEntering - raw.clicked,
    totalToSettled: raw.firstInspecting - raw.clicked,
    intervals: stats(raw.intervals),
    intervalsOver25ms: raw.intervals.filter((value) => value > 25).length,
    cadenceFps: 1000 / stats(raw.intervals).mean,
    wallIntervals: stats(wall),
    wallIntervalsOver25ms: wall.filter((value) => value > 25).length,
    renderIntervals: stats(drawIntervals),
    callbacks: Object.fromEntries(
      Object.entries(groups).map(([name, values]) => [name, stats(values)]),
    ),
    foamDraws: stats(entry.filter((value) => value.foam > 0).map((value) => value.foam)),
    glCalls: raw.calls,
    skippedFoam: raw.skippedFoam,
  }
}
async function main() {
  await app.whenReady()
  await mkdir(output, { recursive: true })
  const { startServer } = await import(
    pathToFileURL(path.resolve('demo/archive/badge-case-material/serve.mjs'))
  )
  const instance = await startServer(0)
  server = instance.server
  win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    useContentSize: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      backgroundThrottling: false,
    },
  })
  const run = (code) => win.webContents.executeJavaScript(code)
  const until = async (code) => {
    for (let i = 0; i < 400; i++) {
      if (await run(code)) return
      await wait(15)
    }
    throw new Error('Timed out: ' + code)
  }
  win.webContents.debugger.attach('1.3')
  const result = {
    scope:
      'Isolated Electron offscreen renderer. No screenshots, PNG encoding, or throttling during measured runs. Source stays fixed during each run; diagnostic variants exist only in page memory.',
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    featureStatus: app.getGPUFeatureStatus(),
    variants: [],
  }
  for (const variant of variants) {
    await win.loadURL(instance.url)
    await until(
      `document.documentElement.dataset.ready==='true'&&!window.foamMaterial.snapshot().running`,
    )
    await run('document.fonts.ready')
    await wait(250)
    const config = {
      freezeFoam: variant.includes('no-foam'),
      noShadow: variant.includes('no-shadow'),
      badgeDpr: variant.includes('dpr1') ? 1 : 0,
    }
    await run(`window.__perfConfig=${JSON.stringify(config)}`)
    await run(instrument)
    const runs = []
    for (let index = 0; index <= rounds; index++) {
      await run('window.__startPerf()')
      await until(`window.badgeInspector.snapshot().phase==='inspecting'&&!window.__perf.active`)
      const raw = await run('window.__perf'),
        summary = summarize(raw)
      runs.push({ kind: index === 0 ? 'first' : 'warm', index, summary, raw })
      await wait(450)
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await until(`window.badgeInspector.snapshot().phase==='closed'`)
      await wait(400)
    }
    const graphics = await run(
      `(() => {const canvas=document.querySelector('.inspect-canvas'),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return {width:innerWidth,height:innerHeight,actualDpr:${await run('window.__perfConfig.badgeDpr||devicePixelRatio')},canvas:[canvas.width,canvas.height],foam:window.foamMaterial.snapshot(),renderer:gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)}})()`,
    )
    let cpuProfile
    if (variant === 'baseline') {
      await win.webContents.debugger.sendCommand('Profiler.enable')
      await win.webContents.debugger.sendCommand('Profiler.start')
      await run('window.__startPerf()')
      await until(`window.badgeInspector.snapshot().phase==='inspecting'&&!window.__perf.active`)
      cpuProfile = (await win.webContents.debugger.sendCommand('Profiler.stop')).profile
      await writeFile(path.join(output, 'warm-entry.cpuprofile'), JSON.stringify(cpuProfile))
      await win.webContents.debugger.sendCommand('Profiler.disable')
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await until(`window.badgeInspector.snapshot().phase==='closed'`)
      await wait(400)
      await run(`window.__startPerf('hours-500')`)
      await until(`window.badgeInspector.snapshot().phase==='inspecting'&&!window.__perf.active`)
      const raw = await run('window.__perf')
      runs.push({ kind: 'switch-badge', summary: summarize(raw), raw })
      await wait(450)
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await until(`window.badgeInspector.snapshot().phase==='closed'`)
    }
    result.variants.push({ variant, config, graphics, runs })
    console.log(
      JSON.stringify({
        variant,
        graphics: { renderer: graphics.renderer, canvas: graphics.canvas },
        runs: runs.map((value) => ({ kind: value.kind, ...value.summary })),
      }),
    )
  }
  result.hashes = {}
  for (const file of [
    'badgeInspector.js',
    'inspectRenderer.js',
    'pressureSurface.js',
    'pressurePainter.js',
    'pressureWorker.js',
    'styles.css',
  ])
    result.hashes[file] = createHash('sha256')
      .update(await readFile(path.resolve('demo/archive/badge-case-material', file)))
      .digest('hex')
  const file = path.join(output, `report-${variants.join('_')}.json`)
  await writeFile(file, JSON.stringify(result, null, 2))
  console.log(file)
  clearTimeout(timeout)
  win.destroy()
  server.close()
  app.exit(0)
}
main().catch((error) => {
  console.error(error)
  clearTimeout(timeout)
  server?.close()
  app.exit(1)
})
