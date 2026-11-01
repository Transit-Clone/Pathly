import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import type { ReactNode } from 'react';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { SvgXml } from 'react-native-svg';

import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { DEFAULT_BEAN_AVATAR, beanAvatarSvg } from '../src/avatars/beanAvatar';
import { ProfileView } from '../src/components/ProfileView';
import { SearchHeader } from '../src/components/SearchHeader';
import { db } from '../src/lib/firebase';
import { AppSettingsProvider } from '../src/theme/AppSettings';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
// The complete SVG option grids can exceed Jest's 5s default on slower Windows hosts.
jest.setTimeout(15000);

function Providers({ children }: { children: ReactNode }) {
  return <AppSettingsProvider><AuthProvider>{children}</AuthProvider></AppSettingsProvider>;
}
function openProfile() {
  return render(<Providers><SearchHeader onProfilePress={jest.fn()} onSearchPress={jest.fn()} /><ProfileView onBack={jest.fn()} /></Providers>);
}
async function edit(screen: ReturnType<typeof openProfile>) {
  fireEvent.press(screen.getByTestId('settings-row-account'));
  fireEvent.press(screen.getByTestId('profile-edit-avatar'));
  await waitFor(() => expect(screen.getByTestId('bean-editor')).toBeTruthy());
}

function cycleTo(screen: ReturnType<typeof openProfile>, field: string, label: string) {
  fireEvent.press(screen.getByTestId(`bean-tab-${field}`));
  const category = field === 'color' ? 'Pathling color' : field.charAt(0).toUpperCase() + field.slice(1);
  fireEvent.press(screen.getByLabelText(`${category}: ${label}`));
}

