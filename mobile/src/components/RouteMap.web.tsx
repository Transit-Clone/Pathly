import { GoogleMap, Marker, OverlayViewF, OVERLAY_LAYER, OVERLAY_MOUSE_TARGET, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '../data/googleMapsLoaderConfig';
import { formatAge, visibleTrains } from '../data/liveTrains';
import { googleMapStyle } from '../data/mapStyle';
import { approachingVehicle, directionArrowAt, focusStopIndex, metersPerPixel, riderNearStop, splitPathAtStop } from '../data/routeDirection';
import { stopRevealZoom } from '../data/stopDeclutter';
import type { RouteLiveVehicle } from '../data/transitLive';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useNow } from '../hooks/useNow';
import { useTheme } from '../theme/AppSettings';
import type { TransitMode } from './RouteBadge';
import { HeadingBeamMarker } from './HeadingBeamMarker';
import { Glide } from '../hooks/useGlide';
import { DIRECTION_ARROW_BOX, DirectionArrow } from './DirectionArrow';
import { cameraToFit, glideMapTo } from './webMapGlide';

type GeometryStop = { stopId?: string; name: string; lat: number; lon: number };

const containerStyle = { width: '100%', height: '100%' };
// 'greedy': one-finger drag pans on touch browsers and the wheel zooms without holding Ctrl,
// since this map sits in its own uncovered area of the page rather than inside scrolling text.
const baseMapOptions = { disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false };
// Arbitrary point; immediately replaced by fitBounds (or the focus stop) once the map is ready.
const FALLBACK_CENTER = { lat: 40.75, lng: -73.95 };
const FOCUS_ZOOM = 13;
const ROUTE_FIT_PADDING = { top: 90, right: 40, bottom: 60, left: 40 };
// The line behind the rider's stop (already travelled in this direction) is drawn faint.
const BEHIND_LINE_OPACITY = 0.35;
// Stop dots are exactly as wide as the line (a circle symbol's outer size is 2 × scale + stroke),
// so they sit inside it like beads. Only the rider's own stop is drawn larger, so it stands out.
const LINE_WIDTH = 8;
const STOP_RING = 1.5;
const STOP_DOT_SCALE = (LINE_WIDTH - STOP_RING) / 2;
// The walk to the stop: a row of dots, matching TripMap.web.tsx's walking legs.
// Walks are plain round gray dots, which read from far out over any street.
const WALK_DOT_SCALE = 3.5;

// Vehicle marker geometry: circle at bottom-left of a larger box so the age badge can overhang its top-right.
const VEHICLE_SIZE = 42;
const VEHICLE_BOX = 54;

/**
 * Borderless white circle with a route-color vehicle glyph (three times a stop dot's size and
 * carrying a glyph they never have), plus a borderless route-color age badge with white text at
 * its top-right, as an SVG data URL. With no outline, the shadow keeps the white circle visible
 * on pale tiles.
 */
