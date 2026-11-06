/** Stable IDs are saved in a user's profile; artwork can evolve without migrating profiles. */
export const BEAN_COLORS = [
  { id: 'coral', label: 'Coral', hex: '#FF9080' },
  { id: 'peach', label: 'Peach', hex: '#FFB48C' },
  { id: 'gold', label: 'Gold', hex: '#F8CC5E' },
  { id: 'lime', label: 'Lime', hex: '#C8DA74' },
  { id: 'sage', label: 'Sage', hex: '#A5C788' },
  { id: 'teal', label: 'Teal', hex: '#6FCBB8' },
  { id: 'sky', label: 'Sky', hex: '#7FC6F3' },
  { id: 'periwinkle', label: 'Periwinkle', hex: '#9DACF1' },
  { id: 'lavender', label: 'Lavender', hex: '#BBA6ED' },
  { id: 'pink', label: 'Pink', hex: '#F6A0C2' },
  { id: 'clay', label: 'Clay', hex: '#DBA68F' },
  { id: 'oat', label: 'Oat', hex: '#E2D6B8' },
] as const;

/** Colors no longer offered: profiles saved with one keep its nearest match. */
const RETIRED_BEAN_COLORS: Readonly<Record<string, typeof BEAN_COLORS[number]['id']>> = {
  cherry: 'coral', tangerine: 'peach', sunflower: 'gold', emerald: 'sage', aqua: 'teal', cobalt: 'periwinkle', grape: 'lavender', magenta: 'pink',
};

