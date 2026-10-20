# Spec Delta

## ADDED Requirements

### Requirement: Active navigation keeps the map-first trip hierarchy
Active navigation SHALL use the established stationary, interactive trip map with a focused guidance surface layered above it. The guidance surface SHALL make the current action most prominent and SHALL also expose the next known action or stop, line identity when applicable, remaining stops when known, and arrival time without requiring the rider to expand the full itinerary. `END`, Back, and current-location controls SHALL remain reachable at every scroll position. Departure-choice controls SHALL NOT appear after navigation has started.

Using Back SHALL leave the session active and reveal a prominent Resume trip control on Home. Labels and state changes for current action, next action, remaining stops, arrival, location status, Resume, and End SHALL be available to assistive technology and SHALL not rely on color alone.

#### Scenario: Navigation starts
- **WHEN** the rider presses `GO` from the redesigned planned-trip detail
- **THEN** the map-first active-navigation view opens with the current action, next known action, arrival time, and persistent trip controls

#### Scenario: Rider returns Home
- **WHEN** the rider backs out of active navigation without ending it
- **THEN** Home identifies the active destination and offers a prominent Resume trip control

#### Scenario: Active trip is read by a screen reader
- **WHEN** assistive technology focuses the navigation status
- **THEN** the current action, next action, remaining stops when known, and arrival time are announced with meaningful labels

### Requirement: Active trip map follows the shared navigation location
The active trip map SHALL draw an explicit rider marker from Pathly's shared location source on native and web, including an admin mock location; it SHALL NOT rely solely on a platform location dot that can disagree with the app's location source. While follow mode is active, credible location updates SHALL keep the rider and immediate upcoming route in view. Panning or zooming SHALL pause follow mode, and activating the current-location control SHALL resume it.

The map SHALL visually distinguish completed route portions, the current leg or segment, and upcoming route portions without hiding the real path, board/alight markers, destination, or known intermediate stops. If location becomes unavailable, the last known marker SHALL remain visually stale and the guidance surface SHALL communicate the location state instead of moving the marker to a default point.

#### Scenario: Real location advances
- **WHEN** the rider moves along the active itinerary with follow mode enabled
- **THEN** the explicit rider marker and camera advance while the completed path is subdued and the current segment remains emphasized

#### Scenario: Admin simulates movement
- **WHEN** an admin moves the shared mock location to a later itinerary checkpoint
- **THEN** the same marker and follow behavior used for a real location update appear on both native and web

#### Scenario: Rider explores the map
- **WHEN** the rider pans or zooms the active trip map
- **THEN** the camera stops following until the current-location control is activated

#### Scenario: Location is lost
- **WHEN** the app cannot obtain a current location after previously locating the rider
- **THEN** the last known marker stays in place with a stale treatment and navigation reports that live location is unavailable
