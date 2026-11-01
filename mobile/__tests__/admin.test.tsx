import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { httpsCallable } from 'firebase/functions';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import App from '../App';
import { navigationStorageKey } from '../src/data/navigationStorage';
import { DEBUG_STORAGE_KEY } from '../src/debug/DebugContext';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('@expo-google-fonts/nunito/useFonts', () => ({ useFonts: () => [true] }));
// One deterministic Google place; no network in tests.
jest.mock('../src/data/placesSearch', () => {
  const terry = { id: 'terry-road-smithtown', title: '123 Terry Rd', subtitle: 'Smithtown, NY, USA' };
  return {
    ...jest.requireActual('../src/data/placesSearch'),
    getPlacesApiKey: jest.fn(() => 'test-key'),
    autocompletePlaces: jest.fn(async ({ input }: { input: string }) => (input.toLowerCase().includes('terry') ? [terry] : [])),
    fetchPlaceDetails: jest.fn(async () => ({ ...terry, subtitle: '123 Terry Rd, Smithtown, NY 11787, USA', location: { latitude: 40.8562, longitude: -73.2005 } })),
  };
});

const mockAuthUser = (globalThis as unknown as { __mockAuthUser: { email: string } }).__mockAuthUser;
const callableMock = (name: string) => (httpsCallable as jest.Mock)({}, name) as jest.Mock;
const PENN = { latitude: 40.7506, longitude: -73.9935 };

beforeEach(async () => {
  await AsyncStorage.clear();
  callableMock('findNearbyTransit').mockClear();
  callableMock('planTrip').mockClear();
});

async function openAdminTools(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByTestId('profile-trigger'));
  fireEvent.press(screen.getByTestId('settings-row-admin'));
  await screen.findByTestId('admin-tools');
}

it('shows no admin entry or banner to a rider, even with stored overrides', async () => {
  await AsyncStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify({ mockLocation: { label: 'Penn Station', ...PENN }, overlays: { ids: false, tapCoords: false } }));
  const screen = render(<App />);
  await act(async () => undefined);
  expect(screen.queryByTestId('debug-banner')).toBeNull();
  fireEvent.press(screen.getByTestId('profile-trigger'));
  expect(screen.queryByTestId('settings-row-admin')).toBeNull();
});

it('migrates a legacy admin mock location to timestamped navigation evidence', async () => {
  mockAuthUser.email = 'admin@gmail.com';
  await AsyncStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify({ mockLocation: { label: 'Penn Station', ...PENN }, overlays: { ids: false, tapCoords: false } }));

  const screen = render(<App />);
  await screen.findByTestId('debug-banner');

  await waitFor(async () => {
    const raw = await AsyncStorage.getItem(DEBUG_STORAGE_KEY);
    const stored = JSON.parse(raw ?? '{}') as { mockLocation?: { capturedAt?: number } };
    expect(stored.mockLocation?.capturedAt).toEqual(expect.any(Number));
  });
  expect(screen.getByTestId('google-map-view').props.region).toMatchObject(PENN);
});

it('moves the map, Nearby, and trip planning to a mock location, and back when turned off', async () => {
  mockAuthUser.email = 'admin@gmail.com';
  const screen = render(<App />);
  await act(async () => undefined);
  await openAdminTools(screen);
  fireEvent.press(screen.getByTestId('admin-mock-location-penn-station'));
  expect(screen.getByTestId('admin-feedback').props.children).toBe('Mock location set to Penn Station');
  fireEvent.press(screen.getByTestId('admin-tools-back'));
  fireEvent.press(screen.getByTestId('profile-back'));

  expect(within(screen.getByTestId('debug-banner')).getByText('Mock location · Penn Station')).toBeTruthy();
  // The map jumps to Penn Station and Nearby searches there.
  // The rebuilt home map opens on Penn Station, not where it was before.
  expect(screen.getByTestId('google-map-view').props.region).toMatchObject(PENN);
  await waitFor(() => expect(callableMock('findNearbyTransit')).toHaveBeenCalledWith({ lat: PENN.latitude, lon: PENN.longitude }));
  // A real fix isn't needed: the location chip doesn't say it's unavailable.
  expect(screen.queryByText('Location unavailable — showing Stony Brook')).toBeNull();

  // "Current location" trips start at Penn Station.
  fireEvent.press(screen.getByTestId('search-trigger'));
  fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
  fireEvent.press(await screen.findByTestId('search-result-terry-road-smithtown'));
  await waitFor(() => expect(callableMock('planTrip')).toHaveBeenCalled());
  expect(callableMock('planTrip').mock.calls.at(-1)![0].origin).toEqual({ label: 'Current location', lat: PENN.latitude, lng: PENN.longitude });
  fireEvent.press(screen.getByTestId('results-back'));
  fireEvent.press(screen.getByLabelText('Back from search'));

  fireEvent.press(screen.getByTestId('debug-banner-location-off'));
  expect(screen.queryByTestId('debug-banner')).toBeNull();
  expect(await screen.findByText('Location unavailable — showing Stony Brook')).toBeTruthy();
});

