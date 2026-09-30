# Spec Delta

## MODIFIED Requirements

### Requirement: Live predictions use a wireless signal
Every live minute prediction SHALL display a two-arc wireless signal beside the upper-right of its numeric time, while the number itself stays horizontally centered over its `minutes` label. The arcs SHALL be thick with rounded ends, with no source dot, and each arc SHALL fade between lower and full opacity independently, the outer arc trailing the inner one, to indicate live data. The fade SHALL stop, leaving the signal fully opaque, when the app's Reduce motion setting or the device's reduce-motion preference is on. Scheduled predictions SHALL display no wireless signal and SHALL retain their scheduled treatment.

#### Scenario: Live and scheduled values appear together
- **WHEN** a screen renders both live and scheduled predictions
- **THEN** only live values have the two-arc signal and scheduled values remain visually distinct without it

#### Scenario: Live signal pulses
- **WHEN** a live prediction is visible and reduce motion is off
- **THEN** its inner and outer arcs fade out and back in one after the other, each over a cycle of about 1.8 seconds

#### Scenario: Reduce motion stops the pulse
- **WHEN** the rider turns on Reduce motion in Settings or the device prefers reduced motion
- **THEN** live signals stop fading and remain fully visible
