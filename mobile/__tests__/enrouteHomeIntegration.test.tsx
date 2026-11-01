import { fireEvent, render, waitFor, type RenderResult } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import * as Location from 'expo-location';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import App from '../App';
import { createTripSelectionIdentity, normalizeItinerary } from '../src/data/enrouteNavigation';
import {
  navigationStorageKey,
  readNavigationDocument,
} from '../src/data/navigationStorage';
import { retimeItinerary } from '../src/data/tripDepartures';
import type { Itinerary, TransitStep, TripDeparture, WalkStep } from '../src/data/tripPlanning';
import { DEBUG_STORAGE_KEY } from '../src/debug/DebugContext';
import itineraryFixture from './fixtures/itineraries-sbu-penn.json';

const itineraries = itineraryFixture as unknown as Itinerary[];
const railTrip = itineraries[0]!;
const busTrip = itineraries[1]!;
const mockAuthUser = (globalThis as unknown as { __mockAuthUser: { email: string } }).__mockAuthUser;
let plannedItineraries: Itinerary[];
let plannedRailTrip: Itinerary;
let alternateFirstDeparture: string;

const mockUseFonts = jest.fn(() => [true] as [boolean]);

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('@expo-google-fonts/nunito/useFonts', () => ({
  useFonts: () => mockUseFonts(),
}));

// These are deliberately provider-like place ids so both initial planning and persisted
// provider-light resume references follow the production path.
jest.mock('../src/data/placesSearch', () => {
  const places = {
    first: {
      id: 'demo-destination-one-12345',
      title: 'Penn Station',
      subtitle: 'New York, NY',
    },
    second: {
      id: 'demo-destination-two-12345',
      title: 'Times Square',
      subtitle: 'New York, NY',
    },
  };
  const details = {
    [places.first.id]: {
      ...places.first,
      location: { latitude: 40.7506, longitude: -73.9935 },
    },
    [places.second.id]: {
      ...places.second,
      location: { latitude: 40.758, longitude: -73.9855 },
    },
  };
  return {
    ...jest.requireActual('../src/data/placesSearch'),
    getPlacesApiKey: jest.fn(() => 'test-key'),
    autocompletePlaces: jest.fn(async ({ input }: { input: string }) => (
      input.toLowerCase().includes('times') ? [places.second] : [places.first]
    )),
    fetchPlaceDetails: jest.fn(async ({ placeId }: { placeId: keyof typeof details }) => details[placeId]),
  };
});

function planTripMock(): jest.Mock {
  return (httpsCallable as jest.Mock)({}, 'planTrip') as jest.Mock;
}

function shiftedDeparture(step: TransitStep, departsAt: number): TripDeparture {
  const originalDeparture = Date.parse(step.from.time);
  const shift = departsAt - originalDeparture;
  return {
    departs: new Date(departsAt).toISOString(),
    arrives: new Date(Date.parse(step.to.time) + shift).toISOString(),
    ...(step.stops ? {
      stopTimes: step.stops.map((stop) => new Date(Date.parse(stop.time) + shift).toISOString()),
    } : {}),
  };
}

/** Adds selectable future departures and a final walk so the integration path covers both. */
function planningFixtures(now: number): { all: Itinerary[]; alternate: string; rail: Itinerary } {
  const source = structuredClone(railTrip);
  let transitIndex = 0;
  const steps = source.steps.map((step) => {
    if (step.kind !== 'transit') return step;
    const firstAt = transitIndex === 0 ? now + 60 * 60_000 : now + 4 * 60 * 60_000;
    const secondAt = firstAt + 60 * 60_000;
    transitIndex += 1;
    return {
      ...step,
      departures: [shiftedDeparture(step, firstAt), shiftedDeparture(step, secondAt)],
    };
  });
  const finalWalk: WalkStep = {
    kind: 'walk',
    durationSeconds: 10 * 60,
    distanceMeters: 520,
    toName: 'Penn Station main entrance',
    path: [
      { lat: 40.750587, lng: -73.993584 },
      { lat: 40.7518, lng: -73.9925 },
      { lat: 40.753, lng: -73.9914 },
      { lat: 40.7542, lng: -73.9903 },
    ],
  };
  const arrivalTime = new Date(Date.parse(source.arrivalTime) + finalWalk.durationSeconds * 1000).toISOString();
  const rail: Itinerary = {
    ...source,
    steps: [...steps, finalWalk],
    arrivalTime,
    durationSeconds: source.durationSeconds + finalWalk.durationSeconds,
  };
  const firstTransit = rail.steps.find((step): step is TransitStep => step.kind === 'transit')!;
  return {
    all: [rail, structuredClone(busTrip)],
    alternate: firstTransit.departures![1]!.departs,
    rail,
  };
}

