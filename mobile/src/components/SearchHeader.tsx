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
    // One pill: the search fills it, and the Pathling sits at its right end (its own button).
    <View style={styles.bar}>
      <PressableScale
        accessibilityHint="Opens destination search"
        accessibilityLabel="Search line or address"
        accessibilityRole="button"
        onPress={onSearchPress}
        style={styles.search}
        testID="search-trigger"
      >
        <Icon color={colors.ink} name="search" size={20} />
        <Text numberOfLines={1} style={styles.searchText}>Search line or address</Text>
      </PressableScale>

      <PressableScale
        accessibilityLabel="Profile"
        accessibilityRole="button"
        onPress={onProfilePress}
        hitSlop={6}
        style={styles.profile}
        testID="profile-trigger"
      >
        <BeanAvatar config={avatar} size={44} testID="header-bean-avatar" />
      </PressableScale>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  bar: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 13,
    elevation: 6,
  },
  search: {
    minHeight: 54,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingLeft: 18,
    paddingRight: 8,
  },
  searchText: {
    flexShrink: 1,
    color: colors.ink,
    ...typography.bodyStrong,
    fontSize: 17,
  },
  profile: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
