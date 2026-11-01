import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react';
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
import type { BeanMood } from '../avatars/beanAvatar';
import { searchLineIndex, useLineIndex, type IndexedLine } from '../data/lineIndex';
import { searchTransitRoutes, warmLineSearch } from '../data/nearbyTransit';
import { addressAfterName, fetchPlaceDetails, formatDistanceAway, placeDistanceMeters, type PlaceKind, type SearchPlace } from '../data/placesSearch';
import { locationToPlace, recordSearch, removeSearch, subscribeToSearches, type SavedLocation } from '../data/userData';
import { SERVICE_AREA_FALLBACK } from '../data/serviceArea';
import { normalizeStopName } from '../data/stopSearch';
import { usePlacesSearch } from '../hooks/usePlacesSearch';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../theme/AppSettings';
import type { Palette } from '../theme/colors';
import { fontFamilies, typography } from '../theme/typography';
import { DestinationPinMarker } from './DestinationPinMarker';
import { Icon, type IconName } from './Icon';
import { Mascot } from './Mascot';
import { PressableScale } from './PressableScale';
import { badgeLabel, RouteBadge, transitModeForAgency, type TransitMode } from './RouteBadge';
import { SavedPlaceBadge } from './SavedPlaceBadge';
import { savedLocationIcon, savedPlaceLines, SavedPlacesStrip } from './SavedPlacesStrip';
import { radii } from '../theme/shape';

const MAX_RECENT_SEARCHES = 8;
/** Line names are short ("1", "B46", "Port Jefferson"); longer queries are addresses. */
const MAX_LINE_QUERY_LENGTH = 24;
const LINE_SEARCH_DEBOUNCE_MS = 250;

/**
 * Transit lines whose name matches the query, for opening a whole line in route view: searched on
 * the device from the line index as each key is typed. Until the index has reached the device
 * (a first launch offline), the backend's search answers instead.
 */
function useLineSearch(query: string, near: { latitude: number; longitude: number } | null | undefined, enabled: boolean): readonly IndexedLine[] {
  const index = useLineIndex(enabled);
  const [result, setResult] = useState<{ query: string; lines: readonly IndexedLine[] }>({ query: '', lines: [] });
  const trimmed = query.trim();
  const searchable = enabled && trimmed.length > 0 && trimmed.length <= MAX_LINE_QUERY_LENGTH;
  const { latitude, longitude } = near ?? SERVICE_AREA_FALLBACK;
  useEffect(() => {
    if (enabled) warmLineSearch();
  }, [enabled]);
  const local = useMemo(() => (index && searchable ? searchLineIndex(index, trimmed) : null), [index, searchable, trimmed]);
  useEffect(() => {
    if (!searchable || index) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchTransitRoutes(trimmed, { latitude, longitude }).then(
        (lines) => {
          if (!cancelled) setResult({ query: trimmed, lines });
        },
        () => {
          if (!cancelled) setResult({ query: trimmed, lines: [] });
        },
      );
    }, LINE_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchable, trimmed, index]);
  if (!searchable) return [];
  if (local) return local;
  return result.query === trimmed ? result.lines : [];
}
/** Recent searches shown above the results while typing. */
const MAX_MATCHING_RECENTS = 3;
/** Lines shown before "Show more", so Places stays in view. */
const VISIBLE_LINES = 3;
/** Recent searches shown before "Show all". */
const VISIBLE_RECENTS = 4;

/** A recent search matches when every typed word starts a word of its name or address. */
function recentMatches(place: SearchPlace, query: string): boolean {
  const words = normalizeStopName(`${place.title} ${place.subtitle}`).split(' ');
  const typed = normalizeStopName(query).split(' ').filter(Boolean);
  return typed.length > 0 && typed.every((token) => words.some((word) => word.startsWith(token)));
}
/** Saved places shown above the results while typing. */
const MAX_MATCHING_SAVED = 3;

/** A saved place matches when every typed word starts a word of its label, name, address or list. */
function savedMatches(saved: SavedLocation, query: string): boolean {
  const { title, subtitle } = savedPlaceLines(saved);
  const words = normalizeStopName(`${title} ${subtitle} ${saved.address.name} ${saved.address.streetAddress} ${saved.address.group ?? ''}`).split(' ');
  const typed = normalizeStopName(query).split(' ').filter(Boolean);
  return typed.length > 0 && typed.every((token) => words.some((word) => word.startsWith(token)));
}
/** Badges on a stop row before the rest are summarized as "+N". */
const MAX_ROW_BADGES = 6;

