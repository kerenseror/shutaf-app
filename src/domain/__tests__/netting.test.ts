import { computeShares } from '../split';
import { minimizeTransfers, netPositions, pairwiseBalances, personalStatus, ExpenseRecord } from '../netting';

const partners = ['a', 'b', 'c'];
const expense = (id: string, payerId: string, amountMinor: number): ExpenseRecord => ({
  id,
  payerId,
  shares: computeShares({ amountMinor, payerId, shareMode: 'all' }, partners),
});

// The example from the spec: A ordered pizza for ₪150, B bought groceries for ₪200,
// C paid the plumber ₪350. Everything is shared by all three.
const specExample = [expense('pizza', 'a', 15000), expense('groceries', 'b', 20000), expense('plumber', 'c', 35000)];

describe('pairwiseBalances', () => {
  it('nets the two directions between every pair (spec example)', () => {
    expect(pairwiseBalances(specExample, [])).toEqual([
      { fromId: 'a', toId: 'b', amountMinor: 1667 },
      { fromId: 'a', toId: 'c', amountMinor: 6667 },
      { fromId: 'b', toId: 'c', amountMinor: 5001 },
    ]);
  });

  it('payments reduce the debt, and overpaying flips it', () => {
    const pay = (amountMinor: number) => [{ fromId: 'a', toId: 'b', amountMinor }];
    expect(pairwiseBalances(specExample, pay(1667)).find((t) => t.fromId === 'a' && t.toId === 'b')).toBeUndefined();
    expect(pairwiseBalances(specExample, pay(2000))).toContainEqual({ fromId: 'b', toId: 'a', amountMinor: 333 });
  });
});

describe('minimizeTransfers', () => {
  it('settles the spec example in two transfers', () => {
    const net = netPositions(pairwiseBalances(specExample, []));
    expect(net).toEqual({ a: -8334, b: -3334, c: 11668 });
    expect(minimizeTransfers(net)).toEqual([
      { fromId: 'a', toId: 'c', amountMinor: 8334 },
      { fromId: 'b', toId: 'c', amountMinor: 3334 },
    ]);
  });

  it('net positions always sum to zero and transfers settle them', () => {
    const net = netPositions(pairwiseBalances(specExample, [{ fromId: 'b', toId: 'c', amountMinor: 1234 }]));
    expect(Object.values(net).reduce((x, y) => x + y, 0)).toBe(0);
    const after = { ...net };
    for (const t of minimizeTransfers(net)) {
      after[t.fromId] += t.amountMinor;
      after[t.toId] -= t.amountMinor;
    }
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });
});

describe('personalStatus', () => {
  it('sums what I owe and what is owed to me', () => {
    const pairs = pairwiseBalances(specExample, []);
    expect(personalStatus('a', pairs)).toEqual({ iOwe: 8334, owedToMe: 0 });
    expect(personalStatus('b', pairs)).toEqual({ iOwe: 5001, owedToMe: 1667 });
    expect(personalStatus('c', pairs)).toEqual({ iOwe: 0, owedToMe: 11668 });
  });
});
