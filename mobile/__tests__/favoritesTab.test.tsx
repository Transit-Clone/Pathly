import { render } from '@testing-library/react-native';
import { Animated } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import { TransitSheet } from '../src/components/TransitSheet';
import { routeById } from '../src/data/transit';
import type { SavedLocation } from '../src/data/userData';
import { AppSettingsProvider } from '../src/theme/AppSettings';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('../src/data/TransitLiveContext', () => ({ useTransitLiveMap: () => new Map() }));

const gym: SavedLocation = {
  id: 'gym',
  dateSaved: null,
  address: { name: 'Gym', streetAddress: '1 Main St, Queens, NY', coordinates: [40.7, -73.9], type: 'other' as SavedLocation['address']['type'], placeId: 'gym' },
};

const renderFavorites = (savedRouteIds: string[], savedLocations: SavedLocation[]) => render(
  <AppSettingsProvider>
    <TransitSheet
      activeTab="favorites"
      findRoute={(id) => (id === 's1' ? routeById.s1 : undefined)}
      mapHeight={400}
      nearbyRoutes={[]}
      nearbyStatus="loaded"
      onAddSavedPlace={jest.fn()}
      onOpenRoute={jest.fn()}
      onOpenSavedLocation={jest.fn()}
      onTabChange={jest.fn()}
      savedLocations={savedLocations}
      savedRouteIds={savedRouteIds}
      scrollY={new Animated.Value(0)}
    />
  </AppSettingsProvider>,
);

describe('Favorites tab', () => {
  it('leaves the empty state to the message, with no add button', () => {
    const screen = renderFavorites([], []);
    expect(screen.getByText('No favorites yet')).toBeTruthy();
    expect(screen.queryByLabelText('Add a favorite')).toBeNull();
  });

  it('labels the sections when both kinds are saved', () => {
    const screen = renderFavorites(['s1'], [gym]);
    expect(screen.getByText('ROUTES')).toBeTruthy();
    expect(screen.getByText('PLACES')).toBeTruthy();
  });

  it('drops the labels when only one kind is saved', () => {
    const routesOnly = renderFavorites(['s1'], []);
    expect(routesOnly.queryByText('ROUTES')).toBeNull();
    expect(routesOnly.queryByText('PLACES')).toBeNull();
    const placesOnly = renderFavorites([], [gym]);
    expect(placesOnly.queryByText('ROUTES')).toBeNull();
    expect(placesOnly.queryByText('PLACES')).toBeNull();
  });
});
