import { act, fireEvent, render } from '@testing-library/react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { Animated, Platform, processColor, StyleSheet, Text } from 'react-native';

import { Icon } from '../src/components/Icon';
import { LiveSignal } from '../src/components/LiveSignal';
import { MapBackdrop, fitMap } from '../src/components/MapBackdrop';
import { PressableScale } from '../src/components/PressableScale';
import { NearbySkeleton } from '../src/components/Skeleton';
import { TransitCard } from '../src/components/TransitCard';
import { routeById, type RouteDetail } from '../src/data/transit';
import { AppSettingsProvider } from '../src/theme/AppSettings';
import { ScreenTransition } from '../src/theme/motion';
import { darkColors, lightColors } from '../src/theme/colors';
import { badgeLabel, RouteBadge, transitModeForAgency } from '../src/components/RouteBadge';
import { RouteMap } from '../src/components/RouteMap';
import { SavedPlacesStrip } from '../src/components/SavedPlacesStrip';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

describe('Icon', () => {
  it('renders the solid glyph for a filled toggle and stays hidden from accessibility', () => {
    const screen = render(
      <>
        <Icon filled={false} name="favorite" testID="outline" />
        <Icon name="favorite" testID="filled" />
      </>,
    );

    const outline = screen.getByTestId('outline', { includeHiddenElements: true });
    const filled = screen.getByTestId('filled', { includeHiddenElements: true });
    expect(outline.props.children).toBe('star-outline');
    expect(filled.props.children).toBe('star');
    expect(screen.queryByTestId('outline')).toBeNull();
  });
});

