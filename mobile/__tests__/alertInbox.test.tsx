import { render, screen } from '@testing-library/react-native';
import { onSnapshot } from 'firebase/firestore';

import { AuthProvider } from '../src/auth/AuthContext';
import { inboxLineBadge, InboxSettings } from '../src/components/SettingsPages';
import type { SavedRoute } from '../src/data/savedRoutes';
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

  it('badges each alert with its line, like the route cards', () => {
    snapshotOf([{ id: 'a', data: { title: 'S93 service alert', body: 'Detour on Main St', agencyId: 'si', routeId: 'S93', sentAt: null } }]);
    render(<Providers><InboxSettings /></Providers>);
    expect(screen.getByTestId('inbox-a-badge')).toHaveTextContent(/S93/);
  });

  it('says when there is nothing yet', () => {
    snapshotOf([]);
    render(<Providers><InboxSettings /></Providers>);
    expect(screen.getByTestId('inbox-empty')).toBeTruthy();
  });
});

describe('inboxLineBadge', () => {
  const saved: SavedRoute = {
    id: 'lirr:10', agencyId: 'lirr', routeId: '10', agencyName: 'LIRR', routeName: 'Port Jefferson Branch', shortName: 'Port Jefferson Branch',
    color: '#006EC7', favorite: true, alerts: 'all', direction0: null, direction1: null,
  };
  const entry = { id: 'x', title: 'Port Jefferson Branch service alert', body: 'Delays', sentAt: null, agencyId: 'lirr', routeId: '10' };

  it("uses the saved line's own sign and color", () => {
    expect(inboxLineBadge(entry, [saved], '#999999')).toEqual({ agency: 'LIRR', color: '#006EC7', shortName: 'PJ' });
  });

  it('names a line no longer saved from the alert, in a plain color', () => {
    expect(inboxLineBadge(entry, [], '#999999')).toEqual({ agency: 'LIRR', color: '#999999', shortName: 'PJ' });
    expect(inboxLineBadge({ ...entry, title: 'Q10 service alert', agencyId: 'qn', routeId: 'Q10' }, [], '#999999')).toEqual({ agency: 'MTA Bus', color: '#999999', shortName: 'Q10' });
  });

  it('has no badge when the alert names no line', () => {
    expect(inboxLineBadge({ id: 'y', title: 'Service alert', body: '', sentAt: null }, [], '#999999')).toBeNull();
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
