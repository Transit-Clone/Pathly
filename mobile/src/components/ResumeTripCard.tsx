import { StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { radii } from '../theme/shape';

type ResumeTripCardProps = {
  destination: string;
  instruction?: string;
  onResume: () => void;
};

/** A persistent way back to navigation after the rider leaves the enroute screen. */
export function ResumeTripCard({ destination, instruction, onResume }: ResumeTripCardProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityHint="Returns to active navigation"
      accessibilityLabel={`Resume trip to ${destination}${instruction ? `, ${instruction}` : ''}`}
      accessibilityRole="button"
      onPress={onResume}
      style={styles.card}
      testID="resume-active-trip"
    >
      <View style={styles.icon}><Icon color={colors.onPrimary} name="go" size={18} /></View>
      <View style={styles.copy}>
        <Text style={styles.label}>ACTIVE TRIP</Text>
        <Text numberOfLines={1} style={styles.destination}>{destination}</Text>
        {instruction ? <Text numberOfLines={1} style={styles.instruction}>{instruction}</Text> : null}
      </View>
      <View style={styles.resumePill}><Text style={styles.resumeText}>Resume</Text></View>
    </PressableScale>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  card: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 7,
  },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.primary },
  copy: { flex: 1, minWidth: 0 },
  label: { color: colors.primary, ...typography.label },
  destination: { marginTop: 1, color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  instruction: { color: colors.mutedInk, ...typography.metadata },
  resumePill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: colors.blueSoft },
  resumeText: { color: colors.primary, ...typography.bodyStrong, fontSize: 13 },
});
