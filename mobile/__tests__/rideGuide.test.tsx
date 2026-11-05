import { fireEvent, render, screen, within } from '@testing-library/react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import { RideGuideView } from '../src/components/RideGuideView';
import { rideAlerts, rideGuideItinerary, ridePath, rideStopTimes, type RideGuideRequest } from '../src/data/rideGuide';
import { formatTripClock, type TransitStep } from '../src/data/tripPlanning';
import { UserPreferencesProvider } from '../src/data/userPreferences';
import { AppSettingsProvider } from '../src/theme/AppSettings';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

const NOW = Date.parse('2026-11-04T14:00:00Z');

const request = (overrides: Partial<RideGuideRequest> = {}): RideGuideRequest => ({
  routeId: 'suffolk:51',
  directionIndex: 0,
  agency: 'Suffolk County Transit',
  agencyId: 'suffolk',
  routeIdAtAgency: '51',
  directionId: 0,
  mode: 'bus',
  routeName: 'Route 51',
  shortName: '51',
  color: '#C43D4B',
  headsign: 'Port Jefferson',
  stops: [
    { name: 'Main St', stopId: 'a', lat: 40.8, lon: -73.1, offsetMinutes: 10 },
    { name: 'Elm Ave', stopId: 'b', lat: 40.81, lon: -73.1, offsetMinutes: 14 },
    { name: 'Oak Rd', stopId: 'c', lat: 40.82, lon: -73.1, offsetMinutes: 19 },
    { name: 'Harbor', stopId: 'd', lat: 40.83, lon: -73.1, offsetMinutes: 30 },
  ],
  departures: [{ minutes: 6, live: true, delayMinutes: 0 }, { minutes: 26, live: false }, { minutes: 46, live: false }],
  selectedDeparture: 0,
  walk: { minutes: 3, path: [{ lat: 40.799, lon: -73.101 }, { lat: 40.8, lon: -73.1 }] },
  notices: [
    { kind: 'delay', label: 'Running late', warning: true, title: 'Bus in 6 min is running 4 min late', detail: null },
    { kind: 'alert', label: 'Detour in effect', warning: true, title: 'Detour on Main St', detail: 'Buses use Elm Ave.' },
    { kind: 'outlook', label: 'Thanksgiving · Nov 26', warning: false, title: 'Thanksgiving is Thursday', detail: null },
  ],
  capturedAt: NOW,
  ...overrides,
});

const ride = (itinerary: ReturnType<typeof rideGuideItinerary>) => itinerary!.steps.find((step): step is TransitStep => step.kind === 'transit')!;

