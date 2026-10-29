/** Stable IDs are saved in a user's profile; artwork can evolve without migrating profiles. */
export const BEAN_COLORS = [
  { id: 'sage', label: 'Sage', hex: '#A6BD83' },
  { id: 'coral', label: 'Coral', hex: '#FF8074' },
  { id: 'lavender', label: 'Lavender', hex: '#B5A0EA' },
  { id: 'gold', label: 'Gold', hex: '#F9C543' },
  { id: 'sky', label: 'Sky', hex: '#78BEF5' },
  { id: 'peach', label: 'Peach', hex: '#FFAE8B' },
  { id: 'teal', label: 'Teal', hex: '#64C4B7' },
  { id: 'pink', label: 'Pink', hex: '#F593BC' },
  { id: 'lime', label: 'Lime', hex: '#C4D975' },
  { id: 'periwinkle', label: 'Periwinkle', hex: '#96A7ED' },
  { id: 'clay', label: 'Clay', hex: '#DDA18B' },
  { id: 'oat', label: 'Oat', hex: '#DFD3B6' },
  // Bolder picks, still light enough for the dark face to read on.
  { id: 'cherry', label: 'Cherry', hex: '#F2384F' },
  { id: 'tangerine', label: 'Tangerine', hex: '#FF7A1A' },
  { id: 'sunflower', label: 'Sunflower', hex: '#FFC21A' },
  { id: 'emerald', label: 'Emerald', hex: '#1FBF6E' },
  { id: 'aqua', label: 'Aqua', hex: '#18C3D6' },
  { id: 'cobalt', label: 'Cobalt', hex: '#3D7BFF' },
  { id: 'grape', label: 'Grape', hex: '#9B5CFF' },
  { id: 'magenta', label: 'Magenta', hex: '#F03CA8' },
] as const;

const INK = '#242728';
const WHITE = '#FFFFFF';
const circle = (x: number, y: number, r: number, fill = INK) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const line = (d: string, width = 6) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shape = (d: string, fill = INK) => `<path d="${d}" fill="${fill}"/>`;

/** Every part uses the same 128 x 128 coordinates, including safe space for hair. */
export const BEAN_EYES = [
  { id: 'dots', label: 'Just here', svg: circle(51, 61, 4) + circle(79, 61, 4) },
  { id: 'wide', label: 'Seen things', svg: circle(49, 60, 14, WHITE) + circle(80, 60, 14, WHITE) + circle(51, 61, 5) + circle(78, 61, 5) },
  { id: 'sleepy', label: 'Five more minutes', svg: shape('M36 58H62A13 13 0 0 1 36 58M69 58H95A13 13 0 0 1 69 58', WHITE) + circle(49, 61, 4) + circle(82, 61, 4) + line('M36 57H62M69 57H95', 4) },
  { id: 'side-eye', label: 'Interesting...', svg: circle(49, 60, 13, WHITE) + circle(80, 60, 13, WHITE) + circle(43, 61, 5) + circle(74, 61, 5) },
  { id: 'uneven', label: 'Processing', svg: circle(49, 60, 15, WHITE) + circle(51, 61, 5) + circle(82, 61, 4) },
  { id: 'shades', label: 'Too cool', svg: '<rect x="29" y="46" width="33" height="26" rx="8" fill="' + INK + '"/><rect x="69" y="46" width="33" height="26" rx="8" fill="' + INK + '"/>' + line('M60 55H71', 6) },
  { id: 'squint', label: 'Not convinced', svg: line('M42 60H56M73 60H87', 7) },
  { id: 'wink', label: 'Got this', svg: circle(49, 60, 5) + line('M73 61Q80 53 87 61', 5) },
  { id: 'suspicious', label: 'Who sent you?', svg: circle(49, 64, 4) + circle(81, 64, 4) + line('M39 48L57 54M73 54L91 48', 6) },
  { id: 'happy', label: 'Good day', svg: line('M39 62Q49 47 59 62M71 62Q81 47 91 62', 5) },
  { id: 'tiny', label: 'No thoughts', svg: circle(53, 61, 2.5) + circle(77, 61, 2.5) },
  { id: 'upward', label: 'Daydreaming', svg: circle(49, 60, 13, WHITE) + circle(80, 60, 13, WHITE) + circle(49, 54, 5) + circle(80, 54, 5) },
] as const;

