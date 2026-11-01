import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { BeanAvatar } from '../avatars/BeanAvatarImage';
import { formatAge } from '../data/liveTrains';
import { nearRider } from '../data/rideDetection';
import { distanceMeters } from '../data/rideGeometry';
import { rideReportLabel } from '../data/rideReports';
import type { RideFix } from '../data/rideDetection';
import { feedVehicles } from '../data/rideTracking';
import type { LiveSource } from '../data/transit';
import type { RouteLiveVehicle } from '../data/transitLive';
import { useDebug } from '../debug/DebugContext';
import { useNow } from '../hooks/useNow';
import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { radii } from '../theme/shape';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { RideReportBar } from './RideReportBar';
import type { TransitMode } from './RouteBadge';

const NOUNS: Record<TransitMode, string> = { bus: 'bus', subway: 'train', rail: 'train', ferry: 'boat' };

/** "You and 2 other riders", or null when nobody's sharing. */
export function ridersLabel(riders: RouteLiveVehicle['riders']): string | null {
  if (!riders || riders.count === 0) return null;
  const others = riders.count - (riders.you ? 1 : 0);
  const otherText = `${others} ${others === 1 ? 'rider' : 'riders'}`;
  if (!riders.you) return `${otherText} on board`;
  return others > 0 ? `You and ${others} other ${others === 1 ? 'rider' : 'riders'} on board` : 'You’re on board';
}

type VehicleSheetProps = {
  /** The vehicle the rider's location says they're on, even with sharing off: they can report on it. */
  onBoardTripId?: string | null;
  reportFix?: RideFix | null;
  reportSource?: Pick<LiveSource, 'agencyId' | 'routeId'>;
  color: string;
  destination: string;
  lineName: string;
  /** The line's feed, for an admin to Ride Along with this vehicle. */
  liveSource?: LiveSource;
  mode: TransitMode;
  onClaim: (tripId: string) => void;
  onClose: () => void;
  onDismiss: (tripId: string) => void;
  /** The rider's position, when known: offers "I'm on this" only when they're near the vehicle. */
  riderAt?: { lat: number; lon: number } | null;
  ridingTripId: string | null;
  sharingEnabled: boolean;
  stops: readonly { name: string; lat: number; lon: number }[];
  vehicle: RouteLiveVehicle | null;
};