const KIND_ICONS: Record<Exclude<PlaceKind, 'place'>, IconName> = { subway: 'subway', rail: 'rail', bus: 'bus', ferry: 'ferry' };
const KIND_BADGE_MODES: Record<Exclude<PlaceKind, 'place'>, TransitMode> = { subway: 'subway', rail: 'rail', bus: 'bus', ferry: 'ferry' };

/** A transit stop's lines as route badges (none for a plain place), for wherever the stop is shown. */
export function stopLineBadges(place: SearchPlace | undefined): { agency: string; color: string; mode: TransitMode; shortName: string }[] {
  if (!place?.routes?.length || !place.kind || place.kind === 'place') return [];
  const mode = KIND_BADGE_MODES[place.kind];
  const agency = place.agency ?? '';
  return place.routes.map((route) => ({ agency, color: route.color, mode, shortName: badgeLabel({ agency, shortName: route.shortName }) }));
}

/** "Jamaica, LIRR station, lines PJ, RK, and 8 more" for a stop; "name, address" for a place. */
/** A stop's kind in words; older recents saved it with its agency ("Bus stop · NICE Bus"). */
function stopKindText(place: SearchPlace): string {
  return place.subtitle.split(' · ')[0] ?? place.subtitle;
}

function rowLabel(place: SearchPlace): string {
  if (!place.routes?.length || !place.kind || place.kind === 'place') {
    const address = addressAfterName(place.title, place.subtitle);
    return address ? `${place.title}, ${address}` : place.title;
  }
  const names = place.routes.slice(0, 3).map((route) => badgeLabel({ agency: place.agency ?? '', shortName: route.shortName }));
  const more = place.routes.length - names.length;
  const lines = more > 0 ? `${names.join(', ')}, and ${more} more` : names.join(', ');
  const what = place.kind === 'bus' ? 'stop' : place.kind === 'ferry' ? 'landing' : 'station';
  return `${place.title}, ${place.agency ?? stopKindText(place)} ${what}, ${place.routes.length === 1 ? 'line' : 'lines'} ${lines}`;
}

export type SearchViewProps = {
  initialQuery?: string;
  onCancel: () => void;
  onSelect: (place: SearchPlace) => void;
  /** When set (editing a trip's start), a "Current location" choice is offered until the rider types. */
  onSelectCurrentLocation?: () => void;
  /** The rider's location, to rank equally good transit stops nearest first. */
  near?: { latitude: number; longitude: number } | null;
  /** The rider's saved places, offered in a swipeable row above Recent. */
  savedPlaces?: readonly SavedLocation[];
  /** When set, the saved places row offers Set home, Set work, and Add. */
  onAddSavedPlace?: (label?: 'Home' | 'Work') => void;
  /** When set, matching transit lines ("1", "B46") are offered above places and open the whole line. */
  onSelectLine?: (line: IndexedLine) => Promise<void>;
  /** When set, "Choose on map" leads the empty search, for dropping a pin anywhere. */
  onChooseOnMap?: () => void;
  placeholder?: string;
};

type SearchResultRowProps = {
  place: SearchPlace;
  recent?: boolean;
  resolving?: boolean;
  onPress: () => void;
  /** Adds a remove button beside the row (recent searches). */
  onRemove?: () => void;
  /** The rider saved this place: the row shows its icon, color and label. */
  saved?: SavedLocation;
  /** Where the rider is searching around: each row says how far it is, under its icon. */
  near?: { latitude: number; longitude: number } | null;
};

