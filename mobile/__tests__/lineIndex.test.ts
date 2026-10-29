import { searchLineIndex, type IndexedLine } from '../src/data/lineIndex';

const line = (agencyId: IndexedLine['agencyId'], shortName: string, routeName: string, routeId = shortName): IndexedLine => ({
  agencyId, agencyDisplayName: agencyId, routeId, shortName, routeName, color: '#000000',
});

const index: IndexedLine[] = [
  line('subway', '1', 'Broadway - 7 Avenue Local'),
  line('subway', 'A', '8 Avenue Express'),
  line('subway', '6X', 'Pelham Bay Park Express'),
  line('suffolk', '1', 'Amityville - Hauppauge'),
  line('si', 'S74', 'Richmond Rd / Tottenville'),
  line('si', 'S76', 'Oakwood - Port Richmond'),
  line('si', 'S79-SBS', 'Staten Island Mall - Bay Ridge', 'S79+'),
  line('mn', 'M15-SBS', '1 Av / 2 Av Select Bus Service', 'M15+'),
  line('mn', 'M15', '1 Av / 2 Av'),
  line('busco', 'X27', 'Bay Ridge - Manhattan Express'),
  line('lirr', 'Port Jefferson', 'Port Jefferson Branch', '1'),
  line('nycferry', 'ER', 'East River'),
  line('siferry', 'SIF', 'Staten Island Ferry'),
];

const names = (query: string) => searchLineIndex(index, query).map((found) => `${found.agencyId}:${found.shortName}`);

describe('line search on the device', () => {
  it('finds a line by its code at once, rail and subway first', () => {
    expect(names('1')[0]).toBe('subway:1');
    expect(names('S76')[0]).toBe('si:S76');
    expect(names('s 76')[0]).toBe('si:S76');
    expect(names('S7')).toEqual(expect.arrayContaining(['si:S74', 'si:S76', 'si:S79-SBS']));
  });

  it('reads Select Bus, express and filler words', () => {
    expect(names('M15+')[0]).toBe('mn:M15-SBS');
    expect(names('m15 sbs')[0]).toBe('mn:M15-SBS');
    expect(names('6 express')[0]).toBe('subway:6X');
    expect(names('the A train')[0]).toBe('subway:A');
    expect(names('route 1 bus')).toEqual(['suffolk:1']);
  });

  it('matches name words and lists a whole kind', () => {
    expect(names('port jeff')[0]).toBe('lirr:Port Jefferson');
    expect(names('east river')[0]).toBe('nycferry:ER');
    expect(names('ferry')).toEqual(['nycferry:ER', 'siferry:SIF']);
    expect(names('express bus')).toEqual(['busco:X27']);
    expect(names('sbs')).toEqual(expect.arrayContaining(['mn:M15-SBS', 'si:S79-SBS']));
  });

  it("doesn't list buses for a place on their route: those are where they run, not their names", () => {
    expect(names('bay ridge')).toEqual([]);
    expect(names('richmond')).toEqual([]);
    expect(names('staten island')).toEqual(['siferry:SIF']);
  });
});

describe('line search duplicates', () => {
  it('lists a line once when several bus feeds carry it', () => {
    const copies: IndexedLine[] = [
      { agencyId: 'bx', agencyDisplayName: 'MTA Bus', routeId: 'B46', shortName: 'B46', routeName: 'Utica Av', color: '#000000' },
      { agencyId: 'si', agencyDisplayName: 'MTA Bus', routeId: 'B46', shortName: 'B46', routeName: 'Utica Av', color: '#000000' },
      { agencyId: 'busco', agencyDisplayName: 'MTA Bus', routeId: 'B46', shortName: 'B46', routeName: 'Utica Av', color: '#000000' },
    ];
    expect(searchLineIndex(copies, 'B46')).toHaveLength(1);
    expect(searchLineIndex(copies, 'bus')).toHaveLength(1);
  });
});
