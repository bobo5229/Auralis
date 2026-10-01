// Snapshot the existing Mac shell and stage renderer into an independent demo.
const fs=require('fs'),esbuild=require('esbuild');
const mac=fs.readFileSync('demo/archive/classic-mac.html','utf8');
const css=mac.match(/<style>([\s\S]*?)<\/style>/)[1];
const start=mac.indexOf('<div class="studio" id="studio">');
const end=mac.indexOf('<script src="./night-well-background.js">',start);
let shell=mac.slice(start,end).trim();
shell=shell.replace('aria-hidden="true">\n              <div class="floppy-lip"','role="button" tabindex="0" aria-label="将选中专辑装入软盘槽">\n              <div class="floppy-lip"');
const template=fs.readFileSync('demo/archive/mac-stage-link.template.html','utf8');
fs.writeFileSync('demo/archive/mac-stage-link.html',template.replace('/* MAC_ASSET_CSS */',css).replace('<!-- MAC_ASSET_HTML -->',shell));
let renderer=fs.readFileSync('demo/archive/stage-lofi-renderer.js','utf8');
renderer=renderer.replace('let setAlbums = () => {}','let setAlbums = () => {}; let inspect = () => null; let choose = () => {}');
renderer=renderer.replace('function updateInfo() {','function updateInfo() {\n      root.onSelection?.(selected)');
renderer=renderer.replace('const badge = project({ x: 0, y: -11, z: 270 })','root.onGeometry?.({selected, settled: !revealing && Math.abs(angle-target)<0.01, points: [...hits].reverse().find(h=>h.index===selected)?.points.map(p=>({x:offsetX+p.x*renderScale,y:offsetY+p.y*renderScale})) ?? []})\n      const badge = project({ x: 0, y: -11, z: 270 })');
renderer=renderer.replace('function select(index) {','choose = index => select(index)\n    inspect = () => { const face = [...hits].reverse().find(h => h.index === selected); return {selected, settled: !revealing && Math.abs(angle-target)<0.01, points: face?.points.map(p=>({x: offsetX+p.x*renderScale,y:offsetY+p.y*renderScale})) ?? []} }\n    function select(index) {');
renderer=renderer.replace('setAlbums: (items) => setAlbums(items),','setAlbums: (items) => setAlbums(items),\n    select: index => choose(index),\n    inspect: () => inspect(),');
// Cover dragging belongs to the new interaction; selectors still turn the stage.
renderer=renderer.replace('if (event.button !== 0 || drag || albums.length < 2) return','if (root.coverDragging || event.button !== 0 || drag || albums.length < 2) return');
fs.writeFileSync('demo/archive/mac-stage-link-renderer.js',renderer);
const worker=esbuild.buildSync({entryPoints:['demo/archive/cover-lofi-worker.js'],bundle:true,format:'iife',write:false,minify:true}).outputFiles[0].text;
esbuild.buildSync({entryPoints:['demo/archive/mac-stage-link.js'],bundle:true,format:'iife',outfile:'demo/archive/mac-stage-link.bundle.js',define:{WORKER_SOURCE:JSON.stringify(worker)}});
