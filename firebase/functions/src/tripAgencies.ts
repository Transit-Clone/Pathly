import { MTA_BUS_AGENCY_IDS, type AgencyId } from './gtfsAgencies';
import type { TransitStep } from './tripPlanning';

/** Google's agency names, as Routes API transit steps report them. */
export const LIRR_AGENCY = 'Long Island Rail Road';
export const NYCT_AGENCY = 'MTA New York City Transit';
export const NICE_AGENCY = 'Nassau Inter-County Express';
export const MTA_BUS_COMPANY_AGENCY = 'MTA Bus Company';
export const NYC_FERRY_AGENCY = 'NYC Ferry';

/** Google's name for MTA Bus Company varies in case ("Mta Bus Company"). */
const isMtaBusCompany = (agency: string) => agency.toLowerCase() === MTA_BUS_COMPANY_AGENCY.toLowerCase();

/** Google splits Suffolk County Transit by area ("Suffolk County Transit - West", ...). */
export const isSuffolk = (agency: string) => agency === 'Suffolk County Transit' || agency.startsWith('Suffolk County Transit -');

/**
 * The Pathly agencies whose timetable a Google transit step may run on, most likely first. A city
 * bus could be in any of the borough feeds (a route can cross boroughs), so all of them are tried.
 */
export function agencyIdsForStep(step: Pick<TransitStep, 'agency' | 'mode'>): AgencyId[] {
  const name = step.agency.name;
  if (name === LIRR_AGENCY) return ['lirr'];
  if (name === NYCT_AGENCY && step.mode === 'subway') return ['subway'];
  if ((name === NYCT_AGENCY && step.mode === 'bus') || isMtaBusCompany(name)) return [...MTA_BUS_AGENCY_IDS];
  if (name === NICE_AGENCY) return ['nice'];
  if (isSuffolk(name)) return ['suffolk'];
  if (name === NYC_FERRY_AGENCY || step.mode === 'ferry') return ['nycferry'];
  return [];
}
