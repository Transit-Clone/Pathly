# Spec Delta

## MODIFIED Requirements

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
