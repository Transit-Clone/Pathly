import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import { RouteDetailView } from '../src/components/RouteDetailView';
import { applyRouteLive } from '../src/data/applyRouteLive';
import { routeNotices } from '../src/data/routeNotices';
import { routeById, type RouteDetail } from '../src/data/transit';
import { AppSettingsProvider } from '../src/theme/AppSettings';
import { lightColors } from '../src/theme/colors';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

const liveRoute: RouteDetail = { ...routeById.s1, alert: 'No delays reported on this route.' };
const alert = { id: 'a1', header: 'Southbound buses are detoured', description: 'Use the stop on Main St.' };

describe('routeNotices', () => {
  it('lists late tracked departures, then service alerts, warnings first', () => {
    const upcoming = { id: 'u1', header: 'Weekend work', description: null, label: 'Upcoming service change', warning: false, upcoming: true };
    const detour = { ...alert, label: 'Detour in effect', warning: true, upcoming: false };
    const notices = routeNotices({ ...liveRoute, serviceAlerts: [upcoming, detour] }, [
      { minutes: 4, live: true, delayMinutes: 6 },
      { minutes: 9, live: true, delayMinutes: 1 }, // within ordinary running time
      { minutes: 15, live: false, delayMinutes: null },
      { minutes: 0, live: true, delayMinutes: 3 },
    ], 'bus');
    expect(notices).toEqual([
      { kind: 'delay', label: 'Running late', warning: true, title: 'Bus in 4 min is running 6 min late', detail: null },
      { kind: 'delay', label: 'Running late', warning: true, title: 'Bus due now is running 3 min late', detail: null },
      { kind: 'alert', label: 'Detour in effect', warning: true, title: alert.header, detail: alert.description },
      { kind: 'alert', label: 'Upcoming service change', warning: false, title: 'Weekend work', detail: null },
    ]);
  });

  it('is empty for an on-time route with no alerts', () => {
    expect(routeNotices(liveRoute, [{ minutes: 4, live: true, delayMinutes: 0 }], 'subway')).toEqual([]);
  });

  it('keeps a demo route\'s written advisory', () => {
    expect(routeNotices(routeById.s1, [], 'bus')).toEqual([{ kind: 'alert', label: 'Service advisory', warning: true, title: routeById.s1.alert, detail: null }]);
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

describe('Route Details alert pill', () => {
  const renderRoute = (route: RouteDetail) => render(
    <AppSettingsProvider>
      <RouteDetailView isFavorite={false} onBack={jest.fn()} onToggleFavorite={jest.fn()} route={route} />
    </AppSettingsProvider>,
  );

  it('names the most pressing alert, in yellow, and opens every alert in a sheet', async () => {
    const detour = { ...alert, label: 'Detour in effect', warning: true, upcoming: false };
    const screen = renderRoute({ ...liveRoute, serviceAlerts: [detour], predictions: [{ minutes: 4, live: true, delayMinutes: 6 }, { minutes: 19, live: false }] });
    const pill = screen.getByTestId('service-alerts');
    expect(within(pill).getByText('Running late')).toBeTruthy();
    expect(within(pill).getByText('+1 more')).toBeTruthy();
    expect(StyleSheet.flatten(pill.props.style).backgroundColor).toBe(lightColors.alertYellow);
    expect(screen.queryByTestId('service-alerts-list')).toBeNull();
    fireEvent.press(pill);
    const sheet = within(screen.getByTestId('service-alerts-list'));
    expect(sheet.getByText('Bus in 4 min is running 6 min late')).toBeTruthy();
    expect(sheet.getByText('Detour in effect')).toBeTruthy();
    expect(sheet.getByText(alert.header)).toBeTruthy();
    expect(sheet.getByText(alert.description)).toBeTruthy();
    fireEvent.press(screen.getByTestId('service-alerts-close'));
    expect(screen.queryByTestId('service-alerts-list')).toBeNull();
    await act(async () => {}); // settle the route's geometry fetch
  });

  it('is neutral for an upcoming change', async () => {
    const upcoming = { ...alert, label: 'Upcoming service change', warning: false, upcoming: true };
    const screen = renderRoute({ ...liveRoute, serviceAlerts: [upcoming], predictions: [{ minutes: 4, live: true, delayMinutes: 0 }] });
    const pill = screen.getByTestId('service-alerts');
    expect(within(pill).getByText('Upcoming service change')).toBeTruthy();
    expect(StyleSheet.flatten(pill.props.style).backgroundColor).toBe(lightColors.surfaceMuted);
    await act(async () => {});
  });

  it('makes no on-time claim over the route stops', async () => {
    const screen = renderRoute({ ...liveRoute, serviceAlerts: [], predictions: [{ minutes: 4, live: false }] });
    expect(screen.queryByTestId('route-stops-status')).toBeNull();
    expect(screen.queryByText('On time')).toBeNull();
    await act(async () => {});
  });

  it('names a departure that ends short of the usual terminal', async () => {
    const usual = liveRoute.directions[0]!.direction;
    const screen = renderRoute({ ...liveRoute, serviceAlerts: [], predictions: [{ minutes: 4, live: true, delayMinutes: 0, headsign: 'Clove Rd' }, { minutes: 9, live: true, delayMinutes: 0, headsign: usual }] });
    expect(screen.getByTestId('route-prediction-end-0-0')).toBeTruthy();
    expect(screen.getByText('To Clove Rd')).toBeTruthy();
    expect(screen.queryByTestId('route-prediction-end-0-1')).toBeNull();
    await act(async () => {});
  });

  it('is left out when the route is on time with no alerts', async () => {
    const screen = renderRoute({ ...liveRoute, serviceAlerts: [], predictions: [{ minutes: 4, live: true, delayMinutes: 0 }] });
    expect(screen.queryByTestId('service-alerts')).toBeNull();
    expect(screen.queryByText('On time')).toBeNull();
    await act(async () => {});
  });
});
