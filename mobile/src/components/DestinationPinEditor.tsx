import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { DESTINATION_PIN_COLORS, DESTINATION_PIN_EYES, DESTINATION_PIN_HAIR, DESTINATION_PIN_MOUTHS, destinationPinFace, type DestinationPinStyle } from '../data/destinationPin';
import { SAVED_PLACE_COLOR_HEX } from '../data/savedPlacePin';
import { ThemedStatusBar, useAppSettings, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { DestinationPinMarker } from './DestinationPinMarker';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

type Props = { onCancel: () => void; onSaved: () => void };
const tabs = ['Color', 'Eyes', 'Mouth', 'Hair'] as const;
type Tab = typeof tabs[number];

const label = (color: string) => color[0]!.toUpperCase() + color.slice(1);

/** Customizing the trip maps' destination pin, as the Pathling is customized: a draft, saved on the device. */
export function DestinationPinEditor({ onCancel, onSaved }: Props) {
  const { destinationPin, setDestinationPin } = useAppSettings();
  const styles = useThemedStyles(createStyles);
  const [draft, setDraft] = useState<DestinationPinStyle>(() => ({ ...destinationPin }));
  const [tab, setTab] = useState<Tab>('Color');
  const { avatar } = useAuth();
  const face = destinationPinFace(draft, avatar);
  const matchesPathling = draft.eyes === undefined && draft.mouth === undefined && draft.hair === undefined;
  const field = tab === 'Eyes' ? 'eyes' : tab === 'Mouth' ? 'mouth' : 'hair';
  const parts: readonly { id: string; label: string }[] = tab === 'Eyes' ? DESTINATION_PIN_EYES : tab === 'Mouth' ? DESTINATION_PIN_MOUTHS : DESTINATION_PIN_HAIR;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel]);

  return <View style={styles.viewport}><SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="pin-editor">
    <ThemedStatusBar />
    <View style={styles.header}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Cancel pin customization" onPress={onCancel} style={styles.back} testID="pin-cancel"><Icon name="back" size={24} /></PressableScale>
      <Text style={styles.title}>Customize your pin</Text>
    </View>
    <View style={styles.preview}>
      <DestinationPinMarker pinStyle={draft} scale={2.6} testID="pin-preview" />
      <Text style={styles.description}>Marks where you&apos;re headed on trip maps.</Text>
      <PressableScale accessibilityRole="button" accessibilityLabel="Match my Pathling" accessibilityState={{ selected: matchesPathling }} onPress={() => setDraft({ color: draft.color })} style={[styles.match, matchesPathling && styles.selected]} testID="pin-match-pathling"><Text style={styles.tabText}>{matchesPathling ? 'Matches your Pathling' : 'Match my Pathling'}</Text></PressableScale>
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map((item) => <PressableScale key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.selected]} testID={`pin-tab-${item.toLowerCase()}`}><Text style={styles.tabText}>{item}</Text></PressableScale>)}
      </View>
      <View style={styles.grid}>
        {tab === 'Color' ? DESTINATION_PIN_COLORS.map((color) => <PressableScale key={color} accessibilityLabel={`Pin color: ${label(color)}`} accessibilityRole="button" accessibilityState={{ selected: draft.color === color }} onPress={() => setDraft({ ...draft, color })} style={[styles.option, draft.color === color && styles.selected]} testID={`pin-color-${color}`}>
          <View style={[styles.swatch, { backgroundColor: SAVED_PLACE_COLOR_HEX[color] }]}>{draft.color === color ? <Icon name="check" color="#FFFFFF" size={22} /> : null}</View>
        </PressableScale>) : parts.map((part) => <PressableScale key={part.id} accessibilityLabel={`Pin ${field}: ${part.label}`} accessibilityRole="button" accessibilityState={{ selected: face[field] === part.id }} onPress={() => setDraft({ ...draft, ...face, [field]: part.id })} style={[styles.option, face[field] === part.id && styles.selected]} testID={`pin-${field}-${part.id}`}>
          <DestinationPinMarker pinStyle={{ ...draft, ...face, [field]: part.id }} scale={1.4} />
        </PressableScale>)}
      </View>
    </ScrollView>
    <View style={styles.footer}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Save pin" onPress={() => { setDestinationPin(draft); onSaved(); }} style={styles.save} testID="pin-save"><Text style={styles.saveText}>Save pin</Text></PressableScale>
    </View>
  </SafeAreaView></View>;
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', backgroundColor: colors.background },
  screen: { flex: 1, width: '100%', maxWidth: 540, paddingHorizontal: 18 },
  header: { minHeight: 72, flexDirection: 'row', gap: 12, alignItems: 'center' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 22 },
  title: { flex: 1, color: colors.ink, ...typography.sectionHeading, fontSize: 21 },
  content: { paddingBottom: 20 },
  preview: { alignItems: 'center', gap: 12, borderRadius: 24, backgroundColor: colors.surface, padding: 18 },
  description: { color: colors.mutedInk, ...typography.body, textAlign: 'center' },
  match: { minHeight: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.background },
  tabs: { flexDirection: 'row', gap: 6, marginTop: 22, marginBottom: 14 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  tabText: { color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { width: '31%', flexGrow: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 7, borderRadius: 16, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: colors.primary, backgroundColor: colors.blueSoft },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border },
  save: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  saveText: { color: colors.onPrimary, ...typography.bodyStrong },
});
