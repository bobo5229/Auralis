import { app, BrowserWindow } from 'electron'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve('output/font-budget-check')
await mkdir(root, { recursive: true })
app.setPath('userData', join(root, 'isolated-profile'))
const variants = []
for (const family of ['HarmonyOS_Sans_SC', 'MiSans']) {
  for (const name of await readdir(resolve('src/renderer/assets/fonts', family))) {
    if (!name.endsWith('.ttf')) continue
    const packed = (await readdir(resolve('out/renderer/assets'))).find(
      (asset) => asset.startsWith(name.slice(0, -4) + '-') && asset.endsWith('.woff2'),
    )
    if (!packed) throw new Error('Missing built font: ' + name)
    variants.push({
      name,
      source: pathToFileURL(resolve('src/renderer/assets/fonts', family, name)).href,
      packed: pathToFileURL(resolve('out/renderer/assets', packed)).href,
    })
  }
}
await writeFile(join(root, 'index.html'), '<html><body style="background:#f9f6ef;color:#242424;padding:24px"></body></html>')
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 1000, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  const errors = []
  win.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message) })
  try {
    await win.loadFile(join(root, 'index.html'))
    const results = await win.webContents.executeJavaScript(`(async () => {
      const results = [];
      const samples = ['中文简体 繁體字 音樂專輯 聆听收藏', 'かなカナ 한글 ABC xyz 0123456789', 'é Å Ω Ж • — 𠀀'];
      for (const variant of ${JSON.stringify(variants)}) {
        const original = await new FontFace('Original', 'url("' + variant.source + '")').load();
        const packed = await new FontFace('Packed', 'url("' + variant.packed + '")').load();
        document.fonts.add(original); document.fonts.add(packed);
        for (const size of [14, 32]) for (const sample of samples) {
          const pixels = [], widths = [];
          for (const family of ['Original', 'Packed']) {
            const canvas = document.createElement('canvas'); canvas.width=1100; canvas.height=80;
            const ctx=canvas.getContext('2d', {willReadFrequently:true}); ctx.font=size+'px "'+family+'"'; ctx.fillText(sample,4,50);
            widths.push(ctx.measureText(sample).width); pixels.push(ctx.getImageData(0,0,1100,80).data);
          }
          if (widths[0]!==widths[1] || pixels[0].some((value,index)=>value!==pixels[1][index])) throw new Error('Rendering mismatch: '+variant.name+' / '+size+' / '+sample);
        }
        const row=document.createElement('div'); row.style.cssText='font:24px Packed;margin-bottom:16px'; row.textContent=variant.name+' · 音樂专辑 かな 한글 ABC 123'; document.body.append(row);
        // Keep each specimen's loaded face after switching to the next pair.
        const family='Specimen'+results.length;
        const face=await new FontFace(family,'url("'+variant.packed+'")').load(); document.fonts.add(face); row.style.fontFamily=family;
        results.push({name:variant.name,status:packed.status,samples:6,pixelsEqual:true}); document.fonts.delete(original); document.fonts.delete(packed);
      }
      return results;
    })()`)
    if (results.length !== 12 || errors.length) throw new Error(JSON.stringify({results, errors}))
    await win.webContents.executeJavaScript('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))')
    await writeFile(join(root, 'specimen.png'), (await win.webContents.capturePage()).toPNG())
    await writeFile(join(root, 'report.json'), JSON.stringify({ passed: true, results, errors }, null, 2))
    console.log('12 built WOFF2 fonts decoded; 72 text/size comparisons are pixel-identical to original TTFs.')
    app.exit(0)
  } catch (error) {
    await writeFile(join(root, 'report.json'), JSON.stringify({passed:false,error:String(error),errors},null,2))
    console.error(error); app.exit(1)
  }
})
