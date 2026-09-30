import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { boundsOf, type Bounds, type Point } from '../data/mapGeometry';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { Icon } from './Icon';
import { LiveSignal } from './LiveSignal';
import type { MapProjection } from './MapBackdrop';
import type { TransitMode } from './RouteBadge';

export type MapLeg = {
  color: string;
  path: readonly Point[];
  /** Stops to mark on this leg; labels are optional so trips can label only their ends. */
  stops: readonly { label?: string; point: Point }[];
};

const LINE_WIDTH = 7;
const CASING_WIDTH = 4;

/** Bounding box around every leg, padded so lines and labels clear the edges. */
export function routeFocus(paths: readonly (readonly Point[])[], paddingRatio = 0.12): Bounds {
  const bounds = boundsOf(paths);
  const padX = Math.max(40, (bounds.maxX - bounds.minX) * paddingRatio);
  const padY = Math.max(40, (bounds.maxY - bounds.minY) * paddingRatio);
  return { minX: bounds.minX - padX, minY: bounds.minY - padY, maxX: bounds.maxX + padX, maxY: bounds.maxY + padY };
}

/** Point at `fraction` (0–1) of the way along a polyline, by length. */
export function pointAlong(path: readonly Point[], fraction: number): Point {
  const lengths = path.slice(1).map(([x, y], index) => Math.hypot(x - path[index]![0], y - path[index]![1]));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.min(1, Math.max(0, fraction));
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    if (remaining <= length) {
      const [x1, y1] = path[index]!;
      const [x2, y2] = path[index + 1]!;
      const t = length === 0 ? 0 : remaining / length;
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    }
    remaining -= length;
  }
  return path[path.length - 1]!;
}

/** Orients each leg so it starts at the end nearest the previous leg, keeping transfers short. */
export function orientLegs(paths: readonly (readonly Point[])[]): Point[][] {
  const oriented: Point[][] = [];
  for (const path of paths) {
    const previous = oriented.at(-1)?.at(-1);
    const copy = [...path];
    if (previous) {
      const [px, py] = previous;
      const toStart = Math.hypot(copy[0]![0] - px, copy[0]![1] - py);
      const toEnd = Math.hypot(copy.at(-1)![0] - px, copy.at(-1)![1] - py);
      if (toEnd < toStart) copy.reverse();
    }
    oriented.push(copy);
  }
  return oriented;
}

/** Keys of stop labels that fit without overlapping an earlier label (sizes in pixels). */
function placeStopLabels(legs: readonly MapLeg[], scale: number) {
  const placed: { x: number; y: number; width: number }[] = [];
  const keys = new Set<string>();
  legs.forEach((leg, legIndex) => leg.stops.forEach((stop, stopIndex) => {
    if (!stop.label) return;
    const x = stop.point[0] / scale;
    const y = stop.point[1] / scale;
    const width = stop.label.length * 6.5 + 12;
    const overlaps = placed.some((other) => Math.abs(other.y - y) < 15 && x < other.x + other.width && other.x < x + width);
    if (overlaps) return;
    placed.push({ x, y, width });
    keys.add(`${legIndex}-${stopIndex}`);
  }));
  return keys;
}

const toPoints = (points: readonly Point[]) => points.map(([x, y]) => `${x},${y}`).join(' ');

type RouteLinesProps = {
  legs: readonly MapLeg[];
  scale: number;
  showConnectors?: boolean;
  showStart?: boolean;
};

