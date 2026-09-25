import { StyleSheet, View } from 'react-native';

type LiveSignalProps = {
  color?: string;
};

export function LiveSignal({ color = '#FFFFFF' }: LiveSignalProps) {
  return (
    <View
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
      style={styles.signal}
      testID="live-gps-signal"
    >
      <View style={[styles.bar, styles.barShort, { backgroundColor: color }]} />
      <View style={[styles.bar, styles.barMedium, { backgroundColor: color }]} />
      <View style={[styles.bar, styles.barTall, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  signal: {
    height: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    marginLeft: 5,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
  barShort: { height: 5 },
  barMedium: { height: 9 },
  barTall: { height: 13 },
});
