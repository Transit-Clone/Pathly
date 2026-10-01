import { fireEvent, render, within } from '@testing-library/react-native';
import { signOut } from 'firebase/auth';
import { StyleSheet } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import App from '../App';
import { routeById, routes } from '../src/data/transit';
import { darkColors, lightColors } from '../src/theme/colors';

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
      const destination = screen.getByTestId('route-detail-destination').props.children as string;
      expect(routeById[routeId].directions[0].direction.endsWith(destination)).toBe(true);
      expect(screen.queryByText(routeName === routeById[routeId].shortName ? '__none__' : routeName)).toBeNull();
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
    expect(screen.getByText('Recent')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('search-input'), '142 christian ave');
    expect(screen.getByText('Matches')).toBeTruthy();
    expect(screen.getByTestId('search-match-count').props.children).toMatch(/^\d+ places?$/);

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
    fireEvent.press(screen.getByTestId('filter-control'));
    fireEvent.press(screen.getByTestId('preference-cheapest'));
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-depart'));
    fireEvent.press(screen.getByTestId('leave-time-done'));
    fireEvent.press(screen.getByTestId('refresh-results'));

    expect(screen.getByDisplayValue('Stony Brook University')).toBeTruthy();
    expect(screen.getByDisplayValue('Times Square')).toBeTruthy();
    expect(screen.getByTestId('leave-time-label').props.children).toBe('Depart 10:30 AM');
    expect(screen.getByText('Updated now · 1')).toBeTruthy();
    expect(screen.getByTestId('preference-cheapest').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getAllByTestId(/^itinerary-/)).toHaveLength(4);
    expect(screen.queryByText('View trip')).toBeNull();
    expect(screen.queryByText('Tap for trip details')).toBeNull();

    fireEvent.press(screen.getByTestId('results-back'));
    expect(screen.getByTestId('search-view')).toBeTruthy();
  });

  const openResults = () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    fireEvent.press(screen.getByTestId('search-result-terry-road-smithtown'));
    return screen;
  };

  it('picks a departure time from the wheel and reschedules every itinerary', () => {
    const screen = openResults();
    expect(screen.getByTestId('leave-time-label').props.children).toBe('Leave now');
    expect(screen.getByTestId('schedule-rail-fast').props.children).toBe('Leaves in 4 min · 10:04 AM');

    fireEvent.press(screen.getByTestId('leave-time-control'));
    expect(screen.getByTestId('leave-time-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('leave-mode-depart'));
    fireEvent.press(screen.getByTestId('leave-hour-2'));
    fireEvent.press(screen.getByTestId('leave-minute-15'));
    fireEvent.press(screen.getByTestId('leave-period-pm'));
    expect(screen.getByTestId('leave-time-preview').props.children).toBe('Depart 2:15 PM');
    fireEvent.press(screen.getByTestId('leave-time-done'));

    expect(screen.queryByTestId('leave-time-sheet')).toBeNull();
    expect(screen.getByTestId('leave-time-label').props.children).toBe('Depart 2:15 PM');
    expect(screen.getByTestId('schedule-rail-fast').props.children).toBe('Departs 2:19 PM · Arrives 3:31 PM');

    fireEvent.press(screen.getByTestId('search-result-view-rail-fast'));
    expect(screen.getByTestId('search-trip-leave-time').props.children).toBe('2:19 PM');
    expect(screen.getByTestId('search-trip-arrive-time').props.children).toBe('3:31 PM');
  });

  it('keeps arrive-by itineraries on time and discards a cancelled pick', () => {
    const screen = openResults();
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-arrive'));
    fireEvent.press(screen.getByTestId('leave-time-done'));
    expect(screen.getByTestId('leave-time-label').props.children).toBe('Arrive by 12:00 PM');
    expect(screen.getByTestId('schedule-rail-fast').props.children).toBe('Departs 10:44 AM · Arrives 11:56 AM');

    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-now'));
    fireEvent.press(screen.getByTestId('leave-time-cancel'));
    expect(screen.getByTestId('leave-time-label').props.children).toBe('Arrive by 12:00 PM');
  });

  it('filters itineraries by mode separately from sort preferences', () => {
    const screen = openResults();
    fireEvent.press(screen.getByTestId('modes-control'));
    expect(screen.getByTestId('modes-panel')).toBeTruthy();
    expect(screen.queryByTestId('filter-panel')).toBeNull();

    fireEvent.press(screen.getByTestId('mode-rail'));
    expect(screen.queryByTestId('itinerary-rail-fast')).toBeNull();
    expect(screen.getAllByTestId(/^itinerary-/)).toHaveLength(3);
    expect(screen.getByText('Modes · 2')).toBeTruthy();

    fireEvent.press(screen.getByTestId('filter-control'));
    expect(screen.getByTestId('filter-panel')).toBeTruthy();
    expect(screen.queryByTestId('modes-panel')).toBeNull();
    fireEvent.press(screen.getByTestId('preference-transfers'));
    expect(screen.getByTestId('preference-transfers').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(screen.getByTestId('modes-control'));
    fireEvent.press(screen.getByTestId('mode-subway'));
    expect(screen.getByTestId('results-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('mode-bus'));
    expect(screen.getByTestId('mode-bus').props.accessibilityState).toEqual({ checked: true });
    fireEvent.press(screen.getByTestId('results-reset-modes'));
    expect(screen.getAllByTestId(/^itinerary-/)).toHaveLength(4);
  });

  it('pins and unpins routes in the Nearby list', () => {
    const screen = render(<App />);
    expect(within(screen.getByTestId('pinned-routes')).getByTestId('route-card-ronkonkoma')).toBeTruthy();
    expect(screen.queryByText('PINNED')).toBeNull();
    expect(screen.getByTestId('route-card-ronkonkoma-pinned', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('route-card-e-pinned', { includeHiddenElements: true })).toBeNull();

    fireEvent.press(screen.getByTestId('route-card-51-primary'));
    expect(screen.getByTestId('route-pin').props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(screen.getByTestId('route-pin'));
    expect(screen.getByTestId('route-pin').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('route-back'));

    expect(within(screen.getByTestId('pinned-routes')).getByTestId('route-card-51')).toBeTruthy();
    expect(within(screen.getByTestId('nearby-routes')).queryByTestId('route-card-51')).toBeNull();

    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));
    fireEvent.press(screen.getByTestId('route-pin'));
    fireEvent.press(screen.getByTestId('route-back'));
    expect(within(screen.getByTestId('nearby-routes')).getByTestId('route-card-ronkonkoma')).toBeTruthy();
    for (const route of routes) {
      expect(screen.getAllByTestId(`route-card-${route.id}`)).toHaveLength(1);
    }
    expect(StyleSheet.flatten(screen.getByTestId('nearby-route-content').props.style).minHeight).toBe(5 * 104);
  });

  it('saves favorite routes and trips to the Favorites tab and opens them', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('tab-favorites'));
    expect(screen.getByText('No favorites yet')).toBeTruthy();

    fireEvent.press(screen.getByTestId('tab-nearby'));
    fireEvent.press(screen.getByTestId('route-card-e-primary'));
    fireEvent.press(screen.getByTestId('route-favorite'));
    fireEvent.press(screen.getByTestId('route-back'));

    fireEvent.press(screen.getByTestId('tab-recents'));
    fireEvent.press(screen.getByTestId('recent-trip-times-square'));
    fireEvent.press(screen.getByTestId('recent-trip-favorite'));
    fireEvent.press(screen.getByTestId('recent-trip-back'));
    fireEvent.press(screen.getByTestId('recent-trip-times-square'));
    expect(screen.getByTestId('recent-trip-favorite').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('recent-trip-back'));

    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    fireEvent.press(screen.getByTestId('search-result-terry-road-smithtown'));
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-depart'));
    fireEvent.press(screen.getByTestId('leave-time-done'));
    fireEvent.press(screen.getByTestId('search-result-view-budget'));
    fireEvent.press(screen.getByTestId('search-trip-favorite'));
    fireEvent.press(screen.getByTestId('search-trip-back'));
    fireEvent.press(screen.getByTestId('results-back'));
    fireEvent.press(screen.getByLabelText('Cancel destination search'));

    fireEvent.press(screen.getByTestId('tab-favorites'));
    expect(within(screen.getByTestId('favorite-routes')).getByTestId('route-card-e')).toBeTruthy();
    const trips = screen.getByTestId('favorite-trips');
    expect(within(trips).getByTestId('favorite-trip-recent-times-square')).toBeTruthy();
    expect(within(trips).getByTestId('favorite-trip-planned-budget-123 Terry Rd')).toBeTruthy();
    expect(within(trips).getByText('Depart 10:30 AM')).toBeTruthy();

    fireEvent.press(within(screen.getByTestId('favorite-routes')).getByTestId('route-card-e-primary'));
    expect(screen.getByTestId('route-detail-e')).toBeTruthy();
    expect(screen.getByTestId('route-favorite').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('route-favorite'));
    fireEvent.press(screen.getByTestId('route-back'));
    expect(screen.queryByTestId('favorite-routes')).toBeNull();

    fireEvent.press(screen.getByTestId('favorite-trip-planned-budget-123 Terry Rd'));
    expect(screen.getByTestId('search-trip-detail-budget')).toBeTruthy();
    expect(screen.getByTestId('search-trip-leave-time').props.children).toBe('10:36 AM');
    fireEvent.press(screen.getByTestId('search-trip-favorite'));
    fireEvent.press(screen.getByTestId('search-trip-back'));
    expect(screen.getByTestId('tab-favorites').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(screen.getByTestId('favorite-trip-recent-times-square'));
    expect(screen.getByTestId('recent-trip-detail-times-square')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recent-trip-favorite'));
    fireEvent.press(screen.getByTestId('recent-trip-back'));
    expect(screen.getByTestId('tab-favorites').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('No favorites yet')).toBeTruthy();
  });

  it('shows a selected state on home and results location buttons', () => {
    const screen = render(<App />);
    const homeLocation = screen.getByLabelText('Center on current location');
    expect(homeLocation.props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(homeLocation);
    expect(screen.getByLabelText('Center on current location').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    fireEvent.press(screen.getByTestId('search-result-terry-road-smithtown'));
    expect(screen.getByTestId('results-location').props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(screen.getByTestId('results-location'));
    expect(screen.getByTestId('results-location').props.accessibilityState).toEqual({ selected: true });
  });

  it('starts and ends a searched trip from its detail screen, with no Go buttons on result cards', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    fireEvent.press(screen.getByTestId('search-result-terry-road-smithtown'));
    fireEvent.changeText(screen.getByTestId('destination-input'), 'Times Square');

    fireEvent.press(screen.getByTestId('search-result-view-rail-fast'));
    expect(screen.getByTestId('search-trip-detail-rail-fast')).toBeTruthy();
    expect(screen.getByLabelText('Start trip to Times Square')).toBeTruthy();
    expect(screen.getByTestId('search-trip-go')).toBeTruthy();
    expect(within(screen.getByTestId('search-trip-scroll')).queryByTestId('search-trip-go')).toBeNull();
    expect(screen.getByTestId('search-trip-location')).toBeTruthy();
    expect(screen.getByTestId('search-trip-location').props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(screen.getByTestId('search-trip-location'));
    expect(screen.getByTestId('search-trip-location').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('search-trip-favorite').props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(screen.getByTestId('search-trip-favorite'));
    expect(screen.getByTestId('search-trip-favorite').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('search-trip-leave-time').props.children).toBe('10:04 AM');
    expect(screen.getByTestId('search-trip-arrive-time').props.children).toBe('11:16 AM');
    expect(screen.getByTestId('search-trip-step-0')).toBeTruthy();
    expect(screen.getByTestId('search-trip-step-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('search-trip-back'));
    expect(screen.getByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByDisplayValue('Times Square')).toBeTruthy();

    expect(screen.queryByTestId('search-result-go-rail-fast')).toBeNull();
    expect(screen.queryByTestId(/^search-result-(go|end)-/)).toBeNull();

    fireEvent.press(screen.getByTestId('search-result-view-rail-fast'));
    fireEvent.press(screen.getByTestId('search-trip-go'));
    expect(screen.getByTestId('search-trip-end')).toBeTruthy();
    expect(screen.getByText('END')).toBeTruthy();

    fireEvent.press(screen.getByTestId('search-trip-back'));
    fireEvent.press(screen.getByTestId('search-result-view-rail-fast'));
    expect(screen.getByTestId('search-trip-end')).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-trip-end'));
    expect(screen.getByTestId('route-results-view')).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-result-view-rail-fast'));
    expect(screen.getByTestId('search-trip-go')).toBeTruthy();
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
    expect(screen.getByLabelText('Start trip to Penn Station')).toBeTruthy();
    expect(screen.getByText('Ronkonkoma Branch')).toBeTruthy();
    expect(screen.getByTestId('recent-trip-go')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-back'));
    expect(screen.getByTestId('tab-recents').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('recent-trip-penn-station')).toBeTruthy();
    expect(screen.queryByTestId('recent-trip-detail-penn-station')).toBeNull();
  });

  it('shows route badges, time range, duration, fare, and recency on recent-trip cards', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('tab-recents'));
    const card = screen.getByTestId('recent-trip-times-square');

    expect(within(card).getByLabelText('R rail')).toBeTruthy();
    expect(within(card).getByLabelText('E train')).toBeTruthy();
    expect(within(card).getByText('8:42 AM – 10:16 AM')).toBeTruthy();
    expect(within(card).getByText('94 min')).toBeTruthy();
    expect(within(card).getByText('$17.15')).toBeTruthy();
    expect(within(card).getByText('3 days ago')).toBeTruthy();
    expect(within(card).getByText('From Stony Brook University')).toBeTruthy();
  });

  it('highlights an in-progress recent trip and swaps Go for End', () => {
    const screen = render(<App />);
    const nearbyHeight = StyleSheet.flatten(screen.getByTestId('nearby-route-content').props.style).minHeight;
    fireEvent.press(screen.getByTestId('tab-recents'));
    expect(screen.queryByText('In progress')).toBeNull();

    fireEvent.press(screen.getByTestId('recent-trip-go-patchogue'));
    fireEvent.press(screen.getByTestId('recent-trip-back'));

    expect(within(screen.getByTestId('recent-trip-patchogue')).getByText('In progress')).toBeTruthy();
    expect(within(screen.getByTestId('recent-trip-patchogue')).queryByText('Last week')).toBeNull();
    expect(screen.getByTestId('recent-trip-end-patchogue')).toBeTruthy();
    expect(screen.getByLabelText('End trip to Patchogue Station')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('recents-route-content').props.style).minHeight).toBe(nearbyHeight);
  });

  it('starts and ends a recent trip from both Go buttons', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('tab-recents'));

    fireEvent.press(screen.getByTestId('recent-trip-go-penn-station'));
    expect(screen.getByTestId('recent-trip-detail-penn-station')).toBeTruthy();
    expect(screen.getByTestId('recent-trip-end')).toBeTruthy();
    expect(screen.getByText('END')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-back'));
    expect(screen.getByTestId('tab-recents').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('recent-trip-end-penn-station')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-end-penn-station'));
    expect(screen.getByTestId('recent-trip-go-penn-station')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-penn-station'));
    fireEvent.press(screen.getByTestId('recent-trip-go'));
    expect(screen.getByTestId('recent-trip-end')).toBeTruthy();
    expect(screen.getByLabelText('End current trip')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-end'));
    expect(screen.getByTestId('recent-trip-penn-station')).toBeTruthy();
    expect(screen.getByTestId('tab-recents').props.accessibilityState).toEqual({ selected: true });
  });

  it('opens profile settings and can trigger sign out', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('profile-trigger'));

    expect(screen.getByTestId('profile-view')).toBeTruthy();
    expect(screen.getByText('Account details')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sign-out'));
    expect(signOut).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('profile-back'));
    expect(screen.getByTestId('profile-trigger')).toBeTruthy();
  });

  it('keeps the trip map fixed while details scroll over it', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    fireEvent.press(screen.getByTestId('search-result-terry-road-smithtown'));
    fireEvent.press(screen.getByTestId('search-result-view-rail-fast'));

    const plannedScroll = screen.getByTestId('search-trip-scroll');
    expect(plannedScroll.props.bounces).toBe(false);
    expect(plannedScroll.props.overScrollMode).toBe('never');
    expect(within(plannedScroll).queryByTestId('search-trip-map')).toBeNull();
    expect(screen.getByTestId('search-trip-map')).toBeTruthy();
    expect(within(plannedScroll).getByTestId('search-trip-content')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('search-trip-scroll-map-window').props.style).height).toBe(
      StyleSheet.flatten(screen.getByTestId('search-trip-map').props.style).height,
    );
    expect(within(plannedScroll).queryByTestId('search-trip-back')).toBeNull();
    expect(within(plannedScroll).queryByTestId('search-trip-favorite')).toBeNull();
    fireEvent.scroll(plannedScroll, { nativeEvent: { contentOffset: { y: 140 } } });
    fireEvent.scroll(plannedScroll, { nativeEvent: { contentOffset: { y: 280 } } });
    fireEvent.scroll(plannedScroll, { nativeEvent: { contentOffset: { y: 0 } } });

    fireEvent.press(screen.getByTestId('search-trip-back'));
    fireEvent.press(screen.getByTestId('results-back'));
    fireEvent.press(screen.getByLabelText('Cancel destination search'));
    fireEvent.press(screen.getByTestId('tab-recents'));
    fireEvent.press(screen.getByTestId('recent-trip-times-square'));

    const recentScroll = screen.getByTestId('recent-trip-scroll');
    expect(within(recentScroll).queryByTestId('recent-trip-map')).toBeNull();
    expect(screen.getByTestId('recent-trip-map')).toBeTruthy();
    expect(within(recentScroll).getByTestId('recent-trip-content')).toBeTruthy();
    expect(screen.getByTestId('recent-trip-leg-0')).toBeTruthy();
    expect(screen.getByTestId('recent-trip-leg-1')).toBeTruthy();
    expect(screen.getByLabelText('Start trip to Times Square')).toBeTruthy();
    expect(screen.getByTestId('recent-trip-leave-time').props.children).toBe('8:42 AM');
    expect(screen.getByTestId('recent-trip-arrive-time').props.children).toBe('10:16 AM');

    fireEvent.press(screen.getByTestId('recent-trip-favorite'));
    fireEvent.press(screen.getByTestId('recent-trip-location'));
    expect(screen.getByTestId('recent-trip-favorite').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('recent-trip-location').props.accessibilityState).toEqual({ selected: true });
  });

  type TestElement = ReturnType<ReturnType<typeof render>['getByTestId']>;
  const backgroundOf = (element: TestElement) => StyleSheet.flatten(element.props.style)?.backgroundColor;

  const renderDark = () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('profile-trigger'));
    fireEvent.press(screen.getByTestId('settings-row-appearance'));
    fireEvent.press(screen.getByTestId('appearance-dark'));
    fireEvent.press(screen.getByTestId('settings-back'));
    fireEvent.press(screen.getByTestId('profile-back'));
    return screen;
  };

  it('switches appearance from Settings and remembers the choice for the session', () => {
    const screen = render(<App />);
    expect(backgroundOf(screen.getByTestId('transit-sheet'))).toBe(lightColors.surface);

    fireEvent.press(screen.getByTestId('profile-trigger'));
    fireEvent.press(screen.getByTestId('settings-row-appearance'));
    expect(screen.getByTestId('appearance-light').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('appearance-dark'));
    expect(screen.getByTestId('appearance-dark').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('settings-back'));
    fireEvent.press(screen.getByTestId('settings-row-appearance'));
    expect(screen.getByTestId('appearance-dark').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('settings-back'));
    fireEvent.press(screen.getByTestId('profile-back'));

    expect(backgroundOf(screen.getByTestId('transit-sheet'))).toBe(darkColors.surface);
  });

  it('renders home surfaces dark while route cards keep their colors', () => {
    const screen = renderDark();
    expect(backgroundOf(screen.getByTestId('transit-sheet'))).toBe(darkColors.surface);
    expect(backgroundOf(screen.getByTestId('route-card-e'))).toBe(routeById.e.color);
    fireEvent.press(screen.getByTestId('tab-recents'));
    expect(backgroundOf(screen.getByTestId('recent-trip-penn-station-card'))).toBe(darkColors.surface);
  });

  it('renders results and the time picker dark', () => {
    const screen = renderDark();
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    fireEvent.press(screen.getByTestId('search-result-terry-road-smithtown'));
    expect(backgroundOf(screen.getByTestId('route-results-view'))).toBe(darkColors.canvas);
    fireEvent.press(screen.getByTestId('leave-time-control'));
    expect(backgroundOf(screen.getByTestId('leave-time-sheet'))).toBe(darkColors.surface);
  });

  it('renders route detail, trip detail, and settings dark', () => {
    const screen = renderDark();
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));
    expect(backgroundOf(screen.getByTestId('route-detail-content'))).toBe(darkColors.surface);
    fireEvent.press(screen.getByTestId('route-back'));

    fireEvent.press(screen.getByTestId('tab-recents'));
    fireEvent.press(screen.getByTestId('recent-trip-times-square'));
    expect(backgroundOf(screen.getByTestId('recent-trip-content'))).toBe(darkColors.surfaceMuted);
    fireEvent.press(screen.getByTestId('recent-trip-back'));

    fireEvent.press(screen.getByTestId('profile-trigger'));
    expect(backgroundOf(screen.getByTestId('profile-view'))).toBe(darkColors.background);
    fireEvent.press(screen.getByTestId('settings-row-accessibility'));
    expect(backgroundOf(screen.getByTestId('settings-accessibility'))).toBe(darkColors.background);
  });

  it('draws route and trip overlays on the illustrated map', () => {
    const hidden = { includeHiddenElements: true };
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));
    expect(screen.getAllByTestId(/^map-route-path-/, hidden)).toHaveLength(1);
    expect(screen.getAllByTestId(/^map-stop-0-/, hidden)).toHaveLength(5);
    expect(screen.getByTestId('map-vehicle', hidden)).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-back'));

    fireEvent.press(screen.getByTestId('tab-recents'));
    fireEvent.press(screen.getByTestId('recent-trip-times-square'));
    expect(screen.getAllByTestId(/^map-route-path-/, hidden)).toHaveLength(2);
    expect(screen.getAllByTestId(/^map-connector-/, hidden)).toHaveLength(1);
    expect(screen.getByTestId('map-trip-start', hidden)).toBeTruthy();
    expect(screen.getByTestId('map-destination-pin', hidden)).toBeTruthy();
  });

  it('opens every profile category and keeps settings interactions local', () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('profile-trigger'));

    for (const id of ['appearance', 'account', 'notifications', 'accessibility', 'privacy', 'travel', 'places', 'help']) {
      expect(screen.getByTestId(`settings-row-${id}`)).toBeTruthy();
    }

    fireEvent.press(screen.getByTestId('settings-row-account'));
    fireEvent.press(screen.getByTestId('account-display-name'));
    expect(screen.getByText(/coming soon/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-notifications'));
    fireEvent(screen.getByTestId('toggle-notifications'), 'valueChange', false);
    expect(screen.getByText('Updated for this prototype session only')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-accessibility'));
    fireEvent.press(screen.getByTestId('text-size-large'));
    expect(screen.getByTestId('text-size-large').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-privacy'));
    fireEvent(screen.getByTestId('toggle-location'), 'valueChange', false);
    expect(screen.getByText(/do not change device permissions/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-travel'));
    fireEvent.press(screen.getByTestId('travel-mode-rail'));
    expect(screen.getByTestId('travel-mode-rail').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-places'));
    fireEvent.press(screen.getByTestId('add-saved-place'));
    expect(screen.getByText(/session only/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-help'));
    expect(screen.getByText('Version 0.1.0 · Local preview')).toBeTruthy();
    fireEvent.press(screen.getByTestId('help-faq'));
    expect(screen.getByText('FAQ preview opened locally')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('sign-out'));
    expect(signOut).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
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

  it('keeps the route map fixed while the page and its map controls scroll', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));

    const routeScroll = screen.getByTestId('route-detail-scroll');
    expect(screen.queryByTestId('route-sheet-handle')).toBeNull();
    expect(screen.queryByTestId('route-sheet-anchor')).toBeNull();
    expect(routeScroll.props.bounces).toBe(false);
    expect(routeScroll.props.overScrollMode).toBe('never');
    expect(within(routeScroll).queryByTestId('route-detail-map')).toBeNull();
    expect(screen.getByTestId('route-detail-map')).toBeTruthy();
    expect(within(routeScroll).getByTestId('route-pin')).toBeTruthy();
    expect(within(routeScroll).getByTestId('route-back')).toBeTruthy();
    expect(screen.queryByTestId('route-detail-ronkonkoma-header')).toBeNull();
    expect(within(routeScroll).getByTestId('route-detail-content')).toBeTruthy();
    expect(screen.getByTestId('route-back')).toBeTruthy();
    expect(screen.getByTestId('route-location')).toBeTruthy();
    expect(screen.getByTestId('route-pin')).toBeTruthy();

    fireEvent.scroll(routeScroll, { nativeEvent: { contentOffset: { y: 140 } } });
    fireEvent.scroll(routeScroll, { nativeEvent: { contentOffset: { y: 280 } } });
    fireEvent.scroll(routeScroll, { nativeEvent: { contentOffset: { y: 0 } } });

    fireEvent.press(screen.getByTestId('route-location'));
    expect(screen.getByTestId('route-location').props.accessibilityState).toEqual({ selected: true });

    fireEvent(screen.getByTestId('route-direction-pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 354, y: 0 } },
    });
    expect(screen.getByText('Ronkonkoma')).toBeTruthy();
    expect(screen.queryByText('Eastbound to Ronkonkoma')).toBeNull();
  });
});
