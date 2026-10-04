// All visual source is original to this demo. No existing Mac source is read.
const fs = require('node:fs')
const path = require('node:path')
const root = __dirname
const template = fs.readFileSync(path.join(root, 'mac-diskbox-demo.template.html'), 'utf8')
const css = fs.readFileSync(path.join(root, 'mac-diskbox-demo.css'), 'utf8')
const js = fs.readFileSync(path.join(root, 'mac-diskbox-demo.js'), 'utf8')
fs.writeFileSync(path.join(root, 'mac-diskbox-demo.html'), template.replace('/* DEMO_CSS */', () => css).replace('/* DEMO_JS */', () => js))
console.log('Built standalone demo/archive/mac-diskbox-demo.html')
