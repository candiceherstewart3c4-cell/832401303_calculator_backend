const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { convert } = require('../src/conversion');
const { createHistoryRepository } = require('../src/database');
const { createServer } = require('../src/app');

test('base conversion is exact for signs, all supported bases and large integers', () => {
  const run = (value, from, to) => convert({ kind: 'base', value, from, to }).result;
  assert.equal(run('255', 10, 16), 'FF');
  assert.equal(run('-ff', 16, 2), '-11111111');
  assert.equal(run('+17', 8, 10), '15');
  assert.equal(run('-0', 10, 2), '0');
  const large = '9007199254740993123456789';
  assert.equal(run(run(large, 10, 16), 16, 10), large);
  for (const value of ['102', '0b11', '1.1', '', '+', '1 0', '1'.repeat(129)]) {
    assert.throws(() => run(value, 2, 10));
  }
  assert.throws(() => run('10', 3, 10));
  assert.throws(() => run('10', '10', 16));
});

test('unit conversion covers metric scales, temperatures and invalid domains', () => {
  const run = (value, category, from, to) => convert({ kind: 'unit', value, category, from, to }).result;
  assert.equal(run('1', 'length', 'km', 'm'), '1000');
  assert.equal(run('250', 'mass', 'g', 'kg'), '0.25');
  assert.equal(run('0', 'temperature', 'C', 'F'), '32');
  assert.equal(run('32', 'temperature', 'F', 'C'), '0');
  assert.equal(run('273.15', 'temperature', 'K', 'C'), '0');
  assert.equal(run('-459.67', 'temperature', 'F', 'K'), '0');
  assert.equal(run('-40', 'temperature', 'C', 'F'), '-40');
  for (const args of [['-1', 'mass', 'g', 'kg'], ['-274', 'temperature', 'C', 'K'], ['1', 'length', 'm', 'kg'], ['1+2', 'length', 'm', 'km'], ['1', '__proto__', 'm', 'km']]) {
    assert.throws(() => run(...args));
  }
  for (const value of [null, [], {}, { kind: 'unit', value: 1 }]) assert.throws(() => convert(value));
});

test('full-database search, pagination, favorites and conversion recall persist through restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clover-extensions-'));
  const file = path.join(directory, 'history.sqlite');
  let repository = createHistoryRepository(file);
  let server;
  async function start() {
    server = createServer(repository);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}/api`;
  }
  async function stop() { await new Promise(resolve => server.close(resolve)); repository.close(); }
  const old = repository.add('old-search-target', 42);
  for (let i = 0; i < 105; i++) repository.add(`${i}+1`, i + 1);
  const inspection = new (require('node:sqlite').DatabaseSync)(file);
  assert.match(inspection.prepare('EXPLAIN QUERY PLAN SELECT id FROM calculation_history WHERE favorite = 1 ORDER BY id DESC').get().detail, /idx_history_favorite/);
  inspection.close();
  let base = await start();
  const request = async (url, method = 'GET', body) => {
    const response = await fetch(base + url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const first = (await request('/history?pageSize=10')).data;
    assert.equal(first.total, 106);
    assert.equal(first.pages, 11);
    assert.equal(first.history.length, 10);
    const second = (await request('/history?pageSize=10&page=2')).data;
    assert.ok(!first.history.some(a => second.history.some(b => a.id === b.id)));
    const found = (await request('/history?q=OLD-SEARCH-TARGET')).data;
    assert.equal(found.history[0].id, old.id);
    assert.equal((await request('/history?q=%25')).data.total, 0); // literal %, not a LIKE wildcard
    assert.equal((await request('/history?q=%27%20OR%201%3D1')).data.total, 0);
    assert.equal((await request(`/history/${old.id}/favorite`, 'PATCH', { favorite: true })).status, 200);
    const converted = await request('/convert', 'POST', { kind: 'unit', value: '1', category: 'length', from: 'km', to: 'm' });
    assert.equal(converted.status, 201);
    assert.equal(converted.data.result, '1000');
    const conversionId = converted.data.record.id;
    const baseConverted = await request('/convert', 'POST', { kind: 'base', value: 'FF', from: 16, to: 10 });
    assert.equal(baseConverted.data.result, '255');
    assert.equal(baseConverted.data.record.details.from, 16);
    assert.equal((await request('/convert', 'POST', { kind: 'base', value: '2', from: 2, to: 10 })).status, 400);
    for (const url of ['/history?page=0', '/history?pageSize=101', '/history?page=1.5', '/history?favorites=yes']) assert.equal((await request(url)).status, 400);
    assert.equal((await request(`/history/${old.id}/favorite`, 'PATCH', { favorite: 'true' })).status, 400);
    assert.equal((await request('/history/999999/favorite', 'PATCH', { favorite: true })).status, 404);
    assert.equal((await request('/history')).data.total, 108);
    await stop();
    repository = createHistoryRepository(file);
    base = await start();
    const favorites = (await request('/history?favorites=true')).data;
    assert.equal(favorites.total, 1);
    assert.equal(favorites.history[0].id, old.id);
    assert.equal(favorites.history[0].favorite, true);
    assert.equal((await request('/history?q=1%20km')).data.history[0].details.to, 'm');
    await request(`/history/${old.id}/favorite`, 'PATCH', { favorite: false });
    assert.equal((await request('/history?favorites=true')).data.total, 0);
    await request(`/history/${conversionId}`, 'DELETE');
    assert.equal((await request('/history?q=1%20km')).data.total, 0);
    const last = (await request('/history?page=11&pageSize=10')).data;
    for (const record of last.history) await request(`/history/${record.id}`, 'DELETE');
    assert.equal((await request('/history?page=11&pageSize=10')).data.page, 10);
    await request('/history', 'DELETE');
    const final = (await request('/history?page=11&pageSize=10')).data;
    assert.equal(final.total, 0);
    assert.equal(final.page, 1);
    assert.equal(final.pages, 1);
  } finally {
    await stop();
    fs.rmSync(file);
    fs.rmdirSync(directory);
  }
});
