import { fireEvent, render, waitFor } from '@testing-library/react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import App from '../App';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

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

  it('renders the proposal-inspired home screen without developer status UI', async () => {
    const fetchMock = createHealthyFetchMock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const screen = render(<App />);

    expect(screen.getByText('Where to?')).toBeTruthy();
    expect(screen.getByText('Nearby transit')).toBeTruthy();
    expect(screen.getByText('Ronkonkoma Branch')).toBeTruthy();
    expect(screen.getByText('Amityville → Halesite')).toBeTruthy();
    expect(screen.getByText('World Trade Center')).toBeTruthy();
    expect(screen.queryByText('PATHLY HEARTBEAT · MOCK DATA')).toBeNull();
    expect(screen.queryByText('API online')).toBeNull();
    expect(screen.queryByText('API offline')).toBeNull();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/health',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      }),
    );
  });

  it('stays usable when the API is offline without showing technical status', async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new Error('API unavailable'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const screen = render(<App />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Ronkonkoma Branch')).toBeTruthy();
    expect(screen.queryByText('API online')).toBeNull();
    expect(screen.queryByText('API offline')).toBeNull();
  });

  it('opens search, shows proposal matches without selecting them, and cancels', async () => {
    const fetchMock = createHealthyFetchMock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const screen = render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('search-trigger'));

    expect(screen.getByTestId('search-view')).toBeTruthy();
    expect(screen.getByLabelText('Search destinations')).toBeTruthy();
    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getByText('142 Christian Ave')).toBeTruthy();
    expect(screen.getByText('Stony Brook University')).toBeTruthy();
    expect(screen.getByText('Penn Station')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');

    expect(screen.getByText('3 matches')).toBeTruthy();
    expect(screen.getByText('Smithtown, NY')).toBeTruthy();
    expect(screen.getByText('Commack, NY')).toBeTruthy();
    expect(screen.getByText('Hauppauge, NY')).toBeTruthy();
    expect(screen.queryByText('✓')).toBeNull();
    expect(screen.getByTestId('search-result-terry-road-smithtown').props.onPress).toBeUndefined();

    fireEvent.press(screen.getByLabelText('Cancel destination search'));
    expect(screen.getByText('Nearby transit')).toBeTruthy();
  });

  it('opens the Ronkonkoma route, switches departures, and returns home', async () => {
    const fetchMock = createHealthyFetchMock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const screen = render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('ronkonkoma-card'));

    expect(screen.getByTestId('ronkonkoma-route-view')).toBeTruthy();
    expect(screen.getByText('Westbound · toward Penn Station')).toBeTruthy();
    expect(screen.getByText('Stony Brook')).toBeTruthy();
    expect(screen.getByText('St. James')).toBeTruthy();
    expect(screen.getByText('Smithtown')).toBeTruthy();
    expect(screen.getByText('Kings Park')).toBeTruthy();
    expect(screen.getByText('Northport')).toBeTruthy();
    expect(screen.getByText('10:34 AM')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('11:00 AM departure'));
    expect(screen.getByText('11:34 AM')).toBeTruthy();

    fireEvent.press(screen.getByTestId('route-back'));
    expect(screen.getByText('Nearby transit')).toBeTruthy();
  });

  it('keeps search results informational', async () => {
    const fetchMock = createHealthyFetchMock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const screen = render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('search-trigger'));
    expect(screen.getByTestId('search-result-recent-penn-station').props.onPress).toBeUndefined();
    expect(screen.getByTestId('search-view')).toBeTruthy();
  });
});
