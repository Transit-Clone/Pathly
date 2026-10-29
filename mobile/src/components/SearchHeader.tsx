import { StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { radii } from '../theme/shape';
import { useAuth } from '../auth/AuthContext';
import { BeanAvatar } from '../avatars/BeanAvatarImage';

type SearchHeaderProps = {
  onProfilePress: () => void;
  onSearchPress: () => void;
};

export function SearchHeader({ onProfilePress, onSearchPress }: SearchHeaderProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { avatar } = useAuth();
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityHint="Opens destination search"
        accessibilityLabel="Where to?"
        accessibilityRole="button"
        onPress={onSearchPress}
        style={styles.search}
        testID="search-trigger"
      >
        <Icon color={colors.ink} name="search" size={20} />
        <Text style={styles.searchText}>Where to?</Text>
      </PressableScale>

      <PressableScale
        accessibilityLabel="Profile"
        accessibilityRole="button"
        onPress={onProfilePress}
        style={styles.profile}
        testID="profile-trigger"
      >
        <BeanAvatar config={avatar} size={46} testID="header-bean-avatar" />
      </PressableScale>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  search: {
    minHeight: 54,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 13,
    elevation: 6,
  },
  searchText: {
    color: colors.ink,
    ...typography.bodyStrong,
    fontSize: 17,
  },
  profile: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
});
