# Spec Delta

## ADDED Requirements

### Requirement: Rider location on the live route map
A live route map SHALL show the rider's current location when it is known. The route-detail current-location control SHALL behave like the home screen's:
- pressing it SHALL refresh the rider's location, center the live map on it, and enter its selected state;
- panning the map afterwards SHALL clear the selected state.

When location permission is denied, the map SHALL show no rider marker, and pressing the control SHALL still give its selected-state feedback without moving the map.

#### Scenario: Rider finds themselves on the route map
- **WHEN** the rider presses the current-location control on the Port Jefferson Branch route detail
- **THEN** the map centers on the rider's location marker and the control shows its selected state

#### Scenario: Rider pans away
- **WHEN** the rider drags the map after centering on their location
- **THEN** the current-location control returns to its unselected state

### Requirement: Stop timeline starts at the rider's station
For a route with live data, the route-detail stop timeline SHALL begin at the station nearest to the rider. It SHALL list the remaining stations in the selected direction through the end of the line. Stations behind the rider in that direction SHALL NOT be listed. Switching direction SHALL switch the list to the stations ahead in the new direction. The first row's time SHALL equal now plus the first prediction.

#### Scenario: Rider at Stony Brook heading west
- **WHEN** a rider nearest Stony Brook views westbound predictions
- **THEN** the stop list starts at Stony Brook and continues through every westbound station to Penn Station, without Port Jefferson

#### Scenario: Rider switches to eastbound
- **WHEN** the same rider swipes to eastbound
- **THEN** the stop list shows Stony Brook then Port Jefferson

### Requirement: Stop transfers
Each station row in a live route's stop timeline SHALL show the other transit lines a rider can transfer to there, as small chips below the station name. Transfers include:
- other LIRR branches serving the same station;
- subway lines and bus routes stopping within a short walk (about 400 m).

Each chip SHALL show the line's short name in the agency's route color when one is published. Chips SHALL be ordered rail, then subway, then bus. A row SHALL show at most eight chips followed by a `+N` count for the rest. The row's accessibility label SHALL list every transfer. Stations with no transfers SHALL show no chips. Transfer data SHALL come from the agencies' official static GTFS feeds, through a re-runnable generation script.

#### Scenario: Rider sees the bus at Smithtown
- **WHEN** Smithtown appears in the stop list
- **THEN** its row shows Suffolk County Transit route chips including `56`

#### Scenario: Busy station is summarized
- **WHEN** a station such as Jamaica has more than eight transfers
- **THEN** its row shows eight chips and a `+N` count, and its accessibility label names every transfer
