const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
app.setPath('userData', path.join(__dirname, 'isolated-profile'))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 330, height: 300, show: false, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true } })
  await win.loadURL(process.argv[2])
  await new Promise(resolve => setTimeout(resolve, 500))
  const evidence = await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[title="filters"] svg')).map(svg => {
    const r=svg.getBoundingClientRect(), box=svg.getBBox(), style=getComputedStyle(svg);
    return {theme:svg.closest('[data-theme]').dataset.theme,width:r.width,height:r.height,stroke:style.stroke,lineWidth:style.strokeWidth,box:{x:box.x,y:box.y,width:box.width,height:box.height}};
  })`)
  if(evidence.length!==2 || evidence.some(e => e.width!==20 || e.height!==20 || e.box.x<1 || e.box.y<1 || e.box.x+e.box.width>23 || e.box.y+e.box.height>23)) throw new Error('Icon missing or outside canvas')
  await fs.writeFile(path.join(__dirname,'preview.png'), (await win.webContents.capturePage()).toPNG())
  await fs.writeFile(path.join(__dirname,'evidence.json'),JSON.stringify(evidence,null,2))
  console.log('Dark/light actual sidebar icon and toolbar styles rendered without SVG clipping.')
  win.destroy();app.exit(0)
}).catch(error=>{console.error(error);app.exit(1)})
