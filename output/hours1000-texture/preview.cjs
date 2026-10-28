const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const out=__dirname;
app.setPath('userData',path.join(out,'electron-profile'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let win,server;
(async()=>{
 await app.whenReady();
 const serving=await import(pathToFileURL(path.resolve('scripts/badges/serve.mjs')).href);
 const instance=await serving.startServer(0);server=instance.server;
 win=new BrowserWindow({show:false,width:1200,height:950,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,offscreen:true}});
 const js=s=>win.webContents.executeJavaScript(s);
 const settle=async()=>{for(let i=0;i<200;i++){if(await js('window.badgeWorkbench && !badgeWorkbench.snapshot().loading && !badgeWorkbench.snapshot().running'))return;await wait(30)}throw Error('render timeout')};
 await win.loadURL(instance.url+'?badge=hours-1000');await settle();
  const bounds=await js("(()=>{const r=document.querySelector('#stage').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()");
 await fs.writeFile(path.join(out,'detail.png'),(await win.webContents.capturePage(bounds)).toPNG());
 for(const state of ['lit','unlit']){
  await js(`badgeWorkbench.select('hours-1000','${state}')`);await settle();
  await fs.writeFile(path.join(out,`${state}-workbench.png`),(await win.webContents.capturePage()).toPNG());
 }
 await js("badgeWorkbench.select('hours-1000','lit')");await settle();
 await js("document.querySelector('#theme').click()");
 await wait(100);await fs.writeFile(path.join(out,'light-workbench.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.querySelector('#reflections').click()");await settle();
 await fs.writeFile(path.join(out,'no-reflections.png'),(await win.webContents.capturePage()).toPNG());
 const assets=path.resolve('src/renderer/features/archive/assets/milestones/materials/previews');
 const data=async p=>'data:image/png;base64,'+(await fs.readFile(p)).toString('base64');
 const before=await data(path.join(out,'before.png')),after=await data(path.join(assets,'hours-1000-lit.png'));
 const small=[96,70,44].map(w=>`<div><img src="${after}" width="${w}"><span>${w}px</span></div>`).join('');
 const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#15171d;color:#e5e4ed;font-family:'Microsoft YaHei',sans-serif}h1{margin:0;font-size:23px;font-weight:500}p{color:#9d9daa;font-size:13px;margin:8px 0 20px}.pair{display:flex;gap:20px}.card{width:380px;text-align:center;background:#20222b;border-radius:16px;padding:16px}.card img{width:285px;display:block;margin:auto}.card span{font-size:14px}.sizes{display:flex;gap:24px;margin-top:20px}.strip{display:flex;align-items:center;justify-content:space-evenly;width:380px;height:160px;background:#20222b;border-radius:12px}.strip.light{background:#eeecf2;color:#373342}.strip div{display:flex;flex-direction:column;align-items:center;gap:5px}.strip span{font-size:11px}</style><h1>久伴 · 1000 小时</h1><p>原紫色与图案保留 / 浅肌理 / 边缘压槽</p><div class="pair"><div class="card"><img src="${before}"><span>调整前</span></div><div class="card"><img src="${after}"><span>增加工艺细节 · 实际 GLSL 渲染</span></div></div><div class="sizes"><div class="strip">${small}</div><div class="strip light">${small}</div></div>`;
 await fs.writeFile(path.join(out,'comparison.html'),html);
 win.setContentSize(844,710);
 await win.loadFile(path.join(out,'comparison.html'));
 await js('Promise.all([...document.images].map(i=>i.decode()))');await wait(150);
 await fs.writeFile(path.join(out,'comparison.png'),(await win.webContents.capturePage()).toPNG());
 console.log('Saved comparison and lit/unlit, light, reflection-off workbench captures');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{win?.destroy();server?.close();app.quit()});
