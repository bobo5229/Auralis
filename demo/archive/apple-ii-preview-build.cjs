const path = require('path');
const esbuild = require('esbuild');
esbuild.buildSync({entryPoints:[path.join(__dirname,'apple-ii-preview.js')],bundle:true,format:'iife',outfile:path.join(__dirname,'apple-ii-preview.bundle.js'),loader:{'.glb':'base64'},nodePaths:[path.resolve(__dirname,'../../.electron-home/retro-pc-build/node_modules')],minify:true});
