import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signInWithEmail, signUpWithEmail } from '../auth/authService';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { GoogleSignInButton } from './GoogleSignInButton';
import { Mascot } from './Mascot';
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
  const [mode, setMode] = useState<Mode>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
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

  return (
    <View style={styles.viewport}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="auth-screen">
        <ThemedStatusBar />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Mascot pose="happy" size={76} style={styles.mascot} testID="auth-mascot" />
            <Text style={styles.heading}>{mode === 'signIn' ? 'Welcome back' : 'Create your account'}</Text>
            <Text style={styles.subheading}>{mode === 'signIn' ? 'Sign in to sync your saved trips and stops.' : 'Save your favorite routes, stops, and trips.'}</Text>

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
                autoComplete="password"
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.mutedInk}
                secureTextEntry={true}
                style={[styles.input, styles.inputLast]}
                testID="auth-password"
                value={password}
              />
            </View>

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
  mascot: { marginBottom: 18 },
  heading: { color: colors.ink, ...typography.screenHeading },
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
});