function grantLocation() {
  const position = {
    coords: {
      latitude: 40.9126,
      longitude: -73.1234,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  };
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(position);
  (Location.watchPositionAsync as jest.Mock).mockResolvedValue({ remove: jest.fn() });
}

async function renderHome(): Promise<RenderResult> {
  const screen = render(<App />);
  await screen.findByTestId('search-trigger');
  await waitFor(() => expect(Location.getCurrentPositionAsync).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText('Finding your location…')).toBeNull());
  return screen;
}

async function openResults(screen: RenderResult, destination: 'penn' | 'times' = 'penn') {
  fireEvent.press(screen.getByTestId('search-trigger'));
  fireEvent.changeText(screen.getByTestId('search-input'), destination);
  const placeId = destination === 'times'
    ? 'demo-destination-two-12345'
    : 'demo-destination-one-12345';
  fireEvent.press(await screen.findByTestId(`search-result-${placeId}`));
  await screen.findByTestId('route-results-view');
  await screen.findByTestId(`itinerary-${railTrip.id}`);
}

async function startTrip(screen: RenderResult, itinerary: Itinerary) {
  fireEvent.press(screen.getByTestId(`search-result-view-${itinerary.id}`));
  await screen.findByTestId(`search-trip-detail-${itinerary.id}`);
  fireEvent.press(screen.getByTestId('search-trip-go'));
  await screen.findByTestId('enroute-navigation-view');
}

async function currentDocument() {
  return readNavigationDocument('test-uid');
}

