'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../src/app');

test('optional static host allows the formatter script and excludes private files', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-static-test-'));
  fs.mkdirSync(path.join(directory, 'scripts'));
  const file = path.join(directory, 'scripts', 'number-format.js');
  fs.writeFileSync(file, '/* formatter fixture */');
  const server = createServer({}, directory);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/scripts/number-format.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(await response.text(), '/* formatter fixture */');
    assert.equal((await fetch(`${base}/scripts/private.js`)).status, 404);
    assert.equal((await fetch(`${base}/data/calculator.sqlite`)).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.unlinkSync(file);
    fs.rmdirSync(path.join(directory, 'scripts'));
    fs.rmdirSync(directory);
  }
});
