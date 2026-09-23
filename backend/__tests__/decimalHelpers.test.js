const {
  Decimal128,
  toDecimal128,
  toNumber,
  addDecimal128,
  subtractDecimal128,
  multiplyDecimal128,
  equalsDecimal128,
  formatAED,
} = require('../utils/accounts/decimalHelpers');

describe('toDecimal128', () => {
  it('treats empty-ish input as zero', () => {
    for (const v of [null, undefined, '']) {
      expect(toDecimal128(v).toString()).toBe('0');
    }
  });

  it('round-trips an existing Decimal128 unchanged', () => {
    const d = Decimal128.fromString('12.3400');
    expect(toDecimal128(d)).toBe(d);
  });

  it('rejects non-finite numbers', () => {
    expect(() => toDecimal128(Infinity)).toThrow(/non-finite/);
    expect(() => toDecimal128(NaN)).toThrow(/non-finite/);
  });

  it('rejects strings that are not plain decimals', () => {
    expect(() => toDecimal128('1,000.00')).toThrow(/Invalid decimal string/);
    expect(() => toDecimal128('1e5')).toThrow(/Invalid decimal string/);
  });

  it('accepts negative decimal strings', () => {
    expect(toDecimal128('-42.50').toString()).toBe('-42.50');
  });
});

describe('arithmetic helpers', () => {
  it('adds to 4 decimal places', () => {
    expect(addDecimal128('10.25', '4.75').toString()).toBe('15.0000');
  });

  it('subtracts to 4 decimal places', () => {
    expect(subtractDecimal128('100', '0.0001').toString()).toBe('99.9999');
  });

  it('multiplies to 4 decimal places', () => {
    expect(multiplyDecimal128('2.5', 4).toString()).toBe('10.0000');
  });

  it('reads a Decimal128 back as a number', () => {
    expect(toNumber(Decimal128.fromString('15.0000'))).toBe(15);
  });
});

describe('equalsDecimal128', () => {
  // The journal-entry balance check leans on this: float drift must not
  // reject an otherwise balanced voucher.
  it('absorbs binary float drift at the default precision', () => {
    expect(equalsDecimal128(0.1 + 0.2, 0.3)).toBe(true);
  });

  it('still catches a real difference', () => {
    expect(equalsDecimal128('100.0000', '100.0001')).toBe(false);
  });

  it('honours a reduced precision', () => {
    expect(equalsDecimal128('100.0000', '100.0001', 2)).toBe(true);
  });
});

describe('formatAED', () => {
  it('defaults to two decimals', () => {
    expect(formatAED(Decimal128.fromString('1234.5000'))).toBe('1234.50');
  });

  it('honours an explicit precision', () => {
    expect(formatAED('1234.5', 4)).toBe('1234.5000');
  });
});
