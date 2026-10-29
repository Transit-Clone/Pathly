import { act, fireEvent, render, waitFor, within, type RenderResult } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import * as Location from 'expo-location';
import * as ReactNative from 'react-native';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import App from '../App';
import { RouteDetailView } from '../src/components/RouteDetailView';
import { AppSettingsProvider } from '../src/theme/AppSettings';
import { autocompletePlaces, fetchPlaceDetails, getPlacesApiKey } from '../src/data/placesSearch';
import { SERVICE_AREA_FALLBACK } from '../src/data/serviceArea';
import { clearRouteTransfersCache } from '../src/data/routeGeometry';
import { STATION_TRANSFERS } from '../src/data/stationTransfers';
import { TransitLiveProvider } from '../src/data/TransitLiveContext';
import { routeById, routes } from '../src/data/transit';
import { formatTripClock, type Itinerary, type TransitStep, type WalkStep } from '../src/data/tripPlanning';
import { placeFromName, recordSearch, saveLocation } from '../src/data/userData';
import { darkColors, lightColors } from '../src/theme/colors';
import realItineraryFixture from './fixtures/itineraries-sbu-penn.json';

const realItineraries = realItineraryFixture as unknown as Itinerary[];

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
    'terry-road-smithtown': { ...places['terry-road-smithtown'], subtitle: '123 Terry Rd, Smithtown, NY 11787, USA', location: { latitude: 40.8562, longitude: -73.2005 } },
    'stony-brook-university': { id: 'stony-brook-university', title: 'Stony Brook University Main Campus', subtitle: '100 Nicolls Rd, Stony Brook, NY 11794, USA', location: { latitude: 40.9126, longitude: -73.1234 } },
    'times-square': { id: 'times-square', title: 'Times Square', subtitle: 'Times Sq, New York, NY 10036, USA', location: { latitude: 40.758, longitude: -73.9855 } },
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

/** Renders the signed-in home screen after persisted-trip hydration has settled. */
async function renderHome(): Promise<RenderResult> {
  const screen = render(<App />);
  await screen.findByTestId('search-trigger');
  return screen;
}

