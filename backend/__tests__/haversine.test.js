const { haversineMeters } = require('../utils/haversine');

// One degree of latitude on a 6 371 km sphere.
const ONE_DEGREE_LAT_METERS = 111194.93;

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    const p = { lat: 25.2048, lng: 55.2708 };
    expect(haversineMeters(p, p)).toBeCloseTo(0, 6);
  });

  it('measures a pure latitude delta', () => {
    const d = haversineMeters({ lat: 25, lng: 55 }, { lat: 26, lng: 55 });
    expect(d).toBeCloseTo(ONE_DEGREE_LAT_METERS, 0);
  });

  it('is symmetric', () => {
    const a = { lat: 25.2048, lng: 55.2708 };
    const b = { lat: 24.4539, lng: 54.3773 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it('accepts numeric strings', () => {
    const numeric = haversineMeters({ lat: 25, lng: 55 }, { lat: 26, lng: 55 });
    const stringy = haversineMeters({ lat: '25', lng: '55' }, { lat: '26', lng: '55' });
    expect(stringy).toBeCloseTo(numeric, 6);
  });

  // Infinity is the "fail closed" value: a geofence check compares the result
  // against a radius, so bad input must never read as "inside the fence".
  it.each([
    ['a missing point', null, { lat: 25, lng: 55 }],
    ['an undefined point', { lat: 25, lng: 55 }, undefined],
    ['a non-numeric coordinate', { lat: 'abc', lng: 55 }, { lat: 26, lng: 55 }],
    ['a missing coordinate', { lat: 25 }, { lat: 26, lng: 55 }],
  ])('returns Infinity for %s', (_label, a, b) => {
    expect(haversineMeters(a, b)).toBe(Infinity);
  });
});
