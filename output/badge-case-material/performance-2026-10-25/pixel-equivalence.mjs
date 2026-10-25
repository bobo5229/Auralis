import { app, BrowserWindow } from 'electron'
import { mkdtempSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'auralis-foam-pixels-')))
const folder = path.resolve('output/badge-case-material/performance-2026-10-25')
let win, server
async function main() {
  await app.whenReady()
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
  await win.loadURL(instance.url)
  const run = (source) => win.webContents.executeJavaScript(source)
  for (let i = 0; i < 200; i++) {
    if (await run(`document.documentElement.dataset.ready==='true'`)) break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  const before = (
    await readFile(path.join(folder, 'optimization-before/pressureSurface.js'), 'utf8')
  ).replace("from './distanceField.js'", `from '${instance.url}distanceField.js'`)
  await run(`window.__beforeFoamSource=${JSON.stringify(before)}`)
  if (process.env.FOAM_FORCE_FALLBACK === '1')
    await run(`void(window.Worker=function(){throw new Error('Compatibility-path check')})`)
  const report = await run(`(async()=>{
    await document.fonts.ready;
    const url=URL.createObjectURL(new Blob([window.__beforeFoamSource],{type:'text/javascript'}));
    const before=await import(url),after=await import('/pressureSurface.js');
    const entries=(await (await fetch('/catalog.json')).json()).filter(entry=>entry.series==='hours');
    const original=document.querySelector('.foam-sheet'),copies=[];
    for(const factory of [before.createPressureSurface,after.createPressureSurface]){
      const sheet=original.cloneNode(true);sheet.querySelector('canvas').remove();
      Object.assign(sheet.style,{position:'fixed',left:'-3000px',top:'0',minWidth:'0',width:original.clientWidth+'px',visibility:'hidden'});
      document.body.append(sheet);const row=sheet.querySelector('.badge-row'),surface=await factory(sheet,row);surface.setBadges(entries);
      copies.push({sheet,row,surface});
    }
    const nativeRaf=requestAnimationFrame,nativeCancel=cancelAnimationFrame;
    await new Promise(resolve=>nativeRaf(()=>nativeRaf(resolve)));
    const pending=new Map();let nextId=1,time=performance.now();
    window.requestAnimationFrame=callback=>{const id=nextId++;pending.set(id,callback);return id};
    window.cancelAnimationFrame=id=>pending.delete(id);
    const steps=count=>{for(let n=0;n<count;n++){time+=34;const callbacks=[...pending.values()];pending.clear();for(const callback of callbacks)callback(time)}};
    const remove=(id,value)=>{for(const copy of copies){copy.row.querySelector('[data-badge="'+id+'"]').setAttribute('aria-pressed',String(value));copy.surface.setRemoved(id,value)}};
    const checks=[];
    const compare=async name=>{
      for(let i=0;copies.some(copy=>copy.surface.snapshot().pendingPaint);i++) {
        if(i>1000)throw new Error('Worker did not settle');
        await new Promise(resolve=>setTimeout(resolve,1));
      }
      const [oldCanvas,newCanvas]=copies.map(copy=>copy.sheet.querySelector('canvas'));
      if(oldCanvas.width!==newCanvas.width||oldCanvas.height!==newCanvas.height)throw new Error('Canvas dimensions differ');
      const oldPixels=oldCanvas.getContext('2d').getImageData(0,0,oldCanvas.width,oldCanvas.height).data;
      const newPixels=newCanvas.getContext('2d').getImageData(0,0,newCanvas.width,newCanvas.height).data;
      let changedChannels=0,maxDifference=0;
      for(let i=0;i<oldPixels.length;i++){const difference=Math.abs(oldPixels[i]-newPixels[i]);if(difference)changedChannels++;maxDifference=Math.max(maxDifference,difference)}
      const snapshots=copies.map(copy=>copy.surface.snapshot());
      const result={name,changedChannels,maxDifference,physicsEqual:JSON.stringify(snapshots[0].fields)===JSON.stringify(snapshots[1].fields),drawPixels:snapshots[1].lastDrawPixels,surfacePixels:newCanvas.width*newCanvas.height};
      checks.push(result);if(changedChannels||!result.physicsEqual)throw new Error(JSON.stringify(result));
    };
    await compare('initial full pressure');
    remove('hours-100',true);steps(1);await compare('single badge first rebound frame');
    steps(5);await compare('single badge intermediate rebound');
    steps(54);await compare('retained imprint at rest');
    remove('hours-500',true);steps(10);await compare('neighbour changes beside an existing imprint');
    remove('hours-100',false);steps(3);remove('hours-100',true);remove('hours-500',false);steps(4);await compare('rapid reversed motion and overlapping bounds');
    for(const entry of entries)remove(entry.id,true);steps(60);await compare('all impressions retained');
    remove('hours-100',false);steps(2);
    for(const copy of copies)copy.sheet.style.width='860px';
    await new Promise(resolve=>nativeRaf(()=>nativeRaf(resolve)));await compare('resize during motion');
    steps(60);await compare('resized retained surface at rest');
    const backend=copies[1].surface.snapshot().backend;
    for(const copy of copies){copy.surface.dispose();copy.sheet.remove()}
    window.requestAnimationFrame=nativeRaf;window.cancelAnimationFrame=nativeCancel;URL.revokeObjectURL(url);
    return {passed:true,backend,dpr:devicePixelRatio,scope:'Exact RGBA comparison of original and optimized real Canvas2D renderers under the same deterministic pressure clock',checks};
  })()`)
  await writeFile(
    path.join(
      folder,
      process.env.FOAM_FORCE_FALLBACK === '1'
        ? 'pixel-equivalence-fallback.json'
        : 'pixel-equivalence.json',
    ),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify(report))
  win.destroy()
  server.close()
  app.exit(0)
}
main().catch((error) => {
  console.error(error)
  server?.close()
  app.exit(1)
})
