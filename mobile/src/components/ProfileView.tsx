import { useState, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';

type ProfileViewProps = { onBack: () => void };
type SettingsRoute = 'hub' | 'account' | 'notifications' | 'accessibility' | 'privacy' | 'travel' | 'places' | 'help';
type ToggleKey = 'notifications' | 'serviceAlerts' | 'tripReminders' | 'disruptions' | 'reducedMotion' | 'highContrast' | 'stepFree' | 'location' | 'analytics' | 'walking' | 'fewTransfers';

const routes: readonly { id: Exclude<SettingsRoute, 'hub'>; title: string; subtitle: string; icon: string; group: 'ACCOUNT' | 'PREFERENCES' | 'SUPPORT' }[] = [
  { id: 'account', title: 'Account details', subtitle: 'Profile, contact information, and membership', icon: 'P', group: 'ACCOUNT' },
  { id: 'notifications', title: 'Notifications', subtitle: 'Trips, arrivals, and service alerts', icon: '◉', group: 'ACCOUNT' },
  { id: 'accessibility', title: 'Accessibility', subtitle: 'Display, motion, and step-free routes', icon: 'Aa', group: 'PREFERENCES' },
  { id: 'privacy', title: 'Privacy', subtitle: 'Location and prototype data controls', icon: '◌', group: 'PREFERENCES' },
  { id: 'travel', title: 'Travel preferences', subtitle: 'Modes, walking, and transfers', icon: '↗', group: 'PREFERENCES' },
  { id: 'places', title: 'Saved places', subtitle: 'Home, work, and frequent destinations', icon: '⌖', group: 'PREFERENCES' },
  { id: 'help', title: 'Help & About', subtitle: 'FAQs, support, policies, and app version', icon: '?', group: 'SUPPORT' },
];

function Header({ onBack, testID = 'settings-back', title }: { onBack: () => void; testID?: string; title: string }) {
  return <View style={styles.header}><Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} testID={testID}><Text style={styles.backIcon}>‹</Text></Pressable><Text numberOfLines={1} style={styles.title}>{title}</Text></View>;
}

function Card({ children }: { children: ReactNode }) { return <View style={styles.card}>{children}</View>; }

function SettingRow({ detail, label, onPress, testID }: { detail?: string; label: string; onPress?: () => void; testID?: string }) {
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]} testID={testID}><View style={styles.rowCopy}><Text style={styles.settingText}>{label}</Text>{detail ? <Text style={styles.settingDetail}>{detail}</Text> : null}</View>{onPress ? <Text style={styles.chevron}>›</Text> : null}</Pressable>;
}

function ToggleRow({ detail, label, onChange, testID, value }: { detail?: string; label: string; onChange: (value: boolean) => void; testID: string; value: boolean }) {
  return <View style={styles.settingRow}><View style={styles.rowCopy}><Text style={styles.settingText}>{label}</Text>{detail ? <Text style={styles.settingDetail}>{detail}</Text> : null}</View><Switch accessibilityLabel={label} onValueChange={onChange} testID={testID} thumbColor={colors.white} trackColor={{ false: colors.border, true: colors.primary }} value={value} /></View>;
}

function ChoiceRow({ label, onSelect, options, selected, testPrefix }: { label: string; onSelect: (value: string) => void; options: readonly string[]; selected: string; testPrefix: string }) {
  return <View style={styles.choiceBlock}><Text style={styles.settingText}>{label}</Text><View style={styles.choices}>{options.map((option) => <Pressable accessibilityRole="button" accessibilityState={{ selected: selected === option }} key={option} onPress={() => onSelect(option)} style={[styles.choice, selected === option && styles.choiceSelected]} testID={`${testPrefix}-${option.toLowerCase().replaceAll(' ', '-')}`}><Text style={[styles.choiceText, selected === option && styles.choiceTextSelected]}>{option}</Text></Pressable>)}</View></View>;
}

