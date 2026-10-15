import { fireEvent, render } from '@testing-library/react-native';

import { RecentTripCard } from '../src/components/RecentTripCard';
import { AppSettingsProvider } from '../src/theme/AppSettings';

function renderCard(outcome: 'arrived' | 'ended-early', onOpen = jest.fn()) {
  return {
    onOpen,
    screen: render(
      <AppSettingsProvider initialReducedMotion={true}>
        <RecentTripCard
          destination="Penn Station"
          endedAt={Date.UTC(2026, 9, 15, 14, 30)}
          lines={['PJ', 'E']}
          onOpen={onOpen}
          origin="Stony Brook"
          outcome={outcome}
          testID={`recent-${outcome}`}
        />
      </AppSettingsProvider>,
    ),
  };
}

describe('RecentTripCard', () => {
  it.each([
    ['arrived', 'Arrived'],
    ['ended-early', 'Ended early'],
  ] as const)('labels and opens an %s trip as a fresh-plan action', (outcome, label) => {
    const { onOpen, screen } = renderCard(outcome);
    const card = screen.getByTestId(`recent-${outcome}`);

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText('PJ · E')).toBeTruthy();
    expect(card.props.accessibilityHint).toBe('Plans this trip again with current routes');

    fireEvent.press(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
