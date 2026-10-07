# Spec Delta

## ADDED Requirements

### Requirement: Home map keeps the rider's view
The home map SHALL center on the rider when their first location fix arrives and whenever the rider presses the location button. Later location updates SHALL move the rider's location dot but SHALL NOT move the map. After the rider pans or zooms the map, it SHALL stay where they left it until they press the location button again.

#### Scenario: Rider pans away and waits
- **WHEN** the rider drags the home map away from their location and several GPS updates arrive over the next minute
- **THEN** the map stays where the rider left it, and only the blue dot moves

#### Scenario: Rider recenters
- **WHEN** the rider then presses the location button
- **THEN** the map centers on their current location

### Requirement: Live data is fetched only for visible routes
The app SHALL request live departures and vehicles only for routes the rider can currently see:
- home transit cards on screen in the active tab;
- the open route detail.

Routes that leave the screen SHALL stop being refreshed and SHALL keep their last loaded data, so a card scrolled back into view shows that data immediately. A route that comes into view SHALL be requested right away and then refreshed on the normal interval while visible. Routes on inactive tabs or hidden screens SHALL NOT be requested.

#### Scenario: Rider sees the first cards
- **WHEN** the home screen shows three Nearby cards and the rider's location has 20 nearby routes
- **THEN** live data is requested for the visible cards' routes, not all 20

#### Scenario: Rider scrolls the list
- **WHEN** the rider scrolls Nearby to reveal more cards
- **THEN** the newly visible cards' routes are requested right away, and routes scrolled out of view stop refreshing but keep their last times

#### Scenario: Rider opens a route
- **WHEN** the rider opens a route detail
- **THEN** that route keeps refreshing while the detail is open, and the home cards behind it are not refreshed