/** SVG route lines, stop dots, and labels drawn inside a MapBackdrop. */
export function RouteLines({ legs, scale, showConnectors = false, showStart = false }: RouteLinesProps) {
  const { colors, isDark } = useTheme();
  const casing = isDark ? '#000000' : '#FFFFFF';
  const first = legs[0]?.path[0];
  const placedLabels = placeStopLabels(legs, scale);

  return (
    <G>
      {showConnectors
        ? legs.slice(1).map((leg, index) => {
            const from = legs[index]!.path.at(-1)!;
            const to = leg.path[0]!;
            return <Line key={`connector-${index}`} stroke={colors.mutedInk} strokeDasharray={`${2 * scale} ${6 * scale}`} strokeLinecap="round" strokeWidth={4 * scale} testID={`map-connector-${index}`} x1={from[0]} x2={to[0]} y1={from[1]} y2={to[1]} />;
          })
        : null}
      {legs.map((leg, legIndex) => (
        <Fragment key={`leg-${legIndex}`}>
          <Polyline fill="none" points={toPoints(leg.path)} stroke={casing} strokeLinecap="round" strokeLinejoin="round" strokeWidth={(LINE_WIDTH + CASING_WIDTH) * scale} />
          <Polyline fill="none" points={toPoints(leg.path)} stroke={leg.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={LINE_WIDTH * scale} testID={`map-route-path-${legIndex}`} />
        </Fragment>
      ))}
      {legs.map((leg, legIndex) => leg.stops.map((stop, stopIndex) => (
        <Circle key={`stop-${legIndex}-${stopIndex}`} cx={stop.point[0]} cy={stop.point[1]} fill="#FFFFFF" r={4.5 * scale} stroke={leg.color} strokeWidth={2.5 * scale} testID={`map-stop-${legIndex}-${stopIndex}`} />
      )))}
      {showStart && first ? <Circle cx={first[0]} cy={first[1]} fill="#FFFFFF" r={7 * scale} stroke={legs[0]!.color} strokeWidth={4 * scale} testID="map-trip-start" /> : null}
      {legs.map((leg, legIndex) => leg.stops.map((stop, stopIndex) => {
        if (!stop.label || !placedLabels.has(`${legIndex}-${stopIndex}`)) return null;
        const common = { fontFamily: fontFamilies.bold, fontSize: 11 * scale, x: stop.point[0] + 9 * scale, y: stop.point[1] + 4 * scale };
        return (
          <G key={`label-${legIndex}-${stopIndex}`}>
            <SvgText {...common} fill={colors.mapLabelHalo} stroke={colors.mapLabelHalo} strokeWidth={3 * scale}>{stop.label}</SvgText>
            <SvgText {...common} fill={colors.ink}>{stop.label}</SvgText>
          </G>
        );
      }))}
    </G>
  );
}

const VEHICLE_SIZE = 46;

type VehicleMarkerProps = {
  color: string;
  minutes: number;
  mode: TransitMode;
  point: Point;
  projection: MapProjection;
};

/** White vehicle bubble with the mode icon, a live signal, and minutes until arrival. */
export function VehicleMarker({ color, minutes, mode, point, projection }: VehicleMarkerProps) {
  const styles = useThemedStyles(createStyles);
  const { x, y } = projection.project(point);
  return (
    <View style={[styles.vehicle, { left: x - VEHICLE_SIZE / 2, top: y - VEHICLE_SIZE / 2 }]} testID="map-vehicle">
      <Icon color={color} filled={true} name={mode} size={24} />
      <View style={styles.vehicleSignal}><LiveSignal color={color} /></View>
      <View style={[styles.minutesBubble, { backgroundColor: color }]}><Text style={styles.minutesText}>{minutes}m</Text></View>
    </View>
  );
}

const PIN_SIZE = 38;

/** Destination pin whose tip sits on the final stop. */
export function DestinationPin({ color, point, projection }: { color: string; point: Point; projection: MapProjection }) {
  const styles = useThemedStyles(createStyles);
  const { x, y } = projection.project(point);
  return (
    <View style={[styles.pin, { left: x - PIN_SIZE / 2, top: y - PIN_SIZE + 3 }]} testID="map-destination-pin">
      <View style={styles.pinCore} />
      <Icon color={color} filled={true} name="place" size={PIN_SIZE} />
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  vehicle: {
    position: 'absolute',
    width: VEHICLE_SIZE,
    height: VEHICLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VEHICLE_SIZE / 2,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 6,
  },
  vehicleSignal: { position: 'absolute', top: -1, right: 3 },
  minutesBubble: {
    position: 'absolute',
    top: -10,
    right: -18,
    minWidth: 32,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: 11,
  },
  minutesText: { color: '#FFFFFF', fontFamily: fontFamilies.extraBold, fontSize: 10 },
  pin: { position: 'absolute', width: PIN_SIZE, height: PIN_SIZE, alignItems: 'center' },
  pinCore: { position: 'absolute', top: 8, width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF' },
});
