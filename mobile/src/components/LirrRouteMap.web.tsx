import { GoogleMap, Marker, OverlayViewF, OVERLAY_MOUSE_TARGET, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_SCRIPT_ID } from '../data/googleMapsLoaderConfig';
import type { LirrVehicle } from '../data/lirrLive';
import { formatAge, visibleTrains } from '../data/liveTrains';
import type { LiveStop } from '../data/nearestStop';
import { PORT_JEFFERSON_STOPS } from '../data/portJeffersonGeometry';
import { PORT_JEFFERSON_SHAPE } from '../data/portJeffersonShape';
import type { Coordinates } from '../hooks/useCurrentLocation';
import { useNow } from '../hooks/useNow';

// Whole branch, used until a focus stop is known; street level around the rider's nearest station.
const BRANCH_ZOOM = 9;
const BRANCH_CENTER = { lat: 40.82, lng: -73.52 };
const FOCUS_ZOOM = 13;
const containerStyle = { width: '100%', height: '100%' };
// Real track geometry (GTFS shapes), not straight lines between stations.
const ROUTE_PATH = PORT_JEFFERSON_SHAPE.map((point) => ({ lat: point.lat, lng: point.lon }));
// 'greedy': one-finger drag pans on touch browsers and the wheel zooms without holding Ctrl,
// since this map sits in its own uncovered area of the page rather than inside scrolling text.
const mapOptions = { disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false };

type LirrStop = (typeof PORT_JEFFERSON_STOPS)[number];

// Train marker geometry: square at bottom-left of a larger box so the age badge can overhang its top-right.
const TRAIN_SIZE = 34;
const TRAIN_BOX = 46;

/**
 * Rounded square with a train glyph (a different shape from the round stop dots, so a train
 * can't be mistaken for a station), plus a white age badge at its top-right, as an SVG data URL.
 */
function trainIconUrl(color: string, age: string | null) {
  const s = TRAIN_SIZE;
  const top = TRAIN_BOX - s;
  const badge = age
    ? `<circle cx="34" cy="12" r="11" fill="#FFFFFF" stroke="${color}" stroke-width="1.5"/>
<text x="34" y="15.2" text-anchor="middle" font-family="Nunito, Arial, sans-serif" font-weight="800" font-size="9" fill="#1F2937">${age}</text>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TRAIN_BOX}" height="${TRAIN_BOX}" viewBox="0 0 ${TRAIN_BOX} ${TRAIN_BOX}">
<rect x="1" y="${top + 1}" width="${s - 2}" height="${s - 2}" rx="9" fill="${color}" stroke="#FFFFFF" stroke-width="2"/>
<g transform="translate(${s / 2 - 7} ${top + s / 2 - 9})">
<rect x="0" y="0" width="14" height="14" rx="3.5" fill="#FFFFFF"/>
<rect x="2.2" y="2.6" width="9.6" height="5" rx="1.2" fill="${color}"/>
<circle cx="3.6" cy="11" r="1.3" fill="${color}"/><circle cx="10.4" cy="11" r="1.3" fill="${color}"/>
<path d="M2.4 14.6 L0.6 17.6 M11.6 14.6 L13.4 17.6" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
</g>${badge}
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Places the stop label's bottom-center just above the dot. */
const labelOffset = (width: number, height: number) => ({ x: -width / 2, y: -height - 12 });

type LirrRouteMapProps = {
  /** Incremented by the location button; each change centers the map on `userLocation`. */
  centerOnUserRequest?: number;
  color: string;
  /** GTFS direction_id to show trains for; all directions when omitted. */
  directionId?: number;
  /** Station to open zoomed on and emphasize (the rider's nearest). */
  focusStop?: LiveStop;
  /** Called when the rider drags the map, so the location button can drop its selected state. */
  onUserPan?: () => void;
  testID?: string;
  /** Rider's real location; omitted while only the fallback is known. */
  userLocation?: Coordinates;
  vehicles: readonly LirrVehicle[];
};

/** Real Port Jefferson Branch map: actual station positions, the real line, and live trains. */
export function LirrRouteMap({ centerOnUserRequest = 0, color, directionId, focusStop, onUserPan, testID = 'lirr-route-map', userLocation, vehicles }: LirrRouteMapProps) {
  const { isLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const [selectedStop, setSelectedStop] = useState<LirrStop | null>(null);
  const [riderMovedMap, setRiderMovedMap] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  // True from a location-button press until the rider drags: keeps following fresh GPS fixes.
  const followRider = useRef(false);
  const now = useNow(1000);
  const trains = visibleTrains(vehicles, directionId, now);

  // Follows the nearest station (GPS often resolves after the page opens) until the rider drags.
  // Keyed on the stop's name so re-renders don't keep snapping the map back.
  // Once the rider asks for their own location, the nearest-station focus stops applying.
  const focusName = riderMovedMap || centerOnUserRequest > 0 ? null : focusStop?.name;
  const center = useMemo(() => {
    const stop = PORT_JEFFERSON_STOPS.find((candidate) => candidate.name === focusName);
    return stop ? { lat: stop.lat, lng: stop.lon } : undefined;
  }, [focusName]);
  const [initialZoom] = useState(() => (focusStop ? FOCUS_ZOOM : BRANCH_ZOOM));

  useEffect(() => {
    if (centerOnUserRequest > 0) followRider.current = true;
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
          center={center ?? (riderMovedMap || centerOnUserRequest > 0 ? undefined : BRANCH_CENTER)}
          mapContainerStyle={containerStyle}
          onClick={() => setSelectedStop(null)}
          onDragStart={() => {
            setRiderMovedMap(true);
            followRider.current = false;
            onUserPan?.();
          }}
          onLoad={setMap}
          onUnmount={() => setMap(null)}
          options={mapOptions}
          zoom={initialZoom}
        >
          <Polyline options={{ strokeColor: color, strokeWeight: 4 }} path={ROUTE_PATH} />
          {PORT_JEFFERSON_STOPS.map((stop) => {
            const focused = stop.name === focusStop?.name;
            return (
              <Marker
                key={stop.name}
                // A circle symbol is centered on its position by definition, unlike a pin. The
                // rider's nearest station is larger and filled, with a white ring.
                icon={focused
                  ? { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: color, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 }
                  : { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#FFFFFF', fillOpacity: 1, strokeColor: color, strokeWeight: 3 }}
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
          {trains.map((vehicle) => (
            <Marker
              key={vehicle.tripId}
              icon={{
                url: trainIconUrl(color, vehicle.updatedAt != null ? formatAge(now - vehicle.updatedAt) : null),
                scaledSize: new google.maps.Size(TRAIN_BOX, TRAIN_BOX),
                // Anchor on the square's center, not the badge-inclusive box's.
                anchor: new google.maps.Point(TRAIN_SIZE / 2, TRAIN_BOX - TRAIN_SIZE / 2),
              }}
              position={{ lat: vehicle.lat, lng: vehicle.lon }}
              title="Train"
              zIndex={2}
            />
          ))}
        </GoogleMap>
      ) : null}
    </View>
  );
}
