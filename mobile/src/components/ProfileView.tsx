import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
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
import { AccessibilitySettings, AccountSettings, contactSupport, HelpSettings, NotificationSettings, PrivacySettings, TravelSettings } from './SettingsPages';
import { radii } from '../theme/shape';
import { BeanAvatar } from '../avatars/BeanAvatarImage';
import { BeanAvatarEditor } from '../avatars/BeanAvatarEditor';
import { DestinationPinEditor } from './DestinationPinEditor';
import { DestinationPinMarker } from './DestinationPinMarker';

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
  // Home, then Work, always the first two rows (a saved one, or a row to set it), whatever list they're in.
  const anchors = (['Home', 'Work'] as const).map((label) => ({ label, location: findLabeledLocation(locations, label) }));
  const anchorIds = new Set(anchors.flatMap(({ location }) => (location ? [location.id] : [])));
  const sorted = sortSavedLocations(locations).filter((location) => !anchorIds.has(location.id));
  const groups = savedPlaceGroups(sorted);
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
      <Card>
        {anchors.map(({ label, location }) => location ? row(location) : (
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
type SettingsRoute = 'hub' | 'avatar' | 'pin' | 'appearance' | 'account' | 'notifications' | 'accessibility' | 'privacy' | 'travel' | 'places' | 'maps' | 'help' | 'faq' | 'about';

/**
 * The hub's rows, in order, as unlabeled cards: you and how the app looks and behaves, then your
 * places and data, then support. `support` opens a sheet rather than a page.
 */
type HubRow = { id: Exclude<SettingsRoute, 'hub' | 'avatar' | 'pin' | 'help' | 'faq'> | 'support'; title: string; detail: string; icon: IconName };
const hubCards: readonly (readonly HubRow[])[] = [
  [
    { id: 'account', title: 'Account', detail: 'Name, email and password', icon: 'person' },
    { id: 'appearance', title: 'Display', detail: 'Theme, map dot and destination pin', icon: 'appearance' },
    { id: 'notifications', title: 'Notifications', detail: 'Service alerts and lines you follow', icon: 'bell' },
  ],
  [
    { id: 'travel', title: 'Preferences', detail: 'Modes, walking and transfers', icon: 'travel' },
    { id: 'accessibility', title: 'Accessibility', detail: 'Text size, motion, contrast, step-free', icon: 'accessibility' },
    { id: 'places', title: 'Saved Places', detail: 'Home, work and your lists', icon: 'place' },
    { id: 'maps', title: 'Offline Maps', detail: 'MTA maps, saved for offline', icon: 'map' },
  ],
  [
    { id: 'privacy', title: 'Location & Privacy', detail: 'Location, analytics and your data', icon: 'privacy' },
    { id: 'support', title: 'Support', detail: 'Help, FAQ, contact us and feedback', icon: 'help' },
    { id: 'about', title: 'About', detail: 'Version, policies and credits', icon: 'info' },
  ],
];
/** Page titles, for the hub's rows and the pages reached from Support. */
const pageTitles: Partial<Record<SettingsRoute, string>> = {
  ...Object.fromEntries(hubCards.flat().map((row) => [row.id, row.title])),
  help: 'Help',
  faq: 'FAQ',
};

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
  const { user, avatar } = useAuth();
  const joined = user?.metadata?.creationTime ? new Date(user.metadata.creationTime) : null;
  const since = joined && Number.isFinite(joined.getTime())
    ? `Since ${joined.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`
    : null;
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [route, setRoute] = useState<SettingsRoute>(initialRoute ?? 'hub');
  // Each confirmation pops up as a toast; a new id replays it even for the same words.
  const [feedback, setFeedbackMessage] = useState<ToastMessage | null>(null);
  const setFeedback = useCallback((text: string) => setFeedbackMessage(text ? { text, id: Date.now() } : null), []);
  const hideFeedback = useCallback(() => setFeedbackMessage(null), []);
  const openRoute = (nextRoute: SettingsRoute) => { setFeedback(''); setRoute(nextRoute); };
  const [supportOpen, setSupportOpen] = useState(false);
  const supportOptions: readonly { id: string; title: string; detail: string; icon: IconName; onPress: () => void }[] = [
    { id: 'help', title: 'Help', detail: 'Policies, terms and getting support', icon: 'help', onPress: () => openRoute('help') },
    { id: 'faq', title: 'FAQ', detail: 'Answers to common questions', icon: 'info', onPress: () => openRoute('faq') },
    { id: 'contact', title: 'Contact Us', detail: 'Email the Pathly team', icon: 'feedback', onPress: () => void contactSupport(setFeedback) },
    { id: 'feedback', title: 'Send feedback', detail: 'Tell us what to fix or add', icon: 'edit', onPress: () => void Linking.openURL(FEEDBACK_FORM_URL).catch(() => undefined) },
    { id: 'donate', title: 'Support Pathly', detail: STUDENT_DISCLAIMER, icon: 'heart', onPress: openDonationPage },
  ];

  if (route === 'avatar') {
    return <BeanAvatarEditor onCancel={() => openRoute('hub')} onSaved={() => { openRoute('hub'); setFeedback('Your Pathling is saved.'); }} />;
  }

  if (route === 'pin') {
    return <DestinationPinEditor onCancel={() => openRoute('appearance')} onSaved={() => { openRoute('appearance'); setFeedback('Your pin is saved.'); }} />;
  }

  if (route !== 'hub') {
    const title = pageTitles[route] ?? 'Settings';
    return (
      <ScreenTransition key={route}>
      <View style={styles.viewport}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID={`settings-${route}`}>
          <ThemedStatusBar />
          <Header onBack={() => openRoute('hub')} title={title} />
          <ScrollView contentContainerStyle={styles.pageContent} key={route} showsVerticalScrollIndicator={false}>
            {route === 'appearance' ? <><Card><ChoiceRow label="Theme" onSelect={(label) => { const option = appearanceOptions.find((item) => item.label === label); if (option) { setAppearance(option.value); setFeedback(`Appearance set to ${label}`); } }} options={appearanceOptions.map((item) => item.label)} selected={appearanceOptions.find((item) => item.value === appearance)?.label ?? 'Light'} testPrefix="appearance" /></Card><Card><MapDotColorRow onFeedback={setFeedback} /></Card><Card><PressableScale accessibilityHint="Change your destination pin's color and face" accessibilityLabel="Customize your destination pin" accessibilityRole="button" onPress={() => openRoute('pin')} style={styles.settingRow} testID="appearance-destination-pin"><DestinationPinMarker /><View style={styles.rowCopy}><Text style={styles.settingText}>Destination pin</Text><Text style={styles.settingDetail}>Marks where you&apos;re headed on trip maps.</Text></View><Icon name="forward" color={colors.mutedInk} size={20} /></PressableScale></Card></> : null}
            {route === 'account' ? <AccountSettings onFeedback={setFeedback} /> : null}
            {route === 'notifications' ? <NotificationSettings onFeedback={setFeedback} /> : null}
            {route === 'accessibility' ? <AccessibilitySettings onFeedback={setFeedback} /> : null}
            {route === 'privacy' ? <PrivacySettings onFeedback={setFeedback} /> : null}
            {route === 'travel' ? <TravelSettings onFeedback={setFeedback} /> : null}
            {route === 'places' ? (savedPlaces ? <SavedPlacesSettings {...savedPlaces} /> : <Text style={styles.intro}>Sign in to save places like home and work.</Text>) : null}
            {route === 'maps' ? <OfficialMapsSettings onFeedback={setFeedback} /> : null}
            {route === 'help' || route === 'faq' ? <HelpSettings initialOpen={route === 'faq' ? 'faq' : null} onFeedback={setFeedback} /> : null}
            {route === 'about' ? <><View style={styles.versionCard}><Mascot pose="happy" size={56} style={styles.aboutMascot} /><Text style={styles.versionName}>Pathly Prototype</Text><Text style={styles.version}>Version 0.1.0</Text><Text style={styles.aboutNote} testID="about-disclaimer">{"Pathly is a free transit app built by a team of students. It isn't affiliated with or endorsed by the MTA, NYC DOT, or any transit agency, so always check posted service changes. Agency names and logos belong to their respective agencies. Tips are optional and go toward live data and server costs."}</Text></View></> : null}
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
          <PressableScale accessibilityRole="button" accessibilityLabel="Customize your profile bean" accessibilityHint="Change your Pathling’s color, eyes, mouth and hair" onPress={() => openRoute('avatar')} style={styles.accountCard} testID="profile-edit-avatar"><View style={[styles.avatar, { backgroundColor: colors.surfaceMuted }]}><BeanAvatar config={avatar} size={58} testID="profile-bean-avatar" /></View><View style={styles.rowCopy}><Text style={styles.name}>{user?.displayName || 'Pathly Rider'}</Text>{since ? <Text style={styles.guest} testID="profile-since">{since}</Text> : null}</View><Icon name="forward" color={colors.mutedInk} size={20} /></PressableScale>
          {hubCards.map((rows) => <View key={rows[0]!.id} style={styles.hubCard}><Card>{rows.map((item) => <PressableScale accessibilityHint={item.detail} accessibilityLabel={item.title} accessibilityRole="button" key={item.id} onPress={() => (item.id === 'support' ? setSupportOpen(true) : openRoute(item.id))} style={styles.settingRow} testID={`settings-row-${item.id}`}><View style={styles.rowIcon}><Icon name={item.icon} size={19} /></View><View style={styles.rowCopy}><Text style={styles.settingText}>{item.title}</Text></View><Icon color={colors.mutedInk} name={item.id === 'support' ? 'expand' : 'forward'} size={20} /></PressableScale>)}</Card></View>)}
          {onOpenAdminTools ? <View style={styles.hubCard}><Card><PressableScale accessibilityLabel="Admin tools" accessibilityRole="button" onPress={onOpenAdminTools} style={styles.settingRow} testID="settings-row-admin"><View style={styles.rowIcon}><Icon name="crosshair" size={19} /></View><View style={styles.rowCopy}><Text style={styles.settingText}>Admin tools</Text></View><Icon color={colors.mutedInk} name="forward" size={20} /></PressableScale></Card></View> : null}
          <PressableScale accessibilityRole="button" onPress={() => { void signOutUser(); }} style={styles.signOut} testID="sign-out"><Text style={styles.signOutText}>Sign out</Text></PressableScale>
        </ScrollView>
      </SafeAreaView>
      {/* Support: every way to get help, from the bottom. */}
      <Modal animationType="slide" onRequestClose={() => setSupportOpen(false)} transparent={true} visible={supportOpen}>
        <View style={styles.sheetViewport}>
          <Pressable accessibilityLabel="Close support" onPress={() => setSupportOpen(false)} style={styles.sheetBackdrop} testID="support-backdrop" />
          <View style={styles.sheet} testID="support-sheet">
            <View style={styles.sheetHeader}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>Support</Text>
              <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={() => setSupportOpen(false)} testID="support-close"><Icon name="close" size={26} /></PressableScale>
            </View>
            <Card>
              {supportOptions.map((option) => <PressableScale accessibilityHint={option.detail} accessibilityLabel={option.title} accessibilityRole="button" key={option.id} onPress={() => { setSupportOpen(false); option.onPress(); }} style={styles.settingRow} testID={`support-${option.id}`}><View style={[styles.rowIcon, option.id === 'donate' && styles.supportIcon]}><Icon color={option.id === 'donate' ? colors.highlightInk : undefined} name={option.icon} size={19} /></View><View style={styles.rowCopy}><Text style={styles.settingText}>{option.title}</Text><Text style={styles.settingDetail}>{option.detail}</Text></View><Icon color={colors.mutedInk} name="forward" size={20} /></PressableScale>)}
            </Card>
          </View>
        </View>
      </Modal>
      <Toast message={feedback} onHidden={hideFeedback} />
    </View>
    </ScreenTransition>
  );
}

export const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background }, screen: { width: '100%', maxWidth: 540, flex: 1, paddingHorizontal: 18, backgroundColor: colors.background }, header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 }, backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }, title: { minWidth: 0, flex: 1, color: colors.ink, ...typography.screenHeading, fontSize: 24 }, pageContent: { paddingBottom: 34 },
  intro: { marginTop: 4, marginBottom: 16, color: colors.mutedInk, ...typography.body }, accountCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, padding: 18, borderRadius: radii.card, backgroundColor: colors.surface }, avatar: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29, backgroundColor: colors.primary }, name: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 }, guest: { marginTop: 3, color: colors.mutedInk, ...typography.metadata }, sectionLabel: { marginTop: 24, marginBottom: 9, color: colors.mutedInk, ...typography.label }, card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface }, settingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, rowCopy: { minWidth: 0, flex: 1 }, rowIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.blueSoft }, settingText: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 }, settingDetail: { marginTop: 2, color: colors.mutedInk, ...typography.metadata, fontSize: 10 },
  choiceBlock: { padding: 15, borderBottomWidth: 1, borderBottomColor: colors.border }, swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }, swatch: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 3, borderColor: 'transparent' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, choice: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, backgroundColor: colors.background }, choiceSelected: { borderColor: colors.primary, backgroundColor: colors.blueSoft }, choiceText: { color: colors.mutedInk, ...typography.metadata }, choiceTextSelected: { color: colors.primary, fontFamily: fontFamilies.extraBold }, note: { marginTop: 12, color: colors.mutedInk, ...typography.metadata }, primaryAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderRadius: 16, backgroundColor: colors.primary }, primaryActionText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 }, supportIcon: { backgroundColor: colors.highlightSoft }, aboutMascot: { marginBottom: 10 }, aboutNote: { maxWidth: 320, marginTop: 12, color: colors.mutedInk, ...typography.metadata, lineHeight: 18, textAlign: 'center' }, versionCard: { alignItems: 'center', marginTop: 22, padding: 18 }, versionName: { color: colors.ink, ...typography.bodyStrong }, version: { marginTop: 3, color: colors.mutedInk, ...typography.metadata }, hubCard: { marginTop: 16 },
  sheetViewport: { flex: 1, justifyContent: 'flex-end' }, sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim }, sheet: { width: '100%', maxWidth: 540, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, backgroundColor: colors.background }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, sheetTitle: { color: colors.ink, ...typography.sectionHeading, fontSize: 20 },
  signOut: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 22, borderWidth: 1, borderColor: colors.red, borderRadius: 16, backgroundColor: colors.surface }, signOutText: { color: colors.red, fontFamily: fontFamilies.extraBold, fontSize: 15 },
});