function vehicleIconUrl(color: string, age: string | null) {
  const r = VEHICLE_SIZE / 2;
  const cx = r;
  const cy = VEHICLE_BOX - r;
  const badge = age
    ? `<circle cx="${VEHICLE_BOX - 12}" cy="12" r="11" fill="${color}"/>
<text x="${VEHICLE_BOX - 12}" y="15.2" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-weight="800" font-size="9" fill="#FFFFFF">${age}</text>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${VEHICLE_BOX}" height="${VEHICLE_BOX}" viewBox="0 0 ${VEHICLE_BOX} ${VEHICLE_BOX}">
<defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#16324F" flood-opacity="0.45"/></filter></defs>
<circle cx="${cx}" cy="${cy}" r="${r - 3}" fill="#FFFFFF" filter="url(#s)"/>
<g transform="translate(${cx - 8.4} ${cy - 10.8}) scale(1.2)">
<rect x="0" y="0" width="14" height="14" rx="3.5" fill="${color}"/>
<rect x="2.2" y="2.6" width="9.6" height="5" rx="1.2" fill="#FFFFFF"/>
<circle cx="3.6" cy="11" r="1.3" fill="#FFFFFF"/><circle cx="10.4" cy="11" r="1.3" fill="#FFFFFF"/>
<path d="M2.4 14.6 L0.6 17.6 M11.6 14.6 L13.4 17.6" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
</g>${badge}
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Places the stop label's bottom-center just above the dot. */
const labelOffset = (width: number, height: number) => ({ x: -width / 2, y: -height - 12 });

type RouteMapProps = {
  /** Incremented by the location button; each change centers the map on `userLocation` and follows it until a drag. */
  centerOnUserRequest?: number;
  /** Incremented by the route-overview button; each change fits the map to the whole line. */
  showRouteRequest?: number;
  color: string;
  /** GTFS direction_id to show vehicles for; all directions when omitted. */
  directionId?: number;
  /** Stop to open zoomed on and emphasize (the rider's nearest), matched by stopId. */
  focusStopId?: string;
  /** Matches the rider's stop by name when its id isn't in `stops` (see focusStopIndex). */
  focusStopName?: string;
  /** Vehicle label (train vs bus). */
  mode?: TransitMode;
  /** Tapping a stop's name (shown once its dot is tapped) opens the line at that stop. */
  onOpenStop?: (stop: GeometryStop) => void;
  /** Called when the rider drags the map, so the location button can drop its selected state. */
  onUserPan?: () => void;
  /** Detailed track geometry when known (e.g. GTFS shapes); otherwise the line joins the stops. */
  path?: readonly { lat: number; lon: number }[];
  stops: readonly GeometryStop[];
  testID?: string;
  /** Rider's real location; omitted while only the fallback is known. */
  userLocation?: Coordinates;
  vehicles: readonly RouteLiveVehicle[];
  /** The walk along the streets from the rider to the focused stop, drawn dotted (as on the trip map). */
  walkPath?: readonly { lat: number; lon: number }[];
};

/** Real route map: actual stop positions, the real line, and live vehicles — for any route with a live feed. */
const arrowOffset = () => ({ x: -DIRECTION_ARROW_BOX / 2, y: -DIRECTION_ARROW_BOX / 2 });

export function RouteMap({ centerOnUserRequest = 0, color, directionId, focusStopId, focusStopName, mode = 'rail', onOpenStop, onUserPan, path, showRouteRequest = 0, stops, testID = 'route-map', userLocation, vehicles, walkPath }: RouteMapProps) {
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  // Places hidden, and recolored in the dark theme (see mapStyle.ts).
  const { colors, isDark } = useTheme();
  const mapOptions = useMemo(() => ({ ...baseMapOptions, styles: googleMapStyle(isDark) }), [isDark]);
  const [selectedStop, setSelectedStop] = useState<GeometryStop | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  // Stop dots are drawn only once they're zoomed apart (stopDeclutter.ts); the rider's stop always is.
  const [zoom, setZoom] = useState(0);
  // The loaded map, readable from its first zoom change (before `map` state has updated).
  const zoomSource = useRef<google.maps.Map | null>(null);
  const revealZoom = useMemo(() => stopRevealZoom(stops.map((stop) => ({ lat: stop.lat, lng: stop.lon }))), [stops]);
  const riderMovedMap = useRef(false);
  // True from a location-button press until the rider drags (or asks for the whole route): keeps
  // following fresh GPS fixes.
  const followRider = useRef(false);
  const now = useNow(1000);
  const shownVehicles = visibleTrains(vehicles, directionId, now);
  const vehicleLabel = mode === 'bus' ? 'Bus' : 'Train';
  const focusStop = stops[focusStopIndex(stops, focusStopId, focusStopName)];

  // Split at the rider's stop: faint behind it, full strength ahead.
  const line = useMemo(() => {
    const points = path ?? stops;
    const toPath = (part: readonly { lat: number; lon: number }[]) => part.map((point) => ({ lat: point.lat, lng: point.lon }));
    const focusIndex = focusStop ? stops.indexOf(focusStop) : -1;
    if (focusIndex < 0) return { behind: [], ahead: toPath(points), aheadPoints: [], behindPoints: [], focusIndex };
    const { behind, ahead } = splitPathAtStop(points, stops, focusIndex);
    return { behind: toPath(behind), ahead: toPath(ahead), aheadPoints: ahead, behindPoints: behind, focusIndex };
  }, [focusStop, path, stops]);
  // Placed once, for the zoom the map opens at, so zooming never moves it. Zoomed out well past that,
  // the line's bends would reach it, so it's hidden there instead.
  const arrowZoom = FOCUS_ZOOM;
  const arrow = useMemo(() => {
    const start = line.aheadPoints[0];
    return start ? directionArrowAt(line.aheadPoints, metersPerPixel(arrowZoom, start.lat)) : null;
  }, [arrowZoom, line.aheadPoints]);
  const polylineOptions = useMemo(() => ({ strokeColor: color, strokeWeight: LINE_WIDTH, zIndex: 1 }), [color]);
  const behindPolylineOptions = useMemo(() => ({ strokeColor: color, strokeOpacity: BEHIND_LINE_OPACITY, strokeWeight: LINE_WIDTH, zIndex: 0 }), [color]);

  // The rider, when they're near their stop: framed with it so they see the walk there.
  const nearRider = userLocation && focusStop && riderNearStop(userLocation, focusStop) ? { lat: userLocation.latitude, lng: userLocation.longitude } : null;
  const frameStop = (target: google.maps.Map, stop: GeometryStop, extra: readonly google.maps.LatLngLiteral[]) => {
    const points = [{ lat: stop.lat, lng: stop.lon }, ...extra];
    if (points.length === 1) {
      target.panTo(points[0]!);
      if ((target.getZoom() ?? 0) < FOCUS_ZOOM) target.setZoom(FOCUS_ZOOM);
      return;
    }
    const camera = cameraToFit(target, points, ROUTE_FIT_PADDING, FOCUS_ZOOM + 3);
    if (camera) {
      glideCancel.current?.();
      glideCancel.current = glideMapTo(target, camera.centerAt, camera.zoom);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const point of points) bounds.extend(point);
    target.fitBounds(bounds, ROUTE_FIT_PADDING);
  };
  const glideCancel = useRef<(() => void) | null>(null);

  // Opens on the rider's nearest stop when known (with the rider, if they're close by), otherwise
  // fits every stop with some breathing room.
  const onLoad = useCallback((loadedMap: google.maps.Map) => {
    setMap(loadedMap);
    zoomSource.current = loadedMap;
    if (focusStop) {
      loadedMap.setCenter({ lat: focusStop.lat, lng: focusStop.lon });
      loadedMap.setZoom(FOCUS_ZOOM);
      if (nearRider) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: focusStop.lat, lng: focusStop.lon });
        bounds.extend(nearRider);
        loadedMap.fitBounds(bounds, ROUTE_FIT_PADDING);
      }
      return;
    }
    // The whole line, clear of the controls over the map's top.
    const bounds = new google.maps.LatLngBounds();
    for (const point of path ?? stops) bounds.extend({ lat: point.lat, lng: point.lon });
    loadedMap.fitBounds(bounds, ROUTE_FIT_PADDING);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot camera setup on load
  }, [stops]);

  // Set once the map has framed an approaching vehicle (below).
  const framedVehicle = useRef(false);
  // The nearest stop (and whether the rider is near it) often resolves after the page opens; follow
  // them until the rider drags. Keyed on near/far, not every GPS fix.
  useEffect(() => {
    if (!map || !focusStop || riderMovedMap.current || framedVehicle.current) return;
    frameStop(map, focusStop, nearRider ? [nearRider] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stop's identity and the rider being near
  }, [map, focusStop?.stopId, nearRider != null]);

  // Once a live vehicle shows up on its way to the rider's stop, the map glides out (once) to show
  // the stop and that vehicle (and the rider, when they're near the stop), unless the rider has
  // moved the map already.
  useEffect(() => {
    if (framedVehicle.current || riderMovedMap.current || !map || !focusStop) return;
    const vehicle = approachingVehicle(line.behindPoints, shownVehicles);
    if (!vehicle) return;
    framedVehicle.current = true;
    frameStop(map, focusStop, [{ lat: vehicle.lat, lng: vehicle.lon }, ...(nearRider ? [nearRider] : [])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-checked as vehicles report; the rest is read then
  }, [map, focusStop?.stopId, vehicles]);
  useEffect(() => () => glideCancel.current?.(), []);

  useEffect(() => {
    if (centerOnUserRequest === 0) return;
    followRider.current = true;
    riderMovedMap.current = true; // the nearest-stop focus must not pull the map back
  }, [centerOnUserRequest]);

  // Glides there (zooming back in a level at a time from far out) rather than jumping.
  useEffect(() => {
    if (!followRider.current || !map || !userLocation) return undefined;
    const rider = { lat: userLocation.latitude, lng: userLocation.longitude };
    return glideMapTo(map, () => rider, Math.max(map.getZoom() ?? 0, FOCUS_ZOOM));
  }, [centerOnUserRequest, map, userLocation]);

  // The route-overview button frames the whole line in this direction (every stop), clear of the
  // controls over the map's top.
  useEffect(() => {
    if (showRouteRequest === 0 || !map) return;
    followRider.current = false;
    riderMovedMap.current = true; // the nearest-stop focus must not pull the map back
    const bounds = new google.maps.LatLngBounds();
    for (const point of path ?? stops) bounds.extend({ lat: point.lat, lng: point.lon });
    map.fitBounds(bounds, ROUTE_FIT_PADDING);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the request only; the line is read at request time
  }, [showRouteRequest]);

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      {isLoaded ? (
        <GoogleMap
          center={FALLBACK_CENTER}
          mapContainerStyle={containerStyle}
          onClick={() => setSelectedStop(null)}
          onDragStart={() => {
            riderMovedMap.current = true;
            followRider.current = false;
            onUserPan?.();
          }}
          onLoad={onLoad}
          onZoomChanged={() => setZoom(zoomSource.current?.getZoom() ?? 0)}
          onUnmount={() => setMap(null)}
          options={mapOptions}
          zoom={9}
        >
          {line.behind.length > 1 ? <Polyline options={behindPolylineOptions} path={line.behind} /> : null}
          <Polyline options={polylineOptions} path={line.ahead} />
          {walkPath && walkPath.length > 1 ? (
            <Polyline
              options={{
                strokeOpacity: 0,
                icons: [{ icon: { path: google.maps.SymbolPath.CIRCLE, scale: WALK_DOT_SCALE, fillColor: colors.mutedInk, fillOpacity: 1, strokeWeight: 0 }, offset: '0', repeat: '13px' }],
                zIndex: 2,
                clickable: false,
              }}
              path={walkPath.map((point) => ({ lat: point.lat, lng: point.lon }))}
            />
          ) : null}
          {stops.map((stop, stopIndex) => {
            const focused = stop === focusStop;
            if (!focused && zoom < revealZoom && stop !== selectedStop) return null;
            // Stops behind the rider's stop in this direction fade with the line behind it.
            const passed = line.focusIndex >= 0 && stopIndex < line.focusIndex;
            return (
              <Marker
                key={`${stop.stopId ?? stop.name}-${stopIndex}`}
                // A circle symbol is centered on its position by definition, unlike a pin. The
                // rider's nearest stop is larger and white, with a thick ring in the route color.
                icon={focused
                  ? { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#FFFFFF', fillOpacity: 1, strokeColor: color, strokeWeight: 4 }
                  : { path: google.maps.SymbolPath.CIRCLE, scale: STOP_DOT_SCALE, fillColor: '#FFFFFF', fillOpacity: 1, strokeColor: color, strokeOpacity: passed ? BEHIND_LINE_OPACITY : 1, strokeWeight: STOP_RING }}
                onClick={() => setSelectedStop(stop)}
                position={{ lat: stop.lat, lng: stop.lon }}
                title={stop.name}
                zIndex={focused ? 1 : 0}
              />
            );
          })}
          {selectedStop ? (
            // A compact label instead of Google's InfoWindow, whose close button overlapped the name.
            <OverlayViewF getPixelPositionOffset={labelOffset} mapPaneName={OVERLAY_MOUSE_TARGET} position={{ lat: selectedStop.lat, lng: selectedStop.lon }}>
              <div
                aria-label={onOpenStop ? `Open ${selectedStop.name}` : undefined}
                onClick={onOpenStop ? (event) => {
                  event.stopPropagation();
                  onOpenStop(selectedStop);
                } : undefined}
                // Google's map listens below React's root, so a tap here would also reach the map
                // (closing the label before it can open the stop) unless the map is told to skip it.
                ref={(element) => {
                  if (element) google.maps.OverlayView.preventMapHitsAndGesturesFrom(element);
                }}
                role={onOpenStop ? 'button' : undefined}
                style={{
                  cursor: onOpenStop ? 'pointer' : 'default',
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: '#FFFFFF',
                  boxShadow: '0 2px 8px rgba(22, 50, 79, 0.24)',
                  border: `2px solid ${color}`,
                  color: '#1F2937',
                  fontFamily: 'Nunito_800ExtraBold, Nunito, sans-serif',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedStop.name}
                {onOpenStop ? <span style={{ marginLeft: 6, color }}>›</span> : null}
              </div>
            </OverlayViewF>
          ) : null}
          {userLocation ? <HeadingBeamMarker coordinate={userLocation} /> : null}
          {userLocation ? (
            // Same blue "you are here" dot as the home map.
            <Marker
              clickable={false}
              icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: colors.location, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }}
              position={{ lat: userLocation.latitude, lng: userLocation.longitude }}
              title="Your location"
              zIndex={3}
            />
          ) : null}
          {arrow && (zoom || FOCUS_ZOOM) >= arrowZoom - 1 ? (
            // Which way the line runs, beside it just past the rider's stop (web maps stay north-up).
            <OverlayViewF getPixelPositionOffset={arrowOffset} mapPaneName={OVERLAY_LAYER} position={{ lat: arrow.point.lat, lng: arrow.point.lon }}>
              <View pointerEvents="none" style={{ width: DIRECTION_ARROW_BOX, height: DIRECTION_ARROW_BOX, transform: [{ rotate: `${arrow.bearing}deg` }] }} testID="route-direction-arrow">
                <DirectionArrow color={color} />
              </View>
            </OverlayViewF>
          ) : null}
          {shownVehicles.map((vehicle) => {
            // Built once per refresh, not per glide frame, so the marker never redraws its icon mid-slide.
            const icon = {
              url: vehicleIconUrl(color, vehicle.updatedAt != null ? formatAge(now - vehicle.updatedAt) : null),
              scaledSize: new google.maps.Size(VEHICLE_BOX, VEHICLE_BOX),
              // Anchor on the circle's center, not the badge-inclusive box's.
              anchor: new google.maps.Point(VEHICLE_SIZE / 2, VEHICLE_BOX - VEHICLE_SIZE / 2),
            };
            // Each vehicle glides to its refreshed spot rather than jumping there.
            return (
              <Glide key={vehicle.tripId} lat={vehicle.lat} lon={vehicle.lon}>
                {(point) => <Marker icon={icon} position={{ lat: point.lat, lng: point.lon }} title={vehicleLabel} zIndex={2} />}
              </Glide>
            );
          })}
        </GoogleMap>
      ) : null}
    </View>
  );
}
