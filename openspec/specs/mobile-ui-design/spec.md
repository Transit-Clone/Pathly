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
The home map and nearby-transit menu SHALL form one continuous native vertical scrolling surface without draggable-sheet bounds, snapping states, or a resize handle. The initial viewport SHALL show the transit tabs and at least one complete transit card so the transit menu is never entirely hidden. The search and profile controls SHALL remain fixed at the top.

#### Scenario: Rider reveals more nearby routes
- **WHEN** the rider scrolls downward through the nearby-transit page
- **THEN** additional route cards enter the viewport while progressively less of the map remains visible

#### Scenario: Rider restores the map
- **WHEN** the rider scrolls upward toward the beginning of the nearby-transit page
- **THEN** more of the map becomes visible again without reversing the requested scroll direction

#### Scenario: Transit remains discoverable initially
- **WHEN** the rider opens the home screen at the top of the page
- **THEN** the transit tabs and at least one complete transit card are visible alongside the map

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
Route-detail and trip-detail maps SHALL draw each route or trip leg as one continuous, thick polyline in its route color, outlined for contrast, with white-filled stop dots at each labeled stop. Route detail SHALL show a vehicle marker made of a white circle containing the mode icon and a live signal, plus the minutes-away bubble. Trip detail SHALL show a start marker and a destination pin at the final stop.

#### Scenario: Rider follows a route on the map
- **WHEN** a route detail opens
- **THEN** the route appears as a single connected line through its stops, with each stop marked by a white dot and its name

#### Scenario: Rider sees a multi-leg trip
- **WHEN** a trip detail with two legs opens
- **THEN** each leg is drawn in its own route color, the legs connect at the transfer point, and a destination pin marks the end

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
