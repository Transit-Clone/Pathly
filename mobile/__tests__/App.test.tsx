import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import App from '../App';
import { routeById, routes } from '../src/data/transit';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('@expo-google-fonts/nunito/useFonts', () => ({
  useFonts: () => [true],
}));

describe('Pathly prototype navigation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('renders five selectable routes without contacting a backend', () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const screen = render(<App />);

    expect(screen.getByText('Where to?')).toBeTruthy();
    expect(screen.queryByText('Nearby transit')).toBeNull();
    for (const route of routes) {
      expect(screen.getByTestId(`route-card-${route.id}`)).toBeTruthy();
    }
    expect(screen.getAllByText('minutes')).toHaveLength(10);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the two-arc live signal only on live predictions', () => {
    const screen = render(<App />);

    expect(screen.getAllByTestId('live-gps-signal', { includeHiddenElements: true })).toHaveLength(5);
    expect(within(screen.getByTestId('route-card-ronkonkoma-primary')).getByTestId('live-gps-signal', { includeHiddenElements: true })).toBeTruthy();
    expect(within(screen.getByTestId('route-card-ronkonkoma-alternate')).queryByTestId('live-gps-signal', { includeHiddenElements: true })).toBeNull();
  });

  it.each(routes.map((route) => [route.id, route.routeName, route.color] as const))(
    'opens shared details for %s and returns home',
    (routeId, routeName, color) => {
      const screen = render(<App />);
      fireEvent.press(screen.getByTestId(`route-card-${routeId}-primary`));

      expect(screen.getByTestId(`route-detail-${routeId}`)).toBeTruthy();
      expect(screen.getAllByText(routeName).length).toBeGreaterThan(0);
      expect(StyleSheet.flatten(screen.getByTestId('route-detail-badge').props.style)).toEqual(
        expect.objectContaining({ backgroundColor: color }),
      );
      fireEvent.press(screen.getByTestId('route-back'));
      expect(screen.getByTestId(`route-card-${routeId}`)).toBeTruthy();
    },
  );

  it('moves the sheet through compact, expanded, and minimized states', () => {
    jest.useFakeTimers();
    const screen = render(<App />);
    const handle = screen.getByTestId('transit-sheet-handle');

    expect(handle.props.accessibilityValue).toEqual({ text: 'compact' });
    expect(screen.getByLabelText('Center on current location')).toBeTruthy();

    act(() => {
      fireEvent.press(handle);
      jest.runAllTimers();
    });
    expect(screen.getByTestId('transit-sheet-handle').props.accessibilityValue).toEqual({ text: 'expanded' });
    expect(screen.queryByLabelText('Center on current location')).toBeNull();

    act(() => {
      fireEvent.press(screen.getByTestId('transit-sheet-handle'));
      jest.runAllTimers();
    });
    expect(screen.getByTestId('transit-sheet-handle').props.accessibilityValue).toEqual({ text: 'minimized' });
    expect(screen.getByLabelText('Center on current location')).toBeTruthy();
  });

  it('opens route results from search and preserves editable criteria across controls', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('search-trigger'));
    fireEvent.changeText(screen.getByTestId('search-input'), '123 Terry Rd');
    fireEvent.press(screen.getByTestId('search-result-terry-road-smithtown'));

    expect(screen.getByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByDisplayValue('123 Terry Rd')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('origin-input'), 'Stony Brook University');
    fireEvent.changeText(screen.getByTestId('destination-input'), 'Times Square');
    fireEvent.press(screen.getByTestId('preference-cheapest'));
    fireEvent.press(screen.getByTestId('leave-time-control'));
    fireEvent.press(screen.getByTestId('refresh-results'));

    expect(screen.getByDisplayValue('Stony Brook University')).toBeTruthy();
    expect(screen.getByDisplayValue('Times Square')).toBeTruthy();
    expect(screen.getByText('Leave at 10:30')).toBeTruthy();
    expect(screen.getByText('Updated now · 1')).toBeTruthy();
    expect(screen.getByTestId('preference-cheapest').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getAllByTestId(/^itinerary-/)).toHaveLength(4);

    fireEvent.press(screen.getByTestId('results-back'));
    expect(screen.getByTestId('search-view')).toBeTruthy();
  });

  it('opens route results from recent trips', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('tab-recents'));
    expect(screen.getByText('Penn Station')).toBeTruthy();
    expect(screen.getByText('Times Square')).toBeTruthy();
    expect(screen.getByText('Patchogue Station')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recent-trip-penn-station'));
    expect(screen.getByTestId('route-results-view')).toBeTruthy();
    expect(screen.getByDisplayValue('Penn Station')).toBeTruthy();
  });

  it('opens profile settings and keeps sign out local', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('profile-trigger'));

    expect(screen.getByTestId('profile-view')).toBeTruthy();
    expect(screen.getByText('Account details')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sign-out'));
    expect(screen.getByText(/Firebase Authentication is added/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('profile-back'));
    expect(screen.getByTestId('profile-trigger')).toBeTruthy();
  });

  it('keeps route stop timing and live provenance accessible', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('route-card-ronkonkoma-primary'));

    expect(screen.getByLabelText('4 minutes, live GPS prediction')).toBeTruthy();
    expect(screen.getByLabelText('18 minutes, scheduled time')).toBeTruthy();
    expect(screen.getByLabelText('Stony Brook, departs 10:04 AM')).toBeTruthy();
    expect(screen.getByLabelText('Northport, arrives 10:34 AM')).toBeTruthy();
    expect(routeById.ronkonkoma.stops).toHaveLength(5);
  });
});
