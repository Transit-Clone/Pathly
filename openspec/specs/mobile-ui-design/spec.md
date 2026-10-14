# Mobile UI Design Specification

## Purpose

Defines a consistent, concise, and glanceable visual system for Pathly's existing mobile screens so riders can identify routes and transit times immediately.

## Requirements

### Requirement: Pathly visual palette
In the light theme, the mobile interface SHALL use the design-document palette for branded and semantic UI: primary `#0B4F9C`, accent `#A7D8FF`, background `#F7FAFF`, text `#1F2937`, success `#16A34A`, and warning `#F97316`. In the dark theme, the interface SHALL use black and dark-gray surfaces with light text and a brightened primary tint that keeps a contrast ratio of at least 4.5:1 for text and icons. Success and warning SHALL keep their meaning in both themes.

#### Scenario: Existing screens use the documented palette
- **WHEN** a user opens the home, destination-search, or route-detail screen in the light theme
- **THEN** branded surfaces, text, selections, successful service states, and warning states use their corresponding documented colors

#### Scenario: Service state is independent from route identity
- **WHEN** a transit route has an on-time or disrupted status
- **THEN** its status uses the appropriate success or warning color without changing the route or line identity color

#### Scenario: Dark theme keeps text readable
- **WHEN** the dark theme is active
- **THEN** screen backgrounds are black or dark gray, primary text is light, and branded text and icons meet a 4.5:1 contrast ratio against their surface

#### Scenario: Route-colored text stays readable in dark mode
- **WHEN** a dark route color, such as the E train's navy, is used for text or an icon on a dark surface
- **THEN** that text or icon is lightened just enough to reach 4.5:1 contrast, while route lines, fills, and badges keep the exact route color

### Requirement: Nunito typography
The mobile interface SHALL render user-visible application text in Nunito using a consistent hierarchy of supported font weights.

#### Scenario: Mobile screen typography is consistent
- **WHEN** a user views any existing mobile screen
- **THEN** headings, transit information, controls, and supporting labels render in Nunito rather than relying on the platform default font

### Requirement: Glanceable nearby-transit hierarchy
Each nearby-transit card SHALL use the route identity color as its container background, omit a separate route icon, and give the route name and minute count equal top visual priority. Content order SHALL be route name, direction, stop name, then supporting timing provenance. The route name and minute count SHALL each render at no less than 22 logical pixels, with contrast-safe white text when dark text is not readable.

#### Scenario: Rider scans nearby transit
- **WHEN** the nearby-transit list is visible
- **THEN** the rider can identify each route or line name and its arrival or departure time before reading supporting details

#### Scenario: Supporting information remains available
- **WHEN** a nearby-transit card is shown
- **THEN** its direction and stop name remain present in that order beneath the route name

#### Scenario: Live and scheduled times are distinct
- **WHEN** a prediction is GPS-tracked
- **THEN** the numeric time is followed by a small centered `minutes` label and a GPS signal appears beside the time
- **WHEN** a time is scheduled rather than live
- **THEN** the time group is slightly transparent, shows `Scheduled`, and has no GPS signal

### Requirement: Two directions per nearby route
Each nearby route SHALL expose two mock directions within the same card through a horizontal swipe or equivalent paged gesture, without duplicating the route as a separate list item.

#### Scenario: Rider changes route direction
- **WHEN** a rider swipes a route card horizontally
- **THEN** the card displays the other direction's direction, stop name, minute prediction, and live-or-scheduled state while retaining the route identity

### Requirement: Continuous home map-to-transit scroll
The home map and nearby-transit menu SHALL form one continuous native vertical scrolling surface without draggable-sheet bounds or snapping states. The map SHALL stay stationary behind the page while the transit menu scrolls over it. The transit menu SHALL begin with a handle above the tabs. Dragging the handle SHALL scroll the page like any other part of the menu. Tapping or clicking the handle while the page is at rest SHALL scroll the menu up toward the search header, as far as the menu's content allows. Tapping or clicking it again, or at any time the page is scrolled away from rest, SHALL scroll the page back to its initial resting position. The initial viewport SHALL show the handle, the transit tabs, and at least three complete transit cards. The uncovered map area SHALL stay pannable and zoomable. The search and profile controls SHALL remain fixed at the top. The current-location control SHALL fade out and move up with the menu as the page scrolls.

#### Scenario: Rider reveals more nearby routes
- **WHEN** the rider scrolls downward through the nearby-transit page
- **THEN** additional route cards enter the viewport while progressively less of the map remains visible

