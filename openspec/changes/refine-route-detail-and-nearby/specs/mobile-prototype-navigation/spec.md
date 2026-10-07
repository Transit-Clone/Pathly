# Spec Delta

## MODIFIED Requirements

### Requirement: Session favorites appear in the Favorites tab
Riders SHALL be able to save and unsave routes from route detail with a single star control, and to favorite and unfavorite trips from planned and recent trip detail. Every saved route and favorited trip SHALL appear in the home Favorites tab, grouped into Routes and Trips, in the order it was saved. Selecting one SHALL open its detail screen. Saved and favorite state SHALL be consistent wherever the item is shown and SHALL last for the app session without any backend.

#### Scenario: Rider favorites a route
- **WHEN** the rider saves a route with the star on its detail screen and returns home to the Favorites tab
- **THEN** that route appears under Routes and opens its route detail when selected

#### Scenario: Rider favorites a trip
- **WHEN** the rider favorites a planned or recent trip and opens the Favorites tab
- **THEN** that trip appears under Trips with its route badges and destination, and opens its trip detail when selected

#### Scenario: Rider removes a favorite
- **WHEN** the rider unsaves a route or unfavorites a trip from its detail screen
- **THEN** it no longer appears in the Favorites tab, and the empty state returns when nothing is saved

#### Scenario: Favorite state is consistent
- **WHEN** the rider reopens a saved route's or favorited trip's detail screen
- **THEN** its star control is shown as selected

## REMOVED Requirements

### Requirement: Routes can be pinned to Nearby
**Reason**: Having both a pin and a favorite control for routes was redundant and confusing. A single Save star now covers both roles (see "Saved routes lead the Nearby list").
**Migration**: Saved routes appear first in Nearby, which is the behavior pinning provided, and also in Favorites. The route-detail pin control and the `route-pin` test id are removed.

## ADDED Requirements

### Requirement: Saved routes lead the Nearby list
Routes the rider has saved SHALL appear first in the Nearby tab, each marked with a small filled star in its top-right corner that does not overlap the live signal, without a section heading. A saved route SHALL NOT also appear in the regular nearby list. Unsaving a route SHALL return it to the regular nearby list when it is nearby. The app SHALL NOT save any route by default.

#### Scenario: Rider saves a nearby route
- **WHEN** the rider saves the 51 from its detail screen and returns to Nearby
- **THEN** the 51 appears above the other nearby routes with a star marker and not in the regular list

#### Scenario: Rider unsaves a route
- **WHEN** the rider unsaves that route
- **THEN** it returns to the regular nearby list and disappears from Favorites

### Requirement: Nearby search adapts to density
Nearby discovery SHALL widen its search radius step by step until it finds a minimum number of distinct routes (about eight) or reaches a maximum radius. Each step SHALL start from a per-agency base radius that is small where stops are dense (subway) and larger where they are sparse (suburban bus, LIRR). In dense areas the base radius alone usually satisfies the minimum, so dense neighborhoods SHALL NOT list every route in a wide area. Results SHALL stay ordered by distance.

#### Scenario: Suburban rider sees more than two routes
- **WHEN** the rider is in a suburban area where only two routes lie within the base radius
- **THEN** the search widens and Nearby lists about eight routes, ordered by distance

#### Scenario: City rider sees a focused list
- **WHEN** the rider is in Midtown Manhattan
- **THEN** Nearby lists the routes within the base radius without widening the search

### Requirement: Route detail stays open while location updates
Once the rider opens a route detail screen, the app SHALL keep showing that route until the rider leaves it, even when the rider's location updates and the nearby list is re-fetched or no longer contains that route.

#### Scenario: Rider reads a route while walking
- **WHEN** the rider has a route detail open and their GPS position changes enough to refresh the nearby list
- **THEN** the route detail stays open and continues updating, with no jump back to Home
