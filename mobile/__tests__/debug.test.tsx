import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, waitFor } from '@testing-library/react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { AuthProvider } from '../src/auth/AuthContext';
import { isAdminEmail } from '../src/debug/admin';
import { appNow, DEBUG_STORAGE_KEY, DebugProvider, useDebug } from '../src/debug/DebugContext';
import { getRequestLog, isRequestLogEnabled, recordRequest } from '../src/debug/requestLog';

const mockAuthUser = (globalThis as unknown as { __mockAuthUser: { email: string } }).__mockAuthUser;
const STORED = { mockLocation: { label: 'Penn Station', latitude: 40.7506, longitude: -73.9935 }, overlays: { ids: true, tapCoords: false } };

function Probe() {
  const debug = useDebug();
  return <Text testID="probe">{JSON.stringify({ isAdmin: debug.isAdmin, mock: debug.mockLocation?.label ?? null, ids: debug.overlays.ids })}</Text>;
}

const renderProbe = () => render(<AuthProvider><DebugProvider><Probe /></DebugProvider></AuthProvider>);
const probe = (screen: ReturnType<typeof render>) => JSON.parse(String(screen.getByTestId('probe').props.children));

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('recognizes admin emails case-insensitively', () => {
  expect(isAdminEmail('admin@gmail.com')).toBe(true);
  expect(isAdminEmail('ADMIN@gmail.com')).toBe(true);
  expect(isAdminEmail('rider@example.com')).toBe(false);
  expect(isAdminEmail(null)).toBe(false);
});

it("ignores stored overrides for a rider, even on a device that has them", async () => {
  await AsyncStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(STORED));
  const screen = renderProbe();
  await act(async () => undefined);
  expect(probe(screen)).toEqual({ isAdmin: false, mock: null, ids: false });
  expect(isRequestLogEnabled()).toBe(false);
  recordRequest({ name: 'planTrip', startedAt: 0, ms: 1, ok: true, request: {} });
  expect(getRequestLog()).toHaveLength(0);
});

it('loads stored overrides for the admin', async () => {
  mockAuthUser.email = 'admin@gmail.com';
  await AsyncStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(STORED));
  const screen = renderProbe();
  await waitFor(() => expect(probe(screen)).toEqual({ isAdmin: true, mock: 'Penn Station', ids: true }));
  expect(isRequestLogEnabled()).toBe(true);
});

it('clears overrides when the admin signs out', async () => {
  mockAuthUser.email = 'admin@gmail.com';
  await AsyncStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(STORED));
  let emit: (user: unknown) => void = () => undefined;
  (onAuthStateChanged as jest.Mock).mockImplementationOnce((_auth, callback) => {
    emit = callback;
    callback(mockAuthUser);
    return () => undefined;
  });
  const screen = renderProbe();
  await waitFor(() => expect(probe(screen).mock).toBe('Penn Station'));
  act(() => emit(null));
  await waitFor(() => expect(AsyncStorage.getItem(DEBUG_STORAGE_KEY)).resolves.toBeNull());
});

it('keeps mock time ticking from when it was set', async () => {
  mockAuthUser.email = 'admin@gmail.com';
  const handle: { setMockTime: (at: number | undefined) => void } = { setMockTime: () => undefined };
  function Setter() {
    const { setMockTime: set } = useDebug();
    useEffect(() => {
      handle.setMockTime = set;
    });
    return null;
  }
  const setMockTime = (at: number | undefined) => handle.setMockTime(at);
  render(<AuthProvider><DebugProvider><Setter /></DebugProvider></AuthProvider>);
  await act(async () => undefined);
  const target = Date.parse('2026-10-15T06:30:00Z');
  act(() => setMockTime(target));
  expect(Math.abs(appNow() - target)).toBeLessThan(1000);
  act(() => setMockTime(undefined));
  expect(Math.abs(appNow() - Date.now())).toBeLessThan(1000);
});

describe('request log', () => {
  const { planTrip } = jest.requireActual<typeof import('../src/data/tripPlanning')>('../src/data/tripPlanning');
  const plan = () => planTrip({
    endpoints: { origin: 'Current location', destination: 'Penn Station', destinationPlace: { id: 'penn', title: 'Penn Station', subtitle: '', location: { latitude: 40.7506, longitude: -73.9935 } } },
    location: { latitude: 40.9126, longitude: -73.1234 },
    time: { mode: 'now' },
    preference: 'fastest',
    modes: ['subway', 'bus', 'rail'],
    refresh: true,
  });

  it("records an admin's trip plan with its duration, outcome, and a summary", async () => {
    mockAuthUser.email = 'admin@gmail.com';
    renderProbe();
    await act(async () => undefined);
    const result = await plan();
    expect(result.ok).toBe(true);
    expect(isRequestLogEnabled()).toBe(true);
    const [entry] = getRequestLog();
    expect(entry).toMatchObject({ name: 'planTrip', ok: true, request: { destination: { label: 'Penn Station', lat: 40.7506 } } });
    expect(entry!.ms).toBeGreaterThanOrEqual(0);
    expect(entry!.responseSummary).toMatchObject({ count: expect.any(Number) });
  });

  it("keeps nothing for a rider's trip plan", async () => {
    renderProbe();
    await act(async () => undefined);
    await plan();
    expect(getRequestLog()).toHaveLength(0);
  });
});
