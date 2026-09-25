# Spec Delta

## Purpose

Defines a consistent, concise, and glanceable visual system for Pathly's existing mobile screens so riders can identify routes and transit times immediately.

## ADDED Requirements

### Requirement: Pathly visual palette
The mobile interface SHALL use the design-document palette for branded and semantic UI: primary `#0B4F9C`, accent `#A7D8FF`, background `#F7FAFF`, text `#1F2937`, success `#16A34A`, and warning `#F97316`.

#### Scenario: Existing screens use the documented palette
- **WHEN** a user opens the home, destination-search, or route-detail screen
- **THEN** branded surfaces, text, selections, successful service states, and warning states use their corresponding documented colors

#### Scenario: Service state is independent from route identity
- **WHEN** a transit route has an on-time or disrupted status
- **THEN** its status uses the appropriate success or warning color without changing the route or line identity color

### Requirement: Nunito typography
The mobile interface SHALL render user-visible application text in Nunito using a consistent hierarchy of supported font weights.

#### Scenario: Mobile screen typography is consistent
- **WHEN** a user views any existing mobile screen
- **THEN** headings, transit information, controls, and supporting labels render in Nunito rather than relying on the platform default font

### Requirement: Glanceable nearby-transit hierarchy
Each nearby-transit card SHALL use the route identity color as its container background, omit a separate route icon, and give the route name and minute count equal top visual priority. Content order SHALL be route name, direction, stop name, then supporting timing provenance. The route name and minute count SHALL each render at no less than 22 logical pixels, with contrast-safe white text when dark text is not readable.

#### Scenario: Rider scans nearby transit
- **WHEN** the nearby-transit list is visible
- **THEN** the rider can identify each route or line name and its arrival or departure time before reading supporting details

#### Scenario: Supporting information remains available
- **WHEN** a nearby-transit card is shown
- **THEN** its direction and stop name remain present in that order beneath the route name

#### Scenario: Live and scheduled times are distinct
- **WHEN** a prediction is GPS-tracked
- **THEN** the numeric time is followed by a small centered `minutes` label and a GPS signal appears beside the time
- **WHEN** a time is scheduled rather than live
- **THEN** the time group is slightly transparent, shows `Scheduled`, and has no GPS signal

### Requirement: Two directions per nearby route
Each nearby route SHALL expose two mock directions within the same card through a horizontal swipe or equivalent paged gesture, without duplicating the route as a separate list item.

#### Scenario: Rider changes route direction
- **WHEN** a rider swipes a route card horizontally
- **THEN** the card displays the other direction's direction, stop name, minute prediction, and live-or-scheduled state while retaining the route identity

### Requirement: Adjustable home transit sheet
The lower home sheet SHALL be vertically draggable between compact and expanded bounds. As it expands, it SHALL cover more of the map while the search and profile controls remain fixed at the top.

#### Scenario: Rider reveals more nearby routes
- **WHEN** the rider drags the sheet handle upward or downward
- **THEN** the sheet settles within its supported expanded or compact range and the map remains visible behind it

### Requirement: Glanceable route-detail hierarchy
The route-detail screen SHALL emphasize the route name, multiple square-ish minute prediction tiles, and stop times over metadata while preserving the route map and ordered stop timeline. Prediction tiles SHALL display a large numeric minute count, a small centered `minutes` label, and either a nearby GPS signal for live data or a `Scheduled` label with reduced opacity for timetable data. They SHALL NOT display `Selected` or `Next train` captions.

#### Scenario: Rider chooses a departure
- **WHEN** multiple arrivals or departures are displayed
- **THEN** each minute prediction is independently readable and visibly identified as live or scheduled without a selected state

#### Scenario: Rider scans route stops
- **WHEN** the stop timeline is visible
- **THEN** stop names and their associated times are readable at a glance and remain aligned with the correct timeline entries

#### Scenario: Route controls and alerts are available
- **WHEN** the route-detail screen is visible
- **THEN** current-location and pin controls appear at the top right, a service-alert control appears below the prediction tiles, and the route color matches the map line and timeline

### Requirement: Concise screen presentation
The existing home, search, and route-detail screens SHALL avoid redundant headings and nonessential labels while retaining the context required to understand each screen and control.

#### Scenario: Section heading has no duplicate eyebrow
- **WHEN** a section's primary heading already communicates its purpose
- **THEN** the interface does not repeat that meaning in an additional uppercase eyebrow label

#### Scenario: Existing navigation remains recognizable
- **WHEN** concise copy and visual treatments are applied
- **THEN** search, tab selection, back navigation, route selection, and departure selection remain clearly identifiable and usable

### Requirement: Prototype scope remains local
The visual update SHALL preserve the current screens and navigation paths while using only local mock data and local UI state for new gestures and controls.

#### Scenario: Existing prototype flows remain available
- **WHEN** the visual update is complete
- **THEN** users can still open destination search, switch nearby-transit tabs, open the Ronkonkoma route, inspect predictions, and return home
