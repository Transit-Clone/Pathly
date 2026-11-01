import { render, screen } from '@testing-library/react-native';
import { onSnapshot } from 'firebase/firestore';

import { AuthProvider } from '../src/auth/AuthContext';
import { InboxSettings } from '../src/components/SettingsPages';
import { ProfileView } from '../src/components/ProfileView';
import { UserPreferencesProvider } from '../src/data/userPreferences';
import { AppSettingsProvider } from '../src/theme/AppSettings';
import type { ReactNode } from 'react';

function Providers({ children }: { children: ReactNode }) {
  return <AppSettingsProvider><AuthProvider><UserPreferencesProvider>{children}</UserPreferencesProvider></AuthProvider></AppSettingsProvider>;
}

/** Every listener (the profile's too) gets these docs; only the inbox reads their fields. */
function snapshotOf(docs: readonly { id: string; data: Record<string, unknown> }[]) {
  jest.mocked(onSnapshot).mockImplementation(((_ref: unknown, next: (snapshot: unknown) => void) => {
    next({ exists: () => false, data: () => undefined, docs: docs.map((entry) => ({ id: entry.id, data: () => entry.data })) });
    return () => undefined;
  }) as unknown as typeof onSnapshot);
}

describe('inbox', () => {
  const defaultSnapshot = jest.mocked(onSnapshot).getMockImplementation();
  afterEach(() => jest.mocked(onSnapshot).mockImplementation(defaultSnapshot as typeof onSnapshot));

  it('lists past alerts', () => {
    snapshotOf([{ id: 'a', data: { title: 'S93 service alert', body: 'Detour on Main St', sentAt: { toDate: () => new Date('2026-11-03T15:00:00Z') } } }]);
    render(<Providers><InboxSettings /></Providers>);
    expect(screen.getByTestId('inbox-a')).toHaveTextContent(/S93 service alert/);
    expect(screen.getByTestId('inbox-a')).toHaveTextContent(/Detour on Main St/);
  });

  it('says when there is nothing yet', () => {
    snapshotOf([]);
    render(<Providers><InboxSettings /></Providers>);
    expect(screen.getByTestId('inbox-empty')).toBeTruthy();
  });
});

describe('settings hub', () => {
  it('leads with the Pathling and offers the inbox, with the editor moved to Account', () => {
    render(<Providers><ProfileView onBack={jest.fn()} /></Providers>);
    expect(screen.getByTestId('profile-hero')).toHaveTextContent(/Pathly Rider/);
    expect(screen.getByTestId('settings-row-inbox')).toBeTruthy();
    expect(screen.queryByTestId('profile-edit-avatar')).toBeNull();
  });
});
