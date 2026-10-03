'use strict';

const { ExpressionError } = require('./expression');
const units = {
  length: { mm: 0.001, cm: 0.01, m: 1, km: 1000 },
  mass: { mg: 0.000001, g: 0.001, kg: 1 },
  temperature: { C: 1, F: 1, K: 1 }
};

function convert(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ExpressionError('Request body must be an object.');
  const { kind, from, to, category } = body;
  if (typeof body.value !== 'string' || !body.value.trim() || body.value.length > 130) {
    throw new ExpressionError('Enter a value of at most 130 characters.');
  }
  const value = body.value.trim();
  if (kind === 'base') {
    if (![2, 8, 10, 16].includes(from) || ![2, 8, 10, 16].includes(to)) throw new ExpressionError('Choose base 2, 8, 10 or 16.');
    const digits = value.replace(/^[+-]/, '').toUpperCase();
    if (!digits || digits.length > 128) throw new ExpressionError('Use 1–128 integer digits, without a prefix.');
    let number = 0n;
    for (const digit of digits) {
      const n = '0123456789ABCDEF'.indexOf(digit);
      if (n < 0 || n >= from) throw new ExpressionError(`Invalid digit for base ${from}. Integers only; omit prefixes such as 0x.`);
      number = number * BigInt(from) + BigInt(n);
    }
    if (value.startsWith('-')) number = -number;
    const result = number.toString(to).toUpperCase();
    return { result, expression: `${value} (base ${from}) → base ${to}`, resultLabel: result,
      details: { kind, value, from, to } };
  }
  if (kind !== 'unit' || !Object.hasOwn(units, category) || !Object.hasOwn(units[category], from) || !Object.hasOwn(units[category], to)) {
    throw new ExpressionError('Choose compatible units from the same category.');
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new ExpressionError('Enter a decimal number, not an expression.');
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ExpressionError('Value is outside the supported range.');
  let result;
  if (category === 'temperature') {
    const minimum = { C: -273.15, F: -459.67, K: 0 };
    if (n < minimum[from]) throw new ExpressionError('Temperature cannot be below absolute zero.');
    const celsius = from === 'C' ? n : from === 'F' ? (n - 32) * 5 / 9 : n - 273.15;
    result = to === 'C' ? celsius : to === 'F' ? celsius * 9 / 5 + 32 : celsius + 273.15;
    if (n === minimum[from]) result = minimum[to];
  } else {
    if (n < 0) throw new ExpressionError('Length and mass must be non-negative.');
    result = n * units[category][from] / units[category][to];
  }
  if (from === to) result = n;
  if (!Number.isFinite(result)) throw new ExpressionError('Result is outside the supported range.');
  const formatted = String(Number(result.toPrecision(15)));
  const label = unit => unit === 'C' || unit === 'F' ? `°${unit}` : unit;
  return { result: formatted, expression: `${value} ${label(from)} → ${label(to)}`, resultLabel: `${formatted} ${label(to)}`,
    details: { kind, value, from, to, category } };
}

module.exports = { convert };
