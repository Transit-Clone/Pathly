# Spec Delta

## MODIFIED Requirements

### Requirement: Glanceable route-detail hierarchy
The route-detail screen SHALL show the active direction's destination as the primary heading directly above the prediction tiles, with route identity carried by the route badge and color. It SHALL emphasize the destination, multiple square-ish minute prediction tiles, and stop times over metadata while preserving the route map and ordered stop timeline.

The destination heading SHALL be the direction control: swiping it horizontally (or dragging it with a mouse on web) SHALL switch to the other direction, and page dots beside the heading, on the same row, SHALL show which direction is active and switch direction when tapped. The heading, dots, and tiles SHALL sit close together without large empty gaps. The prediction tiles SHALL sit in their own horizontal scroll for the active direction, separate from the direction control, so scrolling the tiles never changes direction and swiping the heading never scrolls the tiles.

Prediction tiles SHALL display a large numeric minute count centered above a small centered `minutes` label. Each tile SHALL show either a live GPS signal beside the number or, for timetable data, a `Scheduled` label on a rounded, filled pill that contrasts with both plain and route-colored tiles and sits clearly separated from the `minutes` label rather than crowding it. Every tile SHALL keep the same layout, so the `Scheduled` pill never shifts the number or `minutes` label. Tiles SHALL NOT display `Selected` or `Next train` captions.

A service-alert control SHALL appear below the prediction tiles only when the route has an active advisory; when the route reports no delays, no alert control or dropdown SHALL be shown. Each stop timeline row SHALL show only the stop name and its time, without captions such as `Departs`, `Scheduled stop`, or `Final stop`, and the divider between rows SHALL run beneath both the name and the time. Each row's accessibility label SHALL still say whether the time is a departure or an arrival.

#### Scenario: Rider chooses a departure
- **WHEN** multiple arrivals or departures are displayed
- **THEN** each minute prediction is independently readable and visibly identified as live or scheduled without a selected state

#### Scenario: Rider scans route stops
- **WHEN** the stop timeline is visible
- **THEN** each row shows only the stop name and its time, aligned with the correct timeline entry, with no `Departs`, `Scheduled stop`, or `Final stop` caption, and the divider below each row extends under the time

#### Scenario: Route controls and alerts are available
- **WHEN** the route-detail screen is visible for a route with an active advisory
- **THEN** current-location and Save controls appear in a vertical column at the top right, a service-alert control that expands to show the advisory appears below the prediction tiles, and the route color matches the map line and timeline

#### Scenario: Route has no delays
- **WHEN** the route-detail screen is visible for a route that reports no delays
- **THEN** no service-alert control or dropdown is shown, and the stop timeline follows the prediction tiles directly

#### Scenario: Rider reads where the route goes
- **WHEN** the rider swipes the destination heading "Penn Station" to the left
- **THEN** the heading changes to the other direction's destination, the page dots beside the heading move, and the tiles, map, and stop list switch to that direction

#### Scenario: Rider scrolls departures without changing direction
- **WHEN** the rider scrolls the prediction tiles horizontally
- **THEN** later departures for the same direction come into view and the heading and active direction stay the same

#### Scenario: Live and scheduled tiles line up
- **WHEN** live and scheduled tiles appear side by side
- **THEN** their numbers and `minutes` labels sit at the same height and are horizontally centered, with the `Scheduled` pill below them and visible space between the pill and the `minutes` label

### Requirement: Prediction tile timing
Route-detail prediction tiles SHALL show up to six upcoming departures per direction whenever the schedule has them, including departures from the next service day. Tiles SHALL be tall, narrow rectangles of fixed width (taller than wide on every screen size), about three and a half across a phone-width row and more on wider screens, so the next tile peeks in to show the row scrolls, a single departure never fills the whole row, and the rest are reached by scrolling the tiles horizontally. A minute count SHALL be shown in large type (at least 40 pt) as the tile's dominant element; a clock time such as `12:04` MAY use a smaller size so it fits beside the live signal. After the departure tiles, the row SHALL end with a "More departures" card of the same size that opens the full list of upcoming departures for that direction. The "More departures" card SHALL appear whenever the route has departure data for the direction, even when fewer than six tiles are shown.

