# Spec Delta

## ADDED Requirements

### Requirement: Ferry route identity
Ferry routes SHALL have their own mode identity wherever a route badge or mode icon appears: a boat icon, and a badge shape distinct from the subway circle, the bus rounded square, and the commuter-rail tag. The badge SHALL use the route's color and its short name, and SHALL be announced with its mode (for example "East River ferry").

#### Scenario: Rider sees a ferry leg
- **WHEN** a trip, route card, or search row includes an NYC Ferry route
- **THEN** it shows the ferry badge shape and boat icon, distinguishable from bus and rail badges at a glance

#### Scenario: Screen reader announces a ferry
- **WHEN** a screen reader focuses an NYC Ferry badge
- **THEN** it announces the route's name followed by "ferry"
