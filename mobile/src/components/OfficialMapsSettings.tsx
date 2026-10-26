import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { CAN_SAVE_MAPS, isMapSaved, OFFICIAL_MAPS, openMap, removeSavedMap, saveMap, type OfficialMap } from '../data/officialMaps';
import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

const GROUPS = ['Subway', 'Railroads', 'Bus'] as const;

/** Settings -> Official maps: the MTA's subway, railroad and bus maps, each savable for offline use. */
export function OfficialMapsSettings({ onFeedback }: { onFeedback: (message: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set(OFFICIAL_MAPS.filter(isMapSaved).map((map) => map.id)));
  const [busy, setBusy] = useState<string | null>(null);

  const toggleSaved = async (map: OfficialMap) => {
    if (busy) return;
    if (saved.has(map.id)) {
      removeSavedMap(map);
      setSaved((current) => new Set([...current].filter((id) => id !== map.id)));
      onFeedback(`${map.title} removed from this device.`);
      return;
    }
    setBusy(map.id);
    try {
      await saveMap(map);
      setSaved((current) => new Set([...current, map.id]));
      onFeedback(`${map.title} saved. It opens even with no signal.`);
    } catch {
      onFeedback(`Couldn't save ${map.title}. Check your connection and try again.`);
    } finally {
      setBusy(null);
    }
  };

  const open = (map: OfficialMap) => {
    openMap(map).catch(() => onFeedback(`Couldn't open ${map.title}.`));
  };

  return (
    <View>
      <Text style={styles.intro}>
        {CAN_SAVE_MAPS
          ? "The MTA's own maps. Save the ones you use to open them underground or without data."
          : "The MTA's own maps, opened from mta.info. In the Pathly app you can save them for offline use."}
      </Text>
      {GROUPS.map((group) => (
        <View key={group}>
          <Text style={styles.sectionLabel}>{group.toUpperCase()}</Text>
          <View style={styles.card}>
            {OFFICIAL_MAPS.filter((map) => map.group === group).map((map) => {
              const isSaved = saved.has(map.id);
              return (
                <View key={map.id} style={styles.row}>
                  <PressableScale accessibilityHint={isSaved ? 'Opens the copy saved on this device' : 'Opens the map from mta.info'} accessibilityLabel={`Open ${map.title}`} accessibilityRole="button" onPress={() => open(map)} style={styles.rowMain} testID={`official-map-${map.id}`}>
                    <View style={styles.rowIcon}><Icon name="map" size={19} /></View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.title}>{map.title}</Text>
                      <Text style={styles.detail}>{isSaved ? `Saved · ${map.detail}` : map.detail}</Text>
                    </View>
                  </PressableScale>
                  {CAN_SAVE_MAPS ? <SaveButton busy={busy === map.id} onPress={() => void toggleSaved(map)} saved={isSaved} testID={`official-map-save-${map.id}`} title={map.title} /> : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
      <Text style={styles.note}>{"Maps © Metropolitan Transportation Authority, for personal use. Saved maps don't update on their own: save again after big service changes."}</Text>
    </View>
  );
}

function SaveButton({ busy, onPress, saved, testID, title }: { busy: boolean; onPress: () => void; saved: boolean; testID: string; title: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <PressableScale accessibilityLabel={saved ? `Remove saved ${title}` : `Save ${title} for offline`} accessibilityRole="button" accessibilityState={{ busy }} hitSlop={6} onPress={onPress} style={[styles.save, saved && styles.saveDone]} testID={testID}>
      {busy ? <ActivityIndicator color={colors.primary} size="small" /> : <Icon color={saved ? colors.white : colors.primary} filled={saved} name={saved ? 'check' : 'download'} size={18} />}
    </PressableScale>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  intro: { marginTop: 4, marginBottom: 4, color: colors.mutedInk, ...typography.body },
  sectionLabel: { marginTop: 20, marginBottom: 9, color: colors.mutedInk, ...typography.label },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingRight: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11, paddingLeft: 15, paddingVertical: 10 },
  rowIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.blueSoft },
  rowCopy: { minWidth: 0, flex: 1 },
  title: { color: colors.ink, ...typography.bodyStrong, fontSize: 15 },
  detail: { marginTop: 2, color: colors.mutedInk, ...typography.metadata, fontSize: 11 },
  save: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.blueSoft },
  saveDone: { backgroundColor: colors.primary },
  note: { marginTop: 18, color: colors.mutedInk, ...typography.metadata, fontSize: 11 },
});
