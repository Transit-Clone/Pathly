import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, createStyles as createProfileStyles, Header, SettingRow, ToggleRow } from '../components/ProfileView';
import { PressableScale } from '../components/PressableScale';
import { refreshLiveDataNow } from '../data/TransitLiveContext';
import { LIVE_CACHE_KEY, NEARBY_CACHE_KEY } from '../data/deviceCache';
import { clearTripPlanCache } from '../data/tripPlanning';
import { callable } from '../lib/firebase';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { appNow, useDebug } from './DebugContext';
import { mockTimePresets, parseMockTime } from './mockTimes';
import { MOCK_LOCATION_PRESETS } from './presets';
import { getRequestLog, subscribeRequestLog, type RequestLogEntry } from './requestLog';
import { radii } from '../theme/shape';

type AgencyStatus = {
  agencyId: string;
  displayName: string;
  snapshot: { state: 'published'; version: string; publishedAt: string; serviceEndDate: string | null } | { state: 'missing' } | { state: 'invalid' | 'error'; message: string };
  ageHours?: number;
  lastRefresh: { at: string; ok: boolean; result?: string; message?: string } | null;
  live: { configured: boolean; ok?: boolean; ms?: number; status?: number };
};
type BackendStatus = { checkedAt: string; agencies: AgencyStatus[]; myRateLimits: Record<string, { remaining: number; perMinute: number }> };

const getBackendStatus = callable<undefined, BackendStatus>('getBackendStatus', (status) => ({ agencies: status.agencies.length }));

const clock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Web copies to the clipboard; native has no clipboard module here, so it opens the share sheet. */
async function copyText(text: string): Promise<string> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return 'Copied';
  }
  await Share.share({ message: text });
  return 'Shared';
}

function snapshotLine(agency: AgencyStatus): string {
  const { snapshot } = agency;
  if (snapshot.state === 'published') return `Timetable ${snapshot.version.slice(0, 8)} · ${agency.ageHours ?? '?'} h old`;
  if (snapshot.state === 'missing') return 'No published timetable';
  return `Timetable problem: ${snapshot.message}`;
}

function liveLine(live: AgencyStatus['live']): string {
  if (!live.configured) return 'Live feed not configured';
  return live.ok ? `Live feed OK · ${live.ms} ms` : `Live feed failing${live.status ? ` (${live.status})` : ''}`;
}