describe('custom profile beans', () => {
  beforeEach(async () => {
    await setDoc(doc(db, 'users', 'test-uid'), { email: 'rider@example.com', avatar: { ...DEFAULT_BEAN_AVATAR } });
  });
  it('saves all four choices, updates both profile pictures, and restores after remount', async () => {
    const screen = openProfile();
    await edit(screen);
    cycleTo(screen, 'color', 'Pink');
    cycleTo(screen, 'eyes', 'Processing');
    cycleTo(screen, 'mouth', 'One tooth');
    cycleTo(screen, 'hair', 'One good curl');
    await act(async () => { fireEvent.press(screen.getByTestId('bean-save')); });
    const expected = { version: 1, color: 'pink', eyes: 'uneven', mouth: 'tooth', hair: 'curl' };
    await waitFor(() => expect(screen.queryByTestId('bean-editor')).toBeNull());
    expect((await getDoc(doc(db, 'users', 'test-uid'))).data()).toMatchObject({ avatar: expected, email: 'rider@example.com' });
    fireEvent.press(screen.getByTestId('settings-back'));
    for (const id of ['header-bean-avatar', 'profile-bean-avatar']) {
      expect(screen.getByTestId(id).findByType(SvgXml).props.xml).toBe(beanAvatarSvg(expected));
    }
    screen.unmount();
    const again = openProfile();
    await edit(again);
    expect(again.getByTestId('bean-color-pink').props.accessibilityState.selected).toBe(true);
    expect(again.getByTestId('bean-preview').findByType(SvgXml).props.xml).toBe(beanAvatarSvg(expected));
  });

  it('discards a canceled draft and offers Surprise me without presets', async () => {
    const screen = openProfile();
    await edit(screen);
    expect(screen.queryByText('Pick a starting point')).toBeNull();
    expect(screen.queryByText('A little bean. A lot of you.')).toBeNull();
    expect(screen.getByText('Surprise me')).toBeTruthy();
    fireEvent.press(screen.getByTestId('bean-randomize'));
    cycleTo(screen, 'color', 'Coral');
    fireEvent.press(screen.getByTestId('bean-cancel'));
    fireEvent.press(screen.getByTestId('profile-edit-avatar'));
    await waitFor(() => expect(screen.getByTestId('bean-editor')).toBeTruthy());
    expect(screen.getByTestId('bean-preview').findByType(SvgXml).props.xml).toBe(beanAvatarSvg(DEFAULT_BEAN_AVATAR));
    expect((await getDoc(doc(db, 'users', 'test-uid'))).data()?.avatar).toEqual(DEFAULT_BEAN_AVATAR);
  });

  it('keeps the draft and offers retry when saving fails', async () => {
    const screen = openProfile();
    await edit(screen);
    cycleTo(screen, 'color', 'Teal');
    jest.mocked(setDoc).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { fireEvent.press(screen.getByTestId('bean-save')); });
    await waitFor(() => expect(screen.getByTestId('bean-save-error')).toBeTruthy());
    expect(screen.getByTestId('bean-color-teal').props.accessibilityState.selected).toBe(true);
    await act(async () => { fireEvent.press(screen.getByTestId('bean-save')); });
    await waitFor(() => expect(screen.queryByTestId('bean-editor')).toBeNull());
    expect((await getDoc(doc(db, 'users', 'test-uid'))).data()?.avatar.color).toBe('teal');
  });

  it('selects grid options independently and restores the bald option', async () => {
    const screen = openProfile();
    await edit(screen);
    cycleTo(screen, 'color', 'Oat');
    expect(screen.getByTestId('bean-preview').findByType(SvgXml).props.xml).toBe(beanAvatarSvg({ ...DEFAULT_BEAN_AVATAR, color: 'oat' }));
    cycleTo(screen, 'color', 'Sage');
    cycleTo(screen, 'hair', 'Receiving signals');
    expect(screen.getByTestId('bean-hair-antenna').props.accessibilityState.selected).toBe(true);
    cycleTo(screen, 'hair', 'Bald and bold');
    expect(screen.getByTestId('bean-preview').findByType(SvgXml).props.xml).toBe(beanAvatarSvg(DEFAULT_BEAN_AVATAR));
  });

  it('clears another account’s avatar on account switch and sign out', async () => {
    let authChanged!: (user: User | null) => void;
    jest.mocked(onAuthStateChanged).mockImplementationOnce((_auth, callback) => {
      authChanged = callback as (user: User | null) => void;
      authChanged({ uid: 'first', email: 'first@example.com' } as User);
      return () => undefined;
    });
    await setDoc(doc(db, 'users', 'first'), { avatar: { ...DEFAULT_BEAN_AVATAR, color: 'coral' } });
    await setDoc(doc(db, 'users', 'second'), { avatar: { ...DEFAULT_BEAN_AVATAR } });
    const hook = renderHook(() => useAuth(), { wrapper: Providers });
    await waitFor(() => expect(hook.result.current.avatar.color).toBe('coral'));
    act(() => authChanged({ uid: 'second' } as User));
    expect(hook.result.current.avatar).toEqual(DEFAULT_BEAN_AVATAR);
    await waitFor(() => expect(hook.result.current.avatarLoading).toBe(false));
    act(() => authChanged(null));
    expect(hook.result.current.avatar).toEqual(DEFAULT_BEAN_AVATAR);
    await expect(hook.result.current.saveAvatar({ ...DEFAULT_BEAN_AVATAR })).rejects.toThrow('Sign in');
  });

  it('blocks editing after a profile load failure and retries the subscription', async () => {
    jest.mocked(onSnapshot).mockImplementationOnce(((_ref: unknown, _next: unknown, fail: () => void) => {
      fail();
      return () => undefined;
    }) as typeof onSnapshot);
    const screen = openProfile();
    fireEvent.press(screen.getByTestId('settings-row-account'));
    fireEvent.press(screen.getByTestId('profile-edit-avatar'));
    expect(screen.queryByTestId('bean-editor')).toBeNull();
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByTestId('bean-editor')).toBeTruthy());
  });
});
