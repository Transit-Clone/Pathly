import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  departureOptions,
  type DepartureOption,
  ronkonkomaRoute,
} from '../data/ronkonkomaRoute';
import { colors } from '../theme/colors';

type RonkonkomaRouteViewProps = {
  onBack: () => void;
};

const mapStationLabels = [
  'Stony Brook',
  'St. James',
  'Smithtown',
  'Kings Park',
  'Northport',
];

export function RonkonkomaRouteView({ onBack }: RonkonkomaRouteViewProps) {
  const { height } = useWindowDimensions();
  const [selectedDeparture, setSelectedDeparture] =
    useState<DepartureOption>('10:00 AM');
  const mapHeight = Math.min(390, Math.max(290, height * 0.39));

  return (
    <View style={styles.viewport}>
      <View style={styles.screen} testID="ronkonkoma-route-view">
        <StatusBar style="dark" />
        <View
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
          style={[styles.map, { height: mapHeight }]}
        >
          <View style={[styles.road, styles.roadOne]} />
          <View style={[styles.road, styles.roadTwo]} />
          <View style={[styles.road, styles.roadThree]} />
          <View style={[styles.water, styles.waterOne]} />
          <View style={[styles.water, styles.waterTwo]} />
          <Text style={[styles.placeLabel, styles.placeLabelOne]}>STONY BROOK</Text>
          <Text style={[styles.placeLabel, styles.placeLabelTwo]}>SMITHTOWN</Text>

          <View style={styles.routeLine}>
            <View style={[styles.routeSegment, styles.routeSegmentOne]} />
            <View style={[styles.routeSegment, styles.routeSegmentTwo]} />
            <View style={[styles.routeSegment, styles.routeSegmentThree]} />
            <View style={[styles.routeSegment, styles.routeSegmentFour]} />
            {mapStationLabels.map((station, index) => (
              <View
                key={station}
                style={[
                  styles.mapStop,
                  index === 0 && styles.mapStopOne,
                  index === 1 && styles.mapStopTwo,
                  index === 2 && styles.mapStopThree,
                  index === 3 && styles.mapStopFour,
                  index === 4 && styles.mapStopFive,
                ]}
              >
                <View style={styles.mapStopDot} />
                <Text style={styles.mapStopLabel}>{station}</Text>
              </View>
            ))}
          </View>
        </View>

        <SafeAreaView edges={['top']} style={styles.topSafeArea}>
          <Pressable
            accessibilityHint="Returns to the previous screen"
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            testID="route-back"
          >
            <Text style={styles.backIcon}>‹</Text>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </SafeAreaView>

        <SafeAreaView edges={['bottom']} style={[styles.sheet, { top: mapHeight - 30 }]}>
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.titleRow}>
              <View style={styles.routeBadge}>
                <Text style={styles.routeBadgeText}>R</Text>
              </View>
              <View style={styles.titleCopy}>
                <Text style={styles.agency}>{ronkonkomaRoute.agency}</Text>
                <Text style={styles.title}>{ronkonkomaRoute.name}</Text>
                <Text style={styles.direction}>
                  {ronkonkomaRoute.direction} · toward {ronkonkomaRoute.destination}
                </Text>
              </View>
            </View>

            <Text style={styles.departureLabel}>CHOOSE A DEPARTURE</Text>
            <View style={styles.departureOptions}>
              {departureOptions.map((departure) => {
                const selected = departure === selectedDeparture;

                return (
                  <Pressable
                    key={departure}
                    accessibilityLabel={`${departure} departure`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedDeparture(departure)}
                    style={({ pressed }) => [
                      styles.departureButton,
                      selected && styles.selectedDepartureButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.departureTime,
                        selected && styles.selectedDepartureTime,
                      ]}
                    >
                      {departure}
                    </Text>
                    <Text
                      style={[
                        styles.departureCaption,
                        selected && styles.selectedDepartureCaption,
                      ]}
                    >
                      {selected ? 'Selected' : 'Next train'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.timelineHeading}>
              <Text style={styles.timelineTitle}>Route stops</Text>
              <View style={styles.onTimeChip}>
                <View style={styles.onTimeDot} />
                <Text style={styles.onTimeText}>On time</Text>
              </View>
            </View>

            <View
              accessibilityLabel={`Stops for the ${selectedDeparture} departure`}
              style={styles.stopList}
            >
              {ronkonkomaRoute.stops.map((stop, index) => {
                const isFirst = index === 0;
                const isLast = index === ronkonkomaRoute.stops.length - 1;

                return (
                  <View
                    key={stop.name}
                    accessibilityLabel={`${stop.name}, ${
                      isFirst ? 'departs' : 'arrives'
                    } ${stop.times[selectedDeparture]}`}
                    accessible={true}
                    style={styles.stopRow}
                  >
                    <View
                      accessibilityElementsHidden={true}
                      importantForAccessibility="no-hide-descendants"
                      style={styles.timelineRail}
                    >
                      {!isFirst && <View style={styles.railAbove} />}
                      <View style={[styles.stopDot, isFirst && styles.firstStopDot]} />
                      {!isLast && <View style={styles.railBelow} />}
                    </View>
                    <View style={styles.stopCopy}>
                      <Text style={styles.stopName}>{stop.name}</Text>
                      <Text style={styles.stopMeta}>
                        {isFirst ? 'Departs' : isLast ? 'Arrives' : 'Scheduled stop'}
                      </Text>
                    </View>
                    <Text style={styles.stopTime}>{stop.times[selectedDeparture]}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#D8D4CC',
  },
  screen: {
    width: '100%',
    maxWidth: 540,
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  map: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: '#EDE9E1',
  },
  road: {
    position: 'absolute',
    height: 10,
    borderRadius: 8,
    backgroundColor: colors.roadHighlight,
    borderWidth: 1,
    borderColor: colors.road,
  },
  roadOne: {
    top: 94,
    left: -45,
    width: 650,
    transform: [{ rotate: '-8deg' }],
  },
  roadTwo: {
    top: 208,
    left: -80,
    width: 680,
    transform: [{ rotate: '14deg' }],
  },
  roadThree: {
    top: 20,
    left: 236,
    width: 440,
    transform: [{ rotate: '69deg' }],
  },
  water: {
    position: 'absolute',
    borderRadius: 100,
    backgroundColor: '#DCE9E9',
  },
  waterOne: {
    top: 42,
    left: -48,
    width: 120,
    height: 70,
    transform: [{ rotate: '-18deg' }],
  },
  waterTwo: {
    right: -35,
    bottom: 25,
    width: 115,
    height: 62,
    transform: [{ rotate: '12deg' }],
  },
  placeLabel: {
    position: 'absolute',
    color: '#96978F',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  placeLabelOne: {
    top: 103,
    left: 34,
  },
  placeLabelTwo: {
    right: 32,
    bottom: 56,
  },
  routeLine: {
    position: 'absolute',
    top: 130,
    right: 25,
    left: 25,
    height: 120,
  },
  routeSegment: {
    position: 'absolute',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.red,
  },
  routeSegmentOne: {
    top: 31,
    left: '4%',
    width: '24%',
    transform: [{ rotate: '-4deg' }],
  },
  routeSegmentTwo: {
    top: 43,
    left: '26%',
    width: '24%',
    transform: [{ rotate: '16deg' }],
  },
  routeSegmentThree: {
    top: 56,
    left: '48%',
    width: '24%',
    transform: [{ rotate: '-2deg' }],
  },
  routeSegmentFour: {
    top: 68,
    left: '70%',
    width: '24%',
    transform: [{ rotate: '16deg' }],
  },
  mapStop: {
    position: 'absolute',
    alignItems: 'center',
  },
  mapStopOne: {
    top: 27,
    left: '2%',
  },
  mapStopTwo: {
    top: 30,
    left: '24%',
  },
  mapStopThree: {
    top: 50,
    left: '47%',
  },
  mapStopFour: {
    top: 50,
    left: '69%',
  },
  mapStopFive: {
    top: 69,
    right: '1%',
    alignItems: 'flex-end',
  },
  mapStopDot: {
    width: 16,
    height: 16,
    borderWidth: 4,
    borderColor: colors.white,
    borderRadius: 8,
    backgroundColor: colors.red,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 3,
  },
  mapStopLabel: {
    marginTop: 5,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 5,
    overflow: 'hidden',
    color: colors.ink,
    backgroundColor: 'rgba(255, 254, 251, 0.91)',
    fontSize: 8,
    fontWeight: '800',
  },
  topSafeArea: {
    zIndex: 3,
    alignItems: 'flex-start',
    paddingTop: 8,
    paddingLeft: 16,
  },
  backButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    paddingLeft: 10,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 254, 251, 0.96)',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  backIcon: {
    marginTop: -2,
    color: colors.ink,
    fontSize: 32,
    fontWeight: '500',
    lineHeight: 34,
  },
  backText: {
    marginLeft: 3,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.65,
  },
  sheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    paddingTop: 10,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 14,
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: 'center',
    marginBottom: 4,
    borderRadius: 3,
    backgroundColor: '#D5D1CA',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeBadge: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
    borderRadius: 24,
    backgroundColor: colors.blue,
  },
  routeBadgeText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
  },
  titleCopy: {
    minWidth: 0,
    flex: 1,
  },
  agency: {
    marginBottom: 3,
    color: colors.blue,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.55,
  },
  direction: {
    marginTop: 4,
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '600',
  },
  departureLabel: {
    marginTop: 24,
    marginBottom: 9,
    color: colors.mutedInk,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  departureOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  departureButton: {
    minHeight: 61,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: '#F6F3ED',
  },
  selectedDepartureButton: {
    borderColor: colors.blue,
    backgroundColor: colors.blue,
  },
  departureTime: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  selectedDepartureTime: {
    color: colors.white,
  },
  departureCaption: {
    marginTop: 3,
    color: colors.mutedInk,
    fontSize: 9,
    fontWeight: '700',
  },
  selectedDepartureCaption: {
    color: '#DDEBFA',
  },
  timelineHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 25,
    marginBottom: 6,
  },
  timelineTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  onTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.greenSoft,
  },
  onTimeDot: {
    width: 6,
    height: 6,
    marginRight: 5,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  onTimeText: {
    color: colors.green,
    fontSize: 9,
    fontWeight: '900',
  },
  stopRow: {
    height: 67,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stopList: {
    flexShrink: 0,
  },
  timelineRail: {
    width: 30,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  railAbove: {
    position: 'absolute',
    top: 0,
    width: 3,
    height: '50%',
    backgroundColor: colors.red,
  },
  railBelow: {
    position: 'absolute',
    bottom: 0,
    width: 3,
    height: '50%',
    backgroundColor: colors.red,
  },
  stopDot: {
    zIndex: 1,
    width: 13,
    height: 13,
    borderWidth: 3,
    borderColor: colors.red,
    borderRadius: 7,
    backgroundColor: colors.surface,
  },
  firstStopDot: {
    borderColor: colors.blue,
    backgroundColor: colors.blue,
  },
  stopCopy: {
    minWidth: 0,
    flex: 1,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stopName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  stopMeta: {
    marginTop: 3,
    color: colors.mutedInk,
    fontSize: 10,
    fontWeight: '600',
  },
  stopTime: {
    paddingLeft: 10,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
});
