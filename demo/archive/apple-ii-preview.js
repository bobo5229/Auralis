import { paintDesktop } from './apple-ii-desktop.js';
import { mountDrives } from './apple-ii-drive.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import modelData from './assets/apple-ii/apple_ii_computer.glb';

const stage=document.getElementById('stage'),status=document.getElementById('status'),loading=document.getElementById('loading');
const buttons=Object.fromEntries(['home','zoom','content','retry'].map(id=>[id,document.getElementById(id)]));
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Apple II 三维预览，拖动旋转，双击放大屏幕');stage.prepend(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.01,100);
scene.add(new THREE.HemisphereLight(0xfff7e3,0x333d31,2.2));
const key=new THREE.DirectionalLight(0xfff1d8,3);key.position.set(-3,5,5);scene.add(key);
const rim=new THREE.DirectionalLight(0xc4d5ec,1.4);rim.position.set(4,3,-2);scene.add(rim);
const controls={yaw:.55,pitch:.32,radius:4,target:new THREE.Vector3()};
const pointer=new THREE.Vector2(),ray=new THREE.Raycaster();
let model,screen,originalMaterial,dynamicMaterial,home,screenView,tween,drag,cableEnd,driveRig,focused=false,custom=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function render(){const r=controls.radius;camera.position.set(Math.sin(controls.yaw)*Math.cos(controls.pitch)*r,Math.sin(controls.pitch)*r,Math.cos(controls.yaw)*Math.cos(controls.pitch)*r).add(controls.target);camera.lookAt(controls.target);renderer.render(scene,camera);if(cableEnd){const p=cableEnd.clone().project(camera);if(driveRig)parent.postMessage({type:'apple-drive-anchors',slots:driveRig.project()},'*');parent.postMessage({type:'apple-terminal-anchor',x:(p.x+1)/2,y:(1-p.y)/2,visible:p.z>=-1&&p.z<=1},'*');}}
function connectCable(){if(!document.body.hasAttribute('data-stage-terminal'))return;const port=model.getObjectByName('connector_section_3');if(!port)throw new Error('模型未找到后方接口区域');const mesh=port.children.find(o=>o.isMesh);mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;
// Socket on the lower portion of the rear connector panel, in mesh-local space.
const start=new THREE.Vector3(b.min.x+(b.max.x-b.min.x)*.27,b.min.y+(b.max.y-b.min.y)*.20,b.min.z).applyMatrix4(mesh.matrixWorld);
const outward=new THREE.Vector3(0,0,-1).transformDirection(mesh.matrixWorld),bounds=new THREE.Box3().setFromObject(model);
const neck=start.clone().addScaledVector(outward,.10);cableEnd=neck.clone();cableEnd.x=bounds.max.x+.20;cableEnd.y=start.y-.12;
const bend=neck.clone().lerp(cableEnd,.5);bend.y-=.06;
const curve=new THREE.CatmullRomCurve3([start,neck,bend,cableEnd]);const wire=new THREE.Mesh(new THREE.TubeGeometry(curve,48,.009,8,false),new THREE.MeshStandardMaterial({color:0x443a50,roughness:.8}));scene.add(wire);
const plug=new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,.045,12),new THREE.MeshStandardMaterial({color:0x15131b,roughness:.85}));plug.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),outward);plug.position.copy(start).addScaledVector(outward,.0225);scene.add(plug);}
function resize(){camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();renderer.setSize(stage.clientWidth,stage.clientHeight,false);if(home){home.radius=home.baseRadius*Math.max(1,1.4/camera.aspect);screenView.radius=screenView.baseRadius*Math.max(1,.85/camera.aspect);if(!drag){tween=null;Object.assign(controls,focused?screenView:home);controls.target=(focused?screenView:home).target.clone();}}render();}
new ResizeObserver(resize).observe(stage);
function go(focus){if(!model)return;driveRig?.command({action:'disk-cancel'});focused=focus;drag=null;stage.classList.remove('dragging');const end=focus?screenView:home;tween={start:performance.now(),from:{...controls,target:controls.target.clone()},end};if(reduced.matches){Object.assign(controls,end);controls.target=end.target.clone();tween=null;}status.textContent=focus?'屏幕特写 · 可以切换原始材质与统计内容':'整机视角 · 屏幕和两个驱动器可分别定位';render();}
renderer.setAnimationLoop(()=>{if(document.hidden)return;if(driveRig?.tick(performance.now()))render();if(!tween)return;const t=Math.min(1,(performance.now()-tween.start)/650),k=1-Math.pow(1-t,3),{from,end}=tween;for(const a of ['yaw','pitch','radius'])controls[a]=THREE.MathUtils.lerp(from[a],end[a],k);controls.target.lerpVectors(from.target,end.target,k);if(t===1)tween=null;render();});
function hit(e){const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2);ray.setFromCamera(pointer,camera);return model&&ray.intersectObject(model,true)[0];}
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0||driveRig?.active||!hit(e))return;tween=null;drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:controls.yaw,pitch:controls.pitch};renderer.domElement.setPointerCapture(e.pointerId);stage.classList.add('dragging');});
renderer.domElement.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;controls.yaw=drag.yaw-(e.clientX-drag.x)*.008;controls.pitch=THREE.MathUtils.clamp(drag.pitch+(e.clientY-drag.y)*.006,-.15,1.2);render();});
function stop(){drag=null;stage.classList.remove('dragging');}
for(const name of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(name,stop);
window.addEventListener('blur',stop);renderer.domElement.addEventListener('dblclick',e=>{if(hit(e))go(true);});
window.addEventListener('keydown',e=>{if(e.key==='Escape')go(false);});
buttons.home.onclick=()=>go(false);buttons.zoom.onclick=()=>go(true);
function drawScreen(){const c=document.createElement('canvas');c.width=1024;c.height=768;paintDesktop(c.getContext('2d'));const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();return new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});}
buttons.content.onclick=()=>{custom=!custom;screen.material=custom?dynamicMaterial:originalMaterial;buttons.content.setAttribute('aria-pressed',String(custom));buttons.content.textContent=custom?'显示原始屏幕':'显示统计屏幕';render();};
buttons.retry.onclick=()=>location.reload();
async function load(){try{const bytes=Uint8Array.from(atob(modelData),c=>c.charCodeAt(0));const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');model=gltf.scene;scene.add(model);const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());const scale=2.6/Math.max(size.x,size.y,size.z);model.scale.multiplyScalar(scale);bounds.setFromObject(model);model.position.sub(bounds.getCenter(new THREE.Vector3()));model.updateMatrixWorld(true);connectCable();if(cableEnd)driveRig=mountDrives({scene,model,camera,reduced,render});screen=model.getObjectByName('screen_18')?.getObjectByName('Object_42');if(!screen?.isMesh)throw new Error('模型未找到独立屏幕节点');originalMaterial=screen.material;screen.geometry=screen.geometry.clone();screen.geometry.computeBoundingBox();const local=screen.geometry.boundingBox,p=screen.geometry.attributes.position,uv=new Float32Array(p.count*2);for(let i=0;i<p.count;i++){uv[i*2]=(p.getX(i)-local.min.x)/(local.max.x-local.min.x);uv[i*2+1]=(p.getY(i)-local.min.y)/(local.max.y-local.min.y);}const originalGeometry=screen.geometry;const statsGeometry=originalGeometry.clone();statsGeometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));dynamicMaterial=drawScreen();const oldClick=buttons.content.onclick;buttons.content.onclick=()=>{oldClick();screen.geometry=custom?statsGeometry:originalGeometry;render();};
const center=new THREE.Box3().setFromObject(screen).getCenter(new THREE.Vector3());const normal=new THREE.Vector3(0,0,1).transformDirection(screen.matrixWorld);const yaw=Math.atan2(normal.x,normal.z),pitch=Math.asin(normal.y);home={yaw:yaw+.55,pitch:.32,baseRadius:4.5,radius:4.5,target:new THREE.Vector3(0,0,0)};const screenSize=new THREE.Box3().setFromObject(screen).getSize(new THREE.Vector3());const radius=Math.max(screenSize.x,screenSize.y,screenSize.z)*1.65;screenView={yaw,pitch,baseRadius:radius,radius,target:center};resize();loading.hidden=true;for(const id of ['home','zoom','content'])buttons[id].disabled=false;status.textContent='模型与全部贴图已装入 · 长按拖动旋转，双击放大屏幕';window.applePreview={ready:true,drive:data=>driveRig?.command(data),inspect:()=>({focused,custom,yaw:controls.yaw,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,screen:screen.name,drives:['disk1_12','disk2_15'].map(n=>!!model.getObjectByName(n))})};render();}catch(error){loading.textContent='模型装入失败，请重新加载';status.textContent=error.message;buttons.retry.hidden=false;console.error(error);}}
resize();load();
