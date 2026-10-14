# Spec Delta

## MODIFIED Requirements

### Requirement: Glanceable route-detail hierarchy
The route-detail screen SHALL show the active direction's destination as the primary heading directly above the prediction tiles, with route identity carried by the route badge and color. It SHALL emphasize the destination, multiple square-ish minute prediction tiles, and stop times over metadata while preserving the route map and ordered stop timeline. Prediction tiles SHALL display a large numeric minute count centered above a small centered `minutes` label. Each tile SHALL show either a live GPS signal beside the number or, for timetable data, a `Scheduled` label on a rounded, filled pill that contrasts with both plain and route-colored tiles and sits clearly separated from the `minutes` label rather than crowding it. Every tile SHALL keep the same layout, so the `Scheduled` pill never shifts the number or `minutes` label. Tiles SHALL NOT display `Selected` or `Next train` captions. A service-alert control SHALL appear below the prediction tiles only when the route has an active advisory; when the route reports no delays, no alert control or dropdown SHALL be shown. Each stop timeline row SHALL show only the stop name and its time, without captions such as `Departs`, `Scheduled stop`, or `Final stop`, and the divider between rows SHALL run beneath both the name and the time. Each row's accessibility label SHALL still say whether the time is a departure or an arrival.

#### Scenario: Rider chooses a departure
- **WHEN** multiple arrivals or departures are displayed
- **THEN** each minute prediction is independently readable and visibly identified as live or scheduled without a selected state

#### Scenario: Rider scans route stops
- **WHEN** the stop timeline is visible
- **THEN** each row shows only the stop name and its time, aligned with the correct timeline entry, with no `Departs`, `Scheduled stop`, or `Final stop` caption, and the divider below each row extends under the time

#### Scenario: Route controls and alerts are available
- **WHEN** the route-detail screen is visible for a route with an active advisory
- **THEN** current-location, favorite, and pin controls appear in a vertical column at the top right, a service-alert control that expands to show the advisory appears below the prediction tiles, and the route color matches the map line and timeline

#### Scenario: Route has no delays
- **WHEN** the route-detail screen is visible for a route that reports no delays
- **THEN** no service-alert control or dropdown is shown, and the stop timeline follows the prediction tiles directly

#### Scenario: Rider reads where the route goes
- **WHEN** the rider swipes to the other direction
- **THEN** the heading above the tiles changes to that direction's destination

#### Scenario: Live and scheduled tiles line up
- **WHEN** live and scheduled tiles appear side by side
- **THEN** their numbers and `minutes` labels sit at the same height and are horizontally centered, with the `Scheduled` pill below them and visible space between the pill and the `minutes` label

### Requirement: Stationary detail map backdrop
The route-detail and planned/recent trip-detail screens SHALL match the home screen: the map SHALL stay stationary behind the page, and the detail content SHALL scroll continuously over it in one native vertical scroll, without draggable bounds, snap states, or a resize handle. Downward scrolling SHALL cover progressively more of the map without moving the map image. On trip-detail screens, the back, favorite, and current-location controls SHALL stay fixed and reachable at every scroll position, over a bar that fades in once the content reaches the top, and the GO or END action SHALL remain available at every scroll position. On the route-detail screen, the back control and the vertical column of current-location, favorite, and pin controls SHALL sit on the map and scroll away with it, with no bar behind them, so the scrolled page shows only route content. When the route-detail screen shows a real (live) route map, the uncovered map area SHALL respond directly to gestures. Dragging there SHALL pan the map, pinching (or the scroll wheel or trackpad on web) SHALL zoom it, and dragging the detail content SHALL still scroll the page. Illustrated maps and trip-detail maps SHALL remain non-interactive.

#### Scenario: Map image does not move while scrolling
- **WHEN** a rider scrolls downward on a route-detail or trip-detail screen
- **THEN** the content rises over the map while the map's route lines, stops, and markers stay at the same screen position

#### Scenario: Rider restores the map
- **WHEN** the rider scrolls back to the top of the detail page
- **THEN** the full map window is visible again above the content

#### Scenario: Trip controls stay reachable
- **WHEN** the trip-detail content covers most of the map
- **THEN** the back, favorite, and current-location controls and the trip action stay visible and operable

#### Scenario: Route controls scroll away with the map
- **WHEN** the rider scrolls a route-detail page until the content covers the map
- **THEN** no header bar appears and the route controls have scrolled out of view with the map, returning when the rider scrolls back to the top

#### Scenario: Content is discoverable initially
- **WHEN** a route-detail or trip-detail screen first opens
- **THEN** the map and the top of the detail content are both visible

#### Scenario: Rider explores the live route map
- **WHEN** the rider drags or pinches on the uncovered area of a live route map
- **THEN** the map pans or zooms and the page does not scroll

#### Scenario: Rider scrolls from the content
- **WHEN** the rider drags vertically on the route-detail content below a live route map
- **THEN** the page scrolls over the map as before and the map does not pan

#### Scenario: Map controls stay tappable
- **WHEN** the live route map is interactive
- **THEN** the back, current-location, favorite, and pin controls on the map still respond to taps

### Requirement: Route map overlay
Route-detail and trip-detail maps SHALL draw each route or trip leg as one continuous, thick polyline in its route color, outlined for contrast, with white-filled stop dots at each labeled stop. Route detail SHALL show a vehicle marker made of a white circle containing the mode icon and a live signal, plus the minutes-away bubble. Trip detail SHALL show a start marker and a destination pin at the final stop. On a real (live) route map, the route line SHALL use the route's color and SHALL follow the actual track geometry from the agency's published route shapes rather than straight segments between stations. Live trains SHALL be shown as a rounded-square badge in the route color with a white border and a white train glyph, a different shape from the round stop dots, and never as default map pins. Each stop SHALL be marked by a small white dot outlined in the route color, centered on the station's location, instead of a default map pin. Tapping (or clicking on web) a stop dot SHALL show that stop's name.

#### Scenario: Rider follows a route on the map
- **WHEN** a route detail opens
- **THEN** the route appears as a single connected line through its stops, with each stop marked by a white dot and its name

#### Scenario: Rider sees a multi-leg trip
- **WHEN** a trip detail with two legs opens
- **THEN** each leg is drawn in its own route color, the legs connect at the transfer point, and a destination pin marks the end

#### Scenario: Rider identifies a stop on the live map
- **WHEN** the rider zooms into the Port Jefferson Branch map and taps a stop dot
- **THEN** the dot is a white circle outlined in the route color sitting on the station's location, and the station's name is shown

#### Scenario: Rider zooms in on the track
- **WHEN** the rider zooms into a curved section of the Port Jefferson Branch
- **THEN** the route line follows the curves of the real track between stations instead of cutting straight across

#### Scenario: Rider sees a live train
- **WHEN** a live train position is available
- **THEN** it appears as a route-color rounded-square train badge, clearly different in shape from the round white stop dots, and no red map pins appear on the map
