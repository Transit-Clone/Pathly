import { act, fireEvent, render, waitFor, within, type RenderResult } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import * as Location from 'expo-location';
import { ScrollView, StyleSheet } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import App from '../App';
import { RouteDetailView } from '../src/components/RouteDetailView';
import { AppSettingsProvider } from '../src/theme/AppSettings';
import { autocompletePlaces, fetchPlaceDetails, getPlacesApiKey } from '../src/data/placesSearch';
import { clearSessionRecents } from '../src/data/sessionRecents';
import { SERVICE_AREA_FALLBACK } from '../src/data/serviceArea';
import { STATION_TRANSFERS } from '../src/data/stationTransfers';
import { TransitLiveProvider } from '../src/data/TransitLiveContext';
import { routeById, routes, type RouteId } from '../src/data/transit';
import { darkColors, lightColors } from '../src/theme/colors';

const mockUseFonts = jest.fn(() => [true] as [boolean]);

// Nothing is saved by default, so every live route is only reachable once the mocked
// dynamic-discovery call resolves (jest.setup.js's findNearbyTransit mock mirrors the demo
// catalog), under its synthesized "agencyId:routeId" card id — the same as production.
function cardIdFor(route: (typeof routes)[number]): string {
  return !route.liveSource ? route.id : `${route.liveSource.agencyId}:${route.liveSource.routeId}`;
}
const PJ_CARD = cardIdFor(routeById.ronkonkoma);

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('@expo-google-fonts/nunito/useFonts', () => ({
  useFonts: () => mockUseFonts(),
}));

