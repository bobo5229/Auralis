import { app } from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const output = resolve('output/badge-achievements')
mkdirSync(output, {recursive:true})
const profiles=join(output,'isolated-profile');mkdirSync(profiles,{recursive:true})
const profile=mkdtempSync(join(profiles,'profile-'))
mkdirSync(join(profile,'data'));mkdirSync(join(profile,'cache'))
writeFileSync(join(profile,'data/auralis.sqlite'),'')
const setPath=app.setPath.bind(app)
app.setPath=(name,value)=>setPath(name,name==='userData'?profile:name==='cache'?join(profile,'cache'):value)
app.getAppPath=()=>resolve('.')
app.setPath('userData',profile);app.setPath('cache',join(profile,'cache'))
delete process.env.AURALIS_SMOKE_TEST;delete process.env.ELECTRON_RENDERER_URL
process.env.AURALIS_QUIET_GPU_LOGS='1'
const checks=[],errors=[]
let window,started=false
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const timeout=setTimeout(()=>finish(new Error('timeout')),180000)
async function finish(error) {
 clearTimeout(timeout)
 if(error&&window&&!window.isDestroyed())await writeFile(join(output,'failure-state.json'),JSON.stringify(await window.webContents.executeJavaScript(`({phase:document.querySelector('.badge-inspector')?.dataset.inspectionPhase,id:document.querySelector('.badge-inspector')?.dataset.inspectionBadge,focus:document.activeElement.className,frames:window.__log?.slice(-100)})`),null,2))
 if(error&&window&&!window.isDestroyed())await writeFile(join(output,'failure.png'),(await window.webContents.capturePage()).toPNG())
 await writeFile(join(output,'report.json'),JSON.stringify({passed:!error,checks,errors,error:error?.stack,profile},null,2))
 if(error)console.error(error)
 app.exit(error?1:0)
}
app.on('browser-window-created',(_event,win)=>{
 if(started)return;started=true;window=win
 win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)})
 win.webContents.on('render-process-gone',(_event,details)=>{console.error('RENDERER EXIT',details);app.exit(2)})
 win.webContents.once('did-finish-load',()=>run().then(()=>finish()).catch(finish))
})
async function run(){
 const wc=window.webContents,js=code=>wc.executeJavaScript(code)
 const until=async code=>{for(let i=0;i<2000;i++){if(await js(`(async()=>(${code}))()`))return;await wait(10)}throw new Error('Timed out: '+code)}
 const assert=async(name,code)=>{const pass=!!await js(`(async()=>(${code}))()`);checks.push({name,pass});if(!pass)throw new Error(name);console.log('PASS',name)}
 const click=async(selector,double=false)=>{await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});void 0`);const b=await js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);const x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2);wc.sendInputEvent({type:'mouseMove',x,y});wc.sendInputEvent({type:'mouseDown',button:'left',x,y,clickCount:double?2:1});wc.sendInputEvent({type:'mouseUp',button:'left',x,y,clickCount:double?2:1})}
 const key=keyCode=>{wc.sendInputEvent({type:'keyDown',keyCode});wc.sendInputEvent({type:'keyUp',keyCode})}
 const phase=p=>`document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='${p}'`
 const ready=`document.querySelector('.archive-badge-gallery')?.classList.contains('is-ready')`
 const capture=async name=>{await wait(180);await writeFile(join(output,name+'.png'),(await wc.capturePage()).toPNG())}
 window.setContentSize(1440,900)
 await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 const info=await js('window.auralis.app.getInfo()');if(info.databasePath!==join(profile,'data','auralis.sqlite'))throw new Error('isolation failed')
 const {createRequire}=await import('node:module'),{spawnSync}=await import('node:child_process'),{statSync}=await import('node:fs')
 const Database=createRequire(import.meta.url)('better-sqlite3'),db=new Database(info.databasePath);db.pragma('busy_timeout=5000')
 const tracks=join(profile,'fixtures');mkdirSync(tracks)
 db.prepare('INSERT INTO library_roots(path) VALUES(?)').run(tracks)
 for(let i=1;i<=2;i++){
  const file=join(tracks,`track-${i}.flac`),genre=i===1?'Rock':'Rock; Live'
  const result=spawnSync(resolve('resources/audio/ffmpeg.exe'),['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','12','-af','volume=0.02','-metadata',`title=Fixture ${i} Live`,'-metadata','album=Fixture Album','-metadata','artist=Fixture Artist','-metadata','album_artist=Fixture Artist','-metadata',`genre=${genre}`,'-y',file],{encoding:'utf8'})
  if(result.status!==0)throw new Error(result.stderr)
  const stat=statSync(file)
  db.prepare('INSERT INTO tracks(id,file_path,title,artist,album,album_artist,genre,duration_seconds,file_size,file_mtime_ms) VALUES(?,?,?,?,?,?,?,?,?,?)').run(i,file,`Fixture ${i} Live`,'Fixture Artist','Fixture Album','Fixture Artist',genre,12,stat.size,stat.mtimeMs)
 }
 const localDay=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')
 for(let i=1;i<=6;i++){const date=new Date();date.setDate(date.getDate()-i);db.prepare('INSERT INTO badge_legacy_daily VALUES(?,?)').run(localDay(date),i===1?14400:3600)}
 db.prepare('INSERT INTO badge_legacy_daily VALUES(?,3599)').run(localDay(new Date()))
 await new Promise(resolve=>{wc.once('did-finish-load',resolve);wc.reload()})
 await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 await js(`location.hash='#/archive'`);await until(`document.querySelectorAll('.archive-milestone-case__slot img').length===3`)
 await click('[data-milestone-gallery-trigger]');await until(ready);await wait(180)
 await assert('initial catalogue reflects legacy baseline rather than a global appearance toggle',`document.querySelectorAll('.case-appearance').length===0&&[...document.querySelectorAll('[data-badge]')].every(b=>b.dataset.achievementState==='unlit')`)
 await assert('legacy hours baseline remains below ten hours',`(await window.auralis.archive.getBadgeAchievements()).listeningSeconds===35999`)
 await click('[data-badge="hours100"]');await until(phase('inspecting'));await wait(170)
 await assert('locked badge can be inspected with its real progress',`document.querySelector('.inspect-caption__progress').textContent.includes('9.9')&&document.querySelector('[data-badge="hours100"]').dataset.achievementState==='unlit'`)
 key('Escape');await until(phase('closed'));await click('.case-close')
 // Real renderer UI and real MPV audio transport: the actual tracker supplies evidence.
 await js(`location.hash='#/songs'`);await until(`document.querySelector('[data-track-id="1"]')`)
 await click('[data-track-id="1"]',true)
 await until(`document.querySelector('.transport-control-primary--playing')`)
 await until(`(await window.auralis.archive.getBadgeAchievements()).listeningSeconds>=36000`)
 await assert('real playback advances elapsed hours and the one-hour listening day',`(()=>true)()&&((await window.auralis.archive.getBadgeAchievements()).listeningDays===7)`)
 // Let first finish naturally, then explicitly play second if the queue did not advance.
 for(let i=0;i<150;i++){const row=db.prepare('SELECT covered_seconds FROM badge_track_coverage WHERE track_id=1').get();if(row?.covered_seconds>=10.8)break;await wait(100)}
 const first=db.prepare('SELECT covered_seconds FROM badge_track_coverage WHERE track_id=1').get()
 if(!first||first.covered_seconds<10.8)throw new Error('real playback did not cover first track: '+JSON.stringify(first))
 await click('[data-track-id="2"]',true)
 for(let i=0;i<160;i++){const row=db.prepare('SELECT covered_seconds FROM badge_track_coverage WHERE track_id=2').get();if(row?.covered_seconds>=10.8)break;await wait(100)}
 const second=db.prepare('SELECT covered_seconds FROM badge_track_coverage WHERE track_id=2').get()
 if(!second||second.covered_seconds<10.8)throw new Error('real playback did not cover second track: '+JSON.stringify(second))
 if(await js(`!!document.querySelector('.transport-control-primary--playing')`))await click('.transport-control-primary')
 await wait(200)
 await assert('two real track playbacks complete the local album but title Live does not classify it',`(()=>true)()&&(await window.auralis.archive.getBadgeAchievements()).completeAlbums===1&&(await window.auralis.archive.getBadgeAchievements()).completeLiveAlbums===0`)
 const paused=db.prepare('SELECT SUM(seconds) AS seconds FROM badge_listening_daily').get().seconds;await wait(1200)
 if(db.prepare('SELECT SUM(seconds) AS seconds FROM badge_listening_daily').get().seconds!==paused)throw new Error('pause continued to accumulate')
 checks.push({name:'paused transport stops accruing actual time',pass:true})
 await js(`location.hash='#/archive'`);await until(`document.querySelectorAll('.archive-milestone-case__slot img').length===3`)
 await click('[data-milestone-gallery-trigger]');await until(ready);await wait(180)
 await assert('lit and unlit badges coexist in fixed milestone order',`[...document.querySelectorAll('[data-badge]')].map(b=>b.dataset.achievementState).join(',')==='lit,unlit,unlit,unlit'`)
 await capture('mixed-hours')
 await click('[data-badge="hours10"]');await until(phase('inspecting'));await wait(170)
 await assert('earned badge exposes achieved caption',`document.querySelector('.inspect-caption__progress').textContent==='已达成'`)
 await click('.inspect-switch--next');await until(`${phase('inspecting')}&&document.querySelector('.badge-inspector').dataset.inspectionBadge==='hours100'`);await wait(170)
 await assert('direct navigation crosses earned and unearned models and restores locked progress',`document.querySelector('.inspect-caption__progress').textContent.includes('/ 100')`)
 window.setContentSize(900,620);await wait(180)
 await assert('three-line achievement caption fits the minimum viewport',`(()=>{const b=document.querySelector('.inspect-object').getBoundingClientRect(),c=document.querySelector('.inspect-caption').getBoundingClientRect();return b.top>=23&&b.bottom+23<=c.top&&c.bottom<=innerHeight-23})()`)
 await capture('locked-inspection-minimum')
 key('Escape');await until(phase('closed'));await click('[data-series="days"]');await until(`!document.querySelector('.badge-row').classList.contains('is-loading')`)
 await assert('days series uses one qualifying day per local date',`document.querySelector('[data-badge="days7"]').dataset.achievementState==='lit'&&document.querySelector('[data-badge="days30"]').dataset.achievementState==='unlit'`)
 await click('[data-series="albums"]');await until(`!document.querySelector('.badge-row').classList.contains('is-loading')`)
 await assert('album series distinguishes completed album from completed live album',`document.querySelector('[data-badge="albums1"]').dataset.achievementState==='lit'&&document.querySelector('[data-badge="albumsLive"]').dataset.achievementState==='unlit'`)
 await capture('mixed-albums')
 db.exec("UPDATE tracks SET genre='Rock; lIvE' WHERE id=1")
 await assert('all genres containing Live activates live-album completion',`(await window.auralis.archive.getBadgeAchievements()).completeLiveAlbums===1`)
 db.prepare('INSERT INTO tracks(id,file_path,title,artist,album,album_artist,genre,duration_seconds) VALUES(3,?,?,?,?,?,?,12)').run(join(tracks,'new.flac'),'New','Fixture Artist','Fixture Album','Fixture Artist','Live')
 await assert('adding an unheard track revokes both album achievements',`(()=>true)()&&(await window.auralis.archive.getBadgeAchievements()).completeAlbums===0&&(await window.auralis.archive.getBadgeAchievements()).completeLiveAlbums===0`)
 // Reset is the real public IPC; stale epoch batches cannot recreate wiped evidence.
 const old=await js(`window.auralis.archive.getBadgeAchievements()`)
 await js(`window.auralis.archive.resetPlayStats()`)
 await until(`document.querySelector('[data-badge="albums1"]')?.dataset.achievementState==='unlit'`)
 await assert('reset updates the visible box to unearned',`[...document.querySelectorAll('[data-badge]')].every(b=>b.dataset.achievementState==='unlit')&&(await window.auralis.archive.getBadgeAchievements()).listeningSeconds===0`)
 const stale={epoch:old.epoch,sessionId:'late',sequence:1,trackId:1,samples:[{startedAtIso:new Date().toISOString(),startSeconds:0,endSeconds:1,playedSeconds:1}]}
 await assert('delayed pre-reset batch is rejected without restoring achievements',`(await window.auralis.playback.recordListeningProgress(${JSON.stringify(stale)})).ok===false&&(await window.auralis.archive.getBadgeAchievements()).listeningSeconds===0`)
 await click('.case-close');await until(`!document.querySelector('.archive-badge-dialog')`)
 await assert('no renderer errors',errors.length?'false':'true')
 db.close()
}
await import(pathToFileURL(resolve('out/main/index.js')).href)
