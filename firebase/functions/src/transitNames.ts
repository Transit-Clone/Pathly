/**
 * Some feeds (MTA's city buses) publish stop names and headsigns in all caps ("1 AV/E 23 ST",
 * "HARLEM 126 ST"), and a few hand-entered ones in all lowercase ("staten island expwy/wooley av")
 * or a mix of both ("McCLEAN AV", "ARTHUR KILL RD/West Service Rd"). Those words are recased for
 * display; capitalized words ("Gowanus", "Penn Station") are the agency's own styling and kept.
 */

/** Kept in capitals: acronyms riders know that way. */
const ACRONYMS = new Set([
  'SBS', 'JFK', 'LGA', 'LIRR', 'MTA', 'NYC', 'NYCHA', 'CUNY', 'SUNY', 'PATH', 'YMCA', 'YWCA', 'US', 'USPS', 'VA', 'II', 'III', 'IV', 'NY', 'NJ', 'LIU', 'NYU', 'PS', 'IS', 'HS', 'JHS', 'MS', 'CSI', 'BMCC', 'FDR', 'LIE', 'BQE', 'UPS',
  'SIE', 'BBT', 'NB', 'SB', 'EB', 'WB',
]);
/** Lowercase inside a name ("College of Staten Island"), but not as its first word. */
const MINOR_WORDS = new Set(['of', 'the', 'and', 'at', 'via', 'to', 'in', 'on', 'for']);

function recaseWord(word: string, first: boolean): string {
  const upper = word.toUpperCase();
  const lower = word.toLowerCase();
  // A lowercase "is"/"us"/"ms" is more likely English than an acronym; longer ones ("fdr") aren't.
  if (ACRONYMS.has(word) || (word === lower && upper.length >= 3 && ACRONYMS.has(upper))) return upper;
  if (!first && MINOR_WORDS.has(lower)) return lower;
  // Ordinals and numbered names: "23RD" -> "23rd", "1A" stays.
  if (/^\d/.test(word)) return /^\d+(ST|ND|RD|TH)$/.test(upper) ? lower : upper;
  // "MCDONALD"/"McCLEAN" -> "McDonald"/"McClean", "O'BRIEN" -> "O'Brien".
  const mc = /^MC([A-Z]{2,})$/.exec(upper);
  if (mc) return `Mc${mc[1]![0]}${mc[1]!.slice(1).toLowerCase()}`;
  const apostrophe = /^([A-Z])'([A-Z]{2,})$/.exec(upper);
  if (apostrophe) return `${apostrophe[1]}'${apostrophe[2]![0]}${apostrophe[2]!.slice(1).toLowerCase()}`;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** "McCLEAN" is a capitals word with the feed's own "Mc"; its lowercase "c" isn't styling. */
const isCapitalsWord = (word: string) => /[A-Z]/.test(word) && (word === word.toUpperCase() || /^Mc[A-Z]{2,}$/.test(word));

/**
 * A stop name or headsign as riders should read it. Lowercase words are always recased (no
 * agency styles a street "wooley av"); capitals words are recased when capitals make up most of the
 * name, so "ARTHUR KILL RD/West Service Rd" reads evenly while the "UBS" in "Elmont-UBS Arena"
 * stays an acronym. MTA bus headsigns are capitals around a lowercase "via" ("SOUTH FERRY via 2 AV").
 */
export function displayTransitName(name: string): string {
  if (typeof name !== 'string' || !/[A-Za-z]/.test(name)) return name;
  const letters = name.replace(/\bMc(?=[A-Z]{2})/g, 'MC').replace(/[^A-Za-z]/g, '');
  const mostlyCapitals = letters.replace(/[^A-Z]/g, '').length > letters.length / 2;
  let first = true;
  // Words are runs of letters, digits and apostrophes; separators ("/", "-", " ", "(", ".") are kept.
  return name.replace(/[A-Za-z0-9']+/g, (word) => {
    const isFirst = first;
    first = false;
    const isLower = word === word.toLowerCase() && /[a-z]/.test(word);
    if (isLower ? !isFirst && MINOR_WORDS.has(word) : !(mostlyCapitals && isCapitalsWord(word))) return word;
    return recaseWord(word, isFirst);
  });
}
