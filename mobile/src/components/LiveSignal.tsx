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
    </View>
  );
}

const styles = StyleSheet.create({
  signal: {
    position: 'relative',
    width: 11,
    height: 9,
    marginTop: -9,
    marginLeft: 1,
    transform: [{ rotate: '45deg' }],
  },
  arc: {
    position: 'absolute',
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 0,
  },
  outerArc: {
    top: 0,
    right: 0,
    width: 11,
    height: 6,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  innerArc: {
    top: 4,
    right: 3,
    width: 6,
    height: 4,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
});
