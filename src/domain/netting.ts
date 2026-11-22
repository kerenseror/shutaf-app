import { Minor } from './money';

/** One recorded expense with its final shares (as stored in expense_shares). */
export interface ExpenseRecord {
  id: string;
  payerId: string;
  shares: Record<string, Minor>;
}

/** A payment from one partner to another ("I paid you back"). */
export interface PaymentRecord {
  fromId: string;
  toId: string;
  amountMinor: Minor;
}

export interface Transfer {
  fromId: string;
  toId: string;
  amountMinor: Minor;
}

/**
 * Net debt between every pair of partners (spec §4.3, top of the home screen).
 * Each entry means `fromId` owes `toId` `amountMinor` (always > 0).
 */
export function pairwiseBalances(expenses: ExpenseRecord[], payments: PaymentRecord[]): Transfer[] {
  // owed[a][b] = how much a owes b, before netting the two directions.
  const owed = new Map<string, Map<string, Minor>>();
  const add = (from: string, to: string, amount: Minor) => {
    if (from === to || amount === 0) return;
    const row = owed.get(from) ?? new Map<string, Minor>();
    row.set(to, (row.get(to) ?? 0) + amount);
    owed.set(from, row);
  };

  for (const e of expenses) {
    for (const [userId, share] of Object.entries(e.shares)) add(userId, e.payerId, share);
  }
  // A payment from A to B is the same as B now owing A that amount.
  for (const p of payments) add(p.toId, p.fromId, p.amountMinor);

  const result: Transfer[] = [];
  const seen = new Set<string>();
  for (const [a, row] of owed) {
    for (const b of row.keys()) {
      const key = [a, b].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const net = (owed.get(a)?.get(b) ?? 0) - (owed.get(b)?.get(a) ?? 0);
      if (net > 0) result.push({ fromId: a, toId: b, amountMinor: net });
      if (net < 0) result.push({ fromId: b, toId: a, amountMinor: -net });
    }
  }
  return result.sort((x, y) => x.fromId.localeCompare(y.fromId) || x.toId.localeCompare(y.toId));
}

/** Net position per user: positive = others owe them, negative = they owe others. */
export function netPositions(pairs: Transfer[]): Record<string, Minor> {
  const net: Record<string, Minor> = {};
  for (const t of pairs) {
    net[t.fromId] = (net[t.fromId] ?? 0) - t.amountMinor;
    net[t.toId] = (net[t.toId] ?? 0) + t.amountMinor;
  }
  return net;
}

/**
 * The "bottom line" (spec §4.3, netting algorithm): a short list of transfers
 * that settles everyone. Greedy: the biggest debtor pays the biggest creditor.
 * Gives at most n-1 transfers, and the same input always gives the same output.
 */
export function minimizeTransfers(net: Record<string, Minor>): Transfer[] {
  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([id, v]) => ({ id, left: -v }));
  const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([id, v]) => ({ id, left: v }));
  const byAmount = (a: { id: string; left: number }, b: { id: string; left: number }) =>
    b.left - a.left || a.id.localeCompare(b.id);

  const transfers: Transfer[] = [];
  debtors.sort(byAmount);
  creditors.sort(byAmount);
  while (debtors.length && creditors.length) {
    const d = debtors[0];
    const c = creditors[0];
    const amount = Math.min(d.left, c.left);
    transfers.push({ fromId: d.id, toId: c.id, amountMinor: amount });
    d.left -= amount;
    c.left -= amount;
    if (d.left === 0) debtors.shift();
    if (c.left === 0) creditors.shift();
    debtors.sort(byAmount);
    creditors.sort(byAmount);
  }
  return transfers;
}

/** Quick personal status for the bottom of the home screen. */
export function personalStatus(userId: string, pairs: Transfer[]): { iOwe: Minor; owedToMe: Minor } {
  let iOwe = 0;
  let owedToMe = 0;
  for (const t of pairs) {
    if (t.fromId === userId) iOwe += t.amountMinor;
    if (t.toId === userId) owedToMe += t.amountMinor;
  }
  return { iOwe, owedToMe };
}
