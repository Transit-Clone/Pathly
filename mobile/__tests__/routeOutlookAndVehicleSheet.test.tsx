import { act, fireEvent, render, within } from '@testing-library/react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import { normalizeBeanAvatar } from '../src/avatars/beanAvatar';
import { RouteDetailView } from '../src/components/RouteDetailView';
import { ridersLabel, VehicleSheet } from '../src/components/VehicleSheet';
import { routeById, type RouteDetail } from '../src/data/transit';
import type { RouteLiveVehicle } from '../src/data/transitLive';
import { fareLabel, orderItineraries, type Itinerary } from '../src/data/tripPlanning';
import { DEFAULT_PREFERENCES, parsePreferences } from '../src/data/userPreferences';
import { AppSettingsProvider } from '../src/theme/AppSettings';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

const mockOutlook = jest.fn();
jest.mock('../src/data/serviceOutlook', () => ({ useServiceOutlook: () => mockOutlook() }));

const liveRoute: RouteDetail = { ...routeById.s1, alert: 'No delays reported on this route.' };
const thanksgiving = { kind: 'outlook', icon: 'calendar', label: 'Thanksgiving · Nov 26', shortLabel: 'Nov 26', warning: false, title: 'Thanksgiving is Thursday, Nov 26', detail: 'Many lines run a holiday schedule.' };

describe('Route View outlook pill', () => {
  const renderRoute = (route: RouteDetail) => render(
    <AppSettingsProvider>
      <RouteDetailView isFavorite={false} onBack={jest.fn()} onToggleFavorite={jest.fn()} route={route} />
    </AppSettingsProvider>,
  );

  it('shows nothing when nothing is coming up', async () => {
    mockOutlook.mockReturnValue([]);
    const screen = renderRoute(liveRoute);
    expect(screen.queryByTestId('service-outlook')).toBeNull();
    await act(async () => {});
  });

  it('names the holiday when it has the row to itself, and opens its details', async () => {
    mockOutlook.mockReturnValue([thanksgiving]);
    const screen = renderRoute(liveRoute);
    const pill = screen.getByTestId('service-outlook');
    expect(within(pill).getByText('Thanksgiving · Nov 26')).toBeTruthy();
    fireEvent.press(pill);
    const sheet = within(screen.getByTestId('service-alerts-list'));
    expect(sheet.getByText('Coming up')).toBeTruthy();
    expect(sheet.getByText('Thanksgiving is Thursday, Nov 26')).toBeTruthy();
    await act(async () => {});
  });

  it('shrinks to the date beside a warning, which stays', async () => {
    mockOutlook.mockReturnValue([thanksgiving]);
    const screen = renderRoute({ ...liveRoute, predictions: [{ minutes: 4, live: true, delayMinutes: 6 }] });
    expect(within(screen.getByTestId('service-alerts')).getByText('Running late')).toBeTruthy();
    expect(within(screen.getByTestId('service-outlook')).getByText('Nov 26')).toBeTruthy();
    await act(async () => {});
  });
});