const INK = '#242728';
const WHITE = '#FFFFFF';
const circle = (x: number, y: number, r: number, fill = INK) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const line = (d: string, width = 6) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shape = (d: string, fill = INK) => `<path d="${d}" fill="${fill}"/>`;
const stroke = (d: string, color: string, width = 4) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ring = (x: number, y: number, r: number, width = 4, fill = 'none') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${width}"/>`;
const heart = (x: number, y: number, size: number, fill: string) => shape(`M${x} ${y + size * 0.9}C${x - size * 1.6} ${y - size * 0.1} ${x - size} ${y - size * 1.3} ${x} ${y - size * 0.6}C${x + size} ${y - size * 1.3} ${x + size * 1.6} ${y - size * 0.1} ${x} ${y + size * 0.9}Z`, fill);
/** A five-point star centered on (x, y). */
const star = (x: number, y: number, r: number, fill = INK) => shape(`M${Array.from({ length: 10 }, (_, index) => {
  const angle = -Math.PI / 2 + (index * Math.PI) / 5;
  const radius = index % 2 ? r * 0.45 : r;
  return `${Math.round((x + radius * Math.cos(angle)) * 10) / 10} ${Math.round((y + radius * Math.sin(angle)) * 10) / 10}`;
}).join('L')}Z`, fill);
const PINK = '#E66E8A';
const TEAR = '#4DABF7';

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
  { id: 'googly', label: 'Googly', svg: circle(47, 58, 15, WHITE) + circle(82, 61, 11, WHITE) + circle(53, 67, 6) + circle(77, 55, 5) },
  { id: 'cyclops', label: 'One big idea', svg: circle(65, 58, 18, WHITE) + circle(67, 60, 8) + circle(70, 56, 2.5, WHITE) },
  { id: 'dizzy', label: 'Took the curve fast', svg: line('M42 53L56 67M56 53L42 67M73 53L87 67M87 53L73 67', 5) },
  { id: 'stars', label: 'Starstruck', svg: star(49, 60, 11) + star(81, 60, 11) },
  { id: 'smitten', label: 'Smitten', svg: heart(49, 60, 8, PINK) + heart(81, 60, 8, PINK) },
  { id: 'spiral', label: 'Hypnotized', svg: stroke('M47 60a2 2 0 1 1 4 0a5 5 0 1 1 -9 -2a9 9 0 1 1 14 9M78 60a2 2 0 1 1 4 0a5 5 0 1 1 -9 -2a9 9 0 1 1 14 9', INK, 3) },
  { id: 'specs', label: 'Read the timetable', svg: ring(49, 60, 13, 4, WHITE) + ring(81, 60, 13, 4, WHITE) + line('M62 59H68', 4) + circle(51, 62, 4) + circle(83, 62, 4) },
  { id: 'teary', label: 'It just left', svg: circle(49, 60, 13, WHITE) + circle(80, 60, 13, WHITE) + circle(49, 63, 5) + circle(80, 63, 5) + shape('M41 70Q38 77 41 80Q45 82 46 78Q46 75 41 70Z', TEAR) + shape('M89 70Q86 77 89 80Q93 82 94 78Q94 75 89 70Z', TEAR) },
  { id: 'grumpy', label: 'Delayed again', svg: circle(49, 63, 4.5) + circle(81, 63, 4.5) + line('M38 50L58 57M92 50L72 57', 6) },
  { id: 'bug', label: 'Way too awake', svg: circle(49, 60, 16, WHITE) + circle(81, 60, 16, WHITE) + circle(49, 60, 2.5) + circle(81, 60, 2.5) },
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
  { id: 'fangs', label: 'Night bus', svg: line('M51 80Q65 90 79 80', 5) + shape('M55 83L58 92L61 85Z', WHITE) + shape('M69 85L72 92L75 83Z', WHITE) },
  { id: 'buck', label: 'Two front teeth', svg: line('M51 79H79', 5) + '<rect x="57" y="80" width="7.5" height="11" rx="2" fill="' + WHITE + '"/><rect x="65.5" y="80" width="7.5" height="11" rx="2" fill="' + WHITE + '"/>' },
  { id: 'nervous', label: 'Nervous laugh', svg: line('M49 84L54 79L59 84L65 79L71 84L76 79L81 84', 4) },
  { id: 'smooch', label: 'Mwah', svg: line('M61 76Q72 80 63 84Q72 88 61 93', 4) + heart(84, 80, 4, PINK) },
  { id: 'blep', label: 'Blep', svg: line('M54 82H76', 5) + shape('M61 83H71V88Q71 94 66 94Q61 94 61 88Z', PINK) },
  { id: 'scream', label: 'Track change!', svg: '<ellipse cx="65" cy="88" rx="13" ry="12" fill="' + INK + '"/>' + shape('M56 80H74Q72 84 65 84Q58 84 56 80Z', WHITE) },
  { id: 'beard', label: 'Conductor beard', svg: shape('M40 78Q49 91 65 89Q81 91 90 78Q93 101 65 109Q37 101 40 78Z') + stroke('M58 87Q65 92 72 87', WHITE, 4) },
  { id: 'drool', label: 'Thinking about bagels', svg: line('M54 81Q64 89 76 81', 5) + shape('M72 84Q74 92 73 95Q71 98 69 95Q68 92 72 84Z', TEAR) },
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
  { id: 'mohawk', label: 'Punk commuter', svg: shape('M60 31L61 8L68 19L74 3L79 18L86 6L89 31Z') },
  { id: 'sprout', label: 'Photosynthesizing', svg: stroke('M76 28Q74 19 77 11', '#4C9A3F', 4) + '<ellipse cx="68" cy="11" rx="8" ry="4.5" fill="#6FBF5A" transform="rotate(25 68 11)"/><ellipse cx="86" cy="9" rx="8" ry="4.5" fill="#6FBF5A" transform="rotate(-25 86 9)"/>' },
  { id: 'bun', label: 'Top knot', svg: circle(76, 15, 11) + line('M66 26H86', 5) },
  { id: 'cloud', label: 'Big hair day', svg: circle(52, 33, 10) + circle(60, 22, 12) + circle(75, 15, 13) + circle(90, 20, 12) + circle(101, 31, 10) + circle(76, 28, 12) },
  { id: 'pigtails', label: 'Double trouble', svg: circle(41, 42, 9) + circle(107, 46, 9) + line('M47 44L54 38M101 48L96 41', 5) },
  { id: 'noodle', label: 'Grew one out', svg: line('M76 28Q77 8 96 9Q113 11 106 29Q103 35 98 31', 4) },
  { id: 'flame', label: 'Running hot', svg: shape('M60 31Q55 18 66 12Q65 20 71 21Q69 9 80 3Q79 15 87 17Q86 11 91 9Q98 21 91 31Z', '#FF7A3D') + shape('M68 31Q66 23 72 20Q73 26 78 26Q78 18 84 15Q90 24 85 31Z', '#FFD24A') },
] as const;

