import { mountArchiveStage } from './mac-stage-device-renderer.js'
import { mountLoadTray } from './mac-stage-tray.js'
import { mountClassicMac } from './mac-stage-classic.js'

const $=id=>document.getElementById(id);
const formatDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=new Date(),past=new Date(today.getFullYear(),today.getMonth(),today.getDate()-137);
const days=[{date:formatDate(today),label:'今日',rows:[[0,24,96],[1,17,68],[2,12,43],[3,8,31],[4,5,22]]},{date:formatDate(past),label:'过去的一天',rows:[[3,31,124],[4,20,76],[0,14,57],[5,9,36],[1,4,16]]}];
const titles=['Signal Garden','Midnight Frequency','Golden Hour','Orbital Memory','Blue Horizon','Afterimage'];
const artists=['Glass Field','Parallel Youth','Solar Archive','Satellite Room','Soft Circuit','Echo System'];
const host=$('stage'),canvas=$('album-stage'),slot=document.querySelector('.floppy'),ghost=$('ghost'),glass=document.querySelector('.crt-glass');
glass.insertAdjacentHTML('beforeend','<div class="terminal-ui" role="region" aria-label="专辑统计窗口"><div class="terminal-title"><span>专辑统计</span></div><div class="date-tools"><label for="date">日期</label><button id="day-prev" aria-label="过去一天">&lt;</button><select id="date" aria-label="选择统计日期"></select><button id="day-next" aria-label="今日">&gt;</button></div><div class="list-heading" aria-hidden="true"><span>排名</span><span>专辑</span><span>次数</span></div><div class="album-list" id="album-list"></div><div class="screen-status" id="screen-status"></div></div>');
slot.removeAttribute('aria-hidden');slot.setAttribute('role','button');slot.tabIndex=0;slot.setAttribute('aria-label','装入选中专辑，从第一首开始演示播放');
$('rig').setAttribute('aria-label','Mac 音乐档案终端。长按拖动旋转，双击或按 Enter 放大屏幕。');
glass.querySelector('.terminal-title').insertAdjacentHTML('afterbegin','<button id="desktop-return" type="button" aria-label="关闭专辑统计，返回桌面" title="返回桌面"></button>');
$('desktop-return').onclick=()=>document.dispatchEvent(new CustomEvent('mac-desktop-return'));
document.addEventListener('mac-entry-selected',event=>{const id=event.detail.id;glass.classList.toggle('mac-album-open',id==='album');feedback(id==='album'?'已打开专辑统计，日期和舞台选择保持联动':id==='track'?'已选中单曲入口，内容页后续设计':'已选中年度总结入口，内容页后续设计');});
document.addEventListener('mac-mode-change',()=>{cancelGesture();cancelInsertion();});
$('stage-position').insertAdjacentHTML('afterend','<button id="load-album">装入</button>');
days.forEach((day,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${day.label} ${day.date}`;$('date').append(o)});
$('date').hidden=true;
$('date').insertAdjacentHTML('afterend','<div class="date-picker"><button id="date-trigger" type="button" aria-label="选择统计日期" aria-haspopup="listbox" aria-expanded="false" aria-controls="date-menu"><span></span><svg viewBox="0 0 8 5" aria-hidden="true"><path d="M0 0H8L4 5Z"/></svg></button><div id="date-menu" role="listbox" aria-label="统计日期" hidden></div></div>');
const dateOptions=days.map((day,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.textContent=`${day.label} ${day.date}`;b.onclick=()=>{$('date').value=String(i);showDay();closeDateMenu(true)};$('date-menu').append(b);return b});
function closeDateMenu(focus=false){$('date-menu').hidden=true;$('date-trigger').setAttribute('aria-expanded','false');if(focus)$('date-trigger').focus()}
function openDateMenu(){ $('date-menu').hidden=false;$('date-trigger').setAttribute('aria-expanded','true');dateOptions[Number($('date').value)].focus() }
$('date-trigger').onclick=()=>{$('date-menu').hidden?openDateMenu():closeDateMenu()};
$('date-trigger').onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();openDateMenu()}};
$('date-menu').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeDateMenu(true)}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const index=dateOptions.indexOf(document.activeElement);dateOptions[e.key==='Home'?0:e.key==='End'?dateOptions.length-1:(index+(e.key==='ArrowDown'?1:-1)+dateOptions.length)%dateOptions.length].focus()}};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.date-picker'))closeDateMenu()});
document.addEventListener('focusin',e=>{if(!e.target.closest('.date-picker'))closeDateMenu()});
document.addEventListener('mac-mode-change',()=>closeDateMenu());
document.addEventListener('mac-desktop-return',()=>closeDateMenu());
let current=0,selected=0,covers=[],albums=[],gesture=null,insertion=null,playing=null,disposed=false;
function updateMacBusy(){document.dispatchEvent(new CustomEvent('mac-operation-busy',{detail:{busy:!!gesture||!!insertion}}));}
const motion=matchMedia('(prefers-reduced-motion:reduce)');
const tray=mountLoadTray(slot,motion);
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
 $('date-trigger').querySelector('span').textContent=`${days[current].label} ${days[current].date}`;dateOptions.forEach((b,i)=>b.setAttribute('aria-selected',String(i===current)));
 albums=days[current].rows.map(([id,playCount,minutes])=>({id,title:titles[id],artist:artists[id],playCount,minutes,artworkUrl:covers[id]?.toDataURL()}));
 $('album-list').replaceChildren(...albums.map((a,i)=>{const b=document.createElement('button');b.className='album-row';b.type='button';b.setAttribute('aria-label',`${i+1} ${a.title}，${a.artist}，${a.playCount}次，${a.minutes}分钟`);b.innerHTML=`<span class="rank">${String(i+1).padStart(2,'0')}</span><span class="row-name">${a.title}</span><span class="count">${a.playCount}</span>`;b.onclick=()=>{cancelGesture();stage.select(i)};return b}));
 $('day-prev').disabled=current===1;$('day-next').disabled=current===0;
 stage.setAlbums(albums);updateSelection();transmit();feedback(playing?`演示播放中：${playing.title} · 第 1 首；当前浏览 ${days[current].date}`:`${days[current].date} · Top 5 已传送，长按舞台封面拖入槽口`);
 $('scene').setAttribute('aria-busy',String(!covers.length));
}
$('date').onchange=showDay;$('day-prev').onclick=()=>{$('date').value='1';showDay()};$('day-next').onclick=()=>{$('date').value='0';showDay()};
function cableLayout(){const base=$('scene').getBoundingClientRect(),jack=document.querySelector('.jack').getBoundingClientRect(),target=document.querySelector('.stage-container').getBoundingClientRect();const x1=jack.left+jack.width/2-base.left,y1=jack.top+jack.height/2-base.top,x2=target.left+target.width*.18-base.left,y2=target.top+target.height*.77-base.top;const sag=Math.min(base.height-8,Math.max(y1,y2)+100);document.querySelectorAll('#cable path').forEach(p=>p.setAttribute('d',`M${x1} ${y1} C${x1+100} ${sag},${x2-90} ${sag},${x2} ${y2}`))}
document.addEventListener('mac-view-geometry',cableLayout);
// Follow the animated transform as well as the resting machine geometry.
let cableFrame=0;
function followCable(){cableLayout();cableFrame=requestAnimationFrame(followCable)}
document.addEventListener('mac-view-transition',event=>{
 cancelAnimationFrame(cableFrame);cableFrame=0;
 cableLayout();
 if(event.detail.active)cableFrame=requestAnimationFrame(followCable);
});
addEventListener('pagehide',()=>cancelAnimationFrame(cableFrame),{once:true});
addEventListener('resize',()=>{cancelGesture();cancelInsertion();});
const resizeObserver=new ResizeObserver(cableLayout);resizeObserver.observe($('scene'));resizeObserver.observe($('studio'));resizeObserver.observe(host);
function insidePolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside}return inside}
function inSlot(x,y){return tray.hit(x,y)}
function moveGhost(x,y){ghost.style.left=`${x}px`;ghost.style.top=`${y}px`;tray.approach(x,y)}
function cancelGesture(keepTray=false){if(!gesture)return;const state=gesture;gesture=null;clearTimeout(state.timer);if(canvas.hasPointerCapture(state.pointerId))canvas.releasePointerCapture(state.pointerId);ghost.hidden=true;host.classList.remove('is-picked');canvas.classList.remove('is-carrying');if(!keepTray)tray.reset();updateMacBusy()}
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0||gesture||insertion||!covers.length)return;
 const scene=stage.inspect(),rect=canvas.getBoundingClientRect();if(!scene?.settled||!insidePolygon(e.clientX-rect.left,e.clientY-rect.top,scene.points))return;
 e.preventDefault();canvas.setPointerCapture(e.pointerId);const state=gesture={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,album:albums[selected],active:false};
 updateMacBusy();
 state.timer=setTimeout(()=>{if(gesture!==state)return;state.active=true;ghost.getContext('2d').drawImage(covers[state.album.id],0,0);ghost.hidden=false;host.classList.add('is-picked');canvas.classList.add('is-carrying');moveGhost(state.x,state.y);feedback(`将 ${state.album.title} 拖到 Mac 软盘槽，松手装入`)},320);
});
document.addEventListener('pointermove',e=>{if(!gesture||e.pointerId!==gesture.pointerId)return;gesture.x=e.clientX;gesture.y=e.clientY;if(!gesture.active){if(Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>10)cancelGesture();return}moveGhost(e.clientX,e.clientY)});
document.addEventListener('pointerup',e=>{if(!gesture||e.pointerId!==gesture.pointerId)return;const state=gesture,accept=state.active&&inSlot(e.clientX,e.clientY),x=e.clientX,y=e.clientY;cancelGesture(accept);if(accept)insertAlbum(state.album,x,y);else if(state.active)feedback('未装入，封面已返回舞台。长按后拖到亮起的槽口。')});
document.addEventListener('pointercancel',()=>cancelGesture());canvas.addEventListener('lostpointercapture',()=>cancelGesture());
function cancelInsertion(){if(!insertion)return;const state=insertion;insertion=null;state.controller.abort();ghost.hidden=true;updateMacBusy()}
async function insertAlbum(album,x,y){if(!covers.length||insertion)return;cancelGesture();ghost.getContext('2d').drawImage(covers[album.id],0,0);ghost.hidden=false;ghost.style.left=`${x}px`;ghost.style.top=`${y}px`;const state=insertion={album,controller:new AbortController()};feedback(`正在装入 ${album.title}…`);
 updateMacBusy();
 const loaded=await tray.load(covers[album.id],ghost,{x,y,signal:state.controller.signal});
 if(!loaded||insertion!==state||disposed)return;insertion=null;playing={...album,track:1};$('scene').dataset.playing=String(album.id);$('scene').dataset.track='1';feedback(`演示播放：${album.title} · ${album.artist} · 从第 1 首开始`);
 updateMacBusy();
}
function loadSelected(){const a=albums[selected];if(!a||!covers.length)return;const r=canvas.getBoundingClientRect();insertAlbum(a,r.left+r.width*.5,r.top+r.height*.4)}
$('load-album').onclick=loadSelected;slot.onclick=loadSelected;slot.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();loadSelected()}};
addEventListener('keydown',e=>{if(e.key==='Escape'){cancelGesture();cancelInsertion();feedback('已取消装入')}});addEventListener('blur',()=>{cancelGesture();cancelInsertion()});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelGesture();cancelInsertion()}});
showDay();$('load-album').disabled=true;
let worker=null,workerURL=null;
async function prepare(){try{const inputs=await Promise.all(SAMPLE_COVERS.slice(0,6).map(async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=c.height=96;const cctx=c.getContext('2d'),edge=Math.min(image.naturalWidth,image.naturalHeight);cctx.drawImage(image,(image.naturalWidth-edge)/2,(image.naturalHeight-edge)/2,edge,edge,0,0,96,96);return {size:96,colors:32,pixels:cctx.getImageData(0,0,96,96).data.buffer}}));if(disposed)return;
 workerURL=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));worker=new Worker(workerURL);worker.onerror=e=>fail(e.message);worker.onmessage=({data})=>{if(data.error){fail(data.error);return}covers=data.output.map(o=>{const c=document.createElement('canvas');c.width=c.height=96;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(o.pixels),96,96),0,0);const ctx=c.getContext('2d');ctx.fillStyle='rgba(9,11,22,.045)';for(let y=2;y<96;y+=3)ctx.fillRect(0,y,96,1);return c});worker.terminate();worker=null;URL.revokeObjectURL(workerURL);workerURL=null;$('load-album').disabled=false;showDay()};worker.postMessage({inputs,strength:.65,algorithm:'floyd'},inputs.map(i=>i.pixels));}catch(e){fail(e.message)}}
function fail(message){worker?.terminate();worker=null;if(workerURL)URL.revokeObjectURL(workerURL);workerURL=null;$('scene').setAttribute('aria-busy','false');feedback(`封面准备失败，请刷新重试：${message}`)}prepare();
const classic=mountClassicMac();
window.macStageDevice={inspect:()=>({...classic.inspect(),selected,current,dragging:!!gesture,inserting:!!insertion,playing})};
addEventListener('pagehide',()=>{disposed=true;cancelGesture();cancelInsertion();tray.dispose();resizeObserver.disconnect();stage.dispose();worker?.terminate();if(workerURL)URL.revokeObjectURL(workerURL)},{once:true});