describe('VehicleSheet', () => {
  const avatar = normalizeBeanAvatar(null);
  const vehicle = (riders?: RouteLiveVehicle['riders']): RouteLiveVehicle => ({ tripId: 't1', directionId: 0, lat: 40.7, lon: -73.9, updatedAt: Date.now(), ...(riders ? { riders } : {}) });
  const feed = { lat: 40.7, lon: -73.9, updatedAt: Date.now() };
  const renderSheet = (props: Partial<Parameters<typeof VehicleSheet>[0]>) => render(
    <AppSettingsProvider>
      <VehicleSheet color="#123456" destination="Penn Station" lineName="51" mode="bus" onClaim={jest.fn()} onClose={jest.fn()} onDismiss={jest.fn()} ridingTripId={null} sharingEnabled={true} stops={[{ name: 'Main St', lat: 40.7, lon: -73.9 }]} vehicle={vehicle()} {...props} />
    </AppSettingsProvider>,
  );

  it('words who is on board', () => {
    expect(ridersLabel(undefined)).toBeNull();
    expect(ridersLabel({ count: 1, avatars: [avatar], you: true, feed })).toBe('You’re on board');
    expect(ridersLabel({ count: 3, avatars: [avatar], you: true, feed })).toBe('You and 2 other riders on board');
    expect(ridersLabel({ count: 2, avatars: [avatar], you: false, feed })).toBe('2 riders on board');
  });

  it('says where the position comes from', () => {
    expect(renderSheet({}).getByText(/Location from the agency/)).toBeTruthy();
    expect(renderSheet({ vehicle: vehicle({ count: 1, avatars: [avatar], you: false, feed }) }).getByText(/Location from riders on board/)).toBeTruthy();
  });

  it('offers "I’m on this" only with sharing on and the rider nearby', () => {
    const onClaim = jest.fn();
    const near = renderSheet({ onClaim, riderAt: { lat: 40.7, lon: -73.9 } });
    fireEvent.press(near.getByTestId('vehicle-sheet-on'));
    expect(onClaim).toHaveBeenCalledWith('t1');
    expect(renderSheet({ riderAt: { lat: 41.5, lon: -73.9 } }).queryByTestId('vehicle-sheet-on')).toBeNull();
    const off = renderSheet({ riderAt: { lat: 40.7, lon: -73.9 }, sharingEnabled: false });
    expect(off.queryByTestId('vehicle-sheet-on')).toBeNull();
    expect(off.getByTestId('vehicle-sheet-note')).toBeTruthy();
  });

  it('lets a rider marked on board say they are not', () => {
    const onDismiss = jest.fn();
    const screen = renderSheet({ onDismiss, ridingTripId: 't1' });
    fireEvent.press(screen.getByTestId('vehicle-sheet-not-on'));
    expect(onDismiss).toHaveBeenCalledWith('t1');
  });
});

describe('fare types', () => {
  const itinerary = (id: string, cents: number, reducedCents?: number): Itinerary => ({
    id,
    departureTime: '2026-10-30T12:00:00Z',
    arrivalTime: '2026-10-30T13:00:00Z',
    durationSeconds: 3600,
    transfers: 0,
    steps: [],
    fare: { text: `$${cents / 100}`, cents, currency: 'USD', estimated: true, ...(reducedCents != null ? { reduced: { text: `$${reducedCents / 100}`, cents: reducedCents } } : {}) },
  });

  it('shows the reduced fare when known, otherwise the full one', () => {
    expect(fareLabel(itinerary('a', 300, 150).fare, 'reduced')).toBe('$1.5');
    expect(fareLabel(itinerary('a', 300, 150).fare)).toBe('$3');
    expect(fareLabel(itinerary('a', 725).fare, 'reduced')).toBe('$7.25');
  });

  it('sorts lowest fare by what this rider pays', () => {
    const trips = [itinerary('cheap-for-everyone', 400), itinerary('half-price', 600, 300)];
    expect(orderItineraries(trips, 'cheapest').map((trip) => trip.id)[0]).toBe('cheap-for-everyone');
    expect(orderItineraries(trips, 'cheapest', 'reduced').map((trip) => trip.id)[0]).toBe('half-price');
  });

  it('defaults to full fare with ride sharing off, and survives saved values', () => {
    expect(DEFAULT_PREFERENCES.travel.fareType).toBe('full');
    expect(DEFAULT_PREFERENCES.shareRides).toBe(false);
    const saved = parsePreferences(JSON.stringify({ travel: { fareType: 'reduced' }, shareRides: true }));
    expect(saved.travel.fareType).toBe('reduced');
    expect(saved.shareRides).toBe(true);
    expect(parsePreferences(JSON.stringify({ travel: { fareType: 'nonsense' } })).travel.fareType).toBe('full');
  });
});
