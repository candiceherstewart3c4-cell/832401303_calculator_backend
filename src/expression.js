'use strict';

const MAX_EXPRESSION_LENGTH = 200;

class ExpressionError extends Error {}

function tokenize(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new ExpressionError('Expression is required.');
  }
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(`Expression must not exceed ${MAX_EXPRESSION_LENGTH} characters.`);
  }

  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const word = source.slice(index).match(/^(sqrt|asin|acos|atan|sin|cos|tan|log|ln|exp10|exp|pi|e)\b/);
    if (word) {
      tokens.push({ type: word[1] });
      index += word[1].length;
      continue;
    }
    if ('+-*/^()'.includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }
    if (/[\d.]/.test(char)) {
      const start = index;
      let dotCount = 0;
      while (index < source.length && /[\d.]/.test(source[index])) {
        if (source[index] === '.') dotCount += 1;
        index += 1;
      }
      const raw = source.slice(start, index);
      if (dotCount > 1 || raw === '.' || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
        throw new ExpressionError(`Invalid number near "${raw}".`);
      }
      tokens.push({ type: 'number', value: Number(raw) });
      continue;
    }
    throw new ExpressionError(`Unsupported character "${char}".`);
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

function evaluateExpression(source, angleMode = 'deg') {
  if (angleMode !== 'deg' && angleMode !== 'rad') {
    throw new ExpressionError('Angle mode must be deg or rad.');
  }
  const tokens = tokenize(source);
  let position = 0;
  const current = () => tokens[position];
  const consume = type => {
    if (current().type !== type) throw new ExpressionError('Invalid expression.');
    return tokens[position++];
  };

  function primary() {
    if (current().type === 'pi') { consume('pi'); return Math.PI; }
    if (current().type === 'e') { consume('e'); return Math.E; }
    if (['sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'exp', 'exp10'].includes(current().type)) {
      const name = current().type;
      consume(name);
      consume('(');
      const value = additive();
      consume(')');
      if (!Number.isFinite(value)) throw new ExpressionError('Result is outside the supported range.');
      if (name === 'sqrt') {
        if (value < 0) throw new ExpressionError('Square root needs a non-negative number.');
        return Math.sqrt(value);
      }
      if (name === 'log' || name === 'ln') {
        if (value <= 0) throw new ExpressionError('Logarithm needs a positive number.');
        return name === 'log' ? Math.log10(value) : Math.log(value);
      }
      if (name === 'exp' || name === 'exp10') return name === 'exp' ? Math.exp(value) : 10 ** value;
      if (['asin', 'acos', 'atan'].includes(name)) {
        if (name !== 'atan' && Math.abs(value) > 1) throw new ExpressionError('Inverse sine and cosine need a value from -1 to 1.');
        const result = { asin: Math.asin, acos: Math.acos, atan: Math.atan }[name](value);
        return angleMode === 'deg' ? result * 180 / Math.PI : result;
      }
      // Exact quarter turns avoid floating-point residue at sin(180), cos(pi/2), etc.
      const turns = angleMode === 'deg' ? value / 90 : value / (Math.PI / 2);
      if (Number.isSafeInteger(turns)) {
        const quadrant = ((turns % 4) + 4) % 4;
        if (name === 'sin') return [0, 1, 0, -1][quadrant];
        if (name === 'cos') return [1, 0, -1, 0][quadrant];
        if (quadrant % 2) throw new ExpressionError('Tangent is undefined at this angle.');
        return 0;
      }
      const radians = angleMode === 'deg' ? (value % 360) * Math.PI / 180 : value;
      return { sin: Math.sin, cos: Math.cos, tan: Math.tan }[name](radians);
    }
    if (current().type === 'number') return consume('number').value;
    if (current().type === '(') {
      consume('(');
      const value = additive();
      if (current().type !== ')') throw new ExpressionError('Missing closing parenthesis.');
      consume(')');
      return value;
    }
    throw new ExpressionError('A number or opening parenthesis was expected.');
  }

  function unary() {
    if (current().type === '+') {
      consume('+');
      return unary();
    }
    if (current().type === '-') {
      consume('-');
      return -unary();
    }
    return power();
  }

  function power() {
    const value = primary();
    if (current().type !== '^') return value;
    consume('^');
    // Unary on the right allows negative exponents and right associativity.
    const exponent = unary();
    if (value === 0 && exponent <= 0) throw new ExpressionError('Zero needs a positive exponent.');
    const result = value ** exponent;
    if (!Number.isFinite(result)) throw new ExpressionError('Power has no finite real result.');
    return result;
  }

  function multiplicative() {
    let value = unary();
    while (current().type === '*' || current().type === '/') {
      const operator = current().type;
      consume(operator);
      const right = unary();
      if (operator === '/' && right === 0) throw new ExpressionError('Cannot divide by zero.');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }

  function additive() {
    let value = multiplicative();
    while (current().type === '+' || current().type === '-') {
      const operator = current().type;
      consume(operator);
      const right = multiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = additive();
  if (current().type !== 'eof') throw new ExpressionError('Unexpected token in expression.');
  if (!Number.isFinite(result)) throw new ExpressionError('Result is outside the supported range.');
  return Number(result.toPrecision(15));
}

module.exports = { evaluateExpression, ExpressionError };
