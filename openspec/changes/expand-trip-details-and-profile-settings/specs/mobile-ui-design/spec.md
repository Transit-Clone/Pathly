# Spec Delta

## ADDED Requirements

### Requirement: Consistent trip-detail presentation
Planned and recent trip-detail screens SHALL use the same Pathly map-first presentation, route identity treatment, prominent fare and duration summary, obvious leave and arrive times, map actions, anchored trip action, and individually separated route-leg cards. Recent trips SHALL remain visually distinguishable through completed-trip context, historical timing, and recency information without reverting to a different layout system.

#### Scenario: Rider compares planned and recent details
- **WHEN** a rider opens a planned trip and then opens a recent trip
- **THEN** both screens use the same information hierarchy and controls while the recent trip clearly communicates that its displayed journey is historical

#### Scenario: Rider reviews transfers
- **WHEN** a trip contains more than one transit leg
- **THEN** every leg is displayed in a distinct card with its own route identity, boarding or transfer context, direction, duration, endpoints, and times

### Requirement: Continuous trip-detail map scroll
Each planned and recent trip-detail screen SHALL behave as one normal vertical page in which downward scrolling reveals more trip content while showing progressively less of the map, and upward scrolling restores the map. The detail content SHALL remain visible initially, and the trip action SHALL remain anchored immediately above the content boundary without introducing draggable bounds, snap states, or a resize handle.

#### Scenario: Rider reveals trip legs
- **WHEN** the rider scrolls downward on a trip-detail screen
- **THEN** additional summary and route-leg content enters the viewport while progressively less of the map remains visible

#### Scenario: Rider restores the trip map
- **WHEN** the rider scrolls upward toward the beginning of a trip-detail screen
- **THEN** the map becomes visible again without reversing the requested scroll direction

#### Scenario: Trip content remains discoverable initially
- **WHEN** a planned or recent trip-detail screen first opens
- **THEN** the map and the beginning of the trip information are both visible and the trip action is anchored above the content boundary
