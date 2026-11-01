import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTouchScroll } from '../hooks/useTouchScroll';
import { useViewportSize } from '../hooks/useViewportSize';
import { useAppSettings, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { SHEET_AT_REST_TOLERANCE, SheetHandle } from './SheetHandle';

const CONTROL_ROW_HEIGHT = 48;
const ACTION_HEIGHT = 60;
const ACTION_GAP = 16;

type DetailMapPageProps = {
  action?: ReactNode;
  /** False: the action scrolls away with the sheet instead of sticking below the controls. */
  actionSticks?: boolean;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  contentTestID: string;
  controls: ReactNode;
  /** How tall the fixed controls are, below the status bar (a one-button row by default). */
  controlsHeight?: number;
  /** When true, controls sit on the map and scroll away with it instead of staying fixed. */
  controlsScrollWithMap?: boolean;
  /** True: the sheet is only as tall as its content (reaching the screen's bottom at least), instead of always a full screen. */
  fitContent?: boolean;
  /** Shows the home screen's grip on the sheet: tapping it expands or collapses the sheet. */
  handle?: { accessibilityHint: string; accessibilityLabel: string; testID: string };
  /**
   * When true, the uncovered map area takes pan/zoom gestures directly: the scroll view and its
   * content wrapper pass touches through outside the content sheet, which still scrolls the page.
   */
  interactiveMap?: boolean;
  map: ReactNode;
  /** Buttons on the map just above the sheet, moving with it as it scrolls (and above the action, if any). */
  mapButtons?: ReactNode;
  /** Anything else placed on the map (positioned by the page), moving with the sheet like `mapButtons`. */
  mapOverlay?: ReactNode;
  mapHeight: number;
  mapTestID: string;
  scrollTestID: string;
  /** Fades in a bar behind fixed controls once the sheet reaches the top. */
  showHeader?: boolean;
  testID: string;
};

/**
 * Detail-screen layout that matches the home screen: the map stays fixed while
 * the content sheet scrolls over it. An optional action rides the sheet's top
 * edge and sticks below the top controls once that edge scrolls past them.
 */
export function DetailMapPage({
  action,
  actionSticks = true,
  children,
  contentStyle,
  contentTestID,
  controls,
  controlsHeight = CONTROL_ROW_HEIGHT,
  controlsScrollWithMap = false,
  fitContent = false,
  handle,
  interactiveMap = false,
  map,
  mapButtons,
  mapOverlay,
  mapHeight,
  mapTestID,
  scrollTestID,
  showHeader = true,
  testID,
}: DetailMapPageProps) {
  const styles = useThemedStyles(createStyles);
  // iOS Safari won't scroll a scroller that has `pointer-events: none`, even from a child that takes
  // touches. So on web an interactive map rides inside the scroller, stuck to its top, and the sheet
  // scrolls over it just the same; the map's own gesture handling keeps its touches.
  const stickyMap = interactiveMap && Platform.OS === 'web';
  const { height } = useViewportSize();
  const insets = useSafeAreaInsets();
  const { reducedMotionActive } = useAppSettings();
  const [scrollY] = useState(() => new Animated.Value(0));
  const scrollRef = useRef<ScrollViewInstance>(null);
  useTouchScroll(scrollRef);
  const scrollOffset = useRef(0);
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      scrollOffset.current = value;
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);
  // A native-driven Animated.Value doesn't report back to JS, so the settled offset comes from
  // the scroll-end events.
  const recordScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
  };
  // Expanded = the sheet's top edge just below the status bar, as on the home screen.
  const toggleExpanded = () => {
    const target = scrollOffset.current <= SHEET_AT_REST_TOLERANCE ? Math.max(0, mapHeight - insets.top) : 0;
    scrollOffset.current = target;
    scrollRef.current?.scrollTo({ y: target, animated: !reducedMotionActive });
  };
  const restingTop = mapHeight - ACTION_HEIGHT - ACTION_GAP;
  // With the controls gone (scrolled away with the map), the action takes their row.
  const stickyTop = Math.min(restingTop, insets.top + 8 + (controlsScrollWithMap ? 0 : controlsHeight + 12));
  const actionTop = actionSticks
    ? scrollY.interpolate({
      inputRange: [0, Math.max(1, restingTop - stickyTop)],
      outputRange: [restingTop, stickyTop],
      extrapolate: 'clamp',
    })
    : Animated.subtract(restingTop, scrollY);
  const headerHeight = insets.top + 8 + controlsHeight + 8;
  const headerFadeEnd = Math.max(1, mapHeight - headerHeight);
  const headerOpacity = scrollY.interpolate({
    inputRange: [Math.max(0, headerFadeEnd - 32), headerFadeEnd],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.viewport}>
      <View style={styles.screen} testID={testID}>
        {stickyMap ? null : (
          <Animated.View pointerEvents={interactiveMap ? 'auto' : 'none'} style={[styles.map, { height: mapHeight }]} testID={mapTestID}>
            {map}
          </Animated.View>
        )}
        <Animated.ScrollView
          bounces={false}
          contentContainerStyle={interactiveMap && !stickyMap ? styles.passThrough : undefined}
          onMomentumScrollEnd={recordScrollEnd}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: Platform.OS !== 'web',
          })}
          onScrollEndDrag={recordScrollEnd}
          overScrollMode="never"
          pointerEvents={interactiveMap && !stickyMap ? 'box-none' : 'auto'}
          ref={scrollRef}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          testID={scrollTestID}
        >
          {stickyMap ? <View style={[styles.stickyMap, { height: mapHeight }]} testID={mapTestID}>{map}</View> : null}
          <View pointerEvents="box-none" style={[{ height: mapHeight }, stickyMap && { marginTop: -mapHeight, zIndex: 1 }]} testID={`${scrollTestID}-map-window`}>
            {controlsScrollWithMap ? (
              <View pointerEvents="box-none" style={{ paddingTop: insets.top }}>
                {controls}
              </View>
            ) : null}
            {mapOverlay}
            {mapButtons ? <View pointerEvents="box-none" style={[styles.mapButtons, { bottom: action ? ACTION_HEIGHT + ACTION_GAP + 10 : 14 }]}>{mapButtons}</View> : null}
          </View>
          <SafeAreaView edges={['bottom']} style={[styles.sheet, { minHeight: fitContent ? Math.max(0, height - mapHeight) : height }, stickyMap && styles.sheetOverStickyMap, contentStyle, handle && styles.sheetWithHandle]} testID={contentTestID}>
            {handle ? <SheetHandle {...handle} onPress={toggleExpanded} /> : null}
            {children}
          </SafeAreaView>
        </Animated.ScrollView>

        {/* With the controls gone with the map, there's nothing for the bar to back. */}
        {showHeader && !controlsScrollWithMap ? <Animated.View pointerEvents="none" style={[styles.header, { height: headerHeight, opacity: headerOpacity }]} testID={`${testID}-header`} /> : null}

        {controlsScrollWithMap ? null : (
          <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.controls}>
            {controls}
          </SafeAreaView>
        )}

        {action ? (
          <Animated.View pointerEvents="box-none" style={[styles.action, { transform: [{ translateY: actionTop }] }]}>
            {action}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  passThrough: {
    pointerEvents: 'box-none',
  },
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, overflow: 'hidden', backgroundColor: colors.canvas },
  map: { position: 'absolute', top: 0, right: 0, left: 0, overflow: 'hidden', backgroundColor: colors.blueSoft },
  // `sticky` is web-only, which React Native's types don't allow for.
  stickyMap: { position: 'sticky', top: 0, overflow: 'hidden', backgroundColor: colors.blueSoft } as unknown as ViewStyle,
  sheetOverStickyMap: { zIndex: 2 },
  mapButtons: { position: 'absolute', right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  scroll: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 3, backgroundColor: 'transparent' },
  sheet: {
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  // The grip takes the place of the sheet's top padding.
  sheetWithHandle: { paddingTop: 0 },
  header: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 9,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  controls: { position: 'absolute', top: 0, right: 0, left: 0, zIndex: 10, elevation: 7 },
  action: { position: 'absolute', top: 0, right: 18, zIndex: 12, elevation: 14 },
});
