import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  EnrouteNavigationView,
  EnrouteRecoveryView,
  type EnrouteLocationState,
} from '../src/components/EnrouteNavigationView';
import {
  initialNavigationCursor,
  normalizeItinerary,
  type ActiveTripRuntime,
  type NavigationCursor,
  type NormalizedNavigationPlan,
} from '../src/data/enrouteNavigation';
import { formatTripClock, type Itinerary, type LatLng, type TransitStep, type WalkStep } from '../src/data/tripPlanning';
import type { RideTracking } from '../src/data/rideTracking';
import { AppSettingsProvider } from '../src/theme/AppSettings';

const baseTime = Date.UTC(2026, 9, 15, 13);
const at = (minutes: number) => new Date(baseTime + minutes * 60_000).toISOString();
const point = (latOffset: number): LatLng => ({ lat: 40.7 + latOffset, lng: -73.9 });
const stop = (name: string, location: LatLng, minute: number) => ({ name, location, time: at(minute) });

const walk = (toName: string, path: LatLng[], minutes = 5): WalkStep => ({
  kind: 'walk',
  distanceMeters: minutes * 80,
  durationSeconds: minutes * 60,
  path,
  toName,
});

const transit = (
  name: string,
  fromPoint: LatLng,
  toPoint: LatLng,
  fromMinute: number,
  toMinute: number,
  intermediate?: { name: string; point: LatLng; minute: number }[],
): TransitStep => ({
  agency: { name: 'Demo Transit' },
  durationSeconds: (toMinute - fromMinute) * 60,
  from: stop(`${name} origin`, fromPoint, fromMinute),
  headsign: `Downtown via ${name}`,
  kind: 'transit',
  line: { color: '#2457C5', name, shortName: name },
  mode: 'bus',
  path: [fromPoint, ...(intermediate ?? []).map((item) => item.point), toPoint],
  stopCount: (intermediate?.length ?? 0) + 1,
  ...(intermediate ? { stops: intermediate.map((item) => stop(item.name, item.point, item.minute)) } : {}),
  to: stop(`${name} terminal`, toPoint, toMinute),
});

const origin = point(0);
const boardOne = point(0.001);
const knownStop = point(0.003);
const transfer = point(0.005);
const boardTwo = point(0.006);
const alightTwo = point(0.01);
const destination = point(0.011);

const itinerary: Itinerary = {
  arrivalTime: at(45),
  departureTime: at(0),
  durationSeconds: 45 * 60,
  id: 'component-test-trip',
  steps: [
    walk('10 origin', [origin, boardOne]),
    transit('10', boardOne, transfer, 5, 20, [{ minute: 12, name: 'First Street', point: knownStop }]),
    walk('20 origin', [transfer, boardTwo], 4),
    transit('20', boardTwo, alightTwo, 25, 40),
    walk('Demo destination', [alightTwo, destination], 5),
  ],
  transfers: 1,
};

const plan = normalizeItinerary(itinerary);

const safeAreaMetrics = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 47 },
};

function TestProviders({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <AppSettingsProvider initialReducedMotion={true}>{children}</AppSettingsProvider>
    </SafeAreaProvider>
  );
}

function cursorAt(checkpointPlan: NormalizedNavigationPlan, predicate: (kind: string, label: string) => boolean): NavigationCursor {
  const checkpoint = checkpointPlan.checkpoints.find((candidate) => predicate(candidate.kind, candidate.label));
  if (!checkpoint) throw new Error('Expected navigation checkpoint was not normalized');
  return {
    checkpointOrdinal: checkpoint.ordinal,
    lastAdvancedAt: baseTime,
    phase: checkpoint.phase,
    stepIndex: checkpoint.stepIndex,
  };
}

