import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import {
  campus,
  defaultFocus,
  labelPlacement,
  parks,
  placeLabels,
  roads,
  userLocation,
  water,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Bounds,
  type MapArea,
  type Point,
} from '../data/mapGeometry';
import { useTheme } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies } from '../theme/typography';
import { CurrentLocationMarker } from './CurrentLocationMarker';

export type MapProjection = {
  /** Converts a world point to pixels within the map container. */
  project: (point: Point) => { x: number; y: number };
  /** World units per pixel; multiply a pixel size by this to draw it in the SVG. */
  scale: number;
};

type Padding = { bottom?: number; left?: number; right?: number; top?: number };

type MapBackdropProps = {
  focus?: Bounds;
  /** Expected container size, used until the first layout so the first frame is framed correctly. */
  initialSize?: { height: number; width: number };
  padding?: Padding;
  renderMarkers?: (projection: MapProjection) => ReactNode;
  renderOverlay?: (projection: MapProjection) => ReactNode;
  showUserLocation?: boolean;
  testID?: string;
};

const ROAD_WIDTH = { major: 9, minor: 5 } as const;
const CASING = 2.5;
const LOCATION_MARKER_SIZE = 38;

const EDGE_RUNOFF = 1200;

/** Runs roads that end on the world boundary off past it, so zoomed-out views never show a road stopping short. */
function extendToEdges(points: readonly Point[]): readonly Point[] {
  const onEdge = ([x, y]: Point) => x <= 0 || x >= WORLD_WIDTH || y <= 0 || y >= WORLD_HEIGHT;
  const runoff = (end: Point, neighbor: Point): Point => {
    const length = Math.hypot(end[0] - neighbor[0], end[1] - neighbor[1]) || 1;
    return [end[0] + ((end[0] - neighbor[0]) / length) * EDGE_RUNOFF, end[1] + ((end[1] - neighbor[1]) / length) * EDGE_RUNOFF];
  };
  if (points.length < 2) return points;
  const result = [...points];
  if (onEdge(points[0]!)) result.unshift(runoff(points[0]!, points[1]!));
  if (onEdge(points.at(-1)!)) result.push(runoff(points.at(-1)!, points.at(-2)!));
  return result;
}

