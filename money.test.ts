import { splitEvenly, toMinor } from '../money';

describe('toMinor', () => {
  it('parses whole and decimal amounts', () => {
    expect(toMinor('150')).toBe(15000);
    expect(toMinor('12.5')).toBe(1250);
    expect(toMinor('12.05')).toBe(1205);
    expect(toMinor('1,234.50')).toBe(123450);
    expect(toMinor(7)).toBe(700);
  });

  it('rejects junk and more than two decimals', () => {
    expect(() => toMinor('abc')).toThrow();
    expect(() => toMinor('1.234')).toThrow();
  });
});

describe('splitEvenly', () => {
  it('always sums to the total', () => {
    for (const total of [0, 1, 100, 20000, 35000, 99999]) {
      for (const n of [1, 2, 3, 4, 7]) {
        const parts = splitEvenly(total, n);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives the remainder to the first parts', () => {
    expect(splitEvenly(20000, 3)).toEqual([6667, 6667, 6666]);
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
  });

  it('rejects bad input', () => {
    expect(() => splitEvenly(100, 0)).toThrow();
    expect(() => splitEvenly(10.5, 2)).toThrow();
  });
});
