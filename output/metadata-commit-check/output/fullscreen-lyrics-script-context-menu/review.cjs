const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const output = path.resolve('output/fullscreen-lyrics-script-context-menu')
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
      width: 1100,
      height: 760,
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
      reviewFullscreen.openFullscreenPlayer();
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
    await record('initial-simplified-lrc', `({script:reviewText.lyricsScript.value,source:reviewLyrics.parsedLines.value[0].text,display:document.querySelector('.fullscreen-player-lyric-fill')?.textContent,geometry:reviewGeometry()})`)

    await js(`const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');const r=scroll.getBoundingClientRect();window.reviewRightContextEvent=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:Math.round(r.right-4),clientY:Math.round(r.bottom-4)});scroll.dispatchEvent(reviewRightContextEvent);`)
    await delay(180)
    await record(
      'right-bottom-menu-open',
      `(()=>{const menu=document.querySelector('[role="menu"]');const m=menu?.getBoundingClientRect();return {prevented:reviewRightContextEvent.defaultPrevented,menuOpen:!!menu,items:menu?[...menu.querySelectorAll('[role="menuitemradio"]')].map(x=>({text:x.textContent.trim(),checked:x.getAttribute('aria-checked')})):[],rect:m&&{left:m.left,right:m.right,top:m.top,bottom:m.bottom},within:!!m&&m.left>=0&&m.top>=0&&m.right<=innerWidth&&m.bottom<=innerHeight,focused:document.activeElement?.textContent};})()`,
    )
    await delay(150)
    await snap('menu-edge-bottom-right')

    await js(`document.querySelectorAll('[role="menuitemradio"]')[1].click();`)
    await delay(450)
    await record('traditional-selection-lrc', `({script:reviewText.lyricsScript.value,source:reviewLyrics.parsedLines.value[0].text,display:document.querySelector('.fullscreen-player-lyric-fill')?.textContent,activeIndex:reviewLyrics.activeIndex.value,currentTime:reviewPlayback.state.currentTime,geometry:reviewGeometry(),stored:localStorage.getItem('auralis-lyrics-script')})`)
    await snap('traditional-selection-lrc')

    await openWithKey('F10', true)
    await delay(180)
    await js(`const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');window.reviewZeroContextEvent=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:0,clientY:0});scroll.dispatchEvent(reviewZeroContextEvent);`)
    await delay(100)
    await record('shift-f10-and-zero-coordinate-fallback', `({menuOpen:!!document.querySelector('[role="menu"]'),zeroContextPrevented:reviewZeroContextEvent.defaultPrevented,menuAnchor:{left:document.querySelector('[role="menu"]')?.style.left,top:document.querySelector('[role="menu"]')?.style.top},active:document.activeElement?.getAttribute('role')})`)
    await snap('menu-keyboard-open')
    await js(`document.querySelector('[role="menu"]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));`)
    await delay(80)
    await record('arrow-navigation-keeps-selection', `({checked:[...document.querySelectorAll('[role="menuitemradio"]')].map(x=>x.getAttribute('aria-checked')),focused:document.activeElement?.textContent})`)
    await js(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));`)
    await delay(100)
    await record('escape-closes-only-menu', `({menuOpen:!!document.querySelector('[role="menu"]'),fullscreen:reviewFullscreen.isFullscreenPlayerOpen.value,focusIsLyrics:document.activeElement===document.querySelector('.fullscreen-player-lyrics-scroll')})`)

    await js(`document.querySelector('.background-controls-toggle').click();`)
    await delay(180)
    await openWithKey('ContextMenu')
    await delay(350)
    await record('settings-menu-mutual-exclusion', `({contextMenu:!!document.querySelector('[role="menu"]'),settings:!!document.querySelector('.background-controls-panel'),active:document.activeElement?.textContent})`)
    await snap('context-menu-settings-mutual-exclusion')
    await js(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));`)
    await delay(120)

    await js(`document.querySelector('.fullscreen-playback-mode-trigger').click();`)
    await delay(100)
    await openWithKey('ContextMenu')
    await delay(180)
    await record('playback-mode-menu-mutual-exclusion', `({contextMenu:!!document.querySelector('[role="menu"]'),modeMenu:!!document.querySelector('.playback-mode-menu'),active:document.activeElement?.textContent})`)
    await js(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));`)
    await delay(100)

    await openWithKey('F10', true)
    await delay(120)
    await js(`window.reviewExternalControl=[...document.querySelectorAll('.fullscreen-player-controls button')].at(-1);window.reviewModeBefore=reviewPlayback.state.playbackMode;reviewExternalControl.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,button:0,pointerType:'mouse'}));reviewExternalControl.focus();reviewExternalControl.click();`)
    await delay(120)
    await record('outside-control-remains-operable', `({menuOpen:!!document.querySelector('[role="menu"]'),modeBefore:reviewModeBefore,modeAfter:reviewPlayback.state.playbackMode,operationApplied:reviewModeBefore!==reviewPlayback.state.playbackMode,focusPreserved:document.activeElement===reviewExternalControl})`)

    await openWithKey('ContextMenu')
    await delay(120)
    win.webContents.focus()
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
    await delay(150)
    await record('tab-exits-menu-and-keeps-fullscreen', `({menuOpen:!!document.querySelector('[role="menu"]'),fullscreen:reviewFullscreen.isFullscreenPlayerOpen.value,focusInsideFullscreen:document.querySelector('.fullscreen-player')?.contains(document.activeElement),focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent})`)

    await js(`
      window.reviewOriginalSetItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){if(key==='auralis-lyrics-script')throw new Error('review storage failure');return reviewOriginalSetItem.call(this,key,value)};
      const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');
      const r=scroll.getBoundingClientRect();
      scroll.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:r.left+40,clientY:r.top+40}));
    `)
    await delay(100)
    await js(`document.querySelectorAll('[role="menuitemradio"]')[0].click();`)
    await delay(150)
    await record('failed-save-remains-active', `({script:reviewText.lyricsScript.value,failed:reviewText.lyricsPersistFailed.value,status:document.querySelector('.fullscreen-lyrics-script-persist-status')?.textContent,menuOpen:!!document.querySelector('[role="menu"]')})`)
    await snap('failed-save-status')
    await js(`
      Storage.prototype.setItem=reviewOriginalSetItem;
      const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');
      const r=scroll.getBoundingClientRect();
      scroll.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:r.left+40,clientY:r.top+40}));
    `)
    await delay(100)
    await js(`document.querySelectorAll('[role="menuitemradio"]')[0].click();`)
    await delay(120)
    await record('same-choice-retries-save', `({script:reviewText.lyricsScript.value,failed:reviewText.lyricsPersistFailed.value,stored:localStorage.getItem('auralis-lyrics-script'),status:document.querySelector('[role="status"]')?.textContent||null})`)

    await js(`
      reviewTypography.setPreference({fontSizePercent:150,fontWeight:400,lineGapPercent:150});
      reviewBackground.setBackgroundMode('fluid');
    `)
    await delay(400)
    await record('typography-maximum-fluid', `reviewGeometry()`)
    await snap('typography-maximum-fluid')

    await js(`document.documentElement.dataset.theme='light';const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');const r=scroll.getBoundingClientRect();scroll.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:r.left+80,clientY:r.top+80}));`)
    await delay(180)
    await record('fluid-menu-light-theme', `(()=>{const menu=document.querySelector('[role="menu"]');const style=getComputedStyle(menu);return {theme:document.documentElement.dataset.theme,background:style.backgroundColor,color:style.color,menuOpen:!!menu}})()`)
    await snap('fluid-menu-light-theme')
    await js(`document.querySelector('[role="menuitemradio"][aria-checked="true"]')?.click();document.documentElement.dataset.theme='dark';`)
    await delay(120)

    await js(`
      reviewLyrics.rawLyrics.value=reviewLines.map(line=>line.text).join('\\n');
      reviewLyrics.status.value='plain';
    `)
    await delay(250)
    await js(`const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');scroll.scrollTop=500;`)
    const beforePlain = await record('plain-before-script-switch', `({scrollTop:document.querySelector('.fullscreen-player-lyrics-scroll').scrollTop,scrollHeight:document.querySelector('.fullscreen-player-lyrics-scroll').scrollHeight,display:document.querySelector('.fullscreen-player-lyric-line')?.textContent})`)
    await js(`
      const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');
      const r=scroll.getBoundingClientRect();
      scroll.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:r.left+40,clientY:r.top+40}));
    `)
    await delay(100)
    await js(`document.querySelectorAll('[role="menuitemradio"]')[1].click();`)
    await delay(350)
    await record('plain-after-script-switch', `({script:reviewText.lyricsScript.value,scrollTop:document.querySelector('.fullscreen-player-lyrics-scroll').scrollTop,scrollHeight:document.querySelector('.fullscreen-player-lyrics-scroll').scrollHeight,display:document.querySelector('.fullscreen-player-lyric-line')?.textContent})`)
    await snap('plain-after-script-switch')

    win.setContentSize(900, 620)
    await delay(450)
    await js(`const scroll=document.querySelector('.fullscreen-player-lyrics-scroll');const r=scroll.getBoundingClientRect();scroll.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:r.right-4,clientY:r.bottom-4}));`)
    await delay(160)
    await record('small-window-edge-menu', `(()=>{const m=document.querySelector('[role="menu"]')?.getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight},rect:m&&{left:m.left,right:m.right,top:m.top,bottom:m.bottom},within:!!m&&m.left>=0&&m.top>=0&&m.right<=innerWidth&&m.bottom<=innerHeight}})()`)
    await snap('small-window-edge-menu')

    await openWithKey('ContextMenu')
    await delay(120)
    await js(`const exit=document.querySelector('.fullscreen-player-exit');exit.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,button:0,pointerType:'mouse'}));exit.focus();exit.click();`)
    await delay(700)
    await record('exit-fullscreen-cleans-open-menu', `({open:reviewFullscreen.isFullscreenPlayerOpen.value,menuOpen:!!document.querySelector('[role="menu"]')})`)
    await js(`reviewFullscreen.openFullscreenPlayer();`)
    await delay(700)
    await record('fullscreen-reopen-shared-preference', `({open:reviewFullscreen.isFullscreenPlayerOpen.value,script:reviewText.lyricsScript.value,display:document.querySelector('.fullscreen-player-lyric-line')?.textContent})`)
    await snap('fullscreen-reopen')

    await openWithKey('ContextMenu')
    await delay(160)
    await js(`reviewPlayback.state.currentTrackId=970042;`)
    await delay(300)
    await record('track-change-cleans-open-menu', `({trackId:reviewPlayback.state.currentTrackId,status:reviewLyrics.status.value,menuOpen:!!document.querySelector('[role="menu"]')})`)
    await snap('track-change-cleans-open-menu')

    await win.webContents.reload()
    await delay(1500)
    await record(
      'renderer-reload-prefers-saved-script',
      `(await import('/features/appearance/composables/useChineseTextDisplay.ts')).useChineseTextDisplay().lyricsScript.value`,
    )
    fs.writeFileSync(path.join(output, 'input-scope.txt'), 'Synthetic LRC/plain lyrics and playback state; no real library or audio files were read. Electron offscreen window loaded the browser-preview Renderer at 127.0.0.1:5188 and reloaded the Renderer in the same isolated session. Temporary userData profile: ' + profile + '.\n')
    win.destroy()
    app.quit()
  })
  .catch((error) => {
    console.error(error?.stack || error)
    app.exit(1)
  })