describe('Pathly prototype navigation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    // The app saves its last nearby list and live times on the device; start each test clean.
    await AsyncStorage.clear();
    mockAutocompletePlaces.mockClear();
    mockFetchPlaceDetails.mockClear();
    mockGetPlacesApiKey.mockReturnValue('test-key');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    ((httpsCallable as jest.Mock)({}, 'planTrip') as jest.Mock).mockImplementation(() => Promise.resolve({ data: { itineraries: realItineraries.map((itinerary) => ({ ...itinerary })) } }));
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
    const screen = await renderHome();

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
    const screen = await renderHome();

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
    const screen = await renderHome();

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
      const screen = await renderHome();
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

  it('expands the transit menu on the first handle tap and resets it on the second', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const screen = await renderHome();
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
    const screen = await renderHome();
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

  it('keeps the transit sheet height stable while switching tabs', async () => {
    const screen = await renderHome();
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

  it('shows search as a full-screen list with no map, pins, or match count', async () => {
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    // No sample history: a new account's Recent section stays hidden until it searches.
    expect(screen.queryByText('Recent')).toBeNull();
    expect(screen.getByTestId('search-results')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('search-input'), '142 christian ave');

    expect(screen.queryByText('Recent')).toBeNull();
    expect(screen.queryByText('Matches')).toBeNull();
    expect(screen.queryByTestId('search-match-count')).toBeNull();
    expect(screen.queryByTestId('map-backdrop', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByLabelText(/^Map result/)).toBeNull();
  });

  it('leads the empty search with Choose on map, which plans to the dropped pin', async () => {
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.press(screen.getByTestId('search-choose-on-map'));
    expect(screen.getByTestId('map-picker')).toBeTruthy();
    const pickerMap = screen.getByTestId('map-picker-map', { includeHiddenElements: true });
    expect(pickerMap.props.mapPadding.bottom).toBeGreaterThan(0);
    // Back returns to the search, still empty.
    fireEvent.press(screen.getByTestId('map-picker-back'));
    expect(screen.getByTestId('search-choose-on-map')).toBeTruthy();

    fireEvent.press(screen.getByTestId('search-choose-on-map'));
    // The pin is named by the address under it once the map rests.
    await screen.findByText('100 Nicolls Rd');
    expect(screen.getByText('Stony Brook, NY 11794')).toBeTruthy();
    fireEvent.press(screen.getByTestId('map-picker-set'));
    await screen.findByTestId('route-results-view');
    expect(screen.getAllByText('100 Nicolls Rd').length).toBeGreaterThan(0);
    expect(screen.queryByText('Dropped pin')).toBeNull();
  });

  it('finds transit lines by name and opens the whole line, with Back returning to search', async () => {
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    expect(screen.queryByTestId('search-lines')).toBeNull();
    fireEvent.changeText(screen.getByTestId('search-input'), 'port');
    fireEvent.press(await screen.findByTestId('search-line-lirr-10'));
    await screen.findByTestId('route-map', { includeHiddenElements: true });
    // The whole line, in general: every stop from the first, with no times, departures or stop of the rider's.
    await screen.findByLabelText(/^Port Jefferson(,|$)/);
    expect(screen.queryByLabelText(/nearest to you|departs|arrives/)).toBeNull();
    expect(screen.queryByTestId('route-predictions-scroll')).toBeNull();
    fireEvent.press(screen.getByTestId('route-back'));
    expect(await screen.findByTestId('search-view')).toBeTruthy();
  });

  it('shows Google place suggestions with a pin icon, bold name, and address', async () => {
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');
    expect(screen.getByTestId('search-loading')).toBeTruthy();

    const row = await screen.findByTestId('search-result-stony-brook-university');
    expect(within(row).getByText('location', { includeHiddenElements: true })).toBeTruthy();
    expect(within(row).getByText('Stony Brook University')).toBeTruthy();
    expect(within(row).getByText('Stony Brook, NY')).toBeTruthy();
    expect(mockAutocompletePlaces).toHaveBeenCalledTimes(1);
  });

  it('shows a saved place that matches the search first, with its own icon', async () => {
    await saveLocation('test-uid', { id: 'gym-place', title: 'Gold Gym', subtitle: '5 Oak St', location: { latitude: 40.8, longitude: -73.1 } }, 'Destination');
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'oak');
    const row = await screen.findByTestId('search-result-gym-place');
    expect(within(row).getByTestId('search-kind-icon-saved', { includeHiddenElements: true })).toBeTruthy();
    expect(within(row).getByText('Gold Gym')).toBeTruthy();
  });

  it('shows the empty state when Google finds no places', async () => {
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'zzzz');
    expect(await screen.findByText('No places found')).toBeTruthy();
  });

  it('shows a retryable error when place search fails', async () => {
    mockAutocompletePlaces.mockRejectedValueOnce(new Error('offline'));
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');

    expect(await screen.findByText("Couldn't load places")).toBeTruthy();
    expect(screen.queryByText(/offline/)).toBeNull();
    fireEvent.press(screen.getByTestId('search-retry'));
    expect(await screen.findByTestId('search-result-stony-brook-university')).toBeTruthy();
  });

  it('explains when place search is not configured', async () => {
    // jest.setup.js signs in as test-uid; give that account one past search.
    await recordSearch('test-uid', { id: 'penn-station', title: 'Penn Station', subtitle: 'New York, NY' });
    mockGetPlacesApiKey.mockReturnValue('');
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');

    expect(screen.getByText('Place search is unavailable')).toBeTruthy();
    expect(mockAutocompletePlaces).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('search-input'), '');
    fireEvent.press(screen.getByTestId('search-result-penn-station'));
    expect(screen.getByLabelText(/^Trip (origin|destination), Penn Station$/)).toBeTruthy();
  });

  it('opens route results with the resolved place name', async () => {
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');
    fireEvent.press(await screen.findByTestId('search-result-stony-brook-university'));

    expect(await screen.findByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByLabelText(/^Trip (origin|destination), Stony Brook University Main Campus$/)).toBeTruthy();
    expect(mockFetchPlaceDetails).toHaveBeenCalledWith(expect.objectContaining({ placeId: 'stony-brook-university' }));
  });

  it('stays on search with an error when place details fail', async () => {
    mockFetchPlaceDetails.mockRejectedValueOnce(new Error('500'));
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), 'Stony Brook');
    fireEvent.press(await screen.findByTestId('search-result-stony-brook-university'));

    expect(await screen.findByTestId('search-selection-error')).toBeTruthy();
    expect(screen.getByTestId('search-view')).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-result-stony-brook-university'));
    expect(await screen.findByTestId('route-results-view')).toBeTruthy();
  });

  it("lists Pathly's stops with their lines above Google's places, and marks Google stations by kind", async () => {
    const hidden = { includeHiddenElements: true };
    const originalAutocomplete = mockAutocompletePlaces.getMockImplementation();
    mockAutocompletePlaces.mockImplementation(async ({ input }) => (input.toLowerCase().includes('jamaica')
      ? [
        { id: 'g-jamaica-station', title: 'Jamaica Station', subtitle: 'Queens, NY, USA', kind: 'rail', source: 'google' },
        { id: 'g-sutphin', title: 'Sutphin Blvd-Archer Av-JFK Airport', subtitle: 'Queens, NY, USA', kind: 'subway', source: 'google' },
        { id: 'g-jamaica-ave', title: 'Jamaica Ave', subtitle: 'Queens, NY, USA', kind: 'place', source: 'google' },
      ]
      : []));
    try {
      const screen = await renderHome();
      fireEvent.press(screen.getByTestId('search-trigger'));
      fireEvent.changeText(screen.getByTestId('search-input'), 'jamaica');
      await waitFor(() => expect(screen.getAllByTestId(/^search-result-[^r]/).map((row) => row.props.testID)).toEqual([
        'search-result-stop:lirr:15',
        'search-result-g-sutphin',
        'search-result-g-jamaica-ave',
      ]));
      // The stop: a rail icon, six of its eight branches as badges, and "+2".
      const stopRow = screen.getByTestId('search-result-stop:lirr:15');
      expect(stopRow.props.accessibilityLabel).toBe('Jamaica, LIRR station, lines BY, FR, HM, and 5 more');
      expect(within(stopRow).getByText('LIRR station', hidden)).toBeTruthy();
      expect(within(stopRow).getByTestId('search-kind-icon-rail', hidden)).toBeTruthy();
      expect(within(screen.getByTestId('search-routes-stop:lirr:15', hidden)).getByLabelText('BY rail', hidden)).toBeTruthy();
      expect(within(stopRow).getByText('+2', hidden)).toBeTruthy();
      // Google's own station row carries its kind's icon and, from Pathly's stops, its lines; a plain place keeps the pin.
      expect(within(screen.getByTestId('search-result-g-sutphin')).getByTestId('search-kind-icon-subway', hidden)).toBeTruthy();
      await waitFor(() => expect(within(screen.getByTestId('search-result-g-sutphin')).getByLabelText('J train', hidden)).toBeTruthy());
      expect(screen.getByTestId('search-result-g-sutphin').props.accessibilityLabel).toBe('Sutphin Blvd-Archer Av-JFK Airport, MTA Subway station, lines E, J, Z');
      expect(within(screen.getByTestId('search-result-g-jamaica-ave')).getByTestId('search-kind-icon-place', hidden)).toBeTruthy();

      // Picking the stop needs no details request, and plans to the stop itself.
      mockFetchPlaceDetails.mockClear();
      fireEvent.press(stopRow);
      expect(await screen.findByTestId('route-results-view')).toBeTruthy();
      expect(screen.getByLabelText(/^Trip (origin|destination), Jamaica$/)).toBeTruthy();
      expect(mockFetchPlaceDetails).not.toHaveBeenCalled();

      // Its recent row keeps the icon and badges.
      fireEvent.press(screen.getByTestId('results-back'));
      fireEvent.changeText(screen.getByTestId('search-input'), '');
      const recent = await screen.findByTestId('search-result-stop:lirr:15');
      expect(within(recent).getByTestId('search-kind-icon-rail', hidden)).toBeTruthy();
      expect(within(recent).getByText('+2', hidden)).toBeTruthy();

      // Typing again: the matching recent comes first (once), above stops and Google places.
      fireEvent.changeText(screen.getByTestId('search-input'), 'jamaica');
      expect(within(screen.getAllByTestId(/^search-result-[^r]/)[0]!).getByText('LIRR station', hidden)).toBeTruthy();
      await waitFor(() => expect(screen.getByTestId('search-result-g-jamaica-ave')).toBeTruthy());
      expect(screen.getAllByTestId('search-result-stop:lirr:15')).toHaveLength(1);
      // A non-matching query leaves recents out.
      fireEvent.changeText(screen.getByTestId('search-input'), 'sutphin');
      expect(screen.queryByTestId('search-result-stop:lirr:15')).toBeNull();
    } finally {
      mockAutocompletePlaces.mockImplementation(originalAutocomplete);
    }
  });

  it('lists picked places first under Recent and reopens them without a Places request', async () => {
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    fireEvent.press(screen.getByTestId('results-back'));
    fireEvent.press(screen.getByLabelText('Cancel destination search'));
    fireEvent.press(screen.getByTestId('search-trigger'));

    const recentRows = screen.getAllByTestId(/^search-result-/);
    expect(recentRows[0].props.testID).toBe('search-result-terry-road-smithtown');
    expect(within(recentRows[0]).getByText('time', { includeHiddenElements: true })).toBeTruthy();
    mockAutocompletePlaces.mockClear();
    mockFetchPlaceDetails.mockClear();
    fireEvent.press(recentRows[0]);
    expect(screen.getByLabelText(/^Trip (origin|destination), 123 Terry Rd$/)).toBeTruthy();
    expect(mockAutocompletePlaces).not.toHaveBeenCalled();
    expect(mockFetchPlaceDetails).not.toHaveBeenCalled();
  });

  it('removes a recent search from the account history', async () => {
    await recordSearch('test-uid', { id: 'penn-station', title: 'Penn Station', subtitle: 'New York, NY' });
    await recordSearch('test-uid', { id: 'times-square', title: 'Times Square', subtitle: 'Manhattan, NY' });
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    expect(screen.getAllByTestId(/^search-result-/).map((row) => row.props.testID)).toEqual(['search-result-times-square', 'search-result-penn-station']);

    fireEvent.press(screen.getByLabelText('Remove Times Square from recent searches'));
    expect(screen.queryByTestId('search-result-times-square')).toBeNull();
    expect(screen.getByTestId('search-result-penn-station')).toBeTruthy();

    // It stays gone after leaving and reopening search, and the last one hides the section.
    fireEvent.press(screen.getByLabelText('Cancel destination search'));
    fireEvent.press(screen.getByTestId('search-trigger'));
    expect(screen.queryByTestId('search-result-times-square')).toBeNull();
    fireEvent.press(screen.getByTestId('search-recent-remove-penn-station'));
    expect(screen.queryByText('Recent')).toBeNull();
  });

  // Real itineraries (Stony Brook University → Penn Station) from jest.setup.js's planTrip mock.
  const LIRR_TRIP = realItineraries[0]!;
  const BUS_TRIP = realItineraries[1]!;
  const planTripMock = () => (httpsCallable as jest.Mock)({}, 'planTrip') as jest.Mock;
  const textOf = (element: { props: { children?: unknown } }) => [element.props.children].flat(Infinity).join('');
  const grantLocation = () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 40.9126, longitude: -73.1234 } });
  };

  /** Opens Route Results to 123 Terry Rd from the rider's location and waits for the trips. */
  const openResults = async () => {
    grantLocation();
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    await screen.findByTestId(`itinerary-${LIRR_TRIP.id}`);
    return screen;
  };

  it('opens route results from search and preserves editable criteria across controls', async () => {
    const screen = await openResults();

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
    await screen.findByTestId(`itinerary-${LIRR_TRIP.id}`);
    const callsBeforeRefresh = planTripMock().mock.calls.length;
    fireEvent.press(screen.getByTestId('refresh-results'));
    await waitFor(() => expect(planTripMock().mock.calls.length).toBe(callsBeforeRefresh + 1));

    expect(screen.getByLabelText('Trip origin, Stony Brook University Main Campus')).toBeTruthy();
    expect(screen.getByLabelText('Trip destination, Times Square')).toBeTruthy();
    // Depart at, from the current time (rounded up to 5 minutes).
    expect(textOf(screen.getByTestId('leave-time-label'))).toMatch(/^Leave \d{1,2}:\d[05] [AP]M( tomorrow)?$/);
    expect(await screen.findByText('Updated just now')).toBeTruthy();
    expect(screen.getByTestId('preference-cheapest').props.accessibilityState).toEqual({ selected: true });
    // Both real itineraries, each with its line badges, and no fare Google or the app could know.
    expect(screen.getAllByTestId(/^itinerary-[0-9a-f]{12}$/)).toHaveLength(2);
    expect(screen.getByTestId(`fare-${LIRR_TRIP.id}`).props.children).toBe('Fare N/A');
    expect(screen.queryByText('View trip')).toBeNull();

    fireEvent.press(screen.getByTestId('results-back'));
    expect(screen.getByTestId('search-view')).toBeTruthy();
  });

  it('plans from the rider to the picked place, and replans when the time changes', async () => {
    const screen = await openResults();
    expect(screen.getByTestId(`search-result-duration-${LIRR_TRIP.id}`)).toHaveTextContent('1hr 58m');
    expect(screen.getByLabelText(/View trip details to 123 Terry Rd, 1 hour 58 minutes,/)).toBeTruthy();
    expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({
      origin: { label: 'Current location', lat: 40.9126, lng: -73.1234 },
      destination: { label: '123 Terry Rd', placeId: 'terry-road-smithtown', lat: 40.8562, lng: -73.2005 },
      time: { mode: 'now' },
      modes: ['subway', 'bus', 'rail'],
    }));
    expect(textOf(screen.getByTestId('leave-time-label'))).toBe('Leave now');
    expect(textOf(screen.getByTestId(`schedule-${LIRR_TRIP.id}`))).toMatch(/8:52 AM - 10:51 AM$/);

    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-depart'));
    fireEvent.press(screen.getByTestId('leave-hour-2'));
    fireEvent.press(screen.getByTestId('leave-minute-15'));
    fireEvent.press(screen.getByTestId('leave-period-pm'));
    expect(screen.getByTestId('leave-time-done').props.accessibilityHint).toMatch(/^Plans for Leave 2:15 PM( tomorrow)?$/);
    fireEvent.press(screen.getByTestId('leave-time-done'));

    expect(screen.queryByTestId('leave-time-sheet')).toBeNull();
    expect(textOf(screen.getByTestId('leave-time-label'))).toMatch(/^Leave 2:15 PM( tomorrow)?$/);
    await waitFor(() => expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({ time: { mode: 'depart', at: expect.stringMatching(/T(18|19):15:00\.000Z$/) } })));
    // With a chosen time, the card shows departure and arrival only.
    expect(textOf(await screen.findByTestId(`schedule-${LIRR_TRIP.id}`))).toBe('8:52 AM - 10:51 AM');

    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    expect(screen.getByTestId('search-trip-duration').props.children).toBe('1hr 58m');
    expect(screen.getByTestId('search-trip-leave-time').props.children).toBe('8:52 AM');
    expect(screen.getByTestId('search-trip-arrive-time').props.children).toBe('10:51 AM');
    fireEvent.press(screen.getByTestId('search-trip-back'));
    fireEvent.press(screen.getByTestId(`search-result-view-${BUS_TRIP.id}`));
    expect(within(screen.getByTestId('search-trip-step-1')).getByText('1hr 19m')).toBeTruthy();
  });

  it('stacks long duration metrics when accessibility text is enlarged', async () => {
    jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ fontScale: 2, height: 640, scale: 2, width: 320 });
    const screen = await openResults();

    expect(StyleSheet.flatten(screen.getByTestId(`search-result-layout-${LIRR_TRIP.id}`).props.style).flexDirection).toBe('column');
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    expect(StyleSheet.flatten(screen.getByTestId('search-trip-summary-layout').props.style).flexDirection).toBe('column');
  });

  it('plans for an arrival deadline and discards a cancelled pick', async () => {
    const screen = await openResults();
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-arrive'));
    fireEvent.press(screen.getByTestId('leave-time-done'));
    // An hour from now by default.
    const arriveLabel = textOf(screen.getByTestId('leave-time-label'));
    expect(arriveLabel).toMatch(/^Arrive by \d{1,2}:\d[05] [AP]M( tomorrow)?$/);
    await waitFor(() => expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({ time: { mode: 'arrive', at: expect.any(String) } })));

    const calls = planTripMock().mock.calls.length;
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-depart'));
    fireEvent.press(screen.getByTestId('leave-time-cancel'));
    expect(textOf(screen.getByTestId('leave-time-label'))).toBe(arriveLabel);
    expect(planTripMock().mock.calls.length).toBe(calls);
  });

  it('shows tomorrow for a time that has passed today and plans for then', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-15T03:00:00Z'), advanceTimers: true });
    const screen = await openResults();
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-depart'));
    fireEvent.press(screen.getByTestId('leave-hour-7'));
    fireEvent.press(screen.getByTestId('leave-minute-00'));
    fireEvent.press(screen.getByTestId('leave-period-am'));
    fireEvent.press(screen.getByTestId('leave-time-done'));
    expect(textOf(screen.getByTestId('leave-time-label'))).toBe('Leave 7:00 AM tomorrow');
    await waitFor(() => expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({ time: { mode: 'depart', at: '2026-10-15T11:00:00.000Z' } })));
  });

  it('hides ferry trips when Ferry is excluded, without changing what Google is asked', async () => {
    const ferryTrip: Itinerary = {
      ...BUS_TRIP,
      id: 'ferryferryfe',
      steps: BUS_TRIP.steps.map((step, index) => (step.kind === 'transit' && index === BUS_TRIP.steps.findIndex((first) => first.kind === 'transit')
        ? { ...step, mode: 'ferry', agency: { name: 'NYC Ferry' }, line: { name: 'East River', shortName: 'ER', color: '#00839C' } }
        : step)),
    };
    planTripMock().mockResolvedValue({ data: { itineraries: [LIRR_TRIP, ferryTrip] } });
    try {
      const screen = await openResults();
      expect(await screen.findByTestId('itinerary-ferryferryfe')).toBeTruthy();
      expect(within(screen.getByTestId('itinerary-ferryferryfe')).getByLabelText('ER ferry', { includeHiddenElements: true })).toBeTruthy();
      const calls = planTripMock().mock.calls.length;
      fireEvent.press(screen.getByTestId('modes-control'));
      fireEvent.press(screen.getByTestId('mode-ferry'));
      expect(screen.getByText('Modes · 3')).toBeTruthy();
      await waitFor(() => expect(screen.queryByTestId('itinerary-ferryferryfe')).toBeNull());
      expect(screen.getByTestId(`itinerary-${LIRR_TRIP.id}`)).toBeTruthy();
      // Google has no ferry mode: its request is the same as with every mode on.
      expect(planTripMock().mock.calls.slice(calls).every(([request]) => JSON.stringify(request.modes) === JSON.stringify(['subway', 'bus', 'rail']))).toBe(true);
    } finally {
      planTripMock().mockImplementation(() => Promise.resolve({ data: { itineraries: realItineraries.map((itinerary) => ({ ...itinerary })) } }));
    }
  });

  it('filters itineraries by mode, asks for the remaining modes, and orders by preference', async () => {
    const screen = await openResults();
    fireEvent.press(screen.getByTestId('modes-control'));
    expect(screen.getByTestId('modes-panel')).toBeTruthy();
    expect(screen.queryByTestId('filter-panel')).toBeNull();

    // Both trips ride the LIRR, so excluding rail hides both, even though Google may return them.
    fireEvent.press(screen.getByTestId('mode-rail'));
    expect(screen.getByText('Modes · 3')).toBeTruthy();
    await waitFor(() => expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({ modes: ['subway', 'bus'] })));
    expect(await screen.findByTestId('results-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('results-reset-modes'));
    expect(await screen.findByTestId(`itinerary-${BUS_TRIP.id}`)).toBeTruthy();

    fireEvent.press(screen.getByTestId('mode-bus'));
    expect(await screen.findByTestId(`itinerary-${LIRR_TRIP.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`itinerary-${BUS_TRIP.id}`)).toBeNull();
    fireEvent.press(screen.getByTestId('mode-bus'));

    // Fewer transfers asks Google for them and orders by transfer count.
    const direct = { ...BUS_TRIP, id: 'directdirect', transfers: 0, arrivalTime: '2026-10-14T16:00:00.000Z' };
    planTripMock().mockResolvedValueOnce({ data: { itineraries: [LIRR_TRIP, direct] } });
    fireEvent.press(screen.getByTestId('filter-control'));
    expect(screen.getByTestId('filter-panel')).toBeTruthy();
    expect(screen.queryByTestId('modes-panel')).toBeNull();
    fireEvent.press(screen.getByTestId('preference-transfers'));
    await waitFor(() => expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({ preference: 'transfers' })));
    await waitFor(() => expect(screen.getAllByTestId(/^itinerary-/).map((card) => card.props.testID)).toEqual(['itinerary-directdirect', `itinerary-${LIRR_TRIP.id}`]));

    // Fastest orders by arrival; lowest fare by fare, unknown fares last.
    fireEvent.press(screen.getByTestId('preference-fastest'));
    await waitFor(() => expect(screen.getAllByTestId(/^itinerary-/)[0]!.props.testID).toBe(`itinerary-${LIRR_TRIP.id}`));
  });

  it('orders by lowest fare with unknown fares last, and labels estimates', async () => {
    const priced = (itinerary: typeof LIRR_TRIP, cents: number) => ({ ...itinerary, fare: { text: `$${(cents / 100).toFixed(2)}`, cents, currency: 'USD', estimated: true } });
    // Another line: the same route at another time would fold into LIRR_TRIP's card.
    const unpriced = { ...LIRR_TRIP, id: 'unpricedtrip', steps: LIRR_TRIP.steps.map((step) => (step.kind === 'transit' ? { ...step, line: { ...step.line, name: 'Other line', shortName: 'X' } } : step)) };
    planTripMock().mockResolvedValue({ data: { itineraries: [unpriced, priced(LIRR_TRIP, 2150), priced(BUS_TRIP, 1825)] } });
    try {
      const screen = await openResults();
      fireEvent.press(screen.getByTestId('filter-control'));
      fireEvent.press(screen.getByTestId('preference-cheapest'));
      await waitFor(() => expect(screen.getAllByTestId(/^itinerary-/).map((card) => card.props.testID)).toEqual([`itinerary-${BUS_TRIP.id}`, `itinerary-${LIRR_TRIP.id}`, 'itinerary-unpricedtrip']));
      expect(screen.getByTestId(`fare-${BUS_TRIP.id}`).props.children).toBe('$18.25');
      expect(screen.getByTestId('fare-unpricedtrip').props.children).toBe('Fare N/A');
    } finally {
      planTripMock().mockImplementation(() => Promise.resolve({ data: { itineraries: realItineraries.map((itinerary) => ({ ...itinerary })) } }));
    }
  });

  it('shows placeholder cards while planning, and honest states when there is nothing to show', async () => {
    let finish: (value: unknown) => void = () => undefined;
    planTripMock().mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
    }));
    grantLocation();
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    expect(await screen.findByLabelText('Finding trips')).toBeTruthy();
    expect(screen.getAllByTestId('itinerary-placeholder', { includeHiddenElements: true })).toHaveLength(3);
    await act(async () => finish({ data: { itineraries: [] } }));
    // Nothing runs at that hour: offer another time.
    expect(await screen.findByTestId('results-none')).toBeTruthy();
    fireEvent.press(screen.getByTestId('results-change-time'));
    expect(screen.getByTestId('leave-time-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('leave-time-cancel'));

    // A failure says so, without technical detail, and retry plans again.
    planTripMock().mockRejectedValueOnce(new Error('internal'));
    fireEvent.press(screen.getByTestId('refresh-results'));
    expect(await screen.findByTestId('results-unavailable')).toBeTruthy();
    expect(screen.getByText("Couldn't load trips")).toBeTruthy();
    fireEvent.press(screen.getByTestId('results-problem-action'));
    expect(await screen.findByTestId(`itinerary-${LIRR_TRIP.id}`)).toBeTruthy();

    // Outside the service area.
    planTripMock().mockRejectedValueOnce(Object.assign(new Error('out'), { details: { reason: 'out-of-area' } }));
    fireEvent.press(screen.getByTestId('refresh-results'));
    expect(await screen.findByTestId('results-out-of-area')).toBeTruthy();
  });

  it('asks for a starting point when the rider\'s location is unknown', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    expect(await screen.findByTestId('results-no-origin')).toBeTruthy();
    const calls = planTripMock().mock.calls.length;
    fireEvent.press(screen.getByTestId('results-problem-action'));
    // It opens search for the start, which then plans from the chosen place.
    expect(screen.getByTestId('search-view')).toBeTruthy();
    await pickPlace(screen, 'stony', 'stony-brook-university');
    expect(screen.getByLabelText('Trip origin, Stony Brook University Main Campus')).toBeTruthy();
    expect(await screen.findByTestId(`itinerary-${LIRR_TRIP.id}`)).toBeTruthy();
    expect(planTripMock().mock.calls.length).toBe(calls + 1);
    expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({ origin: { label: 'Stony Brook University Main Campus', placeId: 'stony-brook-university', lat: 40.9126, lng: -73.1234 } }));
  });

  it('keeps a started trip active through refreshes that change the list', async () => {
    const screen = await openResults();
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    fireEvent.press(screen.getByTestId('search-trip-go'));
    await screen.findByTestId('enroute-navigation-view');
    fireEvent.press(screen.getByTestId('enroute-back'));
    expect(await screen.findByTestId('resume-active-trip')).toBeTruthy();

    // A refresh that no longer lists the started trip doesn't end or replace it.
    planTripMock().mockResolvedValue({ data: { itineraries: [BUS_TRIP] } });
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    fireEvent.press(screen.getByTestId('refresh-results'));
    await waitFor(() => expect(screen.getAllByTestId(/^itinerary-/).map((card) => card.props.testID)).toEqual([`itinerary-${BUS_TRIP.id}`]), { timeout: 3000 });
    fireEvent.press(screen.getByTestId(`search-result-view-${BUS_TRIP.id}`));
    expect(screen.getByTestId('search-trip-go')).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-trip-back'));

    // Once listed again, the original trip remains globally resumable.
    planTripMock().mockResolvedValue({ data: { itineraries: [LIRR_TRIP, BUS_TRIP] } });
    fireEvent.press(screen.getByTestId('refresh-results'));
    await screen.findByTestId(`search-result-view-${LIRR_TRIP.id}`);
    fireEvent.press(screen.getByTestId('results-back'));
    fireEvent.press(screen.getByLabelText('Cancel destination search'));
    fireEvent.press(await screen.findByTestId('resume-active-trip'));
    expect(await screen.findByTestId('enroute-navigation-view')).toBeTruthy();
  });

  it('lists a planned trip step by step: walk, ride, transfer with the wait, ride', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const screen = await openResults();
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));

    const [walk, first, second] = LIRR_TRIP.steps as [WalkStep, TransitStep, TransitStep];
    expect(screen.getByLabelText(new RegExp(`^Walk ${Math.round(walk.durationSeconds / 60)} minutes, .* to ${walk.toName}$`))).toBeTruthy();
    expect(within(screen.getByTestId('search-trip-step-0')).getByText(first.line.name)).toBeTruthy();
    expect(within(screen.getByTestId('search-trip-step-0')).getByText(first.from.name)).toBeTruthy();
    // A leg with known stops in between shows its count as the control that lists them.
    expect(within(screen.getByTestId('search-trip-step-0')).getByText(`Toward ${first.headsign}`)).toBeTruthy();
    expect(within(screen.getByTestId('search-trip-stops-toggle-0')).getByText(`${first.stopCount} stops`)).toBeTruthy();
    const waitMinutes = Math.round((Date.parse(second.from.time) - Date.parse(first.to.time)) / 60_000);
    expect(screen.getByLabelText(`Transfer, wait ${waitMinutes} minutes`)).toBeTruthy();
    expect(within(screen.getByTestId('search-trip-step-1')).getByText('Penn Station')).toBeTruthy();
    // No invented alert status, and no agency name: the badge and line already say which it is.
    expect(screen.queryByTestId('search-trip-service-alerts')).toBeNull();
    expect(within(screen.getByTestId('search-trip-step-0')).queryByText(first.agency.name)).toBeNull();
    expect(openURL).not.toHaveBeenCalled();
    // No "BOARD AT" / "TRANSFER AT" / "GET OFF" labels, and no fare footnote.
    expect(screen.queryByText(/BOARD AT|TRANSFER AT|GET OFF/)).toBeNull();
    expect(screen.queryByText(/full adult one-way fare/)).toBeNull();
    // The header strip shows the walk with its minutes before the rides.
    expect(screen.getByLabelText(`Walk ${Math.round(walk.durationSeconds / 60)} minutes`)).toBeTruthy();
  });

  it('draws the trip on a real map: line colors for rides, dots for walking', async () => {
    const screen = await openResults();
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    const map = screen.getByTestId('search-trip-route-map', { includeHiddenElements: true });
    const [, first, second] = LIRR_TRIP.steps as [WalkStep, TransitStep, TransitStep];
    expect(within(map).getByTestId('trip-map-walk-0', { includeHiddenElements: true }).props.lineDashPattern).toBeTruthy();
    expect(within(map).getByTestId('trip-map-transit-1', { includeHiddenElements: true }).props.strokeColor).toBe(first.line.color);
    expect(within(map).getByTestId('trip-map-transit-2', { includeHiddenElements: true }).props.strokeColor).toBe(second.line.color);
    expect(within(map).getByTestId('trip-map-start-0', { includeHiddenElements: true })).toBeTruthy();
    expect(within(map).getAllByTestId(/^trip-map-end-/, { includeHiddenElements: true })).toHaveLength(1);
  });

  it('saves routes with one star: saved routes lead Nearby and appear in Favorites', async () => {
    const hidden = { includeHiddenElements: true };
    const screen = await renderHome();
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

  it('plans a fresh trip from a saved-place map pin and returns to Home', async () => {
    grantLocation();
    await saveLocation('test-uid', {
      id: 'work-place',
      title: 'Work',
      subtitle: '123 Main St',
      location: { latitude: 40.75, longitude: -73.99 },
    }, 'Destination');
    // Name-only saved places remain useful in Favorites, but [0, 0] must never become a map pin.
    await saveLocation('test-uid', placeFromName('Future'), 'Destination');
    const screen = await renderHome();

    const marker = await screen.findByTestId('saved-place-marker-work-place', { includeHiddenElements: true });
    expect(marker.props.coordinate).toEqual({ latitude: 40.75, longitude: -73.99 });
    expect(screen.queryByTestId('saved-place-marker-name%3AFuture', { includeHiddenElements: true })).toBeNull();
    const calls = planTripMock().mock.calls.length;
    fireEvent.press(marker);
    // The marker opens the place's details first; Go plans the trip.
    expect(planTripMock().mock.calls.length).toBe(calls);
    fireEvent.press(await screen.findByTestId('saved-place-details-go-work-place'));

    expect(await screen.findByTestId('route-results-view')).toBeTruthy();
    await waitFor(() => expect(planTripMock().mock.calls.length).toBe(calls + 1));
    expect(planTripMock()).toHaveBeenLastCalledWith(expect.objectContaining({
      destination: { label: 'Work', lat: 40.75, lng: -73.99 },
    }));
    fireEvent.press(screen.getByTestId('results-back'));
    expect(screen.getByTestId('search-trigger')).toBeTruthy();
  });

  it('saves favorite routes, and trip destinations as saved places, to the Favorites tab', async () => {
    grantLocation();
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('tab-favorites'));
    expect(screen.getByText('No favorites yet')).toBeTruthy();

    fireEvent.press(screen.getByTestId('tab-nearby'));
    // Only reachable once the mocked dynamic discovery resolves (jest.setup.js's
    // findNearbyTransit mock), under its synthesized id.
    const eCardId = cardIdFor(routeById.e);
    fireEvent.press(await screen.findByTestId(`route-card-${eCardId}-primary`));
    fireEvent.press(screen.getByTestId('route-favorite'));
    fireEvent.press(screen.getByTestId('route-back'));

    // A planned trip's star saves its destination, which stays saved whichever itinerary is open.
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    fireEvent.press(await screen.findByTestId(`search-result-view-${BUS_TRIP.id}`));
    fireEvent.press(screen.getByTestId('search-trip-favorite'));
    fireEvent.press(screen.getByTestId('search-trip-back'));
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    expect(screen.getByTestId('search-trip-favorite').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('search-trip-back'));
    fireEvent.press(screen.getByTestId('results-back'));
    fireEvent.press(screen.getByLabelText('Cancel destination search'));

    fireEvent.press(screen.getByTestId('tab-favorites'));
    expect(within(screen.getByTestId('favorite-routes')).getByTestId(`route-card-${eCardId}`)).toBeTruthy();
    const places = screen.getByTestId('saved-locations');
    expect(within(places).getByTestId('saved-location-123 Terry Rd')).toBeTruthy();
    expect(within(places).getByText('Smithtown, NY 11787')).toBeTruthy();

    fireEvent.press(within(screen.getByTestId('favorite-routes')).getByTestId(`route-card-${eCardId}-primary`));
    expect(screen.getByTestId(`route-detail-${eCardId}`)).toBeTruthy();
    expect(screen.getByTestId('route-favorite').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('route-favorite'));
    fireEvent.press(screen.getByTestId('route-back'));
    expect(screen.queryByTestId('favorite-routes')).toBeNull();

    // A saved place opens Route Results for it; unsaving from a trip there removes it.
    fireEvent.press(screen.getByTestId('saved-location-123 Terry Rd'));
    expect(screen.getByLabelText('Trip destination, 123 Terry Rd')).toBeTruthy();
    fireEvent.press(await screen.findByTestId(`search-result-view-${BUS_TRIP.id}`));
    fireEvent.press(screen.getByTestId('search-trip-favorite'));
    fireEvent.press(screen.getByTestId('search-trip-back'));
    fireEvent.press(screen.getByTestId('results-back'));
    expect(screen.getByTestId('tab-favorites').props.accessibilityState).toEqual({ selected: true });
    expect(screen.queryByTestId('saved-location-123 Terry Rd')).toBeNull();
    expect(screen.getByText('No favorites yet')).toBeTruthy();
  });

  it('shows a selected state on home and results location buttons', async () => {
    const screen = await renderHome();
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
    const screen = await renderHome();
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
    expect(textOf(screen.getByTestId('leave-time-label'))).toMatch(/^Leave \d{1,2}:\d[05] [AP]M( tomorrow)?$/);
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
    const screen = await openResults();
    fireEvent.press(screen.getByTestId('destination-field'));
    await pickPlace(screen, 'times', 'times-square');

    fireEvent.press(await screen.findByTestId(`search-result-view-${LIRR_TRIP.id}`));
    expect(screen.getByTestId(`search-trip-detail-${LIRR_TRIP.id}`)).toBeTruthy();
    expect(screen.getByLabelText('Start trip to Times Square')).toBeTruthy();
    expect(screen.getByTestId('search-trip-go')).toBeTruthy();
    expect(within(screen.getByTestId('search-trip-scroll')).queryByTestId('search-trip-go')).toBeNull();
    expect(screen.getByTestId('search-trip-location').props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(screen.getByTestId('search-trip-location'));
    expect(screen.getByTestId('search-trip-location').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('search-trip-favorite').props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(screen.getByTestId('search-trip-favorite'));
    expect(screen.getByTestId('search-trip-favorite').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('search-trip-leave-time').props.children).toBe('8:52 AM');
    expect(screen.getByTestId('search-trip-arrive-time').props.children).toBe('10:51 AM');
    expect(screen.getByTestId('search-trip-step-0')).toBeTruthy();
    expect(screen.getByTestId('search-trip-step-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('search-trip-back'));
    expect(screen.getByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByLabelText(/^Trip (origin|destination), Times Square$/)).toBeTruthy();
    expect(screen.queryByTestId(/^search-result-(go|end)-/)).toBeNull();

    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    fireEvent.press(screen.getByTestId('search-trip-go'));
    expect(await screen.findByTestId('enroute-end')).toBeTruthy();
    expect(screen.getByText('END')).toBeTruthy();

    fireEvent.press(screen.getByTestId('enroute-back'));
    fireEvent.press(await screen.findByTestId('resume-active-trip'));
    expect(await screen.findByTestId('enroute-end')).toBeTruthy();
    // Ending asks first; cancelling keeps the trip going.
    fireEvent.press(screen.getByTestId('enroute-end'));
    expect(screen.getByText('End this trip?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('enroute-end-confirm-cancel'));
    expect(screen.getByTestId('enroute-end')).toBeTruthy();
    fireEvent.press(screen.getByTestId('enroute-end'));
    fireEvent.press(screen.getByTestId('enroute-end-confirm-confirm'));
    fireEvent.press(await screen.findByTestId(/^recent-trip-/));
    expect(await screen.findByTestId('route-results-view')).toBeTruthy();
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    expect(screen.getByTestId('search-trip-go')).toBeTruthy();
  });

  it('shows an empty Recents tab instead of sample trips', async () => {
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('tab-recents'));
    expect(screen.getByText('No recent trips yet')).toBeTruthy();
    expect(screen.queryByTestId(/^recent-trip-/)).toBeNull();
  });

  it('opens profile settings and can trigger sign out', async () => {
    const screen = await renderHome();
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
    const screen = await openResults();
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));

    const plannedScroll = screen.getByTestId('search-trip-scroll');
    expect(plannedScroll.props.bounces).toBe(false);
    expect(plannedScroll.props.overScrollMode).toBe('never');
    expect(within(plannedScroll).queryByTestId('search-trip-map')).toBeNull();
    expect(screen.getByTestId('search-trip-map')).toBeTruthy();
    expect(within(plannedScroll).getByTestId('search-trip-content')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('search-trip-scroll-map-window').props.style).height).toBe(
      StyleSheet.flatten(screen.getByTestId('search-trip-map').props.style).height,
    );
    // As in Route View, the map's buttons scroll away with it.
    expect(within(plannedScroll).getByTestId('search-trip-back')).toBeTruthy();
    expect(within(plannedScroll).getByTestId('search-trip-favorite')).toBeTruthy();
    expect(screen.queryByTestId('search-trip-header')).toBeNull();
    fireEvent.scroll(plannedScroll, { nativeEvent: { contentOffset: { y: 140 } } });
    fireEvent.scroll(plannedScroll, { nativeEvent: { contentOffset: { y: 280 } } });
    fireEvent.scroll(plannedScroll, { nativeEvent: { contentOffset: { y: 0 } } });

  });

  it('expands each leg into its stops in between, with their times', async () => {
    const screen = await openResults();
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    const toggle = screen.getByTestId('search-trip-stops-toggle-0');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    expect(within(toggle).getByText('7 stops')).toBeTruthy();
    expect(screen.queryByTestId('search-trip-stops-0')).toBeNull();

    fireEvent.press(toggle);
    const firstLeg = (LIRR_TRIP.steps.filter((step) => step.kind === 'transit')[0] as TransitStep).stops!;
    const rows = within(screen.getByTestId('search-trip-stops-0')).getAllByTestId(/^search-trip-stop-0-/);
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual(
      firstLeg.map((stop) => `${stop.name}, ${formatTripClock(stop.time)}`),
    );
    expect(rows[0]!.props.accessibilityLabel).toMatch(/^St\. James, /);

    fireEvent.press(screen.getByTestId('search-trip-stops-toggle-0'));
    expect(screen.queryByTestId('search-trip-stops-0')).toBeNull();
  });

  it('marks every stop in between on the interactive trip map, and labels a tapped or listed stop', async () => {
    const hidden = { includeHiddenElements: true };
    const maps = jest.requireMock('react-native-maps') as { mockAnimateCamera: jest.Mock };
    const screen = await openResults();
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    const legs = LIRR_TRIP.steps.filter((step): step is TransitStep => step.kind === 'transit');
    // From far away the stops in between would pile up, so they wait until the map is zoomed in.
    const tripMap = screen.getByTestId('search-trip-route-map', hidden);
    fireEvent(tripMap, 'regionChangeComplete', { latitude: 40.8, longitude: -73.4, latitudeDelta: 8, longitudeDelta: 8 });
    expect(screen.queryAllByTestId(/^trip-map-via-/, hidden)).toHaveLength(0);
    expect(screen.getAllByTestId(/^trip-map-stop-/, hidden).length).toBeGreaterThan(0);
    fireEvent(tripMap, 'regionChangeComplete', { latitude: 40.8, longitude: -73.4, latitudeDelta: 0.002, longitudeDelta: 0.002 });
    const vias = screen.getAllByTestId(/^trip-map-via-/, hidden);
    expect(vias).toHaveLength(legs.reduce((total, leg) => total + (leg.stops?.length ?? 0), 0));
    expect(StyleSheet.flatten(within(vias[0]!).UNSAFE_getByType(View).props.style).borderColor).toBe(legs[0]!.line.color);

    // The map takes gestures where the content doesn't cover it.
    const map = screen.getByTestId('search-trip-route-map', hidden);
    expect(map.props.scrollEnabled).toBe(true);
    expect(map.props.zoomEnabled).toBe(true);

    fireEvent.press(vias[0]!);
    const firstStop = legs[0]!.stops![0]!;
    expect(within(screen.getByTestId('trip-map-stop-label', hidden)).getByText(`${firstStop.name} · ${formatTripClock(firstStop.time)}`, hidden)).toBeTruthy();
    fireEvent(map, 'press', { nativeEvent: { action: 'press' } });
    expect(screen.queryByTestId('trip-map-stop-label', hidden)).toBeNull();

    // A stop pressed in the list centers the map on it and labels it.
    maps.mockAnimateCamera.mockClear();
    fireEvent.press(screen.getByTestId('search-trip-stops-toggle-0'));
    fireEvent.press(screen.getByTestId('search-trip-stop-0-1'));
    const second = legs[0]!.stops![1]!;
    expect(maps.mockAnimateCamera).toHaveBeenCalledWith(expect.objectContaining({ center: { latitude: expect.closeTo(second.location.lat, 2), longitude: second.location.lng } }), expect.anything());
    expect(within(screen.getByTestId('trip-map-stop-label', hidden)).getByText(`${second.name} · ${formatTripClock(second.time)}`, hidden)).toBeTruthy();
    // No Fit button: the map has only Save and Locate.
    expect(screen.queryByLabelText('Show the whole trip')).toBeNull();
  });

  it('lets the uncovered trip maps take gestures while the page and controls keep working', async () => {
    const hidden = { includeHiddenElements: true };
    const screen = await openResults();
    expect(screen.getByTestId('results-map', hidden).props.scrollEnabled).toBe(true);
    const mapViewport = StyleSheet.flatten(screen.getByTestId('results-map-viewport').props.style);
    const sheetTop = StyleSheet.flatten(screen.getByTestId('results-sheet').props.style).top;
    expect(mapViewport.height).toBe(sheetTop);
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    expect(screen.getByTestId('search-trip-map').props.pointerEvents).toBe('auto');
    const scroll = screen.getByTestId('search-trip-scroll');
    expect(scroll.props.pointerEvents).toBe('box-none');
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({ pointerEvents: 'box-none' });
    fireEvent.press(screen.getByTestId('search-trip-favorite'));
    expect(screen.getByTestId('search-trip-favorite').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('search-trip-back'));
    expect(screen.getByTestId('route-results-view')).toBeTruthy();
  });

  it('shows a plain stop count for a leg whose stops are unknown', async () => {
    const withoutStops = {
      ...LIRR_TRIP,
      steps: LIRR_TRIP.steps.map((step) => (step.kind === 'transit' ? { ...step, stops: undefined } : step)),
    };
    planTripMock().mockResolvedValueOnce({ data: { itineraries: [withoutStops, BUS_TRIP] } });
    const screen = await openResults();
    fireEvent.press(screen.getByTestId(`search-result-view-${LIRR_TRIP.id}`));
    expect(screen.queryByTestId('search-trip-stops-toggle-0')).toBeNull();
    expect(within(screen.getByTestId('search-trip-step-0')).getByText('7 stops')).toBeTruthy();
  });

  type TestElement = ReturnType<ReturnType<typeof render>['getByTestId']>;
  const backgroundOf = (element: TestElement) => StyleSheet.flatten(element.props.style)?.backgroundColor;

  const renderDark = async () => {
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('profile-trigger'));
    fireEvent.press(screen.getByTestId('settings-row-appearance'));
    fireEvent.press(screen.getByTestId('appearance-dark'));
    fireEvent.press(screen.getByTestId('settings-back'));
    fireEvent.press(screen.getByTestId('profile-back'));
    return screen;
  };

  it('switches appearance from Settings and remembers the choice for the session', async () => {
    const screen = await renderHome();
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

  it('renders home surfaces dark while subway cards keep their official colors', async () => {
    const screen = await renderDark();
    expect(backgroundOf(screen.getByTestId('transit-sheet'))).toBe(darkColors.surface);
    // Only reachable once the mocked dynamic discovery resolves (jest.setup.js's
    // findNearbyTransit mock), under its synthesized id.
    expect(backgroundOf(await screen.findByTestId(`route-card-${cardIdFor(routeById.e)}`))).toBe(routeById.e.color);
    fireEvent.press(screen.getByTestId('tab-recents'));
    expect(backgroundOf(screen.getByTestId('recents-route-content'))).toBeUndefined();
  });

  it('renders results and the time picker dark', async () => {
    const screen = await renderDark();
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    expect(backgroundOf(screen.getByTestId('route-results-view'))).toBe(darkColors.canvas);
    fireEvent.press(screen.getByTestId('leave-time-control'));
    expect(backgroundOf(screen.getByTestId('leave-time-sheet'))).toBe(darkColors.surface);
  });

  it('renders route detail, trip detail, and settings dark', async () => {
    grantLocation();
    const screen = await renderDark();
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

    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, '123 Terry Rd', 'terry-road-smithtown');
    fireEvent.press((await screen.findAllByTestId(/^search-result-view-/))[0]!);
    expect(backgroundOf(screen.getByTestId('search-trip-content'))).toBe(darkColors.surfaceMuted);
    fireEvent.press(screen.getByTestId('search-trip-back'));
    fireEvent.press(screen.getByTestId('results-back'));
    fireEvent.press(screen.getByLabelText('Cancel destination search'));

    fireEvent.press(screen.getByTestId('profile-trigger'));
    expect(backgroundOf(screen.getByTestId('profile-view'))).toBe(darkColors.background);
    fireEvent.press(screen.getByTestId('settings-row-accessibility'));
    expect(backgroundOf(screen.getByTestId('settings-accessibility'))).toBe(darkColors.background);
  });

  it('draws route and trip overlays on the illustrated map', async () => {
    const hidden = { includeHiddenElements: true };
    const screen = await renderHome();
    // Routes with real, complete station geometry (Port Jefferson Branch, E, 7) render the
    // real map once it's fetched from the (mocked) backend; every other route still uses the
    // illustrated overlay immediately.
    fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
    expect(await screen.findByTestId('route-map', hidden)).toBeTruthy();
    // Stop dots show once they're zoomed apart.
    const zoomIn = () => fireEvent(screen.getByTestId('route-map', hidden), 'regionChangeComplete', { latitude: 40.8, longitude: -73.4, latitudeDelta: 0.001, longitudeDelta: 0.001 });
    fireEvent(screen.getByTestId('route-map', hidden), 'regionChangeComplete', { latitude: 40.8, longitude: -73.4, latitudeDelta: 2, longitudeDelta: 2 });
    expect(screen.queryAllByTestId(/^route-stop-/, hidden).length).toBeLessThanOrEqual(1);
    zoomIn();
    await waitFor(() => expect(screen.getAllByTestId(/^route-stop-/, hidden)).toHaveLength(22));
    fireEvent.press(screen.getByTestId('route-back'));

    // Only reachable once the mocked dynamic discovery resolves (jest.setup.js's
    // findNearbyTransit mock), under its synthesized id.
    fireEvent.press(await screen.findByTestId(`route-card-${cardIdFor(routeById.e)}-primary`));
    expect(await screen.findByTestId('route-map', hidden)).toBeTruthy();
    await waitFor(() => {
      zoomIn();
      expect(screen.getAllByTestId(/^route-stop-/, hidden)).toHaveLength(32);
    });
  });

  it('opens every profile category and each page does something real', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('profile-trigger'));

    for (const id of ['appearance', 'account', 'notifications', 'accessibility', 'privacy', 'travel', 'places', 'help']) {
      expect(screen.getByTestId(`settings-row-${id}`)).toBeTruthy();
    }

    fireEvent.press(screen.getByTestId('settings-row-account'));
    fireEvent.press(screen.getByTestId('account-display-name'));
    expect(screen.getByTestId('account-name-input').props.value).toBe('Pathly Rider');
    expect(screen.queryByText(/coming soon/)).toBeNull();
    expect(screen.queryByTestId('account-phone')).toBeNull();
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-notifications'));
    fireEvent(screen.getByTestId('toggle-notifications'), 'valueChange', false);
    expect(screen.getByText('Notification preferences saved')).toBeTruthy();
    expect(screen.getByTestId('notifications-not-sent')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-accessibility'));
    fireEvent.press(screen.getByTestId('text-size-large'));
    expect(screen.getByTestId('text-size-large').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('text-size-default'));
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-privacy'));
    await waitFor(() => expect(screen.getByTestId('privacy-location')).toHaveTextContent(/Not allowed/));
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-travel'));
    fireEvent.press(screen.getByTestId('travel-mode-rail'));
    expect(screen.getByTestId('travel-mode-rail').props.accessibilityState).toEqual({ checked: false });
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-places'));
    // Adding a place searches for it, and cancelling comes back to Saved places.
    fireEvent.press(screen.getByTestId('add-saved-place'));
    expect(screen.getByTestId('search-input').props.placeholder).toBe('Search for a place to save');
    fireEvent.press(screen.getByLabelText('Cancel destination search'));
    expect(screen.getByTestId('settings-places')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('settings-row-help'));
    expect(screen.getByText('Version 0.1.0')).toBeTruthy();
    fireEvent.press(screen.getByTestId('help-faq'));
    expect(screen.getByTestId('help-faq-content')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-back'));

    fireEvent.press(screen.getByTestId('sign-out'));
    expect(signOut).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts new trip searches from the travel preferences', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 40.9126, longitude: -73.1234 } });
    const screen = await renderHome();
    fireEvent.press(screen.getByTestId('profile-trigger'));
    fireEvent.press(screen.getByTestId('settings-row-travel'));
    fireEvent.press(screen.getByTestId('travel-mode-ferry'));
    fireEvent(screen.getByTestId('toggle-fewer-transfers'), 'valueChange', true);
    fireEvent(screen.getByTestId('toggle-walking'), 'valueChange', false);
    fireEvent.press(screen.getByTestId('settings-back'));
    fireEvent.press(screen.getByTestId('profile-back'));

    const planTripMock = (httpsCallable as jest.Mock)({}, 'planTrip') as jest.Mock;
    planTripMock.mockClear();
    fireEvent.press(screen.getByTestId('search-trigger'));
    await pickPlace(screen, 'times', 'times-square');

    await waitFor(() => expect(planTripMock).toHaveBeenCalled());
    // Ferry is off and fewer transfers wins over less walking (Google takes one routing preference).
    expect(planTripMock.mock.calls.at(-1)?.[0]).toMatchObject({ preference: 'transfers', modes: ['subway', 'bus', 'rail'] });
    expect(planTripMock.mock.calls.at(-1)?.[0].lessWalking).toBeUndefined();
    fireEvent.press(screen.getByTestId('filter-control'));
    expect(screen.getByTestId('preference-transfers').props.accessibilityState).toMatchObject({ selected: true });
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
      const screen = await renderHome();
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
      const screen = await renderHome();
      const pj = await screen.findByTestId(`route-card-${PJ_CARD}-primary`);
      await waitFor(() => expect(within(pj).getAllByText('minutes').length).toBeGreaterThan(0));
    } finally {
      batch.mockImplementation(batchDefault);
    }
  });

  it('shows placeholder cards on a first launch until the nearby search answers', async () => {
    const callableNamed = (name: string) => {
      const index = (httpsCallable as jest.Mock).mock.calls.findIndex((call) => call[1] === name);
      return (httpsCallable as jest.Mock).mock.results[index]!.value as jest.Mock;
    };
    const nearby = callableNamed('findNearbyTransit');
    const nearbyDefault = nearby.getMockImplementation()!;
    // Nothing saved on the device (earlier tests leave a nearby list there), and the search (not
    // the warm-up) waits until released.
    await AsyncStorage.removeItem('pathly.nearby.v1');
    const held: (() => void)[] = [];
    let released = false;
    const answer = () => {
      released = true;
      held.splice(0).forEach((release) => release());
    };
    nearby.mockImplementation((data?: { warmup?: boolean }) => {
      if (data?.warmup) return Promise.resolve({ data: { warmed: true } });
      if (released) return nearbyDefault();
      return new Promise((resolve) => {
        held.push(() => resolve(nearbyDefault()));
      });
    });
    try {
      const screen = await renderHome();
      expect(await screen.findByLabelText('Loading nearby transit')).toBeTruthy();
      expect(screen.getAllByTestId('nearby-placeholder-card', { includeHiddenElements: true })).toHaveLength(3);
      expect(screen.queryByTestId('nearby-routes-empty')).toBeNull();

      // The search goes out after its debounce; placeholders stay until it answers.
      await waitFor(() => expect(nearby.mock.calls.some(([data]) => !data?.warmup)).toBe(true));
      expect(screen.getAllByTestId('nearby-placeholder-card', { includeHiddenElements: true })).toHaveLength(3);
      await act(async () => answer());
      expect(await screen.findByTestId(`route-card-${PJ_CARD}-primary`)).toBeTruthy();
      expect(screen.queryByTestId('nearby-routes-loading', { includeHiddenElements: true })).toBeNull();
    } finally {
      nearby.mockImplementation(nearbyDefault);
    }
  });

  it('shows placeholder departure tiles on a route page until its live times load', async () => {
    const callableNamed = (name: string) => {
      const index = (httpsCallable as jest.Mock).mock.calls.findIndex((call) => call[1] === name);
      return (httpsCallable as jest.Mock).mock.results[index]!.value as jest.Mock;
    };
    const single = callableNamed('getRouteLiveStatus');
    const singleDefault = single.getMockImplementation()!;
    single.mockImplementation(() => new Promise(() => undefined));
    try {
      const screen = await renderHome();
      fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
      const tiles = await screen.findByTestId('route-predictions-loading');
      expect(tiles.props.accessibilityLabel).toMatch(/^Loading the next arrival for /);
      expect(screen.getAllByTestId('route-prediction-placeholder', { includeHiddenElements: true })).toHaveLength(4);
      expect(screen.queryByTestId('route-predictions-empty')).toBeNull();
    } finally {
      single.mockImplementation(singleDefault);
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
      const screen = await renderHome();
      // The saved card shows at once, with its saved time aged by a minute, and updates quietly
      // (no spinner pushing the cards down).
      const card = await screen.findByTestId(`route-card-${PJ_CARD}-primary`);
      expect(screen.queryByTestId('nearby-refreshing')).toBeNull();
      await waitFor(() => expect(within(card).getByText('8')).toBeTruthy());
    } finally {
      nearby.mockImplementation(nearbyDefault);
      batch.mockImplementation(batchDefault);
    }
  });

  it('labels directions by destination only and titles cards with the route short name', async () => {
    const hidden = { includeHiddenElements: true };
    const screen = await renderHome();
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
    const screen = await renderHome();
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

  it("hides Google's points of interest and grays highways on the home and route maps", async () => {
    const hidesPlaces = (map: { props: { customMapStyle?: unknown } }) => expect(map.props.customMapStyle).toEqual(expect.arrayContaining([
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#DADCE0' }] },
    ]));
    const screen = await renderHome();
    fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
    hidesPlaces(await screen.findByTestId('route-map', { includeHiddenElements: true }));
    fireEvent.press(screen.getByTestId('route-back'));
    hidesPlaces(await screen.findByTestId('google-map-view', { includeHiddenElements: true }));
  });

  it('shows a compass after the rider rotates the home map, and reorients to north', async () => {
    const maps = jest.requireMock('react-native-maps') as { mockAnimateCamera: jest.Mock; mockCamera: { heading: number; pitch: number } };
    const screen = await renderHome();
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
    const screen = await renderHome();
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

    const screen = await renderHome();
    await screen.findByTestId(`route-card-${PJ_CARD}`);
    // Hydration can settle after the first fix, so the map may mount already centered on it.
    const map = screen.getByTestId('google-map-view', { includeHiddenElements: true });
    expect(map.props.region).toEqual(expect.objectContaining({ latitude: 40.92, longitude: -73.13 }));
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
        const screen = await renderHome();
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

    const screen = await renderHome();
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
      const screen = await renderHome();
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
      expect(within(s1.getByTestId('service-alerts')).getByText('Service advisory')).toBeTruthy();
      expect(s1.queryByText(routeById.s1.alert)).toBeNull();
      fireEvent.press(s1.getByTestId('service-alerts'));
      expect(within(s1.getByTestId('service-alerts-list')).getByText(routeById.s1.alert)).toBeTruthy();
      await act(async () => {}); // settle the route's geometry fetch
    });

    it("opens a tapped stop's sheet with only its transfers, not this line's times", async () => {
      const screen = await openPortJefferson();
      const live = callable('getRouteLiveStatus');
      live.mockClear();
      fireEvent.press(screen.getByTestId('stop-row-0'));
      expect(await screen.findByTestId('transfers-sheet')).toBeTruthy();
      expect(screen.queryByText(/times from this stop/)).toBeNull();
      // Nothing re-anchors the line at the tapped stop.
      expect(live.mock.calls.some(([request]) => request.lat === 40.89)).toBe(false);
      fireEvent.press(screen.getByTestId('transfers-sheet-close'));
      await waitFor(() => expect(screen.queryByTestId('transfers-sheet')).toBeNull());
    });

    it("opens a transfer badge's line from the stop's sheet", async () => {
      const transfers = callable('getRouteTransfers');
      const describeLine = callable('describeTransitRoute');
      transfers.mockImplementationOnce(() => Promise.resolve({
        data: { transfers: { '1': [{ agencyId: 'suffolk', agencyDisplayName: 'Suffolk County Transit', routeId: '51', shortName: '51', color: '#0454A2' }] } },
      }));
      const screen = await openPortJefferson();
      // The row's badge is a label; tapping the stop opens its sheet, where badges are buttons.
      await screen.findByTestId('route-transfer-Stony Brook-51');
      expect(screen.queryByLabelText('Open Suffolk County Transit 51 at Stony Brook')).toBeNull();
      fireEvent.press(screen.getByTestId('stop-row-0'));
      fireEvent.press(await screen.findByLabelText('Open Suffolk County Transit 51 at Stony Brook'));
      await waitFor(() => expect(describeLine).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 'suffolk', routeId: '51', lat: 40.89, lon: expect.closeTo(-73.09, 6) })));
      // The mock describes the PJ Branch, so the page that opens is a fresh copy, and Back returns.
      await waitFor(() => expect(screen.queryByTestId('transfers-sheet')).toBeNull());
      fireEvent.press(screen.getByTestId('route-back'));
      await screen.findByTestId('route-transfer-Stony Brook-51');
      clearRouteTransfersCache();
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
          ? { backgroundColor: '#FFFFFF', borderColor: routeById.ronkonkoma.color, width: 20 }
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

    it('names the train in big text over the map, letting gestures through', async () => {
      const screen = await openPortJefferson();
      const badge = screen.getByTestId('route-detail-badge', hidden);
      expect(badge.props.accessibilityLabel).toBe('PJ train');
      expect(within(badge).getByText('PJ', hidden)).toBeTruthy();
      expect(within(badge).queryByText(/Port Jefferson/, hidden)).toBeNull();
      expect(screen.getByTestId('map-label-glow', hidden)).toBeTruthy();
      // Inside an overlay that ignores touches.
      let overlay = badge.parent;
      while (overlay && overlay.props.pointerEvents === undefined) overlay = overlay.parent;
      expect(overlay?.props.pointerEvents).toBe('none');
    });

    it("points an arrow beside the line past the rider's stop, and the line turns full strength right at the stop", async () => {
      const screen = await openPortJefferson();
      // The arrow sits along the line ahead of the stop, not on Stony Brook itself.
      const arrow = screen.getByTestId('route-direction-arrow', hidden);
      expect(arrow.props.coordinate.latitude).not.toBeCloseTo(40.89, 4);
      expect(arrow.props.flat).toBe(true);
      // The faint part ends, and the full part starts, at Stony Brook itself (mocked at 40.89, -73.09).
      const ahead = screen.getByTestId('route-line', hidden).props.coordinates;
      const behind = screen.getByTestId('route-line-behind', hidden).props.coordinates;
      expect(ahead[0].latitude).toBeCloseTo(40.89, 6);
      expect(ahead[0].longitude).toBeCloseTo(-73.09, 6);
      expect(behind.at(-1)).toEqual(ahead[0]);
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
      expect(chips).toHaveLength(6);
      for (const branch of STATION_TRANSFERS.Jamaica!.filter((transfer) => transfer.agency === 'LIRR')) {
        expect(screen.queryByTestId(`route-transfer-Jamaica-${branch.name}`, hidden)).toBeNull();
      }
      expect(screen.getByTestId('route-transfer-Jamaica-E', hidden)).toBeTruthy();
      expect(within(screen.getByTestId('stop-transfers-more-Jamaica', hidden)).getByText(`+${jamaicaOtherModes.length - 6}`, hidden)).toBeTruthy();
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

    it('has no Fit route button, only Save and Locate', async () => {
      const screen = await openPortJefferson();
      expect(screen.queryByTestId('route-overview')).toBeNull();
      expect(screen.getByTestId('route-favorite')).toBeTruthy();
      expect(screen.getByTestId('route-location')).toBeTruthy();
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
        const screen = await renderHome();
        fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));
        await screen.findByLabelText('0 minutes, live GPS prediction');
        expect(screen.queryByText('Due')).toBeNull();
        expect(screen.getByLabelText('30 minutes, scheduled time')).toBeTruthy();
        // 10:00 AM + 124 min reads as a clock time.
        expect(screen.getByLabelText('at 12:04 PM, scheduled time')).toBeTruthy();

        const tiles = [0, 1, 2].map((index) => StyleSheet.flatten(screen.getByTestId(`route-prediction-0-${index}`).props.style));
        const widths = new Set(tiles.map((tile) => tile.width));
        expect(widths.size).toBe(1);
        // Filled with the route color, no outline: solid for the picked tile, light for the rest.
        expect(tiles[0]!.borderWidth).toBeUndefined();
        expect(tiles[0]!.backgroundColor).toBe(routeById.ronkonkoma.color);
        expect(tiles[2]!.backgroundColor).toMatch(new RegExp(`^${routeById.ronkonkoma.color}[0-9A-F]{2}$`, 'i'));
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
      const screen = await renderHome();
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

      // The direction switch sits above (not inside) the tiles.
      let headingRow = screen.getByTestId('route-detail-destination').parent;
      while (headingRow && within(headingRow).queryAllByLabelText(/^Show .* predictions$/).length === 0) headingRow = headingRow.parent;
      expect(within(headingRow!).queryByTestId('route-predictions-scroll')).toBeNull();

      // Scrolling the tiles keeps the direction.
      fireEvent.scroll(tiles, { nativeEvent: { contentOffset: { x: 240, y: 0 } } });
      expect(screen.getByTestId('route-detail-destination').props.children).toBe('Penn Station');

      // Picking the other side of the switch changes direction; the tiles follow, and a short list still ends with More.
      fireEvent.press(screen.getByTestId('route-direction-switch-1'));
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
    const screen = await renderHome();
    fireEvent.press(await screen.findByTestId(`route-card-${PJ_CARD}-primary`));

    const routeScroll = screen.getByTestId('route-detail-scroll');
    // The same grip as Home's sheet: tapping it expands the sheet, tapping again collapses it.
    expect(screen.getByTestId('route-sheet-handle')).toBeTruthy();
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

    await act(async () => {
      fireEvent.press(screen.getByTestId('route-location'));
    });
    expect(screen.getByTestId('route-location').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(screen.getByTestId('route-direction-switch-1'));
    expect(screen.getByTestId('route-detail-destination').props.children).toBe('Port Jefferson');
    expect(screen.queryByText('Eastbound to Port Jefferson')).toBeNull();
  });
});
