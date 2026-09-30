# Tasks

## 1. Spec Cleanup

- [x] 1.1 Confirm that the app and tests already implement continuous map-to-transit scrolling with no sheet handle or drag bounds. Verified: `App.test.tsx` asserts `transit-sheet-handle` is absent and the sheet scroll has no drag handlers.
- [x] 1.2 Write the REMOVED delta for "Home map and sheet coordinate without obstruction" with a reason and migration that points to "Continuous home map-to-transit scroll" and "Concise screen presentation". Verify with `npx openspec validate remove-stale-home-sheet-requirement --strict`.

## 2. Integration Verification

- [x] 2.1 Archive the change so the requirement is removed from `openspec/specs/mobile-prototype-navigation/spec.md`, and verify that `npx openspec validate --specs` passes.