function runtime(checkpointPlan: NormalizedNavigationPlan, trip: Itinerary, cursor: NavigationCursor): ActiveTripRuntime {
  return {
    cursor,
    destination: { kind: 'place', label: checkpointPlan.destinationName, placeId: 'destination-place-id' },
    evidence: null,
    itinerary: trip,
    origin: { kind: 'coordinate', label: 'Demo origin', point: origin, savedAt: baseTime },
    plan: checkpointPlan,
    selection: checkpointPlan.selection,
    sessionId: 'session-1',
    startedAt: baseTime,
    uid: 'rider-1',
    updatedAt: baseTime,
  };
}

type RenderNavigationOptions = {
  checkpointPlan?: NormalizedNavigationPlan;
  isAdmin?: boolean;
  locationState?: EnrouteLocationState;
  onDemoCheckpoint?: jest.Mock;
  onEnd?: jest.Mock;
  onResetDemo?: jest.Mock;
  ride?: RideTracking;
  trip?: Itinerary;
};

function renderNavigation(cursor: NavigationCursor, options: RenderNavigationOptions = {}) {
  const checkpointPlan = options.checkpointPlan ?? plan;
  const trip = options.trip ?? itinerary;
  const onEnd = options.onEnd ?? jest.fn();
  const screen = render(
    <TestProviders>
      <EnrouteNavigationView
        cursor={cursor}
        fix={null}
        isAdmin={options.isAdmin ?? false}
        locationState={options.locationState ?? 'located'}
        onBack={jest.fn()}
        onDemoCheckpoint={options.onDemoCheckpoint}
        onEnd={onEnd}
        onResetDemo={options.onResetDemo}
        plan={checkpointPlan}
        ride={options.ride}
        session={runtime(checkpointPlan, trip, cursor)}
      />
    </TestProviders>,
  );
  return { onEnd, screen };
}

describe('EnrouteNavigationView ride sharing', () => {
  it('says when a ride is shared, and lets the rider say they are not on it', () => {
    const dismiss = jest.fn();
    const { screen } = renderNavigation(cursorAt(plan, (_kind, label) => label === 'First Street'), { ride: { ridingTripId: 'bus-1', sharingEnabled: true, claim: jest.fn(), dismiss } });
    expect(screen.getByTestId('enroute-ride-sharing')).toBeTruthy();
    fireEvent.press(screen.getByTestId('enroute-ride-not-on'));
    expect(dismiss).toHaveBeenCalledWith('bus-1');
  });

  it('shows nothing when no ride is shared', () => {
    const { screen } = renderNavigation(cursorAt(plan, (_kind, label) => label === 'First Street'));
    expect(screen.queryByTestId('enroute-ride-sharing')).toBeNull();
  });
});

