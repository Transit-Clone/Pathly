# Spec Delta

## REMOVED Requirements

### Requirement: Home map and sheet coordinate without obstruction
**Reason**: The draggable sheet with minimized, compact, and expanded bounds and a handle was replaced by one continuous native map-to-transit scroll. That replacement is specified in `mobile-ui-design` "Continuous home map-to-transit scroll", which forbids draggable bounds, snap states, and a resize handle, so this requirement contradicts current behavior.
**Migration**: Use `mobile-ui-design` "Continuous home map-to-transit scroll" for home map and sheet behavior. Its initial view keeps the tabs and a transit card visible, and scrolling restores the full map. The rule that the home screen omits a large "Nearby transit" heading is still covered by `mobile-ui-design` "Concise screen presentation".
