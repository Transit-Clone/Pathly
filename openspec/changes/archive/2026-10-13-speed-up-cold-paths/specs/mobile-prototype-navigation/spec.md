# Spec Delta

## ADDED Requirements

### Requirement: Route detail geometry is served from prepared data
A route's station sequence, headsign, scheduled stop offsets, and drawn line for each direction SHALL be prepared ahead of time whenever the backend's timetable data is prepared. A route-detail request SHALL then be answered without reading the route's full timetable or the agency's full shape data. The prepared answer SHALL be identical to the one derived from the full timetable. A route and direction with no scheduled trips SHALL still be reported as not found. When prepared data is absent, the backend SHALL still return the same geometry, derived from the full timetable, only more slowly.

#### Scenario: Opening a route on a freshly started backend
- **WHEN** a rider opens the Port Jefferson Branch route detail and the request lands on a freshly started backend instance
- **THEN** the station list and route line come back without the backend reading the LIRR's full stop-times or shapes data

#### Scenario: Prepared geometry matches the timetable
- **WHEN** the same route and direction is answered from prepared data and from the full timetable
- **THEN** both answers are identical, including headsign, stop order, stop offsets, and line points

#### Scenario: Direction with no trips
- **WHEN** a rider's app requests geometry for a route direction that has no scheduled trips
- **THEN** the backend reports it as not found, as it does today

### Requirement: Daily timetable updates keep prepared data
When the backend replaces a deployed timetable with a newer daily timetable, the newer timetable SHALL come with the same prepared data a deploy produces: the stop-to-routes index, the per-route stop times, and the route geometry. A freshly started backend instance using the daily timetable SHALL use that prepared data rather than scanning the full timetable. A daily timetable published before prepared data existed SHALL gain it at the next daily update, even when the agency's feed itself has not changed. If the prepared data for a daily timetable is missing, unreadable, or from an older format, the backend SHALL still answer correctly from that timetable's full data, only more slowly.

#### Scenario: Cold search on today's timetable
- **WHEN** the daily update has published a new subway timetable and a rider's nearby search lands on a freshly started backend instance
- **THEN** the search uses the prepared data for that timetable and does not scan the subway's full stop-times file

#### Scenario: Backfilling an existing timetable
- **WHEN** the daily update runs and an agency's current published timetable has no prepared data, but its feed is unchanged
- **THEN** prepared data is built and published for that timetable without changing which timetable version riders see

#### Scenario: Prepared data unavailable
- **WHEN** a backend instance loads a daily timetable whose prepared data is missing or fails verification
- **THEN** every request still returns the same results as before, read from the full timetable

### Requirement: The backend is warmed when the app opens
When the app starts with a signed-in rider, or a rider signs in, the app SHALL ask the nearby-search and route-detail backends to start preparing, without waiting for an answer and without showing anything to the rider. A warm-up SHALL NOT return transit data and SHALL count toward the rider's usage limits like any other request. The rider's first real nearby search and first route-detail request SHALL wait for the matching warm-up to finish, up to a limit, before they are sent. A warm-up that fails or exceeds the limit SHALL NOT delay or fail the real request beyond that limit. Each warm-up SHALL be sent at most once per app session and signed-in rider.

#### Scenario: App opens while the rider is still being located
- **WHEN** a signed-in rider opens the app and the backend has been idle
- **THEN** the backend begins starting up while the app waits for the rider's location, and the first nearby search arrives at the started backend rather than starting another one

#### Scenario: Warm-up fails
- **WHEN** the warm-up request fails or is rejected
- **THEN** the nearby search and route detail still load normally, and no error is shown for the warm-up

#### Scenario: Signed-out launch
- **WHEN** the app opens with no rider signed in
- **THEN** no warm-up is sent until a rider signs in
