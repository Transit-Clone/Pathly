# Spec Delta

## ADDED Requirements

### Requirement: Last data shows at once when reopening
The app SHALL remember on the device the last nearby list found around the rider's own location, and the most recent live departures. On launch, a nearby list saved within the last 24 hours SHALL be shown immediately, marked as updating, until the fresh search replaces it. Live departures saved within the last 10 minutes SHALL be shown for cards still waiting on fresh data, aged from when they were fetched (past departures dropped) and without vehicle positions. Saved data SHALL never replace fresher data, and an area explored with the map center search SHALL NOT be saved as the rider's surroundings.

#### Scenario: Reopening on a slow backend
- **WHEN** the rider reopens the app and the backend is slow to answer
- **THEN** the last nearby cards appear at once with an updating indicator, and a card fetched a minute ago at 9 minutes reads 8 minutes

#### Scenario: Saved data is too old
- **WHEN** the saved nearby list is more than a day old
- **THEN** the app shows its normal loading state instead
