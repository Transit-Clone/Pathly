import { fireEvent, render } from '@testing-library/react-native';
import { Animated } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import { TransitSheet } from '../src/components/TransitSheet';
import { isInactiveRoute } from '../src/data/applyRouteLive';
import { routeById, type RouteDetail } from '../src/data/transit';
import { AppSettingsProvider } from '../src/theme/AppSettings';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

const mockLive = new Map<string, unknown>();
jest.mock('../src/data/TransitLiveContext', () => ({ useTransitLiveMap: () => mockLive }));

const source = { agencyId: 'nice', routeId: 'n1', direction1StopId: 'a', direction0StopId: 'b', direction1Index: 0 } as const;
const line = (id: string): RouteDetail => ({ ...routeById.s1, id, shortName: id, liveSource: { ...source, routeId: id } });
const live = (id: string, towardDirection1: { minutes: number; live: boolean }[]) => ({
  status: 'loaded',
  nearestStop: null,
  data: { routeId: id, fetchedAt: Date.now(), predictions: { towardDirection1, towardDirection0: [] }, vehicles: [] },
});

describe('isInactiveRoute', () => {
  const applied = (status: RouteDetail['liveStatus'], minutes: number[], isLive = false): RouteDetail => {
    const [first, second] = routeById.s1.directions;
    return {
      ...line('x'),
      liveStatus: status,
      directions: [{ ...first, minutes: minutes[0] ?? 0, live: isLive, unavailable: minutes[0] == null }, { ...second, minutes: minutes[1] ?? 0, live: isLive, unavailable: minutes[1] == null }],
    };
  };

  it('counts a line with nothing soon', () => {
    expect(isInactiveRoute(applied('loaded', []))).toBe(true);
    expect(isInactiveRoute(applied('loaded', [600, 640]))).toBe(true);
  });

  it('keeps a line running in either direction, or live at all', () => {
    expect(isInactiveRoute(applied('loaded', [600, 20]))).toBe(false);
    expect(isInactiveRoute(applied('loaded', [600], true))).toBe(false);
  });

  it('never hides a line on no answer', () => {
    expect(isInactiveRoute(applied('loading', []))).toBe(false);
    expect(isInactiveRoute(applied('error', []))).toBe(false);
  });
});

describe('Show inactive lines', () => {
  const renderSheet = (nearbyRoutes: RouteDetail[], savedRouteIds: string[] = []) => render(
    <AppSettingsProvider>
      <TransitSheet
        activeTab="nearby"
        findRoute={(id) => nearbyRoutes.find((route) => route.id === id)}
        mapHeight={400}
        nearbyRoutes={nearbyRoutes}
        nearbyStatus="loaded"
        onOpenRoute={jest.fn()}
        onOpenSavedLocation={jest.fn()}
        onTabChange={jest.fn()}
        savedLocations={[]}
        savedRouteIds={savedRouteIds}
        scrollY={new Animated.Value(0)}
      />
    </AppSettingsProvider>,
  );

  beforeEach(() => {
    mockLive.clear();
    mockLive.set('run', live('run', [{ minutes: 5, live: true }]));
    mockLive.set('sim', live('sim', [{ minutes: 600, live: false }]));
  });

  it('keeps inactive lines behind the button until asked', () => {
    const screen = renderSheet([line('run'), line('sim')]);
    expect(screen.getByTestId('route-card-run')).toBeTruthy();
    expect(screen.queryByTestId('route-card-sim')).toBeNull();
    fireEvent.press(screen.getByTestId('see-inactive-lines'));
    expect(screen.getByTestId('route-card-sim')).toBeTruthy();
    fireEvent.press(screen.getByTestId('see-inactive-lines'));
    expect(screen.queryByTestId('route-card-sim')).toBeNull();
  });

  it('has no button when every line is running', () => {
    expect(renderSheet([line('run')]).queryByTestId('see-inactive-lines')).toBeNull();
  });

  it('says so when nothing nearby is running', () => {
    const screen = renderSheet([line('sim')]);
    expect(screen.getByText('No nearby lines are running right now.')).toBeTruthy();
    expect(screen.getByTestId('see-inactive-lines')).toBeTruthy();
  });
});
