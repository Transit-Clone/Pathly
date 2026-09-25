# Design

## Context

See `proposal.md` for motivation and `specs/mobile-ui-design/spec.md` for the visual contract. The current Expo/React Native prototype already has map-first home, destination-search, nearby-transit, and Ronkonkoma route-detail screens. Visual styling is defined independently inside component `StyleSheet` objects with shared colors in `mobile/src/theme/colors.ts`; there is no shared typography system or configured Nunito font.

The current palette is warmer and brighter than `docs/Design.ipynb`, and key transit information is undersized: nearby-card route names and arrival times are 14 and 15 pixels, departure choices are 15 pixels, and stop times are 13 pixels. The change must preserve current screen behavior and mock data.

## Goals / Non-Goals

**Goals:**

- Centralize the documented palette and a small Nunito type scale.
- Make route names and arrival or departure times dominant at a glance.
- Reduce redundant copy and decorative competition while retaining useful context.
- Keep layouts responsive within the existing phone-width and 540-pixel maximum-width behavior, including swiped directions and dragged sheet positions.
- Preserve accessible touch targets, labels, and semantic service-state communication.

**Non-Goals:**

- Implementing real maps, transit feeds, route planning, authentication, persistence, or new screens.
- Redesigning navigation, adding persistent state, or connecting controls to real services.
- Establishing production branding beyond the colors and typography specified by the design document.

## Decisions

### 1. Use the documented colors as semantic theme tokens

Replace the current branded tokens with the exact primary, accent, background, text, success, and warning values from `docs/Design.ipynb`. Retain only the additional neutral, border, shadow, map-road, water, and route-identity tokens needed by existing components, adjusting them to harmonize with the cool background.

Route identity and service state will be separate concerns. A route badge or map line may retain an identity color, while on-time states use success green and delayed, disrupted, or planned-work states use warning orange. This avoids the current behavior where a single accent controls the badge, arrival, and status chip.

Alternative considered: preserve the current beige/cobalt theme and change only font sizes. Rejected because it conflicts directly with the documented palette and would leave screens visually inconsistent with the stated Pathly identity.

### 2. Load Nunito once and expose named typography styles

Add Nunito through an Expo-compatible font package and load the required weights at the application root. Define a compact typography module with named roles such as display time, route title, screen heading, body, metadata, and label. Components will reference those roles instead of selecting unrelated font sizes and numeric weights ad hoc.

The initial implementation should include only weights actually used, favoring regular, semibold, bold, and extra-bold. Rendering waits until the fonts are ready so the interface does not flash between system and Nunito metrics.

Alternative considered: use the platform font with rounded styling. Rejected because the design document explicitly selects Nunito and platform fonts would vary across Android, iOS, and web.

### 3. Rebuild transit cards as route-colored direction pages

The nearby card will remove the route badge, use the route identity color across the container, and use this hierarchy:

1. Route or line name and numeric minute count: matching display size, approximately 24 pixels, extra-bold.
2. Direction.
3. Stop name.
4. Live GPS signal or subdued `Scheduled` provenance.

The minute unit is written as `minutes`, centered immediately below the number in a small font. Live predictions show a compact GPS signal beside the number; scheduled predictions have no signal and render the time group with slightly reduced opacity. Each route owns two horizontally paged direction records so the whole card can be swiped without duplicating the route.

Alternative considered: place all details in a single large text block. Rejected because it would weaken scanability and create denser wrapping on narrow devices.

### 4. Use minute prediction tiles on route detail

Keep the existing map, bottom sheet, and stop timeline. Replace clock-time departure selectors with multiple compact, square-ish minute tiles. Each tile uses a large number, small centered `minutes`, and either a GPS signal or subdued `Scheduled` label. Tiles are informational and have no selected/next-train captions. Add a service-alert control below them. Use one route identity color for the route card, map line, map stops, and timeline. Place current-location and pin icon controls at the top right; pin state remains local and non-persistent.

Map labels can remain smaller because they are secondary context, but essential sheet content should not rely on 8-10 pixel text. The layout must accommodate both current departures and current station names without horizontal clipping.

The stop timeline stays intact; only its prediction selector and surrounding visual controls change.

### 5. Make the home sheet draggable

Use React Native's built-in gesture responder and animated value to drag the transit sheet between bounded compact and expanded heights. The map remains behind the sheet and is progressively covered as the sheet grows; the top search/profile overlay remains fixed. Snap to the nearer bound on release and keep the grab handle at least 44 logical pixels tall as a touch target.

### 6. Remove redundant eyebrows and keep one clear heading per section

Remove or consolidate repeated pairs such as `AROUND YOU` plus `Nearby transit` and `DESTINATIONS` plus `Recent`. Retain concise labels where they add distinct meaning, such as service status or the purpose of a departure selector. Existing accessibility labels will continue to provide complete spoken context even where visible copy becomes shorter.

Alternative considered: keep every existing label but reduce its size. Rejected because smaller labels worsen legibility without reducing cognitive load.

### 7. Validate behavior and visual contracts separately

Preserve the existing interaction tests. Add focused assertions for important visible copy and semantic states, and test shared token values and key hierarchy styles where practical. Run lint, mobile tests, type-checking, and the Expo export after implementation. Perform a manual Android review at representative narrow and standard phone sizes because unit tests cannot establish visual balance or clipping.

## Risks / Trade-offs

- **Nunito loading adds dependency and startup work** -> Load fonts once at the app root, include only used weights, and keep the loading state minimal.
- **Large route names and times can crowd cards** -> Give the two display values dedicated columns, wrap route names when needed, and verify both direction pages at narrow Android widths.
- **Nested horizontal swipes and vertical scrolling can conflict** -> Page only when horizontal movement clearly exceeds vertical movement and keep route tapping available.
- **Dragging can move the sheet beyond usable bounds** -> Clamp animated height and snap to compact/expanded positions.
- **Removing labels may reduce context** -> Remove only duplicate visible language and retain distinct information plus complete accessibility labels.
- **Exact brand colors may reduce contrast in some combinations** -> Use dark text on light accent surfaces and white text only on colors that pass practical contrast review.
- **Visual tests can become brittle** -> Assert semantic tokens and critical hierarchy selectively, relying on device review for spacing and balance.

## Migration Plan

1. Add the typography dependency and shared theme/type roles.
2. Update common controls and surfaces to the new palette and Nunito roles.
3. Extend mock route data with two directions and live/scheduled prediction provenance.
4. Update nearby-transit cards and add horizontal direction paging.
5. Add bounded vertical sheet dragging while keeping top controls fixed.
6. Replace route-detail departure choices with minute prediction tiles, alerts, and location/pin controls.
7. Update focused tests and run the complete mobile validation suite.
8. Review gestures and existing flows on Android at narrow and standard phone sizes.

Rollback is limited to reverting the mobile theme, typography dependency, component-style, data-tone, and related test changes; no server or persisted-data migration is involved.
