// Tray geometry lives in the Mac front face's CSS 3D coordinate system.
export function mountLoadTray(slot,motion){
 slot.insertAdjacentHTML('beforeend','<div class="load-tray" aria-hidden="true"><div class="tray-top"><div class="tray-media"><canvas width="96" height="96"></canvas><i class="tray-point p0"></i><i class="tray-point p1"></i><i class="tray-point p2"></i><i class="tray-point p3"></i></div></div><div class="tray-front"></div><div class="tray-side left"></div><div class="tray-side right"></div></div>');
 const surface=slot.querySelector('.tray-top'),media=slot.querySelector('.tray-media'),cover=media.querySelector('canvas');let busy=false,revision=0;
 function size(){slot.style.setProperty('--tray-width',`${slot.offsetWidth}px`)}size();
 const observer=new ResizeObserver(size);observer.observe(slot);
 function open(value){slot.classList.toggle('tray-open',value);slot.dataset.tray=value?'open':'closed'}
 open(false);
 function contains(x,y,r,padX,padY=padX){return x>=r.left-padX&&x<=r.right+padX&&y>=r.top-padY&&y<=r.bottom+padY}
 function hit(x,y){return contains(x,y,slot.getBoundingClientRect(),14,20)||(slot.classList.contains('tray-open')&&contains(x,y,surface.getBoundingClientRect(),10))}
 function approach(x,y){if(busy)return;const near=contains(x,y,slot.getBoundingClientRect(),50,55)||(slot.classList.contains('tray-open')&&contains(x,y,surface.getBoundingClientRect(),32));open(near);slot.classList.toggle('is-ready',hit(x,y))}
 function reset(){if(busy)return;open(false);slot.classList.remove('is-ready','tray-loaded')}
 function delay(ms,signal){if(motion.matches||signal.aborted)return Promise.resolve();return new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve()};timer=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true})})}
 async function load(texture,ghost,{x,y,signal}){
  busy=true;const run=++revision;let animation=null;
  const abort=()=>{animation?.cancel();if(run!==revision)return;ghost.hidden=true;open(false);slot.classList.remove('is-ready','tray-loaded');busy=false};signal.addEventListener('abort',abort,{once:true});
  try{
   if(signal.aborted)return false;
   open(true);slot.classList.add('is-ready');
   await delay(280,signal);if(signal.aborted)return false;
   cover.getContext('2d').drawImage(texture,0,0);
   surface.style.setProperty('--tray-cover',`url("${cover.toDataURL()}")`);
   const points=[...media.querySelectorAll('.tray-point')].map(p=>{const r=p.getBoundingClientRect();return {x:r.left,y:r.top}}),[p0,p1,,p3]=points;
   const width=ghost.offsetWidth,height=ghost.offsetHeight;
   const landing=`matrix(${(p1.x-p0.x)/width},${(p1.y-p0.y)/width},${(p3.x-p0.x)/height},${(p3.y-p0.y)/height},0,0)`;
   if(!motion.matches){
    animation=ghost.animate([{left:`${x}px`,top:`${y}px`,transform:'translate(-50%,-50%)',transformOrigin:'0 0',opacity:1},{left:`${p0.x}px`,top:`${p0.y}px`,transform:landing,transformOrigin:'0 0',opacity:1}],{duration:340,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
    await animation.finished.catch(()=>{});if(signal.aborted)return false;
   }
   slot.classList.add('tray-loaded');ghost.hidden=true;animation?.cancel();animation=null;
   await delay(110,signal);if(signal.aborted)return false;
   open(false);slot.classList.remove('is-ready');await delay(280,signal);
   return !signal.aborted;
  }finally{signal.removeEventListener('abort',abort);animation?.cancel();if(run===revision){ghost.hidden=true;open(false);slot.classList.remove('is-ready','tray-loaded');busy=false}}
 }
 return {hit,approach,reset,load,dispose:()=>{observer.disconnect();reset()}};
}
