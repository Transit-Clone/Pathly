# Spec Delta

## MODIFIED Requirements

### Requirement: Real transit trip planning
Route Results SHALL show real public-transit itineraries between the chosen origin and destination, computed by a routing service that knows the region's transit schedules (subway, bus, commuter rail, and walking between them). A single search SHALL offer several alternatives when the routing service has them, typically up to four. Each itinerary SHALL describe its ordered steps:
- walking steps, with duration and distance;
- transit steps, with the operating agency, the line's name, short name, and color, the vehicle type, the headsign, the boarding and alighting stops with their scheduled times, and the number of stops ridden. When the step matches a scheduled trip in the app's own timetables, it SHALL also list the stops in between, in order, with each stop's name, location, and scheduled time. A step SHALL be matched only when one scheduled trip of a line serving both stops leaves the boarding stop within 2 minutes of the routing service's departure time and reaches the alighting stop after it; otherwise it SHALL carry no intermediate stops rather than a guessed list.

Each itinerary SHALL also give its total duration, its departure and arrival times, its number of transfers, and a fare:
- the routing service's own fare, when it has one for every step;
- otherwise, the fare the app computes from the agencies' published fares: the NYC subway and local bus, NICE, and Suffolk County Transit flat fares with their transfer rules, and the LIRR's zone-to-zone peak and off-peak fares. A computed fare SHALL be the full adult one-way fare and SHALL be shown like the routing service's fares, not marked as approximate;
- when any step's agency or LIRR station has no published fare the app knows, the itinerary SHALL say the fare is unavailable rather than show an invented number.

When the origin is "Current location", the rider's current position SHALL be used. When that position is unknown, Route Results SHALL ask the rider to choose an origin instead of planning from a guessed location.

Requests SHALL go through the app's backend, so routing credentials never ship in the app. Requests SHALL be limited to signed-in riders, rate-limited per rider, and restricted to endpoints within the app's service area.

#### Scenario: Rider plans a real trip
- **WHEN** the rider at Stony Brook University chooses Penn Station as the destination with "Leave now"
- **THEN** Route Results lists real itineraries, such as LIRR via Ronkonkoma or Port Jefferson Branch trains, with real departure and arrival times after now, and each card's steps match the trip the routing service returned

#### Scenario: Several ways to go
- **WHEN** the routing service returns a primary itinerary and three alternatives
- **THEN** all four appear as separate cards, with no duplicates

#### Scenario: Fare computed from published fares
- **WHEN** the routing service gives no fare for an itinerary that rides Suffolk bus 51 and then the LIRR from Ronkonkoma to Penn Station off-peak
- **THEN** the card shows the Suffolk fare plus the LIRR off-peak fare for those two stations' zones, with no "~" or estimate marker

#### Scenario: Fare is unknown for a step
- **WHEN** an itinerary uses an agency the app has no published fare for
- **THEN** that card shows that the fare is unavailable instead of a number

#### Scenario: Location unknown for a "Current location" origin
- **WHEN** the origin is "Current location" and the rider's location is unavailable
- **THEN** Route Results asks the rider to choose a starting point and does not request trips

#### Scenario: Endpoint outside the service area
- **WHEN** an endpoint lies outside the NYC, Nassau, and Suffolk service area
- **THEN** no trips are requested and Route Results explains that the trip is outside the area Pathly covers

#### Scenario: Stops in between come from the timetable
- **WHEN** a planned trip rides the LIRR Port Jefferson Branch from Stony Brook to Huntington, and the timetable has that departure
- **THEN** the transit step lists the stops between Stony Brook and Huntington with their scheduled times, and their number matches the step's stop count

#### Scenario: A leg with no timetable match
- **WHEN** a transit step is on an agency whose timetable the app doesn't have, or no scheduled trip fits its departure time
- **THEN** the step carries its stop count and no intermediate stops