function SearchResultRow({ near, onPress, onRemove, place, recent = false, resolving = false, saved }: SearchResultRowProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const transitKind = saved ? undefined : place.kind && place.kind !== 'place' ? place.kind : undefined;
  const savedLines = saved ? savedPlaceLines(saved) : null;
  const subtitle = savedLines ? savedLines.subtitle : transitKind ? '' : addressAfterName(place.title, place.subtitle);
  const distance = placeDistanceMeters(place, near);
  const row = (
    <PressableScale
      accessibilityLabel={distance != null ? `${rowLabel(place)}, ${formatDistanceAway(distance)} away` : rowLabel(place)}
      accessibilityRole="button"
      accessibilityState={{ busy: resolving }}
      onPress={onPress}
      style={[styles.resultRow, onRemove && styles.removableResultRow]}
      testID={`search-result-${place.id}`}
    >
      <View style={styles.resultIconColumn}>
      <View style={[styles.resultIcon, saved && !resolving ? styles.savedIcon : null]}>
        {resolving ? (
          <ActivityIndicator color={colors.primary} size="small" testID={`search-result-resolving-${place.id}`} />
        ) : saved ? (
          <SavedPlaceBadge icon={savedLocationIcon(saved.address)} location={saved.address} testID="search-kind-icon-saved" />
        ) : (
          <Icon color={transitKind ? colors.primary : colors.mutedInk} name={transitKind ? KIND_ICONS[transitKind] : recent ? 'recent' : 'place'} size={20} testID={`search-kind-icon-${transitKind ?? (recent ? 'recent' : 'place')}`} />
        )}
      </View>
      {/* As in Google Maps: a 20 mi result is likely the wrong place. */}
      {distance != null ? <Text numberOfLines={1} style={styles.resultDistance} testID={`search-result-distance-${place.id}`}>{formatDistanceAway(distance)}</Text> : null}
      </View>

      <View style={styles.resultCopy}>
        <Text numberOfLines={1} style={styles.resultTitle}>
          {savedLines?.title ?? place.title}
        </Text>
        {transitKind && place.routes?.length ? (
          <View style={styles.badgeRow} testID={`search-routes-${place.id}`}>
            {place.routes.slice(0, MAX_ROW_BADGES).map((route) => (
              <RouteBadge
                key={route.shortName}
                agency={place.agency ?? ''}
                color={route.color}
                mode={KIND_BADGE_MODES[transitKind]}
                shortName={badgeLabel({ agency: place.agency ?? '', shortName: route.shortName })}
                size="small"
              />
            ))}
            {place.routes.length > MAX_ROW_BADGES ? <Text style={styles.moreRoutes}>{`+${place.routes.length - MAX_ROW_BADGES}`}</Text> : null}
          </View>
        ) : null}
        {/* A stop: just its lines (its icon says what it is); a place, saved or not: the address that completes its name. */}
        {subtitle ? <Text numberOfLines={1} style={styles.resultSubtitle}>{subtitle}</Text> : null}
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

/** A transit line result: its badge, its name, and whose it is. */
function LineResultRow({ line, loading, onPress }: { line: IndexedLine; loading: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const label = badgeLabel({ agency: line.agencyDisplayName, shortName: line.shortName });
  return (
    <PressableScale
      accessibilityHint="Shows this line's stops and departures"
      accessibilityLabel={`${line.agencyDisplayName} ${label}, ${line.routeName}`}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.resultRow}
      testID={`search-line-${line.agencyId}-${line.routeId}`}
    >
      <View style={styles.lineBadge}>
        <RouteBadge agency={line.agencyDisplayName} color={line.color} mode={transitModeForAgency(line.agencyDisplayName)} shortName={label} size="small" />
      </View>
      <View style={styles.resultCopy}>
        <Text numberOfLines={1} style={styles.resultTitle}>{line.routeName || label}</Text>
        <Text numberOfLines={1} style={styles.resultSubtitle}>{line.agencyDisplayName}</Text>
      </View>
      {loading ? <ActivityIndicator size="small" testID={`search-line-loading-${line.agencyId}-${line.routeId}`} /> : null}
    </PressableScale>
  );
}

/** "Show 4 more lines" / "Show less", under a list cut short. */
function ShowMoreRow({ expanded, hiddenCount, noun, onToggle, testID }: { expanded: boolean; hiddenCount: number; noun: string; onToggle: () => void; testID: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <PressableScale accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={styles.showMore} testID={testID}>
      <Text style={styles.showMoreText}>{expanded ? 'Show less' : `Show ${hiddenCount} more ${noun}${hiddenCount === 1 ? '' : 's'}`}</Text>
      <Icon color={colors.primary} name={expanded ? 'collapse' : 'expand'} size={14} />
    </PressableScale>
  );
}

type MessageProps = {
  mood?: BeanMood;
  body: string;
  children?: ReactNode;
  title: string;
};

/** Centered empty/error/unavailable state, announced to assistive technology. */
function Message({ body, children, mood = 'curious', title }: MessageProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityLiveRegion="polite" style={styles.message} testID="search-message">
      <Mascot mood={mood} size={64} style={styles.messageMascot} />
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageBody}>{body}</Text>
      {children}
    </View>
  );
}

