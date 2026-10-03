'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function createHistoryRepository(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS calculation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expression TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Additive migration preserves all records from the original calculator.
  if (!database.prepare('PRAGMA table_info(calculation_history)').all().some(column => column.name === 'angle_mode')) {
    database.exec("ALTER TABLE calculation_history ADD COLUMN angle_mode TEXT NOT NULL DEFAULT 'deg' CHECK (angle_mode IN ('deg', 'rad'))");
  }
  const columns = database.prepare('PRAGMA table_info(calculation_history)').all().map(column => column.name);
  if (!columns.includes('favorite')) database.exec('ALTER TABLE calculation_history ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1))');
  if (!columns.includes('kind')) database.exec("ALTER TABLE calculation_history ADD COLUMN kind TEXT NOT NULL DEFAULT 'calculate'");
  if (!columns.includes('details')) database.exec('ALTER TABLE calculation_history ADD COLUMN details TEXT');
  database.exec('CREATE INDEX IF NOT EXISTS idx_history_favorite ON calculation_history(favorite, id DESC)');
  database.exec('PRAGMA optimize');
  const fields = 'id, expression, result, angle_mode AS angleMode, created_at AS createdAt, favorite, kind, details';
  const decode = row => row && ({ ...row, favorite: Boolean(row.favorite), details: row.details ? JSON.parse(row.details) : null });

  const insertStatement = database.prepare(
    'INSERT INTO calculation_history (expression, result, angle_mode, kind, details) VALUES (?, ?, ?, ?, ?)'
  );
  const findStatement = database.prepare(
    `SELECT ${fields} FROM calculation_history WHERE id = ?`
  );
  const listStatement = database.prepare(
    `SELECT ${fields} FROM calculation_history ORDER BY id DESC LIMIT ?`
  );
  const deleteStatement = database.prepare('DELETE FROM calculation_history WHERE id = ?');
  const clearStatement = database.prepare('DELETE FROM calculation_history');

  return {
    add(expression, result, angleMode = 'deg', kind = 'calculate', details = null) {
      const info = insertStatement.run(expression, String(result), angleMode, kind, details ? JSON.stringify(details) : null);
      return decode(findStatement.get(Number(info.lastInsertRowid)));
    },
    list(limit = 100) {
      return listStatement.all(limit).map(decode);
    },
    page({ page = 1, pageSize = 100, query = '', favorites = false } = {}) {
      const where = `WHERE (instr(lower(expression), lower(?)) > 0 OR instr(lower(result), lower(?)) > 0)${favorites ? ' AND favorite = 1' : ''}`;
      const total = database.prepare(`SELECT count(*) AS count FROM calculation_history ${where}`).get(query, query).count;
      const allTotal = database.prepare('SELECT count(*) AS count FROM calculation_history').get().count;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      page = Math.min(page, pages);
      const history = database.prepare(`SELECT ${fields} FROM calculation_history ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(query, query, pageSize, (page - 1) * pageSize).map(decode);
      return { history, total, allTotal, page, pageSize, pages };
    },
    favorite(id, enabled) {
      const updated = database.prepare('UPDATE calculation_history SET favorite = ? WHERE id = ?').run(Number(enabled), id);
      return updated.changes ? decode(findStatement.get(id)) : null;
    },
    remove(id) {
      return deleteStatement.run(id).changes > 0;
    },
    clear() {
      return clearStatement.run().changes;
    },
    close() {
      database.close();
    }
  };
}

module.exports = { createHistoryRepository };
