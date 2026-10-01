import { mountArchiveStage } from './mac-stage-link-renderer.js'

const $=id=>document.getElementById(id);
const formatDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=new Date(),past=new Date(today.getFullYear(),today.getMonth(),today.getDate()-137);
const days=[{date:formatDate(today),label:'今日',rows:[[0,24,96],[1,17,68],[2,12,43],[3,8,31],[4,5,22]]},{date:formatDate(past),label:'过去的一天',rows:[[3,31,124],[4,20,76],[0,14,57],[5,9,36],[1,4,16]]}];
const titles=['Signal Garden','Midnight Frequency','Golden Hour','Orbital Memory','Blue Horizon','Afterimage'];
const artists=['Glass Field','Parallel Youth','Solar Archive','Satellite Room','Soft Circuit','Echo System'];
const host=$('stage'),canvas=$('album-stage'),slot=document.querySelector('.floppy'),ghost=$('ghost'),glass=document.querySelector('.crt-glass');
glass.insertAdjacentHTML('beforeend','<div class="terminal-ui"><div class="terminal-title">ALBUM ARCHIVE / TOP 5</div><div class="date-tools"><button id="day-prev" aria-label="过去一天">&lt;</button><select id="date" aria-label="选择统计日期"></select><button id="day-next" aria-label="今日">&gt;</button></div><div class="album-list" id="album-list"></div><div class="screen-status" id="screen-status"></div></div>');
slot.removeAttribute('aria-hidden');slot.setAttribute('role','button');slot.tabIndex=0;slot.setAttribute('aria-label','装入选中专辑，从第一首开始演示播放');
$('rig').tabIndex=-1;$('rig').setAttribute('aria-label','Mac 音乐档案终端');$('body-power').disabled=true;
$('stage-position').insertAdjacentHTML('afterend','<button id="load-album">装入</button>');
days.forEach((day,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${day.label} ${day.date}`;$('date').append(o)});
let current=0,selected=0,covers=[],albums=[],gesture=null,insertion=null,playing=null,disposed=false;
const motion=matchMedia('(prefers-reduced-motion:reduce)');
function feedback(text){$('feedback').textContent=text}
const root={host,coverDragging:true,getElementById:$,querySelector:s=>host.querySelector(s),onGeometry:geometry=>{canvas.dataset.coverGeometry=JSON.stringify(geometry)},onSelection:index=>{
 if(index===selected)return;cancelGesture();selected=index;updateSelection();transmit();
}};
const stage=mountArchiveStage(root);
// This interaction uses deliberate selection, so automatic rotation stays off.
if($('stage-auto').getAttribute('aria-pressed')==='true')$('stage-auto').click();
function updateSelection(){document.querySelectorAll('.album-row').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));const a=albums[selected];if(a)$('screen-status').textContent=`${a.artist} / ${a.playCount} 次 / ${a.minutes} min`;}
function transmit(){const line=document.querySelector('.signal');line.classList.remove('sending');void line.getBoundingClientRect();line.classList.add('sending')}
function showDay(){cancelGesture();cancelInsertion();current=Number($('date').value);selected=0;
 albums=days[current].rows.map(([id,playCount,minutes])=>({id,title:titles[id],artist:artists[id],playCount,minutes,artworkUrl:covers[id]?.toDataURL()}));
 $('album-list').replaceChildren(...albums.map((a,i)=>{const b=document.createElement('button');b.className='album-row';b.type='button';b.setAttribute('aria-label',`${i+1} ${a.title}，${a.artist}，${a.playCount}次，${a.minutes}分钟`);b.innerHTML=`<span class="rank">${String(i+1).padStart(2,'0')}</span><span class="row-name">${a.title}</span><span class="count">${a.playCount}</span>`;b.onclick=()=>{cancelGesture();stage.select(i)};return b}));
 $('day-prev').disabled=current===1;$('day-next').disabled=current===0;
 stage.setAlbums(albums);updateSelection();transmit();feedback(playing?`演示播放中：${playing.title} · 第 1 首；当前浏览 ${days[current].date}`:`${days[current].date} · Top 5 已传送，长按舞台封面拖入槽口`);
 $('scene').setAttribute('aria-busy',String(!covers.length));
}
$('date').onchange=showDay;$('day-prev').onclick=()=>{$('date').value='1';showDay()};$('day-next').onclick=()=>{$('date').value='0';showDay()};
function cableLayout(){cancelGesture();const base=$('scene').getBoundingClientRect(),jack=document.querySelector('.jack').getBoundingClientRect(),target=document.querySelector('.stage-container').getBoundingClientRect();const x1=jack.left+jack.width/2-base.left,y1=jack.top+jack.height/2-base.top,x2=target.left+target.width*.18-base.left,y2=target.top+target.height*.77-base.top;const sag=Math.min(base.height-8,Math.max(y1,y2)+100);document.querySelectorAll('#cable path').forEach(p=>p.setAttribute('d',`M${x1} ${y1} C${x1+100} ${sag},${x2-90} ${sag},${x2} ${y2}`))}
const resizeObserver=new ResizeObserver(cableLayout);resizeObserver.observe($('scene'));resizeObserver.observe($('studio'));resizeObserver.observe(host);
function insidePolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside}return inside}
function inSlot(x,y){const r=slot.getBoundingClientRect();return x>=r.left-14&&x<=r.right+14&&y>=r.top-20&&y<=r.bottom+20}
function moveGhost(x,y){ghost.style.left=`${x}px`;ghost.style.top=`${y}px`;slot.classList.toggle('is-ready',inSlot(x,y))}
function cancelGesture(){if(!gesture)return;const state=gesture;gesture=null;clearTimeout(state.timer);if(canvas.hasPointerCapture(state.pointerId))canvas.releasePointerCapture(state.pointerId);ghost.hidden=true;host.classList.remove('is-picked');canvas.classList.remove('is-carrying');slot.classList.remove('is-ready')}
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0||gesture||insertion||!covers.length)return;
 const scene=stage.inspect(),rect=canvas.getBoundingClientRect();if(!scene?.settled||!insidePolygon(e.clientX-rect.left,e.clientY-rect.top,scene.points))return;
 e.preventDefault();canvas.setPointerCapture(e.pointerId);const state=gesture={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,album:albums[selected],active:false};
 state.timer=setTimeout(()=>{if(gesture!==state)return;state.active=true;ghost.getContext('2d').drawImage(covers[state.album.id],0,0);ghost.hidden=false;host.classList.add('is-picked');canvas.classList.add('is-carrying');moveGhost(state.x,state.y);feedback(`将 ${state.album.title} 拖到 Mac 软盘槽，松手装入`)},320);
});
document.addEventListener('pointermove',e=>{if(!gesture||e.pointerId!==gesture.pointerId)return;gesture.x=e.clientX;gesture.y=e.clientY;if(!gesture.active){if(Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>10)cancelGesture();return}moveGhost(e.clientX,e.clientY)});
document.addEventListener('pointerup',e=>{if(!gesture||e.pointerId!==gesture.pointerId)return;const state=gesture,accept=state.active&&inSlot(e.clientX,e.clientY),x=e.clientX,y=e.clientY;cancelGesture();if(accept)insertAlbum(state.album,x,y);else if(state.active)feedback('未装入，封面已返回舞台。长按后拖到亮起的槽口。')});
document.addEventListener('pointercancel',cancelGesture);canvas.addEventListener('lostpointercapture',cancelGesture);
function cancelInsertion(){if(!insertion)return;const state=insertion;insertion=null;state.animation?.cancel();ghost.hidden=true;slot.classList.remove('is-ready')}
function insertAlbum(album,x,y){if(!covers.length||insertion)return;cancelGesture();const rect=slot.getBoundingClientRect();ghost.getContext('2d').drawImage(covers[album.id],0,0);ghost.hidden=false;ghost.style.left=`${x}px`;ghost.style.top=`${y}px`;slot.classList.add('is-ready');const state=insertion={album};feedback(`正在装入 ${album.title}…`);
 const finish=()=>{if(insertion!==state||disposed)return;insertion=null;ghost.hidden=true;slot.classList.remove('is-ready');playing={...album,track:1};$('scene').dataset.playing=String(album.id);$('scene').dataset.track='1';feedback(`演示播放：${album.title} · ${album.artist} · 从第 1 首开始`)};
 if(motion.matches){finish();return}
 state.animation=ghost.animate([{left:`${x}px`,top:`${y}px`,transform:'translate(-50%,-50%) scale(1)',opacity:1},{left:`${rect.left+rect.width/2}px`,top:`${rect.top+rect.height/2}px`,transform:'translate(-50%,-50%) scale(.15,.035)',opacity:.2}],{duration:550,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});state.animation.onfinish=()=>{state.animation.cancel();finish()};
}
function loadSelected(){const a=albums[selected];if(!a||!covers.length)return;const r=canvas.getBoundingClientRect();insertAlbum(a,r.left+r.width*.5,r.top+r.height*.4)}
$('load-album').onclick=loadSelected;slot.onclick=loadSelected;slot.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();loadSelected()}};
addEventListener('keydown',e=>{if(e.key==='Escape'){cancelGesture();cancelInsertion();feedback('已取消装入')}});addEventListener('blur',cancelGesture);document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelGesture();cancelInsertion()}});
// Low-resolution output retains smooth renderer timing, with no idle polling.
const output=document.querySelector('.stage-output'),ctx=output.getContext('2d',{willReadFrequently:true}),source=canvas.getContext('2d'),clear=source.clearRect.bind(source);
const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5],shades=bayer.map(v=>Uint8ClampedArray.from({length:256},(_,c)=>Math.round((c+(v/16-.5)*24)/32)*32));let frame=0;
function paint(){frame=0;if(disposed||document.hidden)return;ctx.clearRect(0,0,320,192);ctx.drawImage(canvas,0,0,320,192);const image=ctx.getImageData(0,0,320,192),d=image.data;for(let p=0;p<320*192;p++){const i=p*4,lut=shades[(((p/320)|0)%4)*4+p%4];d[i]=lut[d[i]];d[i+1]=lut[d[i+1]];d[i+2]=lut[d[i+2]]}ctx.putImageData(image,0,0);paintBrand()}
const brand={A:[14,17,17,31,17,17,17],U:[17,17,17,17,17,17,14],R:[30,17,17,30,20,18,17],L:[16,16,16,16,16,16,31],I:[31,4,4,4,4,4,31],S:[15,16,16,14,1,1,30]};
function paintBrand(){const x=Math.round(Number(canvas.dataset.badgeX)*320-20),y=Math.round(Number(canvas.dataset.badgeY)*192-3);if(!Number.isFinite(x)||!Number.isFinite(y))return;for(const [dy,color]of[[-1,'#04050b'],[0,canvas.dataset.badgeAccent]]){ctx.fillStyle=color;[...'AURALIS'].forEach((ch,i)=>brand[ch].forEach((row,r)=>{for(let c=0;c<5;c++)if(row&(16>>c))ctx.fillRect(x+i*6+c,y+r+dy,1,1)}))}}
source.clearRect=(...args)=>{if(!frame&&!disposed&&!document.hidden)frame=requestAnimationFrame(paint);return clear(...args)};
showDay();$('load-album').disabled=true;
let worker=null,workerURL=null;
async function prepare(){try{const inputs=await Promise.all(SAMPLE_COVERS.slice(0,6).map(async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=c.height=96;const cctx=c.getContext('2d'),edge=Math.min(image.naturalWidth,image.naturalHeight);cctx.drawImage(image,(image.naturalWidth-edge)/2,(image.naturalHeight-edge)/2,edge,edge,0,0,96,96);return {size:96,colors:32,pixels:cctx.getImageData(0,0,96,96).data.buffer}}));if(disposed)return;
 workerURL=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));worker=new Worker(workerURL);worker.onerror=e=>fail(e.message);worker.onmessage=({data})=>{if(data.error){fail(data.error);return}covers=data.output.map(o=>{const c=document.createElement('canvas');c.width=c.height=96;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(o.pixels),96,96),0,0);return c});worker.terminate();worker=null;URL.revokeObjectURL(workerURL);workerURL=null;$('load-album').disabled=false;showDay()};worker.postMessage({inputs,strength:.65,algorithm:'floyd'},inputs.map(i=>i.pixels));}catch(e){fail(e.message)}}
function fail(message){worker?.terminate();worker=null;if(workerURL)URL.revokeObjectURL(workerURL);workerURL=null;$('scene').setAttribute('aria-busy','false');feedback(`封面准备失败，请刷新重试：${message}`)}prepare();
addEventListener('pagehide',()=>{disposed=true;cancelGesture();cancelInsertion();cancelAnimationFrame(frame);source.clearRect=clear;resizeObserver.disconnect();stage.dispose();worker?.terminate();if(workerURL)URL.revokeObjectURL(workerURL)},{once:true});
