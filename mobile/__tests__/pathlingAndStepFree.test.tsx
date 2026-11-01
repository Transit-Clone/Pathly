import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import { AuthProvider } from '../src/auth/AuthContext';
import { SettingsPathling, usePathlingsMove } from '../src/components/LivelyPathling';
import { RideReportBar } from '../src/components/RideReportBar';
import { notStepFreeStops } from '../src/data/accessibleStops';
import type { Itinerary } from '../src/data/tripPlanning';
import { AppSettingsProvider, EASY_TEXT_SCALE, useAppSettings } from '../src/theme/AppSettings';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

const leg = (agencyId: string, boardStopId: string, alightStopId: string | undefined, from: string, to: string) => ({
  kind: 'transit',
  from: { name: from },
  to: { name: to },
  liveRoute: { agencyId, routeId: '7', boardStopId, alightStopId },
});
const trip = (...steps: unknown[]) => ({ id: 't', steps }) as unknown as Itinerary;

describe('step-free trips', () => {
  const stops = new Map([
    ['subway', { everyStop: false, stopIds: ['701S', '702S'] }],
    ['nice', { everyStop: true, stopIds: [] }],
  ]);

  it('names the boarding and alighting stops without access', () => {
    expect(notStepFreeStops(trip(leg('subway', '701S', '710S', 'Flushing', 'Queensboro')), stops)).toEqual(['Queensboro']);
    expect(notStepFreeStops(trip(leg('subway', '720S', '710S', 'Hunters Pt', 'Queensboro')), stops)).toEqual(['Hunters Pt', 'Queensboro']);
  });

  it('never flags what it can\'t know, or an agency step-free everywhere', () => {
    expect(notStepFreeStops(trip(leg('subway', '701S', '702S', 'A', 'B')), stops)).toEqual([]);
    expect(notStepFreeStops(trip(leg('nice', 'x', 'y', 'A', 'B')), stops)).toEqual([]);
    expect(notStepFreeStops(trip(leg('lirr', 'x', 'y', 'A', 'B')), stops)).toEqual([]);
    expect(notStepFreeStops(trip(leg('subway', '701S', undefined, 'A', 'B')), stops)).toEqual([]);
  });
});

describe('settings Pathling', () => {
  const show = (reduced = false) => render(
    <AppSettingsProvider initialReducedMotion={reduced}><AuthProvider><SettingsPathling size={120} testID="bean" /></AuthProvider></AppSettingsProvider>,
  );

  it('talks when animations are allowed', () => {
    show();
    expect(screen.getByTestId('settings-pathling-line', { includeHiddenElements: true })).toBeTruthy();
  });

  it('stays quiet under reduced motion', () => {
    show(true);
    expect(screen.queryByTestId('settings-pathling-line', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('bean')).toBeTruthy();
  });
});

describe('Easy mode', () => {
  const Probe = () => {
    const { easyMode, setEasyMode, textScale } = useAppSettings();
    const moves = usePathlingsMove();
    return <Text onPress={() => setEasyMode(!easyMode)} testID="probe">{`${textScale} ${moves}`}</Text>;
  };

  it('makes text bigger and stills the Pathlings, and undoes both', async () => {
    render(<AppSettingsProvider><Probe /></AppSettingsProvider>);
    expect(screen.getByTestId('probe')).toHaveTextContent('1 true');
    fireEvent.press(screen.getByTestId('probe'));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`${EASY_TEXT_SCALE} false`));
    fireEvent.press(screen.getByTestId('probe'));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('1 true'));
  });

  it('leaves rider reports out', () => {
    const Toggle = () => {
      const { easyMode, setEasyMode } = useAppSettings();
      return (
        <>
          <Text onPress={() => setEasyMode(!easyMode)} testID="toggle">toggle</Text>
          <AuthProvider><RideReportBar fix={null} source={{ agencyId: 'subway', routeId: '7' } as never} tripId="t" /></AuthProvider>
        </>
      );
    };
    render(<AppSettingsProvider><Toggle /></AppSettingsProvider>);
    expect(screen.getByTestId('ride-report-packed')).toBeTruthy();
    fireEvent.press(screen.getByTestId('toggle'));
    expect(screen.queryByTestId('ride-report-packed')).toBeNull();
  });
});
