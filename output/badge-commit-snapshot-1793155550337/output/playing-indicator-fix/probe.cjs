const http = require('node:http')
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  console.log(decodeURIComponent(req.url))
  res.end('ok')
})
server.listen(5198, '127.0.0.1')
setTimeout(() => server.close(), 50000)
