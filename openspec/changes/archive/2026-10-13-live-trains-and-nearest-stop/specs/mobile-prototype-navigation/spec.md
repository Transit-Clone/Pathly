# Spec Delta

## ADDED Requirements

### Requirement: Live departures follow the nearest station
For a route with live data, the live departure predictions shown on the home route card and the route-detail tiles SHALL be the departures from the route's station nearest to the rider's current location. When location is unavailable or permission is denied, predictions SHALL use the default station (Stony Brook). The route-detail stop timeline SHALL be timed so that the nearest station's time matches the first prediction.

#### Scenario: Rider is closest to Stony Brook
- **WHEN** the rider's GPS position is closest to Stony Brook and they open the Port Jefferson Branch
- **THEN** the countdown tiles show departures from Stony Brook, and Stony Brook's time in the stop list equals now plus the first tile's minutes

#### Scenario: Rider is closer to another station
- **WHEN** the rider's GPS position is closest to Smithtown
- **THEN** the countdown tiles show departures from Smithtown instead of Stony Brook
