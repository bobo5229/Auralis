import {app,BrowserWindow,ipcMain} from 'electron';
import {writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import {NativePlaybackService} from './native-service.mjs';
const root=dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root,'isolated-profile'),{recursive:true});app.setPath('userData',join(root,'isolated-profile'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
let win,backend='mpv';const errors=[],report={scope:'Production Vue lyrics panels and playback controller; isolated IPC, synthetic audio, mpv null output and real HTMLAudioElement',visual:[],timing:[]};
const native=new NativePlaybackService({mpvPath:resolve('resources/audio/mpv.exe'),ffmpegPath:resolve('resources/audio/ffmpeg.exe'),resolveTrack:async()=>join(root,'clock.wav'),mpvArgs:['--ao=null','--prefetch-playlist=no'],emit:event=>win?.webContents.send('lrc-test:event',event),warn:error=>errors.push(String(error))});
ipcMain.handle('lrc-test:command',(_,request)=>native.command(request));
ipcMain.handle('lrc-test:backend',(_,value)=>{backend=value;return true});
ipcMain.handle('lrc-test:reference',async()=>native.runtime.client?.command('get_property','time-pos')??0);
const wait=ms=>new Promise(done=>setTimeout(done,ms));
async function js(code){return win.webContents.executeJavaScript(code)}
async function save(){await writeFile(join(root,'report.json'),JSON.stringify({...report,errors},null,2))}
async function run(){try{
 console.log('Isolated Electron ready');
 win=new BrowserWindow({width:1280,height:850,show:false,webPreferences:{offscreen:true,preload:join(root,'preload.cjs'),sandbox:true,contextIsolation:true,backgroundThrottling:false}});
 win.webContents.setFrameRate(60);
 win.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error('Renderer:',event.message)}});
 win.webContents.on('render-process-gone',(_event,detail)=>console.error('Renderer gone',detail));
 await win.loadURL(process.argv[2]);
 console.log('Isolated page loaded');
 for(let i=0;i<100&&!await js('Boolean(window.fixture)');i++)await wait(100);
 if(!await js('Boolean(window.fixture)'))throw Error('Fixture not initialized');
 await js('fixture.start("html")');
 for(const full of [false,true]){
  const metrics=await js('fixture.sample('+full+',"zh-Hans","dark")');
  if(metrics.segments.filter(s=>s.lit==='true').length!==2)throw Error('Expected two lit segments: '+JSON.stringify(metrics));
  await writeFile(join(root,full?'fullscreen-dark.png':'normal-dark.png'),(await win.webContents.capturePage()).toPNG());
  report.visual.push({full,...metrics});await save();
  const back=await js('fixture.seek(1.1)');if(back.segments.filter(s=>s.lit==='true').length!==1)throw Error('Backward seek did not update word');
  const end=await js('fixture.seek(3.1)');if(end.segments.some(s=>s.current==='true'))throw Error('Explicit end did not clear current word');
 }
 for(const full of [false,true]){
  const metrics=await js('fixture.sample('+full+',"en","light")');
  await writeFile(join(root,full?'fullscreen-light.png':'normal-light.png'),(await win.webContents.capturePage()).toPNG());report.visual.push({full,theme:'light',...metrics});
 }
 report.stress=await js('fixture.stress()');await save();
 if(report.stress.segments!==3000||report.stress.pressureSegments!==16384||!report.stress.pressureLastFallback)throw Error('Stress parser bounds failed');
 for(const value of ['mpv','html']){
  console.log('Timing '+value+' started');
  const result=await js('fixture.measure('+JSON.stringify(value)+')');report.timing.push(result);await save();
  console.log('Timing '+value+': '+JSON.stringify({samples:result.samples.length,p95Ms:result.p95Ms,maxMs:result.maxMs,passed:result.passed}));
 }
 report.passed=report.timing.every(s=>s.passed)&&errors.length===0;await save();
 if(!report.passed)throw Error('Timing or renderer errors; see report.json');
 console.log('Enhanced LRC component / media validation passed');
 await native.dispose();win.destroy();app.exit(0);
}catch(error){
 report.passed=false;report.error=String(error);await save();
 if(win&&!win.isDestroyed())await writeFile(join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());
 console.error(error);await native.dispose();app.exit(1);
}}
app.whenReady().then(run);

