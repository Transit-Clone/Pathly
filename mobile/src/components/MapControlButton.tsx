import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { PopOnActivate } from '../theme/motion';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

type MapControlButtonProps = {
  accessibilityLabel: string;
  /** Back is a plain chevron; every other control fills its glyph when selected. */
  icon: IconName;
  onPress: () => void;
  /** Shown as on (the map is following the rider, the route is framed). */
  selected?: boolean;
  /** The save star: gold when saved, with a pop. */
  variant?: 'default' | 'save';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The round floating button every map page uses, so Back, Save, Locate and Fit look and behave
 * the same everywhere. Pages lay them out the same way too: Back alone at top left, and a column
 * at top right of Save, then Locate, then Fit route.
 */
export function MapControlButton({ accessibilityLabel, icon, onPress, selected = false, style, testID, variant = 'default' }: MapControlButtonProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const saved = variant === 'save' && selected;
  const glyph = <Icon color={saved ? colors.highlightInk : colors.primary} filled={selected} name={icon} size={icon === 'back' ? 26 : 22} />;
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={icon === 'back' ? undefined : { selected }}
      onPress={onPress}
      style={[styles.button, selected && (saved ? styles.saved : styles.selected), style]}
      testID={testID}
    >
      {variant === 'save' ? <PopOnActivate active={selected}>{glyph}</PopOnActivate> : glyph}
    </PressableScale>
  );
}

export const MAP_CONTROL_SIZE = 46;

const createStyles = (colors: Palette) => StyleSheet.create({
  button: {
    width: MAP_CONTROL_SIZE,
    height: MAP_CONTROL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: MAP_CONTROL_SIZE / 2,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  selected: { backgroundColor: colors.blueSoft },
  saved: { backgroundColor: colors.highlightSoft },
});
