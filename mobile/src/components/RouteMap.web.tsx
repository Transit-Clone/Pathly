import { GoogleMap, Marker, OverlayViewF, OVERLAY_MOUSE_TARGET, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '../data/googleMapsLoaderConfig';
import { formatAge, visibleTrains } from '../data/liveTrains';
import { googleMapStyle } from '../data/mapStyle';
import { bearingToNextStop, splitIndexAtStop } from '../data/routeDirection';
import type { RouteLiveVehicle } from '../data/transitLive';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useNow } from '../hooks/useNow';
import { useTheme } from '../theme/AppSettings';
import type { TransitMode } from './RouteBadge';

type GeometryStop = { stopId?: string; name: string; lat: number; lon: number };

const containerStyle = { width: '100%', height: '100%' };
// 'greedy': one-finger drag pans on touch browsers and the wheel zooms without holding Ctrl,
// since this map sits in its own uncovered area of the page rather than inside scrolling text.
const baseMapOptions = { disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false };
// Arbitrary point; immediately replaced by fitBounds (or the focus stop) once the map is ready.
const FALLBACK_CENTER = { lat: 40.75, lng: -73.95 };
const FOCUS_ZOOM = 13;
// The line behind the rider's stop (already travelled in this direction) is drawn faint.
const BEHIND_LINE_OPACITY = 0.35;
// Stop dots are exactly as wide as the line (a circle symbol's outer size is 2 × scale + stroke),
// so they sit inside it like beads. Only the rider's own stop is drawn larger, so it stands out.
const LINE_WIDTH = 8;
const STOP_RING = 1.5;
// The direction arrow beside the rider's stop: an arrowhead (tip up at rotation 0) drawn in
// symbol units, anchored below itself so it sits just outside the stop dot, in screen pixels, at
// any zoom. With scale 1.5 its wings start 12 px from the stop's center and its tip is 30 px out.
const DIRECTION_ARROW_PATH = 'M 0 -8 L 6 4 L 0 1 L -6 4 Z';
const DIRECTION_ARROW_SCALE = 1.5;
const DIRECTION_ARROW_ANCHOR_Y = 12;
const STOP_DOT_SCALE = (LINE_WIDTH - STOP_RING) / 2;

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
  /** Incremented by the location button; each change centers the map on `userLocation`. */
  centerOnUserRequest?: number;
  color: string;
  /** GTFS direction_id to show vehicles for; all directions when omitted. */
  directionId?: number;
  /** Stop to open zoomed on and emphasize (the rider's nearest), matched by stopId. */
  focusStopId?: string;
  /** Vehicle label (train vs bus). */
  mode?: TransitMode;
  /** Called when the rider drags the map, so the location button can drop its selected state. */
  onUserPan?: () => void;
  /** Detailed track geometry when known (e.g. GTFS shapes); otherwise the line joins the stops. */
  path?: readonly { lat: number; lon: number }[];
  stops: readonly GeometryStop[];
  testID?: string;
  /** Rider's real location; omitted while only the fallback is known. */
  userLocation?: Coordinates;
  vehicles: readonly RouteLiveVehicle[];
};

