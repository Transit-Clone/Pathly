/* eslint-disable @typescript-eslint/no-require-imports -- Jest's hoisted mock factory cannot use module-scope imports. */
import { fireEvent, render } from '@testing-library/react-native';

import { GoogleMapView as NativeGoogleMapView } from '../src/components/GoogleMapView.native';
import { GoogleMapView as WebGoogleMapView } from '../src/components/GoogleMapView.web';
import { placeFromName, placeToLocation, type SavedLocation } from '../src/data/userData';
import { AppSettingsProvider } from '../src/theme/AppSettings';
import { MAP_EXPLORATION_BOUNDS, SERVICE_AREA_BOUNDS } from '../src/data/serviceArea';

jest.mock('@react-google-maps/api', () => {
  const { View } = require('react-native');
  const GoogleMap = ({ children, ...props }: { children: React.ReactNode }) => <View {...props} testID="web-google-map">{children}</View>;
  const Marker = (props: { title?: string }) => (
    <View
      {...props}
      testID={props.title === 'Your location' ? 'web-rider-marker' : `web-${props.title}`}
    />
  );
  const Rectangle = (props: object) => <View {...props} testID="web-service-area" />;
  return { GoogleMap, Marker, Rectangle, useJsApiLoader: () => ({ isLoaded: true }) };
});

const WORK_PLACE = { id: 'work-place', title: 'Work', subtitle: '123 Main St', location: { latitude: 40.75, longitude: -73.99 } };
const savedWork: SavedLocation = { id: 'work-place', address: placeToLocation(WORK_PLACE, 'Destination'), dateSaved: null };
const unresolved: SavedLocation = { id: 'name%3AFuture', address: placeToLocation(placeFromName('Future'), 'Destination'), dateSaved: null };

function settings(child: React.ReactNode) {
  return <AppSettingsProvider>{child}</AppSettingsProvider>;
}

describe('home map saved-place markers', () => {
  it('allows browsing beyond service coverage and gives web a soft boundary', () => {
    const screen = render(settings(<WebGoogleMapView location={{ latitude: 40.7, longitude: -73.9 }} />));
    expect(screen.getByTestId('web-google-map').props.options).toMatchObject({ restriction: { latLngBounds: MAP_EXPLORATION_BOUNDS, strictBounds: false }, minZoom: 8 });
    expect(MAP_EXPLORATION_BOUNDS.north).toBeGreaterThan(SERVICE_AREA_BOUNDS.north);
    expect(MAP_EXPLORATION_BOUNDS.south).toBeLessThan(SERVICE_AREA_BOUNDS.south);
    expect(MAP_EXPLORATION_BOUNDS.east).toBeGreaterThan(SERVICE_AREA_BOUNDS.east);
    expect(MAP_EXPLORATION_BOUNDS.west).toBeLessThan(SERVICE_AREA_BOUNDS.west);
  });
  beforeAll(() => {
    class Point { constructor(public x: number, public y: number) {} }
    Object.assign(globalThis, { google: { maps: { Point, SymbolPath: { CIRCLE: 'circle' } } } });
  });

  it('renders only routable saved places on native and opens the selected place', () => {
    const onSavedLocationPress = jest.fn();
    const screen = render(settings(
      <NativeGoogleMapView
        location={{ latitude: 40.7, longitude: -73.9 }}
        onSavedLocationPress={onSavedLocationPress}
        savedLocations={[savedWork, unresolved]}
      />,
    ));

    const marker = screen.getByTestId('saved-place-marker-work-place', { includeHiddenElements: true });
    expect(marker.props.coordinate).toEqual(WORK_PLACE.location);
    expect(marker.props.accessibilityLabel).toBe('Plan a trip to Work, 123 Main St');
    // A round badge centered on the place, as Google Maps marks one.
    expect(marker.props.anchor).toEqual({ x: 0.5, y: 0.5 });
    expect(screen.queryByTestId('saved-place-marker-name%3AFuture', { includeHiddenElements: true })).toBeNull();
    fireEvent.press(marker);
    expect(onSavedLocationPress).toHaveBeenCalledWith(savedWork, [savedWork]);
  });

  it('renders only routable saved places on web and opens the selected place', () => {
    const onSavedLocationPress = jest.fn();
    const screen = render(settings(
      <WebGoogleMapView
        location={{ latitude: 40.7, longitude: -73.9 }}
        onSavedLocationPress={onSavedLocationPress}
        savedLocations={[savedWork, unresolved]}
      />,
    ));

    const marker = screen.getByTestId('web-Plan a trip to Work, 123 Main St', { includeHiddenElements: true });
    expect(marker.props.position).toEqual({ lat: 40.75, lng: -73.99 });
    expect(marker.props.icon.url).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(marker.props.icon.url)).toContain('fill="#0B4F9C"');
    expect(marker.props.icon.anchor).toEqual({ x: 15, y: 15 });
    expect(marker.props.options).toEqual({ optimized: false });
    expect(screen.queryByTestId('web-Plan a trip to Future', { includeHiddenElements: true })).toBeNull();
    fireEvent(marker, 'click');
    expect(onSavedLocationPress).toHaveBeenCalledWith(savedWork, [savedWork]);
  });
});
