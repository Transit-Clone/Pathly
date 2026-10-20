# Spec Delta

## MODIFIED Requirements

### Requirement: Fast first load of live data
Live departures for the cards on screen SHALL be fetched in one backend request per agency (each request covering up to 12 routes), and each route's result SHALL resolve the rider's nearest stop and its departures together. A route that fails SHALL NOT fail the other routes in its request. Route detail SHALL request its stop list and track shape in parallel with live data, not after it. A home card SHALL NOT wait on another agency's request. When the deployed backend cannot answer batched requests, the app SHALL fall back to one request per route.

#### Scenario: Rider opens the app
- **WHEN** the home screen shows LIRR and subway cards
- **THEN** live data is requested with one request for the LIRR cards and one for the subway cards, and the LIRR cards fill in even while the subway request is still pending

#### Scenario: Older backend
- **WHEN** the deployed backend has no batched live-status function
- **THEN** each card's live data is requested on its own and still fills in
