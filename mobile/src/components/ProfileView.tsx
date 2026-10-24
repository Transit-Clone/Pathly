import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOutUser } from '../auth/authService';
import { useAuth } from '../auth/AuthContext';
import { ThemedStatusBar, useAppSettings, useTheme, useThemedStyles, type Appearance } from '../theme/AppSettings';
import { ScreenTransition } from '../theme/motion';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { DONATION_URL, openDonationPage, STUDENT_DISCLAIMER } from '../data/supportPrompt';
import { findLabeledLocation, sortSavedLocations, type SavedLocation } from '../data/userData';
import { Icon, type IconName } from './Icon';
import { Mascot } from './Mascot';
import { PressableScale } from './PressableScale';
import { savedLocationIcon, savedPlaceLines } from './SavedPlacesStrip';
import { AccessibilitySettings, AccountSettings, HelpSettings, NotificationSettings, PrivacySettings, TravelSettings } from './SettingsPages';

type ProfileViewProps = {
  onBack: () => void;
  /** Shown only to the admin account. */
  onOpenAdminTools?: () => void;
  /** Opens straight to a settings page (back from choosing a place to save). */
  initialRoute?: 'places';
  /** The signed-in rider's saved places, managed under Saved places. */
  savedPlaces?: {
    locations: readonly SavedLocation[];
    onAdd: (label?: 'Home' | 'Work') => void;
    onEdit: (location: SavedLocation) => void;
  };
};

type SavedPlacesSettingsProps = NonNullable<ProfileViewProps['savedPlaces']>;

/** Settings -> Saved places: Home and Work first (or a row to set each), then the rest, then Add. */
function SavedPlacesSettings({ locations, onAdd, onEdit }: SavedPlacesSettingsProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const missing = (['Home', 'Work'] as const).filter((label) => !findLabeledLocation(locations, label));
  return (
    <>
      <Text style={styles.intro}>Keep common destinations one tap away. Tap a place to rename it, change its icon, or remove it.</Text>
      <Card>
        {missing.map((label) => (
          <PressableScale accessibilityHint={`Searches for your ${label.toLowerCase()} address`} accessibilityLabel={`Set ${label.toLowerCase()}`} accessibilityRole="button" key={label} onPress={() => onAdd(label)} style={styles.settingRow} testID={`saved-set-${label.toLowerCase()}`}>
            <View style={styles.rowIcon}><Icon name={label === 'Home' ? 'home' : 'work'} size={19} /></View>
            <View style={styles.rowCopy}><Text style={styles.settingText}>{label}</Text><Text style={styles.settingDetail}>Set location</Text></View>
            <Icon color={colors.mutedInk} name="forward" size={20} />
          </PressableScale>
        ))}
        {sortSavedLocations(locations).map((location) => {
          const { title, subtitle } = savedPlaceLines(location);
          return (
            <PressableScale accessibilityHint="Rename, change the icon, or remove" accessibilityLabel={`Edit saved place ${title}`} accessibilityRole="button" key={location.id} onPress={() => onEdit(location)} style={styles.settingRow} testID={`saved-place-row-${location.id}`}>
              <View style={styles.rowIcon}><Icon filled={true} name={savedLocationIcon(location.address)} size={19} /></View>
              <View style={styles.rowCopy}><Text numberOfLines={1} style={styles.settingText}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={styles.settingDetail}>{subtitle}</Text> : null}</View>
              <Icon color={colors.mutedInk} name="forward" size={20} />
            </PressableScale>
          );
        })}
      </Card>
      <PressableScale accessibilityRole="button" onPress={() => onAdd()} style={styles.primaryAction} testID="add-saved-place"><Text style={styles.primaryActionText}>Add saved place</Text></PressableScale>
    </>
  );
}
type SettingsRoute = 'hub' | 'appearance' | 'account' | 'notifications' | 'accessibility' | 'privacy' | 'travel' | 'places' | 'help';