// Deterministic Google Places fixtures; no network in tests.
jest.mock('../src/data/placesSearch', () => {
  const places = {
    'terry-road-smithtown': { id: 'terry-road-smithtown', title: '123 Terry Rd', subtitle: 'Smithtown, NY, USA' },
    'stony-brook-university': { id: 'stony-brook-university', title: 'Stony Brook University', subtitle: 'Stony Brook, NY, USA' },
    'times-square': { id: 'times-square', title: 'Times Square', subtitle: 'Manhattan, NY, USA' },
  };
  const details = {
    'terry-road-smithtown': { ...places['terry-road-smithtown'], subtitle: '123 Terry Rd, Smithtown, NY 11787, USA' },
    'stony-brook-university': { id: 'stony-brook-university', title: 'Stony Brook University Main Campus', subtitle: '100 Nicolls Rd, Stony Brook, NY 11794, USA' },
    'times-square': { id: 'times-square', title: 'Times Square', subtitle: 'Times Sq, New York, NY 10036, USA' },
  };
  return {
    ...jest.requireActual('../src/data/placesSearch'),
    getPlacesApiKey: jest.fn(() => 'test-key'),
    autocompletePlaces: jest.fn(async ({ input }: { input: string }) => {
      const text = input.toLowerCase();
      if (text.includes('terry')) return [places['terry-road-smithtown']];
      if (text.includes('stony')) return [places['stony-brook-university']];
      if (text.includes('times')) return [places['times-square']];
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

  beforeEach(async () => {
    // The app saves its last nearby list and live times on the device; start each test clean.
    await AsyncStorage.clear();
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

  it('renders every selectable route without contacting a backend', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const screen = render(<App />);

    expect(screen.getByText('Where to?')).toBeTruthy();
    expect(screen.queryByText('Nearby transit')).toBeNull();
    for (const route of routes) {
      expect(await screen.findByTestId(`route-card-${cardIdFor(route)}`)).toBeTruthy();
    }
    // Routes with a liveSource start in a loading state and only show "minutes" text once
    // their mocked live predictions resolve (no synchronous fallback to static data anymore).
    // findAllByText resolves as soon as it finds any match, so the full count needs waitFor.
    await waitFor(() => expect(screen.getAllByText('minutes')).toHaveLength(routes.length * 2));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps nearby cards at a fixed height without filler space', async () => {
    const screen = render(<App />);

    const listContentStyle = StyleSheet.flatten(screen.getByTestId('nearby-route-list').props.contentContainerStyle) ?? {};
    expect(listContentStyle.minHeight).toBeUndefined();
    expect(listContentStyle.flexGrow).toBeUndefined();
    for (const route of routes) {
      const card = await screen.findByTestId(`route-card-${cardIdFor(route)}`);
      expect(StyleSheet.flatten(card.props.style)).toMatchObject({
        height: 104,
      });
    }
  });

  it('shows the two-arc live signal only on live predictions', async () => {
    const screen = render(<App />);

    // Live routes start in a loading state (no signal yet); wait for the mocked predictions
    // to resolve before counting signals. findAllByTestId resolves as soon as it finds any
    // match, so the full count needs waitFor.
    // Cards fill in after the nearby search's debounce and the on-screen check, so a busy test
    // machine can take over the default 1 s.
    await waitFor(() => expect(screen.getAllByTestId('live-gps-signal', { includeHiddenElements: true })).toHaveLength(routes.length), { timeout: 5000 });
    expect(within(await screen.findByTestId(`route-card-${PJ_CARD}-primary`)).getByTestId('live-gps-signal', { includeHiddenElements: true })).toBeTruthy();
    expect(within(screen.getByTestId(`route-card-${PJ_CARD}-alternate`)).queryByTestId('live-gps-signal', { includeHiddenElements: true })).toBeNull();
  });

  it.each(routes.map((route) => [cardIdFor(route), route.routeName, route.shortName] as const))(
    'opens shared details for %s and returns home',
    async (cardId, routeName, shortName) => {
      const screen = render(<App />);
      await screen.findByTestId(`route-card-${cardId}-primary`);
      fireEvent.press(screen.getByTestId(`route-card-${cardId}-primary`));

      expect(screen.getByTestId(`route-detail-${cardId}`)).toBeTruthy();
      expect(screen.getByTestId('route-detail-destination').props.children).toBeTruthy();
      expect(screen.queryByText(routeName === shortName ? '__none__' : routeName)).toBeNull();
      // Routes with a liveSource show the real map (and its badge) only once geometry has
      // loaded from the mocked backend call; routes without one render it immediately.
      expect(await screen.findByTestId('route-detail-badge')).toBeTruthy();
      fireEvent.press(screen.getByTestId('route-back'));
      expect(screen.getByTestId(`route-card-${cardId}`)).toBeTruthy();
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

  it('keeps the transit list scrolling natural, with a drag handle and a route visible at rest', async () => {
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
    expect(await screen.findByTestId(`route-card-${PJ_CARD}`)).toBeTruthy();
    expect(screen.getByTestId('tab-nearby')).toBeTruthy();
    expect(screen.getByTestId('tab-recents')).toBeTruthy();
    expect(screen.getByTestId('tab-favorites')).toBeTruthy();
    // Starts in a "finding your location" loading state (denied permission in this test
    // environment resolves it almost immediately).
    expect(await screen.findByLabelText('Center on current location')).toBeTruthy();

    fireEvent.scroll(sheetScroll, { nativeEvent: { contentOffset: { y: 120 } } });
    fireEvent.scroll(sheetScroll, { nativeEvent: { contentOffset: { y: 240 } } });
    expect(await screen.findByTestId(`route-card-${cardIdFor(routeById['7'])}`)).toBeTruthy();
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
    expect(screen.getByLabelText(/^Trip (origin|destination), Penn Station$/)).toBeTruthy();
  });

  it('opens route results with the resolved place name', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');
    fireEvent.press(await screen.findByTestId('search-result-stony-brook-university'));

    expect(await screen.findByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByLabelText(/^Trip (origin|destination), Stony Brook University Main Campus$/)).toBeTruthy();
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
    expect(screen.getByLabelText(/^Trip (origin|destination), 123 Terry Rd$/)).toBeTruthy();
    expect(mockAutocompletePlaces).not.toHaveBeenCalled();
    expect(mockFetchPlaceDetails).not.toHaveBeenCalled();
  });

  it('opens route results from search and preserves editable criteria across controls', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');

    expect(screen.getByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByLabelText(/^Trip (origin|destination), 123 Terry Rd$/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('origin-field'));
    await pickPlace(screen, 'stony', 'stony-brook-university');
    fireEvent.press(screen.getByTestId('destination-field'));
    await pickPlace(screen, 'times', 'times-square');
    fireEvent.press(screen.getByTestId('swap-endpoints'));
    expect(screen.getByLabelText('Trip origin, Times Square')).toBeTruthy();
    expect(screen.getByLabelText('Trip destination, Stony Brook University Main Campus')).toBeTruthy();
    fireEvent.press(screen.getByTestId('swap-endpoints'));
    fireEvent.press(screen.getByTestId('filter-control'));
    fireEvent.press(screen.getByTestId('preference-cheapest'));
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-depart'));
    fireEvent.press(screen.getByTestId('leave-time-done'));
    fireEvent.press(screen.getByTestId('refresh-results'));

    expect(screen.getByLabelText('Trip origin, Stony Brook University Main Campus')).toBeTruthy();
    expect(screen.getByLabelText('Trip destination, Times Square')).toBeTruthy();
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

  it('saves routes with one star: saved routes lead Nearby and appear in Favorites', async () => {
    const hidden = { includeHiddenElements: true };
    const screen = render(<App />);
    // Nothing is saved by default.
    await screen.findByTestId(`route-card-${PJ_CARD}`);
    expect(screen.queryByTestId('saved-routes')).toBeNull();
    expect(screen.queryByTestId(`route-card-${PJ_CARD}-saved`, hidden)).toBeNull();

    const route51CardId = cardIdFor(routeById['51']);
    fireEvent.press(await screen.findByTestId(`route-card-${route51CardId}-primary`));
    // One save control, no pin.
    expect(screen.queryByTestId('route-pin')).toBeNull();
    expect(screen.getByTestId('route-favorite').props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(screen.getByTestId('route-favorite'));
    expect(screen.getByTestId('route-favorite').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('route-back'));

    const saved = within(screen.getByTestId('saved-routes'));
    expect(saved.getByTestId(`route-card-${route51CardId}`)).toBeTruthy();
    expect(screen.getByTestId(`route-card-${route51CardId}-saved`, hidden)).toBeTruthy();
    expect(within(screen.getByTestId('nearby-routes')).queryByTestId(`route-card-${route51CardId}`)).toBeNull();
    fireEvent.press(screen.getByTestId('tab-favorites'));
    expect(within(screen.getByTestId('favorite-routes')).getByTestId(`route-card-${route51CardId}`)).toBeTruthy();

    // Unsaving returns it to the regular nearby list and clears Favorites.
    fireEvent.press(within(screen.getByTestId('favorite-routes')).getByTestId(`route-card-${route51CardId}-primary`));
    fireEvent.press(screen.getByTestId('route-favorite'));
    fireEvent.press(screen.getByTestId('route-back'));
    expect(screen.getByText('No favorites yet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('tab-nearby'));
    expect(screen.queryByTestId('saved-routes')).toBeNull();
    expect(within(screen.getByTestId('nearby-routes')).getByTestId(`route-card-${route51CardId}`)).toBeTruthy();
  });

  it('saves favorite routes and trips to the Favorites tab and opens them', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('tab-favorites'));
    expect(screen.getByText('No favorites yet')).toBeTruthy();

    fireEvent.press(screen.getByTestId('tab-nearby'));
    // Only reachable once the mocked dynamic discovery resolves (jest.setup.js's
    // findNearbyTransit mock), under its synthesized id.
    const eCardId = cardIdFor(routeById.e);
    fireEvent.press(await screen.findByTestId(`route-card-${eCardId}-primary`));
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
    expect(within(screen.getByTestId('favorite-routes')).getByTestId(`route-card-${eCardId}`)).toBeTruthy();
    const trips = screen.getByTestId('favorite-trips');
    expect(within(trips).getByTestId('favorite-trip-recent-times-square')).toBeTruthy();
    expect(within(trips).getByTestId('favorite-trip-planned-budget-123 Terry Rd')).toBeTruthy();
    expect(within(trips).getByText('Depart 10:30 AM')).toBeTruthy();

    fireEvent.press(within(screen.getByTestId('favorite-routes')).getByTestId(`route-card-${eCardId}-primary`));
    expect(screen.getByTestId(`route-detail-${eCardId}`)).toBeTruthy();
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
    // The home locate button starts in a "finding your location" loading state (denied
    // permission in this test environment resolves it almost immediately).
    const homeLocation = await screen.findByLabelText('Center on current location');
    expect(homeLocation.props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(homeLocation);
    // Pressing refreshes the location (briefly back to the "finding your location" label) before
    // settling again once the mocked permission lookup resolves.
    await waitFor(() => expect(screen.getByLabelText('Center on current location').props.accessibilityState).toEqual({ selected: true }));

    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    expect(screen.getByTestId('results-location').props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(screen.getByTestId('results-location'));
    expect(screen.getByTestId('results-location').props.accessibilityState).toEqual({ selected: true });
  });

  it('edits a Route Results endpoint through the search page and keeps the other criteria', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    fireEvent.press(screen.getByTestId('filter-control'));
    fireEvent.press(screen.getByTestId('preference-cheapest'));
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-depart'));
    fireEvent.press(screen.getByTestId('leave-time-done'));

    // The destination opens the real search page, prefilled with the current destination.
    fireEvent.press(screen.getByTestId('destination-field'));
    expect(screen.getByTestId('search-view')).toBeTruthy();
    expect(screen.getByTestId('search-input').props.value).toBe('123 Terry Rd');
    expect(screen.queryByTestId('search-current-location')).toBeNull();
    fireEvent.changeText(screen.getByTestId('search-input'), 'stony');
    await waitFor(() => expect(mockAutocompletePlaces).toHaveBeenLastCalledWith(expect.objectContaining({ input: 'stony' })));
    fireEvent.press(await screen.findByTestId('search-result-stony-brook-university'));
    await screen.findByTestId('route-results-view');
    expect(screen.getByLabelText('Trip destination, Stony Brook University Main Campus')).toBeTruthy();
    expect(screen.getByLabelText('Trip origin, Current location')).toBeTruthy();
    // Leave time and the chosen preference survived the round trip.
    expect(screen.getByTestId('leave-time-label').props.children).toBe('Depart 10:30 AM');
    fireEvent.press(screen.getByTestId('filter-control'));
    expect(screen.getByTestId('preference-cheapest').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));

    // The origin can go back to the rider's location; it starts with an empty query.
    fireEvent.press(screen.getByTestId('origin-field'));
    await pickPlace(screen, 'times', 'times-square');
    expect(screen.getByLabelText('Trip origin, Times Square')).toBeTruthy();
    fireEvent.press(screen.getByTestId('origin-field'));
    fireEvent.press(screen.getByTestId('search-current-location'));
    expect(await screen.findByLabelText('Trip origin, Current location')).toBeTruthy();

    // Cancelling changes nothing.
    fireEvent.press(screen.getByTestId('origin-field'));
    expect(screen.getByTestId('search-input').props.value).toBe('');
    fireEvent.press(screen.getByLabelText('Cancel destination search'));
    expect(await screen.findByLabelText('Trip origin, Current location')).toBeTruthy();
    expect(screen.getByLabelText('Trip destination, Stony Brook University Main Campus')).toBeTruthy();
  });

  it('starts and ends a searched trip from its detail screen, with no Go buttons on result cards', async () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    fireEvent.press(screen.getByTestId('destination-field'));
    await pickPlace(screen, 'times', 'times-square');

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
    expect(screen.getByLabelText(/^Trip (origin|destination), Times Square$/)).toBeTruthy();

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
    // Fare is the real, computed Zone 10 LIRR + subway fare (see lirrFares.ts), which depends
    // on whether it's currently LIRR peak or off-peak — pinned here (a weekday 10am, off-peak)
    // so the expected dollar amount is deterministic.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2024, 0, 1, 10, 0, 0));
    try {
      const screen = render(<App />);
      fireEvent.press(screen.getByTestId('tab-recents'));
      const card = screen.getByTestId('recent-trip-times-square');

      expect(within(card).getByLabelText('PJ rail')).toBeTruthy();
      expect(within(card).getByLabelText('E train')).toBeTruthy();
      expect(within(card).getByText('8:42 AM – 10:16 AM')).toBeTruthy();
      expect(within(card).getByText('94 min')).toBeTruthy();
      expect(within(card).getByText('$15.15')).toBeTruthy();
      expect(within(card).getByText('3 days ago')).toBeTruthy();
      expect(within(card).getByText('From Stony Brook University')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
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

  it('renders home surfaces dark while route cards keep their colors', async () => {
    const screen = renderDark();
    expect(backgroundOf(screen.getByTestId('transit-sheet'))).toBe(darkColors.surface);
    // Only reachable once the mocked dynamic discovery resolves (jest.setup.js's
    // findNearbyTransit mock), under its synthesized id.
    expect(backgroundOf(await screen.findByTestId(`route-card-${cardIdFor(routeById.e)}`))).toBe(routeById.e.color);
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

  it('renders route detail, trip detail, and settings dark', async () => {
    const screen = renderDark();
    // Both Google maps are recolored dark (and still hide places), not left bright.
    const isDarkMap = (map: { props: { customMapStyle?: { featureType?: string; elementType?: string; stylers: { color?: string }[] }[] } }) => {
      const style = map.props.customMapStyle ?? [];
      expect(style.find((rule) => !rule.featureType && rule.elementType === 'geometry')?.stylers[0]?.color).toBe('#16171A');
      expect(style).toContainEqual({ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] });
    };
    isDarkMap(await screen.findByTestId('google-map-view', { includeHiddenElements: true }));
    fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
    expect(backgroundOf(screen.getByTestId('route-detail-content'))).toBe(darkColors.surface);
    isDarkMap(await screen.findByTestId('route-map', { includeHiddenElements: true }));
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

  it('draws route and trip overlays on the illustrated map', async () => {
    const hidden = { includeHiddenElements: true };
    const screen = render(<App />);
    // Routes with real, complete station geometry (Port Jefferson Branch, E, 7) render the
    // real map once it's fetched from the (mocked) backend; every other route still uses the
    // illustrated overlay immediately.
    fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
    expect(await screen.findByTestId('route-map', hidden)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId(/^route-stop-/, hidden)).toHaveLength(22));
    fireEvent.press(screen.getByTestId('route-back'));

    // Only reachable once the mocked dynamic discovery resolves (jest.setup.js's
    // findNearbyTransit mock), under its synthesized id.
    fireEvent.press(await screen.findByTestId(`route-card-${cardIdFor(routeById.e)}-primary`));
    expect(await screen.findByTestId('route-map', hidden)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId(/^route-stop-/, hidden)).toHaveLength(32));
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

  it("batches each agency's cards into one request, without waiting on another agency", async () => {
    const callableNamed = (name: string) => {
      const index = (httpsCallable as jest.Mock).mock.calls.findIndex((call) => call[1] === name);
      return (httpsCallable as jest.Mock).mock.results[index]!.value as jest.Mock;
    };
    const live = callableNamed('getRouteLiveStatus');
    const batch = callableNamed('getRoutesLiveStatus');
    const nearest = callableNamed('getNearestRouteStop');
    batch.mockClear();
    const liveDefault = live.getMockImplementation();
    nearest.mockClear();
    // New backend: the nearest stop comes back in the same call. The E's request never settles.
    live.mockImplementation((request: { routeId: string; agencyId: string }) => (
      request.routeId === 'E'
        ? new Promise(() => undefined)
        : Promise.resolve({
          data: {
            routeId: request.routeId,
            routeName: 'Mock Route',
            vehicles: [],
            stopPredictions: { towardDirection1: [{ minutes: 4, live: true, peakOffpeak: null }], towardDirection0: [{ minutes: 18, live: false, peakOffpeak: null }] },
            nearestStop: { distanceMeters: 100, direction1: { stopId: '14', name: 'Stony Brook' }, direction0: { stopId: '14', name: 'Stony Brook' } },
          },
        })
    ));
    try {
      const screen = render(<App />);
      const pj = await screen.findByTestId(`route-card-${PJ_CARD}-primary`);
      await waitFor(() => expect(within(pj).getAllByText('minutes').length).toBeGreaterThan(0));
      expect(live).toHaveBeenCalledWith(expect.objectContaining({ routeId: '10', lat: expect.any(Number), lon: expect.any(Number) }));
      // No separate nearest-stop round trip once the backend returns it.
      expect(nearest).not.toHaveBeenCalled();
      // One batch per agency, never mixing agencies: the subway batch is still stuck on the E,
      // yet the LIRR card above already filled in.
      const batches = batch.mock.calls.map(([request]) => (request as { routes: { agencyId: string }[] }).routes);
      expect(batches.length).toBeGreaterThan(0);
      for (const routes of batches) expect(new Set(routes.map((route) => route.agencyId)).size).toBe(1);
      expect(batches.some((routes) => routes.some((route) => route.agencyId === 'subway'))).toBe(true);
    } finally {
      live.mockImplementation(liveDefault);
    }
  });

  it('falls back to one request per route when the deployed backend cannot batch', async () => {
    const callableNamed = (name: string) => {
      const index = (httpsCallable as jest.Mock).mock.calls.findIndex((call) => call[1] === name);
      return (httpsCallable as jest.Mock).mock.results[index]!.value as jest.Mock;
    };
    const batch = callableNamed('getRoutesLiveStatus');
    const batchDefault = batch.getMockImplementation();
    batch.mockImplementation(() => Promise.reject(Object.assign(new Error('not found'), { code: 'functions/not-found' })));
    try {
      const screen = render(<App />);
      const pj = await screen.findByTestId(`route-card-${PJ_CARD}-primary`);
      await waitFor(() => expect(within(pj).getAllByText('minutes').length).toBeGreaterThan(0));
    } finally {
      batch.mockImplementation(batchDefault);
    }
  });

  it('opens on the last nearby list and live times saved on the device while fresh data loads', async () => {
    const callableNamed = (name: string) => {
      const index = (httpsCallable as jest.Mock).mock.calls.findIndex((call) => call[1] === name);
      return (httpsCallable as jest.Mock).mock.results[index]!.value as jest.Mock;
    };
    const pj = routeById.ronkonkoma;
    const source = pj.liveSource!;
    await AsyncStorage.setItem('pathly.nearby.v1', JSON.stringify({
      savedAt: Date.now() - 60_000,
      value: [{
        agencyId: source.agencyId, agencyDisplayName: pj.agency, routeId: source.routeId, routeName: pj.routeName, shortName: pj.shortName, color: pj.color, distanceMeters: 500,
        direction1: { stopId: source.direction1StopId, name: pj.directions[0].stopName, headsign: pj.directions[0].direction },
        direction0: { stopId: source.direction0StopId, name: pj.directions[1].stopName, headsign: pj.directions[1].direction },
      }],
    }));
    await AsyncStorage.setItem('pathly.live.v1', JSON.stringify({
      savedAt: Date.now() - 60_000,
      value: {
        [PJ_CARD]: {
          data: { routeId: '10', fetchedAt: Date.now() - 60_000, predictions: { towardDirection1: [{ minutes: 9, live: true, peakOffpeak: null }], towardDirection0: [] }, vehicles: [], nearestStop: null },
          nearestStop: null,
        },
      },
    }));
    // The backend is slow: neither the nearby search nor live status answers during this test.
    const nearby = callableNamed('findNearbyTransit');
    const batch = callableNamed('getRoutesLiveStatus');
    const nearbyDefault = nearby.getMockImplementation();
    const batchDefault = batch.getMockImplementation();
    nearby.mockImplementation(() => new Promise(() => undefined));
    batch.mockImplementation(() => new Promise(() => undefined));
    try {
      const screen = render(<App />);
      // The saved card shows at once, marked as updating, with its saved time aged by a minute.
      const card = await screen.findByTestId(`route-card-${PJ_CARD}-primary`);
      expect(screen.getByTestId('nearby-refreshing')).toBeTruthy();
      await waitFor(() => expect(within(card).getByText('8')).toBeTruthy());
    } finally {
      nearby.mockImplementation(nearbyDefault);
      batch.mockImplementation(batchDefault);
    }
  });

  it('labels directions by destination only and titles cards with the route short name', async () => {
    const hidden = { includeHiddenElements: true };
    const screen = render(<App />);
    const cardId = cardIdFor(routeById['51']);
    await screen.findByTestId(`route-card-${cardId}-primary`);
    await waitFor(() => expect(screen.getAllByText('minutes', hidden).length).toBeGreaterThan(0));

    for (const title of screen.getAllByTestId(`transit-${cardId}-title`, hidden)) expect(title.props.children).toBe('51');
    expect(screen.queryAllByText(/^(Westbound|Eastbound|Northbound|Southbound) to |^Toward /, hidden)).toHaveLength(0);

    fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
    expect(screen.getByTestId('route-detail-destination').props.children).toBe('Penn Station');
    expect(screen.getAllByLabelText(/^Show .* predictions$/).map((dot) => dot.props.accessibilityLabel)).toEqual(['Show Penn Station predictions', 'Show Port Jefferson predictions']);
    expect(screen.queryAllByText(/^(Westbound|Eastbound) to |^Toward /, hidden)).toHaveLength(0);
    expect(screen.queryByTestId('route-fare')).toBeNull();

    // The subway used to show a flat-fare row; no route detail has one now.
    fireEvent.press(screen.getByTestId('route-back'));
    fireEvent.press(await screen.findByTestId(`route-card-${cardIdFor(routeById.e)}-primary`));
    await screen.findAllByLabelText(/minutes?, (live GPS prediction|scheduled time)$/);
    expect(screen.queryByTestId('route-fare')).toBeNull();
  });

  it('searches Nearby around the map center after the rider pans the home map', async () => {
    const callableNamed = (name: string) => {
      const index = (httpsCallable as jest.Mock).mock.calls.findIndex((call) => call[1] === name);
      return (httpsCallable as jest.Mock).mock.results[index]!.value as jest.Mock;
    };
    const nearby = callableNamed('findNearbyTransit');
    const screen = render(<App />);
    await screen.findByTestId(`route-card-${PJ_CARD}`);
    expect(screen.queryByTestId('search-center')).toBeNull();

    const map = screen.getByTestId('google-map-view', { includeHiddenElements: true });
    fireEvent(map, 'panDrag');
    fireEvent(map, 'regionChangeComplete', { latitude: 40.7685, longitude: -73.5251, latitudeDelta: 0.05, longitudeDelta: 0.05 });
    // A solid purple dot the size of the GPS dot, not a faint ring.
    const centerStyle = StyleSheet.flatten(screen.getByTestId('search-center').props.style);
    expect(centerStyle).toEqual(expect.objectContaining({ width: 17, height: 17, backgroundColor: lightColors.searchCenter }));
    await waitFor(() => expect(nearby).toHaveBeenLastCalledWith({ lat: 40.7685, lon: -73.5251 }));
    // Each card's stop and departures are for the stop nearest the dot, not the rider.
    await waitFor(() => expect(callableNamed('getRouteLiveStatus')).toHaveBeenCalledWith(expect.objectContaining({ lat: 40.7685, lon: -73.5251 })));

    // A programmatic move (no rider drag) doesn't start a center search.
    nearby.mockClear();
    fireEvent(map, 'regionChangeComplete', { latitude: 40.9, longitude: -73.1, latitudeDelta: 0.05, longitudeDelta: 0.05 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(nearby).not.toHaveBeenCalledWith({ lat: 40.9, lon: -73.1 });

    // The location button returns Nearby (and its cards' stops) to the rider and hides the dot.
    callableNamed('getRouteLiveStatus').mockClear();
    fireEvent.press(await screen.findByLabelText('Center on current location'));
    expect(screen.queryByTestId('search-center')).toBeNull();
    // Location is denied in tests, so the rider's location is the Stony Brook fallback.
    await waitFor(() => expect(nearby).toHaveBeenLastCalledWith({ lat: SERVICE_AREA_FALLBACK.latitude, lon: SERVICE_AREA_FALLBACK.longitude }));
    await waitFor(() => expect(callableNamed('getRouteLiveStatus')).toHaveBeenCalledWith(expect.objectContaining({ lat: SERVICE_AREA_FALLBACK.latitude, lon: SERVICE_AREA_FALLBACK.longitude })));
  });

  it("hides Google's points of interest on the home and route maps", async () => {
    const hidesPlaces = (map: { props: { customMapStyle?: unknown } }) => expect(map.props.customMapStyle).toEqual([
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ]);
    const screen = render(<App />);
    fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
    hidesPlaces(await screen.findByTestId('route-map', { includeHiddenElements: true }));
    fireEvent.press(screen.getByTestId('route-back'));
    hidesPlaces(await screen.findByTestId('google-map-view', { includeHiddenElements: true }));
  });

  it('shows a compass after the rider rotates the home map, and reorients to north', async () => {
    const maps = jest.requireMock('react-native-maps') as { mockAnimateCamera: jest.Mock; mockCamera: { heading: number; pitch: number } };
    const screen = render(<App />);
    await screen.findByTestId(`route-card-${PJ_CARD}`);
    const map = screen.getByTestId('google-map-view', { includeHiddenElements: true });
    const settle = async () => {
      fireEvent(map, 'regionChangeComplete', { latitude: 40.9, longitude: -73.1, latitudeDelta: 0.05, longitudeDelta: 0.05 });
      await act(async () => {});
    };
    expect(screen.queryByTestId('reorient-map')).toBeNull();

    // Twisted so north points right (heading 90): the compass appears, its needle pointing right.
    maps.mockCamera.heading = 90;
    try {
      await settle();
      const needle = StyleSheet.flatten(screen.getByTestId('reorient-needle', { includeHiddenElements: true }).props.style);
      expect(needle.transform).toEqual([{ rotate: '-90deg' }]);

      maps.mockAnimateCamera.mockClear();
      fireEvent.press(screen.getByTestId('reorient-map'));
      expect(maps.mockAnimateCamera).toHaveBeenCalledWith({ heading: 0, pitch: 0 }, expect.objectContaining({ duration: expect.any(Number) }));

      // Back at north-up, the compass goes away.
      maps.mockCamera.heading = 0;
      await settle();
      expect(screen.queryByTestId('reorient-map')).toBeNull();

      // A tilt alone also counts.
      maps.mockCamera.pitch = 30;
      await settle();
      expect(screen.getByTestId('reorient-map')).toBeTruthy();
    } finally {
      maps.mockCamera.heading = 0;
      maps.mockCamera.pitch = 0;
    }
  });

  it('reopens the home map on the purple dot after visiting a route', async () => {
    const { mockAnimateToRegion } = jest.requireMock('react-native-maps') as { mockAnimateToRegion: jest.Mock };
    const screen = render(<App />);
    await screen.findByTestId(`route-card-${PJ_CARD}`);
    const hicksville = { latitude: 40.7685, longitude: -73.5251, latitudeDelta: 0.08, longitudeDelta: 0.08 };
    const map = screen.getByTestId('google-map-view', { includeHiddenElements: true });
    fireEvent(map, 'panDrag');
    fireEvent(map, 'regionChangeComplete', hicksville);
    expect(screen.getByTestId('search-center')).toBeTruthy();

    fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
    await screen.findByTestId('route-back');
    mockAnimateToRegion.mockClear();
    fireEvent.press(screen.getByTestId('route-back'));

    // The rebuilt map opens where the rider left it, with the dot, and isn't pulled back to GPS.
    const reopened = await screen.findByTestId('google-map-view', { includeHiddenElements: true });
    expect(reopened.props.region).toEqual(hicksville);
    expect(screen.getByTestId('search-center')).toBeTruthy();
    await act(async () => {});
    expect(mockAnimateToRegion).not.toHaveBeenCalled();
  });

  it('keeps the home map where the rider panned it until the location button is pressed', async () => {
    const { mockAnimateToRegion } = jest.requireMock('react-native-maps') as { mockAnimateToRegion: jest.Mock };
    let onPosition: ((position: { coords: { latitude: number; longitude: number } }) => void) | undefined;
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 40.92, longitude: -73.13 } });
    (Location.watchPositionAsync as jest.Mock).mockImplementationOnce((_options, callback) => {
      onPosition = callback;
      return Promise.resolve({ remove: jest.fn() });
    });
    mockAnimateToRegion.mockClear();

    const screen = render(<App />);
    await screen.findByTestId(`route-card-${PJ_CARD}`);
    // The first fix centers the map once.
    await waitFor(() => expect(mockAnimateToRegion).toHaveBeenCalledWith(expect.objectContaining({ latitude: 40.92, longitude: -73.13 }), expect.any(Number)));

    const map = screen.getByTestId('google-map-view', { includeHiddenElements: true });
    fireEvent(map, 'panDrag');
    fireEvent(map, 'regionChangeComplete', { latitude: 40.7685, longitude: -73.5251, latitudeDelta: 0.05, longitudeDelta: 0.05 });
    mockAnimateToRegion.mockClear();

    // Routine GPS updates move only the rider's dot, not the map.
    await waitFor(() => expect(onPosition).toBeDefined());
    await act(async () => onPosition!({ coords: { latitude: 40.93, longitude: -73.12 } }));
    await act(async () => onPosition!({ coords: { latitude: 40.94, longitude: -73.11 } }));
    expect(mockAnimateToRegion).not.toHaveBeenCalled();

    // The location button brings the map back to the rider.
    fireEvent.press(screen.getByLabelText('Center on current location'));
    await waitFor(() => expect(mockAnimateToRegion).toHaveBeenCalledWith(expect.objectContaining({ latitude: 40.92, longitude: -73.13 }), expect.any(Number)));
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
  });

  describe('live data for visible routes only', () => {
    const liveCall = () => {
      const index = (httpsCallable as jest.Mock).mock.calls.findIndex((call) => call[1] === 'getRouteLiveStatus');
      return (httpsCallable as jest.Mock).mock.results[index]!.value as jest.Mock;
    };
    // Distinct routes requested (the mocked backend predates in-call nearest stops, so each route's
    // fetch also re-requests for its nearest stop).
    const requestedRouteIds = () => [...new Set(liveCall().mock.calls.map(([request]) => (request as { routeId: string }).routeId))].sort();

    afterEach(() => {
      jest.useRealTimers();
    });

    it('polls only the active routes and fetches a newly active one right away', async () => {
      jest.useFakeTimers();
      // Ten extra live routes beside the built-in demo ones; only three are on screen.
      const extra = Array.from({ length: 10 }, (_, index) => ({
        ...routeById.ronkonkoma,
        id: `extra-${index}`,
        liveSource: { ...routeById.ronkonkoma.liveSource!, routeId: `X${index}` },
      }));
      const location = SERVICE_AREA_FALLBACK;
      liveCall().mockClear();
      const screen = render(<TransitLiveProvider activeRouteIds={['extra-0', 'extra-1', 'extra-2']} extraRoutes={extra} location={location}>{null}</TransitLiveProvider>);
      await act(async () => {});
      expect(requestedRouteIds()).toEqual(['X0', 'X1', 'X2']);

      // A fourth route comes into view: fetched now, without re-fetching the other three.
      liveCall().mockClear();
      screen.rerender(<TransitLiveProvider activeRouteIds={['extra-0', 'extra-1', 'extra-2', 'extra-3']} extraRoutes={extra} location={location}>{null}</TransitLiveProvider>);
      await act(async () => {});
      expect(requestedRouteIds()).toEqual(['X3']);

      // The poll refreshes exactly the four active routes.
      liveCall().mockClear();
      await act(async () => {
        jest.advanceTimersByTime(15_000);
      });
      expect(requestedRouteIds()).toEqual(['X0', 'X1', 'X2', 'X3']);
      screen.unmount();
    });

    it('follows the home cards on screen as the list scrolls, and only the open route behind a detail', async () => {
      jest.useFakeTimers();
      // A current backend (nearest stop resolved in the same call), so each route is one request.
      const original = liveCall().getMockImplementation();
      liveCall().mockImplementation((request: { routeId: string }) => Promise.resolve({
        data: { routeId: request.routeId, routeName: 'Mock Route', vehicles: [], nearestStop: null, stopPredictions: { towardDirection1: [{ minutes: 4, live: true, peakOffpeak: null }], towardDirection0: [] } },
      }));
      try {
        const screen = render(<App />);
        await screen.findByTestId(`route-card-${PJ_CARD}`);
        const slots = screen.getAllByTestId(/^card-slot-/).map((slot) => slot.props.testID.replace('card-slot-', '') as string);
        expect(slots.length).toBeGreaterThanOrEqual(6);
        const routeIdOf = (cardId: string) => cardId.split(':')[1]!;
        const layout = (testID: string, y: number, height: number) => fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y, width: 390, height } } });

        // A 600 pt window over the page: cards start 350 pt down and are 104 pt tall, so the
        // first three are on screen.
        layout('nearby-route-list', 0, 600);
        layout('transit-sheet', 300, 2000);
        layout('nearby-route-content', 50, 1500);
        layout('nearby-routes', 0, 1500);
        slots.forEach((cardId, index) => layout(`card-slot-${cardId}`, index * 104, 104));
        await act(async () => {
          jest.advanceTimersByTime(20_000);
        });
        liveCall().mockClear();
        await act(async () => {
          jest.advanceTimersByTime(15_000);
        });
        expect(requestedRouteIds()).toEqual(slots.slice(0, 3).map(routeIdOf).sort());

        // Scrolling down 300 pt brings cards 4–6 into view; they're fetched right away.
        liveCall().mockClear();
        fireEvent(screen.getByTestId('nearby-route-list'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 0, y: 300 } } });
        await act(async () => {
          jest.advanceTimersByTime(200);
        });
        expect(requestedRouteIds()).toEqual(slots.slice(3, 6).map(routeIdOf).sort());

        // Behind an open route detail, only that route is refreshed.
        fireEvent.press(screen.getByTestId(`route-card-${PJ_CARD}-primary`));
        await act(async () => {
          jest.advanceTimersByTime(1_000);
        });
        liveCall().mockClear();
        await act(async () => {
          jest.advanceTimersByTime(15_000);
        });
        expect(requestedRouteIds()).toEqual(['10']);
      } finally {
        liveCall().mockImplementation(original);
      }
    });
  });

  it('keeps a route detail open when a location update drops it from the nearby list', async () => {
    const callableNamed = (name: string) => {
      const index = (httpsCallable as jest.Mock).mock.calls.findIndex((call) => call[1] === name);
      return (httpsCallable as jest.Mock).mock.results[index]!.value as jest.Mock;
    };
    let onPosition: ((position: { coords: { latitude: number; longitude: number } }) => void) | undefined;
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({ coords: { latitude: 40.92, longitude: -73.13 } });
    (Location.watchPositionAsync as jest.Mock).mockImplementationOnce((_options, callback) => {
      onPosition = callback;
      return Promise.resolve({ remove: jest.fn() });
    });

    const screen = render(<App />);
    const cardId = cardIdFor(routeById['51']);
    fireEvent.press(await screen.findByTestId(`route-card-${cardId}-primary`));
    expect(screen.getByTestId(`route-detail-${cardId}`)).toBeTruthy();

    // The rider walks away: the next nearby search no longer includes this route.
    callableNamed('findNearbyTransit').mockImplementationOnce(() => Promise.resolve({ data: { routes: [] } }));
    await waitFor(() => expect(onPosition).toBeDefined());
    await act(async () => onPosition!({ coords: { latitude: 40.75, longitude: -73.99 } }));
    await waitFor(() => expect(callableNamed('findNearbyTransit')).toHaveBeenLastCalledWith({ lat: 40.75, lon: -73.99 }));
    await act(async () => {});

    expect(screen.getByTestId(`route-detail-${cardId}`)).toBeTruthy();
  });

  describe('Port Jefferson route detail', () => {
    const hidden = { includeHiddenElements: true };
    // jest.setup.js's httpsCallable mock creates one jest.fn per backend function at import time.
    const callable = (name: string) => {
      const index = (httpsCallable as jest.Mock).mock.calls.findIndex((call) => call[1] === name);
      return (httpsCallable as jest.Mock).mock.results[index]!.value as jest.Mock;
    };
    // The mocked route-10 geometry lists stations in travel order with stopId = their index:
    // westbound (GTFS direction 1) Port Jefferson '0', Stony Brook '1', … Penn Station '21';
    // eastbound (direction 0) Penn Station '0', … Stony Brook '20', Port Jefferson '21'.
    const STONY_BROOK = { direction1: { stopId: '1', name: 'Stony Brook', headsign: null }, direction0: { stopId: '20', name: 'Stony Brook', headsign: null } };
    const NOW = new Date(2024, 0, 1, 10, 0, 0).getTime();
    const vehicle = (tripId: string, directionId: number, ageSeconds: number) => ({
      tripId, directionId, lat: 40.89, lon: -73.09, timestamp: (NOW - ageSeconds * 1000) / 1000,
    });
    const respondWithVehicles = (vehicles: ReturnType<typeof vehicle>[]) => {
      callable('getRouteLiveStatus').mockImplementation((request: { routeId: string }) => Promise.resolve({
        data: {
          routeId: request.routeId,
          routeName: 'Mock Route',
          vehicles,
          stopPredictions: {
            towardDirection1: [{ minutes: 4, live: true, peakOffpeak: null }],
            towardDirection0: [{ minutes: 18, live: false, peakOffpeak: null }],
          },
        },
      }));
    };
    let nearestDefault: ((...args: unknown[]) => unknown) | undefined;
    let liveDefault: ((...args: unknown[]) => unknown) | undefined;

    beforeEach(() => {
      nearestDefault = callable('getNearestRouteStop').getMockImplementation();
      liveDefault = callable('getRouteLiveStatus').getMockImplementation();
      callable('getNearestRouteStop').mockImplementation(() => Promise.resolve({ data: { distanceMeters: 120, ...STONY_BROOK } }));
    });

    afterEach(() => {
      callable('getNearestRouteStop').mockImplementation(nearestDefault);
      callable('getRouteLiveStatus').mockImplementation(liveDefault);
    });

    /** Opens the Port Jefferson Branch and waits for live data, nearest stop, and geometry. */
    const openPortJefferson = async () => {
      const screen = render(<App />);
      fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
      await screen.findByLabelText('4 minutes, live GPS prediction');
      await screen.findByTestId('route-map', hidden);
      await screen.findByLabelText(/^Stony Brook, nearest to you, departs /);
      return screen;
    };
    const rows = (screen: RenderResult) => screen.getAllByLabelText(/, (nearest to you, )?(departs|arrives) /).map((row) => row.props.accessibilityLabel.split(',')[0]);

    it('shows service alerts only for routes with an advisory', async () => {
      const screen = await openPortJefferson();
      expect(screen.queryByTestId('service-alerts')).toBeNull();
      expect(screen.queryByText('No delays')).toBeNull();
      screen.unmount();

      // Alerts are still placeholder data, and only the demo S1 route carries an advisory (nearby
      // discovery always reports "No delays"), so render its detail page directly.
      const s1 = render(
        <AppSettingsProvider>
          <RouteDetailView isFavorite={false} onBack={jest.fn()} onToggleFavorite={jest.fn()} route={routeById.s1} />
        </AppSettingsProvider>,
      );
      expect(s1.getByText('Advisory')).toBeTruthy();
      expect(s1.queryByText(routeById.s1.alert)).toBeNull();
      fireEvent.press(s1.getByTestId('service-alerts'));
      expect(s1.getByText(routeById.s1.alert)).toBeTruthy();
      await act(async () => {}); // settle the route's geometry fetch
    });

    it('lists route stops by name and time only, with a filled Scheduled pill', async () => {
      const screen = await openPortJefferson();
      for (const caption of ['Departs', 'Scheduled stop', 'Final stop', 'Nearest to you']) {
        expect(screen.queryByText(caption)).toBeNull();
      }
      expect(screen.getByLabelText(/^Penn Station, arrives /)).toBeTruthy();
      // The divider runs under the name and the time together.
      const pennBody = within(screen.getByLabelText(/^Penn Station, arrives /)).getByTestId('stop-row-body-Penn Station', hidden);
      expect(StyleSheet.flatten(pennBody.props.style)).toMatchObject({ borderBottomWidth: 1, flexDirection: 'row' });
      expect(within(pennBody).getByText('Penn Station', hidden)).toBeTruthy();
      expect(within(pennBody).getByText(/^\d{1,2}:\d{2} [AP]M$/, hidden)).toBeTruthy();

      // The mocked scheduled departure is in the other direction; only the active direction's tiles render.
      fireEvent.press(screen.getAllByLabelText(/^Show .* predictions$/)[1]!);
      const pill = StyleSheet.flatten(screen.getAllByTestId('route-prediction-scheduled', hidden)[0]!.props.style);
      expect(pill.backgroundColor).toBe(lightColors.mutedInk);
      expect(pill.color).toBe(lightColors.surface);
      expect(pill.borderRadius).toBeGreaterThan(0);
    });

    it('marks stops with white dots in the route color and emphasizes the nearest one', async () => {
      const screen = await openPortJefferson();
      const routeLine = screen.getByTestId('route-line', hidden);
      expect(routeLine.props.strokeColor).toBe(routeById.ronkonkoma.color);
      // Follows the backend's real shape path (mocked as 3 points per hop), not one straight
      // segment per stop pair. Westbound, the rider's Stony Brook is the second stop: the hop
      // behind it is faint, and the rest of the line ahead is full strength.
      const behindLine = screen.getByTestId('route-line-behind', hidden);
      expect(behindLine.props.strokeColor).toBe(`${routeById.ronkonkoma.color}59`);
      expect(behindLine.props.coordinates).toHaveLength(3 + 1);
      expect(routeLine.props.coordinates).toHaveLength((routeById.ronkonkoma.stops!.length - 2) * 3 + 1);
      expect(routeLine.props.coordinates[0]).toEqual(behindLine.props.coordinates[3]);

      const stops = screen.getAllByTestId(/^route-stop-/, hidden);
      expect(stops).toHaveLength(22);
      for (const stop of stops) {
        const name = stop.props.testID.replace('route-stop-', '');
        expect(stop.props.title).toBe(name);
        expect(stop.props.anchor).toEqual({ x: 0.5, y: 0.5 });
        const dot = StyleSheet.flatten(within(stop).getByTestId(`route-dot-${name}`, hidden).props.style);
        // Westbound from Stony Brook, Port Jefferson is behind the rider: its outline is faint.
        expect(dot).toMatchObject(name === 'Stony Brook'
          ? { backgroundColor: routeById.ronkonkoma.color, borderColor: '#FFFFFF', width: 20 }
          : { backgroundColor: '#FFFFFF', borderColor: name === 'Port Jefferson' ? `${routeById.ronkonkoma.color}59` : routeById.ronkonkoma.color, width: 8 });
        // Ordinary stops are exactly as wide as the line, so they don't bulge out of it.
        if (name !== 'Stony Brook') expect(dot.width).toBe(routeLine.props.strokeWidth);
      }
      // Opens zoomed on the rider's nearest station (mocked geometry places Stony Brook at 40.89, -73.09).
      const region = screen.getByTestId('route-map', hidden).props.initialRegion;
      expect(region.latitude).toBeCloseTo(40.89);
      expect(region.longitude).toBeCloseTo(-73.09);
      expect(region.latitudeDelta).toBe(0.06);
    });

    it('shows a compact route badge over the map that lets gestures through', async () => {
      const screen = await openPortJefferson();
      const badge = screen.getByTestId('route-detail-badge', hidden);
      expect(within(badge).getByText('PJ', hidden)).toBeTruthy();
      expect(within(badge).queryByText(/Port Jefferson/, hidden)).toBeNull();
      // No taller than the 46 pt map controls, and inside an overlay that ignores touches.
      expect(StyleSheet.flatten(badge.props.style).height).toBeLessThan(46);
      let overlay = badge.parent;
      while (overlay && overlay.props.pointerEvents === undefined) overlay = overlay.parent;
      expect(overlay?.props.pointerEvents).toBe('none');
    });

    it("points an arrow from the rider's stop toward the next stop, flipping with the direction", async () => {
      const screen = await openPortJefferson();
      // One arrow, anchored at the rider's stop and turned to the line's bearing there. Mocked
      // westbound runs southeast across the map (lat falls, lon rises): bearing 90°–180°.
      const arrow = () => screen.getByTestId('route-direction-arrow', hidden);
      const bearing = () => arrow().props.rotation;
      expect(screen.getAllByTestId('route-direction-arrow', hidden)).toHaveLength(1);
      expect(arrow().props.flat).toBe(true);
      // Anchored at Stony Brook itself (mocked at 40.89, -73.09).
      expect(arrow().props.coordinate.latitude).toBeCloseTo(40.89, 6);
      expect(arrow().props.coordinate.longitude).toBeCloseTo(-73.09, 6);
      expect(bearing()).toBeGreaterThan(90);
      expect(bearing()).toBeLessThan(180);

      // Eastbound flips it to the northwest.
      fireEvent.press(screen.getAllByLabelText(/^Show .* predictions$/)[1]!);
      await waitFor(() => expect(bearing()).toBeGreaterThan(270));
      // Eastbound from Stony Brook only Port Jefferson is ahead; everything else is behind.
      expect(screen.getByTestId('route-line', hidden).props.coordinates).toHaveLength(3 + 1);
    });

    it('lets only the live route map take gestures through the scrolling page', async () => {
      const screen = await openPortJefferson();
      expect(screen.getByTestId('route-detail-map').props.pointerEvents).toBe('auto');
      const routeScroll = screen.getByTestId('route-detail-scroll');
      expect(routeScroll.props.pointerEvents).toBe('box-none');
      expect(StyleSheet.flatten(routeScroll.props.contentContainerStyle)).toMatchObject({ pointerEvents: 'box-none' });
      fireEvent.press(screen.getByTestId('route-back'));

      fireEvent.press(await screen.findByTestId(`route-card-${cardIdFor(routeById.s1)}-primary`));
      await screen.findByTestId('route-map', hidden);
      fireEvent.press(screen.getByTestId('route-back'));

      fireEvent.press(screen.getByTestId('tab-recents'));
      fireEvent.press(screen.getByTestId('recent-trip-penn-station'));
      expect(screen.getByTestId('recent-trip-map').props.pointerEvents).toBe('none');
    });

    it("starts the stop list at the rider's station and runs to the end of the selected direction", async () => {
      const screen = await openPortJefferson();
      expect(rows(screen)[0]).toBe('Stony Brook');
      expect(rows(screen).at(-1)).toBe('Penn Station');
      expect(rows(screen)).not.toContain('Port Jefferson');
      expect(rows(screen)).toHaveLength(21);

      fireEvent.press(screen.getAllByLabelText(/^Show .* predictions$/)[1]!);
      await waitFor(() => expect(rows(screen)).toEqual(['Stony Brook', 'Port Jefferson']));
    });

    it('opens every transfer at a station from its +N count', async () => {
      const screen = await openPortJefferson();
      const jamaicaOtherModes = STATION_TRANSFERS.Jamaica!.filter((transfer) => transfer.agency !== 'LIRR');
      expect(screen.queryByTestId('transfers-sheet')).toBeNull();

      fireEvent.press(screen.getByTestId('stop-transfers-more-Jamaica', hidden));
      const sheet = within(await screen.findByTestId('transfers-sheet'));
      expect(screen.getByTestId('transfers-sheet-title').props.children).toBe('Jamaica');
      // Every transfer, including the ones hidden from the row, grouped under its mode.
      expect(sheet.getAllByTestId(/^transfers-sheet-chip-/)).toHaveLength(jamaicaOtherModes.length);
      for (const mode of ['subway', 'bus'] as const) {
        const group = within(screen.getByTestId(`transfers-sheet-${mode}`));
        for (const transfer of jamaicaOtherModes.filter((item) => item.mode === mode)) {
          expect(group.getByTestId(`transfers-sheet-chip-${transfer.name}`)).toBeTruthy();
        }
      }
      expect(sheet.getByText('Subway')).toBeTruthy();
      expect(sheet.getByText('Bus')).toBeTruthy();

      fireEvent.press(screen.getByTestId('transfers-sheet-close'));
      expect(screen.queryByTestId('transfers-sheet')).toBeNull();
      // Still on the same route detail.
      expect(screen.getByTestId('route-detail-destination').props.children).toBe('Penn Station');
    });

    it('shows transfer chips per station, capped with a +N count', async () => {
      const screen = await openPortJefferson();
      const smithtown = screen.getByTestId('route-transfer-Smithtown-56', hidden);
      expect(within(smithtown).getByText('56', hidden)).toBeTruthy();
      expect(screen.getByLabelText(/^Smithtown, arrives .*, transfers: (.*, )?56(,|$)/)).toBeTruthy();

      // Other LIRR branches aren't listed on an LIRR route; subway and bus connections are.
      const jamaicaOtherModes = STATION_TRANSFERS.Jamaica!.filter((transfer) => transfer.agency !== 'LIRR');
      const jamaica = within(screen.getByTestId('stop-transfers-Jamaica', hidden));
      const chips = jamaica.getAllByTestId(/^route-transfer-Jamaica-/, hidden);
      expect(chips).toHaveLength(8);
      for (const branch of STATION_TRANSFERS.Jamaica!.filter((transfer) => transfer.agency === 'LIRR')) {
        expect(screen.queryByTestId(`route-transfer-Jamaica-${branch.name}`, hidden)).toBeNull();
      }
      expect(screen.getByTestId('route-transfer-Jamaica-E', hidden)).toBeTruthy();
      expect(within(screen.getByTestId('stop-transfers-more-Jamaica', hidden)).getByText(`+${jamaicaOtherModes.length - 8}`, hidden)).toBeTruthy();
      // No fare row on route detail (any route).
      expect(screen.queryByTestId('route-fare')).toBeNull();
      expect(screen.queryByTestId('stop-transfers-St. James', hidden)).toBeNull();
    });

    it('centers the live map on the rider from the location button', async () => {
      const screen = await openPortJefferson();
      const map = () => screen.getByTestId('route-map', hidden);
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

    it('frames the whole route from the crosshair button', async () => {
      const { mockFitToCoordinates } = jest.requireMock('react-native-maps') as { mockFitToCoordinates: jest.Mock };
      const screen = await openPortJefferson();
      const map = () => screen.getByTestId('route-map', hidden);
      const overview = () => screen.getByTestId('route-overview');
      expect(screen.getByLabelText('Show the whole route')).toBeTruthy();

      const permissionRequests = (Location.requestForegroundPermissionsAsync as jest.Mock).mock.calls.length;
      mockFitToCoordinates.mockClear();
      fireEvent.press(overview());
      // Every point of the selected direction's line, padded clear of the controls.
      const lineLength = screen.getByTestId('route-line', hidden).props.coordinates.length + screen.getByTestId('route-line-behind', hidden).props.coordinates.length - 1;
      expect(mockFitToCoordinates).toHaveBeenCalledTimes(1);
      expect(mockFitToCoordinates.mock.calls[0][0]).toHaveLength(lineLength);
      expect(mockFitToCoordinates.mock.calls[0][1]).toEqual(expect.objectContaining({ animated: true, edgePadding: expect.any(Object) }));
      // About the route, not the rider: no location refresh.
      expect((Location.requestForegroundPermissionsAsync as jest.Mock).mock.calls.length).toBe(permissionRequests);
      expect(overview().props.accessibilityState).toEqual({ selected: true });

      // The two buttons are exclusive: centering on the rider deselects the overview, and back.
      fireEvent.press(screen.getByTestId('route-location'));
      expect(overview().props.accessibilityState).toEqual({ selected: false });
      fireEvent.press(overview());
      expect(screen.getByTestId('route-location').props.accessibilityState).toEqual({ selected: false });

      fireEvent(map(), 'panDrag');
      expect(overview().props.accessibilityState).toEqual({ selected: false });
      await act(async () => {}); // settle the location refresh
    });

    it('shows three fixed-width tiles with clock times for long waits and faint scheduled tiles', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(NOW);
      try {
        callable('getRouteLiveStatus').mockImplementation((request: { routeId: string }) => Promise.resolve({
          data: {
            routeId: request.routeId,
            routeName: 'Mock Route',
            vehicles: [],
            stopPredictions: {
              towardDirection1: [{ minutes: 0, live: true, peakOffpeak: null }, { minutes: 30, live: false, peakOffpeak: null }, { minutes: 124, live: false, peakOffpeak: null }],
              towardDirection0: [{ minutes: 18, live: false, peakOffpeak: null }],
            },
          },
        }));
        const screen = render(<App />);
        fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
        await screen.findByLabelText('0 minutes, live GPS prediction');
        expect(screen.queryByText('Due')).toBeNull();
        expect(screen.getByLabelText('30 minutes, scheduled time')).toBeTruthy();
        // 10:00 AM + 124 min reads as a clock time.
        expect(screen.getByLabelText('at 12:04 PM, scheduled time')).toBeTruthy();

        const tiles = [0, 1, 2].map((index) => StyleSheet.flatten(screen.getByTestId(`route-prediction-0-${index}`).props.style));
        const widths = new Set(tiles.map((tile) => tile.width));
        expect(widths.size).toBe(1);
        expect(tiles[0]!.borderWidth).toBe(3);
        expect(tiles[0]!.opacity ?? 1).toBe(1);
        expect(tiles[1]!.opacity).toBe(0.45);
        // A direction with a single departure keeps the same fixed width rather than filling the row.
        fireEvent.press(screen.getAllByLabelText(/^Show .* predictions$/)[1]!);
        expect(StyleSheet.flatten(screen.getByTestId('route-prediction-1-0').props.style).width).toBe(tiles[0]!.width);
      } finally {
        jest.useRealTimers();
      }
    });

    it('scrolls up to six departures with a More departures card, separate from the direction swipe', async () => {
      const departures = (count: number) => Array.from({ length: count }, (_, index) => ({ minutes: 3 + index * 7, live: index === 0, peakOffpeak: null }));
      callable('getRouteLiveStatus').mockImplementation((request: { routeId: string }) => Promise.resolve({
        data: { routeId: request.routeId, routeName: 'Mock Route', vehicles: [], stopPredictions: { towardDirection1: departures(7), towardDirection0: departures(2) } },
      }));
      const screen = render(<App />);
      fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
      await screen.findByLabelText('3 minutes, live GPS prediction');

      // Six tiles at most, then the More card as the row's last item.
      const tiles = screen.getByTestId('route-predictions-scroll');
      expect([0, 1, 2, 3, 4, 5].every((index) => screen.queryByTestId(`route-prediction-0-${index}`))).toBe(true);
      expect(screen.queryByTestId('route-prediction-0-6')).toBeNull();
      const tileIds = within(tiles).getAllByRole('button').map((tile) => tile.props.testID);
      expect(tileIds[tileIds.length - 1]).toBe('route-more-departures');

      // Tall, narrow tiles with a big number: about three and a half across, so the next one peeks in.
      const tileStyle = StyleSheet.flatten(screen.getByTestId('route-prediction-0-0').props.style);
      const tileWidth = tileStyle.width;
      expect(tileStyle.minHeight).toBeGreaterThan(tileWidth);
      expect(StyleSheet.flatten(within(screen.getByTestId('route-prediction-0-0')).getByText('3').props.style).fontSize).toBeGreaterThanOrEqual(40);
      // At least three and a half fit across, so the next tile always peeks in.
      const rowWidth = Math.min(750, 540) - 36; // jest's window is 750 pt wide
      expect(tileWidth * 3.5 + 8 * 3).toBeLessThanOrEqual(rowWidth);

      // The direction dots share the heading's row, above (not inside) the tiles.
      let headingRow = screen.getByTestId('route-detail-destination').parent;
      while (headingRow && within(headingRow).queryAllByLabelText(/^Show .* predictions$/).length === 0) headingRow = headingRow.parent;
      expect(within(headingRow!).queryByTestId('route-predictions-scroll')).toBeNull();

      // Scrolling the tiles keeps the direction.
      fireEvent.scroll(tiles, { nativeEvent: { contentOffset: { x: 240, y: 0 } } });
      expect(screen.getByTestId('route-detail-destination').props.children).toBe('Penn Station');

      // Swiping the heading switches direction; the tiles follow, and a short list still ends with More.
      fireEvent(screen.getByTestId('route-direction-pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 354, y: 0 } } });
      expect(screen.getByTestId('route-detail-destination').props.children).toBe('Port Jefferson');
      expect(screen.getAllByLabelText(/^Show .* predictions$/)[1]!.props.accessibilityState).toEqual({ selected: true });
      expect(screen.getByTestId('route-prediction-1-1')).toBeTruthy();
      expect(screen.queryByTestId('route-prediction-1-2')).toBeNull();
      expect(screen.queryByTestId('route-prediction-0-0')).toBeNull();
      expect(screen.getByTestId('route-more-departures')).toBeTruthy();
    });

    it('opens every upcoming departure from More departures and returns to the same direction', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(NOW);
      try {
        const screen = await openPortJefferson();
        // Switch to the second direction (Port Jefferson) before opening the list.
        fireEvent.press(screen.getAllByLabelText(/^Show .* predictions$/)[1]!);
        fireEvent.press(screen.getByTestId('route-more-departures'));

        expect(await screen.findByTestId('departures-view')).toBeTruthy();
        expect(screen.getByTestId('departures-destination').props.children).toBe('Port Jefferson');
        expect(screen.getByTestId('departures-stop').props.children).toBe('From Stony Brook');
        // Eastbound is GTFS direction 0 from the rider's nearest Stony Brook stop.
        expect(callable('getStopDepartures')).toHaveBeenLastCalledWith(expect.objectContaining({ routeId: '10', direction1StopId: '1', direction0StopId: '20', directionId: 0 }));
        await screen.findByTestId('departure-row-2');
        expect(screen.getByLabelText('10:04 AM, in 4 min, live GPS prediction')).toBeTruthy();
        expect(screen.getByLabelText('10:34 AM, in 34 min, scheduled time')).toBeTruthy();
        expect(screen.getByLabelText('11:35 AM, in 1 h 35 min, scheduled time')).toBeTruthy();

        fireEvent.press(screen.getByTestId('departures-back'));
        expect(await screen.findByTestId('route-detail-destination')).toBeTruthy();
        expect(screen.getByTestId('route-detail-destination').props.children).toBe('Port Jefferson');
      } finally {
        jest.useRealTimers();
      }
    });

    it('says departures are unavailable when the full list cannot load', async () => {
      callable('getStopDepartures').mockImplementationOnce(() => Promise.reject(new Error('offline')));
      const screen = await openPortJefferson();
      fireEvent.press(screen.getByTestId('route-more-departures'));
      expect(await screen.findByTestId('departures-unavailable')).toBeTruthy();
      expect(screen.getByText('Departures unavailable right now.')).toBeTruthy();
    });

    it('keeps route stop timing and live provenance accessible', async () => {
      // Route stops are projected onto the actual current time, so the clock is pinned here.
      jest.useFakeTimers();
      jest.setSystemTime(NOW);
      try {
        const screen = await openPortJefferson();
        expect(screen.getByLabelText('4 minutes, live GPS prediction')).toBeTruthy();
        // Westbound starts at the rider's nearest station (Stony Brook), which leaves in the first
        // prediction's 4 min; Penn Station is 111 min of real schedule later.
        expect(screen.getByLabelText(/^Stony Brook, nearest to you, departs 10:04 AM, transfers: /)).toBeTruthy();
        expect(screen.getByLabelText(/^Penn Station, arrives 11:55 AM, transfers: /)).toBeTruthy();
        expect(routeById.ronkonkoma.stops).toHaveLength(22);
        fireEvent.press(screen.getAllByLabelText(/^Show .* predictions$/)[1]!);
        expect(screen.getByLabelText('18 minutes, scheduled time')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    describe('live vehicles', () => {
      beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('asks for departures from the nearest station in each direction', async () => {
        respondWithVehicles([]);
        await openPortJefferson();
        expect(callable('getRouteLiveStatus')).toHaveBeenCalledWith(expect.objectContaining({ routeId: '10', direction1StopId: '1', direction0StopId: '20' }));
      });

      it('shows only vehicles going the selected direction', async () => {
        // ronkonkoma's directions[0] is GTFS direction_id 1 (liveSource.direction1Index = 0).
        respondWithVehicles([vehicle('west', 1, 5), vehicle('east', 0, 5)]);
        const screen = await openPortJefferson();
        await screen.findByTestId('route-vehicle-west', hidden);
        expect(screen.queryByTestId('route-vehicle-east', hidden)).toBeNull();

        fireEvent.press(screen.getAllByLabelText(/^Show .* predictions$/)[1]!);
        expect(await screen.findByTestId('route-vehicle-east', hidden)).toBeTruthy();
        expect(screen.queryByTestId('route-vehicle-west', hidden)).toBeNull();
      });

      it("counts each vehicle's GPS age up every second and hides stale ones", async () => {
        respondWithVehicles([vehicle('fresh', 1, 3), vehicle('stale', 1, 6 * 60)]);
        const screen = await openPortJefferson();
        const age = () => screen.getByTestId('route-vehicle-age-fresh', hidden).props.children;
        await screen.findByTestId('route-vehicle-age-fresh', hidden);
        const start = Number.parseInt(age(), 10);
        expect(screen.queryByTestId('route-vehicle-stale', hidden)).toBeNull();

        // A borderless 42 pt white circle with a shadow, and a borderless route-color age badge with white text.
        const color = routeById.ronkonkoma.color;
        const badge = StyleSheet.flatten(screen.getByTestId('route-vehicle-badge-fresh', hidden).props.style);
        expect(badge).toMatchObject({ backgroundColor: '#FFFFFF', width: 42 });
        expect(badge.borderWidth ?? 0).toBe(0);
        expect(badge.shadowOpacity).toBeGreaterThan(0);
        expect(badge.borderRadius).toBe(badge.width / 2);
        const ageBadge = StyleSheet.flatten(screen.getByTestId('route-vehicle-age-badge-fresh', hidden).props.style);
        expect(ageBadge.backgroundColor).toBe(color);
        expect(ageBadge.borderWidth ?? 0).toBe(0);
        expect(StyleSheet.flatten(screen.getByTestId('route-vehicle-age-fresh', hidden).props.style).color).toBe('#FFFFFF');

        act(() => jest.advanceTimersByTime(2000));
        expect(age()).toBe(`${start + 2}s`);
        act(() => jest.advanceTimersByTime(60_000));
        expect(age()).toBe('1m');
      });
    });
  });
  it('keeps the route map fixed while the page and its map controls scroll', async () => {
    const screen = render(<App />);
    fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));

    const routeScroll = screen.getByTestId('route-detail-scroll');
    expect(screen.queryByTestId('route-sheet-handle')).toBeNull();
    expect(screen.queryByTestId('route-sheet-anchor')).toBeNull();
    expect(routeScroll.props.bounces).toBe(false);
    expect(routeScroll.props.overScrollMode).toBe('never');
    expect(within(routeScroll).queryByTestId('route-detail-map')).toBeNull();
    expect(screen.getByTestId('route-detail-map')).toBeTruthy();
    expect(within(routeScroll).getByTestId('route-favorite')).toBeTruthy();
    expect(screen.queryByTestId('route-pin')).toBeNull();
    expect(within(routeScroll).getByTestId('route-back')).toBeTruthy();
    expect(screen.queryByTestId(`route-detail-${PJ_CARD}-header`)).toBeNull();
    expect(within(routeScroll).getByTestId('route-detail-content')).toBeTruthy();
    expect(screen.getByTestId('route-back')).toBeTruthy();
    expect(screen.getByTestId('route-location')).toBeTruthy();
    expect(screen.getByTestId('route-favorite')).toBeTruthy();

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
