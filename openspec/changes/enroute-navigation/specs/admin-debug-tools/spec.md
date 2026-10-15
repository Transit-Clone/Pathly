# Spec Delta

## ADDED Requirements

### Requirement: Admin can drive an active trip through deterministic checkpoints
While a navigation session is active, Admin tools SHALL expose its ordered demonstration checkpoints from the itinerary's known walking path, boarding point, intermediate stops, alighting point, transfers, and destination. The admin SHALL be able to select a checkpoint or move to the next or previous checkpoint, and each action SHALL update the same persisted mock-location source used by every production location consumer. Checkpoint movement SHALL NOT bypass or directly mutate the navigation progress calculation.

Admin tools SHALL also provide an explicit Reset simulation action that returns both the mock location and the active session's demo progress to the first checkpoint. Moving the mock location backward without Reset SHALL preserve the production rule that confirmed rider progress does not regress. These controls SHALL remain invisible and unusable to non-admin accounts.

#### Scenario: Admin demonstrates a trip
- **WHEN** the admin advances from the boarding checkpoint through later stops and the destination
- **THEN** active navigation advances through the same location pipeline and guidance states used by real rider movement

#### Scenario: Admin moves to a previous checkpoint
- **WHEN** navigation has confirmed a later stop and the admin moves the mock location backward without resetting
- **THEN** the marker moves to that mock point but confirmed trip progress does not regress

#### Scenario: Admin resets the demonstration
- **WHEN** the admin activates Reset simulation
- **THEN** the mock location and demo progress return to the trip's first checkpoint so the flow can be demonstrated again

#### Scenario: Ordinary rider has an active trip
- **WHEN** a non-admin account starts navigation
- **THEN** no simulation checkpoints or reset control are shown or callable
