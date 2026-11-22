import { allocatePayment, Debt } from '../allocate';

const debts: Debt[] = [
  { id: 'new', debtorId: 'a', creditorId: 'b', outstandingMinor: 3000, createdAt: '2026-11-10T10:00:00Z' },
  { id: 'old', debtorId: 'a', creditorId: 'b', outstandingMinor: 5000, createdAt: '2026-11-01T10:00:00Z' },
  { id: 'other', debtorId: 'a', creditorId: 'c', outstandingMinor: 9000, createdAt: '2026-10-01T10:00:00Z' },
  { id: 'paid', debtorId: 'a', creditorId: 'b', outstandingMinor: 0, createdAt: '2026-10-15T10:00:00Z' },
];

describe('allocatePayment', () => {
  it('a payment on the overall balance pays the oldest debt first', () => {
    expect(allocatePayment({ fromId: 'a', toId: 'b', amountMinor: 6000 }, debts)).toEqual({
      allocations: [
        { debtId: 'old', amountMinor: 5000 },
        { debtId: 'new', amountMinor: 1000 },
      ],
      unallocatedMinor: 0,
    });
  });

  it('a partial payment on a specific debt goes to that debt', () => {
    expect(allocatePayment({ fromId: 'a', toId: 'b', amountMinor: 1000, debtId: 'new' }, debts)).toEqual({
      allocations: [{ debtId: 'new', amountMinor: 1000 }],
      unallocatedMinor: 0,
    });
  });

  it('extra money after a specific debt continues to the oldest', () => {
    expect(allocatePayment({ fromId: 'a', toId: 'b', amountMinor: 4000, debtId: 'new' }, debts).allocations).toEqual([
      { debtId: 'new', amountMinor: 3000 },
      { debtId: 'old', amountMinor: 1000 },
    ]);
  });

  it('keeps any overpayment unallocated', () => {
    expect(allocatePayment({ fromId: 'a', toId: 'b', amountMinor: 10000 }, debts).unallocatedMinor).toBe(2000);
  });

  it('rejects zero, negative and unknown-debt payments', () => {
    expect(() => allocatePayment({ fromId: 'a', toId: 'b', amountMinor: 0 }, debts)).toThrow();
    expect(() => allocatePayment({ fromId: 'a', toId: 'b', amountMinor: -5 }, debts)).toThrow();
    expect(() => allocatePayment({ fromId: 'a', toId: 'b', amountMinor: 100, debtId: 'other' }, debts)).toThrow();
  });
});
