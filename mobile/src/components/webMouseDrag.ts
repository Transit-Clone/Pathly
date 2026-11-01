import { Platform } from 'react-native';

/**
 * A web mouse can't drag a horizontal scroller, so those pages turn a drag into a scroll by hand.
 * On a touch screen the browser already scrolls, and doing both fights it, so they don't.
 */
export const usesWebMouseDrag = Platform.OS === 'web' && !(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);