describe('Home active-trip MVP integration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockAuthUser.email = 'rider@example.com';
    mockUseFonts.mockReturnValue([true]);
    grantLocation();
    const fixtures = planningFixtures(Date.now());
    plannedItineraries = fixtures.all;
    plannedRailTrip = fixtures.rail;
    alternateFirstDeparture = fixtures.alternate;
    planTripMock().mockImplementation(() => Promise.resolve({
      data: { itineraries: plannedItineraries.map((itinerary) => structuredClone(itinerary)) },
    }));
  });

  afterEach(() => {
    mockAuthUser.email = 'rider@example.com';
    jest.useRealTimers();
  });

  it('opens dedicated navigation, preserves it behind Back, and ends it into a fresh Recent search', async () => {
    const screen = await renderHome();
    await openResults(screen);
    fireEvent.press(screen.getByTestId(`search-result-view-${railTrip.id}`));
    await screen.findByTestId(`search-trip-detail-${railTrip.id}`);
    const alternate = screen.getByTestId(`search-trip-departure-0-${alternateFirstDeparture}`);
    fireEvent.press(alternate);
    await waitFor(() => expect(
      screen.getByTestId(`search-trip-departure-0-${alternateFirstDeparture}`).props.accessibilityState.selected,
    ).toBe(true));
    const exactRetimed = retimeItinerary(
      plannedRailTrip,
      new Map([[0, alternateFirstDeparture]]),
      Date.now(),
    );
    const exactSelection = createTripSelectionIdentity(exactRetimed);
    fireEvent.press(screen.getByTestId('search-trip-go'));
    await screen.findByTestId('enroute-navigation-view');

    const startedDocument = await currentDocument();
    expect(startedDocument.active?.selection).toEqual(exactSelection);
    expect(startedDocument.active?.selection.departureTime).toBe(exactSelection.departureTime);
    expect(startedDocument.active?.selection.departureTime)
      .not.toBe(createTripSelectionIdentity(plannedRailTrip).departureTime);
    expect(startedDocument.active?.selection.fingerprint).toBe(exactSelection.fingerprint);

    expect(screen.getByTestId('enroute-guidance')).toBeTruthy();
    expect(screen.getByTestId('enroute-end')).toBeTruthy();
    expect(screen.queryByTestId('route-results-view')).toBeNull();
    expect(screen.queryByTestId('search-trip-leave-time')).toBeNull();
    expect(screen.queryByTestId('search-trip-stops-toggle-0')).toBeNull();

    fireEvent.press(screen.getByTestId('enroute-back'));
    const resume = await screen.findByTestId('resume-active-trip');
    expect(screen.queryByTestId('enroute-navigation-view')).toBeNull();
    expect((await currentDocument()).active?.selection.itineraryId).toBe(railTrip.id);

    fireEvent.press(resume);
    await screen.findByTestId('enroute-navigation-view');
    fireEvent.press(screen.getByTestId('enroute-end'));
    expect(screen.getByTestId('enroute-end-confirm')).toBeTruthy();
    fireEvent.press(screen.getByTestId('enroute-end-confirm-cancel'));
    expect(screen.getByTestId('enroute-navigation-view')).toBeTruthy();
    expect((await currentDocument()).active).not.toBeNull();

    fireEvent.press(screen.getByTestId('enroute-end'));
    fireEvent.press(screen.getByTestId('enroute-end-confirm-confirm'));
    await screen.findByTestId('tab-nearby');
    expect((await currentDocument()).active).toBeNull();
    expect(screen.queryByTestId('enroute-navigation-view')).toBeNull();
  });

  it('does not replace the active trip until replacement is confirmed', async () => {
    const screen = await renderHome();
    await openResults(screen);
    await startTrip(screen, railTrip);
    fireEvent.press(screen.getByTestId('enroute-back'));

    await openResults(screen, 'times');
    fireEvent.press(screen.getByTestId(`search-result-view-${busTrip.id}`));
    fireEvent.press(await screen.findByTestId('search-trip-go'));
    await screen.findByTestId('replace-active-trip-confirm');
    fireEvent.press(screen.getByTestId('replace-active-trip-confirm-cancel'));

    let document = await currentDocument();
    expect(document.active?.selection.itineraryId).toBe(railTrip.id);
    expect(document.recents).toHaveLength(0);
    expect(screen.getByTestId(`search-trip-detail-${busTrip.id}`)).toBeTruthy();

    fireEvent.press(screen.getByTestId('search-trip-go'));
    await screen.findByTestId('replace-active-trip-confirm');
    fireEvent.press(screen.getByTestId('replace-active-trip-confirm-confirm'));
    await screen.findByTestId('enroute-navigation-view');

    document = await currentDocument();
    expect(document.active?.selection.itineraryId).toBe(busTrip.id);
    expect(document.active?.destination.label).toBe('Times Square');
    expect(document.recents).toHaveLength(1);
    expect(document.recents[0]).not.toHaveProperty('selection');
    expect(document.recents[0]?.outcome).toBe('ended-early');
  });

  it('gates hydration, restores the exact trip, and offers safe recovery for a mismatch', async () => {
    const first = await renderHome();
    await openResults(first);
    await startTrip(first, railTrip);
    first.unmount();

    const restored = render(<App />);
    expect(restored.getByTestId('loading-screen')).toBeTruthy();
    await restored.findByTestId('enroute-navigation-view');
    expect(restored.queryByTestId('route-results-view')).toBeNull();
    restored.unmount();

    const document = await currentDocument();
    expect(document.active).not.toBeNull();
    document.active!.selection = {
      ...document.active!.selection,
      fingerprint: 'intentionally-no-exact-match',
    };
    await AsyncStorage.setItem(navigationStorageKey('test-uid'), JSON.stringify(document));

    const recovery = render(<App />);
    expect(recovery.getByTestId('loading-screen')).toBeTruthy();
    await recovery.findByTestId('enroute-recovery-view');
    expect(recovery.getByText('We can’t restore the exact route yet')).toBeTruthy();

    fireEvent.press(recovery.getByTestId('enroute-recovery-back'));
    fireEvent.press(await recovery.findByTestId('resume-active-trip'));
    await recovery.findByTestId('enroute-recovery-view');
    fireEvent.press(recovery.getByTestId('enroute-recovery-end'));
    fireEvent.press(recovery.getByTestId('enroute-recovery-end-confirm-cancel'));
    expect((await currentDocument()).active).not.toBeNull();
    fireEvent.press(recovery.getByTestId('enroute-recovery-end'));
    fireEvent.press(recovery.getByTestId('enroute-recovery-end-confirm-confirm'));
    expect(await recovery.findByTestId('tab-nearby')).toBeTruthy();
  });

  it('advances every admin checkpoint monotonically through arrival', async () => {
    mockAuthUser.email = 'admin@gmail.com';
    const screen = await renderHome();
    await openResults(screen);
    await startTrip(screen, railTrip);

    const plan = normalizeItinerary(plannedRailTrip, {
      origin: { lat: 40.9126, lng: -73.1234 },
    });
    const transferIndex = plan.checkpoints.findIndex((checkpoint) => checkpoint.phase === 'transferring');
    const destinationIndex = plan.checkpoints.findIndex((checkpoint) => checkpoint.kind === 'destination');
    const finalStepIndex = plannedRailTrip.steps.length - 1;
    expect(transferIndex).toBeGreaterThan(0);
    expect(destinationIndex).toBe(plan.checkpoints.length - 1);
    expect(plan.checkpoints.some((checkpoint) => checkpoint.kind === 'walk')).toBe(true);
    expect(plan.checkpoints.some((checkpoint) => checkpoint.kind === 'board')).toBe(true);
    expect(plan.checkpoints.some((checkpoint) => checkpoint.kind === 'transit-stop')).toBe(true);
    expect(plan.checkpoints.some((checkpoint) => checkpoint.phase === 'transferring')).toBe(true);
    expect(plan.checkpoints.some((checkpoint) => checkpoint.stepIndex === finalStepIndex && checkpoint.kind === 'walk')).toBe(true);
    expect(plan.checkpoints[destinationIndex]?.stepIndex).toBe(finalStepIndex);
    expect(screen.getByTestId('enroute-demo-controls')).toBeTruthy();
    let lastOrdinal = (await currentDocument()).active?.cursor.checkpointOrdinal ?? 0;
    let checkedBackwardMove = false;

    // Every normalized control is used in route order. Persisted progress may legitimately skip
    // a very close walking marker, but it must reach/past each ordinal and never move backward.
    for (let index = 1; index < destinationIndex; index += 1) {
      const checkpoint = plan.checkpoints[index]!;
      fireEvent.press(screen.getByTestId(`enroute-demo-checkpoint-${index}`));
      await waitFor(async () => {
        const raw = await AsyncStorage.getItem(DEBUG_STORAGE_KEY);
        expect(JSON.parse(raw ?? '{}').mockLocation?.label).toBe(checkpoint.label);
      });
      await waitFor(async () => {
        expect((await currentDocument()).active?.cursor.checkpointOrdinal).toBeGreaterThanOrEqual(index);
      });
      const advancedOrdinal = (await currentDocument()).active?.cursor.checkpointOrdinal ?? -1;
      expect(advancedOrdinal).toBeGreaterThanOrEqual(lastOrdinal);
      lastOrdinal = advancedOrdinal;

      if (index === transferIndex) {
        // The transfer platform's alight/board points can be co-located. A deliberate move back
        // both proves monotonicity and gives the next forward checkpoint a fresh location event.
        fireEvent.press(screen.getByTestId('enroute-demo-checkpoint-0'));
        await waitFor(async () => {
          const raw = await AsyncStorage.getItem(DEBUG_STORAGE_KEY);
          expect(JSON.parse(raw ?? '{}').mockLocation?.label).toBe(plan.checkpoints[0]?.label);
        });
        expect((await currentDocument()).active?.cursor.checkpointOrdinal).toBe(lastOrdinal);
        checkedBackwardMove = true;
      }
    }
    expect(checkedBackwardMove).toBe(true);

    fireEvent.press(screen.getByTestId(`enroute-demo-checkpoint-${destinationIndex}`));
    expect(await screen.findByTestId('trip-arrived')).toBeTruthy();
    const completed = await currentDocument();
    expect(completed.active).toBeNull();
    expect(completed.recents).toHaveLength(1);
    expect(completed.recents[0]?.outcome).toBe('arrived');
  });
});
