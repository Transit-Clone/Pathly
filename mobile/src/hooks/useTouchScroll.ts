import type { RefObject } from 'react';
import type { ScrollViewInstance } from 'react-native';

/** Web-only (see the `.web` version): native scroll views already follow the finger. */
export function useTouchScroll(_scrollRef: RefObject<ScrollViewInstance | null>) {}
