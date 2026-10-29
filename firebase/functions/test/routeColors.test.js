const assert = require('node:assert/strict');
const test = require('node:test');

const { BUS_COLORS, displayRouteColor, displayStepColor } = require('../lib/routeColors');

test('MTA buses are colored by service type, not by their meaningless GTFS colors', () => {
  // Real routes.txt rows (gtfs_si, sampled 2026-10-18), whose own colors are red, purple, blue...
  const color = (routeId, shortName, name, gtfs) => displayRouteColor('si', { routeId, shortName, name, color: gtfs });
  assert.equal(color('S40', 'S40', 'St. George - Amazon', 'B933AD'), BUS_COLORS.mtaLocal);
  assert.equal(color('S79+', 'S79-SBS', 'Staten Island Mall - Bay Ridge', '006CB7'), BUS_COLORS.mtaSelectBusService);
  assert.equal(color('B44+', 'B44-SBS', 'Sheepshead Bay - Williamsburg', 'B933AD'), BUS_COLORS.mtaSelectBusService);
  assert.equal(color('S93', 'S93', 'College of Staten Island - Bay Ridge LTD', 'EE352E'), BUS_COLORS.mtaLimited);
  assert.equal(color('SIM1C', 'SIM1C', 'Eltingville - Lower Manhattan Express', '00933C'), BUS_COLORS.mtaExpress);
  assert.equal(displayRouteColor('busco', { routeId: 'BXM10', shortName: 'BxM10', name: 'Morris Park - Midtown', color: '00933C' }), BUS_COLORS.mtaExpress);
  assert.equal(displayRouteColor('bk', { routeId: 'X27', shortName: 'X27', name: 'Bay Ridge - Manhattan', color: '00933C' }), BUS_COLORS.mtaExpress);
});

test('NICE gets one color; Suffolk keeps its red (every 30 min) and blue (every 60 min)', () => {
  for (const gtfs of ['60AA47', 'EF853F', 'FE404E']) assert.equal(displayRouteColor('nice', { routeId: 'n6', shortName: 'n6', color: gtfs }), BUS_COLORS.nice);
  assert.equal(displayRouteColor('suffolk', { routeId: '51', shortName: '51', color: 'C63F49' }), BUS_COLORS.suffolkFrequent);
  assert.equal(displayRouteColor('suffolk', { routeId: '62', shortName: '62', color: '0454A2' }), BUS_COLORS.suffolk);
  assert.equal(displayRouteColor('suffolk', { routeId: '99', shortName: '99', color: '' }), BUS_COLORS.suffolk);
});

test('subway and ferry lines keep their official colors; LIRR branches get Pathly shades', () => {
  assert.equal(displayRouteColor('subway', { routeId: 'J', color: '8E5C33' }), '#8E5C33');
  assert.equal(displayRouteColor('lirr', { routeId: '10', color: '#006ec7' }), '#0A3A8C');
  assert.equal(displayRouteColor('lirr', { routeId: '1', color: 'A626AA' }), '#9B1FA8');
  // A branch color Pathly has no shade for stays as published.
  assert.equal(displayRouteColor('lirr', { routeId: '99', color: '123456' }), '#123456');
  assert.equal(displayRouteColor('nycferry', { routeId: 'SG', color: 'D0006F' }), '#D0006F');
  assert.equal(displayRouteColor('subway', { routeId: 'X', color: '' }), '#0B4F9C');
});

test('planned bus and LIRR legs get the same colors; subway legs keep Google\'s', () => {
  assert.equal(displayStepColor(['si', 'bk'], { shortName: 'S79-SBS', name: 'Staten Island Mall - Bay Ridge' }), BUS_COLORS.mtaSelectBusService);
  assert.equal(displayStepColor(['si'], { shortName: 'SIM1', name: 'Eltingville - Lower Manhattan' }), BUS_COLORS.mtaExpress);
  assert.equal(displayStepColor(['nice'], { shortName: 'n6' }), BUS_COLORS.nice);
  // Google sends Suffolk's own red/blue, which is kept.
  assert.equal(displayStepColor(['suffolk'], { shortName: '51', color: '#c63f49' }), BUS_COLORS.suffolkFrequent);
  assert.equal(displayStepColor(['suffolk'], { shortName: '62', color: '#0454a2' }), BUS_COLORS.suffolk);
  assert.equal(displayStepColor(['subway'], { shortName: 'A' }), undefined);
  assert.equal(displayStepColor(['lirr'], { name: 'Port Jefferson Branch', color: '#006ec7' }), '#0A3A8C');
  assert.equal(displayStepColor([], { shortName: 'Q1' }), undefined);
});
