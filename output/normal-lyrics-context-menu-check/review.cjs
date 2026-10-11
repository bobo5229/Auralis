const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const output = path.resolve('output/normal-lyrics-context-menu-check')
fs.mkdirSync(output, { recursive: true })
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-lyrics-script-menu-'))
app.setPath('userData', profile)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let win
const results = []

async function js(code) {
  return win.webContents.executeJavaScript('(async()=>{' + code + '})()')
}

async function record(name, expression) {
  const result = await js('return ' + expression + ';')
  results.push({ name, result })
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(name, JSON.stringify(result))
  return result
}

async function snap(name) {
  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(output, name + '.png'), image.toPNG())
}

function openWithKey(key, shiftKey = false) {
  return js(
    "const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');" +
      'scroll.focus();' +
      "scroll.dispatchEvent(new KeyboardEvent('keydown',{key:" +
      JSON.stringify(key) +
      ',shiftKey:' +
      shiftKey +
      ',bubbles:true,cancelable:true}));return true;',
  )
}

app.whenReady()
  .then(async () => {
    win = new BrowserWindow({
      width: 1500,
      height: 900,
      useContentSize: true,
      show: false,
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        partition: 'auralis-lyrics-script-context-menu',
      },
    })
    win.webContents.on('console-message', (...args) => {
      if (args[1] >= 2) console.log('RENDERER', args[2])
    })
    await win.loadURL('http://127.0.0.1:5188/')
    await delay(1500)
    await js(`
      window.reviewPlayback = (await import('/features/playback/composables/usePlayback.ts')).usePlayback();
      window.reviewLyrics = (await import('/features/lyrics/composables/useTrackLyrics.ts')).useTrackLyrics();
      window.reviewFullscreen = (await import('/features/playback/composables/useFullscreenPlayer.ts')).useFullscreenPlayer();
      window.reviewText = (await import('/features/appearance/composables/useChineseTextDisplay.ts')).useChineseTextDisplay();
      window.reviewTypography = (await import('/features/lyrics/composables/useFullscreenLyricsTypography.ts')).useFullscreenLyricsTypography();
      window.reviewBackground = (await import('/features/playback/composables/useFullscreenBackground.ts')).useFullscreenBackground();
      reviewText.setLyricsScript('simplified');
      reviewTypography.resetPreference();
      reviewPlayback.state.currentTrackId = 970041;
      reviewPlayback.state.duration = 300;
      await new Promise(resolve => setTimeout(resolve, 120));
      window.reviewLines = Array.from({length:36},(_,i)=>({
        id:'script-review-'+i,
        timeSeconds:5+i*5,
        text:i%3===0
          ? '頭髮與看著：這是一句中英文混排的長歌詞，用來觀察繁簡切換後的換行與定位。Typography must follow the converted sentence and preserve the current playback line.'
          : i%3===1
            ? 'The quick brown fox jumps over the lazy dog; long words: Supercalifragilisticexpialidocious.'
            : '看著你，頭髮在風中。'
      }));
      reviewLyrics.parsedLines.value = reviewLines;
      reviewLyrics.rawLyrics.value = reviewLines.map(line=>line.text).join('\\n');
      reviewLyrics.status.value = 'lrc';
      reviewPlayback.state.currentTime = 8;

      reviewBackground.setBackgroundMotionPaused(true);
      window.reviewGeometry = () => {
        const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');
        const track=document.querySelector('.fullscreen-player-lyrics-track');
        const rect=scroll.getBoundingClientRect();
        const active=track.querySelector('.fullscreen-player-lyric-active');
        const text=active?.querySelector('.fullscreen-player-lyric-fill');
        const css=text?getComputedStyle(text):null;
        return {
          width:innerWidth,height:innerHeight,
          currentTime:reviewPlayback.state.currentTime,
          activeIndex:reviewLyrics.activeIndex.value,
          scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,
          lyricRect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},
          activeText:active?.textContent,
          activeFontSize:css?.fontSize,activeFontWeight:css?.fontWeight,
          lineHeight:css?.lineHeight,gap:getComputedStyle(active?.nextElementSibling||active||scroll).marginTop,
          fit:track.style.getPropertyValue('--fullscreen-whole-fit-scale')
        };
      };
    `)
    await delay(1200)

    await js(`window.panelVisibility=(await import('/features/appearance/composables/useLyricsPanelVisibility.ts')).useLyricsPanelVisibility();panelVisibility.setLyricsPanelExpanded(true);window.openNormalMenu=()=>{const scroll=document.querySelector('.synced-lyrics-scroll,.plain-lyrics-scroll');const r=scroll.getBoundingClientRect();scroll.dispatchEvent(new PointerEvent('pointerdown',{button:2,bubbles:true}));const event=new MouseEvent('contextmenu',{clientX:r.right-2,clientY:r.bottom-2,bubbles:true,cancelable:true});scroll.dispatchEvent(event);return event.defaultPrevented};`)
    await delay(500)
    for (const theme of ['light','dark']) {
      await js(`document.documentElement.dataset.theme='${theme}';`)
      const prevented=await js(`return openNormalMenu();`)
      await delay(150)
      const state=await record(theme+'-menu',`(()=>{const m=document.querySelector('#normal-lyrics-context-menu');const r=m?.getBoundingClientRect();return {count:m?.querySelectorAll('button').length,label:m?.textContent.trim(),color:m&&getComputedStyle(m.querySelector('button')).color,bg:m&&getComputedStyle(m).backgroundColor,mask:m&&getComputedStyle(m).maskImage,within:!!r&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,focused:m?.contains(document.activeElement)}})()`)
      if(!prevented || state.count!==1 || !state.within || !state.focused || state.mask!=='none') throw new Error('Normal menu rendering failed')
      await snap(theme+'-menu')
      await js(`document.querySelector('#normal-lyrics-context-menu button').click();`)
      await delay(150)
      const result=await record(theme+'-selected',`({script:reviewText.lyricsScript.value,stored:localStorage.getItem('auralis-lyrics-script'),closed:!document.querySelector('#normal-lyrics-context-menu'),focused:document.activeElement===document.querySelector('.synced-lyrics-scroll'),source:reviewLyrics.parsedLines.value[0].text,display:document.querySelector('.synced-lyrics-scroll [data-lyric-index="0"]')?.textContent.trim()})`)
      if(!result.closed || !result.focused || result.script!==(theme==='light'?'traditional':'simplified') || result.stored!==result.script) throw new Error('Normal script switch failed')
    }
    await js(`const scroll=document.querySelector('.synced-lyrics-scroll');scroll.focus();scroll.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));scroll.dispatchEvent(new MouseEvent('contextmenu',{clientX:0,clientY:0,bubbles:true,cancelable:true}));`)
    await delay(150)
    const keyboard=await record('keyboard-open',`({open:!!document.querySelector('#normal-lyrics-context-menu'),menus:document.querySelectorAll('[role="menu"]').length})`)
    if(!keyboard.open || keyboard.menus!==1) throw new Error('Keyboard open failed')
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'})
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'})
    await delay(100)
    const esc=await record('escape',`({closed:!document.querySelector('#normal-lyrics-context-menu'),focus:document.activeElement===document.querySelector('.synced-lyrics-scroll')})`)
    if(!esc.closed || !esc.focus) throw new Error('Escape failed')
    await js(`openNormalMenu();`)
    await delay(50)
    await js(`panelVisibility.setLyricsPanelExpanded(false);`)
    await delay(500)
    const collapsed=await record('collapse-closes',`!document.querySelector('#normal-lyrics-context-menu')`)
    if(!collapsed) throw new Error('Collapse close failed')
    await js(`panelVisibility.setLyricsPanelExpanded(true);`)
    await delay(500)
    await js(`openNormalMenu();`)
    await delay(50)
    await js(`reviewFullscreen.openFullscreenPlayer();`)
    await delay(500)
    const full=await record('fullscreen-shares-setting',`({normalMenuClosed:!document.querySelector('#normal-lyrics-context-menu'),display:document.querySelector('.fullscreen-player-lyric-fill')?.textContent,script:reviewText.lyricsScript.value})`)
    if(!full.normalMenuClosed) throw new Error('Fullscreen did not close normal menu')
    await js(`const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');scroll.focus();scroll.dispatchEvent(new KeyboardEvent('keydown',{key:'ContextMenu',bubbles:true,cancelable:true}));`)
    await delay(100)
    await js(`document.querySelector('#fullscreen-lyrics-context-menu button').click();`)
    await delay(100)
    await js(`reviewFullscreen.closeFullscreenPlayer();`)
    await delay(500)
    const returned=await record('return-normal-shares-setting',`({script:reviewText.lyricsScript.value,display:document.querySelector('.synced-lyrics-scroll [data-lyric-index="0"]')?.textContent.trim()})`)
    if(returned.script!=='traditional' || !returned.display?.includes('頭髮')) throw new Error('Shared setting failed')
    await js(`reviewLyrics.rawLyrics.value=Array.from({length:100},()=> '頭髮與看著你 — English lyrics').join('\\n');reviewLyrics.status.value='plain';`)
    await delay(100)
    await js(`document.querySelector('.plain-lyrics-scroll').scrollTop=500;openNormalMenu();`)
    await delay(100)
    await js(`document.querySelector('#normal-lyrics-context-menu button').click();`)
    await delay(100)
    const plain=await record('plain-switch',`({script:reviewText.lyricsScript.value,scroll:document.querySelector('.plain-lyrics-scroll').scrollTop,text:document.querySelector('.plain-lyrics-scroll').textContent.slice(0,24),focused:document.activeElement===document.querySelector('.plain-lyrics-scroll')})`)
    if(plain.script!=='simplified' || plain.scroll!==500 || !plain.focused) throw new Error('Plain switch failed')
    await snap('plain-after-switch')
    await js(`window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='auralis-lyrics-script')throw new Error('controlled save failure');return originalSetItem.call(this,key,value)};openNormalMenu();`)
    await delay(100)
    await js(`document.querySelector('#normal-lyrics-context-menu button').click();`)
    await delay(100)
    const failed=await record('save-failure-feedback',`({failed:reviewText.lyricsPersistFailed.value,status:document.querySelector('.lyrics-panel [role="status"]')?.textContent.trim(),menuClosed:!document.querySelector('#normal-lyrics-context-menu')})`)
    if(!failed.failed || !failed.status || !failed.menuClosed) throw new Error('Save failure feedback failed')
    await js(`Storage.prototype.setItem=originalSetItem;openNormalMenu();`)
    await delay(100)
    await js(`document.querySelector('#normal-lyrics-context-menu button').click();`)
    await delay(100)
    const saved=await record('save-recovers',`!reviewText.lyricsPersistFailed.value && !document.querySelector('.lyrics-panel [role="status"]')`)
    if(!saved) throw new Error('Save recovery failed')
    await js(`openNormalMenu();`)
    await delay(100)
    await js(`document.querySelector('.plain-lyrics-scroll').dispatchEvent(new WheelEvent('wheel',{deltaY:30,bubbles:true}));`)
    await delay(100)
    const wheel=await record('wheel-closes',`!document.querySelector('#normal-lyrics-context-menu')`)
    if(!wheel) throw new Error('Wheel did not close menu')
    await js(`reviewLyrics.status.value='empty';`)
    await delay(100)
    const empty=await record('empty-has-no-menu',`(()=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.querySelector('.lyrics-panel').dispatchEvent(e);return {open:!!document.querySelector('#normal-lyrics-context-menu'),prevented:e.defaultPrevented}})()`)
    if(empty.open || empty.prevented) throw new Error('Empty context menu should be inactive')
    win.destroy();app.quit()
  }).catch(error=>{console.error(error?.stack || error);app.exit(1)})
