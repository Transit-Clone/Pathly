/** Between the zoom levels a glide steps through: each level's own animation has time to land. */
const ZOOM_STEP_MS = 220;

/**
 * Moves a Google Maps JS map smoothly: it pans to `centerAt(zoom)` and steps the zoom toward
 * `targetZoom` one level at a time. setCenter and a multi-level setZoom jump; panTo and a one-level
 * setZoom animate. `centerAt` gives the center for each zoom, for targets kept clear of what covers
 * the map. Returns a cancel for an effect's cleanup.
 */
export function glideMapTo(map: google.maps.Map, centerAt: (zoom: number) => google.maps.LatLngLiteral, targetZoom: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const start = map.getZoom() ?? targetZoom;
  const zoomStep = () => {
    const current = map.getZoom() ?? targetZoom;
    const next = current + Math.sign(targetZoom - current);
    if (next !== current) map.setZoom(next);
    map.panTo(centerAt(next));
    if (next !== targetZoom) timer = setTimeout(zoomStep, ZOOM_STEP_MS);
  };
  map.panTo(centerAt(start));
  if (start !== targetZoom) timer = setTimeout(zoomStep, ZOOM_STEP_MS);
  return () => {
    if (timer) clearTimeout(timer);
  };
}

/**
 * The center that puts `point` `offset` px (x right, y down) from the map's middle at `zoom`: the
 * middle of the part a sheet or header leaves uncovered. The point itself when the map isn't ready.
 */
export function centerOffsetFrom(map: google.maps.Map, point: google.maps.LatLngLiteral, zoom: number, offset: { x: number; y: number }): google.maps.LatLngLiteral {
  const projection = map.getProjection?.();
  const world = projection?.fromLatLngToPoint(new google.maps.LatLng(point));
  const scale = 2 ** zoom;
  const shifted = world && projection?.fromPointToLatLng(new google.maps.Point(world.x - offset.x / scale, world.y - offset.y / scale));
  return shifted ? { lat: shifted.lat(), lng: shifted.lng() } : point;
}

/**
 * The camera that fits `points` in the map's uncovered part (inside `padding`), for glideMapTo:
 * the zoom, and the center for any zoom. Null when the map isn't laid out yet.
 */
export function cameraToFit(
  map: google.maps.Map,
  points: readonly google.maps.LatLngLiteral[],
  padding: { top: number; right: number; bottom: number; left: number },
  maxZoom: number,
): { zoom: number; centerAt: (zoom: number) => google.maps.LatLngLiteral } | null {
  const projection = map.getProjection?.();
  const div = map.getDiv?.();
  if (!projection || !div || points.length === 0) return null;
  const width = div.clientWidth - padding.left - padding.right;
  const height = div.clientHeight - padding.top - padding.bottom;
  if (width <= 0 || height <= 0) return null;
  const world = points.flatMap((point) => projection.fromLatLngToPoint(new google.maps.LatLng(point)) ?? []);
  if (world.length === 0) return null;
  const xs = world.map((point) => point.x);
  const ys = world.map((point) => point.y);
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1e-9);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1e-9);
  const zoom = Math.max(3, Math.min(maxZoom, Math.floor(Math.log2(Math.min(width / spanX, height / spanY)))));
  const middle = projection.fromPointToLatLng(new google.maps.Point((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2));
  if (!middle) return null;
  const mid = { lat: middle.lat(), lng: middle.lng() };
  const offset = { x: (padding.left - padding.right) / 2, y: (padding.top - padding.bottom) / 2 };
  return { zoom, centerAt: (step) => centerOffsetFrom(map, mid, step, offset) };
}
