const { createServer } = require('node:http');

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT);

createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('ready');
}).listen(port, host);