const routes: readonly { id: Exclude<SettingsRoute, 'hub'>; title: string; subtitle: string; icon: IconName; group: 'ACCOUNT' | 'PREFERENCES' | 'SUPPORT' }[] = [
  { id: 'account', title: 'Account details', subtitle: 'Name, email, and password', icon: 'person', group: 'ACCOUNT' },
  { id: 'notifications', title: 'Notifications', subtitle: 'Trips, arrivals, and service alerts', icon: 'bell', group: 'ACCOUNT' },
  { id: 'appearance', title: 'Appearance', subtitle: 'Light, dark, or match your device', icon: 'appearance', group: 'PREFERENCES' },
  { id: 'accessibility', title: 'Accessibility', subtitle: 'Text size, contrast, motion, and step-free', icon: 'accessibility', group: 'PREFERENCES' },
  { id: 'privacy', title: 'Privacy', subtitle: 'Location, your data, and account deletion', icon: 'privacy', group: 'PREFERENCES' },
  { id: 'travel', title: 'Travel preferences', subtitle: 'Modes, walking, and transfers', icon: 'travel', group: 'PREFERENCES' },
  { id: 'places', title: 'Saved places', subtitle: 'Home, work, and frequent destinations', icon: 'place', group: 'PREFERENCES' },
  { id: 'help', title: 'Help & About', subtitle: 'FAQs, support, policies, and app version', icon: 'help', group: 'SUPPORT' },
];

export function Header({ onBack, testID = 'settings-back', title }: { onBack: () => void; testID?: string; title: string }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.header}><PressableScale accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.backButton} testID={testID}><Icon name="back" size={26} /></PressableScale><Text numberOfLines={1} style={styles.title}>{title}</Text></View>;
}

export function Card({ children }: { children: ReactNode }) { const styles = useThemedStyles(createStyles); return <View style={styles.card}>{children}</View>; }

export function SettingRow({ detail, label, onPress, testID }: { detail?: string; label: string; onPress?: () => void; testID?: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return <PressableScale accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={styles.settingRow} testID={testID}><View style={styles.rowCopy}><Text style={styles.settingText}>{label}</Text>{detail ? <Text style={styles.settingDetail}>{detail}</Text> : null}</View>{onPress ? <Icon color={colors.mutedInk} name="forward" size={20} /> : null}</PressableScale>;
}

export function ToggleRow({ detail, label, onChange, testID, value }: { detail?: string; label: string; onChange: (value: boolean) => void; testID: string; value: boolean }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return <View style={styles.settingRow}><View style={styles.rowCopy}><Text style={styles.settingText}>{label}</Text>{detail ? <Text style={styles.settingDetail}>{detail}</Text> : null}</View><Switch accessibilityLabel={label} onValueChange={onChange} testID={testID} thumbColor={colors.white} trackColor={{ false: colors.border, true: colors.primary }} value={value} /></View>;
}

export function ChoiceRow({ label, onSelect, options, selected, testPrefix }: { label: string; onSelect: (value: string) => void; options: readonly string[]; selected: string; testPrefix: string }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.choiceBlock}><Text style={styles.settingText}>{label}</Text><View style={styles.choices}>{options.map((option) => <Pressable accessibilityRole="button" accessibilityState={{ selected: selected === option }} key={option} onPress={() => onSelect(option)} style={[styles.choice, selected === option && styles.choiceSelected]} testID={`${testPrefix}-${option.toLowerCase().replaceAll(' ', '-')}`}><Text style={[styles.choiceText, selected === option && styles.choiceTextSelected]}>{option}</Text></Pressable>)}</View></View>;
}

const appearanceOptions: readonly { label: string; value: Appearance }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
];

