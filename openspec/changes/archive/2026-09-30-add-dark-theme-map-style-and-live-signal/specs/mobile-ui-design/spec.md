# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
Every map backdrop SHALL render a vector street-map illustration with neutral land, white roads of differing widths, readable street-name labels along roads, green parks, a campus area, and water, arranged on approximate Stony Brook–area geography. The map SHALL have a dark variant with dark land, muted roads, and light labels. It SHALL scale to fill its container without distortion and remain hidden from assistive technology.

#### Scenario: Rider sees a recognizable map
- **WHEN** the home, search, or results screen is visible
- **THEN** the map shows named roads, park areas, and a campus area rather than isolated rectangles

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
