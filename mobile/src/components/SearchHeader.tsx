import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

type SearchHeaderProps = {
  onSearchPress: () => void;
};

export function SearchHeader({ onSearchPress }: SearchHeaderProps) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityHint="Opens destination search"
        accessibilityLabel="Where to?"
        accessibilityRole="button"
        onPress={onSearchPress}
        style={({ pressed }) => [styles.search, pressed && styles.pressed]}
        testID="search-trigger"
      >
        <View style={styles.searchIcon}>
          <View style={styles.searchIconCircle} />
          <View style={styles.searchIconHandle} />
        </View>
        <Text style={styles.searchText}>Where to?</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="Profile"
        accessibilityRole="button"
        onPress={() => undefined}
        style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
      >
        <Text style={styles.profileText}>P</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 28,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 13,
    elevation: 6,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },
  searchText: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  searchIcon: {
    width: 20,
    height: 20,
  },
  searchIconCircle: {
    width: 13,
    height: 13,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 7,
  },
  searchIconHandle: {
    position: 'absolute',
    width: 8,
    height: 2,
    top: 13,
    left: 11,
    borderRadius: 2,
    backgroundColor: colors.ink,
    transform: [{ rotate: '45deg' }],
  },
  profile: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.ink,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  profileText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
});
