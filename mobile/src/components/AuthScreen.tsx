import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signInAsGuest, signInWithEmail, signUpWithEmail, takeSignUpDraft } from '../auth/authService';
import { sendPasswordReset } from '../data/accountData';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { GoogleSignInButton } from './GoogleSignInButton';
import { Icon } from './Icon';
import { PathlingChat } from './PathlingChat';
import { PressableScale } from './PressableScale';
import { radii } from '../theme/shape';

type Mode = 'signIn' | 'signUp';

// Closing Google's window isn't an error worth a message.
const CANCELLED_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
}

function friendlyAuthError(error: unknown): string {
  switch (errorCode(error)) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account with that email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/account-exists-with-different-credential':
      return 'That email already has a password account. Sign in with your password instead.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.';
    case 'auth/operation-not-allowed':
      return "Google sign-in isn't turned on for this app yet.";
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** Shown when there is no signed-in user; swaps to HomeScreen once auth state resolves. */
export function AuthScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  // Back from "Wrong email?", the form picks up where it was.
  const [draft] = useState(takeSignUpDraft);
  const [mode, setMode] = useState<Mode>(draft?.mode ?? 'signIn');
  const [displayName, setDisplayName] = useState(draft?.displayName ?? '');
  const [email, setEmail] = useState(draft?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(draft?.notice ?? '');
  // A confirmation that isn't an error (a password reset link on its way).
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && (mode === 'signIn' || confirmPassword.length > 0) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    if (mode === 'signUp' && password !== confirmPassword) {
      setError("Those passwords don't match.");
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'signUp') {
        await signUpWithEmail(email.trim(), password, displayName.trim());
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (caught) {
      setError(friendlyAuthError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  // "Forgot password?": emails a reset link to the address typed above. Firebase doesn't say
  // whether an account exists for it, and neither does this, so it can't be used to probe.
  const forgotPassword = async () => {
    if (submitting) return;
    setNotice('');
    const address = email.trim();
    if (!address) {
      setError('Enter your email above, then tap Forgot password.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await sendPasswordReset(address);
      setNotice(`If there's an account for ${address}, a link to reset its password is on its way. Check your inbox.`);
    } catch (caught) {
      const code = errorCode(caught);
      if (code === 'auth/user-not-found') setNotice(`If there's an account for ${address}, a link to reset its password is on its way. Check your inbox.`);
      else setError(code === 'auth/invalid-email' ? 'Enter a valid email address.' : code === 'auth/too-many-requests' ? 'Too many tries. Wait a minute and try again.' : friendlyAuthError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const continueAsGuest = async () => {
    if (submitting) return;
    setNotice('');
    setError('');
    setSubmitting(true);
    try {
      await signInAsGuest();
    } catch (caught) {
      const code = errorCode(caught);
      setError(code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation' ? "Guest mode isn't turned on for this app yet." : friendlyAuthError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.viewport}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="auth-screen">
        <ThemedStatusBar />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <PathlingChat style={styles.chat} />
            <Text style={styles.heading}>{mode === 'signIn' ? 'Welcome back' : 'Create your account'}</Text>
            {mode === 'signUp' ? <Text style={styles.subheading}>Save your favorite routes, stops, and trips.</Text> : <View style={styles.headingGap} />}

            <View style={styles.card}>
              {mode === 'signUp' ? (
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setDisplayName}
                  placeholder="Name"
                  placeholderTextColor={colors.mutedInk}
                  style={styles.input}
                  testID="auth-name"
                  value={displayName}
                />
              ) : null}
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.mutedInk}
                style={styles.input}
                testID="auth-email"
                value={email}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete={mode === 'signUp' ? 'new-password' : 'password'}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.mutedInk}
                secureTextEntry={true}
                style={[styles.input, mode === 'signIn' && styles.inputLast]}
                testID="auth-password"
                value={password}
              />
              {mode === 'signUp' ? (
                <TextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.mutedInk}
                  secureTextEntry={true}
                  style={[styles.input, styles.inputLast]}
                  testID="auth-confirm-password"
                  value={confirmPassword}
                />
              ) : null}
            </View>
            {mode === 'signUp' ? <Text style={styles.hint} testID="auth-name-hint">You can change your name anytime in Settings. We&apos;ll email you a link to confirm your address.</Text> : null}
            {mode === 'signIn' ? (
              <PressableScale
                accessibilityHint="Emails a link to reset your password"
                accessibilityRole="button"
                disabled={submitting}
                hitSlop={8}
                onPress={() => void forgotPassword()}
                style={styles.forgot}
                testID="auth-forgot-password"
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </PressableScale>
            ) : null}

            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice} testID="auth-notice">{notice}</Text> : null}

            <PressableScale
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={submit}
              style={[styles.primaryAction, !canSubmit && styles.primaryActionDisabled]}
              testID="auth-submit"
            >
              {submitting ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryActionText}>{mode === 'signIn' ? 'Sign in' : 'Create account'}</Text>}
            </PressableScale>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>
            {/* Google and guest are the same full-width buttons, so all three ways in read as equal choices. */}
            <GoogleSignInButton
              disabled={submitting}
              onError={(caught) => {
                if (!CANCELLED_CODES.has(errorCode(caught))) setError(friendlyAuthError(caught));
              }}
              onStart={() => {
                setNotice('');
                setError('');
              }}
            />
            <PressableScale
              accessibilityHint="Look around without an account. Nothing is saved."
              accessibilityLabel="Continue as guest"
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => void continueAsGuest()}
              style={[styles.guest, submitting && styles.guestDisabled]}
              testID="auth-guest"
            >
              <Icon color={colors.ink} name="person" size={18} />
              <Text style={styles.guestText}>Continue as guest</Text>
            </PressableScale>

            <PressableScale
              accessibilityRole="button"
              onPress={() => {
                setError('');
                setNotice('');
                setConfirmPassword('');
                setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              }}
              style={styles.switchMode}
              testID="auth-switch-mode"
            >
              <Text style={styles.switchModeText}>
                {mode === 'signIn' ? "Don't have an account? " : 'Already have an account? '}
                <Text style={styles.switchModeAction}>{mode === 'signIn' ? 'Sign up' : 'Sign in'}</Text>
              </Text>
            </PressableScale>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { width: '100%', maxWidth: 540, flex: 1, paddingHorizontal: 24, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 32 },
  chat: { marginBottom: 18 },
  hint: { marginTop: 10, color: colors.mutedInk, ...typography.metadata },
  heading: { color: colors.ink, ...typography.screenHeading },
  headingGap: { height: 20 },
  subheading: { marginTop: 8, marginBottom: 28, color: colors.mutedInk, ...typography.body },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, backgroundColor: colors.surface },
  input: { minHeight: 52, paddingHorizontal: 16, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.border, ...typography.body, fontSize: 15 },
  inputLast: { borderBottomWidth: 0 },
  error: { marginTop: 14, color: colors.red, ...typography.metadata },
  notice: { marginTop: 14, color: colors.ink, ...typography.metadata },
  forgot: { alignSelf: 'flex-end', marginTop: 10, paddingVertical: 4 },
  forgotText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  primaryAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20, borderRadius: radii.pill, backgroundColor: colors.primary },
  primaryActionDisabled: { opacity: 0.5 },
  primaryActionText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { color: colors.mutedInk, ...typography.metadata },
  switchMode: { alignItems: 'center', marginTop: 18 },
  switchModeText: { color: colors.mutedInk, ...typography.metadata },
  switchModeAction: { color: colors.primary, fontFamily: fontFamilies.extraBold },
  // Matches the Google button (GoogleButton.tsx): outlined, full width, icon and label.
  guest: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.surface },
  guestDisabled: { opacity: 0.5 },
  guestText: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 15 },
});