describe('RouteBadge', () => {
  it('maps agencies to transit modes', () => {
    expect(transitModeForAgency('MTA Subway')).toBe('subway');
    expect(transitModeForAgency('LIRR')).toBe('rail');
    expect(transitModeForAgency('Suffolk County Transit')).toBe('bus');
    expect(transitModeForAgency('MTA Bus')).toBe('bus');
    expect(transitModeForAgency('NYC Ferry')).toBe('ferry');
    expect(transitModeForAgency('Staten Island Ferry')).toBe('ferry');
  });

  it('draws a ferry as the shared text badge, announced as a ferry', () => {
    const screen = render(<RouteBadge agency="NYC Ferry" color="#00839C" shortName="ER" size="large" testID="ferry" />);
    const badge = screen.getByTestId('ferry');
    expect(badge.props.accessibilityLabel).toBe('ER ferry');
    expect(StyleSheet.flatten(badge.props.style).borderRadius).toBe(18);
    expect(screen.queryByText('boat', { includeHiddenElements: true })).toBeNull();
  });

  it.each([
    ['MTA Subway', 'E', 'E train'],
    ['Suffolk County Transit', 'S1', 'S1 bus'],
    ['LIRR', 'R', 'R rail'],
  ])('announces %s badges by short name and mode', (agency, shortName, label) => {
    const screen = render(<RouteBadge agency={agency} color="#123456" shortName={shortName} testID="badge" />);
    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('uses a circle for subway, a rounded square for bus, and a tag for rail', () => {
    const screen = render(
      <>
        <RouteBadge agency="MTA Subway" color="#000" shortName="E" size="large" testID="subway" />
        <RouteBadge agency="Suffolk County Transit" color="#000" shortName="51" size="large" testID="bus" />
        <RouteBadge agency="LIRR" color="#000" shortName="R" size="large" testID="rail" />
      </>,
    );
    const subway = StyleSheet.flatten(screen.getByTestId('subway').props.style);
    const bus = StyleSheet.flatten(screen.getByTestId('bus').props.style);
    const rail = StyleSheet.flatten(screen.getByTestId('rail').props.style);

    expect(subway).toMatchObject({ height: 46, width: 46, borderRadius: 23 });
    expect(bus).toMatchObject({ height: 46, borderRadius: 18 });
    expect(rail).toMatchObject({ height: 46, borderRadius: 18 });
  });
});

describe('MapBackdrop', () => {
  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('draws the %s map land and hides the map from assistive technology', (appearance, palette) => {
    const screen = render(
      <AppSettingsProvider initialAppearance={appearance}>
        <MapBackdrop showUserLocation={true} />
      </AppSettingsProvider>,
    );
    const backdrop = screen.getByTestId('map-backdrop', { includeHiddenElements: true });
    expect(backdrop.props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByTestId('map-land', { includeHiddenElements: true }).props.fill.payload).toBe(processColor(palette.mapLand));
    expect(screen.queryByTestId('map-backdrop')).toBeNull();
    expect(screen.getByTestId('map-user-location', { includeHiddenElements: true })).toBeTruthy();
  });

  it('fits the focus box inside the padded container', () => {
    const { projection } = fitMap({ minX: 100, minY: 100, maxX: 300, maxY: 500 }, 200, 600, { top: 100, bottom: 100 });
    expect(projection.project([200, 300])).toEqual({ x: 100, y: 300 });
    const top = projection.project([200, 100]);
    const bottom = projection.project([200, 500]);
    expect(top.y).toBeGreaterThanOrEqual(100);
    expect(bottom.y).toBeLessThanOrEqual(500);
  });
});

describe('LiveSignal', () => {
  afterEach(() => jest.restoreAllMocks());

  it('blinks each arc separately when motion is allowed', () => {
    const loop = jest.spyOn(Animated, 'loop');
    const screen = render(<AppSettingsProvider><LiveSignal color="#123456" /></AppSettingsProvider>);
    expect(screen.getByTestId('live-gps-signal', { includeHiddenElements: true })).toBeTruthy();
    expect(loop).toHaveBeenCalledTimes(2);
    screen.unmount();
  });

  it('stays fully visible without pulsing when Reduce motion is on', () => {
    const loop = jest.spyOn(Animated, 'loop');
    const screen = render(<AppSettingsProvider initialReducedMotion={true}><LiveSignal /></AppSettingsProvider>);
    expect(loop).not.toHaveBeenCalled();
    for (const arc of [0, 1]) {
      expect(StyleSheet.flatten(screen.getByTestId(`live-gps-arc-${arc}`, { includeHiddenElements: true }).props.style).opacity).toBe(1);
    }
  });
});

describe('loading placeholders', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows three pulsing card-shaped placeholders, announced once as a group', () => {
    const loop = jest.spyOn(Animated, 'loop');
    const screen = render(<AppSettingsProvider><NearbySkeleton /></AppSettingsProvider>);
    const group = screen.getByLabelText('Loading nearby transit');
    expect(group.props.accessible).toBe(true);
    expect(screen.getAllByTestId('nearby-placeholder-card')).toHaveLength(3);
    for (const card of screen.getAllByTestId('nearby-placeholder-card')) {
      expect(StyleSheet.flatten(card.props.style)).toEqual(expect.objectContaining({ height: 104, borderRadius: 20, backgroundColor: lightColors.skeleton }));
    }
    expect(loop).toHaveBeenCalledTimes(1);
    screen.unmount();
  });

  it('fades the placeholders down and back up over time when motion is allowed', () => {
    // Web drives the fade from JS (no native driver), so its opacity can be sampled here.
    jest.replaceProperty(Platform, 'OS', 'web');
    jest.useFakeTimers();
    try {
      const screen = render(<AppSettingsProvider><NearbySkeleton /></AppSettingsProvider>);
      const opacity = () => StyleSheet.flatten(screen.getAllByTestId('nearby-placeholder-card')[0]!.props.style).opacity as number;
      const samples = [opacity()];
      for (let step = 0; step < 16; step += 1) {
        act(() => jest.advanceTimersByTime(100));
        samples.push(opacity());
      }
      expect(samples[0]).toBe(1);
      expect(Math.min(...samples)).toBeLessThan(0.5);
      expect(samples.at(-1)!).toBeGreaterThan(0.95);
      screen.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the dark placeholder gray in dark mode and holds still under Reduce motion', () => {
    const loop = jest.spyOn(Animated, 'loop');
    const screen = render(<AppSettingsProvider initialAppearance="dark" initialReducedMotion={true}><NearbySkeleton /></AppSettingsProvider>);
    expect(loop).not.toHaveBeenCalled();
    for (const card of screen.getAllByTestId('nearby-placeholder-card')) {
      expect(StyleSheet.flatten(card.props.style)).toEqual(expect.objectContaining({ opacity: 1, backgroundColor: darkColors.skeleton }));
    }
  });

  it('fills each card time box with a placeholder while its live times load, and a dash if they fail', () => {
    const base = routeById.ronkonkoma;
    const [first, second] = base.directions;
    const waiting: RouteDetail = { ...base, liveStatus: 'loading', directions: [{ ...first, unavailable: true }, { ...second, unavailable: true }] };
    const screen = render(<AppSettingsProvider><TransitCard onPress={() => undefined} route={waiting} /></AppSettingsProvider>);
    expect(screen.getAllByTestId('transit-time-placeholder').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/Loading live data\.$/).length).toBeGreaterThan(0);

    screen.rerender(<AppSettingsProvider><TransitCard onPress={() => undefined} route={{ ...waiting, liveStatus: 'error' }} /></AppSettingsProvider>);
    expect(screen.queryByTestId('transit-time-placeholder')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('motion', () => {
  afterEach(() => jest.restoreAllMocks());

  it('springs pressables down and back while still firing presses', () => {
    const spring = jest.spyOn(Animated, 'spring');
    const onPress = jest.fn();
    const screen = render(<AppSettingsProvider><PressableScale onPress={onPress} testID="press"><Text>Go</Text></PressableScale></AppSettingsProvider>);
    fireEvent(screen.getByTestId('press'), 'pressIn');
    fireEvent(screen.getByTestId('press'), 'pressOut');
    fireEvent.press(screen.getByTestId('press'));
    expect(spring).toHaveBeenCalledTimes(2);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('skips press and screen animations under Reduce motion', () => {
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    const screen = render(
      <AppSettingsProvider initialReducedMotion={true}>
        <ScreenTransition><PressableScale testID="press"><Text>Go</Text></PressableScale></ScreenTransition>
      </AppSettingsProvider>,
    );
    fireEvent(screen.getByTestId('press'), 'pressIn');
    expect(spring).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
  });

  it('fades screens in when motion is allowed', () => {
    const timing = jest.spyOn(Animated, 'timing');
    render(<AppSettingsProvider><ScreenTransition><Text>Screen</Text></ScreenTransition></AppSettingsProvider>);
    expect(timing).toHaveBeenCalledTimes(1);
  });

  it('draws the pin as a thumbtack glyph', () => {
    const screen = render(<Icon filled={true} name="pin" testID="pin" />);
    expect(screen.getByTestId('pin', { includeHiddenElements: true }).props.children).toBe('pin');
  });
});

describe('RouteMap', () => {
  const stops = [0, 1, 2].map((index) => ({ stopId: String(index), name: `Stop ${index}`, lat: 40.9, lon: -73.2 + index * 0.01 }));

  it('draws one full-strength line and no arrow when the rider has no nearest stop', () => {
    const screen = render(<RouteMap color="#A626AA" stops={stops} vehicles={[]} />);
    const hidden = { includeHiddenElements: true };
    expect(screen.getByTestId('route-line', hidden).props.coordinates).toHaveLength(3);
    expect(screen.queryByTestId('route-line-behind', hidden)).toBeNull();
    expect(screen.queryByTestId('route-direction-arrow', hidden)).toBeNull();
    expect(screen.queryByTestId('route-walk', hidden)).toBeNull();
  });

  it('draws the walk to the stop as a dotted line', () => {
    const walkPath = [{ lat: 40.905, lon: -73.2 }, { lat: 40.902, lon: -73.2 }, { lat: 40.9, lon: -73.2 }];
    const screen = render(<RouteMap color="#A626AA" focusStopId="0" stops={stops} vehicles={[]} walkPath={walkPath} />);
    const walk = screen.getByTestId('route-walk', { includeHiddenElements: true });
    expect(walk.props.coordinates).toEqual(walkPath.map((point) => ({ latitude: point.lat, longitude: point.lon })));
    expect(walk.props.lineDashPattern).toEqual([1, 10]);
  });
});

describe('badgeLabel', () => {
  it('keeps short names and abbreviates long ones', () => {
    expect(badgeLabel({ agency: 'Suffolk County Transit', shortName: '51' })).toBe('51');
    expect(badgeLabel({ agency: 'MTA Subway', shortName: 'E' })).toBe('E');
    expect(badgeLabel({ agency: 'LIRR', shortName: 'Port Jefferson Branch' })).toBe('PJ');
    // NYC DOT publishes no route_short_name, so the ferry's badge is its initials.
    expect(badgeLabel({ agency: 'Staten Island Ferry', shortName: 'Staten Island Ferry' })).toBe('SIF');
    expect(badgeLabel({ agency: 'LIRR', shortName: 'Ronkonkoma Branch' })).toBe('RK');
    expect(badgeLabel({ agency: 'NICE Bus', shortName: 'Roosevelt Field Shuttle Line' })).toBe('RFS');
    // A single route code is shown whole: "S" would read as the S shuttle, not the SIM3C.
    expect(badgeLabel({ agency: 'MTA Bus Company', shortName: 'SIM3C' })).toBe('SIM3C');
    expect(badgeLabel({ agency: 'MTA New York City Transit', shortName: 'Q44-SBS' })).toBe('Q44+');
  });
});

describe('SavedPlacesStrip', () => {
  const place = (id: string, name: string) => ({ id, dateSaved: null, address: { name, streetAddress: `${id} Main St`, coordinates: [40.7, -73.9] as [number, number], type: 'Destination' as const, placeId: id } });

  it('lists saved places by name then address in a sideways row, and opens the tapped one', () => {
    const onSelect = jest.fn();
    const places = [place('a', 'Home'), place('b', 'Work'), place('c', 'Gym')];
    const screen = render(<AppSettingsProvider><SavedPlacesStrip onSelect={onSelect} places={places} /></AppSettingsProvider>);
    expect(screen.getByTestId('search-saved-places').props.horizontal).toBe(true);
    expect(screen.getByLabelText('Home, a Main St')).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-saved-place-b'));
    expect(onSelect).toHaveBeenCalledWith(places[1]);
  });

  it('shows nothing without saved places', () => {
    const screen = render(<AppSettingsProvider><SavedPlacesStrip onSelect={jest.fn()} places={[]} /></AppSettingsProvider>);
    expect(screen.queryByTestId('search-saved-places')).toBeNull();
  });
});
