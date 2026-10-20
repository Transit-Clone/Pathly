import { fireEvent, render } from '@testing-library/react-native';

import { subwayExpressLine } from '../src/components/RouteBadge';
import { SavePlaceSheet } from '../src/components/SavePlaceSheet';
import { savedLocationIcon, savedPlaceLines } from '../src/components/SavedPlacesStrip';
import { addressAfterName } from '../src/data/placesSearch';
import { findLabeledLocation, placeToLocation, sortSavedLocations, type SavedLocation } from '../src/data/userData';
import { AppSettingsProvider } from '../src/theme/AppSettings';

const place = (id: string, title: string, subtitle: string) => ({ id, title, subtitle, location: { latitude: 40.7, longitude: -73.9 } });
const saved = (id: string, title: string, subtitle: string, extra: { label?: string; icon?: 'heart' } = {}): SavedLocation => ({
  id,
  address: { ...placeToLocation(place(id, title, subtitle), 'Destination'), ...extra },
  dateSaved: null,
});

describe('search result second lines', () => {
  it('completes a street address instead of repeating it, and drops the country', () => {
    expect(addressAfterName('123 William Street', 'New York, NY, USA')).toBe('New York, NY');
    expect(addressAfterName('123 William St', '123 William Street, New York, NY 10038, USA')).toBe('New York, NY 10038');
  });

  it("gives a named place's whole address", () => {
    expect(addressAfterName('Stony Brook University', '100 Nicolls Rd, Stony Brook, NY 11794, USA')).toBe('100 Nicolls Rd, Stony Brook, NY 11794');
    expect(addressAfterName('Somewhere', '')).toBe('');
  });
});

describe('subway express badges', () => {
  it('reads the MTA express variants as their line', () => {
    expect(subwayExpressLine('FX')).toBe('F');
    expect(subwayExpressLine('6X')).toBe('6');
    expect(subwayExpressLine('F')).toBeNull();
    expect(subwayExpressLine('SIR')).toBeNull();
  });
});

describe('saved places', () => {
  const gym = saved('gym', 'Blink Fitness', '1 Main St, Brooklyn, NY, USA', { label: 'Gym', icon: 'heart' });
  const home = saved('home', '12 Elm St', '12 Elm St, Queens, NY 11375, USA', { label: 'Home' });
  const plain = saved('cafe', 'Joe Coffee', '9 Bleecker St, New York, NY, USA');

  it('shows the saved name on top and the place underneath', () => {
    expect(savedPlaceLines(home)).toEqual({ title: 'Home', subtitle: '12 Elm St' });
    expect(savedPlaceLines(plain)).toEqual({ title: 'Joe Coffee', subtitle: '9 Bleecker St, New York, NY' });
  });

  it('lists Home first, and prefers a picked icon over one from the name', () => {
    expect(sortSavedLocations([gym, plain, home]).map((entry) => entry.id)).toEqual(['home', 'gym', 'cafe']);
    expect(findLabeledLocation([gym, home], 'home')?.id).toBe('home');
    expect(savedLocationIcon(home.address)).toBe('home');
    expect(savedLocationIcon(gym.address)).toBe('heart');
  });

  it('names a place with Home and saves a picked icon', () => {
    const onSave = jest.fn();
    const screen = render(
      <AppSettingsProvider>
        <SavePlaceSheet onCancel={jest.fn()} onSave={onSave} request={{ place: place('p', 'Blink Fitness', '1 Main St') }} />
      </AppSettingsProvider>,
    );
    expect(screen.getByTestId('save-place-name').props.value).toBe('Blink Fitness');
    fireEvent.press(screen.getByTestId('save-place-home'));
    expect(screen.getByTestId('save-place-icon-home').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId('save-place-icon-fitness'));
    fireEvent.press(screen.getByTestId('save-place-confirm'));
    expect(onSave).toHaveBeenCalledWith('Home', 'fitness');
  });
});
