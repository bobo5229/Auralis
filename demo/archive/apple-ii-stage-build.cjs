const fs=require('fs'),path=require('path'),esbuild=require('esbuild');
const dir=__dirname;
const preview=fs.readFileSync(path.join(dir,'apple-ii-preview.html'),'utf8');
fs.writeFileSync(path.join(dir,'apple-ii-stage-terminal.html'),preview.replace('<body>','<body data-stage-terminal>').replace('</style>','header,nav,footer{display:none}html,body{height:100%;background:transparent}#stage{height:100vh;min-height:0;background:none}</style>').replace('</body>','<script src="apple-ii-stage-terminal.js"></script></body>'));
const worker=esbuild.buildSync({entryPoints:[path.join(dir,'cover-lofi-worker.js')],bundle:true,format:'iife',write:false,minify:true}).outputFiles[0].text;
esbuild.buildSync({entryPoints:[path.join(dir,'apple-ii-stage.js')],bundle:true,format:'iife',outfile:path.join(dir,'apple-ii-stage.bundle.js'),define:{WORKER_SOURCE:JSON.stringify(worker)},minify:true});
