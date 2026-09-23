import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

export type TransitAccent = 'blue' | 'green' | 'red';

export type TransitCardProps = {
  accent: TransitAccent;
  arrival: string;
  detail: string;
  mode: string;
  onPress?: () => void;
  route: string;
  status: string;
  subtitle: string;
  testID?: string;
  title: string;
};

const accentColors: Record<TransitAccent, string> = {
  blue: colors.blue,
  green: colors.green,
  red: colors.red,
};

const accentSoftColors: Record<TransitAccent, string> = {
  blue: colors.blueSoft,
  green: colors.greenSoft,
  red: colors.redSoft,
};

export function TransitCard({
  accent,
  arrival,
  detail,
  mode,
  onPress,
  route,
  status,
  subtitle,
  testID,
  title,
}: TransitCardProps) {
  const accentColor = accentColors[accent];

  return (
    <Pressable
      accessibilityHint={onPress ? 'Opens route details' : undefined}
      accessibilityLabel={`${mode} ${route}. ${title}, ${subtitle}. ${arrival}, ${detail}. ${status}.`}
      accessibilityRole={onPress ? 'button' : undefined}
      accessible={true}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && onPress ? styles.pressedCard : null,
      ]}
      testID={testID}
    >
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={[styles.routeBadge, { backgroundColor: accentColor }]}>
        <Text style={styles.routeText}>{route}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.modeRow}>
          <Text numberOfLines={1} style={styles.mode}>
            {mode}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.timing}>
        <Text style={[styles.arrival, { color: accentColor }]}>{arrival}</Text>
        <Text style={styles.detail}>{detail}</Text>
        <View
          style={[
            styles.statusChip,
            { backgroundColor: accentSoftColors[accent] },
          ]}
        >
          <Text numberOfLines={1} style={[styles.status, { color: accentColor }]}>
            {status}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  pressedCard: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  accent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 5,
  },
  routeBadge: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  routeText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  body: {
    minWidth: 0,
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  mode: {
    flexShrink: 1,
    color: colors.mutedInk,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.75,
  },
  title: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 3,
    color: colors.mutedInk,
    fontSize: 11,
  },
  timing: {
    width: 96,
    alignItems: 'flex-end',
  },
  arrival: {
    fontSize: 15,
    fontWeight: '900',
  },
  detail: {
    marginTop: 2,
    color: colors.mutedInk,
    fontSize: 10,
    fontWeight: '600',
  },
  statusChip: {
    maxWidth: 96,
    marginTop: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  status: {
    fontSize: 10,
    fontWeight: '800',
  },
});
