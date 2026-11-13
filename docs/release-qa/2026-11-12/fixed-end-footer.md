# Fixed bottom End trip bar

Follow-up to the release audit: the user selected comparison option 1, replacing the toolbar END pill with a fixed bottom bar.

## Implementation

- Centered red stop icon and sentence-case “End trip”, on the themed surface with a subtle top divider and a minimum 52-point touch target.
- The shared map/detail layout has an optional footer below a flexing map/scroll body. It occupies real layout space, remains inside the existing 540-point maximum width, and cannot cover scrolling directions.
- The footer owns bottom/side safe-area padding. The sheet avoids a duplicate bottom inset, and navigation's map height adapts to the available body height.
- Back and voice remain at the top. The centered End action is equally reachable in either handed mode; map controls retain their handed placement. Settings copy now describes only the controls that move.
- Existing accessible label, test ID, confirmation dialog, Cancel, and end callback are retained.

## Verification

| Check | Result |
| --- | --- |
| Focused navigation, Home integration and handed-layout tests | 3 suites, 22 tests passed |
| Final full mobile suite | 65 suites, 625 tests passed in 84.09 seconds |
| Final TypeScript / ESLint | Passed |
| Independent source/diff review | No actionable regression found; footerless layout compatibility reviewed |
| Browser 390×844, default text, right-handed | Footer starts at y=783, height=61; scroll viewport ends at y=783. Footer stays at the same position after scrolling. |
| Browser 320×568, app Large text, left-handed | Footer starts at y=507, height=61; scroll viewport ends at y=507. Remaining directions and summary can scroll fully above it. |
| Light/dark appearance | Footer, icon and label remain visible; dark evidence was captured during map tile loading. No map-loading behavior was changed. |
| Confirmation / Home resume | Cancel retains the trip. Back/Home/Resume retains navigation. Confirming End returns Home and removes Resume. |
| Footerless screens | Route View, route results and planned-trip details/GO exercised during the live flow; full mobile tests pass. |

The first full test run caught an App integration assertion for the obsolete `END` caption. It was updated to the selected `End trip` caption; the final whole-suite run passed. The component confirmation test also asserts that the action belongs to the footer and is absent from the scroller.

Browser checks used the existing ordinary account with mock location/time off, public station destinations, temporary Large text/left-handed/dark settings and audit-owned trips. A development reload reproduced the previously documented line-only recovery problem; that saved QA trip was ended, then a destination-planned trip was used for the remaining checks. No recovery behavior was changed by this patch.

Light appearance, Default text, right-handed mode and the browser viewport were restored. Both QA trips were ended, with no Resume card on Home. Existing favorites and account data were not edited. Physical-device safe areas, OS font scaling and native screen-reader behavior remain unverified; the earlier debug APK predates this footer change.

## Screenshots

- [Final light/default layout](evidence/end-footer-final-390.jpg)
- [Scrolled directions, fixed footer](evidence/end-footer-scrolled-390.jpg)
- [Large text and left-handed controls at 320px](evidence/end-footer-large-left-320.jpg)
- [Same narrow layout scrolled](evidence/end-footer-large-left-scrolled-320.jpg)
- [Dark appearance](evidence/end-footer-dark-390.jpg)
