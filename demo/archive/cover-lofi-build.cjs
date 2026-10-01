const esbuild=require('esbuild');
const worker=esbuild.buildSync({entryPoints:['demo/archive/cover-lofi-worker.js'],bundle:true,format:'iife',write:false,minify:true}).outputFiles[0].text;
esbuild.buildSync({entryPoints:['demo/archive/cover-lofi.js'],bundle:true,format:'iife',outfile:'demo/archive/cover-lofi.bundle.js',define:{WORKER_SOURCE:JSON.stringify(worker)}});