export function ProfileView({ initialRoute, onBack, onOpenAdminTools, savedPlaces }: ProfileViewProps) {
  const { appearance, setAppearance } = useAppSettings();
  const { user } = useAuth();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [route, setRoute] = useState<SettingsRoute>(initialRoute ?? 'hub');
  const [feedback, setFeedback] = useState('');
  const openRoute = (nextRoute: SettingsRoute) => { setFeedback(''); setRoute(nextRoute); };

  if (route !== 'hub') {
    const title = routes.find((item) => item.id === route)?.title ?? 'Settings';
    return (
      <ScreenTransition key={route}>
      <View style={styles.viewport}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID={`settings-${route}`}>
          <ThemedStatusBar />
          <Header onBack={() => openRoute('hub')} title={title} />
          <ScrollView contentContainerStyle={styles.pageContent} key={route} showsVerticalScrollIndicator={false}>
            {route === 'appearance' ? <><Text style={styles.intro}>Choose how Pathly looks. System follows your device&apos;s light or dark setting.</Text><Card><ChoiceRow label="Theme" onSelect={(label) => { const option = appearanceOptions.find((item) => item.label === label); if (option) { setAppearance(option.value); setFeedback(`Appearance set to ${label}`); } }} options={appearanceOptions.map((item) => item.label)} selected={appearanceOptions.find((item) => item.value === appearance)?.label ?? 'Light'} testPrefix="appearance" /></Card></> : null}
            {route === 'account' ? <AccountSettings onFeedback={setFeedback} /> : null}
            {route === 'notifications' ? <NotificationSettings onFeedback={setFeedback} /> : null}
            {route === 'accessibility' ? <AccessibilitySettings onFeedback={setFeedback} /> : null}
            {route === 'privacy' ? <PrivacySettings onFeedback={setFeedback} /> : null}
            {route === 'travel' ? <TravelSettings onFeedback={setFeedback} /> : null}
            {route === 'places' ? (savedPlaces ? <SavedPlacesSettings {...savedPlaces} /> : <Text style={styles.intro}>Sign in to save places like home and work.</Text>) : null}
            {route === 'help' ? <><HelpSettings onFeedback={setFeedback} /><View style={styles.versionCard}><Mascot pose="happy" size={56} style={styles.aboutMascot} /><Text style={styles.versionName}>Pathly Prototype</Text><Text style={styles.version}>Version 0.1.0</Text><Text style={styles.aboutNote} testID="about-disclaimer">{"Pathly is a free transit app built by a team of students. It isn't affiliated with or endorsed by the MTA, NYC DOT, or any transit agency, so always check posted service changes. Tips are optional and go toward live data and server costs."}</Text></View></> : null}
            {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text> : null}
          </ScrollView>
        </SafeAreaView>
      </View>
      </ScreenTransition>
    );
  }

  return (
    <ScreenTransition key="hub">
    <View style={styles.viewport}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="profile-view">
        <ThemedStatusBar />
        <Header onBack={onBack} testID="profile-back" title="Profile & Settings" />
        <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
          <View style={styles.accountCard}><View style={styles.avatar}><Icon color={colors.onPrimary} filled={true} name="person" size={28} /></View><View><Text style={styles.name}>{user?.displayName || 'Pathly Rider'}</Text><Text style={styles.guest}>{user?.email ?? 'Signed in'}</Text></View></View>
          {(['ACCOUNT', 'PREFERENCES', 'SUPPORT'] as const).map((group) => <View key={group}><Text style={styles.sectionLabel}>{group}</Text><Card>{routes.filter((item) => item.group === group).map((item) => <PressableScale accessibilityLabel={item.title} accessibilityRole="button" key={item.id} onPress={() => openRoute(item.id)} style={styles.settingRow} testID={`settings-row-${item.id}`}><View style={styles.rowIcon}><Icon name={item.icon} size={19} /></View><View style={styles.rowCopy}><Text style={styles.settingText}>{item.title}</Text><Text style={styles.settingDetail}>{item.subtitle}</Text></View><Icon color={colors.mutedInk} name="forward" size={20} /></PressableScale>)}</Card></View>)}
          {DONATION_URL ? <View style={styles.supportCard}><Card><PressableScale accessibilityHint="Opens Pathly's donation page" accessibilityLabel="Support Pathly" accessibilityRole="link" onPress={openDonationPage} style={styles.settingRow} testID="settings-row-support"><View style={[styles.rowIcon, styles.supportIcon]}><Icon color={colors.highlightInk} filled={true} name="heart" size={19} /></View><View style={styles.rowCopy}><Text style={styles.settingText}>Support Pathly</Text><Text style={styles.settingDetail}>{STUDENT_DISCLAIMER}</Text></View><Icon color={colors.mutedInk} name="forward" size={20} /></PressableScale></Card></View> : null}
          {onOpenAdminTools ? <View><Text style={styles.sectionLabel}>ADMIN</Text><Card><PressableScale accessibilityLabel="Admin tools" accessibilityRole="button" onPress={onOpenAdminTools} style={styles.settingRow} testID="settings-row-admin"><View style={styles.rowIcon}><Icon name="crosshair" size={19} /></View><View style={styles.rowCopy}><Text style={styles.settingText}>Admin tools</Text><Text style={styles.settingDetail}>Mock location and time, backend status, requests</Text></View><Icon color={colors.mutedInk} name="forward" size={20} /></PressableScale></Card></View> : null}
          <PressableScale accessibilityRole="button" onPress={() => { void signOutUser(); }} style={styles.signOut} testID="sign-out"><Text style={styles.signOutText}>Sign out</Text></PressableScale>
          {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
    </ScreenTransition>
  );
}

export const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background }, screen: { width: '100%', maxWidth: 540, flex: 1, paddingHorizontal: 18, backgroundColor: colors.background }, header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 }, backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }, title: { minWidth: 0, flex: 1, color: colors.ink, ...typography.screenHeading, fontSize: 24 }, pageContent: { paddingBottom: 34 },
  intro: { marginTop: 4, marginBottom: 16, color: colors.mutedInk, ...typography.body }, accountCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, padding: 18, borderRadius: 20, backgroundColor: colors.surface }, avatar: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29, backgroundColor: colors.primary }, name: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 }, guest: { marginTop: 3, color: colors.mutedInk, ...typography.metadata }, sectionLabel: { marginTop: 24, marginBottom: 9, color: colors.mutedInk, ...typography.label }, card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface }, settingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, rowCopy: { minWidth: 0, flex: 1 }, rowIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.blueSoft }, settingText: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 }, settingDetail: { marginTop: 2, color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  choiceBlock: { padding: 15, borderBottomWidth: 1, borderBottomColor: colors.border }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, choice: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.background }, choiceSelected: { borderColor: colors.primary, backgroundColor: colors.blueSoft }, choiceText: { color: colors.mutedInk, ...typography.metadata }, choiceTextSelected: { color: colors.primary, fontFamily: fontFamilies.extraBold }, note: { marginTop: 12, color: colors.mutedInk, ...typography.metadata }, primaryAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderRadius: 16, backgroundColor: colors.primary }, primaryActionText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 }, supportCard: { marginTop: 12 }, supportIcon: { backgroundColor: colors.highlightSoft }, aboutMascot: { marginBottom: 10 }, aboutNote: { maxWidth: 320, marginTop: 12, color: colors.mutedInk, ...typography.metadata, lineHeight: 18, textAlign: 'center' }, versionCard: { alignItems: 'center', marginTop: 22, padding: 18 }, versionName: { color: colors.ink, ...typography.bodyStrong }, version: { marginTop: 3, color: colors.mutedInk, ...typography.metadata }, signOut: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 22, borderWidth: 1, borderColor: colors.red, borderRadius: 16, backgroundColor: colors.surface }, signOutText: { color: colors.red, fontFamily: fontFamilies.extraBold, fontSize: 15 }, feedback: { marginTop: 14, color: colors.primary, ...typography.metadata, textAlign: 'center' },
});