it('sets a mock location from a long press on the home map', async () => {
  mockAuthUser.email = 'admin@gmail.com';
  const screen = render(<App />);
  await act(async () => undefined);
  fireEvent(screen.getByTestId('google-map-view'), 'longPress', { nativeEvent: { coordinate: { latitude: 40.70331, longitude: -74.00567 } } });
  expect(screen.getByText('Use as mock location?')).toBeTruthy();
  fireEvent.press(screen.getByTestId('mock-location-confirm-confirm'));
  expect(within(screen.getByTestId('debug-banner')).getByText('Mock location · Pinned spot (40.70331, -74.00567)')).toBeTruthy();
  expect(screen.getByTestId('mock-location-marker', { includeHiddenElements: true })).toBeTruthy();
});

it("ignores long presses for a rider", async () => {
  const screen = render(<App />);
  await act(async () => undefined);
  fireEvent(screen.getByTestId('google-map-view'), 'longPress', { nativeEvent: { coordinate: { latitude: 40.7, longitude: -74 } } });
  expect(screen.queryByText('Use as mock location?')).toBeNull();
});

it('sets a mock location from search', async () => {
  mockAuthUser.email = 'admin@gmail.com';
  const screen = render(<App />);
  await act(async () => undefined);
  await openAdminTools(screen);
  fireEvent.press(screen.getByTestId('admin-mock-location-search'));
  fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
  fireEvent.press(await screen.findByTestId('search-result-terry-road-smithtown'));
  await screen.findByTestId('admin-tools');
  expect(screen.getByTestId('admin-mock-location-current')).toBeTruthy();
  expect(within(screen.getByTestId('admin-mock-location-current')).getByText('123 Terry Rd')).toBeTruthy();
});

