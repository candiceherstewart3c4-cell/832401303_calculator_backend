'use strict';

const fs = require('node:fs');
const path = require('node:path');

const allowed = /^\/(?:index\.html|assets\/[\w.-]+\.(?:svg|png)|scripts\/(?:config|calculator)\.js|styles\/(?:main|enhancements)\.css)$/;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function serveStatic(request, response, directory) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  if (!allowed.test(pathname)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  const filePath = path.join(directory, pathname.slice(1));
  const file = fs.createReadStream(filePath);
  file.once('error', () => {
    if (!response.headersSent) response.writeHead(404);
    response.end('Not found');
  });
  file.once('open', () => {
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)],
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    });
    file.pipe(response);
  });
}

module.exports = { serveStatic };
