import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';

type ProfileViewProps = {
  onBack: () => void;
};

const settings = ['Account details', 'Notifications', 'Accessibility', 'Privacy'];

export function ProfileView({ onBack }: ProfileViewProps) {
  const [feedback, setFeedback] = useState('');

  return (
    <View style={styles.viewport}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="profile-view">
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            testID="profile-back"
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.title}>Profile & Settings</Text>
        </View>

        <View style={styles.accountCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>P</Text></View>
          <View>
            <Text style={styles.name}>Pathly Rider</Text>
            <Text style={styles.guest}>Guest account · Prototype</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>SETTINGS</Text>
        <View style={styles.settingsCard}>
          {settings.map((setting) => (
            <Pressable
              key={setting}
              accessibilityRole="button"
              onPress={() => setFeedback(`${setting} is a placeholder`)}
              style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
            >
              <Text style={styles.settingText}>{setting}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setFeedback('Sign out will be available after Firebase Authentication is added')}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
          testID="sign-out"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        {feedback ? (
          <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, paddingHorizontal: 18, backgroundColor: colors.background },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface },
  backIcon: { color: colors.primary, fontFamily: fontFamilies.regular, fontSize: 33, lineHeight: 35 },
  title: { color: colors.ink, ...typography.screenHeading, fontSize: 24 },
  pressed: { opacity: 0.6 },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16, padding: 18, borderRadius: 20, backgroundColor: colors.surface },
  avatar: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 29, backgroundColor: colors.primary },
  avatarText: { color: colors.white, fontFamily: fontFamilies.extraBold, fontSize: 22 },
  name: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  guest: { marginTop: 3, color: colors.mutedInk, ...typography.metadata },
  sectionLabel: { marginTop: 28, marginBottom: 9, color: colors.mutedInk, ...typography.label },
  settingsCard: { overflow: 'hidden', borderRadius: 18, backgroundColor: colors.surface },
  settingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  settingText: { flex: 1, color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  chevron: { color: colors.mutedInk, fontFamily: fontFamilies.regular, fontSize: 25 },
  signOut: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 22, borderWidth: 1, borderColor: colors.red, borderRadius: 16, backgroundColor: colors.surface },
  signOutText: { color: colors.red, fontFamily: fontFamilies.extraBold, fontSize: 15 },
  feedback: { marginTop: 12, color: colors.mutedInk, ...typography.metadata, textAlign: 'center' },
});
