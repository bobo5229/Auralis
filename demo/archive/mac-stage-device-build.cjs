// Independent comparison: continuous device surfaces, limited-resolution projection.
const fs=require('fs'),esbuild=require('esbuild');
const read=name=>fs.readFileSync(`demo/archive/${name}`,'utf8');
const write=(name,text)=>fs.writeFileSync(`demo/archive/${name}`,text);
let html=read('mac-stage-link.html');
html=html.replace('mac-stage-link.bundle.js','mac-stage-device.bundle.js').replace('<title>Auralis · 音乐档案终端</title>','<title>Auralis · 实体舞台对照</title>').replace('data-fidelity="lofi"','data-fidelity="device"');
html=html.replace('MAC ↔ AURALIS</span>','<a href="./mac-stage-link.html">查看像素版</a></span>');
html=html.replace('</head>',`<link rel="stylesheet" href="./mac-stage-tray.css"><style>
.stage-source{opacity:1}.stage-output{display:none}.stage-host.is-picked .stage-source{opacity:.45}.stage-caption canvas{image-rendering:auto;filter:blur(.25px);opacity:.8}#ghost{filter:blur(.25px);border:1px solid #d7b1cc}header a{color:#d4bfdc;text-decoration:underline;text-underline-offset:4px}header a:focus-visible{outline:2px solid #ff9dd1;outline-offset:4px}
</style></head>`);
write('mac-stage-device.html',html);

let renderer=read('mac-stage-link-renderer.js');
function replace(from,to){if(!renderer.includes(from))throw Error(`Renderer source changed: ${from.slice(0,70)}`);renderer=renderer.replace(from,to)}
replace("body.addColorStop(0, '#121319')","body.addColorStop(0, '#111218')");
replace("body.addColorStop(0.17, '#383b42')","body.addColorStop(0.17, '#26282e')");
replace("body.addColorStop(0.4, '#1b1d23')","body.addColorStop(0.4, '#1e2026')");
replace("body.addColorStop(0.9, '#2f3038')","body.addColorStop(0.9, '#24262c')");
replace("top.addColorStop(0, '#5b5d65')","top.addColorStop(0, '#32343c')");
replace("top.addColorStop(0.22, '#34363d')","top.addColorStop(0.22, '#292b33')");
replace("top.addColorStop(1, '#393a43')","top.addColorStop(1, '#2b2d35')");
replace("stroke(circle(270), '#7c7b82', 1.1)","stroke(circle(270), '#45464f', 0.8)");
replace("stroke(circle(253, 0.7), '#56565e', 0.8)","stroke(circle(253, 0.7), '#34363e', 0.65)");
replace("for (let r = loFi ? 248 : 225; r <= 247; r += 3) stroke(circle(r, 1), 'rgba(161,157,168,.085)', 0.5)",'');
const ticksStart=renderer.indexOf('for (let i = 0; i < 60; i++) {'),ticksEnd=renderer.indexOf('fill(circle(17, 2)',ticksStart);
if(ticksStart<0||ticksEnd<0)throw Error('Cannot locate turntable ticks');
renderer=renderer.slice(0,ticksStart)+renderer.slice(ticksEnd);
replace('ctx.globalAlpha = loFi ? 0 : 0.1\n        const back = Math.cos(card.theta) < 0\n        textureFace(card.album.texture, card.theta, back, true)\n        ctx.globalAlpha = 1','');
replace('ctx.shadowBlur = 6','ctx.shadowBlur = 3\n      ctx.globalAlpha = 0.65');
replace("stroke(circle(259, 0.4), 'rgba(255, 255, 255, 0.7)', 0.5)","stroke(circle(259, 0.4), 'rgba(255, 224, 242, 0.16)', 0.5)");
replace('ctx.font = `700 8px ${fonts.data}`','ctx.font = `700 12px ${fonts.data}`');
renderer=renderer.replaceAll("'A U R A L I S'","'AURALIS'");
replace('ctx.shadowBlur = 5','ctx.shadowBlur = 2');
replace('ctx.globalAlpha = 0.85\n      ctx.fillText','ctx.globalAlpha = 0.65\n      ctx.fillText');
replace("sheen.addColorStop(0, 'rgba(255,242,218,.14)')","sheen.addColorStop(0, 'rgba(255,242,218,.025)')");
replace('const scale = Math.min(devicePixelRatio || 1, 2) * 2','const scale = 0.75');
replace('pixelRatio = loFi ? 320 / width : Math.min(devicePixelRatio || 1, 2)','pixelRatio = Math.min(devicePixelRatio || 1, 1.5)');
write('mac-stage-device-renderer.js',renderer);

// mac-stage-device.js is authored independently as its interactions evolve.
require('./mac-stage-classic-build.cjs')();
const worker=esbuild.buildSync({entryPoints:['demo/archive/cover-lofi-worker.js'],bundle:true,format:'iife',write:false,minify:true}).outputFiles[0].text;
esbuild.buildSync({entryPoints:['demo/archive/mac-stage-device.js'],bundle:true,format:'iife',outfile:'demo/archive/mac-stage-device.bundle.js',define:{WORKER_SOURCE:JSON.stringify(worker)}});
