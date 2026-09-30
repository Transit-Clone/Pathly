function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function relativeLuminance(hex: string) {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/**
 * Returns `color`, blended toward white or black just enough to reach `minContrast`
 * against `background`. Used for route-colored text and icons on themed surfaces.
 */
export function readableColor(color: string, background: string, minContrast = 4.5) {
  if (contrastRatio(color, background) >= minContrast) return color.toUpperCase();
  const target: [number, number, number] = relativeLuminance(background) < 0.5 ? [255, 255, 255] : [0, 0, 0];
  const base = channels(color);
  for (let step = 1; step <= 20; step += 1) {
    const t = step / 20;
    const mixed = toHex(base.map((channel, index) => channel + (target[index]! - channel) * t) as [number, number, number]);
    if (contrastRatio(mixed, background) >= minContrast) return mixed;
  }
  return toHex(target);
}