describe('rideGuideItinerary', () => {
  it('rides the one line from the rider\'s stop to the picked one, after the walk there', () => {
    const itinerary = rideGuideItinerary(request(), 2)!;
    expect(itinerary.steps.map((step) => step.kind)).toEqual(['walk', 'transit']);
    const leg = ride(itinerary);
    expect(leg.from).toMatchObject({ name: 'Main St', time: new Date(NOW + 6 * 60_000).toISOString() });
    // Oak Rd is 9 minutes on from Main St.
    expect(leg.to).toMatchObject({ name: 'Oak Rd', time: new Date(NOW + 15 * 60_000).toISOString() });
    expect(leg.stops?.map((stop) => stop.name)).toEqual(['Elm Ave']);
    expect(leg.stopCount).toBe(2);
    expect(leg.liveRoute).toEqual({ agencyId: 'suffolk', routeId: '51', boardStopId: 'a', alightStopId: 'c', directionId: 0 });
    expect(leg.live).toEqual({ status: 'tracked', delaySeconds: 0 });
    // Leaving means setting off on the walk: 3 minutes before the bus.
    expect(itinerary.departureTime).toBe(new Date(NOW + 3 * 60_000).toISOString());
    expect(itinerary.arrivalTime).toBe(leg.to.time);
    expect(itinerary.transfers).toBe(0);
  });

  it('offers every departure, each timed to the picked stop', () => {
    const leg = ride(rideGuideItinerary(request({ selectedDeparture: 1 }), 3));
    expect(leg.from.time).toBe(new Date(NOW + 26 * 60_000).toISOString());
    expect(leg.live).toBeUndefined();
    expect(leg.departures).toHaveLength(3);
    expect(leg.departures![2]).toEqual({
      departs: new Date(NOW + 46 * 60_000).toISOString(),
      arrives: new Date(NOW + 66 * 60_000).toISOString(),
      stopTimes: [new Date(NOW + 50 * 60_000).toISOString(), new Date(NOW + 55 * 60_000).toISOString()],
    });
  });

  it('leaves the delays to the departure, and keeps the alerts and what\'s coming up', () => {
    const alerts = rideAlerts(request().notices);
    expect(alerts.map((alert) => alert.label)).toEqual(['Detour in effect', 'Thanksgiving · Nov 26']);
    expect(alerts[1]).toMatchObject({ warning: false, upcoming: true });
    expect(ride(rideGuideItinerary(request(), 1)).alerts).toEqual(alerts);
  });

  it('goes without a walk when there is none, and with nothing to ride there is no trip', () => {
    expect(rideGuideItinerary(request({ walk: null }), 1)!.steps.map((step) => step.kind)).toEqual(['transit']);
    expect(rideGuideItinerary(request({ departures: [] }), 1)).toBeNull();
    expect(rideGuideItinerary(request({ stops: request().stops.slice(0, 1) }), 1)).toBeNull();
  });

  it('follows the line\'s drawn shape between the two stops', () => {
    const stops = request().stops.slice(0, 3);
    const shape = [{ lat: 40.79, lon: -73.1 }, { lat: 40.8, lon: -73.1 }, { lat: 40.805, lon: -73.11 }, { lat: 40.82, lon: -73.1 }, { lat: 40.9, lon: -73.1 }];
    expect(ridePath(stops, shape)).toEqual([
      { lat: 40.8, lng: -73.1 }, { lat: 40.8, lng: -73.1 }, { lat: 40.805, lng: -73.11 }, { lat: 40.82, lng: -73.1 }, { lat: 40.82, lng: -73.1 },
    ]);
    expect(ridePath(stops, undefined)).toEqual(stops.map((stop) => ({ lat: stop.lat, lng: stop.lon })));
  });

  it('times every stop after the rider\'s for the picker', () => {
    const departs = new Date(NOW + 6 * 60_000).toISOString();
    expect(rideStopTimes(request(), departs).map(({ index, stop, arrives }) => [index, stop.name, arrives])).toEqual([
      [1, 'Elm Ave', new Date(NOW + 10 * 60_000).toISOString()],
      [2, 'Oak Rd', new Date(NOW + 15 * 60_000).toISOString()],
      [3, 'Harbor', new Date(NOW + 26 * 60_000).toISOString()],
    ]);
  });
});

describe('RideGuideView', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  const renderGuide = (onStart = jest.fn()) => render(
    <AppSettingsProvider>
      <UserPreferencesProvider>
        <RideGuideView onBack={jest.fn()} onStart={onStart} request={request()} riderLocation={null} />
      </UserPreferencesProvider>
    </AppSettingsProvider>,
  );

  it('reads like Trip Details for the one ride, and starts it to the stop picked', () => {
    const onStart = jest.fn();
    renderGuide(onStart);
    expect(screen.getByTestId('ride-guide-leave-within')).toHaveTextContent(/Leave within 3 min to catch the /);
    expect(screen.getByTestId('ride-guide-leave-time')).toHaveTextContent(formatTripClock(new Date(NOW + 3 * 60_000).toISOString()));
    expect(screen.getByTestId('ride-guide-alerts-0')).toHaveTextContent(/Detour in effect/);
    // The end of the line until the rider picks.
    expect(screen.getByTestId('ride-guide-stop-3').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('ride-guide-arrive-time')).toHaveTextContent(formatTripClock(new Date(NOW + 26 * 60_000).toISOString()));

    fireEvent.press(screen.getByTestId('ride-guide-stop-2'));
    expect(screen.getByTestId('ride-guide-arrive-time')).toHaveTextContent(formatTripClock(new Date(NOW + 15 * 60_000).toISOString()));
    expect(within(screen.getByTestId('ride-guide-step-0')).getByText('Oak Rd')).toBeTruthy();

    fireEvent.press(screen.getByTestId('ride-guide-go'));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ arrivalTime: new Date(NOW + 15 * 60_000).toISOString() }), 'Oak Rd');
  });

  it('moves the stop times with a later departure picked', () => {
    renderGuide();
    const later = new Date(NOW + 26 * 60_000).toISOString();
    fireEvent.press(screen.getByTestId(`ride-guide-departure-0-${later}`));
    expect(screen.getByTestId('ride-guide-stop-time-1')).toHaveTextContent(formatTripClock(new Date(NOW + 30 * 60_000).toISOString()));
    expect(screen.queryByTestId('ride-guide-favorite')).toBeNull();
  });
});
