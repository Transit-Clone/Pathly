# Spec Delta

## MODIFIED Requirements

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
