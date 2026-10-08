import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { fetchPlaceDetails, type SearchPlace } from '../data/placesSearch';
import { locationToPlace, recordSearch, removeSearch, subscribeToSearches } from '../data/userData';
import { usePlacesSearch } from '../hooks/usePlacesSearch';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';

const MAX_RECENT_SEARCHES = 8;

export type SearchViewProps = {
  initialQuery?: string;
  onCancel: () => void;
  onSelect: (place: SearchPlace) => void;
  /** When set (editing a trip's start), a "Current location" choice is offered first. */
  onSelectCurrentLocation?: () => void;
};

type SearchResultRowProps = {
  place: SearchPlace;
  recent?: boolean;
  resolving?: boolean;
  onPress: () => void;
  /** Adds a remove button beside the row (recent searches). */
  onRemove?: () => void;
};

function SearchIcon() {
  const { colors } = useTheme();
  return <Icon color={colors.ink} name="search" size={20} />;
}

function SearchResultRow({ onPress, onRemove, place, recent = false, resolving = false }: SearchResultRowProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const row = (
    <PressableScale
      accessibilityLabel={`${place.title}, ${place.subtitle}`}
      accessibilityRole="button"
      accessibilityState={{ busy: resolving }}
      onPress={onPress}
      style={[styles.resultRow, onRemove && styles.removableResultRow]}
      testID={`search-result-${place.id}`}
    >
      <View style={styles.resultIcon}>
        {resolving ? (
          <ActivityIndicator color={colors.primary} size="small" testID={`search-result-resolving-${place.id}`} />
        ) : (
          <Icon color={colors.mutedInk} name={recent ? 'recent' : 'place'} size={20} />
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
    </PressableScale>
  );
  if (!onRemove) return row;
  // A sibling of the row rather than nested in it, so each is its own button for screen readers.
  return (
    <View style={styles.removableRowWrap}>
      {row}
      <PressableScale
        accessibilityLabel={`Remove ${place.title} from recent searches`}
        accessibilityRole="button"
        hitSlop={4}
        onPress={onRemove}
        style={styles.removeButton}
        testID={`search-recent-remove-${place.id}`}
      >
        <Icon color={colors.mutedInk} name="dismiss" size={20} />
      </PressableScale>
    </View>
  );
}

type MessageProps = {
  body: string;
  children?: ReactNode;
  title: string;
};

/** Centered empty/error/unavailable state, announced to assistive technology. */
function Message({ body, children, title }: MessageProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityLiveRegion="polite" style={styles.message} testID="search-message">
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageBody}>{body}</Text>
      {children}
    </View>
  );
}

