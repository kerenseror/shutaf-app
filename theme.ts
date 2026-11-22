/**
 * Design tokens from the Stitch design (docs/design-stitch.md).
 * Use these instead of hard-coded colors.
 */
export const colors = {
  brand: '#0D9488', // teal-mint, primary
  brandSoft: '#CCFBF1',
  positive: '#10B981', // others owe you
  positiveSoft: '#D1FAE5',
  negative: '#EF4444', // you owe
  negativeSoft: '#FEE2E2',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  background: '#F8FAFC',
  backgroundMint: '#F0FDF4',
  card: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
} as const;

export const radius = { card: 20, sheet: 28, button: 14, chip: 999 } as const;

export const shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;
