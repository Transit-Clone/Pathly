import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signInAsGuest, signInWithEmail, signUpWithEmail, takeSignUpDraft } from '../auth/authService';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { GoogleSignInButton } from './GoogleSignInButton';
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

  const continueAsGuest = async () => {
    if (submitting) return;
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

            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

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
            <GoogleSignInButton
              disabled={submitting}
              onError={(caught) => {
                if (!CANCELLED_CODES.has(errorCode(caught))) setError(friendlyAuthError(caught));
              }}
              onStart={() => setError('')}
            />

            <PressableScale
              accessibilityRole="button"
              onPress={() => {
                setError('');
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

            <PressableScale accessibilityRole="button" disabled={submitting} onPress={() => void continueAsGuest()} style={styles.guest} testID="auth-guest">
              <Text style={styles.guestText}>Continue as guest</Text>
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
  primaryAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20, borderRadius: radii.pill, backgroundColor: colors.primary },
  primaryActionDisabled: { opacity: 0.5 },
  primaryActionText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { color: colors.mutedInk, ...typography.metadata },
  switchMode: { alignItems: 'center', marginTop: 18 },
  switchModeText: { color: colors.mutedInk, ...typography.metadata },
  switchModeAction: { color: colors.primary, fontFamily: fontFamilies.extraBold },
  guest: { alignItems: 'center', marginTop: 18, paddingVertical: 8 },
  guestText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 15 },
});