Each tile's value SHALL follow these rules:
- A departure leaving now SHALL read `0` with its `minutes` label rather than "Due".
- Departures already past SHALL NOT be shown; the next departures fill their place.
- Departures 60 minutes or more away SHALL show their clock time, for example `5:00` with `PM` as the small label, instead of a minute count.

The same rules SHALL apply to the times on home transit cards.

#### Scenario: Only one train is being tracked
- **WHEN** a route's live feed tracks one upcoming vehicle and the timetable has more departures
- **THEN** up to six tiles are shown: the live one, then the next scheduled departures, followed by the "More departures" card

#### Scenario: Rider scrolls to the end of the tiles
- **WHEN** the rider scrolls past the sixth tile
- **THEN** a "More departures" card is the last item in the row

#### Scenario: Departure is leaving now
- **WHEN** a departure's countdown reaches zero
- **THEN** its tile reads `0 minutes`, and once it has passed it is replaced by the next departure

#### Scenario: Late-night gap
- **WHEN** the next departure is 124 minutes away
- **THEN** its tile shows the departure's clock time, such as `5:00 PM`

### Requirement: Home map center search
When the rider pans the home map away from their location, a solid purple dot SHALL appear fixed at the center of the visible map area. The dot SHALL be filled purple with a white ring, about the same size as the blue current-location dot, with no translucent halo or outline-only ring. After the map comes to rest, the Nearby list SHALL refresh to show routes near that center point, and each card's stop and departure times SHALL be for that route's stop nearest the center point, not the rider's own location. Returning to the rider's location, with the location button, SHALL hide the dot and restore Nearby to the rider's surroundings. While the center search is loading, the existing list SHALL stay visible with a loading indicator.

#### Scenario: Rider explores another area
- **WHEN** the rider drags the home map to Hicksville and lets go
- **THEN** a solid purple dot about the size of the GPS dot marks the map center, and Nearby updates to routes near Hicksville, each showing its Hicksville-area stop and departures

#### Scenario: Rider returns to their location
- **WHEN** the rider presses the location button
- **THEN** the dot disappears and Nearby shows routes near the rider again

### Requirement: Inverted live vehicle markers
A live vehicle marker on a route map SHALL be a borderless white circle with a route-colored mode glyph and a soft drop shadow strong enough to separate it from pale map tiles. It SHALL be 42 pt in diameter. Its corner freshness badge SHALL be a borderless route-colored circle with white age text. Vehicle markers SHALL stay clearly distinguishable from stop dots: they are far larger (42 pt versus the 8 pt stop dots), carry a mode glyph that stop dots never have, and are drawn above them. These styles SHALL be used on both native and web.

#### Scenario: Rider spots a live train
- **WHEN** a live Port Jefferson Branch train is on the map
- **THEN** it appears as a 42 pt white circle with no outline, a purple train glyph, and a visible shadow, with a borderless purple circle at its top-right reading its age (for example `12s`) in white

### Requirement: Stop transfers
Each station row in a live route's stop timeline SHALL show the other transit lines a rider can transfer to there, as small chips below the station name. Transfers include:
- other LIRR branches serving the same station;
- subway lines and bus routes stopping within a short walk (about 400 m).

Each chip SHALL show the line's short name in the agency's route color when one is published. Chips SHALL be ordered rail, then subway, then bus. A row SHALL show at most eight chips followed by a `+N` count for the rest. The `+N` count SHALL be a button: activating it SHALL open a sheet titled with the station name that lists every transfer at that station as chips, grouped under rail, subway, and bus headings, and the sheet SHALL close by a close control, a tap outside it, or the platform back action. The row's accessibility label SHALL list every transfer. Stations with no transfers SHALL show no chips. Transfer data SHALL come from the agencies' official static GTFS feeds, through a re-runnable generation script.