function RequestRow({ entry }: { entry: RequestLogEntry }) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const json = JSON.stringify({ name: entry.name, at: new Date(entry.startedAt).toISOString(), ms: entry.ms, ok: entry.ok, code: entry.code, request: entry.request, response: entry.responseSummary }, null, 2);
  return (
    <View style={styles.requestRow} testID={`admin-request-${entry.id}`}>
      <PressableScale accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={styles.requestHead}>
        <Text style={[styles.requestStatus, !entry.ok && styles.requestFailed]}>{entry.ok ? 'OK' : entry.code ?? 'ERR'}</Text>
        <Text numberOfLines={1} style={styles.requestName}>{entry.name}</Text>
        <Text style={styles.requestMs}>{`${entry.ms} ms`}</Text>
      </PressableScale>
      {open ? (
        <View>
          <Text selectable={true} style={styles.json}>{json}</Text>
          <PressableScale accessibilityRole="button" onPress={() => { void copyText(json).then(setNote, () => setNote('Could not copy')); }} style={styles.smallButton} testID={`admin-request-copy-${entry.id}`}>
            <Text style={styles.smallButtonText}>{note || (Platform.OS === 'web' ? 'Copy JSON' : 'Share JSON')}</Text>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

type AdminToolsViewProps = { onBack: () => void; onPickMockLocation: () => void };

/** The admin's testing and diagnostics screen (Profile → Admin tools). */
export function AdminToolsView({ onBack, onPickMockLocation }: AdminToolsViewProps) {
  const profile = useThemedStyles(createProfileStyles);
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const debug = useDebug();
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState<{ state: 'loading' } | { state: 'loaded'; data: BackendStatus } | { state: 'error'; message: string }>({ state: 'loading' });
  // Preset times are computed from when the screen opened.
  const [openedAt] = useState(() => Date.now());
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const requests = useSyncExternalStore(subscribeRequestLog, getRequestLog, getRequestLog);

  const fetchStatus = useCallback(() => getBackendStatus().then(
    ({ data }) => setStatus({ state: 'loaded', data }),
    (error: unknown) => setStatus({ state: 'error', message: (error as { message?: string } | null)?.message ?? 'Request failed' }),
  ), []);
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);
  const loadStatus = () => {
    setStatus({ state: 'loading' });
    void fetchStatus();
  };

  const clearDeviceCache = async () => {
    const disposableKeys = new Set([NEARBY_CACHE_KEY, LIVE_CACHE_KEY]);
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => disposableKeys.has(key));
    await AsyncStorage.multiRemove(keys);
    setFeedback(`Cleared ${keys.length} saved ${keys.length === 1 ? 'item' : 'items'} from this device`);
  };

  const setCustom = () => {
    const at = parseMockTime(customDate, customTime);
    if (at === null) {
      setFeedback('Enter a date like 2026-10-15 and a time like 23:30');
      return;
    }
    debug.setMockTime(at);
    setFeedback(`Mock time set to ${clock.format(at)}`);
  };

  return (
    <View style={profile.viewport}>
      <SafeAreaView edges={['top', 'bottom']} style={profile.screen} testID="admin-tools">
        <ThemedStatusBar />
        <Header onBack={onBack} testID="admin-tools-back" title="Admin tools" />
        <ScrollView contentContainerStyle={profile.pageContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={profile.intro}>Testing tools for this admin account only. Overrides stay on this device until turned off.</Text>

          <Text style={profile.sectionLabel}>MOCK LOCATION</Text>
          <Card>
            <SettingRow detail={debug.mockLocation ? `${debug.mockLocation.latitude.toFixed(5)}, ${debug.mockLocation.longitude.toFixed(5)}` : 'Using the real location. Long-press the home map to pick a spot.'} label={debug.mockLocation ? debug.mockLocation.label : 'Off'} testID="admin-mock-location-current" />
            {MOCK_LOCATION_PRESETS.map((preset) => (
              <SettingRow
                key={preset.label}
                label={preset.label}
                onPress={() => {
                  debug.setMockLocation(preset);
                  setFeedback(`Mock location set to ${preset.label}`);
                }}
                testID={`admin-mock-location-${preset.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              />
            ))}
            <SettingRow detail="Any place from search" label="Search a place" onPress={onPickMockLocation} testID="admin-mock-location-search" />
            {debug.mockLocation ? <SettingRow label="Turn off mock location" onPress={() => debug.setMockLocation(undefined)} testID="admin-mock-location-off" /> : null}
          </Card>

          <Text style={profile.sectionLabel}>MOCK TIME</Text>
          <Card>
            <SettingRow detail={debug.mockTime ? 'Trip planning and times follow this clock. Live predictions stay real-time.' : 'Using the real time.'} label={debug.mockTime ? clock.format(appNow()) : 'Off'} testID="admin-mock-time-current" />
            {mockTimePresets(openedAt).map((preset) => (
              <SettingRow
                key={preset.label}
                detail={clock.format(preset.at)}
                label={preset.label}
                onPress={() => {
                  debug.setMockTime(preset.at);
                  setFeedback(`Mock time set to ${clock.format(preset.at)}`);
                }}
                testID={`admin-mock-time-${preset.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}`}
              />
            ))}
            <View style={styles.customTime}>
              <TextInput accessibilityLabel="Mock date, year-month-day" autoCapitalize="none" onChangeText={setCustomDate} placeholder="2026-10-15" placeholderTextColor={colors.mutedInk} style={styles.input} testID="admin-mock-date" value={customDate} />
              <TextInput accessibilityLabel="Mock time, 24-hour" autoCapitalize="none" onChangeText={setCustomTime} placeholder="23:30" placeholderTextColor={colors.mutedInk} style={styles.input} testID="admin-mock-clock" value={customTime} />
              <PressableScale accessibilityRole="button" onPress={setCustom} style={styles.smallButton} testID="admin-mock-time-set"><Text style={styles.smallButtonText}>Set</Text></PressableScale>
            </View>
            {debug.mockTime ? <SettingRow label="Turn off mock time" onPress={() => debug.setMockTime(undefined)} testID="admin-mock-time-off" /> : null}
          </Card>

          <Text style={profile.sectionLabel}>BACKEND STATUS</Text>
          <Card>
            {status.state === 'loading' ? <SettingRow label="Checking the backend…" /> : null}
            {status.state === 'error' ? <SettingRow detail={status.message} label="Couldn't load backend status" onPress={loadStatus} testID="admin-status-retry" /> : null}
            {status.state === 'loaded' ? status.data.agencies.map((agency) => (
              <View key={agency.agencyId} style={profile.settingRow} testID={`admin-status-${agency.agencyId}`}>
                <View style={profile.rowCopy}>
                  <Text style={profile.settingText}>{agency.displayName}</Text>
                  <Text style={profile.settingDetail}>{snapshotLine(agency)}</Text>
                  <Text style={profile.settingDetail}>{agency.lastRefresh ? `Last refresh ${agency.lastRefresh.ok ? agency.lastRefresh.result ?? 'OK' : `failed: ${agency.lastRefresh.message ?? ''}`} · ${clock.format(Date.parse(agency.lastRefresh.at))}` : 'No refresh recorded'}</Text>
                  <Text style={[profile.settingDetail, agency.live.configured && agency.live.ok === false ? styles.bad : null]}>{liveLine(agency.live)}</Text>
                </View>
              </View>
            )) : null}
            {status.state === 'loaded' ? <SettingRow detail={`Checked ${clock.format(Date.parse(status.data.checkedAt))}`} label="Check again" onPress={loadStatus} testID="admin-status-refresh" /> : null}
          </Card>

          <Text style={profile.sectionLabel}>RECENT REQUESTS</Text>
          <Card>
            {requests.length === 0 ? <SettingRow detail="Backend calls made by this app appear here." label="No requests yet" /> : requests.map((entry) => <RequestRow entry={entry} key={entry.id} />)}
          </Card>

          <Text style={profile.sectionLabel}>CACHES</Text>
          <Card>
            <SettingRow detail="Saved nearby list and live times" label="Clear device cache" onPress={() => { void clearDeviceCache(); }} testID="admin-clear-device-cache" />
            <SettingRow detail="Plans remembered for two minutes" label="Clear trip-plan cache" onPress={() => { clearTripPlanCache(); setFeedback('Trip-plan cache cleared'); }} testID="admin-clear-trip-cache" />
            <SettingRow detail="Asks for every route on screen again" label="Refresh live data now" onPress={() => { refreshLiveDataNow(); setFeedback('Live data refresh requested'); }} testID="admin-refresh-live" />
          </Card>

          <Text style={profile.sectionLabel}>OVERLAYS</Text>
          <Card>
            <ToggleRow detail="On route and trip details" label="Show route, stop, and trip IDs" onChange={(value) => debug.setOverlay('ids', value)} testID="admin-overlay-ids" value={debug.overlays.ids} />
            <ToggleRow detail="Tap the home map to see coordinates" label="Show map tap coordinates" onChange={(value) => debug.setOverlay('tapCoords', value)} testID="admin-overlay-tap-coords" value={debug.overlays.tapCoords} />
          </Card>

          <Text style={profile.sectionLabel}>RATE LIMITS</Text>
          <Card>
            {status.state === 'loaded'
              ? Object.entries(status.data.myRateLimits).map(([name, limit]) => <SettingRow detail={`${limit.remaining} of ${limit.perMinute} per minute left`} key={name} label={name} testID={`admin-rate-${name}`} />)
              : <SettingRow label="Shown with backend status" />}
          </Card>

          {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback} testID="admin-feedback">{feedback}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  customTime: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  input: { flex: 1, minHeight: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, color: colors.ink, backgroundColor: colors.background, ...typography.body },
  smallButton: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, marginVertical: 6, borderRadius: radii.pill, backgroundColor: colors.primary },
  smallButtonText: { color: colors.onPrimary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  requestRow: { paddingHorizontal: 15, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  requestHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  requestStatus: { minWidth: 34, color: colors.success, fontFamily: fontFamilies.extraBold, fontSize: 12 },
  requestFailed: { color: colors.red },
  requestName: { flex: 1, color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  requestMs: { color: colors.mutedInk, ...typography.metadata },
  json: { marginTop: 6, padding: 10, borderRadius: radii.control, backgroundColor: colors.background, color: colors.ink, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 11 },
  bad: { color: colors.red },
  feedback: { marginTop: 16, color: colors.primary, ...typography.bodyStrong, textAlign: 'center' },
});
