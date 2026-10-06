import { act, fireEvent, render, within, type RenderResult } from '@testing-library/react-native';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import * as Location from 'expo-location';
import { ScrollView, StyleSheet } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import App from '../App';
import { autocompletePlaces, fetchPlaceDetails, getPlacesApiKey } from '../src/data/placesSearch';
import { clearSessionRecents } from '../src/data/sessionRecents';
import { PORT_JEFFERSON_SHAPE } from '../src/data/portJeffersonShape';
import { STATION_TRANSFERS } from '../src/data/stationTransfers';
import { routeById, routes } from '../src/data/transit';
import { darkColors, lightColors } from '../src/theme/colors';

const mockUseFonts = jest.fn(() => [true] as [boolean]);

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('@expo-google-fonts/nunito/useFonts', () => ({
  useFonts: () => mockUseFonts(),
}));

// Deterministic Google Places fixtures; no network in tests.
jest.mock('../src/data/placesSearch', () => {
  const places = {
    'terry-road-smithtown': { id: 'terry-road-smithtown', title: '123 Terry Rd', subtitle: 'Smithtown, NY, USA' },
    'stony-brook-university': { id: 'stony-brook-university', title: 'Stony Brook University', subtitle: 'Stony Brook, NY, USA' },
  };
  const details = {
    'terry-road-smithtown': { ...places['terry-road-smithtown'], subtitle: '123 Terry Rd, Smithtown, NY 11787, USA' },
    'stony-brook-university': { id: 'stony-brook-university', title: 'Stony Brook University Main Campus', subtitle: '100 Nicolls Rd, Stony Brook, NY 11794, USA' },
  };
  return {
    ...jest.requireActual('../src/data/placesSearch'),
    getPlacesApiKey: jest.fn(() => 'test-key'),
    autocompletePlaces: jest.fn(async ({ input }: { input: string }) => {
      const text = input.toLowerCase();
      if (text.includes('terry')) return [places['terry-road-smithtown']];
      if (text.includes('stony')) return [places['stony-brook-university']];
      return [];
    }),
    fetchPlaceDetails: jest.fn(async ({ placeId }: { placeId: keyof typeof details }) => details[placeId]),
  };
});

const mockAutocompletePlaces = autocompletePlaces as jest.MockedFunction<typeof autocompletePlaces>;
const mockFetchPlaceDetails = fetchPlaceDetails as jest.MockedFunction<typeof fetchPlaceDetails>;
const mockGetPlacesApiKey = getPlacesApiKey as jest.MockedFunction<typeof getPlacesApiKey>;

/** Types a query on the open search screen, waits for the suggestion, and opens Route Results. */
async function pickPlace(screen: RenderResult, query: string, placeId: string) {
  fireEvent.changeText(screen.getByTestId('search-input'), query);
  fireEvent.press(await screen.findByTestId(`search-result-${placeId}`));
  await screen.findByTestId('route-results-view');
}

