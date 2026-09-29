import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import App from '../App';
import { routeById, routes } from '../src/data/transit';

const mockUseFonts = jest.fn(() => [true] as [boolean]);

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('@expo-google-fonts/nunito/useFonts', () => ({
  useFonts: () => mockUseFonts(),
}));

describe('Pathly prototype navigation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
    mockUseFonts.mockReturnValue([true]);
  });

  it('shows the Pathly logo while startup fonts are loading', () => {
    mockUseFonts.mockReturnValueOnce([false]);
    const screen = render(<App />);

    expect(screen.getByTestId('loading-screen')).toBeTruthy();
    expect(screen.getByTestId('loading-logo').props.source).toBeTruthy();
    expect(screen.getByLabelText('Pathly is loading')).toBeTruthy();
    expect(screen.queryByText('Where to?')).toBeNull();
  });

  it('renders five selectable routes without contacting a backend', () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const screen = render(<App />);

    expect(screen.getByText('Where to?')).toBeTruthy();
    expect(screen.queryByText('Nearby transit')).toBeNull();
    for (const route of routes) {
      expect(screen.getByTestId(`route-card-${route.id}`)).toBeTruthy();
    }
    expect(screen.getAllByText('minutes')).toHaveLength(10);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps nearby cards at a fixed height without filler space', () => {
    const screen = render(<App />);

    expect(screen.getByTestId('nearby-route-list').props.contentContainerStyle).toBeUndefined();
    for (const route of routes) {
      expect(StyleSheet.flatten(screen.getByTestId(`route-card-${route.id}`).props.style)).toMatchObject({
        height: 104,
      });
    }
  });

  it('shows the two-arc live signal only on live predictions', () => {
    const screen = render(<App />);

    expect(screen.getAllByTestId('live-gps-signal', { includeHiddenElements: true })).toHaveLength(5);
    expect(within(screen.getByTestId('route-card-ronkonkoma-primary')).getByTestId('live-gps-signal', { includeHiddenElements: true })).toBeTruthy();
    expect(within(screen.getByTestId('route-card-ronkonkoma-alternate')).queryByTestId('live-gps-signal', { includeHiddenElements: true })).toBeNull();
  });

  it.each(routes.map((route) => [route.id, route.routeName] as const))(
    'opens shared details for %s and returns home',
    (routeId, routeName) => {
      const screen = render(<App />);
      fireEvent.press(screen.getByTestId(`route-card-${routeId}-primary`));

      expect(screen.getByTestId(`route-detail-${routeId}`)).toBeTruthy();
      expect(screen.getAllByText(routeName).length).toBeGreaterThan(0);
      expect(screen.getByTestId('route-detail-badge')).toBeTruthy();
      fireEvent.press(screen.getByTestId('route-back'));
      expect(screen.getByTestId(`route-card-${routeId}`)).toBeTruthy();
    },
  );

  it('keeps the transit menu in one natural page scroll with a route visible at rest', () => {
    const screen = render(<App />);
    const sheetScroll = screen.getByTestId('nearby-route-list');

    expect(screen.queryByTestId('transit-sheet-handle')).toBeNull();
    expect(sheetScroll.props.onScrollBeginDrag).toBeUndefined();
    expect(sheetScroll.props.onResponderMove).toBeUndefined();
    expect(sheetScroll.props.bounces).toBe(false);
    expect(sheetScroll.props.overScrollMode).toBe('never');
    expect(StyleSheet.flatten(screen.getByTestId('map-window').props.style).height).toBeGreaterThan(0);
    expect(screen.getByTestId('transit-sheet')).toBeTruthy();
    expect(screen.getByTestId('route-card-ronkonkoma')).toBeTruthy();
    expect(within(sheetScroll).getByTestId('tab-nearby')).toBeTruthy();
    expect(within(sheetScroll).getByTestId('tab-recents')).toBeTruthy();
    expect(within(sheetScroll).getByTestId('tab-favorites')).toBeTruthy();
    expect(screen.getByLabelText('Center on current location')).toBeTruthy();

    fireEvent.scroll(sheetScroll, { nativeEvent: { contentOffset: { y: 120 } } });
    fireEvent.scroll(sheetScroll, { nativeEvent: { contentOffset: { y: 240 } } });
    expect(screen.getByTestId('route-card-7')).toBeTruthy();
  });

  it('keeps the transit sheet height stable while switching tabs', () => {
    const screen = render(<App />);
    const nearbyHeight = StyleSheet.flatten(
      screen.getByTestId('nearby-route-content').props.style,
    ).minHeight;

    fireEvent.scroll(screen.getByTestId('nearby-route-list'), {
      nativeEvent: { contentOffset: { y: 240 } },
    });
    fireEvent.press(screen.getByTestId('tab-recents'));

    expect(screen.getByTestId('recents-route-list')).toBeTruthy();
    expect(
      StyleSheet.flatten(screen.getByTestId('recents-route-content').props.style).minHeight,
    ).toBe(nearbyHeight);

    fireEvent.press(screen.getByTestId('tab-favorites'));
    expect(screen.getByTestId('favorites-route-list')).toBeTruthy();
    expect(
      StyleSheet.flatten(screen.getByTestId('favorites-route-content').props.style).minHeight,
    ).toBe(nearbyHeight);
  });

  it('searches recent addresses with flexible punctuation and keeps results above the keyboard', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '142 christian ave');

    expect(screen.getByTestId('search-result-recent-christian-avenue')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('search-input'), 'ronkonkoma lirr');
    expect(screen.getByTestId('search-result-ronkonkoma-station')).toBeTruthy();
  });

  it('opens route results from search and preserves editable criteria across controls', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    fireEvent.press(screen.getByTestId('search-result-terry-road-smithtown'));

    expect(screen.getByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByDisplayValue('123 Terry Rd')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('origin-input'), 'Stony Brook University');
    fireEvent.changeText(screen.getByTestId('destination-input'), 'Times Square');
    fireEvent.press(screen.getByTestId('swap-endpoints'));
    expect(screen.getByDisplayValue('Times Square')).toBeTruthy();
    expect(screen.getByDisplayValue('Stony Brook University')).toBeTruthy();
    fireEvent.press(screen.getByTestId('swap-endpoints'));
    fireEvent.press(screen.getByTestId('modes-control'));
    fireEvent.press(screen.getByTestId('preference-cheapest'));
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('refresh-results'));

    expect(screen.getByDisplayValue('Stony Brook University')).toBeTruthy();
    expect(screen.getByDisplayValue('Times Square')).toBeTruthy();
    expect(screen.getByText('Leave: 10:30')).toBeTruthy();
    expect(screen.getByText('Updated now · 1')).toBeTruthy();
    expect(screen.getByTestId('preference-cheapest').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getAllByTestId(/^itinerary-/)).toHaveLength(4);
    expect(screen.queryByText('View trip')).toBeNull();
    expect(screen.queryByText('Tap for trip details')).toBeNull();

    fireEvent.press(screen.getByTestId('results-back'));
    expect(screen.getByTestId('search-view')).toBeTruthy();
  });

  it('starts and ends a searched trip from its result card and detail screen', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    fireEvent.press(screen.getByTestId('search-result-terry-road-smithtown'));
    fireEvent.changeText(screen.getByTestId('destination-input'), 'Times Square');

    fireEvent.press(screen.getByTestId('search-result-view-rail-fast'));
    expect(screen.getByTestId('search-trip-detail-rail-fast')).toBeTruthy();
    expect(screen.getByTestId('search-trip-destination').props.children).toBe('Times Square');
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByTestId('search-trip-go')).toBeTruthy();

    fireEvent.press(screen.getByTestId('search-trip-back'));
    expect(screen.getByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByDisplayValue('Times Square')).toBeTruthy();

    fireEvent.press(screen.getByTestId('search-result-go-rail-fast'));
    expect(screen.getByText('ACTIVE TRIP')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByTestId('search-trip-end')).toBeTruthy();

    fireEvent.press(screen.getByTestId('search-trip-back'));
    expect(screen.getByTestId('search-result-end-rail-fast')).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-result-end-rail-fast'));
    expect(screen.getByTestId('search-result-go-rail-fast')).toBeTruthy();

    fireEvent.press(screen.getByTestId('search-result-view-rail-fast'));
    fireEvent.press(screen.getByTestId('search-trip-go'));
    fireEvent.press(screen.getByTestId('search-trip-end'));
    expect(screen.getByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByTestId('search-result-go-rail-fast')).toBeTruthy();
  });

  it('opens recent trip details and returns home with Recents selected', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('tab-recents'));
    expect(screen.getByText('Penn Station')).toBeTruthy();
    expect(screen.getByText('Times Square')).toBeTruthy();
    expect(screen.getByText('Patchogue Station')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-penn-station'));
    expect(screen.getByTestId('recent-trip-detail-penn-station')).toBeTruthy();
    expect(screen.queryByTestId('route-results-view')).toBeNull();
    expect(screen.getByTestId('recent-trip-destination').props.children).toBe('Penn Station');
    expect(screen.getByText('From Stony Brook University')).toBeTruthy();
    expect(screen.getByText('Ronkonkoma Branch')).toBeTruthy();
    expect(screen.getByTestId('recent-trip-go')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-back'));
    expect(screen.getByTestId('tab-recents').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('recent-trip-penn-station')).toBeTruthy();
    expect(screen.queryByTestId('recent-trip-detail-penn-station')).toBeNull();
  });

  it('starts and ends a recent trip from both Go buttons', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('tab-recents'));

    fireEvent.press(screen.getByTestId('recent-trip-go-penn-station'));
    expect(screen.getByTestId('recent-trip-detail-penn-station')).toBeTruthy();
    expect(screen.getByText('ACTIVE TRIP')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByTestId('recent-trip-end')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-back'));
    expect(screen.getByTestId('tab-recents').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('recent-trip-end-penn-station')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-end-penn-station'));
    expect(screen.getByTestId('recent-trip-go-penn-station')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-penn-station'));
    fireEvent.press(screen.getByTestId('recent-trip-go'));
    expect(screen.getByTestId('recent-trip-end')).toBeTruthy();
    expect(screen.getByText('Started now')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-end'));
    expect(screen.getByTestId('recent-trip-penn-station')).toBeTruthy();
    expect(screen.getByTestId('tab-recents').props.accessibilityState).toEqual({ selected: true });
  });

  it('opens profile settings and keeps sign out local', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('profile-trigger'));

    expect(screen.getByTestId('profile-view')).toBeTruthy();
    expect(screen.getByText('Account details')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sign-out'));
    expect(screen.getByText(/Firebase Authentication is added/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('profile-back'));
    expect(screen.getByTestId('profile-trigger')).toBeTruthy();
  });

  it('keeps route stop timing and live provenance accessible', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));

    expect(screen.getByLabelText('4 minutes, live GPS prediction')).toBeTruthy();
    expect(screen.getByLabelText('18 minutes, scheduled time')).toBeTruthy();
    expect(screen.getByLabelText('Stony Brook, departs 10:04 AM')).toBeTruthy();
    expect(screen.getByLabelText('Northport, arrives 10:34 AM')).toBeTruthy();
    expect(routeById.ronkonkoma.stops).toHaveLength(5);
  });

  it('moves route details vertically and pages between route directions', () => {
    jest.useFakeTimers();
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));

    const handle = screen.getByTestId('route-sheet-handle');
    expect(handle.props.accessibilityValue).toEqual({ text: 'compact' });
    act(() => {
      fireEvent.press(handle);
      jest.runAllTimers();
    });
    expect(screen.getByTestId('route-sheet-handle').props.accessibilityValue).toEqual({ text: 'expanded' });

    fireEvent(screen.getByTestId('route-direction-pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 354, y: 0 } },
    });
    expect(screen.getByText('Ronkonkoma')).toBeTruthy();
    expect(screen.queryByText('Eastbound to Ronkonkoma')).toBeNull();

    act(() => {
      fireEvent.press(screen.getByTestId('route-sheet-handle'));
      jest.runAllTimers();
    });
    expect(screen.getByTestId('route-sheet-handle').props.accessibilityValue).toEqual({ text: 'minimized' });

    act(() => {
      fireEvent(screen.getByTestId('route-sheet-scroll'), 'scrollBeginDrag');
      jest.runAllTimers();
    });
    expect(screen.getByTestId('route-sheet-handle').props.accessibilityValue).toEqual({ text: 'expanded' });
  });
});
