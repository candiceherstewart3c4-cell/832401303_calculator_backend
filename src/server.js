'use strict';

const path = require('node:path');
const { createServer } = require('./app');
const { createHistoryRepository } = require('./database');

const port = Number(process.env.PORT) || 3000;
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'calculator.sqlite');
const repository = createHistoryRepository(databasePath);
// A standalone backend does not depend on the frontend checkout.
// Serving a frontend from this process is an explicit deployment option.
const staticDirectory = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : undefined;
const server = createServer(repository, staticDirectory);

const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => {
  console.log(`Clover Calc API listening at http://${host}:${port}`);
});

function shutdown() {
  server.close(() => {
    repository.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
