import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import App from '../App';
import { colors } from '../src/theme/colors';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('@expo-google-fonts/nunito/useFonts', () => ({
  useFonts: () => [true],
}));

function createHealthyFetchMock() {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok', service: 'pathly-api' }),
  });
}

describe('Pathly heartbeat', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('renders route-colored cards with two directions and live or scheduled minutes', async () => {
    const fetchMock = createHealthyFetchMock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const screen = render(<App />);

    expect(screen.getByText('Where to?')).toBeTruthy();
    expect(screen.getByText('Nearby transit')).toBeTruthy();
    expect(screen.getAllByText('Ronkonkoma Branch')).toHaveLength(2);
    expect(screen.getAllByText('S1')).toHaveLength(2);
    expect(screen.getAllByText('E Train')).toHaveLength(2);
    expect(screen.getByText('Westbound to Penn Station')).toBeTruthy();
    expect(screen.getByText('Eastbound to Ronkonkoma')).toBeTruthy();
    expect(screen.getByText('Southbound to Amityville')).toBeTruthy();
    expect(screen.getByText('Uptown to Jamaica Center')).toBeTruthy();
    expect(screen.getAllByText('minutes')).toHaveLength(6);
    expect(screen.getAllByText('Scheduled')).toHaveLength(3);
    expect(screen.getAllByLabelText(/live GPS prediction/)).toHaveLength(3);
    expect(screen.queryByText('AROUND YOU')).toBeNull();
    expect(screen.queryByText('PATHLY HEARTBEAT · MOCK DATA')).toBeNull();
    expect(screen.queryByText('API online')).toBeNull();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/health',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('stays usable when the API is offline without technical status', async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new Error('API unavailable'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const screen = render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText('Ronkonkoma Branch')).toHaveLength(2);
    expect(screen.queryByText('API offline')).toBeNull();
  });

  it('opens search, shows matches, and cancels', async () => {
    globalThis.fetch = createHealthyFetchMock() as unknown as typeof fetch;
    const screen = render(<App />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('search-trigger'));
    expect(screen.getByLabelText('Search destinations')).toBeTruthy();
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.queryByText('DESTINATIONS')).toBeNull();

    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    expect(screen.getByText('3 matches')).toBeTruthy();
    expect(screen.getByText('Smithtown, NY')).toBeTruthy();
    expect(screen.getByText('Commack, NY')).toBeTruthy();
    expect(screen.getByText('Hauppauge, NY')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Cancel destination search'));
    expect(screen.getByText('Nearby transit')).toBeTruthy();
  });

  it('opens route predictions, alerts, location and pin controls, then returns home', async () => {
    globalThis.fetch = createHealthyFetchMock() as unknown as typeof fetch;
    const screen = render(<App />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('ronkonkoma-card-primary'));

    expect(screen.getByTestId('ronkonkoma-route-view')).toBeTruthy();
    expect(screen.getByText('Westbound · toward Penn Station')).toBeTruthy();
    expect(screen.getByLabelText('4 minutes, live GPS prediction')).toBeTruthy();
    expect(screen.getByLabelText('18 minutes, scheduled time')).toBeTruthy();
    expect(screen.getByLabelText('34 minutes, live GPS prediction')).toBeTruthy();
    expect(screen.queryByText('Selected')).toBeNull();
    expect(screen.queryByText('Next train')).toBeNull();
    expect(screen.getByLabelText('Show current location')).toBeTruthy();

    expect(screen.getByTestId('route-pin').props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(screen.getByTestId('route-pin'));
    expect(screen.getByTestId('route-pin').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(screen.getByTestId('service-alerts'));
    expect(screen.getByText('No delays reported on this route.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('route-back'));
    expect(screen.getByText('Nearby transit')).toBeTruthy();
  });

  it('keeps search results informational', async () => {
    globalThis.fetch = createHealthyFetchMock() as unknown as typeof fetch;
    const screen = render(<App />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('search-trigger'));
    expect(screen.getByTestId('search-result-recent-penn-station').props.onPress).toBeUndefined();
  });

  it('uses equal display sizes for route names and minute counts', async () => {
    globalThis.fetch = createHealthyFetchMock() as unknown as typeof fetch;
    const screen = render(<App />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    for (const route of ['R', 'S1', 'E']) {
      expect(StyleSheet.flatten(screen.getAllByTestId(`transit-${route}-title`)[0].props.style)).toEqual(
        expect.objectContaining({ fontFamily: 'Nunito_800ExtraBold', fontSize: 24 }),
      );
      expect(StyleSheet.flatten(screen.getByTestId(`transit-${route}-arrival-0`).props.style)).toEqual(
        expect.objectContaining({ fontFamily: 'Nunito_800ExtraBold', fontSize: 24 }),
      );
    }
    expect(StyleSheet.flatten(screen.getByTestId('ronkonkoma-card').props.style)).toEqual(
      expect.objectContaining({ backgroundColor: colors.primary }),
    );
  });

  it('expands the nearby sheet from its accessible drag handle', async () => {
    jest.useFakeTimers();
    globalThis.fetch = createHealthyFetchMock() as unknown as typeof fetch;
    const screen = render(<App />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('transit-sheet-handle').props.accessibilityState).toEqual({
      expanded: false,
    });
    act(() => {
      fireEvent.press(screen.getByTestId('transit-sheet-handle'));
      jest.runAllTimers();
    });
    expect(screen.getByTestId('transit-sheet-handle').props.accessibilityState).toEqual({
      expanded: true,
    });
    jest.useRealTimers();
  });

  it('keeps every stop associated with the next prediction', async () => {
    globalThis.fetch = createHealthyFetchMock() as unknown as typeof fetch;
    const screen = render(<App />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('ronkonkoma-card-primary'));
    expect(screen.getByLabelText('Stony Brook, departs 10:04 AM')).toBeTruthy();
    expect(screen.getByLabelText('St. James, arrives 10:11 AM')).toBeTruthy();
    expect(screen.getByLabelText('Smithtown, arrives 10:16 AM')).toBeTruthy();
    expect(screen.getByLabelText('Kings Park, arrives 10:23 AM')).toBeTruthy();
    expect(screen.getByLabelText('Northport, arrives 10:34 AM')).toBeTruthy();
  });
});
