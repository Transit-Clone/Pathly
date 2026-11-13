# Fixed destination and ETA bar

The user approved option 3 after reviewing the trip-summary mockup: destination and ETA on the left, a solid red End trip pill on the right. This supersedes the centered End-only footer in `e22e8f1`.

## Implementation

- The fixed footer displays the selected destination, arrival clock time, and remaining duration. It reuses the existing navigation clock/arrival estimate; it does not introduce a different ETA calculation or live-data promise.
- The red pill keeps the accessible label, stop icon, test ID and existing confirmation behavior. Destination/ETA form a separate accessible group, excluding the button. Countdown changes do not create a new live region.
- Summary text can wrap beside the nonshrinking button at narrow widths/Large text. Time/countdown tokens stay together to avoid an orphaned unit. The footer has no fixed height, so the existing measured layout reserves its actual space.
- The duplicate scrolling ACTIVE TRIP summary is removed. Back, voice, directions, map gestures and handed map placement retain their existing behavior.
- The footer remains within the shared 540-point screen width and owns bottom/side safe-area padding, below the scrolling body.

## Verification

| Check | Result |
| --- | --- |
| Focused navigation view, Home integration and handed-layout tests | 3 suites, 22 tests passed in 7.528 seconds |
| TypeScript / ESLint / git diff --check | Passed |
| Destination/ETA regression assertions | Summary/action outside scroller; separately accessible button; countdown changes with clock; long future/past durations preserve meaning |
| Independent diff review | No material issue found |
| Browser 390×844, default text | Footer y=767, height=77 before/after scrolling; scrolling viewport ends at y=767 |
| Browser 320×568, app Large text | Full Penn Station label and ETA visible; metadata wraps while complete minute value stays together; pill remains reachable |
| Light/dark appearance | Both checked on the actual running browser app |
| Back/Home/Resume | Destination/ETA footer returns with the active trip |
| Cancel / confirm | Cancel retains navigation; confirming End returns Home and removes Resume |

The previous full 625-test mobile run predates this summary refinement. This patch reran the relevant 22 tests plus types/lint, and performed live browser checks. Native screen readers, OS font scaling, physical safe areas and arbitrary long destination labels are not claimed verified by these browser captures.

## Cleanup and screenshots

Existing ordinary-user account; mock time/location off; public-station Ride Guide to Penn Station. Temporary Large text and dark appearance were restored to Default/Light, browser viewport reset, and the audit-owned trip ended. No favorites, account roles or credentials changed. No recovery behavior, backend settings or native configuration changed.

- [Normal view](evidence/trip-summary-footer-390.jpg)
- [After scrolling](evidence/trip-summary-footer-scrolled-390.jpg)
- [Large text at 320px](evidence/trip-summary-footer-large-320.jpg)
- [Dark appearance](evidence/trip-summary-footer-dark-390.jpg)

Earlier centered-footer evidence remains in the evidence folder and Git history. The screenshots linked above show the approved trip-summary revision in the running app, not generated mockups.