export type BeanAvatarConfig = {
  version: 1;
  color: typeof BEAN_COLORS[number]['id'];
  eyes: typeof BEAN_EYES[number]['id'];
  mouth: typeof BEAN_MOUTHS[number]['id'];
  hair: typeof BEAN_HAIR[number]['id'];
  /** A holiday outfit; left out is none. */
  outfit?: BeanOutfitId;
};

export const DEFAULT_BEAN_AVATAR: Readonly<BeanAvatarConfig> = {
  version: 1, color: 'sage', eyes: 'wide', mouth: 'flat', hair: 'none',
};

// ---------------------------------------------------------------------------------------------
// The kit's SVGs carry no IDs (many render on one page), so there's no <clipPath>: a scarf is cut
// to the body's outline here, from the body path sampled into a polygon.

type Point = readonly [number, number];

/** The body outline (BEAN_BODY_PATH's curves), sampled into a polygon. */
const BODY_CURVES: readonly (readonly [Point, Point, Point, Point])[] = [
  [[76, 27], [96, 27], [108, 43], [108, 64]],
  [[108, 64], [108, 94], [87, 115], [59, 115]],
  [[59, 115], [36, 115], [23, 102], [23, 85]],
  [[23, 85], [23, 70], [34, 65], [39, 53]],
  [[39, 53], [44, 39], [52, 27], [76, 27]],
];
const BODY_POLYGON: readonly Point[] = BODY_CURVES.flatMap(([p0, p1, p2, p3]) => Array.from({ length: 16 }, (_, step): Point => {
  const t = step / 16;
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}));

const round1 = (value: number) => Math.round(value * 10) / 10;

/** The polygon cut to one side of a line (Sutherland-Hodgman), keeping points where `inside` holds. */
function clipPolygon(points: readonly Point[], inside: (point: Point) => boolean, cross: (a: Point, b: Point) => Point): Point[] {
  const out: Point[] = [];
  points.forEach((current, index) => {
    const previous = points[(index + points.length - 1) % points.length]!;
    if (inside(current)) {
      if (!inside(previous)) out.push(cross(previous, current));
      out.push(current);
    } else if (inside(previous)) {
      out.push(cross(previous, current));
    }
  });
  return out;
}

const atX = (x: number) => (a: Point, b: Point): Point => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
const atY = (y: number) => (a: Point, b: Point): Point => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];

/** The part of the body inside a rectangle, as a filled path (empty when they don't meet). */
export function bodyRect(x0: number, y0: number, x1: number, y1: number, fill: string): string {
  let points: Point[] = [...BODY_POLYGON];
  points = clipPolygon(points, (point) => point[0] >= x0, atX(x0));
  points = clipPolygon(points, (point) => point[0] <= x1, atX(x1));
  points = clipPolygon(points, (point) => point[1] >= y0, atY(y0));
  points = clipPolygon(points, (point) => point[1] <= y1, atY(y1));
  if (points.length < 3) return '';
  return shape(`M${points.map(([x, y]) => `${round1(x)} ${round1(y)}`).join('L')}Z`, fill);
}

// ---------------------------------------------------------------------------------------------
// Outfits, holiday and otherwise. `behind` draws before the body; `hidesHair` sets a hat over the
// hair (the hair choice stays saved, just tucked under the hat).

const TURKEY_FEATHERS = ['#C0392B', '#E67E22', '#F1C40F', '#A0522D', '#E67E22', '#C0392B', '#F1C40F']
  .map((fill, index) => `<ellipse cx="66" cy="38" rx="9" ry="22" fill="${fill}" transform="rotate(${-72 + index * 24} 66 72)"/>`)
  .join('');