/** A tapped vehicle, from the bottom: where it's going, how we know where it is, and who's on it. */
export function VehicleSheet({ color, destination, lineName, liveSource, mode, onClaim, onClose, onBoardTripId = null, onDismiss, reportFix = null, reportSource, riderAt, ridingTripId, sharingEnabled, stops, vehicle }: VehicleSheetProps) {
  const styles = useThemedStyles(createStyles);
  const now = useNow(1000);
  const riding = vehicle != null && vehicle.tripId === ridingTripId;
  const riders = vehicle?.riders;
  const onBoard = ridersLabel(riders);
  const nearestStop = vehicle && stops.length > 0
    ? stops.reduce((best, stop) => (distanceMeters(stop, vehicle) < distanceMeters(best, vehicle) ? stop : best))
    : null;
  const age = vehicle?.updatedAt != null ? `${formatAge(now - vehicle.updatedAt)} ago` : null;
  const canClaim = vehicle != null && sharingEnabled && !riding && riderAt != null && nearRider(feedVehicles([vehicle])[0]!, riderAt, now);
  const { isAdmin, rideAlong, setMockLocation, startRideAlong } = useDebug();
  const ridingAlong = vehicle != null && rideAlong?.tripId === vehicle.tripId;
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={true} visible={vehicle != null}>
      <Pressable accessibilityLabel="Close vehicle details" onPress={onClose} style={styles.backdrop} testID="vehicle-sheet-backdrop" />
      {vehicle ? (
        <View style={styles.sheet} testID="vehicle-sheet">
          <View style={styles.header}>
            <View style={styles.modeCircle}><Icon color={color} name={mode} size={24} /></View>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{`${lineName} ${NOUNS[mode]}`}</Text>
              <Text numberOfLines={1} style={styles.subtitle}>{`To ${destination}`}</Text>
            </View>
            <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onClose} testID="vehicle-sheet-close"><Icon name="close" size={26} /></PressableScale>
          </View>

          {onBoard && riders ? (
            <View style={styles.row} testID="vehicle-sheet-riders">
              <View style={styles.avatars}>
                {riders.avatars.map((avatar, index) => (
                  <View key={index} style={[styles.avatarDisc, index > 0 && styles.avatarStacked, { zIndex: riders.avatars.length - index }]}>
                    <BeanAvatar config={avatar} size={28} />
                  </View>
                ))}
              </View>
              <Text style={styles.rowText}>{onBoard}</Text>
            </View>
          ) : null}
          {vehicle.reports?.length ? (
            <View style={styles.row} testID="vehicle-sheet-reports">
              <Icon name="people" size={20} />
              <Text style={styles.rowText}>{vehicle.reports.map((report) => (report.count > 1 ? `${rideReportLabel(report.kind)} (${report.count})` : rideReportLabel(report.kind))).join(', ')}</Text>
            </View>
          ) : null}
          {nearestStop ? (
            <View style={styles.row} testID="vehicle-sheet-near">
              <Icon name="place" size={20} />
              <Text style={styles.rowText}>{`Near ${nearestStop.name}`}</Text>
            </View>
          ) : null}
          <View style={styles.row} testID="vehicle-sheet-source">
            <Icon name={riders ? 'people' : 'time'} size={20} />
            <Text style={styles.rowText}>{`${riders ? 'Location from riders on board' : 'Location from the agency'}${age ? `, ${age}` : ''}`}</Text>
          </View>

          {reportSource && (riding || vehicle.tripId === onBoardTripId) ? <RideReportBar fix={reportFix} key={vehicle.tripId} source={reportSource} tripId={vehicle.tripId} /> : null}
          {riding ? (
            <PressableScale accessibilityRole="button" onPress={() => { onDismiss(vehicle.tripId); onClose(); }} style={[styles.button, styles.secondaryButton]} testID="vehicle-sheet-not-on">
              <Text style={styles.secondaryButtonText}>{`I’m not on this ${NOUNS[mode]}`}</Text>
            </PressableScale>
          ) : canClaim ? (
            <PressableScale accessibilityRole="button" onPress={() => { onClaim(vehicle.tripId); onClose(); }} style={[styles.button, { backgroundColor: color }]} testID="vehicle-sheet-on">
              <Text style={styles.primaryButtonText}>{`I’m on this ${NOUNS[mode]}`}</Text>
            </PressableScale>
          ) : null}
          {isAdmin && liveSource ? (
            <PressableScale
              accessibilityHint="Admin testing: your mock location follows this vehicle's feed position"
              accessibilityRole="button"
              onPress={() => {
                if (ridingAlong) setMockLocation(undefined);
                else {
                  const { lat, lon } = feedVehicles([vehicle])[0]!;
                  startRideAlong({ source: liveSource, tripId: vehicle.tripId, label: `Riding along · ${lineName} ${NOUNS[mode]}` }, { lat, lon });
                }
                onClose();
              }}
              style={[styles.button, styles.secondaryButton]}
              testID="vehicle-sheet-ride-along"
            >
              <Text style={styles.secondaryButtonText}>{ridingAlong ? 'Stop riding along' : 'Ride along (admin)'}</Text>
            </PressableScale>
          ) : null}
          <Text style={styles.note} testID="vehicle-sheet-note">
            {sharingEnabled
              ? 'Other riders see your avatar here, never your name. Your location is erased soon after you get off.'
              : 'Turn on Share my rides in Settings, Privacy to help place vehicles for other riders.'}
          </Text>
        </View>
      ) : null}
    </Modal>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 34,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeCircle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surfaceMuted },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, ...typography.screenHeading, fontSize: 21 },
  subtitle: { color: colors.mutedInk, ...typography.metadata },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { flex: 1, color: colors.ink, ...typography.bodyStrong },
  avatars: { flexDirection: 'row' },
  avatarDisc: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: '#FFFFFF' },
  avatarStacked: { marginLeft: -12 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  secondaryButton: { backgroundColor: colors.surfaceMuted },
  primaryButtonText: { color: '#FFFFFF', fontFamily: fontFamilies.extraBold, fontSize: 15 },
  secondaryButtonText: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 15 },
  note: { color: colors.mutedInk, ...typography.metadata },
});
