import { app } from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const output=resolve(process.env.BADGE_OPEN_COMPARE?'output/badge-open-performance-compare':'output/badge-open-performance');mkdirSync(output,{recursive:true})
const profile=mkdtempSync(join(output,'profile-'));mkdirSync(join(profile,'data'));mkdirSync(join(profile,'cache'));writeFileSync(join(profile,'data/auralis.sqlite'),'')
const setPath=app.setPath.bind(app);app.setPath=(name,value)=>setPath(name,name==='userData'?profile:name==='cache'?join(profile,'cache'):value)
app.getAppPath=()=>resolve('.');app.setPath('userData',profile);app.setPath('cache',join(profile,'cache'))
delete process.env.ELECTRON_RENDERER_URL;delete process.env.AURALIS_SMOKE_TEST;process.env.AURALIS_QUIET_GPU_LOGS='1'
const wait=ms=>new Promise(r=>setTimeout(r,ms));let win,started=false;const results=[],errors=[]
const timeout=setTimeout(()=>finish(new Error('timeout')),100000)
function finish(error){clearTimeout(timeout);if(error)console.error(error);writeFileSync(join(output,'report.json'),JSON.stringify({profile,results,errors,error:error?.stack},null,2));app.exit(error?1:0)}
app.on('browser-window-created',(_e,w)=>{if(started)return;started=true;win=w;w.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});w.webContents.once('did-finish-load',()=>run().then(()=>finish()).catch(finish))})
async function run(){
 const wc=win.webContents,js=code=>wc.executeJavaScript(code)
 const until=async code=>{for(let i=0;i<1500;i++){if(await js(code))return;await wait(15)}throw new Error(code)}
 const click=async selector=>{const b=await js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`),p={x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};wc.sendInputEvent({type:'mouseMove',...p});wc.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...p});wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...p})}
 await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 const info=await js('window.auralis.app.getInfo()');if(info.databasePath!==join(profile,'data','auralis.sqlite'))throw new Error('isolation failed')
 win.setContentSize(1440,900);await wait(180);await js(`location.hash='#/archive'`);await until(`!!document.querySelector('.archive-milestone-case__slot img')`)
 wc.debugger.attach('1.3');await wc.debugger.sendCommand('Profiler.enable');await wc.debugger.sendCommand('Profiler.setSamplingInterval',{interval:500})
 await js(`
 window.__perf={events:[],runs:[]};window.__event=(type,data={})=>window.__perf.events.push({type,t:performance.now(),...data});
 const NativeResizeObserver=ResizeObserver;window.ResizeObserver=class extends NativeResizeObserver{constructor(callback){let first=true;super((entries,observer)=>{const foam=entries.some(e=>e.target.classList.contains('foam-sheet'));if(foam)__event('foam-resize',{first,skip:first&&window.__skipInitialFoamResize,rect:entries[0].contentRect.toJSON()});if(!(foam&&first&&window.__skipInitialFoamResize))callback(entries,observer);first=false})}};
 const dec=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){const start=performance.now(),src=this.src;__event('decode-start',{src});return dec.call(this).then(v=>{__event('decode-end',{src,start,duration:performance.now()-start,w:this.naturalWidth,h:this.naturalHeight});return v})};
 const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){if(String(args[0]).startsWith('webgl'))__event('webgl-context');return get.apply(this,args)};
 const read=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(...args){const start=performance.now(),v=read.apply(this,args);__event('canvas-read',{start,duration:performance.now()-start,w:args[2],h:args[3],cls:this.canvas.className});return v};
 const put=CanvasRenderingContext2D.prototype.putImageData;CanvasRenderingContext2D.prototype.putImageData=function(...args){const start=performance.now(),v=put.apply(this,args);__event('canvas-commit',{start,duration:performance.now()-start,cls:this.canvas.className});return v};
 const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);__event('worker-create',{url:String(args[0])});this.addEventListener('message',e=>__event('worker-result',{generation:e.data.generation,computeMs:e.data.computeMs}));}postMessage(...args){const d=args[0];__event('worker-post',{kind:d.type,generation:d.generation,width:d.configuration?.width,height:d.configuration?.height,fields:d.configuration?.fields.length});return super.postMessage(...args)}};
 new PerformanceObserver(l=>l.getEntries().forEach(e=>__event('longtask',{start:e.startTime,duration:e.duration}))).observe({type:'longtask',buffered:false});
 document.addEventListener('click',e=>{if(e.target.closest('[data-milestone-gallery-trigger]')){__event('click');new MutationObserver((_,o)=>{const g=document.querySelector('.archive-badge-gallery');if(g&&!window.__perf.events.some(e=>e.type==='mounted'&&e.t>window.__perf.events.findLast(e=>e.type==='click').t))__event('mounted');if(g?.classList.contains('is-ready')){__event('ready');g.addEventListener('transitionend',e=>{if(e.target===g)__event('visible')},{once:true});o.disconnect()}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})}},true);void 0
 `)
 const ready=`document.querySelector('.archive-badge-gallery')?.classList.contains('is-ready')`
 const cases=process.env.BADGE_OPEN_COMPARE?[['first-wide',1440,900],['reopen-wide',1440,900],['skip-initial-resize',1440,900],['skip-initial-resize-2',1440,900],['baseline-again',1440,900]]:[['first-wide',1440,900],['reopen-wide',1440,900],['reopen-small',900,620],['reopen-wide-2',1440,900]];
 for(const [label,width,height] of cases){
  win.setContentSize(width,height);await wait(200);await js(`window.__perf.events=[];window.__skipInitialFoamResize=${label.startsWith('skip-')};void 0`);if(!process.env.BADGE_OPEN_COMPARE)await wc.debugger.sendCommand('Profiler.start');await click('[data-milestone-gallery-trigger]');await until(ready);await wait(250);const cpu=process.env.BADGE_OPEN_COMPARE?{nodes:[]}: (await wc.debugger.sendCommand('Profiler.stop')).profile;if(!process.env.BADGE_OPEN_COMPARE)writeFileSync(join(output,label+'.cpuprofile'),JSON.stringify(cpu));
  const sample=await js(`({events:window.__perf.events, dpr:devicePixelRatio, w:innerWidth,h:innerHeight,canvas:{width:document.querySelector('.foam-surface').width,height:document.querySelector('.foam-surface').height},resources:performance.getEntriesByType('resource').filter(e=>e.startTime>=window.__perf.events.find(e=>e.type==='click').t).map(e=>({name:e.name,start:e.startTime,duration:e.duration,bytes:e.decodedBodySize}))})`)
  const start=sample.events.find(e=>e.type==='click').t;sample.events=sample.events.map(e=>({...e,t:e.t-start,start:e.start===undefined?undefined:e.start-start}));
  const nodes=new Map(cpu.nodes.map(n=>[n.id,n]));const self=new Map();for(let i=0;i<(cpu.samples?.length||0);i++){const n=nodes.get(cpu.samples[i]),k=n.callFrame.functionName+' '+n.callFrame.url+':'+(n.callFrame.lineNumber+1);self.set(k,(self.get(k)||0)+(cpu.timeDeltas[i]||0)/1000)}sample.cpuSelf=[...self].sort((a,b)=>b[1]-a[1]).slice(0,24);results.push({label,...sample});
  console.log(JSON.stringify({label,ready:sample.events.find(e=>e.type==='ready')?.t,visible:sample.events.find(e=>e.type==='visible')?.t,resets:sample.events.filter(e=>e.type==='worker-post'),longtasks:sample.events.filter(e=>e.type==='longtask'),cpuSelf:sample.cpuSelf.slice(0,8)}));
  await click('.case-close');await until(`!document.querySelector('.archive-badge-dialog')`)
 }
 wc.debugger.detach()
}
await import(pathToFileURL(resolve('out/main/index.js')).href)
