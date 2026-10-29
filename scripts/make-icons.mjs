// Rasterizes the Pathly "P" (same geometry as mobile/src/components/Mascot.tsx) into app icons.
// Usage: node scripts/make-icons.mjs mobile/assets   (no dependencies; rerun after changing the shape)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const outDir = process.argv[2];
const BLUE = [0x0b, 0x4f, 0x9c];
const WHITE = [255, 255, 255];

// --- geometry, in the 1024 icon grid ---
const cubic = (p0, p1, p2, p3, n = 24) => Array.from({ length: n }, (_, i) => {
  const t = (i + 1) / n, u = 1 - t;
  return [u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]];
});
const quad = (p0, p1, p2, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
});
// M258 235 C262 190 300 172 350 170 L590 168 C720 168 830 250 830 400 C830 520 740 595 610 605
// C520 612 432 626 396 680 C370 720 366 780 353 830 C346 858 322 868 290 868 L236 868
// C206 868 190 850 195 820 L215 655 Z
const body = [[258, 235],
  ...cubic([258, 235], [262, 190], [300, 172], [350, 170]), [590, 168],
  ...cubic([590, 168], [720, 168], [830, 250], [830, 400]),
  ...cubic([830, 400], [830, 520], [740, 595], [610, 605]),
  ...cubic([610, 605], [520, 612], [432, 626], [396, 680]),
  ...cubic([396, 680], [370, 720], [366, 780], [353, 830]),
  ...cubic([353, 830], [346, 858], [322, 868], [290, 868]), [236, 868],
  ...cubic([236, 868], [206, 868], [190, 850], [195, 820]), [215, 655]];
const groove = [[222, 650], ...cubic([222, 650], [330, 562], [470, 532], [596, 524])];
const smile = quad([503, 425], [545, 474], [588, 413]);
const eyes = [[418, 393], [665, 368]];

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function nearPolyline(x, y, line, radius) {
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= radius) return true;
  }
  return false;
}
const bbox = (pts, pad) => [Math.min(...pts.map((p) => p[0])) - pad, Math.min(...pts.map((p) => p[1])) - pad, Math.max(...pts.map((p) => p[0])) + pad, Math.max(...pts.map((p) => p[1])) + pad];
const inBox = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const grooveBox = bbox(groove, 17), smileBox = bbox(smile, 13);
// Body crossings per grid row, so the fill test is a sorted-interval lookup, not a polygon walk.
function crossings(y) {
  const xs = [];
  for (let i = 0, j = body.length - 1; i < body.length; j = i++) {
    const [xi, yi] = body[i], [xj, yj] = body[j];
    if ((yi > y) !== (yj > y)) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
  }
  return xs.sort((a, b) => a - b);
}
function insideRow(x, xs) {
  let inside = false;
  for (const cx of xs) { if (cx > x) break; inside = !inside; }
  return inside;
}
// What the glyph is at a grid point: 'body' (white), 'cut' (face/groove, background), or null.
function glyph(x, y, xs) {
  if (!insideRow(x, xs)) return null;
  if (inBox(x, y, grooveBox) && nearPolyline(x, y, groove, 17)) return 'cut';
  if (inBox(x, y, smileBox) && nearPolyline(x, y, smile, 13)) return 'cut';
  if (eyes.some(([cx, cy]) => ((x - cx) / 32) ** 2 + ((y - cy) / 44) ** 2 <= 1)) return 'cut';
  return 'body';
}

// --- PNG ---
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * `scale`: glyph size relative to the 1024 grid, centered. `background`: RGB or null (transparent).
 * `cutColor`: what the face/groove show — the background, or a color when it's transparent.
 */
function render(size, { scale, background, cutColor }) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling per axis
  const center = [512, 518];
  for (let py = 0; py < size; py++) {
    const rows = Array.from({ length: SS }, (_, sy) => crossings(((py + (sy + 0.5) / SS) / size * 1024 - 512) / scale + center[1]));
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const gx = ((px + (sx + 0.5) / SS) / size * 1024 - 512) / scale + center[0];
        const gy = ((py + (sy + 0.5) / SS) / size * 1024 - 512) / scale + center[1];
        const kind = glyph(gx, gy, rows[sy]);
        const color = kind === 'body' ? WHITE : kind === 'cut' ? cutColor : background;
        if (color) { r += color[0]; g += color[1]; b += color[2]; a += 255; }
      }
      const n = SS * SS, i = (py * size + px) * 4, alpha = a / n;
      rgba[i] = alpha ? Math.round(r / (a / 255)) : 0; rgba[i + 1] = alpha ? Math.round(g / (a / 255)) : 0; rgba[i + 2] = alpha ? Math.round(b / (a / 255)) : 0; rgba[i + 3] = Math.round(alpha);
    }
  }
  return png(size, rgba);
}

// iOS/store icon: full-bleed blue square (iOS rounds the corners itself), no transparency.
writeFileSync(join(outDir, 'icon.png'), render(1024, { scale: 0.8, background: BLUE, cutColor: BLUE }));
// Android adaptive foreground: glyph inside the 66% safe zone; the blue comes from backgroundColor.
writeFileSync(join(outDir, 'adaptive-icon.png'), render(1024, { scale: 0.58, background: null, cutColor: BLUE }));
// Splash: the white mascot alone, shown on a brand-blue splash background.
writeFileSync(join(outDir, 'splash-icon.png'), render(1024, { scale: 0.92, background: null, cutColor: BLUE }));
// Web favicon.
writeFileSync(join(outDir, 'favicon.png'), render(48, { scale: 0.84, background: BLUE, cutColor: BLUE }));
console.log('wrote icons to', outDir);