#### Scenario: Rider sees the bus at Smithtown
- **WHEN** Smithtown appears in the stop list
- **THEN** its row shows Suffolk County Transit route chips including `56`

#### Scenario: Busy station is summarized
- **WHEN** a station such as Jamaica has more than eight transfers
- **THEN** its row shows eight chips and a `+N` count, and its accessibility label names every transfer

#### Scenario: Rider opens the hidden transfers
- **WHEN** the rider taps the `+N` count on Jamaica's row
- **THEN** a sheet titled "Jamaica" lists every transfer chip, including the ones hidden from the row, grouped by mode, and closing it returns to the route detail at the same scroll position

## ADDED Requirements

### Requirement: All upcoming departures page
Activating "More departures" SHALL open a page for the active route, direction, and the stop the tiles are for. The page SHALL show the route badge, the direction's destination, and the stop name, and list every remaining departure from that stop in that direction for the current service day, continuing into the next service day when fewer than six departures remain today. Each row SHALL show the departure's clock time and its minutes from now, and SHALL mark live (GPS-tracked) departures distinctly from scheduled ones using the same live signal and `Scheduled` treatment as the tiles. While the list loads, the page SHALL show a loading state; if it cannot load, it SHALL say departures are unavailable. The back control and platform back action SHALL return to the route detail with its direction unchanged.

#### Scenario: Rider sees the rest of the evening
- **WHEN** the rider taps "More departures" on the Penn Station direction at Stony Brook
- **THEN** a page headed "Penn Station" from Stony Brook lists every remaining westbound departure from Stony Brook today, earliest first, each with its clock time and minutes away

#### Scenario: Rider returns
- **WHEN** the rider presses back on the departures page
- **THEN** the route detail is shown again on the same direction

#### Scenario: Late at night
- **WHEN** only two departures remain today
- **THEN** the list also includes the first departures of the next service day, labeled with their clock times

### Requirement: Route line shows direction of travel
On a live route map, the route line for the selected direction SHALL be drawn at full strength from the rider's nearest stop to the end of the line in that direction, and noticeably fainter (about a third of full opacity) from the start of the line up to that stop. Stop dots other than the rider's own stop SHALL be exactly as wide as the route line (8 pt), white with a thin (1.5 pt) route-colored ring, so they sit inside the line rather than bulging out of it; the rider's stop stays larger to stand out. The outlines of the stop dots behind the rider's stop SHALL be equally faint. A single route-colored arrow SHALL be drawn right beside the rider's highlighted stop, pointing straight at the next stop in the selected direction (not along the local curve of the track, which can bend sharply at a station). It SHALL stay a fixed short on-screen distance from the stop at every zoom level, and no arrows SHALL be drawn along the line, so stop dots are never covered. Switching direction SHALL swap which part of the line and which stops are faint and flip the arrow. When no nearest stop is known, the whole line SHALL be drawn at full strength with no arrow.

#### Scenario: Rider at Stony Brook heading west
- **WHEN** a rider nearest Stony Brook views the Penn Station direction of the Port Jefferson Branch
- **THEN** the line from Stony Brook toward Penn Station is full strength, the segment from Port Jefferson to Stony Brook and Port Jefferson's dot outline are faint, and one arrow beside Stony Brook's dot points west toward Smithtown

#### Scenario: Rider switches direction
- **WHEN** the same rider swipes to the Port Jefferson direction
- **THEN** the line from Stony Brook to Port Jefferson is full strength, the rest is faint, and the arrow points east

### Requirement: Map badge stays out of the way
The route badge shown over a route-detail map SHALL be compact: it SHALL show the mode icon and the route's short name only, never a long route or branch name, and SHALL be no taller than the top-right map controls. It SHALL sit in the top-left corner below the back control, clear of the map's center and the rider's nearest stop at the opening zoom, and SHALL NOT intercept map gestures.

#### Scenario: Port Jefferson Branch map
- **WHEN** the rider opens the Port Jefferson Branch route detail
- **THEN** the badge over the map is a small chip with the rail icon and the short name, not "Port Jefferson", and dragging on the badge pans the map
