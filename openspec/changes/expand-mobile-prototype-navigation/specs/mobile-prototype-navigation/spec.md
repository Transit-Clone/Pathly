# Spec Delta

## Purpose

Defines the connected, mock-data-driven mobile prototype flows riders use to browse nearby service, inspect any route, plan a trip to a searched destination, revisit recent trips, and view placeholder account settings.

## ADDED Requirements

### Requirement: Home map and sheet coordinate without obstruction
The home screen SHALL omit the large `Nearby transit` heading and SHALL let riders move the lower sheet among minimized, compact, and expanded bounds. The minimized bound SHALL expose the full usable map while retaining a visible affordance for reopening the sheet. The map location control MUST NOT overlap sheet content at any bound.

#### Scenario: Rider minimizes nearby transit
- **WHEN** the rider drags the lower sheet to its lowest bound
- **THEN** the route list moves off the map, the map becomes fully visible, and a sheet handle remains available

#### Scenario: Rider expands nearby transit
- **WHEN** the rider drags the lower sheet upward
- **THEN** more route content becomes visible and the map location control moves clear of the sheet or is hidden

### Requirement: Live predictions use a wireless signal
Every live minute prediction SHALL display a compact two-arc wireless signal at the upper-right corner of its numeric time. Scheduled predictions SHALL display no wireless signal and SHALL retain their scheduled treatment.

#### Scenario: Live and scheduled values appear together
- **WHEN** a screen renders both live and scheduled predictions
- **THEN** only live values have the two-arc signal and scheduled values remain visually distinct without it

### Requirement: Home transit content includes recents and additional routes
The Recents tab SHALL contain mock destination trips rather than an empty state. Nearby transit SHALL include Suffolk County Transit 51 and MTA Subway 7 in addition to the existing routes, with direction and prediction data consistent with the current card model.

#### Scenario: Rider opens recent trips
- **WHEN** the rider selects the Recents tab
- **THEN** destination-oriented recent trip entries are shown and can be selected to view route results

#### Scenario: Rider browses nearby routes
- **WHEN** the nearby list is visible
- **THEN** route 51 and subway 7 appear alongside the existing route cards

### Requirement: Every nearby route opens route details
Every route card shown on the home screen SHALL be selectable and SHALL open a detail screen populated with that route's identity, direction, color, prediction tiles, alerts, map line, and stop timeline.

#### Scenario: Rider selects any route
- **WHEN** the rider selects an existing or newly added route card
- **THEN** a detail screen for that route opens instead of leaving the card inert

#### Scenario: Rider returns from route details
- **WHEN** the rider activates Back from any route detail
- **THEN** the home screen is restored

### Requirement: Search selection opens route results
Each destination match and recent search row SHALL be selectable and SHALL open a Route Results screen using the selected place as the destination and current location as the default origin.

#### Scenario: Rider selects a destination match
- **WHEN** the rider selects a visible search result
- **THEN** Route Results opens with the selected destination and mock transit itineraries

### Requirement: Route Results supports editable trip criteria
Route Results SHALL display separate origin and destination fields that can be changed locally at any time, dedicated leave-time and refresh icon controls at the top right, and selectable Fastest, Less transfers, and Cheapest preferences. Refresh SHALL preserve the current trip criteria and update the local results presentation without contacting a remote routing service.

#### Scenario: Rider changes an endpoint
- **WHEN** the rider edits the origin or destination field
- **THEN** the field's visible value updates and remains associated with the displayed trip criteria

#### Scenario: Rider changes route preference
- **WHEN** the rider selects Fastest, Less transfers, or Cheapest
- **THEN** that preference is visibly selected and matching mock itineraries are ordered with recommended results first

#### Scenario: Rider changes departure time or refreshes
- **WHEN** the rider uses the leave-time or refresh control
- **THEN** the screen provides visible local feedback while preserving the current origin, destination, and preference

### Requirement: Route Results presents comparable itineraries
Route Results SHALL show several recommended-first itinerary cards. Each card SHALL show colored boxes for its ordered transit route segments on the left, total fare and total trip duration on the right, and the next departure or ride timing along a full-width bottom timeline.

#### Scenario: Rider compares trip options
- **WHEN** Route Results is visible
- **THEN** at least three mock itineraries can be compared by routes, transfers, fare, duration, and next-ride timing

### Requirement: Profile control opens placeholder settings
The profile control on the home screen SHALL open a placeholder account/settings screen with basic settings rows and a visible Sign out action. Placeholder actions SHALL remain local and MUST NOT authenticate, persist account changes, or sign out of a real service.

#### Scenario: Rider opens and closes profile
- **WHEN** the rider selects the home profile control
- **THEN** the placeholder profile/settings screen opens and provides Back navigation to home

#### Scenario: Rider views account actions
- **WHEN** the profile/settings screen is visible
- **THEN** basic account and settings items including Sign out are displayed

### Requirement: Expanded prototype remains local
All route details, recents, trip results, preferences, refresh feedback, and profile settings introduced by this change SHALL use deterministic local mock data and component state.

#### Scenario: Prototype runs without backend route data
- **WHEN** the API is unavailable
- **THEN** the new navigation flows and mock content remain usable without displaying technical failure state