const scarf = (color: string, stripe: string) => bodyRect(0, 99, 128, 109, color) + bodyRect(0, 101, 128, 103, stripe) + bodyRect(0, 105, 128, 107, stripe)
  + `<rect x="33" y="103" width="10" height="19" rx="3" fill="${color}"/>`;

export type BeanOutfitId = 'none' | 'turkey' | 'harvest' | 'santa' | 'antlers' | 'beanie' | 'scarf' | 'party'
  | 'party-glasses' | 'propeller' | 'crown' | 'chef' | 'cone' | 'pirate' | 'clown' | 'bow' | 'headphones' | 'bowtie';

/** Holiday outfits (Thanksgiving, the winter holidays, New Year's), then everyday silly ones. */
export const BEAN_OUTFITS: readonly { id: BeanOutfitId; label: string; svg: string; behind?: string; hidesHair?: boolean }[] = [
  { id: 'none', label: 'No outfit', svg: '' },
  { id: 'turkey', label: 'Turkey feathers', behind: TURKEY_FEATHERS, svg: '' },
  { id: 'harvest', label: 'Harvest scarf', svg: scarf('#D35400', '#F5B041') },
  { id: 'santa', label: 'Santa hat', hidesHair: true, svg: shape('M50 32Q58 6 84 8Q103 10 111 24L101 31Z', '#D62E3A') + `<rect x="45" y="27" width="62" height="11" rx="5.5" fill="${WHITE}"/>` + circle(111, 24, 6, WHITE) },
  { id: 'antlers', label: 'Reindeer antlers', svg: '<path d="M62 31L54 12M57 21L46 17M55 15L50 6M90 31L98 12M95 21L106 17M97 15L102 6" fill="none" stroke="#8B5A2B" stroke-width="5" stroke-linecap="round"/>' },
  { id: 'beanie', label: 'Winter beanie', hidesHair: true, svg: shape('M48 34Q49 9 76 9Q103 9 104 34Z', '#3E7CC9') + '<rect x="45" y="28" width="62" height="10" rx="5" fill="#2C5E9E"/>' + circle(76, 8, 6, '#F2F2F2') },
  { id: 'scarf', label: 'Cozy scarf', svg: scarf('#C0392B', WHITE) },
  { id: 'party', label: 'New Year party hat', hidesHair: true, svg: shape('M62 31L78 4L94 31Z', '#F25C8A') + '<path d="M70 18H86M66 25H90" fill="none" stroke="#FFD24A" stroke-width="3" stroke-linecap="round"/>' + circle(78, 5, 4.5, '#FFD24A') },
  { id: 'party-glasses', label: 'New Year glasses', svg: shape('M30 50H62V72H30ZM68 50H100V72H68Z', '#F8C33A') + circle(46, 61, 8) + circle(84, 61, 8) + line('M62 56H68', 4) + star(30, 45, 6, '#F25C8A') + star(100, 45, 6, '#4DABF7') },
  { id: 'propeller', label: 'Propeller cap', hidesHair: true, svg: shape('M50 34Q51 14 76 14Q101 14 102 34Z', '#4DABF7') + shape('M50 31H102V37H50Z', '#2F7FC1') + line('M76 14V7', 3) + '<ellipse cx="66" cy="6" rx="10" ry="3" fill="#FFD24A"/><ellipse cx="86" cy="6" rx="10" ry="3" fill="#F25C8A"/>' + circle(76, 6, 2.5) },
  { id: 'crown', label: 'Self-declared royalty', hidesHair: true, svg: shape('M53 33L51 11L64 22L76 5L88 22L101 11L99 33Z', '#F8C33A') + circle(64, 27, 3, '#E63946') + circle(76, 26, 3, '#4DABF7') + circle(88, 27, 3, '#69DB7C') },
  { id: 'chef', label: "Chef's kiss", hidesHair: true, svg: `<path d="M56 32V22C45 22 45 7 57 9C59 1 73 0 76 6C80 0 94 1 95 9C107 7 107 22 96 22V32Z" fill="${WHITE}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` + line('M56 27H96', 3) },
  { id: 'cone', label: 'Under construction', hidesHair: true, svg: shape('M64 33L74 3H78L88 33Z', '#FF8A3D') + shape('M68 21H84L86 27H66Z', WHITE) + '<rect x="56" y="30" width="40" height="6" rx="3" fill="#E5672A"/>' },
  { id: 'pirate', label: 'Arr, the A train', svg: line('M33 49L101 45', 3) + shape('M37 50H61Q62 71 49 72Q36 71 37 50Z') },
  { id: 'clown', label: 'Honk', svg: circle(65, 73, 7, '#E63946') + circle(62.5, 70.5, 2, WHITE) },
  { id: 'bow', label: 'Fancy bow', svg: shape('M93 30L80 21L81 39ZM93 30L106 21L105 39Z', '#F25C8A') + circle(93, 30, 4.5, '#D6336C') },
  { id: 'headphones', label: 'Do not disturb', svg: stroke('M33 60Q31 18 72 18Q108 18 110 62', INK, 5) + '<rect x="24" y="52" width="13" height="22" rx="6" fill="#F25C8A"/><rect x="104" y="56" width="13" height="22" rx="6" fill="#F25C8A"/>' },
  { id: 'bowtie', label: 'Gala ready', svg: shape('M65 100L51 93V107ZM65 100L79 93V107Z', '#C0392B') + circle(65, 100, 3.5, '#8E2A20') },
];

