import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import {
  deleteAccount,
  deleteAccountProblem,
  exportUserData,
  MAX_DISPLAY_NAME,
  sendPasswordReset,
  shareUserData,
  updateDisplayName,
} from '../data/accountData';
import { ALL_TRANSIT_MODES, useUserPreferences, WALK_LIMIT_OPTIONS } from '../data/userPreferences';
import { useAppSettings, useTheme, useThemedStyles, type TextSize } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { ConfirmDialog } from './ConfirmDialog';
import { Card, ChoiceRow, createStyles as createProfileStyles, SettingRow, ToggleRow } from './ProfileView';
import { PressableScale } from './PressableScale';
import type { TransitMode } from './RouteBadge';

/** Settings pages behind Profile & Settings; each reports what it did through `onFeedback`. */
type PageProps = { onFeedback: (message: string) => void };

/** Where Help -> Contact support goes: EXPO_PUBLIC_SUPPORT_EMAIL when set, else the project's issues. */
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '';
export const ISSUES_URL = 'https://github.com/Transit-Clone/Pathly/issues';

function useStyles() {
  return { profile: useThemedStyles(createProfileStyles), page: useThemedStyles(createStyles) };
}

// ---------------------------------------------------------------------------------------------
// Account details

export function AccountSettings({ onFeedback }: PageProps) {
  const { refreshUser, user } = useAuth();
  const { colors } = useTheme();
  const { page, profile } = useStyles();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  const startEditing = () => {
    setName(user?.displayName ?? '');
    setEditingName(true);
  };
  const saveName = async () => {
    if (!user || saving) return;
    if (!name.trim()) {
      onFeedback('Enter a name to save');
      return;
    }
    setSaving(true);
    try {
      const saved = await updateDisplayName(user, name);
      refreshUser();
      setEditingName(false);
      onFeedback(`Display name changed to ${saved}`);
    } catch {
      onFeedback('Your name could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };
  const resetPassword = async () => {
    if (!user?.email) {
      onFeedback('This account has no email address to send a reset link to');
      return;
    }
    try {
      await sendPasswordReset(user.email);
      setResetSentTo(user.email);
      onFeedback(`Password reset link sent to ${user.email}`);
    } catch {
      onFeedback('The reset link could not be sent. Try again in a moment.');
    }
  };

  return (
    <>
      <Text style={profile.intro}>Your name and sign-in details for Pathly.</Text>
      <Card>
        {editingName ? (
          <View style={page.editBlock}>
            <Text style={profile.settingText}>Display name</Text>
            <TextInput
              accessibilityLabel="Display name"
              autoCapitalize="words"
              autoFocus={true}
              maxLength={MAX_DISPLAY_NAME}
              onChangeText={setName}
              onSubmitEditing={() => void saveName()}
              placeholder="Your name"
              placeholderTextColor={colors.mutedInk}
              returnKeyType="done"
              style={page.input}
              testID="account-name-input"
              value={name}
            />
            <View style={page.buttonRow}>
              <PressableScale accessibilityRole="button" onPress={() => setEditingName(false)} style={[page.button, page.secondaryButton]} testID="account-name-cancel"><Text style={page.secondaryButtonText}>Cancel</Text></PressableScale>
              <PressableScale accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void saveName()} style={[page.button, page.primaryButton]} testID="account-name-save"><Text style={page.primaryButtonText}>{saving ? 'Saving…' : 'Save'}</Text></PressableScale>
            </View>
          </View>
        ) : (
          <SettingRow detail={user?.displayName || 'Not set'} label="Display name" onPress={startEditing} testID="account-display-name" />
        )}
        <SettingRow detail={user?.email ?? 'Not signed in'} label="Email" testID="account-email" />
      </Card>
      <Text style={profile.sectionLabel}>SECURITY</Text>
      <Card>
        <SettingRow detail={resetSentTo ? `Reset link sent to ${resetSentTo}` : 'Email me a link to choose a new password'} label="Password" onPress={() => void resetPassword()} testID="account-password" />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Notifications

export function NotificationSettings({ onFeedback }: PageProps) {
  const { profile } = useStyles();
  const { preferences, updatePreferences } = useUserPreferences();
  const { notifications } = preferences;
  const set = (key: keyof typeof notifications, value: boolean) => {
    updatePreferences({ notifications: { [key]: value } });
    onFeedback('Notification preferences saved');
  };
  return (
    <>
      <Text style={profile.intro}>Choose which travel updates Pathly should send you.</Text>
      <Card>
        <ToggleRow label="Allow notifications" onChange={(value) => set('enabled', value)} testID="toggle-notifications" value={notifications.enabled} />
        {notifications.enabled ? (
          <>
            <ToggleRow detail="Changes and delays on saved routes" label="Service alerts" onChange={(value) => set('serviceAlerts', value)} testID="toggle-service-alerts" value={notifications.serviceAlerts} />
            <ToggleRow detail="Leave-time and transfer reminders" label="Trip reminders" onChange={(value) => set('tripReminders', value)} testID="toggle-trip-reminders" value={notifications.tripReminders} />
            <ToggleRow detail="Major incidents near your trip" label="Disruption updates" onChange={(value) => set('disruptions', value)} testID="toggle-disruptions" value={notifications.disruptions} />
          </>
        ) : null}
      </Card>
      <Text style={profile.note} testID="notifications-not-sent">Pathly doesn&apos;t send push alerts yet. Your choices are saved to this device and will apply when alerts arrive.</Text>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Accessibility

const textSizeOptions: readonly { label: string; value: TextSize }[] = [
  { label: 'Compact', value: 'compact' },
  { label: 'Default', value: 'default' },
  { label: 'Large', value: 'large' },
];

export function AccessibilitySettings({ onFeedback }: PageProps) {
  const { profile } = useStyles();
  const { highContrast, reducedMotion, setHighContrast, setReducedMotion, setTextSize, textSize } = useAppSettings();
  const { preferences, updatePreferences } = useUserPreferences();
  return (
    <>
      <Text style={profile.intro}>Adjust how Pathly presents text, color, motion, and routes.</Text>
      <Card>
        <ChoiceRow
          label="Text size"
          onSelect={(label) => {
            const option = textSizeOptions.find((item) => item.label === label);
            if (!option) return;
            setTextSize(option.value);
            onFeedback(`Text size set to ${label}`);
          }}
          options={textSizeOptions.map((item) => item.label)}
          selected={textSizeOptions.find((item) => item.value === textSize)?.label ?? 'Default'}
          testPrefix="text-size"
        />
        <ToggleRow detail="Stop pulsing live signals and other animation" label="Reduce motion" onChange={(value) => { setReducedMotion(value); onFeedback(value ? 'Motion reduced' : 'Motion restored'); }} testID="toggle-reduced-motion" value={reducedMotion} />
        <ToggleRow detail="Darker text and stronger borders and colors" label="High contrast" onChange={(value) => { setHighContrast(value); onFeedback(value ? 'High contrast on' : 'High contrast off'); }} testID="toggle-high-contrast" value={highContrast} />
        <ToggleRow detail="Remember that you need accessible stations and vehicles" label="Step-free routes" onChange={(value) => { updatePreferences({ stepFree: value }); onFeedback('Step-free preference saved'); }} testID="toggle-step-free" value={preferences.stepFree} />
      </Card>
      <Text style={profile.note} testID="step-free-note">Google&apos;s transit planner doesn&apos;t report step-free access, so trips aren&apos;t filtered for it yet. Check station accessibility with the agency before you go.</Text>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Travel preferences

const modeLabels: Record<TransitMode, string> = { subway: 'Subway', bus: 'Bus', rail: 'Rail', ferry: 'Ferry' };

export function walkLimitLabel(minutes: number | null) {
  return minutes === null ? 'No limit' : `${minutes} min`;
}

export function TravelSettings({ onFeedback }: PageProps) {
  const { page, profile } = useStyles();
  const { preferences, updatePreferences } = useUserPreferences();
  const { travel } = preferences;
  const [pickingLimit, setPickingLimit] = useState(false);
  const toggleMode = (mode: TransitMode) => {
    const enabled = travel.modes.includes(mode);
    if (enabled && travel.modes.length === 1) {
      onFeedback('Keep at least one mode');
      return;
    }
    const modes = enabled ? travel.modes.filter((item) => item !== mode) : ALL_TRANSIT_MODES.filter((item) => item === mode || travel.modes.includes(item));
    updatePreferences({ travel: { modes } });
    onFeedback('Travel preferences saved');
  };
  return (
    <>
      <Text style={profile.intro}>Defaults for every new trip search. You can still change them on the results screen.</Text>
      <Card>
        <View style={profile.choiceBlock}>
          <Text style={profile.settingText}>Preferred modes</Text>
          <View style={profile.choices}>
            {ALL_TRANSIT_MODES.map((mode) => {
              const selected = travel.modes.includes(mode);
              return (
                <PressableScale accessibilityRole="checkbox" accessibilityState={{ checked: selected }} key={mode} onPress={() => toggleMode(mode)} style={[profile.choice, selected && profile.choiceSelected]} testID={`travel-mode-${mode}`}>
                  <Text style={[profile.choiceText, selected && profile.choiceTextSelected]}>{modeLabels[mode]}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
        <ToggleRow detail="Off asks for trips with less walking" label="Allow walking" onChange={(value) => { updatePreferences({ travel: { allowWalking: value } }); onFeedback('Travel preferences saved'); }} testID="toggle-walking" value={travel.allowWalking} />
        <ToggleRow detail="Start results sorted by fewest transfers" label="Fewer transfers" onChange={(value) => { updatePreferences({ travel: { fewerTransfers: value } }); onFeedback('Travel preferences saved'); }} testID="toggle-fewer-transfers" value={travel.fewerTransfers} />
        <SettingRow detail={walkLimitLabel(travel.maxWalkMinutes)} label="Maximum walking time" onPress={() => setPickingLimit((open) => !open)} testID="walking-limit" />
        {pickingLimit ? (
          <View style={[profile.choices, page.limitChoices]} testID="walking-limit-picker">
            {WALK_LIMIT_OPTIONS.map((minutes) => {
              const selected = travel.maxWalkMinutes === minutes;
              const label = walkLimitLabel(minutes);
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={label}
                  onPress={() => {
                    updatePreferences({ travel: { maxWalkMinutes: minutes } });
                    setPickingLimit(false);
                    onFeedback(`Maximum walking time set to ${label}`);
                  }}
                  style={[profile.choice, selected && profile.choiceSelected]}
                  testID={`walking-limit-${minutes ?? 'none'}`}
                >
                  <Text style={[profile.choiceText, selected && profile.choiceTextSelected]}>{label}</Text>
                </PressableScale>
              );
            })}
          </View>
        ) : null}
      </Card>
      <Text style={profile.note}>Trips that walk longer than your limit are hidden when another trip fits.</Text>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Privacy

type PermissionState = { status: 'granted' | 'denied' | 'undetermined' | 'unknown'; canAskAgain: boolean };

/** The device's real location permission, re-read whenever the app comes back to the foreground. */
function useLocationPermission() {
  const [permission, setPermission] = useState<PermissionState>({ status: 'unknown', canAskAgain: true });
  const read = useCallback(() => Location.getForegroundPermissionsAsync().then(
    (result) => setPermission({ status: result.status as PermissionState['status'], canAskAgain: result.canAskAgain !== false }),
    () => setPermission({ status: 'unknown', canAskAgain: false }),
  ), []);
  useEffect(() => {
    void read();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void read();
    });
    return () => subscription.remove();
  }, [read]);
  return { permission, read };
}

const permissionDetail: Record<PermissionState['status'], string> = {
  granted: 'Allowed · centers maps and plans trips from where you are',
  denied: 'Not allowed · tap to change it in settings',
  undetermined: 'Not asked yet · tap to allow',
  unknown: 'Unavailable on this device',
};

export function PrivacySettings({ onFeedback }: PageProps) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { page, profile } = useStyles();
  const { preferences, updatePreferences } = useUserPreferences();
  const { permission, read } = useLocationPermission();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const changeLocation = async () => {
    if (permission.status === 'undetermined' || (permission.status === 'denied' && permission.canAskAgain && Platform.OS !== 'web')) {
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch {
        // Read back whatever the device decided.
      }
      await read();
      return;
    }
    if (Platform.OS === 'web') {
      onFeedback('Change location access for this site in your browser’s site settings');
      return;
    }
    await Linking.openSettings().catch(() => onFeedback('Open your device settings to change location access'));
  };

  const download = async () => {
    if (!user || exporting) return;
    setExporting(true);
    try {
      const data = await exportUserData(user);
      const how = await shareUserData(data);
      onFeedback(how === 'downloaded' ? 'Your data was downloaded as pathly-data.json' : 'Your data is ready to save or share');
    } catch {
      onFeedback('Your data could not be exported. Check your connection and try again.');
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = async () => {
    setConfirmingDelete(false);
    if (!user) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount(user, password);
      // Deleting the Auth user signs out, which leaves Settings for the sign-in screen.
    } catch (error) {
      const problem = deleteAccountProblem(error);
      setDeleteError(problem === 'wrong-password'
        ? 'That password is incorrect.'
        : problem === 'too-many-attempts'
          ? 'Too many attempts. Try again later.'
          : 'Your account could not be deleted. Check your connection and try again.');
      setDeleting(false);
    }
  };

  return (
    <>
      <Text style={profile.intro}>Control location access and the data Pathly keeps for your account.</Text>
      <Card>
        <SettingRow detail={permissionDetail[permission.status]} label="Location access" onPress={permission.status === 'unknown' ? undefined : () => void changeLocation()} testID="privacy-location" />
        <ToggleRow detail="Pathly doesn't collect usage analytics yet; this saves your choice for when it does" label="Share usage analytics" onChange={(value) => { updatePreferences({ analytics: value }); onFeedback('Analytics preference saved'); }} testID="toggle-analytics" value={preferences.analytics} />
        <SettingRow detail={exporting ? 'Preparing your data…' : 'Searches, recent destinations, and saved places as JSON'} label="Download your data" onPress={() => void download()} testID="privacy-download" />
        <SettingRow detail="Permanently remove your account and its data" label="Delete account" onPress={() => { setDeleteOpen((open) => !open); setDeleteError(''); }} testID="privacy-delete" />
      </Card>
      {deleteOpen ? (
        <View style={page.dangerCard} testID="delete-account-panel">
          <Text style={page.dangerTitle}>Delete your account</Text>
          <Text style={page.dangerBody}>This removes your saved places, searches, recent trips, and sign-in. Enter your password to continue.</Text>
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete="current-password"
            onChangeText={(text) => { setPassword(text); setDeleteError(''); }}
            placeholder="Password"
            placeholderTextColor={colors.mutedInk}
            secureTextEntry={true}
            style={page.input}
            testID="delete-account-password"
            textContentType="password"
            value={password}
          />
          {deleteError ? <Text accessibilityLiveRegion="polite" style={page.error} testID="delete-account-error">{deleteError}</Text> : null}
          <PressableScale accessibilityRole="button" accessibilityState={{ disabled: !password || deleting }} disabled={!password || deleting} onPress={() => setConfirmingDelete(true)} style={[page.dangerButton, (!password || deleting) && page.disabled]} testID="delete-account-submit">
            <Text style={page.dangerButtonText}>{deleting ? 'Deleting…' : 'Delete account'}</Text>
          </PressableScale>
        </View>
      ) : null}
      <ConfirmDialog
        body="Your account, saved places, searches, and recent destinations will be permanently deleted. This can't be undone."
        confirmLabel="Delete"
        destructive={true}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => void confirmDelete()}
        testID="delete-account-dialog"
        title="Delete account?"
        visible={confirmingDelete}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Help & About

type HelpDoc = 'faq' | 'privacy' | 'terms';

const FAQ: readonly { q: string; a: string }[] = [
  { q: 'Where does Pathly work?', a: 'Pathly plans trips and shows live times for transit around New York and Long Island, including the LIRR, MTA subway and buses, NICE and Suffolk County buses, and NYC Ferry.' },
  { q: 'Where do arrival times come from?', a: 'Live times come from each agency’s real-time feed when one is available, marked with a live signal. Otherwise Pathly shows the published timetable.' },
  { q: 'How are trips planned?', a: 'Trips come from Google’s transit planner. Your travel preferences set the modes, sorting, and walking used for each new search.' },
  { q: 'How do I save a place?', a: 'Tap the star on a trip, or go to Settings > Saved places to set Home, Work, and other places.' },
  { q: 'Why can’t Pathly find my location?', a: 'Check Settings > Privacy > Location access. Without it, Pathly centers on Stony Brook and you can search for a starting point.' },
];

const PRIVACY: readonly string[] = [
  'Account: Pathly stores your email address and display name with Firebase Authentication to sign you in.',
  'Trip history: your recent searches, recent destinations, and saved places are stored in your account in Cloud Firestore so they follow you across devices.',
  'Location: your location is used to show nearby transit and to plan trips from where you are. It is sent to Pathly’s servers and Google only for those requests, and it is not stored in your account.',
  'On this device: display settings, travel and notification preferences, a short cache of nearby times, and an in-progress trip are kept on your device.',
  'Your choices: you can download your data or delete your account at any time in Settings > Privacy.',
];

const TERMS: readonly string[] = [
  'Pathly is a prototype trip planner provided as is, without warranty.',
  'Schedules, live times, fares, and trip plans come from transit agencies and Google and can be late, incomplete, or wrong. Check official agency sources for critical travel.',
  'Don’t use Pathly while driving or in ways that put you or others at risk.',
  'Map and trip data are provided by Google and subject to Google’s terms.',
];

export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

export function HelpSettings({ onFeedback }: PageProps) {
  const { page, profile } = useStyles();
  const [open, setOpen] = useState<HelpDoc | null>(null);
  const toggle = (doc: HelpDoc) => setOpen((current) => (current === doc ? null : doc));
  const contact = async () => {
    const url = SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Pathly support')}` : ISSUES_URL;
    try {
      await Linking.openURL(url);
    } catch {
      onFeedback(SUPPORT_EMAIL ? `Email ${SUPPORT_EMAIL} for support` : `Report problems at ${ISSUES_URL}`);
    }
  };
  const openOsmCopyright = async () => {
    try {
      await Linking.openURL(OSM_COPYRIGHT_URL);
    } catch {
      onFeedback(`See ${OSM_COPYRIGHT_URL}`);
    }
  };
  return (
    <>
      <Text style={profile.intro}>Answers, support, and the policies behind Pathly.</Text>
      <Card>
        <SettingRow detail="Trip planning, live times, and saved places" label="Frequently asked questions" onPress={() => toggle('faq')} testID="help-faq" />
        {open === 'faq' ? <View style={page.doc} testID="help-faq-content">{FAQ.map((item) => <View key={item.q} style={page.docItem}><Text style={page.docHeading}>{item.q}</Text><Text style={page.docBody}>{item.a}</Text></View>)}</View> : null}
        <SettingRow detail={SUPPORT_EMAIL ? `Email ${SUPPORT_EMAIL}` : 'Report a problem on GitHub'} label="Contact support" onPress={() => void contact()} testID="help-contact" />
        <SettingRow detail="What Pathly keeps and why" label="Privacy policy" onPress={() => toggle('privacy')} testID="help-privacy" />
        {open === 'privacy' ? <View style={page.doc} testID="help-privacy-content">{PRIVACY.map((line) => <Text key={line} style={[page.docBody, page.docItem]}>{line}</Text>)}</View> : null}
        <SettingRow label="Terms of use" onPress={() => toggle('terms')} testID="help-terms" />
        {open === 'terms' ? <View style={page.doc} testID="help-terms-content">{TERMS.map((line) => <Text key={line} style={[page.docBody, page.docItem]}>{line}</Text>)}</View> : null}
        {/* Nearby's walking distances come from OpenStreetMap, whose license (ODbL) requires this credit. */}
        <SettingRow detail="Walking distances use map data © OpenStreetMap contributors" label="Map data" onPress={() => void openOsmCopyright()} testID="help-osm" />
      </Card>
    </>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  editBlock: { padding: 15, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  input: { minHeight: 46, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.ink, backgroundColor: colors.background, ...typography.body, fontSize: 15 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minHeight: 40, minWidth: 84, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20 },
  primaryButton: { backgroundColor: colors.primary },
  primaryButtonText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 14 },
  secondaryButton: { backgroundColor: colors.background },
  secondaryButtonText: { color: colors.ink, fontFamily: fontFamilies.bold, fontSize: 14 },
  limitChoices: { marginTop: 0, padding: 15, borderBottomWidth: 1, borderBottomColor: colors.border },
  dangerCard: { gap: 10, marginTop: 16, padding: 15, borderWidth: 1, borderColor: colors.red, borderRadius: 18, backgroundColor: colors.surface },
  dangerTitle: { color: colors.red, ...typography.bodyStrong, fontSize: 15 },
  dangerBody: { color: colors.mutedInk, ...typography.metadata },
  dangerButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.red },
  dangerButtonText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 15 },
  disabled: { opacity: 0.5 },
  error: { color: colors.red, ...typography.metadata },
  doc: { gap: 10, paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceMuted },
  docItem: { gap: 3 },
  docHeading: { color: colors.ink, ...typography.bodyStrong },
  docBody: { color: colors.mutedInk, ...typography.body },
});
