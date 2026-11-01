import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { fareLabel, riderFare, type FareType, type TripFare } from '../data/tripPlanning';
import { useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { radii } from '../theme/shape';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

type FareSheetProps = {
  /** The fare to explain; undefined hides the sheet. */
  fare: TripFare | undefined;
  fareType: FareType;
  onClose: () => void;
};

/** What tapping a fare opens: each part of the trip's fare and where the total came from. */
export function FareSheet({ fare, fareType, onClose }: FareSheetProps) {
  const styles = useThemedStyles(createStyles);
  const discounted = riderFare(fare, fareType);
  const lines = discounted ? discounted.lines : fare?.lines;
  const noDiscount = fareType !== 'full' && fare != null && !discounted;
  const source = discounted || fare?.estimated
    ? "Estimated from each agency's published fares. Your actual fare can differ."
    : 'This total comes from Google, for one adult paying as they go.';
  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent={true} transparent={true} visible={fare != null}>
      <View style={styles.viewport}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} testID="fare-sheet-backdrop" />
        <View accessibilityViewIsModal={true} style={styles.sheet} testID="fare-sheet">
          <View style={styles.header}>
            <Text style={styles.heading}>How this fare adds up</Text>
            <PressableScale accessibilityLabel="Close" accessibilityRole="button" hitSlop={8} onPress={onClose} testID="fare-sheet-close">
              <Icon name="close" size={22} />
            </PressableScale>
          </View>
          {lines?.map((line, index) => (
            <View key={`${line.label}-${index}`} style={styles.row} testID={`fare-line-${index}`}>
              <View style={styles.copy}>
                <Text style={styles.label}>{line.label}</Text>
                {line.note ? <Text style={styles.note}>{line.note}</Text> : null}
              </View>
              <Text style={styles.amount}>{line.text}</Text>
            </View>
          ))}
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.total}>Total, one way</Text>
            <Text style={styles.total} testID="fare-sheet-total">{fare ? fareLabel(fare, fareType) : ''}</Text>
          </View>
          <Text style={styles.source}>{source}</Text>
          {noDiscount ? <Text style={styles.source} testID="fare-sheet-no-reduced">There&apos;s no discount we can price for this trip, so this is the standard fare.</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  heading: { color: colors.ink, ...typography.sectionHeading, fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  copy: { minWidth: 0, flex: 1 },
  label: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  note: { marginTop: 2, color: colors.mutedInk, ...typography.metadata, fontSize: 13 },
  amount: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  totalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  total: { color: colors.ink, fontFamily: fontFamilies.extraBold, fontSize: 16 },
  source: { marginTop: 6, color: colors.mutedInk, ...typography.metadata, fontSize: 13 },
});
