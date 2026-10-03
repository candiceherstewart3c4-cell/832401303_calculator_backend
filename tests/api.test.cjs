const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../src/app');
const { createHistoryRepository } = require('../src/database');

test('HTTP calculation, errors, persistent storage and deletion', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-test-'));
  const file = path.join(directory, 'history.sqlite');
  let repository = createHistoryRepository(file);
  let server;
  async function start() {
    server = createServer(repository);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}/api`;
  }
  async function stop() {
    await new Promise(resolve => server.close(resolve));
    repository.close();
  }
  let base = await start();
  try {
    for (const [expression, expected] of [['12+8',20],['8-3*2',2],['(1+2)*3',9],['10/2+7',12],['-5+8',3],['3*-2',-6],['0.1+0.2',0.3],['sqrt(9)',3],['1.',1]]) {
      const response = await fetch(`${base}/calculate`, { method: 'POST', body: JSON.stringify({ expression }) });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).result, expected);
    }
    for (const expression of ['1/0','1+','process.exit()','sqrt(-1)','2(3)','(1+2','1..2','tan(90)','sin()']) {
      const response = await fetch(`${base}/calculate`, { method: 'POST', body: JSON.stringify({ expression }) });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).success, false);
    }
    let history = (await (await fetch(`${base}/history`)).json()).history;
    assert.equal(history.length, 9);
    const trigResponse = await fetch(`${base}/calculate`, { method: 'POST', body: JSON.stringify({ expression: 'sin(pi/6)', angleMode: 'rad' }) });
    assert.equal(trigResponse.status, 201);
    const trig = await trigResponse.json();
    assert.equal(trig.result, 0.5);
    assert.equal(trig.record.angleMode, 'rad');
    const scienceResponse = await fetch(`${base}/calculate`, { method: 'POST', body: JSON.stringify({ expression: 'asin(0.5)+log(100)+2^3', angleMode: 'deg' }) });
    assert.equal(scienceResponse.status, 201);
    assert.equal((await scienceResponse.json()).result, 40);
    const invalidMode = await fetch(`${base}/calculate`, { method: 'POST', body: JSON.stringify({ expression: 'sin(30)', angleMode: 'invalid' }) });
    assert.equal(invalidMode.status, 400);
    const id = history[0].id;
    await stop();
    repository = createHistoryRepository(file);
    base = await start();
    history = (await (await fetch(`${base}/history`)).json()).history;
    assert.equal(history.length, 11);
    assert.equal(history[1].angleMode, 'rad');
    assert.equal(history[1].expression, 'sin(pi/6)');
    assert.equal((await fetch(`${base}/history/${id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/history/${id}`, { method: 'DELETE' })).status, 404);
    assert.equal(repository.list().some(record => record.id === id), false);
    await fetch(`${base}/history`, { method: 'DELETE' });
    assert.equal(repository.list().length, 0);
  } finally {
    await stop();
    fs.rmSync(file);
    fs.rmdirSync(directory);
  }
});

test('existing history survives angle-mode migration', () => {
  const { DatabaseSync } = require('node:sqlite');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-migration-'));
  const file = path.join(directory, 'history.sqlite');
  const old = new DatabaseSync(file);
  old.exec("CREATE TABLE calculation_history (id INTEGER PRIMARY KEY AUTOINCREMENT, expression TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  old.prepare('INSERT INTO calculation_history (expression, result) VALUES (?, ?)').run('1+2', '3');
  old.close();
  const repository = createHistoryRepository(file);
  try {
    assert.equal(repository.list()[0].result, '3');
    assert.equal(repository.list()[0].angleMode, 'deg');
    repository.add('sin(pi/6)', 0.5, 'rad');
    assert.equal(repository.list().length, 2);
  } finally {
    repository.close();
    fs.rmSync(file);
    fs.rmdirSync(directory);
  }
});
