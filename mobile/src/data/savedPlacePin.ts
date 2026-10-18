/**
 * The home map's saved-place pin: a round badge in the brand color over a short point at the place,
 * with the place's icon centered on the badge. The web map draws the badge from this SVG and the
 * icon as the marker's label; the native map draws the same shape from views
 * (GoogleMapView.native.tsx).
 */

/** Badge size and the point's length, in px; the marker's anchor is the point's tip. */
export const SAVED_PIN = { size: 34, point: 7 } as const;

/** The empty pin as an SVG data URL, with the badge's outline in `ring`. */
export function savedPinSvgUrl(fill: string, ring: string): string {
  const { size, point } = SAVED_PIN;
  const r = size / 2;
  const height = size + point;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${size} ${height}">`
    + `<path d="M${r - 6} ${size - 4} L${r} ${height} L${r + 6} ${size - 4} Z" fill="${fill}" stroke="${ring}" stroke-width="2" stroke-linejoin="round"/>`
    + `<circle cx="${r}" cy="${r}" r="${r - 1.5}" fill="${fill}" stroke="${ring}" stroke-width="2.5"/>`
    + '</svg>';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
