(() => {
 const stats = window.__badgeProbe = {workers:0, workerMessages:0, workerComputeMs:0, lastPressures:[], gl:0, drawFrames:0, pose:0, sawBack:false, entries:[], record:false, failWorker:false, textures:0, maxTextures:0, nativeEvents:[]}
 const WorkerBase=window.Worker
 window.Worker=class extends WorkerBase {
  constructor(url,options) {
   if(String(url).includes('badgePressure.worker') && stats.failWorker) throw new Error('probe: unavailable Worker')
   super(url,options)
   this.badge=String(url).includes('badgePressure.worker')
   this.done=false
   if(this.badge) {stats.workers++;this.addEventListener('message',event=>{stats.workerMessages++;stats.workerComputeMs+=event.data.computeMs||0})}
  }
  postMessage(...args) { if(this.badge) stats.lastPressures=[...args[0].pressures];return super.postMessage(...args) }
  terminate() {if(this.badge&&!this.done){stats.workers--;this.done=true}return super.terminate()}
 }
 let rafId=0,currentFrame=0,lastDraw=-1
 const raf=requestAnimationFrame
 window.requestAnimationFrame=callback=>raf(time=>{currentFrame=++rafId;callback(time)})
 const contexts=new WeakSet(), locationNames=new WeakMap(), activeTextures=new Set()
 const get=HTMLCanvasElement.prototype.getContext
 HTMLCanvasElement.prototype.getContext=function(...args) {
  const context=get.apply(this,args)
  if(!context||!this.classList.contains('inspect-canvas')||!String(args[0]).startsWith('webgl')||contexts.has(context)) return context
  contexts.add(context);stats.gl++
  const extension=context.getExtension('WEBGL_debug_renderer_info')
  stats.gpu=extension?context.getParameter(extension.UNMASKED_RENDERER_WEBGL):context.getParameter(context.RENDERER)
  stats.dpr=devicePixelRatio
  this.addEventListener('webglcontextlost',()=>{stats.gl--;activeTextures.clear();stats.textures=0})
  const create=context.createTexture.bind(context),del=context.deleteTexture.bind(context)
  context.createTexture=()=>{const t=create();activeTextures.add(t);stats.textures=activeTextures.size;stats.maxTextures=Math.max(stats.maxTextures,stats.textures);return t}
  context.deleteTexture=t=>{activeTextures.delete(t);stats.textures=activeTextures.size;return del(t)}
  const uniform=context.getUniformLocation.bind(context),matrix=context.uniformMatrix4fv.bind(context)
  context.getUniformLocation=(program,name)=>{const location=uniform(program,name);if(location)locationNames.set(location,name);return location}
  context.uniformMatrix4fv=(location,transpose,value,...rest)=>{
   if(locationNames.get(location)==='modelViewMatrix') {
    stats.pose=Math.atan2(value[8],value[0]);if(value[0]<-.9)stats.sawBack=true
   }
   return matrix(location,transpose,value,...rest)
  }
  const draw=context.drawElements.bind(context)
  context.drawElements=(...params)=>{
   if(lastDraw!==currentFrame){lastDraw=currentFrame;stats.drawFrames++;
    if(stats.record&&document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='entering')stats.entries.push(performance.now())
   }
   return draw(...params)
  }
  return context
 }
})()
