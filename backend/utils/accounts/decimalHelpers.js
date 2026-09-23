const mongoose = require('mongoose');

const Decimal128 = mongoose.Types.Decimal128;

function toDecimal128(value) {
  if (value === null || value === undefined || value === '') return Decimal128.fromString('0');
  if (value instanceof Decimal128) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cannot convert non-finite number to Decimal128: ${value}`);
    return Decimal128.fromString(value.toString());
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid decimal string: "${value}"`);
    return Decimal128.fromString(trimmed);
  }
  if (typeof value === 'object' && typeof value.toString === 'function') {
    return Decimal128.fromString(value.toString());
  }
  throw new Error(`Unsupported type for Decimal128 conversion: ${typeof value}`);
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (value instanceof Decimal128) return parseFloat(value.toString());
  if (typeof value === 'number') return value;
  return parseFloat(String(value));
}

function addDecimal128(...values) {
  const total = values.reduce((sum, v) => sum + toNumber(v), 0);
  return Decimal128.fromString(total.toFixed(4));
}

function subtractDecimal128(a, b) {
  return Decimal128.fromString((toNumber(a) - toNumber(b)).toFixed(4));
}

function multiplyDecimal128(a, b) {
  return Decimal128.fromString((toNumber(a) * toNumber(b)).toFixed(4));
}

function equalsDecimal128(a, b, precision = 4) {
  const factor = Math.pow(10, precision);
  return Math.round(toNumber(a) * factor) === Math.round(toNumber(b) * factor);
}

function formatAED(value, decimals = 2) {
  return toNumber(value).toFixed(decimals);
}

module.exports = {
  Decimal128,
  toDecimal128,
  toNumber,
  addDecimal128,
  subtractDecimal128,
  multiplyDecimal128,
  equalsDecimal128,
  formatAED
};
