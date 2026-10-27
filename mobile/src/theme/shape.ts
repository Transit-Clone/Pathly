/**
 * Pathly's corner scale. Every rounded surface uses one of these, so screens built at different
 * times still read as one app:
 * - control: inputs, rows and segments inside a card.
 * - card: cards, panels, tiles and dialogs.
 * - sheet: the top of a bottom sheet.
 * - pill: buttons, chips and search bars, always fully rounded.
 * Circles (dots, round icon buttons) keep half their size instead.
 */
export const radii = {
  control: 12,
  card: 20,
  sheet: 24,
  pill: 999,
} as const;
