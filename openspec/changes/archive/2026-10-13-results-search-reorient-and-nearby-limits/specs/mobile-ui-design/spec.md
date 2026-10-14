# Spec Delta

## MODIFIED Requirements

### Requirement: Rider location on the live route map
A live route map SHALL show the rider's current location when it is known. The route-detail screen SHALL offer two separate map controls in its top-right column:
- the current-location control, which SHALL behave like the home screen's: pressing it SHALL refresh the rider's location, center the live map on it, and enter its selected state;
- a crosshair route-overview control, labeled for assistive technology as showing the whole route: pressing it SHALL fit the live map to the entire line in the selected direction, with every stop visible, and enter its selected state, without refreshing the rider's location.

Only one of the two SHALL be selected at a time; pressing one SHALL clear the other. Panning the map afterwards SHALL clear both. When location permission is denied, the map SHALL show no rider marker, pressing the current-location control SHALL still give its selected-state feedback without moving the map, and the route-overview control SHALL still fit the route.

#### Scenario: Rider finds themselves on the route map
- **WHEN** the rider presses the current-location control on the Port Jefferson Branch route detail
- **THEN** the map centers on the rider's location marker and the control shows its selected state

#### Scenario: Rider returns to the whole route
- **WHEN** the rider has zoomed into one station and presses the crosshair control
- **THEN** the map zooms out to show the whole branch from end to end in the selected direction, the crosshair shows its selected state, and the current-location control is not selected

#### Scenario: Rider pans away
- **WHEN** the rider drags the map after using either control
- **THEN** neither control is selected

## ADDED Requirements

### Requirement: Reorient button on the home map
When the rider rotates or tilts the home map (for example with a two-finger twist), a round compass button SHALL appear near the current-location control, with its needle pointing to true north. Activating it SHALL animate the map back to north-up and flat, keeping the current center and zoom, after which the button SHALL hide. The button SHALL NOT appear while the map is north-up and flat. Maps that cannot be rotated (the web map) SHALL never show it.

#### Scenario: Rider twists the map
- **WHEN** the rider rotates the home map so north points to the right
- **THEN** a compass button appears with its needle pointing right, toward north

#### Scenario: Rider reorients
- **WHEN** the rider taps the compass button
- **THEN** the map turns back to north-up and flat at the same place and zoom, and the button disappears
