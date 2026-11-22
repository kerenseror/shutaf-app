import { computeShares } from '../split';

const partners = ['c', 'a', 'b'];

describe('computeShares', () => {
  it("'all' splits between every active partner, sorted by id", () => {
    expect(computeShares({ amountMinor: 20000, payerId: 'b', shareMode: 'all' }, partners)).toEqual({
      a: 6667,
      b: 6667,
      c: 6666,
    });
  });

  it("'selected' splits only between the chosen partners", () => {
    expect(
      computeShares({ amountMinor: 9000, payerId: 'a', shareMode: 'selected', participantIds: ['a', 'c'] }, partners),
    ).toEqual({ a: 4500, c: 4500 });
  });

  it("'opt_in' includes the buyer plus whoever joined", () => {
    expect(computeShares({ amountMinor: 3000, payerId: 'a', shareMode: 'opt_in' }, partners)).toEqual({ a: 3000 });
    expect(
      computeShares({ amountMinor: 3000, payerId: 'a', shareMode: 'opt_in', participantIds: ['b'] }, partners),
    ).toEqual({ a: 1500, b: 1500 });
  });

  it('joining and leaving recalculates the split', () => {
    const base = { amountMinor: 3000, payerId: 'a', shareMode: 'opt_in' as const };
    const joined = computeShares({ ...base, participantIds: ['b', 'c'] }, partners);
    expect(joined).toEqual({ a: 1000, b: 1000, c: 1000 });
    const left = computeShares({ ...base, participantIds: ['c'] }, partners);
    expect(left).toEqual({ a: 1500, c: 1500 });
  });

  it('a shared category forces everyone in', () => {
    expect(
      computeShares({ amountMinor: 3000, payerId: 'a', shareMode: 'opt_in', sharedCategory: true }, partners),
    ).toEqual({ a: 1000, b: 1000, c: 1000 });
  });

  it('rejects an expense with no participants', () => {
    expect(() => computeShares({ amountMinor: 100, payerId: 'a', shareMode: 'selected' }, partners)).toThrow();
  });
});
