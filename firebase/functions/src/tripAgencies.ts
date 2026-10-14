import type { AgencyId } from './gtfsAgencies';
import type { TransitStep } from './tripPlanning';

/** Google's agency names, as Routes API transit steps report them. */
export const LIRR_AGENCY = 'Long Island Rail Road';
export const NYCT_AGENCY = 'MTA New York City Transit';
export const NICE_AGENCY = 'Nassau Inter-County Express';

/** Google splits Suffolk County Transit by area ("Suffolk County Transit - West", ...). */
export const isSuffolk = (agency: string) => agency === 'Suffolk County Transit' || agency.startsWith('Suffolk County Transit -');

/** The Pathly agency whose timetable a Google transit step runs on, if Pathly has one. */
export function agencyIdForStep(step: Pick<TransitStep, 'agency' | 'mode'>): AgencyId | undefined {
  const name = step.agency.name;
  if (name === LIRR_AGENCY) return 'lirr';
  if (name === NYCT_AGENCY && step.mode === 'subway') return 'subway';
  if (name === NICE_AGENCY) return 'nice';
  if (isSuffolk(name)) return 'suffolk';
  return undefined;
}
