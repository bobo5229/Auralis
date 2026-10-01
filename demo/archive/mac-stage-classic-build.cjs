// Reuse classic-mac's current controller, with explicit composition adapters.
const fs=require('fs');
module.exports=function prepareClassic(){
 const classic=fs.readFileSync('demo/archive/classic-mac.html','utf8');
 const script=classic.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
 if(!script)throw Error('Cannot find classic-mac controller');
 let controller=script;
 function change(from,to){if(!controller.includes(from))throw Error(`Classic controller changed: ${from.slice(0,65)}`);controller=controller.replace(from,to);}
 change("let mode = 'machine'","let mode = 'machine'\n      let operationBusy = false");
 change('(innerWidth - 48) / 660, (innerHeight - 110) / 760','(studio.clientWidth - 24) / 660, (studio.clientHeight - 24) / 760');
 change('if (mode !== \'machine\' || drag || transitionBusy()',"if (mode !== 'machine' || operationBusy || drag || transitionBusy()");
 change("studio.classList.toggle('screen-mode', next === 'screen')","studio.classList.toggle('screen-mode', next === 'screen')\n        document.body.classList.toggle('mac-screen-mode', next === 'screen')\n        document.dispatchEvent(new CustomEvent('mac-mode-change', {detail:{mode:next}}))");
 change('selectedEntry = id','selectedEntry = id\n        document.dispatchEvent(new CustomEvent(\'mac-entry-selected\', {detail:{id}}))');
 change("event.target.closest('.crt-entry')","event.target.closest('.crt-entry, .terminal-ui')");
 change("if (event.button !== 0 || mode !== 'machine' || transitionBusy() || drag) return","if (event.button !== 0 || mode !== 'machine' || operationBusy || transitionBusy() || drag || event.target.closest('button, select, .terminal-ui, .floppy')) return");
 change("if (event.button === 0 && performance.now() >= suppressDoubleClickUntil)","if (!event.target.closest('button, select, .terminal-ui, .floppy') && event.button === 0 && performance.now() >= suppressDoubleClickUntil)");
 change("rig.style.setProperty('--tilt-y', `${yaw}deg`)\n        }","rig.style.setProperty('--tilt-y', `${yaw}deg`)\n          document.dispatchEvent(new CustomEvent('mac-view-geometry'))\n        }");
 change("rig.style.setProperty('--tilt-x', `${pitch}deg`)\n      })","rig.style.setProperty('--tilt-x', `${pitch}deg`)\n        document.dispatchEvent(new CustomEvent('mac-view-geometry'))\n      })");
 controller+=`\n      document.addEventListener('mac-operation-busy',event=>{operationBusy=!!event.detail?.busy;if(operationBusy){endDrag();stopRotation()}else startRotation()});
      document.addEventListener('mac-desktop-return',()=>{glass.classList.remove('mac-album-open');selectedEntry=null;for(const b of entryButtons)b.setAttribute('aria-pressed','false');syncCrt();});
      const resizeObserver=new ResizeObserver(()=>{if(mode==='machine'&&!drag&&!transitionBusy())layout()});resizeObserver.observe(studio);
      addEventListener('pagehide',()=>{resizeObserver.disconnect();stopRotation();clearTimeout(clockTimer);transitionGen++;viewAnimation?.cancel();clearDenoise();pauseSky(false)},{once:true});
      return {inspect:()=>({mode,yaw,pitch,powered:crtPowered,entriesReady,busy:transitionBusy(),operationBusy}),setMode};`;
 fs.writeFileSync('demo/archive/mac-stage-classic.js',`// Generated from classic-mac.html by mac-stage-classic-build.cjs.\nexport function mountClassicMac(){\n${controller}\n}\n`);
 let html=fs.readFileSync('demo/archive/mac-stage-device.html','utf8');
 const shellStart=classic.indexOf('<div class="studio" id="studio">'),shellEnd=classic.indexOf('<script src="./night-well-background.js">',shellStart);
 const start=html.indexOf('<div class="studio" id="studio">'),end=html.indexOf('<section class="stage-host"',start);
 if([shellStart,shellEnd,start,end].some(v=>v<0))throw Error('Cannot locate Mac shell');
 html=html.slice(0,start)+classic.slice(shellStart,shellEnd)+html.slice(end);
 html=html.replace('</head>',`<style>
 .rig{cursor:grab}.rig.is-dragging{cursor:grabbing}.mac{pointer-events:auto}.crt-glass{background:#f3eee0}#crt{display:block!important}.crt-fx,.crt-blank,.crt-entry-layer,.bezel-key{display:block}.terminal-ui{display:none;z-index:5}.mac-album-open .terminal-ui{display:flex}.mac-album-open .crt-entry-layer{visibility:hidden}.screen-mode .mac{pointer-events:none}.screen-mode .crt-glass,.screen-mode .bezel-key{pointer-events:auto}.bezel-key{opacity:0}.screen-mode .bezel-key{opacity:1}.screen-mode .floppy{pointer-events:none}.mac-screen-mode .studio{position:fixed;inset:0;width:100%;height:100svh;z-index:10;perspective:1800px}.mac-screen-mode .stage-host,.mac-screen-mode #cable,.mac-screen-mode main>header,.mac-screen-mode .footer{visibility:hidden}.mac-screen-mode{overflow:hidden}.terminal-title{display:flex;align-items:center;justify-content:space-between;padding:0 5px}.terminal-title button{font-size:8px;padding:0 3px;color:#252535;background:#e8e7df}.mac-instructions{position:relative;text-align:center;color:#c3b4cf;font-size:11px;margin-top:-24px;pointer-events:none}.mac-screen-mode .mac-instructions{display:none}
 @media(max-width:650px){.mac-instructions{display:none}}
 </style><link rel="stylesheet" href="./mac-album-window.css"></head>`);
 html=html.replace('<section class="stage-host"','<p class="mac-instructions" style="position:absolute;bottom:65px;left:0;width:47%">长按拖动旋转 · 双击进入屏幕</p><section class="stage-host"');
 fs.writeFileSync('demo/archive/mac-stage-device.html',html);
};
