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
      <View style={[styles.arc, styles.outerArc, { borderColor: color }]} />
      <View style={[styles.arc, styles.innerArc, { borderColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  signal: {
    position: 'relative',
    width: 17,
    height: 15,
    marginTop: -8,
    marginLeft: 2,
  },
  arc: {
    position: 'absolute',
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 0,
  },
  outerArc: {
    top: 0,
    right: 0,
    width: 16,
    height: 9,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  innerArc: {
    top: 5,
    right: 4,
    width: 8,
    height: 5,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  dot: {
    position: 'absolute',
    right: 7,
    bottom: 0,
    width: 3,
    height: 3,
    borderRadius: 2,
  },
});
