import { sendEmailVerification } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { setSignUpDraft, signOutUser } from '../auth/authService';
import { discardAccount } from '../data/accountData';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { radii } from '../theme/shape';
import { Mascot } from './Mascot';
import { PressableScale } from './PressableScale';

const CHECK_EVERY_MS = 4000;

/** Between sign-up and the app: the address has to be confirmed, or corrected by starting over. */
export function VerifyEmailScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { refreshUser, user } = useAuth();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // True once confirmed; App then moves on by itself.
  const check = useCallback(async () => {
    if (!user) return false;
    await user.reload();
    if (user.emailVerified) refreshUser();
    return user.emailVerified;
  }, [refreshUser, user]);

  // The link usually opens in another tab or app, so this one notices by itself.
  useEffect(() => {
    const timer = setInterval(() => void check().catch(() => undefined), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [check]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const confirmed = () => run(async () => {
    const done = await check().catch(() => null);
    if (done === false) setMessage("We don't see it yet. Open the link in the email, then try again.");
    if (done === null) setMessage('Check your connection and try again.');
  });

  const resend = () => run(async () => {
    if (!user) return;
    try {
      await sendEmailVerification(user);
      setMessage('Sent. Check your inbox and spam folder.');
    } catch {
      setMessage('That email could not be sent. Wait a minute and try again.');
    }
  });

  // Firebase can't change an unconfirmed sign-up's address safely, so it starts over.
  const fixEmail = () => run(async () => {
    if (!user) return;
    const draft = { displayName: user.displayName ?? '', email: user.email ?? '' };
    setSignUpDraft({ ...draft, mode: 'signUp' });
    const discarded = await discardAccount(user);
    if (!discarded) setSignUpDraft({ ...draft, mode: 'signIn', notice: 'Sign in again with that email, then choose "Wrong email?" to fix it.' });
  });

  return (
    <View style={styles.viewport}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="verify-email-screen">
        <ThemedStatusBar />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Mascot mood="thinking" size={76} style={styles.mascot} />
          <Text style={styles.heading}>Confirm your email</Text>
          <Text style={styles.body}>We sent a link to</Text>
          <Text style={styles.email} testID="verify-email-address">{user?.email}</Text>
          <Text style={styles.body}>Open it to finish creating your account. This page moves on by itself.</Text>
          {message ? <Text accessibilityLiveRegion="polite" style={styles.message} testID="verify-email-message">{message}</Text> : null}

          <PressableScale accessibilityRole="button" disabled={busy} onPress={() => void confirmed()} style={styles.primary} testID="verify-email-done">
            {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryText}>I&apos;ve confirmed it</Text>}
          </PressableScale>
          <PressableScale accessibilityRole="button" disabled={busy} onPress={() => void resend()} style={styles.secondary} testID="verify-email-resend">
            <Text style={styles.secondaryText}>Send the email again</Text>
          </PressableScale>
          <PressableScale accessibilityRole="button" disabled={busy} onPress={() => void fixEmail()} style={styles.secondary} testID="verify-email-fix">
            <Text style={styles.secondaryText}>Wrong email? Fix it</Text>
          </PressableScale>
          <PressableScale accessibilityRole="button" disabled={busy} onPress={() => void signOutUser()} style={styles.secondary} testID="verify-email-sign-out">
            <Text style={styles.signOutText}>Sign out</Text>
          </PressableScale>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, paddingHorizontal: 24, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 32 },
  mascot: { marginBottom: 18 },
  heading: { marginBottom: 12, color: colors.ink, ...typography.screenHeading },
  body: { color: colors.mutedInk, ...typography.body },
  email: { marginVertical: 6, color: colors.ink, ...typography.bodyStrong },
  message: { marginTop: 14, color: colors.ink, ...typography.metadata },
  primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 24, borderRadius: radii.pill, backgroundColor: colors.primary },
  primaryText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  secondaryText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 14 },
  signOutText: { color: colors.mutedInk, ...typography.metadata },
});