#### Scenario: Rider restores the map
- **WHEN** the rider scrolls upward toward the beginning of the nearby-transit page
- **THEN** more of the map becomes visible again without reversing the requested scroll direction

#### Scenario: Transit remains discoverable initially
- **WHEN** the rider opens the home screen at the top of the page
- **THEN** the handle, the transit tabs, and at least three complete transit cards are visible below the map

#### Scenario: Rider taps the handle
- **WHEN** the rider taps the handle while the page is at rest
- **THEN** the transit menu scrolls up toward the search header, and tapping it a second time returns the page to its initial resting position, even when the menu stopped short of the header

#### Scenario: Rider pans the map above the menu
- **WHEN** the rider drags or pinches on the uncovered map area
- **THEN** the map pans or zooms and the page does not scroll

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

### Requirement: Concise screen presentation
The existing home, search, and route-detail screens SHALL avoid redundant headings and nonessential labels while retaining the context required to understand each screen and control.

#### Scenario: Section heading has no duplicate eyebrow
- **WHEN** a section's primary heading already communicates its purpose
- **THEN** the interface does not repeat that meaning in an additional uppercase eyebrow label

#### Scenario: Existing navigation remains recognizable
- **WHEN** concise copy and visual treatments are applied
- **THEN** search, tab selection, back navigation, route selection, and departure selection remain clearly identifiable and usable

### Requirement: Prototype scope remains local
The visual update SHALL preserve the current screens and navigation paths while using only local mock data and local UI state for new gestures and controls.

#### Scenario: Existing prototype flows remain available
- **WHEN** the visual update is complete
- **THEN** users can still open destination search, switch nearby-transit tabs, open the Ronkonkoma route, inspect predictions, and return home

### Requirement: Consistent trip-detail presentation
Planned and recent trip-detail screens SHALL use the same Pathly map-first presentation, route identity treatment, prominent fare and duration summary, obvious leave and arrive times, map actions, anchored trip action, and individually separated route-leg cards. Recent trips SHALL remain visually distinguishable through completed-trip context, historical timing, and recency information without reverting to a different layout system.

#### Scenario: Rider compares planned and recent details
- **WHEN** a rider opens a planned trip and then opens a recent trip
- **THEN** both screens use the same information hierarchy and controls while the recent trip clearly communicates that its displayed journey is historical

#### Scenario: Rider reviews transfers
- **WHEN** a trip contains more than one transit leg
- **THEN** every leg is displayed in a distinct card with its own route identity, boarding or transfer context, direction, duration, endpoints, and times

### Requirement: Continuous trip-detail map scroll
Each planned and recent trip-detail screen SHALL behave as one normal vertical page in which downward scrolling reveals more trip content while showing progressively less of the map, and upward scrolling restores the map. The detail content SHALL remain visible initially, and the trip action SHALL remain anchored immediately above the content boundary without introducing draggable bounds, snap states, or a resize handle.

#### Scenario: Rider reveals trip legs
- **WHEN** the rider scrolls downward on a trip-detail screen
- **THEN** additional summary and route-leg content enters the viewport while progressively less of the map remains visible

#### Scenario: Rider restores the trip map
- **WHEN** the rider scrolls upward toward the beginning of a trip-detail screen
- **THEN** the map becomes visible again without reversing the requested scroll direction

#### Scenario: Trip content remains discoverable initially
- **WHEN** a planned or recent trip-detail screen first opens
- **THEN** the map and the beginning of the trip information are both visible and the trip action is anchored above the content boundary

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

### Requirement: Consistent search sheet heading
The destination-search screen SHALL use a standard full-screen search layout instead of a sheet. The whole screen SHALL use the theme's surface color (white in the light theme). The search field SHALL be pinned at the top. The results list SHALL start directly below the field and fill the remaining height, scrolling independently of the field and staying above the on-screen keyboard. When the query is empty, the list SHALL show a "Recent" label above recent places. While searching, the list SHALL show place suggestions without a heading or count label. The screen SHALL NOT show a drag handle, rounded sheet edges, or a floating card.

#### Scenario: Rider opens search
- **WHEN** the rider opens destination search
- **THEN** a white full-screen page shows the focused search field at the top and the "Recent" list directly below it

#### Scenario: Rider starts typing a destination
- **WHEN** the rider types into the search field and suggestions load
- **THEN** the "Recent" label and entries are replaced in place by the suggestion rows, and no handle, sheet, or count label is shown

#### Scenario: Long result list with keyboard open
- **WHEN** suggestions exceed the visible height while the keyboard is open
- **THEN** the rider can scroll the list to reach every suggestion while the search field stays fixed at the top

