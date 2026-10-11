const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
app.setPath('userData', path.join(__dirname, 'isolated-profile-v2'))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 940, height: 600, show: false, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  const errors = []
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message) })
  const js = code => win.webContents.executeJavaScript(code)
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const visible = () => js(`!!document.querySelector('.library-search-overlay:not(.search-overlay-leave-active) .library-search-bar')`)
  const waitHidden = async () => {
    for (let i=0;i<60;i++) { if (await js(`!document.querySelector('.library-search-bar')`)) return; await pause(25) }
    throw new Error('Search did not finish hiding')
  }
  const geometry = () => js(`(() => {
    const rect = selector => { const r=document.querySelector(selector).getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height} };
    return {page:rect('.library-page'),zone:rect('.library-search-zone'),header:rect('.library-flat-track-header'),row:rect('.song-row')}
  })()`)
  const move = async (x,y) => {
    x=Math.round(x);y=Math.round(y)
    await js('window.__lastHover=null')
    win.webContents.sendInputEvent({ type:'mouseMove',x,y })
    await pause(120)
    const event = await js('window.__lastHover')
    assert(event && Math.abs(event.x-x)<1 && Math.abs(event.y-y)<1, `Native mouse event not delivered: ${JSON.stringify({x,y,event})}`)
  }
  const key = async keyCode => {
    win.webContents.sendInputEvent({type:'keyDown',keyCode})
    win.webContents.sendInputEvent({type:'keyUp',keyCode})
    await pause(120)
  }
  const evidence = []
  for (const width of [940,1440]) for (const theme of ['dark','light']) for (const zoom of [1,1.25]) {
    win.setContentSize(width,600)
    win.webContents.setZoomFactor(zoom)
    await win.loadURL(process.argv[2])
    for (let i=0;i<80;i++) { if (await js(`!!document.querySelector('.song-row')`)) break; await pause(50) }
    assert(await js(`!!document.querySelector('.song-row')`), 'Page failed to load')
    await js(`document.documentElement.dataset.theme='${theme}'`)
    await pause(180)
    const before = await geometry()
    const x = (before.zone.left+before.zone.right)/2
    assert(Math.abs(before.zone.height-48)<0.01, 'Missing reserved search row')
    assert(before.header.top>=before.zone.bottom-0.01, 'Header overlaps search row')
    assert(Math.abs(before.row.height-48)<0.01, 'Track height changed')
    for (const y of [before.header.top+16,before.header.bottom+8,before.row.top+20]) {
      await move(x,y)
      assert(!await visible(), `Table revealed search: ${JSON.stringify({width,theme,zoom,x,y})}`)
    }
    await js(`document.querySelector('.library-list-scroll').scrollTop=32`)
    await pause(80)
    const songY=before.header.bottom+8
    assert(await js(`!!document.elementFromPoint(${x},${songY})?.closest('.song-row')`),'Regression point is not inside a song row')
    await move(x,songY)
    assert(!await visible(),'Scrolled song row revealed search')
    await move(before.page.left-8,before.zone.top+20)
    assert(!await visible(),'Sidebar revealed search')
    await move(before.zone.left+8,before.zone.top+20)
    assert(!await visible(),'Search corner revealed search')
    await move(x,before.zone.top+20)
    assert(await visible(),'Dedicated search zone did not reveal search')
    const shown=await geometry()
    assert(Math.abs(shown.header.top-before.header.top)<0.01,'Header moved when search appeared')
    await move(x,songY)
    assert(!await visible(),'Search did not hide after moving into a song')
    await waitHidden()
    const hidden=await geometry()
    assert(Math.abs(hidden.header.top-before.header.top)<0.01,'Header moved when search disappeared')
    await key('/')
    assert(await visible(),'Slash failed to open search')
    assert(await js(`document.activeElement?.classList.contains('library-search-input')`),'Slash failed to focus input')
    await move(x,songY)
    assert(await visible(),'Song row dismissed focused search')
    await key('Escape')
    await waitHidden()
    await move(x,songY+1)
    assert(!await visible(),'Song row reopened search after Escape')
    evidence.push({width,theme,zoom,devicePixelRatio:await js('devicePixelRatio'),before,shown,hidden,checks:'native mouse: header / gap / song / scrolled song / sidebar / corner / search; native keys: slash / Escape; stable layout'})
    if (width===1440 && zoom===1) await fs.writeFile(path.join(__dirname,`fixed-${theme}.png`),(await win.webContents.capturePage()).toPNG())
  }
  const coverEvidence=[]
  for (const width of [940,1440]) {
    win.setContentSize(width,600)
    win.webContents.setZoomFactor(1)
    const url=new URL(process.argv[2]);url.searchParams.set('mode','cover')
    await win.loadURL(url.href)
    for(let i=0;i<80;i++) { if(await js(`!!document.querySelector('.cover-track-row')`)) break;await pause(50) }
    assert(await js(`!!document.querySelector('.cover-track-row')`),'Cover page failed to load')
    const zone=await js(`(() => {const r=document.querySelector('.library-search-zone').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top} })()`)
    const rowTop=await js(`document.querySelector('.cover-track-row').getBoundingClientRect().top`)
    await move(zone.left+8,zone.top+20)
    assert(!await visible(),'Cover corner revealed search')
    await move((zone.left+zone.right)/2,zone.top+20)
    assert(await visible(),'Cover hover failed')
    assert(Math.abs(rowTop-await js(`document.querySelector('.cover-track-row').getBoundingClientRect().top`))<0.01,'Cover content shifted')
    await move((zone.left+zone.right)/2,zone.top+100)
    await waitHidden()
    coverEvidence.push({width,checks:'native pointer: cover search show/hide, no content shift'})
  }
  if(errors.length) throw new Error(JSON.stringify(errors))
  await fs.writeFile(path.join(__dirname,'evidence-v2.json'),JSON.stringify(evidence,null,2))
  await fs.writeFile(path.join(__dirname,'cover-evidence-v2.json'),JSON.stringify(coverEvidence,null,2))
  console.log(`Passed ${evidence.length} flat + ${coverEvidence.length} cover full Renderer scenarios with native mouse and keyboard events.`)
  app.quit()
}).catch(error=>{console.error(error);app.exit(1)})
