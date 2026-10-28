import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import * as Location from 'expo-location';
import type { ReactNode } from 'react';
import { Linking, Share, StyleSheet } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import { AuthProvider } from '../src/auth/AuthContext';
import { ProfileView } from '../src/components/ProfileView';
import { ISSUES_URL } from '../src/components/SettingsPages';
import type { Itinerary } from '../src/data/tripPlanning';
import { filterItinerariesByWalk } from '../src/data/tripPlanning';
import { resetLineIndexForTests } from '../src/data/lineIndex';
import { recordSearch, saveLocation } from '../src/data/userData';
import { DEFAULT_PREFERENCES, parsePreferences, preferencesKey, UserPreferencesProvider } from '../src/data/userPreferences';
import { AppSettingsProvider, DISPLAY_SETTINGS_KEY, scaleTypography, useAppSettings } from '../src/theme/AppSettings';
import { highContrastDarkColors, highContrastLightColors, lightColors } from '../src/theme/colors';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

const UID = 'test-uid';
const place = { id: 'places/sbu', title: 'Stony Brook University', subtitle: '100 Nicolls Rd, Stony Brook, NY', location: { latitude: 40.91, longitude: -73.12 } };

function Providers({ children }: { children: ReactNode }) {
  return (
    <AppSettingsProvider>
      <AuthProvider>
        <UserPreferencesProvider>{children}</UserPreferencesProvider>
      </AuthProvider>
    </AppSettingsProvider>
  );
}

function renderSettings(initialRoute?: 'places') {
  return render(<Providers><ProfileView initialRoute={initialRoute} onBack={jest.fn()} /></Providers>);
}

async function openPage(screen: ReturnType<typeof render>, id: string) {
  fireEvent.press(screen.getByTestId(`settings-row-${id}`));
  await act(async () => undefined);
}

