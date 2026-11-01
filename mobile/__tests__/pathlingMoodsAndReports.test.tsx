import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { BEAN_COLORS, beanWithMood, DEFAULT_BEAN_AVATAR, normalizeBeanAvatar } from '../src/avatars/beanAvatar';
import { AuthProvider } from '../src/auth/AuthContext';
import { RideReportBar } from '../src/components/RideReportBar';
import { sendRideReport } from '../src/data/rideReports';
import { AppSettingsProvider } from '../src/theme/AppSettings';

jest.mock('../src/data/rideReports', () => ({
  ...jest.requireActual('../src/data/rideReports'),
  sendRideReport: jest.fn(() => Promise.resolve(true)),
}));

const fix = { at: 1, lat: 40.7, lon: -73.9, accuracyMeters: 20 };
const source = { agencyId: 'subway', routeId: '7' } as const;
const renderBar = (props: Partial<Parameters<typeof RideReportBar>[0]> = {}) => render(
  <AppSettingsProvider><AuthProvider><RideReportBar fix={fix} source={source} tripId="trip-1" {...props} /></AuthProvider></AppSettingsProvider>,
);

describe('Pathling colors', () => {
  it('moves a retired color to its nearest match instead of the default', () => {
    expect(normalizeBeanAvatar({ ...DEFAULT_BEAN_AVATAR, color: 'cobalt' }).color).toBe('periwinkle');
    expect(normalizeBeanAvatar({ ...DEFAULT_BEAN_AVATAR, color: 'magenta' }).color).toBe('pink');
    expect(BEAN_COLORS.some((color) => (color.id as string) === 'cobalt')).toBe(false);
  });
});

describe('mascot moods', () => {
  const rider = { ...DEFAULT_BEAN_AVATAR, color: 'pink', hair: 'curl' } as const;

  it('changes only the face, keeping the rider\'s color and hair', () => {
    const worried = beanWithMood(rider, 'worried');
    expect(worried).toMatchObject({ color: 'pink', hair: 'curl', eyes: 'uneven', mouth: 'wobble' });
  });

  it('leaves the rider\'s own face by default', () => {
    expect(beanWithMood(rider, 'own')).toEqual(rider);
  });
});

describe('ride reports', () => {
  beforeEach(() => jest.mocked(sendRideReport).mockClear());

  it('sends one tap with the rider\'s fix and thanks them', async () => {
    renderBar();
    fireEvent.press(screen.getByTestId('ride-report-packed'));
    await waitFor(() => expect(sendRideReport).toHaveBeenCalledWith(source, 'trip-1', 'packed', fix));
    expect(screen.getByTestId('ride-report-packed').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('ride-report-note')).toHaveTextContent(/Thanks/);
  });

  it('replaces packed with seats open, since only one can be true', async () => {
    renderBar();
    fireEvent.press(screen.getByTestId('ride-report-packed'));
    await waitFor(() => expect(sendRideReport).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('ride-report-seats'));
    await waitFor(() => expect(sendRideReport).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('ride-report-packed').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('ride-report-seats').props.accessibilityState.selected).toBe(true);
  });

  it('undoes the tap and says why when the backend refuses it', async () => {
    jest.mocked(sendRideReport).mockResolvedValueOnce(false);
    renderBar();
    fireEvent.press(screen.getByTestId('ride-report-stuck'));
    await waitFor(() => expect(screen.getByTestId('ride-report-note')).toHaveTextContent(/doesn’t match/));
    expect(screen.getByTestId('ride-report-stuck').props.accessibilityState.selected).toBe(false);
  });

  it('asks for location rather than sending without it', () => {
    renderBar({ fix: null });
    fireEvent.press(screen.getByTestId('ride-report-seats'));
    expect(sendRideReport).not.toHaveBeenCalled();
    expect(screen.getByTestId('ride-report-note')).toHaveTextContent(/location/);
  });
});

describe('trip card live signal', () => {
  const { withMapLive } = jest.requireActual('../src/components/PlannedTripDetailView');
  const now = Date.parse('2026-11-03T15:00:00Z');
  const ride = (time: string) => ({ kind: 'transit', from: { time }, liveRoute: { agencyId: 'subway', routeId: '7', boardStopId: 'x', directionId: 1 } });
  const model = { legs: [{ shortName: '7' }] };
  const vehicle = { lineKey: 'subway:7:1' };

  it('follows a vehicle shown on the map for a ride leaving soon', () => {
    const shown = withMapLive(model, { steps: [ride('2026-11-03T15:10:00Z')] }, [vehicle], now);
    expect(shown.legs[0].live).toBe(true);
  });

  it('stays off for a later departure or a line with no vehicle shown', () => {
    expect(withMapLive(model, { steps: [ride('2026-11-03T17:00:00Z')] }, [vehicle], now).legs[0].live).toBeUndefined();
    expect(withMapLive(model, { steps: [ride('2026-11-03T15:10:00Z')] }, [], now).legs[0].live).toBeUndefined();
  });
});
