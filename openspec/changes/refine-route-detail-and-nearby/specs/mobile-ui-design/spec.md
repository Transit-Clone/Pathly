# Spec Delta

## ADDED Requirements

### Requirement: Prediction tile timing
Route-detail prediction tiles SHALL show at least three upcoming departures per direction whenever the schedule has them, including departures from the next service day. Tiles SHALL be fixed width, a third of the row, so a single departure never fills the whole row.

Each tile's value SHALL follow these rules:
- A departure leaving now SHALL read `0` with its `minutes` label rather than "Due".
- Departures already past SHALL NOT be shown; the next departures fill their place.
- Departures 60 minutes or more away SHALL show their clock time, for example `5:00` with `PM` as the small label, instead of a minute count.

The same rules SHALL apply to the times on home transit cards.

#### Scenario: Only one train is being tracked
- **WHEN** a route's live feed tracks one upcoming vehicle and the timetable has more departures
- **THEN** three tiles are shown: the live one, then the next scheduled departures

#### Scenario: Departure is leaving now
- **WHEN** a departure's countdown reaches zero
- **THEN** its tile reads `0 minutes`, and once it has passed it is replaced by the next departure

#### Scenario: Late-night gap
- **WHEN** the next departure is 124 minutes away
- **THEN** its tile shows the departure's clock time, such as `5:00 PM`

### Requirement: Scheduled tiles read as untracked
Prediction tiles for timetable (non-GPS) departures SHALL be noticeably more transparent than live tiles. Their opacity SHALL be about half that of live tiles, while keeping the `Scheduled` pill legible. Every prediction tile SHALL have a thicker route-colored border (3 pt).

#### Scenario: Live and scheduled side by side
- **WHEN** a live tile and a scheduled tile are shown together
- **THEN** the scheduled tile is clearly fainter than the live tile, and both have the thicker border

### Requirement: Destination-only direction labels
Route detail headings, direction controls, and home transit cards SHALL name a direction by its destination or last stop only, for example "Penn Station" or "Patchogue". They SHALL NOT use compass or relative prefixes such as "Westbound to", "Eastbound to", "Uptown", or "Toward".

#### Scenario: Rider reads a direction
- **WHEN** the rider views the Port Jefferson Branch going west
- **THEN** the direction reads "Penn Station", not "Westbound to Penn Station"

### Requirement: Transit card titles use the route's short name
A home transit card's main text SHALL be the route's short name as published by its agency, for example "51", "E", or "PJ". It SHALL fall back to the route's full name only when no short name exists. The full name SHALL remain in the card's accessibility label.

#### Scenario: Bus route card
- **WHEN** Suffolk County Transit route 51 appears in Nearby
- **THEN** its card's main text is "51"

### Requirement: Single save control and no fare row on route detail
The route-detail top-right controls SHALL be current location and a single Save star (no pin). The route-detail page SHALL NOT show a fare row for any route.

#### Scenario: Rider opens any route detail
- **WHEN** the rider opens a route detail
- **THEN** they see the current-location and star controls only, and no fare row

### Requirement: Real track geometry for every live route
Every live route map SHALL draw its line along the agency's published track or street geometry (GTFS shapes) for the selected direction, served by the backend with the route's stop list. The app SHALL NOT bundle hand-made or route-specific geometry. When a route publishes no shape, the line SHALL join its stops in order.

#### Scenario: Rider views a bus route
- **WHEN** the rider opens Suffolk County Transit route 51
- **THEN** its map line follows the streets the bus actually uses

#### Scenario: Rider switches direction
- **WHEN** the rider switches to the other direction of a route whose two directions run on different streets
- **THEN** the map line changes to that direction's shape

### Requirement: Transfers show other modes only
A stop's transfer chips SHALL list only lines of a different agency or mode than the route being viewed. For example, an LIRR route's stops list subway and bus connections but not other LIRR branches. Stops left with no qualifying transfers SHALL show no chips.

#### Scenario: LIRR station with branches and buses
- **WHEN** an LIRR stop is served by other LIRR branches and by a bus route
- **THEN** only the bus chip is shown

### Requirement: Home map center search
When the rider pans the home map away from their location, a purple circle SHALL appear fixed at the center of the visible map area. After the map comes to rest, the Nearby list SHALL refresh to show routes near that center point. Returning to the rider's location, with the location button, SHALL hide the circle and restore Nearby to the rider's surroundings. While the center search is loading, the existing list SHALL stay visible with a loading indicator.

#### Scenario: Rider explores another area
- **WHEN** the rider drags the home map to Hicksville and lets go
- **THEN** a purple circle marks the map center and Nearby updates to routes near Hicksville

#### Scenario: Rider returns to their location
- **WHEN** the rider presses the location button
- **THEN** the circle disappears and Nearby shows routes near the rider again

### Requirement: Inverted live vehicle markers
A live vehicle marker on a route map SHALL be a white circle with a route-colored border and a route-colored mode glyph. Its corner freshness badge SHALL be a route-colored circle with white age text and a white outline, so it stays distinct from both the marker and the map. Vehicle markers SHALL stay clearly distinguishable from stop dots: they are more than twice the diameter (34 pt versus 14 pt), carry a mode glyph that stop dots never have, and are drawn above them. These colors SHALL be used on both native and web.

#### Scenario: Rider spots a live train
- **WHEN** a live Port Jefferson Branch train is on the map
- **THEN** it appears as a white circle with a purple border and purple train glyph, clearly larger than the stop dots, with a purple circle at its top-right reading its age (for example `12s`) in white

### Requirement: Fast first load of live data
Each live route's departures SHALL be fetched with a single backend request that resolves the rider's nearest stop and its departures together. Route detail SHALL request its stop list and track shape in parallel with live data, not after it. A home card SHALL show its first departures without waiting for other routes' requests.

#### Scenario: Rider opens the app
- **WHEN** the home screen loads several nearby routes
- **THEN** each card fills in as soon as its own single request returns, independent of the others