describe('mock time', () => {
  async function planWithMockTime() {
    mockAuthUser.email = 'admin@gmail.com';
    const screen = render(<App />);
    await act(async () => undefined);
    await openAdminTools(screen);
    fireEvent.changeText(screen.getByTestId('admin-mock-date'), '2026-10-15');
    fireEvent.changeText(screen.getByTestId('admin-mock-clock'), '02:30');
    fireEvent.press(screen.getByTestId('admin-mock-time-set'));
    // The location matters too: "Current location" trips need one, so mock it as well.
    fireEvent.press(screen.getByTestId('admin-mock-location-stony-brook-university'));
    fireEvent.press(screen.getByTestId('admin-tools-back'));
    fireEvent.press(screen.getByTestId('profile-back'));
    expect(within(screen.getByTestId('debug-banner')).getByText(/^Mock time · Thu, Oct 15, 2:3\d AM · live times stay real$/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    fireEvent.press(await screen.findByTestId('search-result-terry-road-smithtown'));
    await waitFor(() => expect(callableMock('planTrip')).toHaveBeenCalled());
    return screen;
  }

  it('plans Leave now as a departure at the mock time', async () => {
    await planWithMockTime();
    const { time } = callableMock('planTrip').mock.calls.at(-1)![0];
    expect(time.mode).toBe('depart');
    // 2:30 AM EDT; mock time keeps ticking, so allow the test's own few seconds.
    expect(Date.parse(time.at) - Date.parse('2026-10-15T06:30:00Z')).toBeLessThan(60_000);
  });

  it("plans Depart at 7:00 AM for the mock day's 7:00 AM", async () => {
    const screen = await planWithMockTime();
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('leave-mode-depart'));
    fireEvent.press(screen.getByTestId('leave-hour-7'));
    fireEvent.press(screen.getByTestId('leave-minute-00'));
    fireEvent.press(screen.getByTestId('leave-period-am'));
    fireEvent.press(screen.getByTestId('leave-time-done'));
    await waitFor(() => expect(callableMock('planTrip')).toHaveBeenLastCalledWith(expect.objectContaining({ time: { mode: 'depart', at: '2026-10-15T11:00:00.000Z' } })));
  });
});

describe('Admin tools screen', () => {
  it('shows every section, with backend status and rate limits', async () => {
    mockAuthUser.email = 'admin@gmail.com';
    const screen = render(<App />);
    await act(async () => undefined);
    await openAdminTools(screen);
    for (const label of ['MOCK LOCATION', 'MOCK TIME', 'BACKEND STATUS', 'RECENT REQUESTS', 'CACHES', 'OVERLAYS', 'RATE LIMITS']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    const lirr = await screen.findByTestId('admin-status-lirr');
    expect(within(lirr).getByText('Timetable abcdef12 · 6 h old')).toBeTruthy();
    expect(within(lirr).getByText('Live feed OK · 120 ms')).toBeTruthy();
    expect(within(screen.getByTestId('admin-status-nice')).getByText('Live feed not configured')).toBeTruthy();
    expect(within(screen.getByTestId('admin-rate-planTrip')).getByText('19 of 20 per minute left')).toBeTruthy();
    // The status check itself is in the request log.
    expect(screen.getAllByText('getBackendStatus').length).toBeGreaterThan(0);
  });

  it("clears disposable caches but keeps admin, navigation, and unknown durable state", async () => {
    mockAuthUser.email = 'admin@gmail.com';
    const screen = render(<App />);
    await act(async () => undefined);
    await openAdminTools(screen);
    fireEvent.press(screen.getByTestId('admin-mock-location-jamaica'));
    await AsyncStorage.setItem('pathly.nearby.v1', '{}');
    await AsyncStorage.setItem('pathly.live.v1', '{}');
    const activeSessionKey = navigationStorageKey('test-uid');
    await AsyncStorage.setItem(activeSessionKey, '{"active":"demo"}');
    await AsyncStorage.setItem('pathly.future-durable.v1', '{}');
    fireEvent.press(screen.getByTestId('admin-clear-device-cache'));
    await waitFor(() => expect(screen.getByTestId('admin-feedback').props.children).toBe('Cleared 2 saved items from this device'));
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toContain(DEBUG_STORAGE_KEY);
    expect(keys).toContain(activeSessionKey);
    expect(keys).toContain('pathly.future-durable.v1');
    expect(keys).not.toContain('pathly.nearby.v1');
    expect(keys).not.toContain('pathly.live.v1');
  });

  it('shows route and stop IDs on route detail when the overlay is on', async () => {
    mockAuthUser.email = 'admin@gmail.com';
    const screen = render(<App />);
    await act(async () => undefined);
    await openAdminTools(screen);
    fireEvent(screen.getByTestId('admin-overlay-ids'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('admin-tools-back'));
    fireEvent.press(screen.getByTestId('profile-back'));
    fireEvent.press(await screen.findByTestId('route-card-lirr:10-primary'));
    expect(screen.getByTestId('route-debug-ids').props.children).toBe('lirr:10');
    expect((await screen.findAllByTestId(/^stop-debug-id-/)).length).toBeGreaterThan(0);
  });

  it('shows tapped map coordinates when that overlay is on', async () => {
    mockAuthUser.email = 'admin@gmail.com';
    const screen = render(<App />);
    await act(async () => undefined);
    await openAdminTools(screen);
    fireEvent(screen.getByTestId('admin-overlay-tap-coords'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('admin-tools-back'));
    fireEvent.press(screen.getByTestId('profile-back'));
    fireEvent(screen.getByTestId('google-map-view'), 'press', { nativeEvent: { coordinate: { latitude: 40.750521, longitude: -73.993451 } } });
    expect(within(screen.getByTestId('map-tap-coords')).getByText('40.75052, -73.99345')).toBeTruthy();
    fireEvent.press(screen.getByTestId('map-tap-coords'));
    expect(screen.queryByTestId('map-tap-coords')).toBeNull();
  });
});
