# Spec Delta

## ADDED Requirements

### Requirement: Consistent vector iconography
Every icon in the mobile interface SHALL be a vector pictogram with matching stroke weight and optical size, rather than a typographic glyph or ad-hoc shape. A primary icon family SHALL supply most icons; a supplemental family MAY supply a glyph the primary family lacks, as long as it matches in weight and size. Each icon SHALL depict its action or meaning recognizably: back, favorite (filled when selected), current location, pin as a thumbtack (filled when pinned), refresh, time, swap, expand/collapse, clear, search, service alert, vehicle mode, and each settings category. Icon-only controls SHALL keep an accessible label and a touch target of at least 44 logical pixels.

#### Scenario: Icons render identically across platforms
- **WHEN** a rider opens the home, search, results, route-detail, trip-detail, or profile screen on Android, iOS, or web
- **THEN** each icon renders at the same size and weight and is vertically centered in its control, and no icon is a Unicode symbol or arrow character

#### Scenario: Toggle icons reflect state
- **WHEN** a rider favorites a trip or pins a route
- **THEN** the control's icon changes from outlined to filled and its accessibility state reports it as selected

#### Scenario: Icon controls remain operable
- **WHEN** an icon replaces an existing glyph control
- **THEN** the control keeps its accessibility label, role, test identifier, and a touch target of at least 44 logical pixels

### Requirement: Mode-aware route badge
Every route identity marker outside the nearby-transit cards SHALL use one shared badge whose shape identifies the mode: a circle for subway lines, a rounded square for bus routes, and a rectangular tag for commuter rail. The badge SHALL use the route identity color and white text, and SHALL come in a consistent small, medium, and large size scale. The agency used to choose the shape SHALL come from route data, never be inferred from the route's short name.

#### Scenario: Rider distinguishes modes in a multi-leg trip
- **WHEN** a recent trip, planned trip, or route result contains legs on different modes
- **THEN** each leg's badge shape reflects its mode, and badges of the same size share identical height

#### Scenario: Badge is announced meaningfully
- **WHEN** a screen reader focuses a route badge
- **THEN** it announces the route's short name and mode (for example, "E train" or "S1 bus")

### Requirement: Recent trip card presentation
Each card in the Recents tab SHALL show, in a consistent layout: the trip's leg route badges in travel order separated by a direction chevron, the destination as the primary text, the origin as supporting text, the first boarding time through the final alighting time, the total duration in minutes, the fare, and a recency chip. Each card SHALL show a Go action with an icon, or an End action when that trip is in progress. An in-progress trip SHALL be visually highlighted and SHALL show an "In progress" chip in place of its recency. The Recents tab SHALL keep the shared tab resting height.

#### Scenario: Rider scans a multi-leg recent trip
- **WHEN** the Recents tab shows a trip with more than one leg
- **THEN** its card shows each leg's badge in order with chevrons between them, plus its time range, duration, fare, and recency

#### Scenario: Rider starts a recent trip
- **WHEN** the rider presses Go on a recent-trip card
- **THEN** that card becomes highlighted, shows "In progress", and its action becomes End

#### Scenario: Tab height is preserved
- **WHEN** the rider switches between Nearby, Recents, and Favorites
- **THEN** the sheet keeps the same resting height

### Requirement: Stationary detail map backdrop
The route-detail and planned/recent trip-detail screens SHALL match the home screen: the map SHALL stay stationary behind the page, and the detail content SHALL scroll continuously over it in one native vertical scroll, without draggable bounds, snap states, or a resize handle. Downward scrolling SHALL cover progressively more of the map without moving the map image. On trip-detail screens, the back, favorite, and current-location controls SHALL stay fixed and reachable at every scroll position, over a bar that fades in once the content reaches the top, and the GO or END action SHALL remain available at every scroll position. On the route-detail screen, the back control and the vertical column of current-location, favorite, and pin controls SHALL sit on the map and scroll away with it, with no bar behind them, so the scrolled page shows only route content.

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

### Requirement: Consistent search sheet heading
The destination-search sheet SHALL use one heading style for both states: "Recent" when the query is empty and "Matches" while searching, with the number of matching places shown as a small supporting label beside the heading. The sheet SHALL NOT show a drag handle.

#### Scenario: Rider starts typing a destination
- **WHEN** the rider types into the search field
- **THEN** the heading changes from "Recent" to "Matches" in the same style and position, a count such as "2 places" appears beside it, and no handle is shown

## MODIFIED Requirements

### Requirement: Glanceable route-detail hierarchy
The route-detail screen SHALL show the active direction's destination as the primary heading directly above the prediction tiles, with route identity carried by the route badge and color. It SHALL emphasize the destination, multiple square-ish minute prediction tiles, and stop times over metadata while preserving the route map and ordered stop timeline. Prediction tiles SHALL display a large numeric minute count centered above a small centered `minutes` label, and either a live GPS signal beside the number or a `Scheduled` label with reduced opacity for timetable data. Every tile SHALL keep the same layout, so the `Scheduled` label never shifts the number or `minutes` label. Tiles SHALL NOT display `Selected` or `Next train` captions.

#### Scenario: Rider chooses a departure
- **WHEN** multiple arrivals or departures are displayed
- **THEN** each minute prediction is independently readable and visibly identified as live or scheduled without a selected state

#### Scenario: Rider scans route stops
- **WHEN** the stop timeline is visible
- **THEN** stop names and their associated times are readable at a glance and remain aligned with the correct timeline entries

#### Scenario: Route controls and alerts are available
- **WHEN** the route-detail screen is visible
- **THEN** current-location, favorite, and pin controls appear in a vertical column at the top right, a service-alert control appears below the prediction tiles, and the route color matches the map line and timeline

#### Scenario: Rider reads where the route goes
- **WHEN** the rider swipes to the other direction
- **THEN** the heading above the tiles changes to that direction's destination

#### Scenario: Live and scheduled tiles line up
- **WHEN** live and scheduled tiles appear side by side
- **THEN** their numbers and `minutes` labels sit at the same height and are horizontally centered, with the `Scheduled` label below them