describe('EnrouteNavigationView guidance', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders walking, waiting, riding, transferring, and arrived states from the normalized cursor', () => {
    const walking = renderNavigation(initialNavigationCursor(plan, baseTime)).screen;
    expect(walking.getByText('WALKING')).toBeTruthy();
    expect(walking.getByTestId('enroute-current-action').props.children).toBe('Walk to 10 origin');
    walking.unmount();

    const waitingCursor = cursorAt(plan, (kind, label) => kind === 'board' && label === '10 origin');
    const waiting = renderNavigation(waitingCursor).screen;
    expect(waiting.getByText('WAITING TO BOARD')).toBeTruthy();
    expect(waiting.getByTestId('enroute-current-action').props.children).toBe('Board 10 at 10 origin');
    expect(waiting.getByTestId('enroute-remaining-stops').props.children).toBe('2 stops remaining');
    waiting.unmount();

    const ridingCursor = cursorAt(plan, (_kind, label) => label === 'First Street');
    const riding = renderNavigation(ridingCursor).screen;
    expect(riding.getByText('RIDING')).toBeTruthy();
    expect(riding.getByTestId('enroute-current-action').props.children).toBe('Ride 10 toward Downtown via 10');
    expect(riding.getByTestId('enroute-remaining-stops').props.children).toBe('1 stop remaining');
    riding.unmount();

    const transferCursor = cursorAt(plan, (kind, label) => kind === 'alight' && label === '10 terminal');
    const transferring = renderNavigation(transferCursor).screen;
    expect(transferring.getByText('TRANSFERRING')).toBeTruthy();
    expect(transferring.getByTestId('enroute-current-action').props.children).toBe('Transfer toward 20 origin');
    transferring.unmount();

    const arrivedCursor = cursorAt(plan, (kind) => kind === 'destination');
    const arrived = renderNavigation(arrivedCursor).screen;
    expect(arrived.getByText('ARRIVED')).toBeTruthy();
    expect(arrived.getByTestId('enroute-current-action').props.children).toBe('You’ve arrived at Demo destination');
    expect(arrived.queryByTestId('enroute-next-card')).toBeNull();
    expect(arrived.queryByTestId('enroute-next-action')).toBeNull();
  });

  it('is honest about a sparse transit leg with no known intermediate stops', () => {
    const sparseTrip: Itinerary = {
      arrivalTime: at(20),
      departureTime: at(0),
      durationSeconds: 20 * 60,
      id: 'sparse-trip',
      steps: [transit('S', origin, destination, 0, 20)],
      transfers: 0,
    };
    const sparsePlan = normalizeItinerary(sparseTrip);
    const sparseCursor = initialNavigationCursor(sparsePlan, baseTime);
    const screen = renderNavigation(sparseCursor, { checkpointPlan: sparsePlan, trip: sparseTrip }).screen;

    expect(screen.getByTestId('enroute-current-action').props.children).toBe('Board S at S origin');
    expect(screen.getByTestId('enroute-next-action').props.children).toBe('Arrive at S terminal');
    expect(screen.queryByTestId('enroute-remaining-stops')).toBeNull();
  });

  it('shows the selected departure while waiting and ages it from the app clock', () => {
    jest.useFakeTimers();
    jest.setSystemTime(baseTime);
    const waitingCursor = cursorAt(plan, (kind, label) => kind === 'board' && label === '10 origin');
    const screen = renderNavigation(waitingCursor).screen;

    expect(screen.getByTestId('enroute-departure-time').props.children).toBe(`Departs ${formatTripClock(at(5))} · in 5 min`);
    expect(screen.getByTestId('enroute-guidance').props.accessibilityLabel)
      .toContain(`Selected departure ${formatTripClock(at(5))}, in 5 minutes.`);

    act(() => jest.advanceTimersByTime(60_000));
    expect(screen.getByTestId('enroute-departure-time').props.children).toBe(`Departs ${formatTripClock(at(5))} · in 4 min`);
  });

  it('shows meaningful distance and duration metadata while walking and transferring', () => {
    const walking = renderNavigation(initialNavigationCursor(plan, baseTime)).screen;
    expect(walking.getByTestId('enroute-step-metadata').props.children).toBe('0.2 mi · 5 min');
    expect(walking.getByTestId('enroute-guidance').props.accessibilityLabel)
      .toContain('Walking distance 0.2 miles. estimated walking time 5 minutes.');
    walking.unmount();

    const transferCursor = cursorAt(plan, (kind, label) => kind === 'alight' && label === '10 terminal');
    const transferring = renderNavigation(transferCursor).screen;
    expect(transferring.getByTestId('enroute-step-metadata').props.children).toBe('0.2 mi · 4 min');
    expect(transferring.getByTestId('enroute-guidance').props.accessibilityLabel)
      .toContain('Transfer distance 0.2 miles. estimated transfer time 4 minutes.');
  });

  it('combines current, next, remaining-stop, and arrival guidance in one screen-reader label', () => {
    const waitingCursor = cursorAt(plan, (kind, label) => kind === 'board' && label === '10 origin');
    const screen = renderNavigation(waitingCursor).screen;
    const label = screen.getByTestId('enroute-guidance').props.accessibilityLabel;

    expect(label).toContain('Board 10 at 10 origin.');
    expect(label).toContain('Next: Continue to First Street.');
    expect(label).toContain('2 stops remaining.');
    expect(label).toContain(`Arrive ${formatTripClock(plan.arrivalTime)}`);
  });

  it('keeps confirmed guidance visible when location is unavailable', () => {
    const screen = renderNavigation(initialNavigationCursor(plan, baseTime), { locationState: 'unavailable' }).screen;

    expect(screen.getByTestId('enroute-current-action').props.children).toBe('Walk to 10 origin');
    expect(screen.getByTestId('enroute-location-unavailable')).toBeTruthy();
    expect(screen.getByText('Live location is unavailable. Keeping your last confirmed step.')).toBeTruthy();
  });
});