export const BEAN_MOUTHS = [
  { id: 'none', label: 'No comment', svg: '' },
  { id: 'flat', label: 'Unbothered', svg: line('M57 84H73', 5) },
  { id: 'smile', label: 'Little smile', svg: line('M54 79Q65 93 76 79', 5) },
  { id: 'smirk', label: 'Knows something', svg: line('M62 86Q74 86 77 78', 5) },
  { id: 'wobble', label: 'Doing my best', svg: line('M52 84Q58 76 64 84T77 84', 5) },
  { id: 'yawn', label: 'Big yawn', svg: '<ellipse cx="65" cy="87" rx="10" ry="15" fill="' + INK + '"/>' },
  { id: 'tooth', label: 'One tooth', svg: line('M52 79H78', 5) + '<rect x="60" y="80" width="11" height="13" rx="2" fill="' + WHITE + '"/>' },
  { id: 'grin', label: 'Suspiciously pleased', svg: shape('M49 78H81Q78 96 65 96Q52 96 49 78Z') + shape('M53 80H77L75 85H55Z', WHITE) },
  { id: 'oh', label: 'Oh.', svg: circle(65, 85, 6) },
  { id: 'frown', label: 'Missed the train', svg: line('M55 88Q65 76 75 88', 5) },
  { id: 'tongue', label: 'Being normal', svg: shape('M52 78H78Q77 91 65 91Q54 91 52 78Z') + shape('M64 84H73V91Q73 98 68 98Q64 98 64 91Z', '#E66E8A') },
  { id: 'mustache', label: 'Very official', svg: shape('M65 80C57 71 49 84 41 83C36 82 36 78 39 76C28 76 32 94 44 93C54 93 60 89 65 85C70 89 76 93 86 93C98 94 102 76 91 76C94 78 94 82 89 83C81 84 73 71 65 80Z') },
] as const;

export const BEAN_HAIR = [
  { id: 'none', label: 'Bald and bold', svg: '' },
  { id: 'three', label: 'Three whole hairs', svg: line('M65 29L62 15M75 27L77 12M85 29L92 16', 6) },
  { id: 'curl', label: 'One good curl', svg: line('M72 29C56 18 66 7 75 12C83 17 73 23 70 17', 5) },
  { id: 'tufts', label: 'Bedhead', svg: line('M67 29C55 19 60 10 66 15Q72 19 72 27C76 11 87 11 85 19Q83 25 78 29', 6) },
  { id: 'comb-over', label: 'Carefully arranged', svg: line('M60 30Q67 14 87 18M69 31Q78 21 91 25', 5) },
  { id: 'zigzag', label: 'Static situation', svg: line('M58 29Q60 15 65 22T75 21Q80 11 88 26', 5) },
  { id: 'swoop', label: 'Main character', svg: shape('M56 31Q60 9 91 16Q88 29 74 28Q82 23 82 21Q65 22 56 31Z') },
  { id: 'spikes', label: 'Fluffy', svg: shape('M54 32C47 23 54 15 62 21C61 8 76 7 78 20C87 10 98 19 91 32Z') },
  { id: 'antenna', label: 'Receiving signals', svg: line('M75 28L79 13', 4) + circle(80, 10, 4) },
] as const;

export type BeanAvatarConfig = {
  version: 1;
  color: typeof BEAN_COLORS[number]['id'];
  eyes: typeof BEAN_EYES[number]['id'];
  mouth: typeof BEAN_MOUTHS[number]['id'];
  hair: typeof BEAN_HAIR[number]['id'];
};

export const DEFAULT_BEAN_AVATAR: Readonly<BeanAvatarConfig> = {
  version: 1, color: 'sage', eyes: 'wide', mouth: 'flat', hair: 'none',
};

