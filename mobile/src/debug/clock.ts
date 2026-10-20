/** A pretend "now" that keeps ticking: `at` was the mock time when it was set at real `setAtRealMs`. */
export type MockTime = { at: number; setAtRealMs: number };

let mockTime: MockTime | undefined;

/** Set by DebugProvider: the admin's mock time, or undefined for the real clock. */
export function setClockMockTime(value: MockTime | undefined): void {
  mockTime = value;
}

export function isMockClock(): boolean {
  return mockTime !== undefined;
}

/**
 * The app's current time for planning and trip labels: the admin's mock time when one is set,
 * otherwise the real time. Live predictions and vehicle ages always use the real clock.
 */
export function appNow(): number {
  return mockTime ? mockTime.at + (Date.now() - mockTime.setAtRealMs) : Date.now();
}