describe('Pathly prototype navigation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearSessionRecents();
    mockAutocompletePlaces.mockClear();
    mockFetchPlaceDetails.mockClear();
    mockGetPlacesApiKey.mockReturnValue('test-key');
  });

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

    const listContentStyle = StyleSheet.flatten(screen.getByTestId('nearby-route-list').props.contentContainerStyle) ?? {};
    expect(listContentStyle.minHeight).toBeUndefined();
    expect(listContentStyle.flexGrow).toBeUndefined();
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

  it('expands the transit menu on the first handle tap and resets it on the second', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const screen = render(<App />);
    const list = screen.getByTestId('nearby-route-list');

    fireEvent.press(screen.getByTestId('transit-sheet-handle'));
    const expandedY = (scrollTo.mock.calls.at(-1)?.[0] as { y: number }).y;
    expect(expandedY).toBeGreaterThan(0);

    // The page may stop short of the expanded offset when the list is short; any offset off rest still resets.
    fireEvent.scroll(list, { nativeEvent: { contentOffset: { x: 0, y: Math.min(expandedY, 120) } } });
    fireEvent.press(screen.getByTestId('transit-sheet-handle'));
    expect(scrollTo.mock.calls.at(-1)?.[0]).toMatchObject({ y: 0 });
  });

  it('keeps the transit list scrolling natural, with a drag handle and a route visible at rest', () => {
    const screen = render(<App />);
    const sheetScroll = screen.getByTestId('nearby-route-list');

    expect(screen.getByTestId('transit-sheet-handle')).toBeTruthy();
    expect(sheetScroll.props.onScrollBeginDrag).toBeUndefined();
    expect(sheetScroll.props.onResponderMove).toBeUndefined();
    expect(sheetScroll.props.bounces).toBe(false);
    expect(sheetScroll.props.overScrollMode).toBe('never');
    // Single-scroll page: the sheet rests below a transparent map window inside the same scroll.
    expect(StyleSheet.flatten(screen.getByTestId('transit-map-window').props.style).height).toBeGreaterThan(0);
    expect(screen.getByTestId('transit-sheet')).toBeTruthy();
    expect(screen.getByTestId('route-card-ronkonkoma')).toBeTruthy();
    expect(screen.getByTestId('tab-nearby')).toBeTruthy();
    expect(screen.getByTestId('tab-recents')).toBeTruthy();
    expect(screen.getByTestId('tab-favorites')).toBeTruthy();
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

  it('shows search as a full-screen list with no map, pins, or match count', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getByTestId('search-results')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('search-input'), '142 christian ave');

    expect(screen.queryByText('Recent')).toBeNull();
    expect(screen.queryByText('Matches')).toBeNull();
    expect(screen.queryByTestId('search-match-count')).toBeNull();
    expect(screen.queryByTestId('map-backdrop', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByLabelText(/^Map result/)).toBeNull();
  });

  it('shows Google place suggestions with a pin icon, bold name, and address', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');
    expect(screen.getByTestId('search-loading')).toBeTruthy();

    const row = await screen.findByTestId('search-result-stony-brook-university');
    expect(within(row).getByText('location-outline', { includeHiddenElements: true })).toBeTruthy();
    expect(within(row).getByText('Stony Brook University')).toBeTruthy();
    expect(within(row).getByText('Stony Brook, NY, USA')).toBeTruthy();
    expect(mockAutocompletePlaces).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when Google finds no places', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'zzzz');
    expect(await screen.findByText('No places found')).toBeTruthy();
  });

  it('shows a retryable error when place search fails', async () => {
    mockAutocompletePlaces.mockRejectedValueOnce(new Error('offline'));
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');

    expect(await screen.findByText("Couldn't load places")).toBeTruthy();
    expect(screen.queryByText(/offline/)).toBeNull();
    fireEvent.press(screen.getByTestId('search-retry'));
    expect(await screen.findByTestId('search-result-stony-brook-university')).toBeTruthy();
  });

  it('explains when place search is not configured', async () => {
    mockGetPlacesApiKey.mockReturnValue('');
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');

    expect(screen.getByText('Place search is unavailable')).toBeTruthy();
    expect(mockAutocompletePlaces).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('search-input'), '');
    fireEvent.press(screen.getByTestId('search-result-recent-penn-station'));
    expect(screen.getByDisplayValue('Penn Station')).toBeTruthy();
  });

  it('opens route results with the resolved place name', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');
    fireEvent.press(await screen.findByTestId('search-result-stony-brook-university'));

    expect(await screen.findByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByDisplayValue('Stony Brook University Main Campus')).toBeTruthy();
    expect(mockFetchPlaceDetails).toHaveBeenCalledWith(expect.objectContaining({ placeId: 'stony-brook-university' }));
  });

  it('stays on search with an error when place details fail', async () => {
    mockFetchPlaceDetails.mockRejectedValueOnce(new Error('500'));
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');
    fireEvent.press(await screen.findByTestId('search-result-stony-brook-university'));

    expect(await screen.findByTestId('search-selection-error')).toBeTruthy();
    expect(screen.getByTestId('search-view')).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-result-stony-brook-university'));
    expect(await screen.findByTestId('route-results-view')).toBeTruthy();
  });

  it('lists picked places first under Recent and reopens them without a Places request', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    fireEvent.press(screen.getByTestId('results-back'));
    fireEvent.press(screen.getByLabelText('Cancel destination search'));
    fireEvent.press(screen.getByTestId('search-trigger'));

    const recentRows = screen.getAllByTestId(/^search-result-/);
    expect(recentRows[0].props.testID).toBe('search-result-terry-road-smithtown');
    expect(within(recentRows[0]).getByText('time-outline', { includeHiddenElements: true })).toBeTruthy();
    mockAutocompletePlaces.mockClear();
    mockFetchPlaceDetails.mockClear();
    fireEvent.press(recentRows[0]);
    expect(screen.getByDisplayValue('123 Terry Rd')).toBeTruthy();
    expect(mockAutocompletePlaces).not.toHaveBeenCalled();
    expect(mockFetchPlaceDetails).not.toHaveBeenCalled();
  });

  it('opens route results from search and preserves editable criteria across controls', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');

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

  const openResults = async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    return screen;
  };

  it('picks a departure time from the wheel and reschedules every itinerary', async () => {
    const screen = await openResults();
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

  it('keeps arrive-by itineraries on time and discards a cancelled pick', async () => {
    const screen = await openResults();
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

  it('filters itineraries by mode separately from sort preferences', async () => {
    const screen = await openResults();
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

  it('saves favorite routes and trips to the Favorites tab and opens them', async () => {
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
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
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

  it('shows a selected state on home and results location buttons', async () => {
    const screen = render(<App />);
    const homeLocation = screen.getByLabelText('Center on current location');
    expect(homeLocation.props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(homeLocation);
    expect(screen.getByLabelText('Center on current location').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    expect(screen.getByTestId('results-location').props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(screen.getByTestId('results-location'));
    expect(screen.getByTestId('results-location').props.accessibilityState).toEqual({ selected: true });
  });

  it('starts and ends a searched trip from its detail screen, with no Go buttons on result cards', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
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
    expect(screen.getByText('Port Jefferson Branch')).toBeTruthy();
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

    expect(within(card).getByLabelText('PJ rail')).toBeTruthy();
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

  it('keeps the trip map fixed while details scroll over it', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
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

  it('renders results and the time picker dark', async () => {
    const screen = renderDark();
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
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
    // Port Jefferson Branch (ronkonkoma) has a real live feed, so it renders the real map
    // instead of the illustrated overlay the other routes still use.
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));
    expect(screen.getByTestId('lirr-route-map', hidden)).toBeTruthy();
    expect(screen.getAllByTestId(/^lirr-stop-/, hidden)).toHaveLength(22);
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

  it('shows service alerts only for routes with an advisory', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));
    expect(screen.queryByTestId('service-alerts')).toBeNull();
    expect(screen.queryByText('No delays')).toBeNull();
    fireEvent.press(screen.getByTestId('route-back'));

    fireEvent.press(screen.getByTestId('route-card-s1-primary'));
    expect(screen.getByText('Advisory')).toBeTruthy();
    expect(screen.queryByText(routeById.s1.alert)).toBeNull();
    fireEvent.press(screen.getByTestId('service-alerts'));
    expect(screen.getByText(routeById.s1.alert)).toBeTruthy();
  });

  it('lists route stops by name and time only, with a filled Scheduled pill', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));

    for (const caption of ['Departs', 'Scheduled stop', 'Final stop']) {
      expect(screen.queryByText(caption)).toBeNull();
    }
    expect(screen.getByText('Stony Brook', { exact: true, includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText(/^Stony Brook, departs /)).toBeTruthy();
    expect(screen.getByLabelText(/^Penn Station, arrives /)).toBeTruthy();
    // The divider runs under the name and the time together.
    const pennRow = screen.getByLabelText(/^Penn Station, arrives /);
    const pennBody = within(pennRow).getByTestId('route-stop-body-Penn Station', { includeHiddenElements: true });
    expect(StyleSheet.flatten(pennBody.props.style)).toMatchObject({ borderBottomWidth: 1, flexDirection: 'row' });
    expect(within(pennBody).getByText('Penn Station', { includeHiddenElements: true })).toBeTruthy();
    expect(within(pennBody).getByText(/^\d{1,2}:\d{2} [AP]M$/, { includeHiddenElements: true })).toBeTruthy();

    const pill = StyleSheet.flatten(screen.getAllByTestId('route-prediction-scheduled', { includeHiddenElements: true })[0].props.style);
    expect(pill.backgroundColor).toBe(lightColors.mutedInk);
    expect(pill.color).toBe(lightColors.surface);
    expect(pill.borderRadius).toBeGreaterThan(0);
  });

  it('marks live route stops with white dots in the route color that show their names', () => {
    const hidden = { includeHiddenElements: true };
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));

    const routeLine = screen.getByTestId('lirr-route-line', hidden);
    expect(routeLine.props.strokeColor).toBe(routeById.ronkonkoma.color);
    // Follows the real track shape, not one straight segment per station pair.
    expect(routeLine.props.coordinates).toHaveLength(PORT_JEFFERSON_SHAPE.length);
    expect(PORT_JEFFERSON_SHAPE.length).toBeGreaterThan(routeById.ronkonkoma.stops.length * 5);
    const stops = screen.getAllByTestId(/^lirr-stop-/, hidden);
    expect(stops).toHaveLength(22);
    for (const stop of stops) {
      const name = stop.props.testID.replace('lirr-stop-', '');
      expect(stop.props.title).toBe(name);
      expect(stop.props.anchor).toEqual({ x: 0.5, y: 0.5 });
      const dot = StyleSheet.flatten(within(stop).getByTestId(`lirr-dot-${name}`, hidden).props.style);
      // The rider's nearest station (Stony Brook under the test location fallback) is emphasized.
      expect(dot).toMatchObject(name === 'Stony Brook'
        ? { backgroundColor: routeById.ronkonkoma.color, borderColor: '#FFFFFF', width: 20 }
        : { backgroundColor: '#FFFFFF', borderColor: routeById.ronkonkoma.color, width: 14 });
    }
  });

  it('lets only the live route map take gestures through the scrolling page', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));
    expect(screen.getByTestId('route-detail-map').props.pointerEvents).toBe('auto');
    const routeScroll = screen.getByTestId('route-detail-scroll');
    expect(routeScroll.props.pointerEvents).toBe('box-none');
    expect(StyleSheet.flatten(routeScroll.props.contentContainerStyle)).toMatchObject({ pointerEvents: 'box-none' });
    fireEvent.press(screen.getByTestId('route-back'));

    fireEvent.press(screen.getByTestId('route-card-s1-primary'));
    expect(screen.getByTestId('route-detail-map').props.pointerEvents).toBe('none');
    expect(screen.getByTestId('route-detail-scroll').props.pointerEvents).toBe('auto');
    fireEvent.press(screen.getByTestId('route-back'));

    fireEvent.press(screen.getByTestId('tab-recents'));
    fireEvent.press(screen.getByTestId('recent-trip-penn-station'));
    expect(screen.getByTestId('recent-trip-map').props.pointerEvents).toBe('none');
  });

  describe('live trains on the route map', () => {
    const hidden = { includeHiddenElements: true };
    const NOW = new Date(2024, 0, 1, 10, 0, 0).getTime();
    // lirrLive.ts creates its callable once at import time; this is that mocked callable.
    const liveCallable = () => (httpsCallable as jest.Mock).mock.results[0]!.value as jest.Mock;
    const vehicle = (tripId: string, directionId: number, ageSeconds: number) => ({
      tripId, directionId, lat: 40.92, lon: -73.13, timestamp: (NOW - ageSeconds * 1000) / 1000,
    });
    const respondWith = (vehicles: ReturnType<typeof vehicle>[]) => {
      liveCallable().mockResolvedValue({
        data: { routeId: '10', routeName: 'Port Jefferson Branch', vehicles, stopPredictions: { towardDirection1: [], towardDirection0: [] } },
      });
    };

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(NOW);
    });

    afterEach(() => {
      liveCallable().mockReset();
      liveCallable().mockResolvedValue({
        data: { routeId: '10', routeName: 'Port Jefferson Branch', vehicles: [], stopPredictions: { towardDirection1: [], towardDirection0: [] } },
      });
    });

    const openLiveRoute = async () => {
      const screen = render(<App />);
      fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));
      await act(async () => {}); // let the live fetch resolve
      return screen;
    };

    it('asks for departures from the nearest station and opens the map on it', async () => {
      respondWith([]);
      const screen = await openLiveRoute();
      expect(liveCallable()).toHaveBeenCalledWith({ routeId: '10', stopId: '14' });
      expect(screen.getByTestId('lirr-route-map', hidden).props.initialRegion).toMatchObject({ latitude: 40.92032252, longitude: -73.12854943, latitudeDelta: 0.06 });
    });

    it('shows only trains going the selected direction', async () => {
      // ronkonkoma's directions[0] is GTFS direction_id 1 (liveSource.direction1Index = 0).
      respondWith([vehicle('west', 1, 5), vehicle('east', 0, 5)]);
      const screen = await openLiveRoute();
      expect(screen.getByTestId('lirr-vehicle-west', hidden)).toBeTruthy();
      expect(screen.queryByTestId('lirr-vehicle-east', hidden)).toBeNull();

      fireEvent.press(screen.getAllByLabelText(/^Show .* predictions$/)[1]);
      expect(screen.queryByTestId('lirr-vehicle-west', hidden)).toBeNull();
      expect(screen.getByTestId('lirr-vehicle-east', hidden)).toBeTruthy();
    });

    it("counts each train's GPS age up every second and hides stale trains", async () => {
      respondWith([vehicle('fresh', 1, 3), vehicle('stale', 1, 6 * 60)]);
      const screen = await openLiveRoute();
      expect(screen.getByTestId('lirr-train-age-fresh', hidden).props.children).toBe('3s');
      expect(screen.queryByTestId('lirr-vehicle-stale', hidden)).toBeNull();

      act(() => jest.advanceTimersByTime(2000));
      expect(screen.getByTestId('lirr-train-age-fresh', hidden).props.children).toBe('5s');
      act(() => jest.advanceTimersByTime(60_000));
      expect(screen.getByTestId('lirr-train-age-fresh', hidden).props.children).toBe('1m');
    });
  });

  it("starts the stop list at the rider's station and runs to the end of the selected direction", () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));
    const rows = () => screen.getAllByLabelText(/, (departs|arrives) /).map((row) => row.props.accessibilityLabel.split(',')[0]);

    expect(rows()[0]).toBe('Stony Brook');
    expect(rows().at(-1)).toBe('Penn Station');
    expect(rows()).not.toContain('Port Jefferson');
    expect(rows()).toHaveLength(21);

    fireEvent.press(screen.getAllByLabelText(/^Show .* predictions$/)[1]);
    expect(rows()).toEqual(['Stony Brook', 'Port Jefferson']);
  });

  it('shows transfer chips per station, capped with a +N count', () => {
    const hidden = { includeHiddenElements: true };
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));

    const smithtown = screen.getByTestId('route-transfer-Smithtown-56', hidden);
    expect(within(smithtown).getByText('56', hidden)).toBeTruthy();
    expect(screen.getByLabelText(/^Smithtown, arrives .*, transfers: (.*, )?56(,|$)/)).toBeTruthy();

    const jamaica = within(screen.getByTestId('route-stop-transfers-Jamaica', hidden));
    expect(jamaica.getAllByTestId(/^route-transfer-Jamaica-/, hidden)).toHaveLength(8);
    expect(screen.getByTestId('route-stop-transfers-more-Jamaica', hidden).props.children).toEqual(['+', STATION_TRANSFERS.Jamaica!.length - 8]);
    expect(screen.queryByTestId('route-stop-transfers-St. James', hidden)).toBeNull();
  });

  it('centers the live map on the rider from the location button', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));
    const map = () => screen.getByTestId('lirr-route-map', { includeHiddenElements: true });
    expect(map().props.showsUserLocation).toBe(true);

    const permissionRequests = (Location.requestForegroundPermissionsAsync as jest.Mock).mock.calls.length;
    fireEvent.press(screen.getByTestId('route-location'));
    // Pressing refreshes the rider's location (a fresh permission check + fix), like the home button.
    expect((Location.requestForegroundPermissionsAsync as jest.Mock).mock.calls.length).toBe(permissionRequests + 1);
    expect(screen.getByTestId('route-location').props.accessibilityState).toEqual({ selected: true });
    fireEvent(map(), 'panDrag');
    expect(screen.getByTestId('route-location').props.accessibilityState).toEqual({ selected: false });
    await act(async () => {}); // settle the location refresh
  });

  it('keeps route stop timing and live provenance accessible', () => {
    // Route stops are projected onto the actual current time (see scheduleStopsFromNow in
    // transit.ts), so the clock is pinned here to make the rendered times deterministic.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 0, 1, 10, 0, 0));
    try {
      const screen = render(<App />);
      fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));

      expect(screen.getByLabelText('4 minutes, live GPS prediction')).toBeTruthy();
      expect(screen.getByLabelText('18 minutes, scheduled time')).toBeTruthy();
      // Westbound (the default tab) travels Port Jefferson -> Penn Station, the reverse of how
      // `stops` is authored (Penn -> Port Jefferson, see stopsDirectionIndex). The list starts at
      // the rider's nearest station (Stony Brook under the test location fallback), which leaves
      // in the first prediction's 4 min, and ends at Penn Station.
      expect(screen.getByLabelText(/^Stony Brook, departs 10:04 AM, transfers: /)).toBeTruthy();
      expect(screen.getByLabelText(/^Penn Station, arrives 11:55 AM, transfers: /)).toBeTruthy();
      expect(routeById.ronkonkoma.stops).toHaveLength(22);
    } finally {
      jest.useRealTimers();
    }
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
    expect(screen.getByTestId('route-detail-destination').props.children).toBe('Port Jefferson');
    expect(screen.queryByText('Eastbound to Port Jefferson')).toBeNull();
  });
});
