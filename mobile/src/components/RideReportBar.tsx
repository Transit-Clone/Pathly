import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import type { RideFix } from '../data/rideDetection';
import { RIDE_REPORTS, sendRideReport, type RideReportKind } from '../data/rideReports';
import type { LiveSource } from '../data/transit';
import { useAppSettings, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { radii } from '../theme/shape';
import { typography } from '../theme/typography';
import { PressableScale } from './PressableScale';

type RideReportBarProps = {
  fix: RideFix | null;
  source: Pick<LiveSource, 'agencyId' | 'routeId'>;
  tripId: string;
};

/** One tap to tell other riders how this ride is going. Keyed by vehicle where it's used, so each ride starts fresh. */
function ReportBar({ fix, source, tripId }: RideReportBarProps) {
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const [sent, setSent] = useState<readonly RideReportKind[]>([]);
  const [problem, setProblem] = useState('');
  if (!user || user.isAnonymous) return null;

  const send = async (kind: RideReportKind) => {
    setProblem('');
    if (!fix) {
      setProblem('We need your location to confirm you’re on board.');
      return;
    }
    // Shown right away: on a train, waiting on the network is the slow part.
    const previous = sent;
    setSent([...sent.filter((other) => !(kind === 'seats' && other === 'packed') && !(kind === 'packed' && other === 'seats')), kind]);
    const accepted = await sendRideReport(source, tripId, kind, fix).catch(() => null);
    if (accepted) return;
    setSent(previous);
    setProblem(accepted === false ? 'That didn’t go through. Your location doesn’t match this vehicle.' : 'That didn’t go through. Check your connection.');
  };

  return (
    <View style={styles.bar} testID="ride-report-bar">
      <Text style={styles.title}>How’s this ride?</Text>
      <View style={styles.chips}>
        {RIDE_REPORTS.map(({ kind, label }) => {
          const selected = sent.includes(kind);
          return (
            <PressableScale accessibilityRole="button" accessibilityState={{ selected }} key={kind} onPress={() => void send(kind)} style={[styles.chip, selected && styles.chipSelected]} testID={`ride-report-${kind}`}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
            </PressableScale>
          );
        })}
      </View>
      <Text accessibilityLiveRegion="polite" style={problem ? styles.problem : styles.note} testID="ride-report-note">
        {problem || (sent.length > 0 ? 'Thanks! Other riders can see this for 20 minutes.' : 'Anonymous. Your location only confirms you’re on board and isn’t saved.')}
      </Text>
    </View>
  );
}

/** How a ride is going, one tap at a time; left out of Easy mode. */
export function RideReportBar(props: Parameters<typeof ReportBar>[0]) {
  const { easyMode } = useAppSettings();
  return easyMode ? null : <ReportBar {...props} />;
}

const createStyles = (colors: Palette) => StyleSheet.create({
  bar: { gap: 8 },
  title: { color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.surface },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { color: colors.ink, ...typography.bodyStrong, fontSize: 13 },
  chipTextSelected: { color: colors.onPrimary },
  note: { color: colors.mutedInk, ...typography.metadata, fontSize: 12 },
  problem: { color: colors.red, ...typography.metadata, fontSize: 12 },
});
