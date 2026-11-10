import { useEffect, useState } from 'react';

/** How long a marker keeps redrawing after its look changes, so the new drawing lands in its picture. */
export const MARKER_SETTLE_MS = 600;

/**
 * Whether a custom map marker should track view changes right now. Android draws such a marker as
 * a picture of its view, and a tracked marker is re-pictured every frame: left on, a few markers
 * churn through memory until the app is killed. So a marker tracks only briefly after `look` (a
 * string naming everything that changes its drawing: theme, color, label) changes, then holds still.
 */
export function useMarkerTracking(look: string): boolean {
  const [settledLook, setSettledLook] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSettledLook(look), MARKER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [look]);
  return settledLook !== look;
}
