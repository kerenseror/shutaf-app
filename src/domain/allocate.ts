import { assertMinor, Minor } from './money';

/** One open debt: debtor's share in an expense paid by the creditor. */
export interface Debt {
  /** expense_shares row id */
  id: string;
  debtorId: string;
  creditorId: string;
  /** What is still unpaid on this share */
  outstandingMinor: Minor;
  /** When the expense was recorded; older debts are paid first */
  createdAt: string;
}

export interface Allocation {
  debtId: string;
  amountMinor: Minor;
}

/**
 * Allocate a payment from `fromId` to `toId` (spec §4.3):
 * - with `debtId`: pay that debt first;
 * - whatever is left goes to the oldest open debts between the two, in order.
 * Any amount beyond all open debts stays unallocated (it still counts in the balance).
 * Must stay in sync with public.record_payment() in the SQL migration.
 */
export function allocatePayment(
  payment: { fromId: string; toId: string; amountMinor: Minor; debtId?: string },
  debts: Debt[],
): { allocations: Allocation[]; unallocatedMinor: Minor } {
  assertMinor(payment.amountMinor);
  if (payment.amountMinor <= 0) throw new Error('A payment must be positive');

  const open = debts
    .filter((d) => d.debtorId === payment.fromId && d.creditorId === payment.toId && d.outstandingMinor > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  if (payment.debtId) {
    const target = open.findIndex((d) => d.id === payment.debtId);
    if (target === -1) throw new Error('That debt is not open between these partners');
    open.unshift(...open.splice(target, 1));
  }

  let left = payment.amountMinor;
  const allocations: Allocation[] = [];
  for (const debt of open) {
    if (left === 0) break;
    const amount = Math.min(left, debt.outstandingMinor);
    allocations.push({ debtId: debt.id, amountMinor: amount });
    left -= amount;
  }
  return { allocations, unallocatedMinor: left };
}
