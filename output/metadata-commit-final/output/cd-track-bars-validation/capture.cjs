const {app,BrowserWindow}=require('electron')
const fs=require('node:fs/promises'), path=require('node:path')
app.setPath('userData',path.join(__dirname,'isolated-profile'))
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:1100,height:650,useContentSize:true,show:false,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true,backgroundThrottling:false}})
  const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'){errors.push(e.message);console.error(e.message)}})
  await win.loadURL(process.argv[2]);await delay(500)
  const js=async code=>{try{return await win.webContents.executeJavaScript(code)}catch(e){console.error('Failed:',code);throw e}}
  const evidence={}
  evidence.initial=await js(`(()=>{const bars=[...document.querySelectorAll('.cd-playing-bars__bar')];if(bars.length!==3 || bars.some(b=>b.getAnimations().length!==1))throw Error('Playing bars');if(document.querySelector('.cd-playing-line'))throw Error('Old line');window.saved=bars.flatMap(b=>b.getAnimations());const detail=document.querySelector('.cd-track-detail'),title=document.querySelector('.cd-track-title'),row=document.querySelector('.cd-track');if(getComputedStyle(detail).gap!=='2px'||getComputedStyle(title).fontSize!=='18px'||row.getBoundingClientRect().height!==64)throw Error('Typography');return {gap:getComputedStyle(detail).gap,titleSize:getComputedStyle(title).fontSize,rowHeight:64,animations:window.saved.length}})()`)
  await js(`window.preview.isPlaying=false`);await delay(100)
  evidence.paused=await js(`(()=>{if(window.saved.some(a=>a.playState!=='idle')||document.getAnimations().length)throw Error('Pause cleanup');const scales=[...document.querySelectorAll('.cd-playing-bars__bar')].map(b=>b.style.transform);return {scales}})()`)
  await js(`window.preview.isPlaying=true;window.reduce('reduce')`);await delay(100)
  if(await js(`document.getAnimations().length`))throw Error('Reduced motion still animating')
  await js(`window.reduce('system')`);await delay(100)
  if(await js(`document.getAnimations().length`)!==3)throw Error('Resume animations')
  await js(`window.saved=document.getAnimations();window.preview.currentTrackId=2`);await delay(100)
  evidence.switch=await js(`(()=>{if(window.saved.some(a=>a.playState!=='idle')||document.getAnimations().length!==3||document.querySelector('[aria-current="true"]')!==document.querySelectorAll('.cd-track')[1])throw Error('Switch cleanup');const index=document.querySelector('[aria-current="true"] .cd-track-index').getBoundingClientRect(),bars=document.querySelector('.cd-playing-bars').getBoundingClientRect();if(Math.abs(index.x+index.width/2-bars.x-bars.width/2)>0.5||Math.abs(index.y+index.height/2-bars.y-bars.height/2)>0.5)throw Error('Missing number centering');return {missingNumberCentered:true}})()`)
  for(const width of [1100,760]){
    win.setContentSize(width,650)
    for(const dark of [false,true]){
      await js(`window.preview.dark=${dark}`);await delay(180)
      await js(`(()=>{const rows=[...document.querySelectorAll('.cd-track')];for(const r of rows){const title=r.querySelector('.cd-track-title').getBoundingClientRect();if(title.right>r.getBoundingClientRect().right)throw Error('Title overflow')}if(document.querySelectorAll('.cd-track-artist').length!==2)throw Error('Artist visibility')})()`)
      await fs.writeFile(path.join(__dirname,`${width}-${dark?'dark':'light'}.png`),(await win.webContents.capturePage()).toPNG())
    }
  }
  await js(`document.querySelectorAll('.cd-track')[0].click();document.querySelectorAll('.cd-track')[2].focus()`)
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await delay(100)
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'char',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await delay(100)
  evidence.input=await js(`(()=>{if(JSON.stringify(window.preview.events)!=='[1,3,3]')throw Error('Click/keyboard events '+JSON.stringify(window.preview.events));return {events:[...window.preview.events]}})()`)
  await js(`window.saved=document.getAnimations();window.preview.tracks=[...window.preview.tracks].reverse();void 0`);await delay(100)
  await js(`if(window.saved.some(a=>a.playState!=='idle')||document.getAnimations().length!==3)throw Error('List replacement cleanup')`)
  await js(`window.saved=document.getAnimations();window.preview.mounted=false`);await delay(100)
  evidence.unmount=await js(`(()=>{if(window.saved.some(a=>a.playState!=='idle')||document.getAnimations().length||window.listenerCount())throw Error('Unmount cleanup');return {animations:0,listeners:window.listenerCount()}})()`)
  evidence.reducedMotion=true;evidence.layout=['1100/light','1100/dark','760/light','760/dark'];evidence.errors=errors
  if(errors.length)throw Error(errors.join('\n'))
  await fs.writeFile(path.join(__dirname,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));app.quit()
}).catch(e=>{console.error(e);app.exit(1)})
