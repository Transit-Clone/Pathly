import { useState, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';

const CONTROL_ROW_HEIGHT = 48;
const ACTION_HEIGHT = 60;
const ACTION_GAP = 16;

type DetailMapPageProps = {
  action?: ReactNode;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  contentTestID: string;
  controls: ReactNode;
  /** When true, controls sit on the map and scroll away with it instead of staying fixed. */
  controlsScrollWithMap?: boolean;
  /**
   * When true, the uncovered map area takes pan/zoom gestures directly: the scroll view and its
   * content wrapper pass touches through outside the content sheet, which still scrolls the page.
   */
  interactiveMap?: boolean;
  map: ReactNode;
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
  children,
  contentStyle,
  contentTestID,
  controls,
  controlsScrollWithMap = false,
  interactiveMap = false,
  map,
  mapHeight,
  mapTestID,
  scrollTestID,
  showHeader = true,
  testID,
}: DetailMapPageProps) {
  const styles = useThemedStyles(createStyles);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [scrollY] = useState(() => new Animated.Value(0));
  const restingTop = mapHeight - ACTION_HEIGHT - ACTION_GAP;
  const stickyTop = Math.min(restingTop, insets.top + 8 + CONTROL_ROW_HEIGHT + 12);
  const actionTop = scrollY.interpolate({
    inputRange: [0, Math.max(1, restingTop - stickyTop)],
    outputRange: [restingTop, stickyTop],
    extrapolate: 'clamp',
  });
  const headerHeight = insets.top + 8 + CONTROL_ROW_HEIGHT + 8;
  const headerFadeEnd = Math.max(1, mapHeight - headerHeight);
  const headerOpacity = scrollY.interpolate({
    inputRange: [Math.max(0, headerFadeEnd - 32), headerFadeEnd],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.viewport}>
      <View style={styles.screen} testID={testID}>
        <View pointerEvents={interactiveMap ? 'auto' : 'none'} style={[styles.map, { height: mapHeight }]} testID={mapTestID}>
          {map}
        </View>

        <Animated.ScrollView
          bounces={false}
          contentContainerStyle={interactiveMap ? styles.passThrough : undefined}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: Platform.OS !== 'web',
          })}
          overScrollMode="never"
          pointerEvents={interactiveMap ? 'box-none' : 'auto'}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          testID={scrollTestID}
        >
          <View pointerEvents="box-none" style={{ height: mapHeight }} testID={`${scrollTestID}-map-window`}>
            {controlsScrollWithMap ? (
              <View pointerEvents="box-none" style={{ paddingTop: insets.top }}>
                {controls}
              </View>
            ) : null}
          </View>
          <SafeAreaView edges={['bottom']} style={[styles.sheet, { minHeight: height }, contentStyle]} testID={contentTestID}>
            {children}
          </SafeAreaView>
        </Animated.ScrollView>

        {showHeader ? <Animated.View pointerEvents="none" style={[styles.header, { height: headerHeight, opacity: headerOpacity }]} testID={`${testID}-header`} /> : null}

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
  scroll: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 3, backgroundColor: 'transparent' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
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