/** Real route map: actual stop positions, the real line, and live vehicles — for any route with a live feed. */
export function RouteMap({ centerOnUserRequest = 0, color, directionId, focusStopId, mode = 'rail', onUserPan, path, stops, testID = 'route-map', userLocation, vehicles }: RouteMapProps) {
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  // Places hidden, and recolored in the dark theme (see mapStyle.ts).
  const { isDark } = useTheme();
  const mapOptions = useMemo(() => ({ ...baseMapOptions, styles: googleMapStyle(isDark) }), [isDark]);
  const [selectedStop, setSelectedStop] = useState<GeometryStop | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const riderMovedMap = useRef(false);
  // True from a location-button press until the rider drags: keeps following fresh GPS fixes.
  const followRider = useRef(false);
  const now = useNow(1000);
  const shownVehicles = visibleTrains(vehicles, directionId, now);
  const vehicleLabel = mode === 'bus' ? 'Bus' : 'Train';
  const focusStop = focusStopId ? stops.find((stop) => stop.stopId === focusStopId) : undefined;

  // Split at the rider's stop: faint behind it, full strength ahead, with an arrow toward the next stop.
  const line = useMemo(() => {
    const points = path ?? stops;
    const toPath = (part: readonly { lat: number; lon: number }[]) => part.map((point) => ({ lat: point.lat, lng: point.lon }));
    const focusIndex = focusStop ? stops.indexOf(focusStop) : -1;
    if (focusIndex < 0) return { behind: [], ahead: toPath(points), focusIndex, bearing: null };
    const split = splitIndexAtStop(points, stops, focusIndex);
    return { behind: toPath(points.slice(0, split + 1)), ahead: toPath(points.slice(split)), focusIndex, bearing: bearingToNextStop(stops, focusIndex) };
  }, [focusStop, path, stops]);
  const polylineOptions = useMemo(() => ({ strokeColor: color, strokeWeight: LINE_WIDTH, zIndex: 1 }), [color]);
  const behindPolylineOptions = useMemo(() => ({ strokeColor: color, strokeOpacity: BEHIND_LINE_OPACITY, strokeWeight: LINE_WIDTH, zIndex: 0 }), [color]);

  // Opens on the rider's nearest stop when known, otherwise fits every stop with some breathing room.
  const onLoad = useCallback((loadedMap: google.maps.Map) => {
    setMap(loadedMap);
    if (focusStop) {
      loadedMap.setCenter({ lat: focusStop.lat, lng: focusStop.lon });
      loadedMap.setZoom(FOCUS_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const stop of stops) bounds.extend({ lat: stop.lat, lng: stop.lon });
    loadedMap.fitBounds(bounds, 32);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot camera setup on load
  }, [stops]);

  // The nearest stop often resolves after the page opens; follow it until the rider drags.
  useEffect(() => {
    if (!map || !focusStop || riderMovedMap.current) return;
    map.panTo({ lat: focusStop.lat, lng: focusStop.lon });
    if ((map.getZoom() ?? 0) < FOCUS_ZOOM) map.setZoom(FOCUS_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stop's identity, not the stops array
  }, [map, focusStop?.stopId]);

  useEffect(() => {
    if (centerOnUserRequest === 0) return;
    followRider.current = true;
    riderMovedMap.current = true; // the nearest-stop focus must not pull the map back
  }, [centerOnUserRequest]);

  useEffect(() => {
    if (!followRider.current || !map || !userLocation) return;
    map.panTo({ lat: userLocation.latitude, lng: userLocation.longitude });
    if ((map.getZoom() ?? 0) < FOCUS_ZOOM) map.setZoom(FOCUS_ZOOM);
  }, [centerOnUserRequest, map, userLocation]);

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
          onUnmount={() => setMap(null)}
          options={mapOptions}
          zoom={9}
        >
          {line.behind.length > 1 ? <Polyline options={behindPolylineOptions} path={line.behind} /> : null}
          <Polyline options={polylineOptions} path={line.ahead} />
          {line.bearing != null && focusStop ? (
            // One arrow right beside the rider's stop, pointing at the next stop.
            <Marker
              clickable={false}
              icon={{
                path: DIRECTION_ARROW_PATH,
                scale: DIRECTION_ARROW_SCALE,
                rotation: line.bearing,
                anchor: new google.maps.Point(0, DIRECTION_ARROW_ANCHOR_Y),
                fillColor: color,
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2,
              }}
              position={{ lat: focusStop.lat, lng: focusStop.lon }}
              zIndex={3}
            />
          ) : null}
          {stops.map((stop, stopIndex) => {
            const focused = stop === focusStop;
            // Stops behind the rider's stop in this direction fade with the line behind it.
            const passed = line.focusIndex >= 0 && stopIndex < line.focusIndex;
            return (
              <Marker
                key={`${stop.stopId ?? stop.name}-${stopIndex}`}
                // A circle symbol is centered on its position by definition, unlike a pin. The
                // rider's nearest stop is larger and filled, with a white ring.
                icon={focused
                  ? { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: color, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }
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
                style={{
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
              </div>
            </OverlayViewF>
          ) : null}
          {userLocation ? (
            // Same blue "you are here" dot as the home map.
            <Marker
              clickable={false}
              icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2 }}
              position={{ lat: userLocation.latitude, lng: userLocation.longitude }}
              title="Your location"
              zIndex={3}
            />
          ) : null}
          {shownVehicles.map((vehicle) => (
            <Marker
              key={vehicle.tripId}
              icon={{
                url: vehicleIconUrl(color, vehicle.updatedAt != null ? formatAge(now - vehicle.updatedAt) : null),
                scaledSize: new google.maps.Size(VEHICLE_BOX, VEHICLE_BOX),
                // Anchor on the circle's center, not the badge-inclusive box's.
                anchor: new google.maps.Point(VEHICLE_SIZE / 2, VEHICLE_BOX - VEHICLE_SIZE / 2),
              }}
              position={{ lat: vehicle.lat, lng: vehicle.lon }}
              title={vehicleLabel}
              zIndex={2}
            />
          ))}
        </GoogleMap>
      ) : null}
    </View>
  );
}
