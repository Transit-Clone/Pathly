/* eslint-disable @typescript-eslint/no-require-imports -- Jest's hoisted mock factory cannot use module-scope imports. */
import { render } from '@testing-library/react-native';

import { GoogleMapView as WebGoogleMapView } from '../src/components/GoogleMapView.web';
import { metersPerPixelAtZoom, metersPerPixelForSpan, savedPinSvgUrl, stackSavedPins } from '../src/data/savedPlacePin';
import { placeToLocation, type SavedLocation } from '../src/data/userData';
import { AppSettingsProvider } from '../src/theme/AppSettings';

jest.mock('@react-google-maps/api', () => {
  const { View } = require('react-native');
  const GoogleMap = ({ children, ...props }: { children: React.ReactNode }) => <View {...props} testID="web-google-map">{children}</View>;
  const Marker = (props: { title?: string }) => <View {...props} testID={props.title === 'Your location' ? 'web-rider-marker' : `web-${props.title}`} />;
  const Rectangle = (props: object) => <View {...props} testID="web-service-area" />;
  return { GoogleMap, Marker, Rectangle, useJsApiLoader: () => ({ isLoaded: true }) };
});

// Two places about 300 m apart in Midtown, and one in Brooklyn.
const HOME = { latitude: 40.7549, longitude: -73.984 };
const GYM = { latitude: 40.7575, longitude: -73.9855 };
const FAR = { latitude: 40.6782, longitude: -73.9442 };

describe('stackSavedPins', () => {
  it('stacks pins that would collide at a zoomed-out scale onto the first of them', () => {
    const zoomedOut = metersPerPixelAtZoom(11, 40.75); // about 58 m a pixel: a 34 px badge covers ~2 km
    expect(stackSavedPins([HOME, GYM, FAR], zoomedOut)).toEqual([
      { position: HOME, leader: true },
      { position: HOME, leader: false },
      { position: FAR, leader: true },
    ]);
  });

  it('leaves every pin at its own place once zoomed in far enough to part them', () => {
    const zoomedIn = metersPerPixelAtZoom(16, 40.75); // about 1.8 m a pixel
    expect(stackSavedPins([HOME, GYM, FAR], zoomedIn)).toEqual([
      { position: HOME, leader: true },
      { position: GYM, leader: true },
      { position: FAR, leader: true },
    ]);
  });

  it('reads the native map scale from its region span', () => {
    // 0.05 degrees of longitude across a 400 px wide map at New York's latitude: about 10.5 m a pixel.
    expect(metersPerPixelForSpan(0.05, 400, 40.75)).toBeCloseTo(10.54, 1);
  });

  it('draws the pin as one outlined shape', () => {
    const svg = decodeURIComponent(savedPinSvgUrl('#0B4F9C', '#FFFFFF'));
    expect(svg.match(/<(path|circle)\b/g)).toEqual(['<path']);
  });
});

describe('web home map', () => {
  beforeAll(() => {
    class Point { constructor(public x: number, public y: number) {} }
    Object.assign(globalThis, { google: { maps: { Point, SymbolPath: { CIRCLE: 'circle' } } } });
  });

  const saved = (id: string, title: string, location: typeof HOME): SavedLocation => ({
    id,
    address: placeToLocation({ id, title, subtitle: '', location }, 'Destination'),
    dateSaved: null,
  });

  it('draws colliding saved places fully overlapping, with only the top pin\'s icon', () => {
    const screen = render(
      <AppSettingsProvider>
        <WebGoogleMapView initialCamera={{ ...HOME, zoom: 11 }} location={HOME} savedLocations={[saved('home', 'Home', HOME), saved('gym', 'Gym', GYM)]} />
      </AppSettingsProvider>,
    );
    const home = screen.getByTestId('web-Plan a trip to Home');
    const gym = screen.getByTestId('web-Plan a trip to Gym');
    expect(gym.props.position).toEqual(home.props.position);
    expect(home.props.label).toBeDefined();
    expect(gym.props.label).toBeUndefined();
    expect(home.props.zIndex).toBeGreaterThan(gym.props.zIndex);
  });
});
