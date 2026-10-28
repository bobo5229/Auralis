const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
app.setPath('userData', path.join(__dirname, 'repro-profile'))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 940, height: 540, show: false, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  await win.loadURL(process.argv[2])
  const js = code => win.webContents.executeJavaScript(code)
  for (let i = 0; i < 60; i++) { if (await js(`!!document.querySelector('.song-row')`)) break; await new Promise(resolve => setTimeout(resolve, 50)) }
  await js(`document.querySelector('.library-list-scroll').scrollTop=32`)
  await new Promise(resolve => setTimeout(resolve, 300))
  const result = await js(`(() => {
    const header=document.querySelector('.library-flat-track-header').getBoundingClientRect();
    const page=document.querySelector('.library-page').getBoundingClientRect();
    const x=page.left+page.width/2,y=header.bottom+8;
    const target=document.elementFromPoint(x,y);
    const result={ x,y,headerBottom:header.bottom,target:target.className,insideSongRow:!!target.closest('.song-row'),before:!!document.querySelector('.library-search-bar') };
    target.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y}));
    return result;
  })()`)
  await new Promise(resolve => setTimeout(resolve, 300))
  result.after = await js(`!!document.querySelector('.library-search-bar')`)
  await fs.writeFile(path.join(__dirname,'previous-fix-repro.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2))
  if (!result.insideSongRow || result.before || !result.after) throw new Error('Did not reproduce song-row false hover')
  app.quit()
}).catch(error=>{console.error(error);app.exit(1)})
