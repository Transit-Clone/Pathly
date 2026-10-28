import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOutUser } from '../auth/authService';
import { useAuth } from '../auth/AuthContext';
import { ThemedStatusBar, useAppSettings, useTheme, useThemedStyles, type Appearance, type MapDotColor } from '../theme/AppSettings';
import { ScreenTransition } from '../theme/motion';
import { lightColors, type Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { FEEDBACK_FORM_URL } from '../data/nudgePrompt';
import { openDonationPage, STUDENT_DISCLAIMER } from '../data/supportPrompt';
import { findLabeledLocation, savedPlaceGroups, sortSavedLocations, SAVED_PLACE_COLORS, type SavedLocation } from '../data/userData';
import { SAVED_PLACE_COLOR_HEX } from '../data/savedPlacePin';
import { Icon, type IconName } from './Icon';
import { Mascot } from './Mascot';
import { OfficialMapsSettings } from './OfficialMapsSettings';
import { PressableScale } from './PressableScale';
import { Toast, type ToastMessage } from './Toast';
import { SavedPlaceBadge } from './SavedPlaceBadge';
import { savedLocationIcon, savedPlaceLines } from './SavedPlacesStrip';
import { AccessibilitySettings, AccountSettings, HelpSettings, NotificationSettings, PrivacySettings, TravelSettings } from './SettingsPages';
import { radii } from '../theme/shape';

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

/**
 * Settings -> Saved places: Home and Work first (or a row to set each), then the places in no list,
 * then each list under its name, then Add.
 */
function SavedPlacesSettings({ locations, onAdd, onEdit }: SavedPlacesSettingsProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const missing = (['Home', 'Work'] as const).filter((label) => !findLabeledLocation(locations, label));
  const sorted = sortSavedLocations(locations);
  const groups = savedPlaceGroups(locations);
  const inGroup = (location: SavedLocation, name: string) => location.address.group?.trim().toLowerCase() === name.toLowerCase();
  const row = (location: SavedLocation) => {
    const { title, subtitle } = savedPlaceLines(location);
    return (
      <PressableScale accessibilityHint="Rename, change the address, icon, color or list, or remove" accessibilityLabel={`Edit saved place ${title}`} accessibilityRole="button" key={location.id} onPress={() => onEdit(location)} style={styles.settingRow} testID={`saved-place-row-${location.id}`}>
        <SavedPlaceBadge icon={savedLocationIcon(location.address)} location={location.address} size={34} />
        <View style={styles.rowCopy}><Text numberOfLines={1} style={styles.settingText}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={styles.settingDetail}>{subtitle}</Text> : null}</View>
        <Icon color={colors.mutedInk} name="forward" size={20} />
      </PressableScale>
    );
  };
  const ungrouped = sorted.filter((location) => !location.address.group?.trim());
  return (
    <>
      <Text style={styles.intro}>Keep common destinations one tap away. Tap a place to change its name, address, icon or color, or to put it in a list like Restaurants.</Text>
      <Card>
        {missing.map((label) => (
          <PressableScale accessibilityHint={`Searches for your ${label.toLowerCase()} address`} accessibilityLabel={`Set ${label.toLowerCase()}`} accessibilityRole="button" key={label} onPress={() => onAdd(label)} style={styles.settingRow} testID={`saved-set-${label.toLowerCase()}`}>
            <View style={styles.rowIcon}><Icon name={label === 'Home' ? 'home' : 'work'} size={19} /></View>
            <View style={styles.rowCopy}><Text style={styles.settingText}>{label}</Text><Text style={styles.settingDetail}>Set location</Text></View>
            <Icon color={colors.mutedInk} name="forward" size={20} />
          </PressableScale>
        ))}
        {ungrouped.map(row)}
      </Card>
      {groups.map((group) => (
        <View key={group.name} testID={`saved-group-${group.name}`}>
          <Text style={styles.sectionLabel}>{`${group.name.toUpperCase()} · ${group.count}`}</Text>
          <Card>{sorted.filter((location) => inGroup(location, group.name)).map(row)}</Card>
        </View>
      ))}
      <PressableScale accessibilityRole="button" onPress={() => onAdd()} style={styles.primaryAction} testID="add-saved-place"><Text style={styles.primaryActionText}>Add saved place</Text></PressableScale>
    </>
  );
}
type SettingsRoute = 'hub' | 'appearance' | 'account' | 'notifications' | 'accessibility' | 'privacy' | 'travel' | 'places' | 'maps' | 'help';

