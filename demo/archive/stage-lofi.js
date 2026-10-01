import { mountArchiveStage } from './stage-lofi-renderer.js'

const colors=['#d76e98','#7b82c9','#cd8757'];
const albums=colors.map((color,i)=>{
 const art=document.createElement('canvas');art.width=art.height=128;const c=art.getContext('2d');
 c.fillStyle=color;c.fillRect(0,0,128,128);c.fillStyle='#252436';c.fillRect(12,12,104,104);c.fillStyle=color;c.fillRect(22,22,84,60);c.fillStyle='#d5cee0';c.fillRect(22,94,50,3);c.fillRect(22,103,30,2);
 return {title:`SIGNAL 0${i+1}`,artist:'COLOR STUDY',playCount:12+i*7,artworkUrl:art.toDataURL()};
});
const stages=[];
// Side engraving designed on the final pixel grid, after scene dithering.
const brandGlyphs={
 A:['01110','10001','10001','11111','10001','10001','10001'],
 U:['10001','10001','10001','10001','10001','10001','01110'],
 R:['11110','10001','10001','11110','10100','10010','10001'],
 L:['10000','10000','10000','10000','10000','10000','11111'],
 I:['11111','00100','00100','00100','00100','00100','11111'],
 S:['01111','10000','10000','01110','00001','00001','11110'],
};
function paintBrand(ctx,source){
 const cx=Number(source.dataset.badgeX)*320,cy=Number(source.dataset.badgeY)*192;
 if(!Number.isFinite(cx)||!Number.isFinite(cy))return;
 const x=Math.round(cx-20),y=Math.round(cy-3);
 const letters=(dx,dy,color,alpha=1)=>{ctx.fillStyle=color;ctx.globalAlpha=alpha;[...'AURALIS'].forEach((ch,i)=>brandGlyphs[ch].forEach((row,r)=>[...row].forEach((bit,c)=>{if(bit==='1')ctx.fillRect(x+i*6+c+dx,y+r+dy,1,1)})));};
 // Dark upper cut and a faint lower edge give depth without eroding the face.
 letters(0,-1,'#04050b');letters(0,1,'#a39ab6',.35);
 ctx.shadowColor=source.dataset.badgeAccent;ctx.shadowBlur=1;
 letters(0,0,source.dataset.badgeAccent,.22);ctx.shadowBlur=0;
 letters(0,0,source.dataset.badgeAccent);ctx.globalAlpha=1;
}
for(const id of ['reference','lofi']){
 const host=document.getElementById(id);const low=id==='lofi';
 host.style.setProperty('--archive-color-accent-secondary','#f46bab');
 host.innerHTML=`<div class="panel-head">${low?'02 / LO-FI':'01 / ORIGINAL'}<span>${low?'LIMITED COLOR · DITHER':'HIGH FIDELITY'}</span></div><div class="stage-container"><canvas id="album-stage" class="stage-source" aria-label="${low?'低保真':'原版'}专辑舞台"></canvas>${low?'<canvas class="stage-output" width="320" height="192" aria-hidden="true"></canvas><div class="scan"></div>':''}</div><div id="stage-caption" class="caption"><span id="stage-title" class="sr"></span><span id="stage-artist" class="sr"></span><canvas id="stage-caption-face" aria-hidden="true"></canvas></div><div class="controls"><button id="stage-prev" aria-label="上一张">←</button><div id="stage-selectors" class="selectors"></div><button id="stage-next" aria-label="下一张">→</button><button id="stage-auto"></button><span id="stage-position" class="position"></span></div>`;
 const root={host,getElementById:id=>host.querySelector(`[id="${id}"]`),querySelector:s=>host.querySelector(s)};
 const stage=mountArchiveStage(root);stages.push(stage);stage.setAlbums(albums);root.getElementById('stage-auto').click();
 if(low){
  const source=root.getElementById('album-stage'),out=host.querySelector('.stage-output'),ctx=out.getContext('2d',{willReadFrequently:true});
  const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  const shades=bayer.map(v=>Uint8ClampedArray.from({length:256},(_,channel)=>Math.round((channel+(v/16-.5)*24)/32)*32));
  const alpha=Uint8ClampedArray.from({length:256},(_,value)=>Math.round(value/64)*64);
  const sourceCtx=source.getContext('2d');let dirty=true;const clear=sourceCtx.clearRect.bind(sourceCtx);sourceCtx.clearRect=(...args)=>{dirty=true;return clear(...args)};
  let frame=0;const paint=()=>{if(!dirty||document.hidden)return;dirty=false;ctx.clearRect(0,0,320,192);ctx.imageSmoothingEnabled=true;ctx.drawImage(source,0,0,320,192);const image=ctx.getImageData(0,0,320,192),d=image.data;
   for(let p=0;p<320*192;p++){const i=p*4;if(d[i+3]<12){d[i+3]=0;continue}const x=p%320,y=(p/320)|0,lut=shades[(y%4)*4+x%4];d[i]=lut[d[i]];d[i+1]=lut[d[i+1]];d[i+2]=lut[d[i+2]];d[i+3]=alpha[d[i+3]];}
   ctx.putImageData(image,0,0);
   paintBrand(ctx,source);
  };
  const schedule=()=>{if(!frame&&!document.hidden)frame=requestAnimationFrame(()=>{frame=0;paint()})};
  // The renderer marks every changed source frame. Coalesce those updates
  // into one display pass per browser frame; idle scenes need no polling.
  sourceCtx.clearRect=(...args)=>{dirty=true;schedule();return clear(...args)};
  const start=()=>{cancelAnimationFrame(frame);frame=0;dirty=true;schedule()};document.addEventListener('visibilitychange',start);start();
  addEventListener('pagehide',()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',start);sourceCtx.clearRect=clear},{once:true});
 }
}
document.getElementById('replay').addEventListener('click',()=>stages.forEach(s=>s.setAlbums(albums)));
addEventListener('pagehide',()=>stages.forEach(s=>s.dispose()),{once:true});
