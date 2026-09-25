import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors } from '../theme/colors';
import { fontFamilies } from '../theme/typography';

const localRoads: ViewStyle[] = [
  { left: '-18%', top: '16%', width: '82%', transform: [{ rotate: '-16deg' }] },
  { right: '-16%', top: '25%', width: '90%', transform: [{ rotate: '28deg' }] },
  { left: '-8%', top: '43%', width: '118%', transform: [{ rotate: '-4deg' }] },
  { left: '15%', top: '4%', width: '84%', transform: [{ rotate: '69deg' }] },
  { right: '-20%', top: '52%', width: '96%', transform: [{ rotate: '-39deg' }] },
  { left: '-28%', top: '65%', width: '99%', transform: [{ rotate: '31deg' }] },
];

const routeLines: (ViewStyle & { backgroundColor: string })[] = [
  {
    backgroundColor: colors.primary,
    left: '-14%',
    opacity: 0.65,
    top: '31%',
    width: '78%',
    transform: [{ rotate: '12deg' }],
  },
  {
    backgroundColor: colors.red,
    right: '-18%',
    opacity: 0.6,
    top: '39%',
    width: '82%',
    transform: [{ rotate: '-24deg' }],
  },
];

export function MapBackdrop() {
  return (
    <View
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.backdrop]}
    >
      <View style={styles.land} />

      {localRoads.map((roadStyle, index) => (
        <View key={`road-${index}`} style={[styles.road, roadStyle]} />
      ))}

      <View style={[styles.park, styles.parkNorth]} />
      <View style={[styles.park, styles.parkSouth]} />
      <View style={[styles.water, styles.waterRight]} />

      {routeLines.map((routeStyle, index) => (
        <View key={`route-${index}`} style={[styles.route, routeStyle]} />
      ))}

      <Text style={[styles.mapLabel, styles.labelNorth]}>Huntington</Text>
      <Text style={[styles.mapLabel, styles.labelWest]}>Deer Park</Text>
      <Text style={[styles.mapLabel, styles.labelEast]}>Brentwood</Text>
      <Text style={[styles.roadLabel, styles.mainStreetLabel]}>MAIN STREET</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    pointerEvents: 'none',
  },
  land: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.canvas,
  },
  road: {
    position: 'absolute',
    height: 12,
    borderColor: colors.road,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    backgroundColor: colors.roadHighlight,
  },
  route: {
    position: 'absolute',
    height: 4,
    borderRadius: 999,
  },
  park: {
    position: 'absolute',
    backgroundColor: '#DFF2E5',
    borderRadius: 28,
    opacity: 0.7,
  },
  parkNorth: {
    width: 134,
    height: 92,
    top: 132,
    right: -28,
    transform: [{ rotate: '-12deg' }],
  },
  parkSouth: {
    width: 106,
    height: 72,
    top: 335,
    left: -34,
    transform: [{ rotate: '18deg' }],
  },
  water: {
    position: 'absolute',
    backgroundColor: '#DDEFF8',
    opacity: 0.8,
  },
  waterRight: {
    width: 74,
    height: 240,
    top: 64,
    right: -44,
    borderRadius: 36,
    transform: [{ rotate: '13deg' }],
  },
  mapLabel: {
    position: 'absolute',
    color: colors.mutedInk,
    fontFamily: fontFamilies.semibold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  labelNorth: {
    top: 128,
    left: '36%',
  },
  labelWest: {
    top: 286,
    left: 30,
  },
  labelEast: {
    top: 348,
    right: 34,
  },
  roadLabel: {
    position: 'absolute',
    color: '#7F91A5',
    fontFamily: fontFamilies.bold,
    fontSize: 8,
    letterSpacing: 1.5,
  },
  mainStreetLabel: {
    top: 252,
    right: 96,
    transform: [{ rotate: '-4deg' }],
  },
});
