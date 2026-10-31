import { useEffect, type RefObject } from 'react';
import type { ScrollViewInstance } from 'react-native';

const AXIS_LOCK_PX = 6;
const FRICTION_PER_MS = 0.997;
const MIN_VELOCITY = 0.02;

const isIOS = typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * Follows a vertical finger drag on iOS browsers, with momentum on release. Home's list is a
 * pass-through scroll view (box-none, so the map underneath stays draggable) full of pressable
 * cards, and Safari doesn't scroll it on its own. If Safari does start scrolling, its touchmoves
 * stop being cancelable and this steps aside.
 */
export function useTouchScroll(scrollRef: RefObject<ScrollViewInstance | null>) {
  useEffect(() => {
    const instance = scrollRef.current as unknown as (HTMLElement & { getScrollableNode?: () => HTMLElement }) | null;
    const node = instance?.getScrollableNode?.() ?? instance;
    if (!isIOS || !node) return undefined;

    let startX = 0;
    let startY = 0;
    let startTop = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;
    let axis: 'x' | 'y' | null = null;
    let frame = 0;

    const onStart = (event: TouchEvent) => {
      cancelAnimationFrame(frame);
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = lastY = touch.clientY;
      startTop = node.scrollTop;
      lastTime = event.timeStamp;
      velocity = 0;
      axis = null;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1 || !event.cancelable) return;
      if (!axis) {
        const dx = Math.abs(touch.clientX - startX);
        const dy = Math.abs(touch.clientY - startY);
        if (Math.max(dx, dy) < AXIS_LOCK_PX) return;
        axis = dy > dx ? 'y' : 'x';
      }
      if (axis !== 'y') return;
      event.preventDefault();
      node.scrollTop = startTop + startY - touch.clientY;
      const elapsed = event.timeStamp - lastTime;
      if (elapsed > 0) velocity = (lastY - touch.clientY) / elapsed;
      lastY = touch.clientY;
      lastTime = event.timeStamp;
    };
    const onEnd = () => {
      if (axis !== 'y') return;
      let previous = performance.now();
      const glide = (now: number) => {
        const elapsed = now - previous;
        previous = now;
        velocity *= FRICTION_PER_MS ** elapsed;
        const before = node.scrollTop;
        node.scrollTop = before + velocity * elapsed;
        // Stops once slow enough, or at either end of the list.
        if (Math.abs(velocity) >= MIN_VELOCITY && node.scrollTop !== before) frame = requestAnimationFrame(glide);
      };
      frame = requestAnimationFrame(glide);
    };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
    };
  }, [scrollRef]);
}
