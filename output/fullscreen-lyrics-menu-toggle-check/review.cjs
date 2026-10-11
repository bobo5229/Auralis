const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const output = path.resolve('output/fullscreen-lyrics-menu-toggle-check')
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

    for (const theme of ['light','dark']) {
      await js(`document.documentElement.dataset.theme='${theme}';`)
      await openWithKey('F10',true)
      await delay(250)
      const state = await record(theme, `(()=>{const menu=document.querySelector('.fullscreen-lyrics-context-menu');const item=menu.querySelector('button');const m=menu.getBoundingClientRect();const c=getComputedStyle(menu);const b=getComputedStyle(item);return {count:menu.querySelectorAll('button').length,label:item.textContent.trim(),background:c.backgroundColor,radius:c.borderRadius,shadow:c.boxShadow,filter:c.backdropFilter,color:b.color,padding:b.padding,within:m.left>=0&&m.top>=0&&m.right<=innerWidth&&m.bottom<=innerHeight,focused:document.activeElement===item}})()`)
      if(state.count!==1 || !state.focused || !state.within || state.radius!=='16px' || state.shadow!=='none') throw new Error('Menu rendering check failed')
      await snap(theme+'-single-action')
      await js(`document.querySelector('.fullscreen-lyrics-context-menu button').click();`)
      await delay(250)
      const selected=await record(theme+'-selection',`({script:reviewText.lyricsScript.value,open:!!document.querySelector('.fullscreen-lyrics-context-menu'),stored:localStorage.getItem('auralis-lyrics-script')})`)
      if(selected.open || selected.script!==(theme==='light'?'traditional':'simplified') || selected.stored!==selected.script) throw new Error('Toggle check failed')
    }
    await openWithKey('F10',true)
    await delay(150)
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'})
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'})
    await delay(150)
    const escaped=await record('escape',`({menu:!!document.querySelector('.fullscreen-lyrics-context-menu'),fullscreen:reviewFullscreen.isFullscreenPlayerOpen.value,focused:document.activeElement===document.querySelector('.fullscreen-player-lyrics-scroll')})`)
    if(escaped.menu || !escaped.fullscreen || !escaped.focused) throw new Error('Escape check failed')
    win.destroy()
    app.quit()
  }).catch(error=>{console.error(error?.stack || error);app.exit(1)})
