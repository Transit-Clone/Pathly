import type { NavigationGuidance } from './enrouteNavigation';
import { formatTripClock } from './tripPlanning';

/** How strongly a moment buzzes: a step, the stop before getting off, or the end of the trip. */
export type AnnouncementStrength = 'step' | 'alert' | 'arrived';

export type TripAnnouncement = { speech: string; strength: AnnouncementStrength };

const stopsLabel = (count: number) => `${count} ${count === 1 ? 'stop' : 'stops'}`;

/** The rider is one stop from getting off: the moment to stand up and head for the door. */
function stopIsNext(guidance: NavigationGuidance): boolean {
  return guidance.phase === 'riding' && guidance.remainingStops === 1;
}

function getReady(guidance: NavigationGuidance): string {
  return guidance.nextStopName ? `Your stop, ${guidance.nextStopName}, is next. Get ready to get off.` : 'Your stop is next. Get ready to get off.';
}

/**
 * What to say (and how hard to buzz) as the trip moves from `previous` to `next`, or null when
 * nothing worth interrupting the rider happened. Every new step is announced; within a ride, so is
 * the stop before getting off. `previous` null is the trip as first seen (started, or reopened),
 * which the screen already shows, so it's quiet.
 */
export function announcementFor(previous: NavigationGuidance | null, next: NavigationGuidance): TripAnnouncement | null {
  if (!previous) return null;
  if (next.phase === 'arrived') {
    return previous.phase === 'arrived' ? null : { speech: `${next.currentAction}.`, strength: 'arrived' };
  }
  const newStep = next.phase !== previous.phase || next.currentAction !== previous.currentAction;
  if (newStep) {
    if (stopIsNext(next)) return { speech: `${next.currentAction}. ${getReady(next)}`, strength: 'alert' };
    const stopsToGo = next.phase === 'riding' && next.remainingStops !== null ? ` ${stopsLabel(next.remainingStops)} to go.` : '';
    return { speech: `${next.currentAction}.${stopsToGo}`, strength: 'step' };
  }
  if (stopIsNext(next) && !stopIsNext(previous)) return { speech: getReady(next), strength: 'alert' };
  return null;
}

/** The trip notification: the step now as its title, then what's next, stops left, and arrival. */
export function tripNotificationContent(guidance: NavigationGuidance): { title: string; body: string } {
  const parts: string[] = [];
  if (guidance.phase === 'arrived') return { title: guidance.currentAction, body: 'Trip complete' };
  if (stopIsNext(guidance)) parts.push(getReady(guidance).replace(' Get ready to get off.', ''));
  else if (guidance.nextAction) parts.push(`Next: ${guidance.nextAction}`);
  if (guidance.phase === 'riding' && guidance.remainingStops !== null && !stopIsNext(guidance)) parts.push(`${stopsLabel(guidance.remainingStops)} left`);
  parts.push(`Arrive ${formatTripClock(guidance.arrivalTime)}`);
  return { title: guidance.currentAction, body: parts.join(' · ') };
}