function toPoints(points: readonly Point[]) {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

/** Fits `focus` inside the padded container and returns the SVG viewBox plus a projection. */
export function fitMap(focus: Bounds, width: number, height: number, padding: Padding = {}) {
  const { top = 0, right = 0, bottom = 0, left = 0 } = padding;
  const innerWidth = Math.max(1, width - left - right);
  const innerHeight = Math.max(1, height - top - bottom);
  const scale = Math.max((focus.maxX - focus.minX) / innerWidth, (focus.maxY - focus.minY) / innerHeight);
  const centerX = (focus.minX + focus.maxX) / 2;
  const centerY = (focus.minY + focus.maxY) / 2;
  const originX = centerX - (left + innerWidth / 2) * scale;
  const originY = centerY - (top + innerHeight / 2) * scale;
  const projection: MapProjection = {
    scale,
    project: ([x, y]) => ({ x: (x - originX) / scale, y: (y - originY) / scale }),
  };
  return { projection, viewBox: `${originX} ${originY} ${width * scale} ${height * scale}` };
}

function AreaLabel({ area, colors, scale }: { area: MapArea; colors: Palette; scale: number }) {
  if (!area.label || !area.labelAt) return null;
  const [x, y] = area.labelAt;
  const fontSize = 10 * scale;
  return (
    <G>
      <SvgText fill={colors.mapLabelHalo} fontFamily={fontFamilies.semibold} fontSize={fontSize} stroke={colors.mapLabelHalo} strokeWidth={3 * scale} textAnchor="middle" x={x} y={y}>{area.label}</SvgText>
      <SvgText fill={colors.mapLabel} fontFamily={fontFamilies.semibold} fontSize={fontSize} textAnchor="middle" x={x} y={y}>{area.label}</SvgText>
    </G>
  );
}

/** World units per pixel beyond which small labels are dropped to keep zoomed-out maps readable. */
const DETAIL_LABEL_SCALE = 2.4;
const PLACE_LABEL_SCALE = 3.4;

function BaseMap({ colors, scale }: { colors: Palette; scale: number }) {
  const showDetailLabels = scale <= DETAIL_LABEL_SCALE;
  return (
    <G>
      <Rect fill={colors.mapLand} height={6000} testID="map-land" width={6000} x={-2500} y={-2500} />
      {water.map((area, index) => <Polygon key={`water-${index}`} fill={colors.mapWater} points={toPoints(area.points)} />)}
      {parks.map((area, index) => <Polygon key={`park-${index}`} fill={colors.mapPark} points={toPoints(area.points)} />)}
      <Polygon fill={colors.mapCampus} points={toPoints(campus.points)} />

      {roads.map((road, index) => (
        <Polyline key={`casing-${index}`} fill="none" points={toPoints(extendToEdges(road.points))} stroke={colors.mapRoadCasing} strokeLinecap="round" strokeLinejoin="round" strokeWidth={(ROAD_WIDTH[road.kind] + CASING) * scale} />
      ))}
      {roads.map((road, index) => (
        <Polyline key={`road-${index}`} fill="none" points={toPoints(extendToEdges(road.points))} stroke={road.kind === 'major' ? colors.mapRoadMajor : colors.mapRoad} strokeLinecap="round" strokeLinejoin="round" strokeWidth={ROAD_WIDTH[road.kind] * scale} />
      ))}

      {roads.filter((road) => road.name && (showDetailLabels || road.kind === 'major')).map((road) => {
        const label = labelPlacement(road.points);
        const offset = (ROAD_WIDTH[road.kind] / 2 + 7) * scale;
        const radians = (label.angle * Math.PI) / 180;
        const x = label.x + Math.sin(radians) * offset;
        const y = label.y - Math.cos(radians) * offset;
        const common = { fontFamily: fontFamilies.semibold, fontSize: 10.5 * scale, textAnchor: 'middle' as const, transform: `rotate(${label.angle} ${x} ${y})`, x, y };
        return (
          <G key={`label-${road.name}`}>
            <SvgText {...common} fill={colors.mapLabelHalo} stroke={colors.mapLabelHalo} strokeWidth={3 * scale}>{road.name}</SvgText>
            <SvgText {...common} fill={colors.mapLabel}>{road.name}</SvgText>
          </G>
        );
      })}

      {showDetailLabels && [...water, ...parks, campus].map((area, index) => <AreaLabel key={`area-${index}`} area={area} colors={colors} scale={scale} />)}
      {scale <= PLACE_LABEL_SCALE && placeLabels.map(({ at: [x, y], label }) => (
        <G key={label}>
          <SvgText fill={colors.mapLabelHalo} fontFamily={fontFamilies.bold} fontSize={13 * scale} stroke={colors.mapLabelHalo} strokeWidth={3 * scale} textAnchor="middle" x={x} y={y}>{label}</SvgText>
          <SvgText fill={colors.mapLabel} fontFamily={fontFamilies.bold} fontSize={13 * scale} textAnchor="middle" x={x} y={y}>{label}</SvgText>
        </G>
      ))}
    </G>
  );
}

/** Vector street map of the Stony Brook area that fills its parent; overlays share its coordinates. */
export function MapBackdrop({ focus = defaultFocus, initialSize, padding, renderMarkers, renderOverlay, showUserLocation = false, testID = 'map-backdrop' }: MapBackdropProps) {
  const { colors } = useTheme();
  const window = useWindowDimensions();
  const [size, setSize] = useState(initialSize ?? { width: window.width, height: window.height });
  const { projection, viewBox } = fitMap(focus, size.width, size.height, padding);
  const baseMap = useMemo(() => <BaseMap colors={colors} scale={projection.scale} />, [colors, projection.scale]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== size.width || height !== size.height)) setSize({ width, height });
  };

  const location = projection.project(userLocation);

  return (
    <View
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.mapLand }]}
      testID={testID}
    >
      <Svg height={size.height} preserveAspectRatio="xMidYMid slice" viewBox={viewBox} width={size.width}>
        {baseMap}
        {renderOverlay?.(projection)}
      </Svg>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {showUserLocation ? (
          <View style={[styles.marker, { left: location.x - LOCATION_MARKER_SIZE / 2, top: location.y - LOCATION_MARKER_SIZE / 2 }]} testID="map-user-location">
            <CurrentLocationMarker />
          </View>
        ) : null}
        {renderMarkers?.(projection)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  marker: { position: 'absolute' },
});
