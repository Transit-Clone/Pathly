# Design

## Context

See proposal.md for motivation, and the spec delta for the required behavior. The current state that shapes this design:

- `HomeScreen` owns all navigation state (`activeView`, `activeTrip`, `homeTab`, `selectedSearchTripId`) and renders one screen at a time. Unmounted screens lose their local state, which is why the favorite star in `SharedTripDetailView` (a local `useState`) resets.
- `pinnedRoutes` and `nearbyRoutes` are constant arrays in `data/transit.ts`, and together cover all five routes. `TAB_CONTENT_MIN_HEIGHT` is derived from their combined length.
- `RouteResultsView` keeps `leaveIndex` (which cycles through 3 labels) and a single `optionsOpen` flag shared by Modes and Filter. Itinerary times are hard-coded strings (`nextRide: 'Leaves in 4 min · 10:04 AM'`), and `PlannedTripDetailView` parses its departure out of that string.
- `CurrentLocationButton` has `onPress={() => undefined}`.
- The prerequisite change `refresh-icons-badges-and-detail-scroll` provides `Icon`, `RouteBadge`/`transitModeForAgency`, `DetailMapPage`, and the redesigned Recents card.

## Goals / Non-Goals

**Goals:**
- Keep one session state owner (`HomeScreen`), with detail screens as controlled components.
- Use pure, unit-testable time math for itinerary scheduling.
- Build the time wheel from React Native primitives only, so it works in Expo Go on Android, iOS, and web.

**Non-Goals:**
- Persisting across reloads, account sync, or a backend. The rider chose session-only state.
- Favoriting individual stops. The empty-state copy changes from "No favorite stops yet" to "No favorites yet".
- Real schedule data. Times are derived from the mock offsets.
- Date selection (today only).

## Decisions

### 1. Session state lives in `HomeScreen`, detail screens become controlled
`HomeScreen` adds the following state:
- `favoriteRouteIds: RouteId[]`
- `favoriteTrips: FavoriteTrip[]`, where `FavoriteTrip` is `{ kind: 'recent'; tripId }` or `{ kind: 'planned'; itineraryId; destination; time: TripTimeChoice }`
- `pinnedRouteIds: RouteId[]`, initially `['ronkonkoma']`
- `tripTime: TripTimeChoice`

It passes `isFavorite`/`onToggleFavorite` (and `isPinned`/`onTogglePin` for routes) down to `RouteDetailView` and `SharedTripDetailView`, whose local favorite and pin state is removed. Arrays keep the save order, which the Favorites tab needs.
- *Alternative considered:* a React Context store. With only two levels of prop passing that adds indirection for little gain, so it can be revisited if the tree deepens.

### 2. Nearby derives from pins
Nearby is derived in `TransitSheet`: `pinned = pinnedRouteIds.map(routeById)` and `nearby = allNearbyRoutes.filter(not pinned)`. `pinnedRoutes`/`nearbyRoutes` in the data file become a single `allNearbyRoutes` list plus the default pin id. `TAB_CONTENT_MIN_HEIGHT` uses `allNearbyRoutes.length`, so the resting height is unchanged.

**Follow-up:** the pinned group has no heading. `TransitCard` takes a `pinned` flag and draws a 12 px thumbtack, tilted 30°, in its top-right corner (`route-card-<id>-pinned`). It sits above the live signal's row, so the two never overlap.

### 3. Favorites tab
The tab has two sections, "Routes" (each rendered as a `TransitCard`, with test ID `favorite-route-<id>`) and "Trips" (the Recents card component from the prerequisite change, in a favorite variant without Go/End, with test ID `favorite-trip-<key>`). The empty state is shown when both lists are empty. Selecting a trip navigates as follows:
- A recent trip opens `recentTrip`.
- A planned trip opens `results` with the stored destination, sets `tripTime` to the stored time, and sets `selectedSearchTripId`.

`ActiveView` for results gains a `returnTo: 'search' | 'favorites'` field, so Back from a planned trip opened from Favorites returns to the Favorites tab.

### 4. Time model and itinerary scheduling
The time model is the following type:

```ts
type TripTimeChoice =
  | { mode: 'now' }
  | { mode: 'depart' | 'arrive'; minutes: number };
```

Here `minutes` counts from midnight. The mock "now" is 10:00 AM (`MOCK_NOW_MINUTES = 600`), which matches today's data. Each itinerary replaces its `nextRide` string with a `departureOffsetMinutes` of 4, 9, 6, or 11. A pure `scheduleItinerary(itinerary, choice)` returns `{ departure, arrival, label }`:
- **now:** departure is `600 + offset`, and the label is `Leaves in <offset> min · <time>`, identical to today's copy.
- **depart:** departure is `T + offset`, so it never departs before `T`.
- **arrive:** departure is `A − duration − offset`, and arrival is `A − offset`, so it always arrives at or before `A`.

Times wrap within 24 hours. The label for depart and arrive is `Departs <time> · Arrives <time>`. `PlannedTripDetailView` receives the scheduled departure instead of parsing strings, so the card and the detail times always agree. The control label reads `Leave now`, `Depart 10:30 AM`, or `Arrive by 12:00 PM`.

### 5. `LeaveTimeSheet`: a Modal with three snap wheels
The sheet is an RN `Modal` (`transparent`, `animationType="slide"`) containing:
- a three-segment selector (Leave now / Depart at / Arrive by)
- three `WheelColumn`s: hours 1–12, minutes 00–55 in steps of 5, and AM/PM
- Cancel and Done buttons

Each `WheelColumn` is a vertical `ScrollView` with an item height of 44, `snapToInterval` set to that height, top and bottom padding of two items, and a highlighted center band. The selected index is taken from `onMomentumScrollEnd` (plus `onScrollEndDrag` for web). Every item is also a `Pressable` that scrolls to and selects itself. That supports tapping, keyboard and screen-reader use, and tests. The wheels are disabled (dimmed) in "Leave now" mode. The initial value is the current choice, or 10:30 AM (or 12:00 PM for arrive-by) when coming from "now". Cancel or a backdrop press discards the draft, and Done commits it. The test IDs are `leave-time-sheet`, `leave-mode-<mode>`, `leave-hour-<n>`, `leave-minute-<nn>`, `leave-period-<am|pm>`, `leave-time-done`, and `leave-time-cancel`.
- *Alternative considered:* `@react-native-community/datetimepicker`. It adds a dependency, has no web wheel, and renders inconsistently per platform, so it was rejected.

### 6. Separate Modes and Filter panels
`optionsOpen: boolean` becomes `openPanel: 'modes' | 'filter' | null`. Modes shows three toggle chips (Subway, Bus, Rail with mode icons), stored in `enabledModes: Set<TransitMode>`, defaulting to all three. An itinerary is shown only if every segment's `transitModeForAgency(agency)` is enabled. When no itineraries remain, `results-empty` shows "No routes match these modes" and a "Show all modes" reset. At least one mode must stay on: the last enabled chip cannot be turned off. The Modes pill shows a count badge (for example `Modes · 2`) when the filter is active.

### 7. Location feedback
`CurrentLocationButton` gains an optional `selected`/`onPress` pair and falls back to internal state. When selected, it uses the `blueSoft` background and the filled `navigate` icon, and sets `accessibilityState={{ selected }}`. The home and results screens use the internal state.

## Risks / Trade-offs

- [Wheel snapping differs on web because `snapToInterval` is partly supported] → The tappable items and the scroll-end handler round to the nearest index, so selection stays correct even without snapping.
- [An arrive-by time earlier than 10:00 AM gives past departures] → This is acceptable for a prototype. The label still shows consistent times.
- [Losing Route Results input when navigating away] → `tripTime` is lifted to `HomeScreen`. The origin and destination text stay local, as they are today.
- [Test churn from controlled components] → Existing favorite and pin test IDs and accessibility states are kept. The tests exercise the flows through `HomeScreen`, which now owns the state.

## Follow-up: Results Without Go Buttons

The Go and End buttons were removed from the result cards, at the rider's request, to keep the list focused on comparison. Starting and ending a planned trip happens only on its detail screen. The results view still receives `onStartTrip` and `onEndTrip`, and passes them to `PlannedTripDetailView`.