export function ProfileView({ onBack }: ProfileViewProps) {
  const [route, setRoute] = useState<SettingsRoute>('hub');
  const [feedback, setFeedback] = useState('');
  const [textSize, setTextSize] = useState('Default');
  const [preferredMode, setPreferredMode] = useState('All transit');
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({ notifications: true, serviceAlerts: true, tripReminders: true, disruptions: true, reducedMotion: false, highContrast: false, stepFree: false, location: true, analytics: false, walking: true, fewTransfers: false });
  const setToggle = (key: ToggleKey, value: boolean) => { setToggles((current) => ({ ...current, [key]: value })); setFeedback('Updated for this prototype session only'); };
  const openRoute = (nextRoute: SettingsRoute) => { setFeedback(''); setRoute(nextRoute); };

  if (route !== 'hub') {
    const title = routes.find((item) => item.id === route)?.title ?? 'Settings';
    return (
      <View style={styles.viewport}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID={`settings-${route}`}>
          <StatusBar style="dark" />
          <Header onBack={() => openRoute('hub')} title={title} />
          <ScrollView contentContainerStyle={styles.pageContent} key={route} showsVerticalScrollIndicator={false}>
            {route === 'account' ? <><Text style={styles.intro}>Review the profile information that will connect to your Pathly account.</Text><Card><SettingRow detail="Pathly Rider" label="Display name" onPress={() => setFeedback('Name editing is available in this local prototype only')} testID="account-display-name" /><SettingRow detail="rider@example.com" label="Email" onPress={() => setFeedback('Email verification requires authentication')} testID="account-email" /><SettingRow detail="Not added" label="Phone number" onPress={() => setFeedback('Phone setup requires authentication')} testID="account-phone" /><SettingRow detail="Guest · Free plan" label="Membership" /></Card><Text style={styles.sectionLabel}>SECURITY</Text><Card><SettingRow detail="Not configured" label="Password" onPress={() => setFeedback('Password management requires authentication')} testID="account-password" /><SettingRow detail="Off" label="Two-step verification" onPress={() => setFeedback('Two-step verification requires authentication')} /></Card></> : null}
            {route === 'notifications' ? <><Text style={styles.intro}>Choose which travel updates appear when notifications are connected.</Text><Card><ToggleRow label="Allow notifications" onChange={(value) => setToggle('notifications', value)} testID="toggle-notifications" value={toggles.notifications} /><ToggleRow detail="Changes and delays on saved routes" label="Service alerts" onChange={(value) => setToggle('serviceAlerts', value)} testID="toggle-service-alerts" value={toggles.serviceAlerts} /><ToggleRow detail="Leave-time and transfer reminders" label="Trip reminders" onChange={(value) => setToggle('tripReminders', value)} testID="toggle-trip-reminders" value={toggles.tripReminders} /><ToggleRow detail="Major incidents near your trip" label="Disruption updates" onChange={(value) => setToggle('disruptions', value)} testID="toggle-disruptions" value={toggles.disruptions} /></Card><Text style={styles.note}>Device notification permission is not requested by this prototype.</Text></> : null}
            {route === 'accessibility' ? <><Text style={styles.intro}>Adjust how Pathly presents routes and motion.</Text><Card><ChoiceRow label="Text size" onSelect={(value) => { setTextSize(value); setFeedback('Text size preview updated locally'); }} options={['Compact', 'Default', 'Large']} selected={textSize} testPrefix="text-size" /><ToggleRow detail="Limit animated map and sheet transitions" label="Reduce motion" onChange={(value) => setToggle('reducedMotion', value)} testID="toggle-reduced-motion" value={toggles.reducedMotion} /><ToggleRow detail="Increase separation between interface colors" label="High contrast" onChange={(value) => setToggle('highContrast', value)} testID="toggle-high-contrast" value={toggles.highContrast} /><ToggleRow detail="Prefer accessible stations and vehicles" label="Step-free routes" onChange={(value) => setToggle('stepFree', value)} testID="toggle-step-free" value={toggles.stepFree} /></Card></> : null}
            {route === 'privacy' ? <><Text style={styles.intro}>Control how future Pathly features may use local and account data.</Text><Card><ToggleRow detail="Used to center maps and plan nearby trips" label="Location access" onChange={(value) => setToggle('location', value)} testID="toggle-location" value={toggles.location} /><ToggleRow detail="Share anonymous product usage" label="Analytics" onChange={(value) => setToggle('analytics', value)} testID="toggle-analytics" value={toggles.analytics} /><SettingRow detail="No cloud data in this prototype" label="Download your data" onPress={() => setFeedback('Data export will be available with account storage')} testID="privacy-download" /><SettingRow label="Delete account" onPress={() => setFeedback('Account deletion requires authentication and confirmation')} testID="privacy-delete" /></Card><Text style={styles.note}>These controls do not change device permissions or remote data.</Text></> : null}
            {route === 'travel' ? <><Text style={styles.intro}>Set defaults used when Pathly compares future trip options.</Text><Card><ChoiceRow label="Preferred modes" onSelect={(value) => { setPreferredMode(value); setFeedback('Travel preference updated locally'); }} options={['All transit', 'Rail', 'Bus']} selected={preferredMode} testPrefix="travel-mode" /><ToggleRow detail="Include reasonable walking connections" label="Allow walking" onChange={(value) => setToggle('walking', value)} testID="toggle-walking" value={toggles.walking} /><ToggleRow detail="Prefer simpler trips when times are similar" label="Fewer transfers" onChange={(value) => setToggle('fewTransfers', value)} testID="toggle-fewer-transfers" value={toggles.fewTransfers} /><SettingRow detail="15 minutes" label="Maximum walking time" onPress={() => setFeedback('Walking limit selector opened locally')} testID="walking-limit" /></Card></> : null}
            {route === 'places' ? <><Text style={styles.intro}>Keep common destinations ready for faster trip planning.</Text><Card><SettingRow detail="142 Christian Ave · Stony Brook, NY" label="Home" onPress={() => setFeedback('Home place editor opened locally')} testID="saved-home" /><SettingRow detail="Stony Brook University" label="Work or school" onPress={() => setFeedback('Work or school editor opened locally')} testID="saved-work" /></Card><Pressable accessibilityRole="button" onPress={() => setFeedback('New saved place added for this session only')} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]} testID="add-saved-place"><Text style={styles.primaryActionText}>Add saved place</Text></Pressable></> : null}
            {route === 'help' ? <><Text style={styles.intro}>Find answers and information about this Pathly prototype.</Text><Card><SettingRow detail="Trip planning, predictions, and favorites" label="Frequently asked questions" onPress={() => setFeedback('FAQ preview opened locally')} testID="help-faq" /><SettingRow detail="Support messaging is not connected" label="Contact support" onPress={() => setFeedback('Support will be available before public release')} testID="help-contact" /><SettingRow label="Privacy policy" onPress={() => setFeedback('Privacy policy preview opened locally')} testID="help-privacy" /><SettingRow label="Terms of use" onPress={() => setFeedback('Terms preview opened locally')} testID="help-terms" /></Card><View style={styles.versionCard}><Text style={styles.versionName}>Pathly Prototype</Text><Text style={styles.version}>Version 0.1.0 · Local preview</Text></View></> : null}
            {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text> : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.viewport}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="profile-view">
        <StatusBar style="dark" />
        <Header onBack={onBack} testID="profile-back" title="Profile & Settings" />
        <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
          <View style={styles.accountCard}><View style={styles.avatar}><Text style={styles.avatarText}>P</Text></View><View><Text style={styles.name}>Pathly Rider</Text><Text style={styles.guest}>Guest account · Prototype</Text></View></View>
          {(['ACCOUNT', 'PREFERENCES', 'SUPPORT'] as const).map((group) => <View key={group}><Text style={styles.sectionLabel}>{group}</Text><Card>{routes.filter((item) => item.group === group).map((item) => <Pressable accessibilityLabel={item.title} accessibilityRole="button" key={item.id} onPress={() => openRoute(item.id)} style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]} testID={`settings-row-${item.id}`}><View style={styles.rowIcon}><Text style={styles.rowIconText}>{item.icon}</Text></View><View style={styles.rowCopy}><Text style={styles.settingText}>{item.title}</Text><Text style={styles.settingDetail}>{item.subtitle}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}</Card></View>)}
          <Pressable accessibilityRole="button" onPress={() => setFeedback('Sign out will be available after Firebase Authentication is added')} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]} testID="sign-out"><Text style={styles.signOutText}>Sign out</Text></Pressable>
          {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background }, screen: { width: '100%', maxWidth: 540, flex: 1, paddingHorizontal: 18, backgroundColor: colors.background }, header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 }, backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }, backIcon: { color: colors.primary, fontFamily: fontFamilies.regular, fontSize: 33, lineHeight: 35 }, title: { minWidth: 0, flex: 1, color: colors.ink, ...typography.screenHeading, fontSize: 24 }, pageContent: { paddingBottom: 34 }, pressed: { opacity: 0.65 },
  intro: { marginTop: 4, marginBottom: 16, color: colors.mutedInk, ...typography.body }, accountCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, padding: 18, borderRadius: 20, backgroundColor: colors.surface }, avatar: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29, backgroundColor: colors.primary }, avatarText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 22 }, name: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 }, guest: { marginTop: 3, color: colors.mutedInk, ...typography.metadata }, sectionLabel: { marginTop: 24, marginBottom: 9, color: colors.mutedInk, ...typography.label }, card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface }, settingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, rowCopy: { minWidth: 0, flex: 1 }, rowIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.blueSoft }, rowIconText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 }, settingText: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 }, settingDetail: { marginTop: 2, color: colors.mutedInk, ...typography.metadata, fontSize: 10 }, chevron: { color: colors.mutedInk, fontFamily: fontFamilies.regular, fontSize: 25 },
  choiceBlock: { padding: 15, borderBottomWidth: 1, borderBottomColor: colors.border }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, choice: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.background }, choiceSelected: { borderColor: colors.primary, backgroundColor: colors.blueSoft }, choiceText: { color: colors.mutedInk, ...typography.metadata }, choiceTextSelected: { color: colors.primary, fontFamily: fontFamilies.extraBold }, note: { marginTop: 12, color: colors.mutedInk, ...typography.metadata }, primaryAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderRadius: 16, backgroundColor: colors.primary }, primaryActionText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 15 }, versionCard: { alignItems: 'center', marginTop: 22, padding: 18 }, versionName: { color: colors.ink, ...typography.bodyStrong }, version: { marginTop: 3, color: colors.mutedInk, ...typography.metadata }, signOut: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 22, borderWidth: 1, borderColor: colors.red, borderRadius: 16, backgroundColor: colors.surface }, signOutText: { color: colors.red, fontFamily: fontFamilies.extraBold, fontSize: 15 }, feedback: { marginTop: 14, color: colors.primary, ...typography.metadata, textAlign: 'center' },
});
