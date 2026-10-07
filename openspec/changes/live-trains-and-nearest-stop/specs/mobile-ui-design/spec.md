# Spec Delta

## ADDED Requirements

### Requirement: Live train freshness
On a live route map, each live train marker SHALL carry a small circular badge at its top-right corner showing how long ago that train's own GPS position was reported. The age SHALL read in whole seconds under a minute (for example `3s`), whole minutes under an hour (for example `1m`), and whole hours beyond that. The age SHALL count up every second between data refreshes. Live train data SHALL refresh about every 15 seconds while a live route is on screen. Trains whose last reported position is more than 5 minutes old SHALL NOT be shown.

#### Scenario: Rider checks how fresh a train is
- **WHEN** a live train is on the map
- **THEN** a circular badge on its top-right shows how long ago it reported, for example `3s`, and the number keeps counting up until the next refresh moves the train and resets the age

#### Scenario: Stale train is hidden
- **WHEN** a train's last reported position is more than 5 minutes old
- **THEN** it does not appear on the map

### Requirement: Live trains follow the selected direction
A live route map SHALL show only the live trains traveling in the route-detail screen's currently selected direction. Switching direction SHALL switch the trains shown.

#### Scenario: Rider switches direction
- **WHEN** the rider swipes from the westbound predictions to the eastbound predictions
- **THEN** the map hides the westbound trains and shows only eastbound trains

### Requirement: Live route map opens on the nearest station
When the rider's location is known, a live route map SHALL open centered and zoomed on the route's station nearest to the rider. That station's dot SHALL be visually emphasized. When location is unavailable or permission is denied, the map SHALL use the default station (Stony Brook). If the rider's location becomes known after the map opens, the map SHALL move to the nearest station unless the rider has already moved the map.

#### Scenario: Rider near Stony Brook opens the route
- **WHEN** a rider whose GPS position is closest to Stony Brook opens the Port Jefferson Branch route detail
- **THEN** the map is centered on the Stony Brook station at street-level zoom and its dot is emphasized

#### Scenario: Location denied
- **WHEN** location permission is denied
- **THEN** the map centers on Stony Brook