describe('EnrouteNavigationView controls', () => {
  it('requires END confirmation, with cancel preserving the trip and confirm ending it', () => {
    const { onEnd, screen } = renderNavigation(initialNavigationCursor(plan, baseTime));

    fireEvent.press(screen.getByTestId('enroute-end'));
    expect(screen.getByTestId('enroute-end-confirm')).toBeTruthy();
    fireEvent.press(screen.getByTestId('enroute-end-confirm-cancel'));
    expect(onEnd).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('enroute-end'));
    fireEvent.press(screen.getByTestId('enroute-end-confirm-confirm'));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('lets an admin select, step through, and reset deterministic checkpoints', () => {
    const onDemoCheckpoint = jest.fn();
    const onResetDemo = jest.fn();
    const screen = renderNavigation(initialNavigationCursor(plan, baseTime), {
      isAdmin: true,
      onDemoCheckpoint,
      onResetDemo,
    }).screen;

    expect(screen.getByTestId('enroute-demo-controls')).toBeTruthy();
    fireEvent.press(screen.getByTestId('enroute-demo-checkpoint-2'));
    expect(onDemoCheckpoint).toHaveBeenLastCalledWith(plan.checkpoints[2], 2);
    fireEvent.press(screen.getByTestId('enroute-demo-next'));
    expect(onDemoCheckpoint).toHaveBeenLastCalledWith(plan.checkpoints[3], 3);
    fireEvent.press(screen.getByTestId('enroute-demo-previous'));
    expect(onDemoCheckpoint).toHaveBeenLastCalledWith(plan.checkpoints[2], 2);
    fireEvent.press(screen.getByTestId('enroute-demo-reset'));
    expect(onResetDemo).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('enroute-demo-checkpoint-0').props.accessibilityState).toEqual({ selected: true });
  });

  it('does not expose admin checkpoint controls to a rider', () => {
    const screen = renderNavigation(initialNavigationCursor(plan, baseTime), {
      isAdmin: false,
      onDemoCheckpoint: jest.fn(),
      onResetDemo: jest.fn(),
    }).screen;

    expect(screen.queryByTestId('enroute-demo-controls')).toBeNull();
    expect(screen.queryByTestId('enroute-demo-reset')).toBeNull();
    expect(screen.queryByTestId(/^enroute-demo-checkpoint-/)).toBeNull();
  });
});

describe('EnrouteRecoveryView', () => {
  it('offers Retry and confirmed End without replacing the saved route', () => {
    const onBack = jest.fn();
    const onEnd = jest.fn();
    const onRetry = jest.fn();
    const screen = render(
      <TestProviders>
        <EnrouteRecoveryView destination="Demo destination" onBack={onBack} onEnd={onEnd} onRetry={onRetry} />
      </TestProviders>,
    );

    expect(screen.getByText('We can’t restore the exact route yet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('enroute-recovery-retry'));
    fireEvent.press(screen.getByTestId('enroute-recovery-back'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('enroute-recovery-end'));
    fireEvent.press(screen.getByTestId('enroute-recovery-end-confirm-cancel'));
    expect(onEnd).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('enroute-recovery-end'));
    fireEvent.press(screen.getByTestId('enroute-recovery-end-confirm-confirm'));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