/** Reject unknown versions; salvage valid individual fields from incomplete/corrupt data. */
export function normalizeBeanAvatar(value: unknown): BeanAvatarConfig {
  const fallback = { ...DEFAULT_BEAN_AVATAR };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const input = value as Record<string, unknown>;
  if (input.version !== 1) return fallback;
  return {
    version: 1,
    color: BEAN_COLORS.find((part) => part.id === input.color)?.id ?? RETIRED_BEAN_COLORS[String(input.color)] ?? fallback.color,
    eyes: BEAN_EYES.find((part) => part.id === input.eyes)?.id ?? fallback.eyes,
    mouth: BEAN_MOUTHS.find((part) => part.id === input.mouth)?.id ?? fallback.mouth,
    hair: BEAN_HAIR.find((part) => part.id === input.hair)?.id ?? fallback.hair,
    // An outfit is kept only when it names a real one (no outfit is left out).
    ...(BEAN_OUTFITS.some((part) => part.id !== 'none' && part.id === input.outfit) ? { outfit: input.outfit as BeanOutfitId } : {}),
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
  const outfit = BEAN_OUTFITS.find((part) => part.id === config.outfit);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">${outfit?.behind ?? ''}${shape(BEAN_BODY_PATH, color.hex)}${eyes.svg}${mouth.svg}${outfit?.hidesHair ? '' : hair.svg}${outfit?.svg ?? ''}</svg>`;
}

/** How the mascot feels on a screen. Only the face changes, so it's always still the rider's Pathling. */
export type BeanMood = 'own' | 'thinking' | 'happy' | 'curious' | 'sleepy' | 'worried' | 'sad';
const MOOD_FACES: Record<Exclude<BeanMood, 'own'>, Pick<BeanAvatarConfig, 'eyes' | 'mouth'>> = {
  thinking: { eyes: 'upward', mouth: 'none' },
  happy: { eyes: 'happy', mouth: 'grin' },
  curious: { eyes: 'side-eye', mouth: 'smirk' },
  sleepy: { eyes: 'sleepy', mouth: 'yawn' },
  worried: { eyes: 'uneven', mouth: 'wobble' },
  sad: { eyes: 'dots', mouth: 'frown' },
};

export function beanWithMood(avatar: BeanAvatarConfig, mood: BeanMood): BeanAvatarConfig {
  return mood === 'own' ? avatar : { ...avatar, ...MOOD_FACES[mood] };
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
