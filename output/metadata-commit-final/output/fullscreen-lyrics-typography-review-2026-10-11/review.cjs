const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const out = path.resolve('output/fullscreen-lyrics-typography-review-2026-10-11')
fs.mkdirSync(out, { recursive: true })
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-lyrics-review-')))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let win
const results = []
async function js(code) { return win.webContents.executeJavaScript(`(async()=>{${code}})()`) }
async function record(name, code) {
  const result = await js(`return ${code}`)
  results.push({ name, result })
  console.log(name, 'recorded')
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2))
  return result
}
async function snap(name) {
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(out, name + '.png'), img.toPNG())
}
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1200, height: 800, useContentSize: true, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false, partition: 'auralis-typography-review' } })
  win.webContents.on('console-message', (...args) => { if (args[1] >= 2) console.log('RENDERER', args[2]) })
  await win.loadURL('http://127.0.0.1:5188/')
  await delay(1500)
  await js(`
    window.reviewPlayback = (await import('/features/playback/composables/usePlayback.ts')).usePlayback();
    window.reviewLyrics = (await import('/features/lyrics/composables/useTrackLyrics.ts')).useTrackLyrics();
    window.reviewFullscreen = (await import('/features/playback/composables/useFullscreenPlayer.ts')).useFullscreenPlayer();
    window.reviewTypography = (await import('/features/lyrics/composables/useFullscreenLyricsTypography.ts')).useFullscreenLyricsTypography();
    window.reviewBackground = (await import('/features/playback/composables/useFullscreenBackground.ts')).useFullscreenBackground();
    window.reviewPlayback.state.currentTrackId = 1;
    window.reviewPlayback.state.duration = 300;
    await new Promise(r=>setTimeout(r,100));
    window.reviewLines = Array.from({length:60},(_,i)=>({id:'review-'+i,timeSeconds:5+i*5,text:i%3===0?'这是用于审查的长句，中英文混排 Typography settings should keep every sentence visible and positioned correctly，直到这一句完整结束。':i%3===1?'The quick brown fox jumps over the lazy dog; long words: Supercalifragilisticexpialidocious.':'短句测试 '+i}));
    window.reviewLyrics.parsedLines.value = window.reviewLines;
    window.reviewLyrics.status.value = 'lrc';
    window.reviewPlayback.state.currentTime = 25;
    window.reviewFullscreen.openFullscreenPlayer();
    window.reviewBackground.setBackgroundMotionPaused(true);
    void 0;
  `)
  await delay(1200)
  await js(`
    window.reviewGeometry = () => {
      const scroll = document.querySelector('.fullscreen-player-lyrics-scroll');
      const track = document.querySelector('.fullscreen-player-lyrics-track');
      const rect = scroll.getBoundingClientRect();
      const rows = [...track.querySelectorAll('[data-lyric-index]')].map(row=>{
        const material = row.querySelector('.fullscreen-player-lyric-material');
        const r=material.getBoundingClientRect(), css=getComputedStyle(material);
        return {index:Number(row.dataset.lyricIndex), visible:getComputedStyle(row).visibility,top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,offsetHeight:material.offsetHeight,lineHeight:parseFloat(css.lineHeight),fontSize:css.fontSize,fontWeight:css.fontWeight,scale:css.transform};
      });
      return {width:innerWidth,height:innerHeight,activeIndex:reviewLyrics.activeIndex.value,top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,fit:track.style.getPropertyValue('--fullscreen-whole-fit-scale'),rows,animations:document.getAnimations().length};
    }; void 0;
  `)
  await record('default', `reviewGeometry()`)
  await js(`document.querySelector('.background-controls-toggle').click(); void 0`)
  await delay(300)
  await snap('settings-default')
  await js(`
    const size=document.querySelector('#fullscreen-lyrics-font-size'); size.value='150';size.dispatchEvent(new Event('input',{bubbles:true}));
    const weight=document.querySelector('#fullscreen-lyrics-font-weight');weight.value='400';weight.dispatchEvent(new Event('change',{bubbles:true}));
    const gap=document.querySelector('#fullscreen-lyrics-line-gap');gap.value='150';gap.dispatchEvent(new Event('input',{bubbles:true})); void 0;
  `)
  await delay(250)
  await record('max-input-events', `({geometry:reviewGeometry(),panelOpen:!!document.querySelector('.background-controls-panel'),stored:JSON.parse(localStorage.getItem('auralis-fullscreen-lyrics-typography'))})`)
  await js(`document.querySelector('.background-controls-close').click(); void 0`)
  win.setContentSize(900,620)
  await delay(500)
  await record('small-max', `reviewGeometry()`)
  await snap('small-max')
  for (const index of [-1,0,1,2,3,4,28,59]) {
    await js(`reviewPlayback.state.currentTime=${index < 0 ? 3 : 5+index*5}; void 0`)
    await delay(420)
    await record('small-max-index-'+index, `reviewGeometry()`)
  }
  await js(`
    reviewPlayback.state.currentTime=25;
    for(let i=0;i<30;i++){reviewTypography.setPreference({fontSizePercent:i%2?75:150,fontWeight:i%2?800:400,lineGapPercent:i%2?50:150}); await new Promise(r=>requestAnimationFrame(r));}
    reviewTypography.setPreference({fontSizePercent:75,fontWeight:800,lineGapPercent:50});void 0;
  `)
  await delay(300)
  await record('rapid-to-min', `reviewGeometry()`)
  await snap('small-min')
  await js(`reviewBackground.setBackgroundMode('fluid');void 0`)
  await delay(1200)
  await record('fluid-min', `reviewGeometry()`)
  await js(`reviewTypography.resetPreference();void 0`)
  await delay(300)
  await record('reset', `reviewGeometry()`)
  await js(`reviewLyrics.rawLyrics.value=reviewLines.map(x=>x.text).join('\\n');reviewLyrics.status.value='plain';void 0`)
  await delay(250)
  await js(`const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');scroll.scrollTop=1000;reviewTypography.setPreference({fontSizePercent:150,lineGapPercent:150});void 0`)
  await delay(250)
  await record('plain-expanded', `reviewGeometry()`)
  await js(`const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');scroll.scrollTop=scroll.scrollHeight;reviewTypography.setPreference({fontSizePercent:75,lineGapPercent:50});void 0`)
  await delay(250)
  await record('plain-shrink', `reviewGeometry()`)
  await snap('plain-shrink')
  await js(`reviewFullscreen.closeFullscreenPlayer();reviewTypography.setPreference({fontSizePercent:125,fontWeight:600,lineGapPercent:80});void 0`)
  await delay(400)
  await js(`reviewFullscreen.openFullscreenPlayer();void 0`)
  await delay(700)
  await record('reopened', `reviewGeometry()`)
  await js(`document.querySelector('.background-controls-toggle').click();void 0`)
  await delay(300)
  await js(`const content=document.querySelector('.background-controls-content');content.scrollTop=content.scrollHeight;document.querySelector('#fullscreen-lyrics-font-weight').focus();void 0`)
  win.webContents.focus()
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Home'})
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Home'})
  await delay(100)
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'})
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'})
  await delay(100)
  await record('native-select-keyboard', `({weight:reviewTypography.preference.value.fontWeight,panelOpen:!!document.querySelector('.background-controls-panel'),focus:document.activeElement.id})`)
  await snap('small-panel-bottom')
  await js(`window.reviewSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='auralis-fullscreen-lyrics-typography')throw new Error('review quota failure');return reviewSetItem.call(this,key,value)};const size=document.querySelector('#fullscreen-lyrics-font-size');size.value='130';size.dispatchEvent(new Event('input',{bubbles:true}));void 0`)
  await delay(150)
  await record('save-failure', `({size:reviewTypography.preference.value.fontSizePercent,failed:reviewTypography.persistFailed.value,status:document.querySelector('[data-lyrics-typography-status]')?.textContent})`)
  await js(`Storage.prototype.setItem=reviewSetItem;document.querySelector('[data-lyrics-typography-reset]').click();void 0`)
  await delay(100)
  await record('reset-after-save-failure', `({preference:{...reviewTypography.preference.value},failed:reviewTypography.persistFailed.value,status:document.querySelector('[data-lyrics-typography-status]')?.textContent,background:reviewBackground.backgroundMode.value,paused:reviewBackground.backgroundMotionPaused.value})`)
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'})
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'})
  await delay(300)
  await record('escape-closes-panel', `({panelOpen:!!document.querySelector('.background-controls-panel'),fullscreen:reviewFullscreen.isFullscreenPlayerOpen.value,focus:document.activeElement.className})`)
  await js(`reviewTypography.setPreference({fontSizePercent:125,fontWeight:600,lineGapPercent:80});void 0`)
  await win.reload()
  await delay(1300)
  await record('reload-persisted', `({preference:{...(await import('/features/lyrics/composables/useFullscreenLyricsTypography.ts')).useFullscreenLyricsTypography().preference.value}})`)
  win.destroy();app.quit()
}).catch(error=>{console.error(error);app.exit(1)})
