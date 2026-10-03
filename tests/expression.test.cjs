const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateExpression } = require('../src/expression');

test('supports precedence, parentheses and decimals', () => {
  assert.equal(evaluateExpression('1 + 2 * 3'), 7);
  assert.equal(evaluateExpression('(1 + 2) * 3'), 9);
  assert.equal(evaluateExpression('0.1 + 0.2'), 0.3);
});

test('supports unary plus and minus', () => {
  assert.equal(evaluateExpression('-5 + 8'), 3);
  assert.equal(evaluateExpression('3 * -2'), -6);
  assert.equal(evaluateExpression('--2'), 2);
});

test('rejects invalid or unsafe input', () => {
  assert.throws(() => evaluateExpression('1 / 0'), /divide by zero/);
  assert.throws(() => evaluateExpression('1 +'), /expected/);
  assert.throws(() => evaluateExpression('process.exit()'), /Unsupported character/);
});

test('trigonometry supports degrees, radians, pi and nested expressions', () => {
  assert.equal(evaluateExpression('sin(30)'), 0.5);
  assert.equal(evaluateExpression('cos(60)'), 0.5);
  assert.equal(evaluateExpression('tan(45)'), 1);
  assert.equal(evaluateExpression('sin(-90)+cos(180)'), -2);
  assert.equal(evaluateExpression('sin(180)'), 0);
  assert.equal(evaluateExpression('sin(pi/6)', 'rad'), 0.5);
  assert.equal(evaluateExpression('cos(pi/2)', 'rad'), 0);
  assert.equal(evaluateExpression('2*sin(30)+sqrt(9)'), 4);
  assert.equal(evaluateExpression('cos(sin(0))'), 1);
  assert.ok(evaluateExpression('sin(0.000000000000001)', 'rad') > 0);
  assert.throws(() => evaluateExpression('tan(90)'), /undefined/);
  assert.throws(() => evaluateExpression('tan(-270)'), /undefined/);
  assert.throws(() => evaluateExpression('tan(pi/2)', 'rad'), /undefined/);
  for (const value of ['sin()', 'cos(1', 'sin30', 'sin(1,2)', 'Math.sin(1)', '2pi']) {
    assert.throws(() => evaluateExpression(value));
  }
  for (const mode of ['DEG', '', null, 1, {}]) {
    assert.throws(() => evaluateExpression('sin(30)', mode), /Angle mode/);
  }
});

test('scientific functions and powers preserve precedence and reject domain errors', () => {
  for (const [expression, expected] of [
    ['asin(0.5)', 30], ['acos(0.5)', 60], ['atan(1)', 45],
    ['log(1000)', 3], ['ln(e)', 1], ['exp(0)', 1], ['exp10(3)', 1000],
    ['2^3', 8], ['2^-3', 0.125], ['2^3^2', 512], ['-2^2', -4],
    ['(-2)^2', 4], ['2*3^2', 18], ['sin(30)^2+cos(30)^2', 1], ['9^0.5', 3]
  ]) assert.equal(evaluateExpression(expression), expected, expression);
  assert.ok(Math.abs(evaluateExpression('asin(0.5)', 'rad') - Math.PI / 6) < 1e-14);
  for (const expression of ['asin(2)', 'acos(-2)', 'ln(0)', 'log(-1)', 'exp(1000)', '0^-1', '0^0', '(-2)^0.5', '2^', '^2']) {
    assert.throws(() => evaluateExpression(expression), undefined, expression);
  }
});
