import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  findMockDestinations,
  recentSearches,
  type MockSearchPlace,
} from '../data/mockSearch';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { Icon } from './Icon';
import { MapBackdrop } from './MapBackdrop';
import { PressableScale } from './PressableScale';

export type SearchViewProps = {
  initialQuery?: string;
  onCancel: () => void;
  onSelect: (place: MockSearchPlace) => void;
};

type SearchResultRowProps = {
  index?: number;
  place: MockSearchPlace;
  recent?: boolean;
  onPress: () => void;
};

function SearchIcon() {
  const { colors } = useTheme();
  return <Icon color={colors.ink} name="search" size={20} />;
}

function SearchResultRow({
  index,
  onPress,
  place,
  recent = false,
}: SearchResultRowProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityLabel={`${place.title}, ${place.subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.resultRow}
      testID={`search-result-${place.id}`}
    >
      <View
        style={[
          styles.resultIcon,
          recent ? styles.recentIcon : styles.numberIcon,
        ]}
      >
        {recent ? (
          <Icon name="recent" size={20} />
        ) : (
          <Text style={styles.resultIconText}>{index}</Text>
        )}
      </View>

      <View style={styles.resultCopy}>
        <Text numberOfLines={1} style={styles.resultTitle}>
          {place.title}
        </Text>
        <Text numberOfLines={1} style={styles.resultSubtitle}>
          {place.subtitle}
        </Text>
      </View>

      <Icon color={colors.mutedInk} name="forward" size={20} style={styles.chevron} />
    </PressableScale>
  );
}

export function SearchView({ initialQuery = '', onCancel, onSelect }: SearchViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [query, setQuery] = useState(initialQuery);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { height, width } = useWindowDimensions();
  const normalizedQuery = query.trim();
  const isSearching = normalizedQuery.length > 0;
  const searchResults = useMemo(() => findMockDestinations(query), [query]);
  const availableHeight = height - keyboardHeight;
  const sheetHeight = isSearching
    ? Math.max(160, Math.min(520, height * 0.58, availableHeight - 120))
    : Math.min(500, Math.max(405, height * 0.55));
  const mapHeight = height - sheetHeight;
  const screenWidth = Math.min(width, 540);

  const changeQuery = (value: string) => {
    setQuery(value);
  };

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <View style={styles.viewport}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.screen}
        testID="search-view"
      >
        <ThemedStatusBar />
        <MapBackdrop />

        <SafeAreaView edges={['top']} style={styles.searchSafeArea}>
          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <SearchIcon />
              <TextInput
                accessibilityHint="Type an address, station, or destination"
                accessibilityLabel="Search destinations"
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus={true}
                onChangeText={changeQuery}
                placeholder="Where to?"
                placeholderTextColor={colors.mutedInk}
                returnKeyType="search"
                selectionColor={colors.blue}
                style={styles.searchInput}
                testID="search-input"
                value={query}
              />
              {query.length > 0 ? (
                <PressableScale
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => changeQuery('')}
                  style={styles.clearButton}
                >
                  <Icon color={colors.mutedInk} name="close" size={22} />
                </PressableScale>
              ) : null}
            </View>

            <PressableScale
              accessibilityLabel="Cancel destination search"
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </PressableScale>
          </View>
        </SafeAreaView>

        {isSearching
          ? searchResults.map((result, index) => {
              const top = Math.max(145, mapHeight * result.pin.y);
              const left = screenWidth * result.pin.x;

              return (
                <View
                  key={result.id}
                  accessibilityLabel={`Map result ${index + 1}: ${result.title}, ${result.subtitle}`}
                  accessible={true}
                  style={[styles.mapPin, { left, top }]}
                >
                  <Text style={styles.mapPinText}>{index + 1}</Text>
                  <View style={styles.mapPinTip} />
                </View>
              );
            })
          : null}

        <SafeAreaView edges={['bottom']} style={[styles.sheet, { height: sheetHeight }]}>
          <View style={styles.sheetHeading}>
            <Text accessibilityRole="header" style={styles.heading}>
              {isSearching ? 'Matches' : 'Recent'}
            </Text>
            {isSearching ? (
              <Text accessibilityLiveRegion="polite" style={styles.headingCount} testID="search-match-count">
                {searchResults.length === 1 ? '1 place' : `${searchResults.length} places`}
              </Text>
            ) : null}
          </View>

          {isSearching && searchResults.length === 0 ? (
            <View accessibilityLiveRegion="polite" style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <SearchIcon />
              </View>
              <Text style={styles.emptyTitle}>No places found</Text>
              <Text style={styles.emptyBody}>
                Try “123 Terry Rd” or “Ronkonkoma”.
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.resultList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {(isSearching ? searchResults : recentSearches).map((place, index) => (
                <SearchResultRow
                  key={place.id}
                  index={index + 1}
                  onPress={() => onSelect(place)}
                  place={place}
                  recent={!isSearching}
                />
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  screen: {
    width: '100%',
    maxWidth: 540,
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  searchSafeArea: {
    zIndex: 5,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  searchField: {
    minHeight: 54,
    minWidth: 0,
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 17,
    paddingRight: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 28,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 13,
    elevation: 6,
  },
  searchInput: {
    minWidth: 0,
    flex: 1,
    paddingVertical: 13,
    color: colors.ink,
    ...typography.bodyStrong,
    fontSize: 16,
  },
  clearButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.blueSoft,
  },
  cancelButton: {
    minWidth: 54,
    minHeight: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.primary,
    ...typography.bodyStrong,
    fontSize: 15,
  },
  mapPin: {
    position: 'absolute',
    zIndex: 3,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -19,
    marginTop: -19,
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: 19,
    backgroundColor: colors.primary,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 7,
  },
  mapPinText: {
    zIndex: 2,
    color: colors.onPrimary,
    fontFamily: fontFamilies.extraBold,
    fontSize: 14,
  },
  mapPinTip: {
    position: 'absolute',
    bottom: -7,
    width: 15,
    height: 15,
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: colors.white,
    backgroundColor: colors.primary,
    transform: [{ rotate: '45deg' }],
  },
  sheet: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 4,
    overflow: 'hidden',
    paddingTop: 22,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
    elevation: 14,
  },
  sheetHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  heading: {
    color: colors.ink,
    ...typography.screenHeading,
  },
  headingCount: {
    color: colors.mutedInk,
    ...typography.metadata,
  },
  resultList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  resultRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resultIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  recentIcon: {
    backgroundColor: colors.accent,
  },
  numberIcon: {
    backgroundColor: colors.primary,
  },
  resultIconText: {
    color: colors.onPrimary,
    fontFamily: fontFamilies.extraBold,
    fontSize: 13,
  },
  resultCopy: {
    minWidth: 0,
    flex: 1,
  },
  resultTitle: {
    color: colors.ink,
    ...typography.bodyStrong,
    fontSize: 15,
  },
  resultSubtitle: {
    marginTop: 3,
    color: colors.mutedInk,
    ...typography.metadata,
  },
  chevron: {
    paddingHorizontal: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderRadius: 27,
    backgroundColor: colors.accent,
  },
  emptyTitle: {
    color: colors.ink,
    ...typography.sectionHeading,
    fontSize: 16,
  },
  emptyBody: {
    maxWidth: 280,
    marginTop: 7,
    color: colors.mutedInk,
    ...typography.metadata,
    lineHeight: 18,
    textAlign: 'center',
  },
});
