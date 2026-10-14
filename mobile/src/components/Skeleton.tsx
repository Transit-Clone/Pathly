import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { useAppSettings, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';

const PULSE_LOW = 0.45;
const PULSE_HALF_MS = 800;
/** About what fits above the fold with the menu at rest, so the list never looks empty. */
const NEARBY_PLACEHOLDER_COUNT = 3;

/**
 * Opacity for loading placeholders: a slow fade between full and faint, held at full while
 * reduced motion is on.
 */
export function useSkeletonPulse(): Animated.Value {
  const { reducedMotionActive } = useAppSettings();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reducedMotionActive) {
      opacity.setValue(1);
      return undefined;
    }
    const useNativeDriver = Platform.OS !== 'web';
    const easing = Easing.inOut(Easing.quad);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: PULSE_LOW, duration: PULSE_HALF_MS, easing, useNativeDriver }),
        Animated.timing(opacity, { toValue: 1, duration: PULSE_HALF_MS, easing, useNativeDriver }),
      ]),
    );
    pulse.start();
    return () => {
      pulse.stop();
      opacity.setValue(1);
    };
  }, [opacity, reducedMotionActive]);

  return opacity;
}

/**
 * Gray stand-ins for Nearby's route cards while the first search runs, shaped like a card
 * (title, destination, stop, and the time box) so the real cards fill in without moving the
 * page. Announced once as a group rather than as empty cards.
 */
export function NearbySkeleton() {
  const styles = useThemedStyles(createStyles);
  const opacity = useSkeletonPulse();

  return (
    <View accessibilityLabel="Loading nearby transit" accessibilityRole="progressbar" accessible={true} testID="nearby-routes-loading">
      {Array.from({ length: NEARBY_PLACEHOLDER_COUNT }, (_, index) => (
        <Animated.View key={index} style={[styles.card, { opacity }]} testID="nearby-placeholder-card">
          <View style={styles.copy}>
            <View style={[styles.bar, styles.title]} />
            <View style={[styles.bar, styles.direction]} />
            <View style={[styles.bar, styles.stop]} />
          </View>
          <View style={[styles.bar, styles.time]} />
        </Animated.View>
      ))}
    </View>
  );
}

// Matches TransitCard's size and spacing.
const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    height: 104,
    marginHorizontal: 8,
    marginVertical: 3,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 18,
    backgroundColor: colors.skeleton,
  },
  copy: { flex: 1, gap: 7 },
  bar: { borderRadius: 6, backgroundColor: colors.skeletonBar },
  title: { width: 72, height: 22 },
  direction: { width: '55%', height: 12 },
  stop: { width: '40%', height: 10 },
  time: { width: 44, height: 40, borderRadius: 10 },
});

/** About as many as the route page shows across (the last one cut off by the edge, like real tiles). */
const PREDICTION_PLACEHOLDER_COUNT = 4;

/**
 * Gray stand-ins for route detail's departure tiles while the first live times load, the same
 * size as a tile, announced once with `accessibilityLabel`.
 */
export function PredictionTilesSkeleton({ accessibilityLabel, gap, tileWidth }: { accessibilityLabel: string; gap: number; tileWidth: number }) {
  const styles = useThemedStyles(createTileStyles);
  const opacity = useSkeletonPulse();

  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="progressbar" accessible={true} style={[styles.row, { gap }]} testID="route-predictions-loading">
      {Array.from({ length: PREDICTION_PLACEHOLDER_COUNT }, (_, index) => (
        <Animated.View key={index} style={[styles.tile, { opacity, width: tileWidth }]} testID="route-prediction-placeholder">
          <View style={[styles.bar, styles.number]} />
          <View style={[styles.bar, styles.unit]} />
        </Animated.View>
      ))}
    </View>
  );
}

// Matches RouteDetailView's prediction tiles.
const createTileStyles = (colors: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', paddingTop: 8, overflow: 'hidden' },
  tile: {
    minHeight: 136,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 24,
    borderRadius: 20,
    backgroundColor: colors.skeleton,
  },
  bar: { borderRadius: 6, backgroundColor: colors.skeletonBar },
  number: { width: '50%', height: 34, borderRadius: 8 },
  unit: { width: '45%', height: 10 },
});

/** About as many itinerary cards as fit above the results sheet's fold. */
const ITINERARY_PLACEHOLDER_COUNT = 3;

/**
 * Gray stand-ins for Route Results' itinerary cards while trips are planned: line badges and a
 * timing line on the left, fare and minutes on the right. Announced once as a group.
 */
export function ItinerarySkeleton() {
  const styles = useThemedStyles(createItineraryStyles);
  const opacity = useSkeletonPulse();

  return (
    <View accessibilityLabel="Finding trips" accessibilityRole="progressbar" accessible={true} style={styles.list} testID="results-loading">
      {Array.from({ length: ITINERARY_PLACEHOLDER_COUNT }, (_, index) => (
        <Animated.View key={index} style={[styles.card, { opacity }]} testID="itinerary-placeholder">
          <View style={styles.left}>
            <View style={styles.badges}>
              <View style={[styles.bar, styles.badge]} />
              <View style={[styles.bar, styles.badge]} />
            </View>
            <View style={[styles.bar, styles.timing]} />
          </View>
          <View style={[styles.bar, styles.fare]} />
          <View style={[styles.bar, styles.minutes]} />
        </Animated.View>
      ))}
    </View>
  );
}

// Matches RouteResultsView's itinerary cards.
const createItineraryStyles = (colors: Palette) => StyleSheet.create({
  list: { gap: 8 },
  card: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.skeleton,
  },
  left: { flex: 1, gap: 9 },
  badges: { flexDirection: 'row', gap: 6 },
  bar: { borderRadius: 6, backgroundColor: colors.skeletonBar },
  badge: { width: 34, height: 26 },
  timing: { width: '70%', height: 10 },
  fare: { width: 36, height: 12 },
  minutes: { width: 34, height: 30, borderRadius: 8 },
});
