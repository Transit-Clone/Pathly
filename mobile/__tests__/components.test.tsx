import { fireEvent, render } from '@testing-library/react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { Animated, processColor, StyleSheet, Text } from 'react-native';

import { Icon } from '../src/components/Icon';
import { LiveSignal } from '../src/components/LiveSignal';
import { MapBackdrop, fitMap } from '../src/components/MapBackdrop';
import { PressableScale } from '../src/components/PressableScale';
import { AppSettingsProvider } from '../src/theme/AppSettings';
import { ScreenTransition } from '../src/theme/motion';
import { darkColors, lightColors } from '../src/theme/colors';
import { RouteBadge, transitModeForAgency } from '../src/components/RouteBadge';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

describe('Icon', () => {
  it('renders the solid glyph for a filled toggle and stays hidden from accessibility', () => {
    const screen = render(
      <>
        <Icon name="favorite" testID="outline" />
        <Icon filled={true} name="favorite" testID="filled" />
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
    expect(bus).toMatchObject({ height: 46, borderRadius: 12 });
    expect(rail).toMatchObject({ height: 46, borderRadius: 4 });
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
