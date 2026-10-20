import { act, fireEvent, render } from '@testing-library/react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import { RouteDetailView } from '../src/components/RouteDetailView';
import { applyRouteLive } from '../src/data/applyRouteLive';
import { routeNotices } from '../src/data/routeNotices';
import { routeById, type RouteDetail } from '../src/data/transit';
import { AppSettingsProvider } from '../src/theme/AppSettings';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

const liveRoute: RouteDetail = { ...routeById.s1, alert: 'No delays reported on this route.' };
const alert = { id: 'a1', header: 'Southbound buses are detoured', description: 'Use the stop on Main St.' };

describe('routeNotices', () => {
  it('lists late tracked departures, then service alerts', () => {
    const notices = routeNotices({ ...liveRoute, serviceAlerts: [alert] }, [
      { minutes: 4, live: true, delayMinutes: 6 },
      { minutes: 9, live: true, delayMinutes: 1 }, // within ordinary running time
      { minutes: 15, live: false, delayMinutes: null },
      { minutes: 0, live: true, delayMinutes: 3 },
    ], 'bus');
    expect(notices).toEqual([
      { kind: 'delay', title: 'Bus in 4 min is running 6 min late', detail: null },
      { kind: 'delay', title: 'Bus due now is running 3 min late', detail: null },
      { kind: 'alert', title: alert.header, detail: alert.description },
    ]);
  });

  it('is empty for an on-time route with no alerts', () => {
    expect(routeNotices(liveRoute, [{ minutes: 4, live: true, delayMinutes: 0 }], 'subway')).toEqual([]);
  });

  it('keeps a demo route\'s written advisory', () => {
    expect(routeNotices(routeById.s1, [], 'bus')).toEqual([{ kind: 'alert', title: routeById.s1.alert, detail: null }]);
  });
});

describe('applyRouteLive', () => {
  it('carries the route\'s alerts and each departure\'s delay', () => {
    const live = applyRouteLive(liveRoute, {
      status: 'loaded',
      nearestStop: null,
      data: {
        routeId: liveRoute.liveSource!.routeId,
        fetchedAt: Date.now(),
        vehicles: [],
        alerts: [alert],
        predictions: { towardDirection1: [{ minutes: 5, live: true, peakOffpeak: null, delayMinutes: 4 }], towardDirection0: [] },
      },
    });
    expect(live.serviceAlerts).toEqual([alert]);
    expect(live.predictions[0]).toMatchObject({ minutes: 5, delayMinutes: 4 });
  });
});

describe('Route Details delays dropdown', () => {
  const renderRoute = (route: RouteDetail) => render(
    <AppSettingsProvider>
      <RouteDetailView isFavorite={false} onBack={jest.fn()} onToggleFavorite={jest.fn()} route={route} />
    </AppSettingsProvider>,
  );

  it('appears under the time cards with delays and alerts, and opens to list them', async () => {
    const screen = renderRoute({ ...liveRoute, serviceAlerts: [alert], predictions: [{ minutes: 4, live: true, delayMinutes: 6 }, { minutes: 19, live: false }] });
    expect(screen.getByText('Delays and alerts')).toBeTruthy();
    expect(screen.getByText('Delayed')).toBeTruthy();
    expect(screen.getByText('6 min late')).toBeTruthy();
    expect(screen.queryByText(alert.header)).toBeNull();
    fireEvent.press(screen.getByTestId('service-alerts'));
    expect(screen.getByText('Bus in 4 min is running 6 min late')).toBeTruthy();
    expect(screen.getByText(alert.header)).toBeTruthy();
    expect(screen.getByText(alert.description)).toBeTruthy();
    await act(async () => {}); // settle the route's geometry fetch
  });

  it('is left out when the route is on time with no alerts', async () => {
    const screen = renderRoute({ ...liveRoute, serviceAlerts: [], predictions: [{ minutes: 4, live: true, delayMinutes: 0 }] });
    expect(screen.queryByTestId('service-alerts')).toBeNull();
    expect(screen.getByText('On time')).toBeTruthy();
    await act(async () => {});
  });
});
