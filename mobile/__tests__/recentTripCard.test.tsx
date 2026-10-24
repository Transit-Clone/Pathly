import { fireEvent, render } from '@testing-library/react-native';

import { RecentTripCard } from '../src/components/RecentTripCard';
import { AppSettingsProvider } from '../src/theme/AppSettings';

describe('RecentTripCard', () => {
  it('shows where and when, without an outcome or line labels, and opens as a fresh-plan action', () => {
    const onOpen = jest.fn();
    const screen = render(
      <AppSettingsProvider initialReducedMotion={true}>
        <RecentTripCard destination="Penn Station" endedAt={Date.UTC(2026, 9, 15, 14, 30)} onOpen={onOpen} origin="Stony Brook" testID="recent" />
      </AppSettingsProvider>,
    );
    const card = screen.getByTestId('recent');

    expect(screen.getByText('Penn Station')).toBeTruthy();
    expect(screen.getByText('From Stony Brook')).toBeTruthy();
    expect(screen.queryByText('Ended early')).toBeNull();
    expect(screen.queryByText('Arrived')).toBeNull();
    expect(card.props.accessibilityHint).toBe('Plans this trip again with current routes');

    fireEvent.press(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
