'use strict';

const http = require('node:http');
const { URL } = require('node:url');
const { evaluateExpression, ExpressionError } = require('./expression');
const { serveStatic } = require('./static');
const { convert } = require('./conversion');

const JSON_LIMIT = 4096;

function send(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  response.end(payload === undefined ? '' : JSON.stringify(payload));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > JSON_LIMIT) throw new ExpressionError('Request body is too large.');
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new ExpressionError('Request body must be valid JSON.');
  }
}

function createRequestHandler(repository, staticDirectory) {
  return async (request, response) => {
    if (request.method === 'OPTIONS') return send(response, 204);
    const url = new URL(request.url, 'http://localhost');
    if (staticDirectory && request.method === 'GET' && !url.pathname.startsWith('/api/')) {
      return serveStatic(request, response, staticDirectory);
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        return send(response, 200, { success: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/calculate') {
        const body = await readJson(request);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new ExpressionError('Request body must be a JSON object.');
        }
        const expression = typeof body.expression === 'string' ? body.expression.trim() : '';
        const angleMode = body.angleMode === undefined ? 'deg' : body.angleMode;
        const result = evaluateExpression(expression, angleMode);
        const record = repository.add(expression, result, angleMode);
        return send(response, 201, { success: true, expression, result, angleMode, record });
      }
      if (request.method === 'GET' && url.pathname === '/api/history') {
        const integer = (key, fallback, maximum) => {
          const value = url.searchParams.get(key);
          if (value === null) return fallback;
          if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum) throw new ExpressionError(`Invalid ${key}.`);
          return Number(value);
        };
        const query = (url.searchParams.get('q') || '').trim();
        const favorites = url.searchParams.get('favorites') || 'false';
        if (query.length > 200 || !['true', 'false'].includes(favorites)) throw new ExpressionError('Invalid history filter.');
        const options = { page: integer('page', 1, 1000000000), pageSize: integer('pageSize', 100, 100), query, favorites: favorites === 'true' };
        return send(response, 200, { success: true, ...repository.page(options) });
      }
      if (request.method === 'POST' && url.pathname === '/api/convert') {
        const conversion = convert(await readJson(request));
        const record = repository.add(conversion.expression, conversion.resultLabel, 'deg', conversion.details.kind, conversion.details);
        return send(response, 201, { success: true, ...conversion, record });
      }
      const favoriteMatch = url.pathname.match(/^\/api\/history\/(\d+)\/favorite$/);
      if (request.method === 'PATCH' && favoriteMatch) {
        const body = await readJson(request);
        if (!body || typeof body.favorite !== 'boolean') throw new ExpressionError('favorite must be true or false.');
        const record = repository.favorite(Number(favoriteMatch[1]), body.favorite);
        if (!record) return send(response, 404, { success: false, message: 'History record not found.' });
        return send(response, 200, { success: true, record });
      }
      if (request.method === 'DELETE' && url.pathname === '/api/history') {
        const deleted = repository.clear();
        return send(response, 200, { success: true, deleted });
      }
      const match = url.pathname.match(/^\/api\/history\/(\d+)$/);
      if (request.method === 'DELETE' && match) {
        const deleted = repository.remove(Number(match[1]));
        if (!deleted) return send(response, 404, { success: false, message: 'History record not found.' });
        return send(response, 200, { success: true });
      }
      return send(response, 404, { success: false, message: 'API endpoint not found.' });
    } catch (error) {
      if (error instanceof ExpressionError) {
        return send(response, 400, { success: false, message: error.message });
      }
      console.error(error);
      return send(response, 500, { success: false, message: 'Internal server error.' });
    }
  };
}

function createServer(repository, staticDirectory) {
  return http.createServer(createRequestHandler(repository, staticDirectory));
}

module.exports = { createServer };