### Requirement: Appearance selection
Settings SHALL offer an Appearance choice of Light, Dark, or System, defaulting to Light. The choice SHALL apply immediately to every screen, including the map, sheets, cards, controls, and the status bar. It SHALL last for the app session without any backend. System SHALL follow the device's light or dark preference and update when that preference changes. Route identity colors on cards and badges SHALL be the same in both themes.

#### Scenario: Rider switches to dark
- **WHEN** the rider selects Dark in Settings and returns home
- **THEN** the sheet, tabs, Recents cards, map, and search bar render with dark surfaces and light text, while nearby route cards keep their route colors

#### Scenario: System follows the device
- **WHEN** the rider selects System and the device is in dark mode
- **THEN** the app renders the dark theme, and switching the device to light mode renders the light theme

#### Scenario: Choice is visible in Settings
- **WHEN** the rider reopens Settings
- **THEN** the current appearance choice is shown as selected

### Requirement: Illustrated street map
Every map backdrop SHALL render a vector street-map illustration with neutral land, white roads of differing widths, readable street-name labels along roads, green parks, a campus area, and water, arranged on approximate Stony Brook–area geography. The map SHALL have a dark variant with dark land, muted roads, and light labels. It SHALL scale to fill its container without distortion and remain hidden from assistive technology. The destination-search screen SHALL NOT show a map backdrop or map pins.

#### Scenario: Rider sees a recognizable map
- **WHEN** the home or Route Results screen is visible
- **THEN** the map shows named roads, park areas, and a campus area rather than isolated rectangles

#### Scenario: Search screen has no map
- **WHEN** the destination-search screen is visible, with or without a query
- **THEN** the screen is a plain surface-colored page with no map illustration and no numbered map pins

#### Scenario: Map follows the theme
- **WHEN** the dark theme is active
- **THEN** the map renders its dark variant

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

### Requirement: Smooth interaction feedback
Interactive surfaces SHALL respond to touch with a brief, eased scale-down and dim that springs back on release, instead of snapping between states. Opening a screen or settings page SHALL fade it in with a slight upward settle. The home tab indicator SHALL slide between Nearby, Recents, and Favorites. Expanding or collapsing service alerts and the Modes and Filter panels, filtering results, and switching tab content SHALL ease rather than jump. All of this motion SHALL be skipped when the app's Reduce motion setting or the device's reduce-motion preference is on, and none of it SHALL delay the action the rider triggered.

#### Scenario: Rider taps a card
- **WHEN** the rider presses and releases a route card, result card, or button with reduce motion off
- **THEN** the element eases slightly smaller and dimmer while pressed, springs back on release, and its action fires

#### Scenario: Rider switches tabs
- **WHEN** the rider selects Recents after Nearby
- **THEN** the underline slides to Recents and the new tab content eases in

#### Scenario: Reduce motion is on
- **WHEN** the rider turns on Reduce motion and opens a screen or presses a control
- **THEN** the screen appears and the control responds without scale, slide, or fade animation

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

### Requirement: Fast first load of live data
Live departures for the cards on screen SHALL be fetched in one backend request per agency (each request covering up to 12 routes), and each route's result SHALL resolve the rider's nearest stop and its departures together. A route that fails SHALL NOT fail the other routes in its request. Route detail SHALL request its stop list and track shape in parallel with live data, not after it. A home card SHALL NOT wait on another agency's request. When the deployed backend cannot answer batched requests, the app SHALL fall back to one request per route.

#### Scenario: Rider opens the app
- **WHEN** the home screen shows LIRR and subway cards
- **THEN** live data is requested with one request for the LIRR cards and one for the subway cards, and the LIRR cards fill in even while the subway request is still pending

#### Scenario: Older backend
- **WHEN** the deployed backend has no batched live-status function
- **THEN** each card's live data is requested on its own and still fills in

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

### Requirement: Reorient button on the home map
When the rider rotates or tilts the home map (for example with a two-finger twist), a round compass button SHALL appear near the current-location control, with its needle pointing to true north. Activating it SHALL animate the map back to north-up and flat, keeping the current center and zoom, after which the button SHALL hide. The button SHALL NOT appear while the map is north-up and flat. Maps that cannot be rotated (the web map) SHALL never show it.

#### Scenario: Rider twists the map
- **WHEN** the rider rotates the home map so north points to the right
- **THEN** a compass button appears with its needle pointing right, toward north

#### Scenario: Rider reorients
- **WHEN** the rider taps the compass button
- **THEN** the map turns back to north-up and flat at the same place and zoom, and the button disappears
