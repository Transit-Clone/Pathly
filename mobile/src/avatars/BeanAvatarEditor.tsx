import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { PressableScale } from '../components/PressableScale';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { BeanAvatar } from './BeanAvatarImage';
import { BEAN_COLORS, BEAN_EYES, BEAN_HAIR, BEAN_MOUTHS, randomBeanAvatar, type BeanAvatarConfig } from './beanAvatar';

type Props = { onCancel: () => void; onSaved: () => void };
const tabs = ['Color', 'Eyes', 'Mouth', 'Hair'] as const;
type Tab = typeof tabs[number];

/** Wait for the saved profile before creating a draft, so a default can't overwrite it. */
export function BeanAvatarEditor(props: Props) {
  const { user, avatarLoading, avatarError, retryAvatar } = useAuth();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  if (!user || avatarLoading || avatarError) {
    return <View style={styles.viewport}><SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ThemedStatusBar />
      <View style={styles.header}><PressableScale accessibilityRole="button" accessibilityLabel="Cancel bean customization" onPress={props.onCancel} style={styles.back}><Icon name="back" size={24} /></PressableScale><Text style={styles.title}>Customize your bean</Text></View>
      {avatarLoading ? <ActivityIndicator accessibilityLabel="Loading your bean" color={colors.primary} /> : <><Text style={styles.description}>{user ? 'Your bean couldn’t load. Try again before making changes.' : 'Sign in to save your bean.'}</Text>{user ? <PressableScale accessibilityRole="button" onPress={retryAvatar} style={styles.save}><Text style={styles.saveText}>Try again</Text></PressableScale> : null}</>}
    </SafeAreaView></View>;
  }
  return <BeanAvatarDraft key={user.uid} {...props} />;
}

function BeanAvatarDraft({ onCancel, onSaved }: Props) {
  const { avatar, saveAvatar } = useAuth();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [draft, setDraft] = useState<BeanAvatarConfig>(() => ({ ...avatar }));
  const [tab, setTab] = useState<Tab>('Color');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!pending.current) onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel]);

  const change = (next: BeanAvatarConfig) => { setDraft(next); setError(''); };
  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await saveAvatar(draft);
      if (mounted.current) onSaved();
    } catch {
      if (mounted.current) setError('Your bean couldn’t save. Check your connection and try again.');
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const field = tab === 'Eyes' ? 'eyes' : tab === 'Mouth' ? 'mouth' : 'hair';
  const parts = tab === 'Eyes' ? BEAN_EYES : tab === 'Mouth' ? BEAN_MOUTHS : BEAN_HAIR;
  return <View style={styles.viewport}><SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="bean-editor">
    <ThemedStatusBar />
    <View style={styles.header}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Cancel bean customization" disabled={saving} onPress={onCancel} style={styles.back} testID="bean-cancel"><Icon name="back" size={24} /></PressableScale>
      <Text style={styles.title}>Customize your bean</Text>
    </View>
      <View style={styles.preview}>
        <BeanAvatar config={draft} size={158} animated={true} accessibilityLabel="Your bean preview" testID="bean-preview" />
        <PressableScale accessibilityRole="button" accessibilityLabel="Surprise me" disabled={saving} onPress={() => change(randomBeanAvatar())} style={styles.shuffle} testID="bean-randomize"><Text style={styles.shuffleText}>Surprise me</Text></PressableScale>
      </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map((item) => <PressableScale key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} disabled={saving} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.selected]} testID={`bean-tab-${item.toLowerCase()}`}><Text style={styles.tabText}>{item}</Text></PressableScale>)}
      </View>
      <View style={styles.grid}>
        {tab === 'Color' ? BEAN_COLORS.map((color) => <PressableScale key={color.id} accessibilityLabel={`Bean color: ${color.label}`} accessibilityRole="button" accessibilityState={{ selected: draft.color === color.id }} disabled={saving} onPress={() => change({ ...draft, color: color.id })} style={[styles.option, draft.color === color.id && styles.selected]} testID={`bean-color-${color.id}`}>
          <View style={[styles.swatch, { backgroundColor: color.hex }]}>{draft.color === color.id ? <Icon name="check" color="#242728" size={22} /> : null}</View><Text style={styles.optionText}>{color.label}</Text>
        </PressableScale>) : parts.map((part) => <PressableScale key={part.id} accessibilityLabel={`${tab}: ${part.label}`} accessibilityRole="button" accessibilityState={{ selected: draft[field] === part.id }} disabled={saving} onPress={() => change({ ...draft, [field]: part.id })} style={[styles.option, draft[field] === part.id && styles.selected]} testID={`bean-${field}-${part.id}`}>
          <BeanAvatar config={{ ...draft, [field]: part.id }} size={72} />
        </PressableScale>)}
      </View>
    </ScrollView>
    <View style={styles.footer}>
      {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error} testID="bean-save-error">{error}</Text> : null}
      <PressableScale accessibilityRole="button" accessibilityLabel="Save bean" accessibilityState={{ busy: saving, disabled: saving }} disabled={saving} onPress={() => void save()} style={[styles.save, saving && styles.disabled]} testID="bean-save">{saving ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.saveText}>Save bean</Text>}</PressableScale>
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
  preview: { alignItems: 'center', borderRadius: 24, backgroundColor: colors.surface, padding: 16 },
  description: { color: colors.mutedInk, ...typography.body, textAlign: 'center', marginVertical: 8 },
  shuffle: { minHeight: 44, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.blueSoft },
  shuffleText: { color: colors.primary, ...typography.bodyStrong },
  tabs: { flexDirection: 'row', gap: 6, marginTop: 22, marginBottom: 14 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  tabText: { color: colors.ink, ...typography.bodyStrong, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { width: '31%', flexGrow: 1, minHeight: 110, alignItems: 'center', justifyContent: 'center', padding: 7, borderRadius: 16, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: colors.primary, backgroundColor: colors.blueSoft },
  optionText: { color: colors.ink, ...typography.metadata, fontSize: 11, textAlign: 'center', marginTop: 3 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  footer: { paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border },
  save: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  saveText: { color: colors.onPrimary, ...typography.bodyStrong },
  disabled: { opacity: 0.6 },
  error: { color: colors.red, ...typography.metadata, marginBottom: 10 },
});