describe('Settings', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Account details', () => {
    it('renames the rider in Firebase Auth and the profile doc', async () => {
      const screen = renderSettings();
      await openPage(screen, 'account');
      fireEvent.press(screen.getByTestId('account-display-name'));
      fireEvent.changeText(screen.getByTestId('account-name-input'), '  Sam Rider ');
      await act(async () => {
        fireEvent.press(screen.getByTestId('account-name-save'));
      });

      expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ uid: UID }), { displayName: 'Sam Rider' });
      expect(screen.getByText('Display name changed to Sam Rider')).toBeTruthy();
      expect(screen.getByTestId('account-display-name')).toHaveTextContent(/Sam Rider/);
      expect((await getDoc(doc({} as never, 'users', UID))).data()).toMatchObject({ displayName: 'Sam Rider' });
      fireEvent.press(screen.getByTestId('settings-back'));
      expect(screen.getByText('Sam Rider')).toBeTruthy();
    });

    it('emails a password reset link and has no placeholder rows', async () => {
      const screen = renderSettings();
      await openPage(screen, 'account');
      await act(async () => {
        fireEvent.press(screen.getByTestId('account-password'));
      });
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'rider@example.com');
      expect(screen.getByText('Reset link sent to rider@example.com')).toBeTruthy();
      expect(screen.queryByText(/Phone number|Two-step|Membership|coming soon/)).toBeNull();
    });
  });

  describe('Notifications', () => {
    it('saves toggles per rider and says alerts are not sent yet', async () => {
      const screen = renderSettings();
      await openPage(screen, 'notifications');
      expect(screen.getByTestId('notifications-not-sent')).toHaveTextContent(/push notifications in the Android and iOS app/);
      fireEvent(screen.getByTestId('toggle-service-alerts'), 'valueChange', false);
      await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(preferencesKey(UID)))!).notifications.serviceAlerts).toBe(false));
      screen.unmount();

      const again = renderSettings();
      await openPage(again, 'notifications');
      await waitFor(() => expect(again.getByTestId('toggle-service-alerts').props.value).toBe(false));
      // Turning notifications off hides the individual kinds.
      fireEvent(again.getByTestId('toggle-notifications'), 'valueChange', false);
      expect(again.queryByTestId('toggle-service-alerts')).toBeNull();
    });

    it('searches for a line in a popup and adds it with alerts on, unstarred', async () => {
      resetLineIndexForTests([
        { agencyId: 'suffolk', agencyDisplayName: 'Suffolk County Transit', routeId: '51', shortName: '51', routeName: 'Patchogue RR to Port Jefferson', color: '#C43D4B' },
        { agencyId: 'lirr', agencyDisplayName: 'LIRR', routeId: '10', shortName: 'Port Jefferson Branch', routeName: 'Port Jefferson Branch', color: '#006EC7' },
      ]);
      const screen = renderSettings();
      await openPage(screen, 'notifications');
      fireEvent.press(screen.getByTestId('notifications-add-line'));
      fireEvent.changeText(screen.getByTestId('notifications-add-line-input'), 'port jeff');
      // The branch by its name; not the 51 bus, whose name only says it runs there.
      expect(screen.queryByTestId('notifications-add-line-suffolk-51')).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByTestId('notifications-add-line-lirr-10'));
      });
      const saved = (await getDocs(collection({} as never, 'users', UID, 'savedRoutes'))).docs.map((entry) => entry.data());
      expect(saved).toContainEqual(expect.objectContaining({ routeId: '10', agencyId: 'lirr', alerts: 'all', favorite: false }));
      expect(screen.getByText('PJ alerts: All times')).toBeTruthy();
      resetLineIndexForTests();
    });
  });

  describe('Accessibility', () => {
    it('scales every themed font size and saves the text size on the device', async () => {
      const screen = renderSettings();
      await openPage(screen, 'accessibility');
      const before = StyleSheet.flatten(screen.getByText('Text size').props.style).fontSize as number;
      fireEvent.press(screen.getByTestId('text-size-large'));
      const after = StyleSheet.flatten(screen.getByText('Text size').props.style).fontSize as number;
      expect(after).toBeGreaterThan(before);
      await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(DISPLAY_SETTINGS_KEY))!)).toMatchObject({ textSize: 'large' }));
      screen.unmount();

      const again = renderSettings();
      await openPage(again, 'accessibility');
      expect(again.getByTestId('text-size-large').props.accessibilityState).toEqual({ selected: true });
      expect(StyleSheet.flatten(again.getByText('Text size').props.style).fontSize).toBe(after);
    });

    it('swaps to the high-contrast palette and persists it with reduced motion', async () => {
      const { result } = renderHook(() => useAppSettings(), { wrapper: ({ children }) => <AppSettingsProvider>{children}</AppSettingsProvider> });
      await act(async () => undefined);
      act(() => result.current.setHighContrast(true));
      expect(result.current.colors).toBe(highContrastLightColors);
      act(() => result.current.setAppearance('dark'));
      expect(result.current.colors).toBe(highContrastDarkColors);
      act(() => result.current.setReducedMotion(true));
      await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(DISPLAY_SETTINGS_KEY))!)).toEqual({ appearance: 'dark', reducedMotion: true, textSize: 'default', highContrast: true, mapDotColor: 'default' }));

      const reloaded = renderHook(() => useAppSettings(), { wrapper: ({ children }) => <AppSettingsProvider>{children}</AppSettingsProvider> });
      await waitFor(() => expect(reloaded.result.current.colors).toBe(highContrastDarkColors));
      expect(reloaded.result.current.reducedMotion).toBe(true);
    });

    it('keeps text styles unchanged at the default size and ignores bad saved entries', async () => {
      const styles = { a: { fontSize: 14, lineHeight: 20 }, b: { width: 3 } };
      expect(scaleTypography(styles, 1)).toBe(styles);
      expect(scaleTypography(styles, 0.9)).toEqual({ a: { fontSize: 12.5, lineHeight: 18 }, b: styles.b });
      await AsyncStorage.setItem(DISPLAY_SETTINGS_KEY, '{"textSize":"huge","highContrast":"yes"}');
      const { result } = renderHook(() => useAppSettings(), { wrapper: ({ children }) => <AppSettingsProvider>{children}</AppSettingsProvider> });
      await act(async () => undefined);
      expect(result.current.textSize).toBe('default');
      expect(result.current.colors).toBe(lightColors);
    });

    it('saves the step-free preference and explains that trips are not filtered', async () => {
      const screen = renderSettings();
      await openPage(screen, 'accessibility');
      fireEvent(screen.getByTestId('toggle-step-free'), 'valueChange', true);
      expect(screen.getByTestId('step-free-note')).toHaveTextContent(/aren't filtered/);
      await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(preferencesKey(UID)))!).stepFree).toBe(true));
    });
  });

  describe('Travel preferences', () => {
    it('picks a maximum walking time and keeps at least one mode', async () => {
      const screen = renderSettings();
      await openPage(screen, 'travel');
      expect(screen.getByTestId('walking-limit')).toHaveTextContent(/No limit/);
      fireEvent.press(screen.getByTestId('walking-limit'));
      fireEvent.press(screen.getByTestId('walking-limit-10'));
      expect(screen.queryByTestId('walking-limit-picker')).toBeNull();
      expect(screen.getByTestId('walking-limit')).toHaveTextContent(/10 min/);

      for (const mode of ['subway', 'bus', 'rail']) fireEvent.press(screen.getByTestId(`travel-mode-${mode}`));
      fireEvent.press(screen.getByTestId('travel-mode-ferry'));
      expect(screen.getByText('Keep at least one mode')).toBeTruthy();
      expect(screen.getByTestId('travel-mode-ferry').props.accessibilityState).toEqual({ checked: true });
      await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(preferencesKey(UID)))!).travel).toEqual({ ...DEFAULT_PREFERENCES.travel, modes: ['ferry'], maxWalkMinutes: 10 }));
    });

    it('hides trips over the walking limit unless none fit', () => {
      const trip = (id: string, walkSeconds: number) => ({ id, steps: [{ kind: 'walk', durationSeconds: walkSeconds, distanceMeters: 0, toName: '', path: [] }] }) as unknown as Itinerary;
      const trips = [trip('short', 300), trip('long', 1500)];
      expect(filterItinerariesByWalk(trips, null)).toBeNull();
      expect(filterItinerariesByWalk(trips, 10)?.map((item) => item.id)).toEqual(['short']);
      expect(filterItinerariesByWalk(trips, 2)).toBeNull();
    });

    it('reads only well-formed saved preferences', () => {
      expect(parsePreferences('not json')).toEqual(DEFAULT_PREFERENCES);
      expect(parsePreferences(JSON.stringify({ travel: { modes: ['rail', 'boat'], maxWalkMinutes: 7, allowWalking: false } }))).toEqual({
        ...DEFAULT_PREFERENCES,
        travel: { ...DEFAULT_PREFERENCES.travel, modes: ['rail'], allowWalking: false },
      });
    });
  });

  describe('Privacy', () => {
    it('shows the real location permission and asks for it when it has not been asked', async () => {
      (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true }).mockResolvedValueOnce({ status: 'granted', canAskAgain: true });
      const screen = renderSettings();
      await openPage(screen, 'privacy');
      expect(screen.getByTestId('privacy-location')).toHaveTextContent(/Not asked yet/);
      await act(async () => {
        fireEvent.press(screen.getByTestId('privacy-location'));
      });
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
      expect(screen.getByTestId('privacy-location')).toHaveTextContent(/Allowed/);
    });

    it('opens device settings once location was denied', async () => {
      const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
      const screen = renderSettings();
      await openPage(screen, 'privacy');
      await act(async () => {
        fireEvent.press(screen.getByTestId('privacy-location'));
      });
      expect(openSettings).toHaveBeenCalled();
    });

    it('saves the analytics choice', async () => {
      const screen = renderSettings();
      await openPage(screen, 'privacy');
      fireEvent(screen.getByTestId('toggle-analytics'), 'valueChange', true);
      await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(preferencesKey(UID)))!).analytics).toBe(true));
    });

    it("exports the rider's searches, recent destinations, and saved places as JSON", async () => {
      await recordSearch(UID, place);
      await saveLocation(UID, place, 'Destination');
      const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
      const screen = renderSettings();
      await openPage(screen, 'privacy');
      await act(async () => {
        fireEvent.press(screen.getByTestId('privacy-download'));
      });

      const data = JSON.parse(share.mock.calls[0]![0].message!);
      expect(data.account).toEqual({ uid: UID, email: 'rider@example.com', displayName: 'Pathly Rider' });
      expect(data.searches).toEqual([expect.objectContaining({ id: encodeURIComponent(place.id), address: expect.objectContaining({ name: place.title }) })]);
      expect(data.savedLocations).toHaveLength(1);
      expect(data.prevDests).toEqual([]);
      expect(screen.getByText('Your data is ready to save or share')).toBeTruthy();
    });

    it('re-authenticates, then deletes Firestore data and the Auth user after confirming', async () => {
      await recordSearch(UID, place);
      await saveLocation(UID, place, 'Destination');
      await AsyncStorage.setItem(preferencesKey(UID), JSON.stringify({ analytics: true }));
      const screen = renderSettings();
      await openPage(screen, 'privacy');
      fireEvent.press(screen.getByTestId('privacy-delete'));
      expect(screen.getByTestId('delete-account-submit').props.accessibilityState).toMatchObject({ disabled: true });
      fireEvent.changeText(screen.getByTestId('delete-account-password'), 'hunter22');
      fireEvent.press(screen.getByTestId('delete-account-submit'));
      expect(deleteUser).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.press(screen.getByTestId('delete-account-dialog-confirm'));
      });

      expect(EmailAuthProvider.credential).toHaveBeenCalledWith('rider@example.com', 'hunter22');
      expect(reauthenticateWithCredential).toHaveBeenCalled();
      expect(deleteUser).toHaveBeenCalledWith(expect.objectContaining({ uid: UID }));
      expect((await getDocs(collection({} as never, 'users', UID, 'searches'))).docs).toEqual([]);
      expect((await getDocs(collection({} as never, 'users', UID, 'savedLocations'))).docs).toEqual([]);
      expect((await getDoc(doc({} as never, 'users', UID))).exists()).toBe(false);
      expect(await AsyncStorage.getItem(preferencesKey(UID))).toBeNull();
    });

    it('keeps everything when the password is wrong or the dialog is cancelled', async () => {
      await saveLocation(UID, place, 'Destination');
      (reauthenticateWithCredential as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('bad'), { code: 'auth/invalid-credential' }));
      const screen = renderSettings();
      await openPage(screen, 'privacy');
      fireEvent.press(screen.getByTestId('privacy-delete'));
      fireEvent.changeText(screen.getByTestId('delete-account-password'), 'nope');
      fireEvent.press(screen.getByTestId('delete-account-submit'));
      fireEvent.press(screen.getByTestId('delete-account-dialog-cancel'));
      expect(reauthenticateWithCredential).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('delete-account-submit'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('delete-account-dialog-confirm'));
      });
      expect(screen.getByTestId('delete-account-error')).toHaveTextContent('That password is incorrect.');
      expect(deleteUser).not.toHaveBeenCalled();
      expect((await getDocs(collection({} as never, 'users', UID, 'savedLocations'))).docs).toHaveLength(1);
    });
  });

  describe('Help & About', () => {
    it('shows the FAQ, privacy, and terms, and opens support', async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      const screen = renderSettings();
      await openPage(screen, 'help');
      fireEvent.press(screen.getByTestId('help-faq'));
      expect(screen.getByText('Where does Pathly work?')).toBeTruthy();
      fireEvent.press(screen.getByTestId('help-privacy'));
      expect(screen.queryByTestId('help-faq-content')).toBeNull();
      expect(screen.getByTestId('help-privacy-content')).toHaveTextContent(/Cloud Firestore/);
      fireEvent.press(screen.getByTestId('help-terms'));
      expect(screen.getByTestId('help-terms-content')).toHaveTextContent(/provided as is/);
      await act(async () => {
        fireEvent.press(screen.getByTestId('help-contact'));
      });
      expect(openURL).toHaveBeenCalledWith(ISSUES_URL);
    });

    it('credits OpenStreetMap for walking distances and links to its copyright page', async () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      const screen = renderSettings();
      await openPage(screen, 'help');
      expect(screen.getByText('Map data © OpenStreetMap')).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByTestId('help-osm'));
      });
      expect(openURL).toHaveBeenCalledWith('https://www.openstreetmap.org/copyright');
    });
  });
});