/** Full-screen destination search: search field pinned on top, a flat result list below. */
export function SearchView({ initialQuery = '', near, onAddSavedPlace, onCancel, onChooseOnMap, onSelect, onSelectCurrentLocation, onSelectLine, placeholder = 'Search line or address', savedPlaces = [] }: SearchViewProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [query, setQuery] = useState(initialQuery);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectionFailed, setSelectionFailed] = useState(false);
  // The line being opened (its stops are looked up first), as `agencyId:routeId`.
  const [openingLine, setOpeningLine] = useState<string | null>(null);
  const { user } = useAuth();
  const uid = user?.isAnonymous ? undefined : user?.uid;
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
  const clearHistory = () => {
    if (uid) for (const place of recentPlaces) removeSearch(uid, place.id).catch(() => undefined);
    setRecentsExpanded(false);
  };
  const [linesExpanded, setLinesExpanded] = useState(false);
  const [recentsExpanded, setRecentsExpanded] = useState(false);
  const { endSession, getSessionToken, retry, status, suggestions } = usePlacesSearch(query, near);
  const isSearching = status !== 'idle';
  const lines = useLineSearch(query, near, onSelectLine != null);
  // While typing, recent searches that match come first, as in Google Maps.
  // Saved places that match come before everything else, with their own icon and color.
  const matchingSaved = isSearching ? savedPlaces.filter((saved) => savedMatches(saved, query)).slice(0, MAX_MATCHING_SAVED) : [];
  const savedIds = new Set(matchingSaved.map((saved) => saved.address.placeId));
  const savedByPlaceId = new Map(savedPlaces.map((saved) => [saved.address.placeId, saved]));
  const matchingRecents = isSearching ? recentPlaces.filter((place) => !savedIds.has(place.id) && recentMatches(place, query)).slice(0, MAX_MATCHING_RECENTS) : [];
  const recentIds = new Set(matchingRecents.map((place) => place.id));
  const results = suggestions.filter((place) => !recentIds.has(place.id) && !savedIds.has(place.id));

  // Not an effect dependency, so a parent re-render (new onSelect identity) can't restart the request.
  const finishSelection = useEffectEvent((place: SearchPlace) => {
    endSession();
    rememberPlace(place);
    onSelect(place);
  });
  const getDetailsSessionToken = useEffectEvent(getSessionToken);

  // Resolves the picked suggestion; unmounting (e.g. Back) aborts it so a late answer can't navigate.
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
    // Pathly's own stops already know where they are: no details request.
    if (suggestion.source === 'pathly' && suggestion.location) {
      endSession();
      rememberPlace(suggestion);
      onSelect(suggestion);
      return;
    }
    setResolvingId(suggestion.id);
    setSelectionFailed(false);
  };

  const renderSearchState = () => {
    if (status === 'unconfigured') {
      return (
        <Message
          mood="worried"
          body="Place search is not set up for this build yet. Clear the search to pick a recent place."
          title="Place search is unavailable"
        />
      );
    }
    if (status === 'error') {
      return (
        <Message body="Check your connection and try again." mood="worried" title="Couldn't load places">
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
    if (results.length === 0) {
      return matchingSaved.length > 0 || matchingRecents.length > 0 || lines.length > 0 ? null : <Message body="Try a street address, a business, or a station name." title="No places found" />;
    }
    return results.map((place) => (
      <SearchResultRow
        key={place.id}
        near={near}
        onPress={() => selectSuggestion(place)}
        place={place}
        resolving={resolvingId === place.id}
        saved={savedByPlaceId.get(place.id)}
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
              <PressableScale
                accessibilityLabel="Back from search"
                accessibilityRole="button"
                hitSlop={6}
                onPress={onCancel}
                style={styles.backButton}
                testID="search-back"
              >
                <Icon color={colors.ink} name="back" size={22} />
              </PressableScale>
              <TextInput
                accessibilityHint="Type an address, station, or destination"
                accessibilityLabel="Search destinations"
                autoCapitalize="words"
                autoCorrect={false}
                autoFocus={true}
                onChangeText={changeQuery}
                placeholder={placeholder}
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
          </View>
          {/* "Choose on map" then saved places lead the page, under the search field, until the rider starts typing. */}
          {!isSearching && onChooseOnMap ? (
            <PressableScale
              accessibilityHint="Move the map to drop a pin anywhere"
              accessibilityLabel="Choose on map"
              accessibilityRole="button"
              onPress={() => {
                if (resolvingId) return;
                endSession();
                onChooseOnMap();
              }}
              style={[styles.resultRow, styles.chooseOnMapRow]}
              testID="search-choose-on-map"
            >
              <View style={styles.resultIcon}>
                <DestinationPinMarker scale={0.6} />
              </View>
              <View style={[styles.resultCopy, styles.chooseOnMapCopy]}>
                <Text numberOfLines={1} style={styles.resultTitle}>Choose on map</Text>
              </View>
            </PressableScale>
          ) : null}
          {!isSearching ? <SavedPlacesStrip onAdd={onAddSavedPlace} onSelect={(saved) => selectRecent(locationToPlace(saved.address))} places={savedPlaces} /> : null}
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

          {onSelectCurrentLocation && (!isSearching || query === initialQuery) ? (
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
                <Icon color={colors.primary} name="locate" size={20} />
              </View>
              <View style={styles.resultCopy}>
                <Text numberOfLines={1} style={styles.resultTitle}>Current location</Text>
              </View>
            </PressableScale>
          ) : null}

          {isSearching ? (
            <>
              {lines.length > 0 ? (
                <View testID="search-lines">
                  <Text accessibilityRole="header" style={styles.heading}>Lines</Text>
                  {(linesExpanded ? lines : lines.slice(0, VISIBLE_LINES)).map((line) => {
                    const key = `${line.agencyId}:${line.routeId}`;
                    return (
                      <LineResultRow key={key} line={line} loading={openingLine === key} onPress={() => {
                        if (openingLine) return;
                        setOpeningLine(key);
                        endSession();
                        // Its stops nearest the rider are looked up as it opens; a failure leaves search as it was.
                        void onSelectLine?.(line).catch(() => undefined).finally(() => setOpeningLine(null));
                      }} />
                    );
                  })}
                  {lines.length > VISIBLE_LINES ? (
                    <ShowMoreRow expanded={linesExpanded} hiddenCount={lines.length - VISIBLE_LINES} noun="line" onToggle={() => setLinesExpanded((open) => !open)} testID="search-lines-more" />
                  ) : null}
                  <Text accessibilityRole="header" style={styles.heading}>Places</Text>
                </View>
              ) : null}
              {matchingSaved.map((saved) => {
                const place = locationToPlace(saved.address);
                return <SearchResultRow near={near} key={`saved-${saved.id}`} onPress={() => selectRecent(place)} place={place} saved={saved} />;
              })}
              {matchingRecents.map((place) => (
                <SearchResultRow near={near} key={`recent-${place.id}`} onPress={() => selectRecent(place)} place={place} recent={true} saved={savedByPlaceId.get(place.id)} />
              ))}
              {renderSearchState()}
            </>
          ) : recentPlaces.length > 0 ? (
            <>
              <View style={styles.recentHeader}>
                <Text accessibilityRole="header" style={[styles.heading, styles.recentHeading]}>Recent</Text>
                <PressableScale accessibilityLabel="Clear recent searches" accessibilityRole="button" hitSlop={8} onPress={clearHistory} style={styles.clearHistory} testID="search-clear-history">
                  <Text style={styles.clearHistoryText}>Clear</Text>
                </PressableScale>
              </View>
              {(recentsExpanded ? recentPlaces : recentPlaces.slice(0, VISIBLE_RECENTS)).map((place) => (
                <SearchResultRow near={near} key={place.id} onPress={() => selectRecent(place)} onRemove={() => forgetPlace(place)} place={place} recent={true} />
              ))}
              {recentPlaces.length > VISIBLE_RECENTS ? (
                <ShowMoreRow expanded={recentsExpanded} hiddenCount={recentPlaces.length - VISIBLE_RECENTS} noun="recent search" onToggle={() => setRecentsExpanded((open) => !open)} testID="search-recents-more" />
              ) : null}
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
    gap: 4,
    paddingLeft: 4,
    paddingRight: 6,
    borderRadius: radii.pill,
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
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  // Its line runs the full width, like the one under the saved places strip.
  chooseOnMapRow: { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chooseOnMapCopy: { borderBottomWidth: 0 },
  lineBadge: { width: 40, alignItems: 'center' },
  // The badge brings its own color and ring.
  savedIcon: {
    backgroundColor: 'transparent',
  },
  showMore: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20 },
  showMoreText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 20 },
  recentHeading: { flex: 1 },
  clearHistory: { paddingVertical: 4 },
  clearHistoryText: { color: colors.primary, fontFamily: fontFamilies.extraBold, fontSize: 13 },
  resultIconColumn: { width: 48, alignItems: 'center', gap: 3 },
  resultDistance: { color: colors.mutedInk, fontFamily: fontFamilies.bold, fontSize: 10 },
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
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 2 },
  moreRoutes: { color: colors.mutedInk, ...typography.metadata, fontSize: 12 },
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
  messageMascot: { marginBottom: 12 },
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
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.onPrimary,
    ...typography.bodyStrong,
  },
});
