import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/**
 * The MTA's own maps (PDFs from mta.info/maps), for riders who lose signal underground or run out
 * of data. The MTA permits personal, non-commercial use; each is saved only on the rider's device.
 */
export type OfficialMap = { id: string; title: string; detail: string; url: string; group: 'Subway' | 'Railroads' | 'Bus' };

export const OFFICIAL_MAPS: readonly OfficialMap[] = [
  { id: 'subway', title: 'Subway map', detail: 'The classic diagram', url: 'https://www.mta.info/map/5256', group: 'Subway' },
  { id: 'subway-geographic', title: 'Geographic subway map', detail: 'Lines drawn over the streets', url: 'https://www.mta.info/map/36946', group: 'Subway' },
  { id: 'subway-accessible', title: 'Accessible stations map', detail: 'Step-free stations marked', url: 'https://www.mta.info/map/5346', group: 'Subway' },
  { id: 'lirr', title: 'LIRR map', detail: 'Every branch and station', url: 'https://www.mta.info/map/42901', group: 'Railroads' },
  { id: 'railroads', title: 'MTA railroads diagram', detail: 'LIRR and Metro-North together', url: 'https://www.mta.info/map/22461', group: 'Railroads' },
  { id: 'bus-bronx', title: 'Bronx bus map', detail: 'Local and Select Bus routes', url: 'https://www.mta.info/map/5366', group: 'Bus' },
  { id: 'bus-brooklyn', title: 'Brooklyn bus map', detail: 'Local and Select Bus routes', url: 'https://www.mta.info/map/5261', group: 'Bus' },
  { id: 'bus-manhattan', title: 'Manhattan bus map', detail: 'Local and Select Bus routes', url: 'https://www.mta.info/map/5391', group: 'Bus' },
  { id: 'bus-queens', title: 'Queens bus map', detail: 'Local routes (a large file)', url: 'https://www.mta.info/map/5371', group: 'Bus' },
  { id: 'bus-queens-express', title: 'Queens express bus map', detail: 'Express routes to Manhattan', url: 'https://www.mta.info/map/40256', group: 'Bus' },
  { id: 'bus-staten-island', title: 'Staten Island bus map', detail: 'Local and Select Bus routes', url: 'https://www.mta.info/map/5376', group: 'Bus' },
  { id: 'bus-staten-island-express', title: 'Staten Island express bus map', detail: 'Express routes to Manhattan', url: 'https://www.mta.info/map/5381', group: 'Bus' },
];

/** Saving needs a file system: the native apps. On the web a map opens in the browser instead. */
export const CAN_SAVE_MAPS = Platform.OS !== 'web';

/**
 * The members used here of expo-file-system's File and Directory. tsconfig's moduleSuffixes reach
 * the module's `.web` typings first, which leave them out, so they're named here.
 */
type Entry = { readonly uri: string; readonly exists: boolean; delete(): void; create(options?: { intermediates?: boolean; idempotent?: boolean }): void };

function mapsDirectory(): Directory {
  return new Directory(Paths.document, 'official-maps');
}

function mapFile(map: OfficialMap): File {
  return new File(mapsDirectory(), `${map.id}.pdf`);
}

const entry = (item: File | Directory) => item as unknown as Entry;

/** Whether a map is saved on this device. */
export function isMapSaved(map: OfficialMap): boolean {
  if (!CAN_SAVE_MAPS) return false;
  try {
    return entry(mapFile(map)).exists;
  } catch {
    return false;
  }
}

/** Downloads a map to the device (replacing an older copy), for opening with no signal. */
export async function saveMap(map: OfficialMap): Promise<void> {
  const directory = entry(mapsDirectory());
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  await File.downloadFileAsync(map.url, mapFile(map), { idempotent: true });
}

export function removeSavedMap(map: OfficialMap): void {
  const file = entry(mapFile(map));
  if (file.exists) file.delete();
}

/**
 * Opens a map: the saved copy (in the system's PDF preview, which works offline) when there is
 * one, else the MTA's own copy in the browser.
 */
export async function openMap(map: OfficialMap): Promise<void> {
  if (isMapSaved(map) && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(entry(mapFile(map)).uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: map.title });
    return;
  }
  await WebBrowser.openBrowserAsync(map.url);
}