/** The hub's sections, in the order riders tend to need them; each row says what's inside. */
const groups = ['ACCOUNT', 'TRIPS', 'DISPLAY', 'ALERTS & PRIVACY', 'SUPPORT'] as const;

const routes: readonly { id: Exclude<SettingsRoute, 'hub'>; title: string; detail: string; icon: IconName; group: typeof groups[number] }[] = [
  { id: 'account', title: 'Account details', detail: 'Name, email and password', icon: 'person', group: 'ACCOUNT' },
  { id: 'places', title: 'Saved places', detail: 'Home, work and your lists', icon: 'place', group: 'ACCOUNT' },
  { id: 'travel', title: 'Travel preferences', detail: 'Modes, walking and transfers', icon: 'travel', group: 'TRIPS' },
  { id: 'maps', title: 'Official maps', detail: 'MTA maps, saved for offline', icon: 'map', group: 'TRIPS' },
  { id: 'appearance', title: 'Appearance', detail: 'Light, dark or match your device', icon: 'appearance', group: 'DISPLAY' },
  { id: 'accessibility', title: 'Accessibility', detail: 'Text size, motion, contrast, step-free', icon: 'accessibility', group: 'DISPLAY' },
  { id: 'notifications', title: 'Notifications', detail: 'Service alerts and lines you follow', icon: 'bell', group: 'ALERTS & PRIVACY' },
  { id: 'privacy', title: 'Privacy', detail: 'Location, analytics and your data', icon: 'privacy', group: 'ALERTS & PRIVACY' },
  { id: 'help', title: 'Help & About', detail: 'FAQ, contact and policies', icon: 'help', group: 'SUPPORT' },
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

/** The home map's explore dot: the theme's purple first, then the saved-place colors. */
function MapDotColorRow({ onFeedback }: { onFeedback: (message: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const { mapDotColor, setMapDotColor } = useAppSettings();
  const { colors } = useTheme();
  const options: readonly { id: MapDotColor; label: string; hex: string }[] = [
    { id: 'default', label: 'Purple (default)', hex: lightColors.searchCenter },
    ...SAVED_PLACE_COLORS.filter((color) => color !== 'purple').map((color) => ({ id: color, label: color[0]!.toUpperCase() + color.slice(1), hex: SAVED_PLACE_COLOR_HEX[color] })),
  ];
  return (
    <View style={styles.choiceBlock}>
      <Text style={styles.settingText}>Map dot color</Text>
      <Text style={styles.settingDetail}>The dot that marks where you&apos;ve moved the home map to explore.</Text>
      <View style={styles.swatches}>
        {options.map((option) => {
          const selected = mapDotColor === option.id;
          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.id}
              onPress={() => {
                setMapDotColor(option.id);
                onFeedback(`Map dot set to ${option.label.replace(' (default)', '').toLowerCase()}`);
              }}
              style={[styles.swatch, { backgroundColor: option.hex }, selected && { borderColor: colors.ink }]}
              testID={`map-dot-${option.id}`}
            >
              {selected ? <Icon color={colors.white} name="check" size={16} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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
  // Each confirmation pops up as a toast; a new id replays it even for the same words.
  const [feedback, setFeedbackMessage] = useState<ToastMessage | null>(null);
  const setFeedback = useCallback((text: string) => setFeedbackMessage(text ? { text, id: Date.now() } : null), []);
  const hideFeedback = useCallback(() => setFeedbackMessage(null), []);
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
            {route === 'appearance' ? <><Text style={styles.intro}>Choose how Pathly looks. System follows your device&apos;s light or dark setting.</Text><Card><ChoiceRow label="Theme" onSelect={(label) => { const option = appearanceOptions.find((item) => item.label === label); if (option) { setAppearance(option.value); setFeedback(`Appearance set to ${label}`); } }} options={appearanceOptions.map((item) => item.label)} selected={appearanceOptions.find((item) => item.value === appearance)?.label ?? 'Light'} testPrefix="appearance" /></Card><Card><MapDotColorRow onFeedback={setFeedback} /></Card></> : null}
            {route === 'account' ? <AccountSettings onFeedback={setFeedback} /> : null}
            {route === 'notifications' ? <NotificationSettings onFeedback={setFeedback} /> : null}
            {route === 'accessibility' ? <AccessibilitySettings onFeedback={setFeedback} /> : null}
            {route === 'privacy' ? <PrivacySettings onFeedback={setFeedback} /> : null}
            {route === 'travel' ? <TravelSettings onFeedback={setFeedback} /> : null}
            {route === 'places' ? (savedPlaces ? <SavedPlacesSettings {...savedPlaces} /> : <Text style={styles.intro}>Sign in to save places like home and work.</Text>) : null}
            {route === 'maps' ? <OfficialMapsSettings onFeedback={setFeedback} /> : null}
            {route === 'help' ? <><HelpSettings onFeedback={setFeedback} /><View style={styles.versionCard}><Mascot pose="happy" size={56} style={styles.aboutMascot} /><Text style={styles.versionName}>Pathly Prototype</Text><Text style={styles.version}>Version 0.1.0</Text><Text style={styles.aboutNote} testID="about-disclaimer">{"Pathly is a free transit app built by a team of students. It isn't affiliated with or endorsed by the MTA, NYC DOT, or any transit agency, so always check posted service changes. Agency names and logos belong to their respective agencies. Tips are optional and go toward live data and server costs."}</Text></View></> : null}
          </ScrollView>
        </SafeAreaView>
        <Toast message={feedback} onHidden={hideFeedback} />
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
          <View style={styles.accountCard}><View style={styles.avatar}><Icon color={colors.onPrimary} name="person" size={28} /></View><View><Text style={styles.name}>{user?.displayName || 'Pathly Rider'}</Text><Text style={styles.guest}>{user?.email ?? 'Signed in'}</Text></View></View>
          {groups.map((group) => <View key={group}><Text style={styles.sectionLabel}>{group}</Text><Card>{routes.filter((item) => item.group === group).map((item) => <PressableScale accessibilityHint={item.detail} accessibilityLabel={item.title} accessibilityRole="button" key={item.id} onPress={() => openRoute(item.id)} style={styles.settingRow} testID={`settings-row-${item.id}`}><View style={styles.rowIcon}><Icon name={item.icon} size={19} /></View><View style={styles.rowCopy}><Text style={styles.settingText}>{item.title}</Text></View><Icon color={colors.mutedInk} name="forward" size={20} /></PressableScale>)}{group === 'SUPPORT' ? <PressableScale accessibilityHint="Opens Pathly's feedback form" accessibilityLabel="Submit feedback" accessibilityRole="link" onPress={() => void Linking.openURL(FEEDBACK_FORM_URL).catch(() => undefined)} style={styles.settingRow} testID="settings-row-feedback"><View style={styles.rowIcon}><Icon name="feedback" size={19} /></View><View style={styles.rowCopy}><Text style={styles.settingText}>Submit feedback</Text></View><Icon color={colors.mutedInk} name="forward" size={20} /></PressableScale> : null}{group === 'SUPPORT' ? <PressableScale accessibilityHint="Opens Pathly's donation page" accessibilityLabel="Support Pathly" accessibilityRole="link" onPress={openDonationPage} style={styles.settingRow} testID="settings-row-support"><View style={[styles.rowIcon, styles.supportIcon]}><Icon color={colors.highlightInk} name="heart" size={19} /></View><View style={styles.rowCopy}><Text style={styles.settingText}>Support Pathly</Text><Text style={styles.settingDetail}>{STUDENT_DISCLAIMER}</Text></View><Icon color={colors.mutedInk} name="forward" size={20} /></PressableScale> : null}</Card></View>)}
          {onOpenAdminTools ? <View><Text style={styles.sectionLabel}>ADMIN</Text><Card><PressableScale accessibilityLabel="Admin tools" accessibilityRole="button" onPress={onOpenAdminTools} style={styles.settingRow} testID="settings-row-admin"><View style={styles.rowIcon}><Icon name="crosshair" size={19} /></View><View style={styles.rowCopy}><Text style={styles.settingText}>Admin tools</Text></View><Icon color={colors.mutedInk} name="forward" size={20} /></PressableScale></Card></View> : null}
          <PressableScale accessibilityRole="button" onPress={() => { void signOutUser(); }} style={styles.signOut} testID="sign-out"><Text style={styles.signOutText}>Sign out</Text></PressableScale>
        </ScrollView>
      </SafeAreaView>
      <Toast message={feedback} onHidden={hideFeedback} />
    </View>
    </ScreenTransition>
  );
}

export const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background }, screen: { width: '100%', maxWidth: 540, flex: 1, paddingHorizontal: 18, backgroundColor: colors.background }, header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 }, backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }, title: { minWidth: 0, flex: 1, color: colors.ink, ...typography.screenHeading, fontSize: 24 }, pageContent: { paddingBottom: 34 },
  intro: { marginTop: 4, marginBottom: 16, color: colors.mutedInk, ...typography.body }, accountCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, padding: 18, borderRadius: radii.card, backgroundColor: colors.surface }, avatar: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29, backgroundColor: colors.primary }, name: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 }, guest: { marginTop: 3, color: colors.mutedInk, ...typography.metadata }, sectionLabel: { marginTop: 24, marginBottom: 9, color: colors.mutedInk, ...typography.label }, card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface }, settingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, rowCopy: { minWidth: 0, flex: 1 }, rowIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.blueSoft }, settingText: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 }, settingDetail: { marginTop: 2, color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  choiceBlock: { padding: 15, borderBottomWidth: 1, borderBottomColor: colors.border }, swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, swatch: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 3, borderColor: 'transparent' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, choice: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, backgroundColor: colors.background }, choiceSelected: { borderColor: colors.primary, backgroundColor: colors.blueSoft }, choiceText: { color: colors.mutedInk, ...typography.metadata }, choiceTextSelected: { color: colors.primary, fontFamily: fontFamilies.extraBold }, note: { marginTop: 12, color: colors.mutedInk, ...typography.metadata }, primaryAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderRadius: 16, backgroundColor: colors.primary }, primaryActionText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 }, supportIcon: { backgroundColor: colors.highlightSoft }, aboutMascot: { marginBottom: 10 }, aboutNote: { maxWidth: 320, marginTop: 12, color: colors.mutedInk, ...typography.metadata, lineHeight: 18, textAlign: 'center' }, versionCard: { alignItems: 'center', marginTop: 22, padding: 18 }, versionName: { color: colors.ink, ...typography.bodyStrong }, version: { marginTop: 3, color: colors.mutedInk, ...typography.metadata }, signOut: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 22, borderWidth: 1, borderColor: colors.red, borderRadius: 16, backgroundColor: colors.surface }, signOutText: { color: colors.red, fontFamily: fontFamilies.extraBold, fontSize: 15 },
});