/** Reject unknown versions; salvage valid individual fields from incomplete/corrupt data. */
export function normalizeBeanAvatar(value: unknown): BeanAvatarConfig {
  const fallback = { ...DEFAULT_BEAN_AVATAR };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const input = value as Record<string, unknown>;
  if (input.version !== 1) return fallback;
  return {
    version: 1,
    color: BEAN_COLORS.find((part) => part.id === input.color)?.id ?? fallback.color,
    eyes: BEAN_EYES.find((part) => part.id === input.eyes)?.id ?? fallback.eyes,
    mouth: BEAN_MOUTHS.find((part) => part.id === input.mouth)?.id ?? fallback.mouth,
    hair: BEAN_HAIR.find((part) => part.id === input.hair)?.id ?? fallback.hair,
  };
}

export const BEAN_BODY_PATH = 'M76 27C96 27 108 43 108 64C108 94 87 115 59 115C36 115 23 102 23 85C23 70 34 65 39 53C44 39 52 27 76 27Z';

/** Transparent, self-contained SVG. No remote images, embedded fonts, IDs, or user markup. */
export function beanAvatarSvg(value: unknown = DEFAULT_BEAN_AVATAR): string {
  const config = normalizeBeanAvatar(value);
  const color = BEAN_COLORS.find((part) => part.id === config.color)!;
  const eyes = BEAN_EYES.find((part) => part.id === config.eyes)!;
  const mouth = BEAN_MOUTHS.find((part) => part.id === config.mouth)!;
  const hair = BEAN_HAIR.find((part) => part.id === config.hair)!;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${shape(BEAN_BODY_PATH, color.hex)}${eyes.svg}${mouth.svg}${hair.svg}</svg>`;
}

export function randomBeanAvatar(): BeanAvatarConfig {
  const choose = <T,>(options: readonly T[]): T => options[Math.floor(Math.random() * options.length)]!;
  return { version: 1, color: choose(BEAN_COLORS).id, eyes: choose(BEAN_EYES).id, mouth: choose(BEAN_MOUTHS).id, hair: choose(BEAN_HAIR).id };
}

export const BEAN_PRESETS: readonly { id: string; label: string; config: BeanAvatarConfig }[] = [
  { id: 'stare', label: 'The stare', config: { version: 1, color: 'sage', eyes: 'wide', mouth: 'flat', hair: 'none' } },
  { id: 'sleepy', label: 'Not a morning Pathling', config: { version: 1, color: 'coral', eyes: 'sleepy', mouth: 'tooth', hair: 'none' } },
  { id: 'frazzled', label: 'Holding it together', config: { version: 1, color: 'lavender', eyes: 'dots', mouth: 'wobble', hair: 'three' } },
  { id: 'cool', label: 'Too cool', config: { version: 1, color: 'gold', eyes: 'shades', mouth: 'flat', hair: 'none' } },
  { id: 'processing', label: 'Still processing', config: { version: 1, color: 'sky', eyes: 'uneven', mouth: 'flat', hair: 'curl' } },
  { id: 'yawn', label: 'Express nap', config: { version: 1, color: 'peach', eyes: 'tiny', mouth: 'yawn', hair: 'none' } },
  { id: 'official', label: 'Very official', config: { version: 1, color: 'teal', eyes: 'dots', mouth: 'mustache', hair: 'comb-over' } },
  { id: 'growth', label: 'Working on myself', config: { version: 1, color: 'pink', eyes: 'side-eye', mouth: 'smirk', hair: 'curl' } },
  { id: 'suspicious', label: 'Trust issues', config: { version: 1, color: 'lime', eyes: 'suspicious', mouth: 'oh', hair: 'none' } },
  { id: 'signal', label: 'Looking for service', config: { version: 1, color: 'periwinkle', eyes: 'upward', mouth: 'none', hair: 'antenna' } },
  { id: 'bedhead', label: 'Just woke up', config: { version: 1, color: 'clay', eyes: 'squint', mouth: 'tongue', hair: 'tufts' } },
  { id: 'optimist', label: 'Made the train', config: { version: 1, color: 'oat', eyes: 'happy', mouth: 'grin', hair: 'swoop' } },
];
