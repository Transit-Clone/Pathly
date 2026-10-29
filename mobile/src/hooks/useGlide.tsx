import { useEffect, useRef, useState, type ReactNode } from 'react';

/** How long a moved vehicle takes to slide to its new spot. */
const GLIDE_MS = 1200;

type Point = { lat: number; lon: number };

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * A point that slides to each new value instead of jumping, so a vehicle's refreshed position is
 * seen leaving where it was. A jump farther than `maxMeters` (a new trip, a GPS glitch) snaps.
 */
export function useGlide(target: Point, maxMeters = 3_000): Point {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    if (from.lat === target.lat && from.lon === target.lon) return undefined;
    const meters = Math.hypot((target.lat - from.lat) * 111_320, (target.lon - from.lon) * 111_320 * Math.cos((target.lat * Math.PI) / 180));
    if (meters > maxMeters || typeof requestAnimationFrame !== 'function') {
      shownRef.current = target;
      setShown(target);
      return undefined;
    }
    const startedAt = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - startedAt) / GLIDE_MS);
      const k = easeInOut(t);
      const next = { lat: from.lat + (target.lat - from.lat) * k, lon: from.lon + (target.lon - from.lon) * k };
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target.lat, target.lon, maxMeters]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the coordinates
  return shown;
}

/** Renders `children` at a gliding copy of `lat`/`lon`: one per vehicle, so each glides on its own. */
export function Glide({ children, lat, lon }: { lat: number; lon: number; children: (point: Point) => ReactNode }) {
  const point = useGlide({ lat, lon });
  return <>{children(point)}</>;
}
