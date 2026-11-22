import { Minor, splitEvenly } from './money';

/**
 * How an expense is shared (spec §4.2):
 * - 'all'      — every active partner (fixed bills, shared categories, "shared by everyone" purchases)
 * - 'selected' — a chosen subset, e.g. a food order for 2–3 partners
 * - 'opt_in'   — "open to join": only the buyer plus whoever joined
 */
export type ShareMode = 'all' | 'selected' | 'opt_in';

export interface ExpenseInput {
  amountMinor: Minor;
  payerId: string;
  shareMode: ShareMode;
  /** For 'selected': the chosen partners. For 'opt_in': partners who joined (the buyer is added automatically). */
  participantIds?: string[];
  /** True when the item's category is defined by the apartment as always shared. Forces 'all'. */
  sharedCategory?: boolean;
}

/** Resolve who takes part in an expense. Sorted by id for a deterministic split. */
export function resolveParticipants(expense: ExpenseInput, activePartnerIds: string[]): string[] {
  const mode: ShareMode = expense.sharedCategory ? 'all' : expense.shareMode;
  let ids: string[];
  switch (mode) {
    case 'all':
      ids = activePartnerIds;
      break;
    case 'selected':
      ids = expense.participantIds ?? [];
      break;
    case 'opt_in':
      ids = [expense.payerId, ...(expense.participantIds ?? [])];
      break;
  }
  const unique = Array.from(new Set(ids)).sort();
  if (unique.length === 0) throw new Error('An expense needs at least one participant');
  return unique;
}

/** Each participant's share in minor units. Shares always sum exactly to the amount. */
export function computeShares(expense: ExpenseInput, activePartnerIds: string[]): Record<string, Minor> {
  const participants = resolveParticipants(expense, activePartnerIds);
  const parts = splitEvenly(expense.amountMinor, participants.length);
  return Object.fromEntries(participants.map((id, i) => [id, parts[i]]));
}
