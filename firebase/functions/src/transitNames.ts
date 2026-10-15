/**
 * Some feeds (MTA's city buses) publish stop names and headsigns in all caps ("1 AV/E 23 ST",
 * "HARLEM 126 ST"). Those are recased for display ("1 Av/E 23 St", "Harlem 126 St"); names that
 * already mix cases are the agency's own styling and are left alone.
 */

/** Kept in capitals: acronyms riders know that way. */
const ACRONYMS = new Set([
  'SBS', 'JFK', 'LGA', 'LIRR', 'MTA', 'NYC', 'NYCHA', 'CUNY', 'SUNY', 'PATH', 'YMCA', 'YWCA', 'US', 'USPS', 'VA', 'II', 'III', 'IV', 'NY', 'NJ', 'LIU', 'NYU', 'PS', 'IS', 'HS', 'JHS', 'MS', 'CSI', 'BMCC', 'FDR', 'LIE', 'BQE', 'UPS',
]);
/** Lowercase inside a name ("College of Staten Island"), but not as its first word. */
const MINOR_WORDS = new Set(['of', 'the', 'and', 'at', 'via', 'to', 'in', 'on', 'for']);

function recaseWord(word: string, first: boolean): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(word)) return word;
  if (!first && MINOR_WORDS.has(lower)) return lower;
  // Ordinals and numbered names: "23RD" -> "23rd", "1A" stays.
  if (/^\d/.test(word)) return /^\d+(ST|ND|RD|TH)$/.test(word) ? lower : word;
  // "MCDONALD" -> "McDonald", "O'BRIEN" -> "O'Brien".
  const mc = /^MC([A-Z]{2,})$/.exec(word);
  if (mc) return `Mc${mc[1]![0]}${mc[1]!.slice(1).toLowerCase()}`;
  const apostrophe = /^([A-Z])'([A-Z]{2,})$/.exec(word);
  if (apostrophe) return `${apostrophe[1]}'${apostrophe[2]![0]}${apostrophe[2]!.slice(1).toLowerCase()}`;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** A stop name or headsign as riders should read it: all-caps names recased, others unchanged. */
export function displayTransitName(name: string): string {
  if (!/[A-Z]/.test(name) || /[a-z]/.test(name)) return name;
  let first = true;
  // Words are runs of letters, digits and apostrophes; separators ("/", "-", " ", "(") are kept.
  return name.replace(/[A-Z0-9']+/g, (word) => {
    const recased = recaseWord(word, first);
    first = false;
    return recased;
  });
}
