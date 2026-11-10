import { GoogleAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { renderHook } from '@testing-library/react-native';

const mockPromptAsync = jest.fn();
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{}, null, mockPromptAsync],
}));

// The hook picks its implementation from this platform's client ID when the module loads.
process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the env var above
const { useGoogleReauth } = require('../src/auth/googleReauth') as typeof import('../src/auth/googleReauth');

const user = { uid: 'test-uid' } as never;

describe('useGoogleReauth', () => {
  beforeEach(() => jest.clearAllMocks());

  it("re-authenticates with the ID token from Google's sign-in page", async () => {
    mockPromptAsync.mockResolvedValue({ type: 'success', params: { id_token: 'google-id-token' } });
    const { result } = renderHook(() => useGoogleReauth());
    expect(result.current.available).toBe(true);

    await result.current.reauthenticate(user);
    expect(GoogleAuthProvider.credential).toHaveBeenCalledWith('google-id-token');
    expect(reauthenticateWithCredential).toHaveBeenCalledWith(user, { providerId: 'google.com', idToken: 'google-id-token' });
  });

  it('reports a dismissed sign-in page as cancelled', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'dismiss' });
    const { result } = renderHook(() => useGoogleReauth());
    await expect(result.current.reauthenticate(user)).rejects.toMatchObject({ code: 'auth/user-cancelled' });
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
  });
});
