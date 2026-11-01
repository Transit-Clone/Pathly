import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createUserWithEmailAndPassword, sendEmailVerification, signInAnonymously } from 'firebase/auth';
import type { User } from 'firebase/auth';

import { needsEmailConfirmation, setSignUpDraft, signUpWithEmail } from '../src/auth/authService';
import { AuthScreen } from '../src/components/AuthScreen';
import { SetPlacesPrompt } from '../src/components/SetPlacesPrompt';
import { isNewAccount } from '../src/hooks/useNewAccountPlacesPrompt';
import type { SavedLocation } from '../src/data/userData';

const asUser = (fields: Record<string, unknown>) => fields as unknown as User;
const passwordUser = (fields: Record<string, unknown> = {}) => asUser({
  emailVerified: false,
  isAnonymous: false,
  providerData: [{ providerId: 'password' }],
  metadata: { creationTime: '2026-11-02T00:00:00Z' },
  ...fields,
});

describe('sign-up form', () => {
  const fillSignUp = (password: string, confirm: string) => {
    fireEvent.press(screen.getByTestId('auth-switch-mode'));
    fireEvent.changeText(screen.getByTestId('auth-email'), 'rider@example.com');
    fireEvent.changeText(screen.getByTestId('auth-password'), password);
    fireEvent.changeText(screen.getByTestId('auth-confirm-password'), confirm);
  };

  it('stops when the two passwords differ', async () => {
    render(<AuthScreen />);
    fillSignUp('secret-one', 'secret-two');
    fireEvent.press(screen.getByTestId('auth-submit'));
    await screen.findByText("Those passwords don't match.");
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('asks for the password twice only when signing up, and says the name can change', () => {
    render(<AuthScreen />);
    expect(screen.queryByTestId('auth-confirm-password')).toBeNull();
    fireEvent.press(screen.getByTestId('auth-switch-mode'));
    expect(screen.getByTestId('auth-confirm-password')).toBeTruthy();
    expect(screen.getByTestId('auth-name-hint')).toHaveTextContent(/change your name anytime/);
  });

  it('comes back from "Wrong email?" with the name and address filled in', () => {
    setSignUpDraft({ displayName: 'Sam', email: 'typo@example.com', mode: 'signUp' });
    render(<AuthScreen />);
    expect(screen.getByTestId('auth-email').props.value).toBe('typo@example.com');
    expect(screen.getByTestId('auth-name').props.value).toBe('Sam');
  });

  it('shows the Pathlings talking, and moves to another line', () => {
    jest.useFakeTimers();
    try {
      render(<AuthScreen />);
      const first = screen.getByTestId('auth-pathlings-line', { includeHiddenElements: true }).props.children;
      act(() => { jest.advanceTimersByTime(5100); });
      expect(screen.getByTestId('auth-pathlings-line', { includeHiddenElements: true }).props.children).not.toBe(first);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('guest mode', () => {
  it('starts an anonymous session', async () => {
    render(<AuthScreen />);
    fireEvent.press(screen.getByTestId('auth-guest'));
    await waitFor(() => expect(signInAnonymously).toHaveBeenCalled());
  });

  it('says so when the provider is turned off', async () => {
    (signInAnonymously as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('off'), { code: 'auth/admin-restricted-operation' }));
    render(<AuthScreen />);
    fireEvent.press(screen.getByTestId('auth-guest'));
    await screen.findByText("Guest mode isn't turned on for this app yet.");
  });
});

describe('email confirmation', () => {
  it('sends the email on sign-up, and a failed send does not fail it', async () => {
    const user = { uid: 'new' };
    (createUserWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({ user });
    (sendEmailVerification as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(signUpWithEmail('a@example.com', 'secret', '')).resolves.toEqual({ user });
    expect(sendEmailVerification).toHaveBeenCalledWith(user);
  });

  it('gates only new, unconfirmed password accounts', () => {
    expect(needsEmailConfirmation(passwordUser())).toBe(true);
    expect(needsEmailConfirmation(passwordUser({ emailVerified: true }))).toBe(false);
    expect(needsEmailConfirmation(passwordUser({ isAnonymous: true, providerData: [] }))).toBe(false);
    expect(needsEmailConfirmation(passwordUser({ providerData: [{ providerId: 'google.com' }] }))).toBe(false);
    expect(needsEmailConfirmation(passwordUser({ metadata: { creationTime: '2026-05-01T00:00:00Z' } }))).toBe(false);
  });
});

describe('places prompt', () => {
  const now = Date.parse('2026-11-03T00:00:00Z');

  it('is for new accounts, not older ones or guests', () => {
    expect(isNewAccount(passwordUser(), now)).toBe(true);
    expect(isNewAccount(passwordUser({ metadata: { creationTime: '2026-09-01T00:00:00Z' } }), now)).toBe(false);
    expect(isNewAccount(passwordUser({ isAnonymous: true }), now)).toBe(false);
    expect(isNewAccount(null, now)).toBe(false);
  });

  it('offers home, work and school, and can be skipped', () => {
    const onSet = jest.fn();
    const onDone = jest.fn();
    render(<SetPlacesPrompt onDone={onDone} onSet={onSet} places={[]} />);
    fireEvent.press(screen.getByTestId('set-places-school'));
    expect(onSet).toHaveBeenCalledWith('School');
    expect(screen.getByTestId('set-places-done')).toHaveTextContent('Skip for now');
    fireEvent.press(screen.getByTestId('set-places-done'));
    expect(onDone).toHaveBeenCalled();
  });

  it('shows what is already set', () => {
    const home = { address: { label: 'Home', name: '12 Elm St', placeId: 'p' } } as unknown as SavedLocation;
    render(<SetPlacesPrompt onDone={jest.fn()} onSet={jest.fn()} places={[home]} />);
    expect(screen.getByTestId('set-places-home')).toHaveTextContent(/12 Elm St/);
    expect(screen.getByTestId('set-places-done')).toHaveTextContent('Done');
  });
});
