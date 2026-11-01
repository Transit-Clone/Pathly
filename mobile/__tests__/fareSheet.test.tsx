import { render, screen } from '@testing-library/react-native';

import { FareSheet } from '../src/components/FareSheet';
import type { TripFare } from '../src/data/tripPlanning';
import { AppSettingsProvider } from '../src/theme/AppSettings';

const fare: TripFare = {
  text: '$15.25',
  cents: 1525,
  currency: 'USD',
  estimated: true,
  lines: [
    { label: 'LIRR, Babylon to Penn Station', text: '$12.25', note: 'Zone 9 to zone 1, off-peak' },
    { label: 'MTA 7 train', text: '$3.00', note: 'Includes one free transfer within 2 hours' },
  ],
  reduced: { text: '$7.50', cents: 750, lines: [{ label: 'LIRR, Babylon to Penn Station', text: '$7.50' }] },
};

const show = (props: Partial<Parameters<typeof FareSheet>[0]> = {}) => render(
  <AppSettingsProvider><FareSheet fare={fare} fareType="full" onClose={jest.fn()} {...props} /></AppSettingsProvider>,
);

describe('FareSheet', () => {
  it('lists each part of the fare with its reason and the total', () => {
    show();
    expect(screen.getByText('LIRR, Babylon to Penn Station')).toBeTruthy();
    expect(screen.getByText('Zone 9 to zone 1, off-peak')).toBeTruthy();
    expect(screen.getByText('$3.00')).toBeTruthy();
    expect(screen.getByTestId('fare-sheet-total')).toHaveTextContent('$15.25');
  });

  it('explains the rider\'s reduced fare', () => {
    show({ fareType: 'reduced' });
    expect(screen.getByTestId('fare-sheet-total')).toHaveTextContent('$7.50');
    expect(screen.queryByText('MTA 7 train')).toBeNull();
  });

  it('says so when a reduced fare can\'t be priced', () => {
    const { reduced: _reduced, ...noReduced } = fare;
    show({ fare: noReduced, fareType: 'reduced' });
    expect(screen.getByTestId('fare-sheet-total')).toHaveTextContent('$15.25');
    expect(screen.getByTestId('fare-sheet-no-reduced')).toBeTruthy();
  });

  it('credits Google for a total with no parts', () => {
    show({ fare: { text: '$3.00', cents: 300, currency: 'USD', estimated: false } });
    expect(screen.getByText(/comes from Google/)).toBeTruthy();
    expect(screen.queryByTestId('fare-line-0')).toBeNull();
  });
});
