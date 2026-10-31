import { useSyncExternalStore } from 'react';
import type { ScaledSize } from 'react-native';

type ViewportSize = ScaledSize & { fontScale: number };

function measure(): ViewportSize {
  const root = document.getElementById('root');
  return {
    fontScale: 1,
    height: root?.clientHeight || window.innerHeight,
    scale: window.devicePixelRatio || 1,
    width: root?.clientWidth || window.innerWidth,
  };
}

let current: ViewportSize | null = null;

function snapshot(): ViewportSize {
  const next = measure();
  // Same object until the size changes, as useSyncExternalStore requires.
  if (!current || current.height !== next.height || current.width !== next.width) current = next;
  return current;
}

function subscribe(onChange: () => void) {
  const root = document.getElementById('root');
  const observer = typeof ResizeObserver === 'undefined' || !root ? null : new ResizeObserver(onChange);
  if (root) observer?.observe(root);
  window.addEventListener('resize', onChange);
  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', onChange);
  };
}

/**
 * The size of the app's root element. useWindowDimensions follows the browser's visual viewport,
 * which shrinks for the iOS keyboard while the page doesn't, so anything sized from it stops
 * lining up with the containers around it. The root element only changes on rotation or resize.
 */
export function useViewportSize(): ViewportSize {
  return useSyncExternalStore(subscribe, snapshot);
}