/** Full-screen destination search: search field pinned on top, a flat result list below. */
export function SearchView({ initialQuery = '', onCancel, onSelect, onSelectCurrentLocation }: SearchViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [query, setQuery] = useState(initialQuery);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectionFailed, setSelectionFailed] = useState(false);
  const { user } = useAuth();
  const uid = user?.uid;
  // The account's search history (Firestore), newest first; it shows new picks right away, even offline.
  const [recentPlaces, setRecentPlaces] = useState<readonly SearchPlace[]>([]);

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeToSearches(uid, MAX_RECENT_SEARCHES, (searches) => setRecentPlaces(searches.map((search) => locationToPlace(search.address))));
  }, [uid]);

  // Fire-and-forget: history is a convenience and must never block navigating to the place.
  const rememberPlace = (place: SearchPlace) => {
    if (uid) recordSearch(uid, place, onSelectCurrentLocation ? 'Start' : 'Destination').catch(() => undefined);
  };
  const forgetPlace = (place: SearchPlace) => {
    if (uid) removeSearch(uid, place.id).catch(() => undefined);
  };
  const { endSession, getSessionToken, retry, status, suggestions } = usePlacesSearch(query);
  const isSearching = status !== 'idle';

  // Not an effect dependency, so a parent re-render (new onSelect identity) can't restart the request.
  const finishSelection = useEffectEvent((place: SearchPlace) => {
    endSession();
    rememberPlace(place);
    onSelect(place);
  });
  const getDetailsSessionToken = useEffectEvent(getSessionToken);

  // Resolves the picked suggestion; unmounting (e.g. Cancel) aborts it so a late answer can't navigate.
  useEffect(() => {
    if (!resolvingId) return undefined;
    const controller = new AbortController();
    fetchPlaceDetails({ placeId: resolvingId, sessionToken: getDetailsSessionToken(), signal: controller.signal })
      .then((place) => {
        if (!controller.signal.aborted) finishSelection(place);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResolvingId(null);
        setSelectionFailed(true);
      });
    return () => controller.abort();
  }, [resolvingId]);

  const changeQuery = (value: string) => {
    setQuery(value);
    setSelectionFailed(false);
  };

  const selectRecent = (place: SearchPlace) => {
    if (resolvingId) return;
    rememberPlace(place);
    onSelect(place);
  };

  const selectSuggestion = (suggestion: SearchPlace) => {
    if (resolvingId) return;
    setResolvingId(suggestion.id);
    setSelectionFailed(false);
  };

  const renderSearchState = () => {
    if (status === 'unconfigured') {
      return (
        <Message
          body="Place search is not set up for this build yet. Clear the search to pick a recent place."
          title="Place search is unavailable"
        />
      );
    }
    if (status === 'error') {
      return (
        <Message body="Check your connection and try again." title="Couldn't load places">
          <PressableScale accessibilityRole="button" onPress={retry} style={styles.retryButton} testID="search-retry">
            <Text style={styles.retryText}>Retry</Text>
          </PressableScale>
        </Message>
      );
    }
    if (status === 'loading') {
      return (
        <View accessibilityLabel="Searching places" accessibilityLiveRegion="polite" style={styles.loadingState} testID="search-loading">
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (suggestions.length === 0) {
      return <Message body="Try a street address, a business, or a station name." title="No places found" />;
    }
    return suggestions.map((place) => (
      <SearchResultRow
        key={place.id}
        onPress={() => selectSuggestion(place)}
        place={place}
        resolving={resolvingId === place.id}
      />
    ));
  };

  return (
    <View style={styles.viewport}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.screen}
        testID="search-view"
      >
        <ThemedStatusBar />

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

        <ScrollView
          contentContainerStyle={styles.resultList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.results}
          testID="search-results"
        >
          {selectionFailed ? (
            <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.selectionError} testID="search-selection-error">
              {"Couldn't open that place. Try selecting it again."}
            </Text>
          ) : null}

          {onSelectCurrentLocation ? (
            <PressableScale
              accessibilityLabel="Current location"
              accessibilityRole="button"
              onPress={() => {
                if (resolvingId) return;
                endSession();
                onSelectCurrentLocation();
              }}
              style={styles.resultRow}
              testID="search-current-location"
            >
              <View style={styles.resultIcon}>
                <Icon color={colors.primary} filled={true} name="locate" size={20} />
              </View>
              <View style={styles.resultCopy}>
                <Text numberOfLines={1} style={styles.resultTitle}>Current location</Text>
              </View>
            </PressableScale>
          ) : null}

          {isSearching ? renderSearchState() : recentPlaces.length > 0 ? (
            <>
              <Text accessibilityRole="header" style={styles.heading}>
                Recent
              </Text>
              {recentPlaces.map((place) => (
                <SearchResultRow key={place.id} onPress={() => selectRecent(place)} onRemove={() => forgetPlace(place)} place={place} recent={true} />
              ))}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  viewport: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  screen: {
    width: '100%',
    maxWidth: 540,
    flex: 1,
    backgroundColor: colors.surface,
  },
  searchSafeArea: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  searchField: {
    minHeight: 50,
    minWidth: 0,
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: 25,
    backgroundColor: colors.surfaceMuted,
  },
  searchInput: {
    minWidth: 0,
    flex: 1,
    paddingVertical: 12,
    color: colors.ink,
    ...typography.bodyStrong,
    fontSize: 16,
  },
  clearButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  results: {
    flex: 1,
  },
  resultList: {
    paddingBottom: 24,
  },
  heading: {
    paddingTop: 18,
    paddingBottom: 6,
    paddingHorizontal: 20,
    color: colors.ink,
    ...typography.sectionHeading,
  },
  resultRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
  },
  removableRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  removableResultRow: {
    flex: 1,
    paddingRight: 0,
  },
  removeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  resultIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
  },
  resultCopy: {
    minWidth: 0,
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultTitle: {
    color: colors.ink,
    ...typography.bodyStrong,
    fontSize: 15,
  },
  resultSubtitle: {
    marginTop: 2,
    color: colors.mutedInk,
    ...typography.metadata,
  },
  loadingState: {
    alignItems: 'center',
    paddingTop: 32,
  },
  selectionError: {
    marginTop: 12,
    marginHorizontal: 20,
    color: colors.red,
    ...typography.metadata,
  },
  message: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 36,
  },
  messageTitle: {
    color: colors.ink,
    ...typography.sectionHeading,
    fontSize: 16,
    textAlign: 'center',
  },
  messageBody: {
    maxWidth: 280,
    marginTop: 7,
    color: colors.mutedInk,
    ...typography.metadata,
    lineHeight: 18,
    textAlign: 'center',
  },
  retryButton: {
    minWidth: 96,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.onPrimary,
    ...typography.bodyStrong,
  },
});
