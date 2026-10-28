import {createApp,h,nextTick,watch} from 'vue';
import {createI18n} from 'vue-i18n';
import LyricsPanel from '@renderer/features/lyrics/components/LyricsPanel.vue';
import FullscreenPlayerOverlay from '@renderer/app/layout/FullscreenPlayerOverlay.vue';
import {usePlayback} from '@renderer/features/playback/composables/usePlayback';
import {useTrackLyrics} from '@renderer/features/lyrics/composables/useTrackLyrics';
import {useFullscreenPlayer} from '@renderer/features/playback/composables/useFullscreenPlayer';
import {useChineseTextDisplay} from '@renderer/features/appearance/composables/useChineseTextDisplay';
import {useFullscreenLyricsTypography} from '@renderer/features/lyrics/composables/useFullscreenLyricsTypography';
import {useFullscreenBackground} from '@renderer/features/playback/composables/useFullscreenBackground';
import {parseLrc} from '@renderer/features/lyrics/utils/parseLrc';
import zh from '@renderer/locales/zh-Hans.json';import en from '@renderer/locales/en.json';
import '@renderer/app/styles/main.css';import 'virtual:uno.css';
const i18n=createI18n({legacy:false,locale:'zh-Hans',messages:{'zh-Hans':zh,en}});
const playback=usePlayback(),lyrics=useTrackLyrics(),fullscreen=useFullscreenPlayer();
const track={id:1,title:'增强型 LRC 隔离验收',artist:'Synthetic audio',album:'Isolated',albumArtist:'Test',durationSeconds:54,artworkCacheKey:null};
playback.setPlaybackMode('sequential');
playback.setVolume(0);
const app=createApp({render:()=>h('div',{style:'height:100vh;padding:24px;background:var(--auralis-main-bg);color:var(--auralis-text)'},[
 h('div',{class:'now-playing-panel',style:'height:calc(100vh - 48px);width:480px;max-width:100%'},[h(LyricsPanel)]),
 h(FullscreenPlayerOverlay)
])});
app.directive('tooltip',{});app.use(i18n).mount('#app');
const wait=ms=>new Promise(done=>setTimeout(done,ms));
async function reload(raw){window.testLyrics=raw;window.reloadTestLyrics();await wait(100);await nextTick()}
function activeRow(){return document.querySelector(fullscreen.isFullscreenPlayerOpen.value?'.fullscreen-player-lyric-active[data-lyric-index]':'.lyric-active[data-lyric-index]')}
window.fixture={
 playback,lyrics,fullscreen,
 async start(backend='mpv'){window.testNative=backend==='mpv';await window.validationBridge.backend(backend);playback.setGaplessPlaybackEnabled(backend==='mpv');await playback.playTrackFromQueue([track],1);await wait(200)},
 async visual(full=false){
  playback.pause();await wait(100);playback.seekTo(1.65);await wait(200);
  if(full)fullscreen.openFullscreenPlayer();else fullscreen.closeFullscreenPlayer();
  await wait(600);return this.geometry();
 },
 geometry(){const row=activeRow();return {text:row?.textContent,segments:[...(row?.querySelectorAll('[data-lyric-segment]')??[])].map(node=>({text:node.textContent,lit:node.dataset.lit,current:node.dataset.current,color:getComputedStyle(node).color})),height:row?.getBoundingClientRect().height,dom:document.querySelectorAll('[data-lyric-segment]').length,bodyWidth:document.body.scrollWidth,viewport:innerWidth}},
 async sample(full,locale,theme){i18n.global.locale.value=locale;document.documentElement.setAttribute('data-theme',theme);return this.visual(full)},
 async seek(time){playback.seekTo(time);await wait(220);return this.geometry()},
 async stress(){
  playback.pause();await wait(80);
  const make=(rows,words)=>Array.from({length:rows},(_,r)=>'['+String(r).padStart(2,'0')+':00]'+Array.from({length:words},(_,w)=>'<'+String(r).padStart(2,'0')+':'+String(w).padStart(2,'0')+'>word ').join('')).join('\n');
  const raw=make(300,10),pressure=Array.from({length:17},()=> '[00:00]'+ '<0:00>a'.repeat(1024)).join('\n');
  const before=performance.now();const parsed=parseLrc(raw);const parsedMs=performance.now()-before;
  const p0=performance.now();const extreme=parseLrc(pressure);const pressureMs=performance.now()-p0;
  await reload(raw);playback.seekTo(3);await wait(200);
  const normal=this.geometry();fullscreen.openFullscreenPlayer();await wait(700);const full=this.geometry();
  await reload(pressure);playback.seekTo(0.1);await wait(300);
  return {rawLength:raw.length,rows:parsed.length,segments:parsed.reduce((n,l)=>n+(l.segments?.length??0),0),parsedMs,pressureLength:pressure.length,pressureMs,pressureSegments:extreme.reduce((n,l)=>n+(l.segments?.length??0),0),pressureLastFallback:!extreme.at(-1).segments,normal,full,pressure:this.geometry()};
 },
 async measure(backend){
  const timestamp=(s)=>String(Math.floor(s/60)).padStart(2,'0')+':'+(s%60).toFixed(3).padStart(6,'0');
  const raw='[00:00]'+Array.from({length:101},(_,i)=>'<'+timestamp(1+i*0.5)+'>字'+i+' ').join('')+'<00:52.000>';
  await reload(raw);
  if(backend==='mpv')fullscreen.openFullscreenPlayer();else fullscreen.closeFullscreenPlayer();
  await this.start(backend);await wait(300);
  const samples=[],intervals=[];let previousUpdate=performance.now(),last=-1;
  const stop=watch(()=>playback.state.currentTime,()=>{const now=performance.now();intervals.push(now-previousUpdate);previousUpdate=now});
  const deadline=performance.now()+65000;
  while(last<100&&performance.now()<deadline){
   await new Promise(done=>requestAnimationFrame(done));
   const row=activeRow();const lit=[...(row?.querySelectorAll('[data-lit="true"]')??[])];
   const latest=lit.length?Number(lit.at(-1).dataset.lyricSegment):-1;
   if(latest>last){
    const reference=backend==='mpv'?await window.validationBridge.reference():window.testAudio.currentTime;
    for(let i=last+1;i<=latest;i++) samples.push({index:i,reference,state:playback.state.currentTime,errorMs:(reference-(1+i*0.5))*1000});
    last=latest;
   }
   if(playback.state.error)throw Error(playback.state.error);
  }
  stop();playback.pause();
  if(samples.length!==101)throw Error('Incomplete boundaries '+backend+' '+samples.length);
  const errors=samples.map(s=>Math.abs(s.errorMs)).sort((a,b)=>a-b);
  const result={backend,samples,intervals,p95Ms:errors[Math.floor(errors.length*.95)],maxMs:errors.at(-1),passed:errors[Math.floor(errors.length*.95)]<=150&&errors.at(-1)<=300};
  return result;
 },
 async restore(){await reload('[00:00]<00:01.000>我 <00:01.500>听见 <00:02.000>雨声 <00:03.000>\n[00:05]普通歌词 plain line\n[00:10]')},
 script(value){useChineseTextDisplay().setLyricsScript(value)},
 typography(value){useFullscreenLyricsTypography().setPreference(value)},
 background(){useFullscreenBackground().setBackgroundMotionPaused(true)},
 reload,
 async edges(){
  playback.pause();await wait(100);
  await reload('[00:00]<00:01>头<00:02>发<00:03>');playback.seekTo(1.5);await wait(150);
  this.script('traditional');await nextTick();await wait(50);
  const converted=this.geometry();if(converted.text!=='頭髮'||converted.segments.length)throw Error('Cross-boundary conversion was not downgraded');
  this.script('simplified');await nextTick();await wait(50);const restored=this.geometry();
  if(restored.segments.length!==2)throw Error('Original timing did not return');
  await reload('[00:00]<00:01>  音乐 é👩‍🎤 <00:02>interoperabilitySupercalifragilisticexpialidocious <00:03>听见雨声 <b>literal text</b><00:05>');
  playback.seekTo(2.5);await wait(180);
  const row=activeRow();row.querySelector('[data-lyric-segment]').click();await wait(180);
  const clicked=playback.state.currentTime;if(clicked>0.1)throw Error('Word click did not seek to line start');
  playback.seekTo(2.5);await wait(180);activeRow().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(180);
  const keyed=playback.state.currentTime;if(keyed>0.1)throw Error('Line keyboard seek failed');
  playback.seekTo(2.5);await wait(180);const long=this.geometry();
  const root=fullscreen.isFullscreenPlayerOpen.value?document.querySelector('.fullscreen-player-lyrics-scroll'):document.querySelector('.synced-lyrics-scroll');
  const parent=root.getBoundingClientRect();const rect=activeRow().getBoundingClientRect();
  return {converted,restored,clicked,keyed,long,scroll:{clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,rowHeight:rect.height,parentHeight:parent.height},literalTagCreated:!!activeRow().querySelector('b')};
 },
 async longTasks(){
  const entries=[];const observer=new PerformanceObserver(list=>entries.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));
  observer.observe({type:'longtask'});
  const result=await this.stress();await wait(200);observer.disconnect();
  const comparisons=[];
  for(const enhanced of [false,true]){
   const raw=Array.from({length:300},(_,r)=>'['+String(r).padStart(2,'0')+':00]'+Array.from({length:10},(_,w)=>(enhanced?'<'+String(r).padStart(2,'0')+':'+String(w).padStart(2,'0')+'>':'')+'word ').join('')).join('\n');
   const tasks=[];const obs=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>e.duration)));obs.observe({type:'longtask'});
   const begin=performance.now();await reload(raw);await wait(200);obs.disconnect();
   comparisons.push({enhanced,elapsedIncludingWait:performance.now()-begin,longTasks:tasks,dom:this.geometry().dom});
  }
  return {entries,result,comparisons};
 },
};

