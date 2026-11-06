import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, renderHook, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import { BEAN_EYES, BEAN_HAIR, BEAN_MOUTHS, BEAN_OUTFITS, beanAvatarSvg, bodyRect, DEFAULT_BEAN_AVATAR, normalizeBeanAvatar } from '../src/avatars/beanAvatar';
import { DetailMapPage } from '../src/components/DetailMapPage';
import { LineLayersSheet } from '../src/components/LineLayersSheet';
import { SETTINGS_LINES } from '../src/components/LivelyPathling';
import { CHATS } from '../src/components/PathlingChat';
import { RouteDetailView } from '../src/components/RouteDetailView';
import { SavePlaceSheet } from '../src/components/SavePlaceSheet';
import { SystemNoticeBanner } from '../src/components/SystemNoticeBanner';
import { RouteMap } from '../src/components/RouteMap';
import { openingDirectionIndex } from '../src/components/TransitCard';
import { groupNotices, type RouteNotice } from '../src/data/routeNotices';
import { upcomingSystemNotices, useSystemNotice } from '../src/data/systemNotices';
import { routeById, type RouteDetail } from '../src/data/transit';
import { AppSettingsProvider } from '../src/theme/AppSettings';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

describe('Pathling parts and outfits', () => {
  it('keeps a saved outfit, and drops unknown ones, "none", and the retired patterns', () => {
    expect(normalizeBeanAvatar({ ...DEFAULT_BEAN_AVATAR, outfit: 'santa' })).toEqual({ ...DEFAULT_BEAN_AVATAR, outfit: 'santa' });
    expect(normalizeBeanAvatar({ ...DEFAULT_BEAN_AVATAR, outfit: '<script>' })).toEqual(DEFAULT_BEAN_AVATAR);
    expect(normalizeBeanAvatar({ ...DEFAULT_BEAN_AVATAR, outfit: 'none' })).toEqual(DEFAULT_BEAN_AVATAR);
    // Patterns were taken out: one saved before then is simply dropped.
    expect(normalizeBeanAvatar({ ...DEFAULT_BEAN_AVATAR, pattern: 'polka' })).toEqual(DEFAULT_BEAN_AVATAR);
    expect(beanAvatarSvg({ ...DEFAULT_BEAN_AVATAR, pattern: 'polka' })).toBe(beanAvatarSvg(DEFAULT_BEAN_AVATAR));
  });

  it('offers goofy new eyes, mouths, hair and outfits beside the holiday ones', () => {
    expect(BEAN_EYES.map((part) => part.id)).toEqual(expect.arrayContaining(['googly', 'cyclops', 'dizzy', 'stars', 'smitten', 'spiral', 'specs', 'teary', 'grumpy', 'bug']));
    expect(BEAN_MOUTHS.map((part) => part.id)).toEqual(expect.arrayContaining(['fangs', 'buck', 'nervous', 'smooch', 'blep', 'scream', 'beard', 'drool']));
    expect(BEAN_HAIR.map((part) => part.id)).toEqual(expect.arrayContaining(['mohawk', 'sprout', 'bun', 'cloud', 'pigtails', 'noodle', 'flame']));
    expect(BEAN_OUTFITS.map((part) => part.id)).toEqual(expect.arrayContaining(['turkey', 'harvest', 'santa', 'antlers', 'beanie', 'scarf', 'party', 'party-glasses', 'propeller', 'crown', 'chef', 'cone', 'pirate', 'clown', 'bow', 'headphones', 'bowtie']));
    for (const parts of [BEAN_EYES, BEAN_MOUTHS, BEAN_HAIR, BEAN_OUTFITS] as const) {
      const ids: string[] = parts.map((part) => part.id);
      expect(new Set(ids).size).toBe(ids.length);
      const labels: string[] = parts.map((part) => part.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('draws every part with no IDs, no NaN, and nothing past the 128 box', () => {
    const svgs = [
      ...BEAN_EYES.map((part) => beanAvatarSvg({ ...DEFAULT_BEAN_AVATAR, eyes: part.id })),
      ...BEAN_MOUTHS.map((part) => beanAvatarSvg({ ...DEFAULT_BEAN_AVATAR, mouth: part.id })),
      ...BEAN_HAIR.map((part) => beanAvatarSvg({ ...DEFAULT_BEAN_AVATAR, hair: part.id })),
      ...BEAN_OUTFITS.map((part) => beanAvatarSvg({ ...DEFAULT_BEAN_AVATAR, outfit: part.id })),
    ];
    for (const svg of svgs) {
      expect(svg).not.toMatch(/\sid=/);
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');
      // Absolute coordinates (after a command letter or a space) stay within the box.
      for (const match of svg.matchAll(/(?:c[xy]|[xy])="(-?[\d.]+)"/g)) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(0);
        expect(Number(match[1])).toBeLessThanOrEqual(128);
      }
    }
  });

  it('cuts the scarf to the body, so nothing spills past its outline', () => {
    const stripe = bodyRect(0, 60, 128, 66, '#fff');
    const xs = [...stripe.matchAll(/([\d.]+) ([\d.]+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...xs)).toBeGreaterThan(20);
    expect(Math.max(...xs)).toBeLessThanOrEqual(108.5);
    expect(bodyRect(0, 0, 128, 20, '#fff')).toBe('');
  });

  it('tucks the hair under a hat, but keeps it with antlers', () => {
    const curl = { ...DEFAULT_BEAN_AVATAR, hair: 'curl' as const };
    const curlPath = beanAvatarSvg(curl).replace(beanAvatarSvg(DEFAULT_BEAN_AVATAR).replace('</svg>', ''), '').replace('</svg>', '');
    for (const hat of ['santa', 'crown', 'propeller', 'chef', 'cone'] as const) expect(beanAvatarSvg({ ...curl, outfit: hat })).not.toContain(curlPath);
    expect(beanAvatarSvg({ ...curl, outfit: 'antlers' })).toContain(curlPath);
  });
});

describe('Alike notices share one pill', () => {
  const alert = (label: string, title: string, warning = false): RouteNotice => ({ kind: 'alert', label, warning, title, detail: `${title} details` });

  it('puts every upcoming change in one pill, and a repeated one only once', () => {
    const groups = groupNotices([
      alert('Delays', 'Trains are delayed', true),
      alert('Upcoming service change', 'Nov 8: buses detoured'),
      alert('Upcoming service change', 'Nov 15: stop closed'),
      alert('Upcoming service change', 'Nov 8: buses detoured'),
      alert('Upcoming notice', 'Elevator out'),
    ]);
    expect(groups.map((group) => [group.label, group.notices.length])).toEqual([['Delays', 1], ['Upcoming changes', 3]]);
    expect(groups[1]!.notices.map((notice) => notice.title)).toEqual(['Nov 8: buses detoured', 'Nov 15: stop closed', 'Elevator out']);
  });

  it('keeps one kind\'s own name, and different alerts apart', () => {
    const groups = groupNotices([alert('Upcoming service change', 'A'), alert('Upcoming service change', 'B'), alert('Delays', 'C', true), alert('Reroute in effect', 'D', true)]);
    expect(groups.map((group) => group.label)).toEqual(['Upcoming service change', 'Delays', 'Reroute in effect']);
  });

  it('shows one pill with a count on Route View, opening every one of them', async () => {
    const route: RouteDetail = {
      ...routeById.s1,
      alert: 'No delays reported on this route.',
      serviceAlerts: [
        { id: 'a1', header: 'Nov 8: buses detoured', description: null, label: 'Upcoming service change', warning: false },
        { id: 'a2', header: 'Nov 15: stop closed', description: null, label: 'Upcoming service change', warning: false },
      ],
    } as RouteDetail;
    const screen = render(<AppSettingsProvider><RouteDetailView isFavorite={false} onBack={jest.fn()} onToggleFavorite={jest.fn()} route={route} /></AppSettingsProvider>);
    expect(await screen.findByTestId('service-alerts')).toHaveTextContent(/Upcoming service change · 2/);
    expect(screen.queryByTestId('service-alerts-1')).toBeNull();
    fireEvent.press(screen.getByTestId('service-alerts'));
    expect(screen.getByText('Nov 8: buses detoured')).toBeTruthy();
    expect(screen.getByText('Nov 15: stop closed')).toBeTruthy();
    expect(screen.getByText('Service alerts')).toBeTruthy();
  });
});

describe('Which direction a nearby card opens on', () => {
  const [first, second] = routeById.s1.directions;
  const card = (a: number | null, b: number | null): RouteDetail => ({
    ...routeById.s1,
    liveSource: { agencyId: 'si', routeId: 'S76', direction1StopId: 'a', direction0StopId: 'b', direction1Index: 0 },
    liveStatus: 'loaded',
    directions: [{ ...first, minutes: a ?? 0, live: false, unavailable: a == null }, { ...second, minutes: b ?? 0, live: false, unavailable: b == null }],
  });

  it('opens on the direction still running, not the one whose next trip is 5 AM tomorrow', () => {
    expect(openingDirectionIndex(card(420, 12))).toBe(1);
    expect(openingDirectionIndex(card(null, 30))).toBe(1);
    expect(openingDirectionIndex(card(8, 300))).toBe(0);
  });

  it('waits for a real answer', () => {
    expect(openingDirectionIndex({ ...card(420, 12), liveStatus: 'loading' })).toBeNull();
    expect(openingDirectionIndex(card(null, null))).toBeNull();
  });
});

describe('Exploring from the purple dot', () => {
  const stops = [0, 1, 2].map((index) => ({ stopId: String(index), name: `Stop ${index}`, lat: 40.9, lon: -73.2 + index * 0.01 }));
  const gps = { latitude: 40.7, longitude: -74 };
  const dot = { latitude: 40.901, longitude: -73.2 };

  it('shows the purple dot on the route map beside the rider dot', () => {
    const hidden = { includeHiddenElements: true };
    const exploring = render(<AppSettingsProvider><RouteMap color="#A626AA" exploreFrom={dot} focusStopId="0" stops={stops} userLocation={gps} vehicles={[]} /></AppSettingsProvider>);
    expect(exploring.getByTestId('route-explore-dot', hidden).props.coordinate).toEqual(dot);
    expect(exploring.getByTestId('route-map', hidden).props.showsUserLocation).toBe(true);
    exploring.unmount();
    const own = render(<AppSettingsProvider><RouteMap color="#A626AA" focusStopId="0" stops={stops} userLocation={gps} vehicles={[]} /></AppSettingsProvider>);
    expect(own.queryByTestId('route-explore-dot', hidden)).toBeNull();
    expect(own.getByTestId('route-map', hidden).props.showsUserLocation).toBe(true);
  });
});

describe('Pathling dialogue', () => {
  it('has plenty to say on Profile and the login screen', () => {
    expect(SETTINGS_LINES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(SETTINGS_LINES).size).toBe(SETTINGS_LINES.length);
    expect(CHATS.length).toBeGreaterThanOrEqual(15);
    expect(CHATS.every((chat) => chat.length >= 1 && chat.every((line) => line.length <= 60))).toBe(true);
  });
});

describe('Home reminder for system-wide holidays', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('reminds riders of Thanksgiving a few days ahead, but not of smaller holidays', () => {
    expect(upcomingSystemNotices(new Date('2026-11-23T15:00:00Z'))).toEqual([expect.objectContaining({ id: 'holiday-20261126', text: 'Thanksgiving Nov 26: holiday schedules on most lines' })]);
    // Veterans Day changes only some lines: Route View's pill covers it.
    expect(upcomingSystemNotices(new Date('2026-11-09T15:00:00Z'))).toEqual([]);
    // Too far ahead yet.
    expect(upcomingSystemNotices(new Date('2026-11-19T15:00:00Z'))).toEqual([]);
    expect(upcomingSystemNotices(new Date('2026-12-25T15:00:00Z'))[0]!.text).toBe('Christmas Day today: holiday schedules on most lines');
  });

  it('stays dismissed once closed', async () => {
    const now = new Date('2026-11-24T15:00:00Z');
    const first = renderHook(() => useSystemNotice(now));
    await act(async () => {});
    expect(first.result.current.notice?.id).toBe('holiday-20261126');
    await act(async () => first.result.current.dismiss());
    expect(first.result.current.notice).toBeNull();
    first.unmount();
    const again = renderHook(() => useSystemNotice(now));
    await act(async () => {});
    expect(again.result.current.notice).toBeNull();
  });

  it('is a small line with a close button', () => {
    const onDismiss = jest.fn();
    const [notice] = upcomingSystemNotices(new Date('2026-11-24T15:00:00Z'));
    const screen = render(<AppSettingsProvider><SystemNoticeBanner notice={notice!} onDismiss={onDismiss} /></AppSettingsProvider>);
    expect(screen.getByText('Thanksgiving Nov 26: holiday schedules on most lines')).toBeTruthy();
    fireEvent.press(screen.getByTestId('system-notice-close'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('Layers popup', () => {
  it('names its sections "Show agency lines" and "Show nearby & saved lines"', () => {
    const screen = render(
      <AppSettingsProvider>
        <LineLayersSheet choice={{ groups: [], routes: [] }} lines={[{ agencyId: 'suffolk', routeId: '51', shortName: '51', color: '#C43D4B', agency: 'Suffolk County Transit' }]} onChange={jest.fn()} onClose={jest.fn()} visible={true} />
      </AppSettingsProvider>,
    );
    expect(screen.getByTestId('line-layers-agency-heading')).toHaveTextContent('SHOW AGENCY LINES');
    expect(screen.getByTestId('line-layers-nearby-heading')).toHaveTextContent('SHOW NEARBY & SAVED LINES');
    expect(screen.queryByText('SHOW EVERY LINE')).toBeNull();
    expect(screen.queryByText('LINES')).toBeNull();
  });
});

describe('Edit favorite popup', () => {
  it('names the street once: the place first, then the rest of its address', () => {
    const screen = render(
      <AppSettingsProvider>
        <SavePlaceSheet
          onCancel={jest.fn()}
          onSave={jest.fn()}
          request={{ editing: true, label: 'Gym', place: { id: 'p', title: '123 William Street', subtitle: '123 William St, New York, NY 10038, USA' } }}
        />
      </AppSettingsProvider>,
    );
    expect(screen.getByTestId('save-place-title')).toHaveTextContent('123 William Street');
    expect(screen.getByTestId('save-place-address')).toHaveTextContent('New York, NY 10038');
    expect(screen.queryByText(/123 William St,/)).toBeNull();
  });

  it('shows a named place\'s full address under its name', () => {
    const screen = render(
      <AppSettingsProvider>
        <SavePlaceSheet onCancel={jest.fn()} onSave={jest.fn()} request={{ editing: true, place: { id: 'p', title: 'Blink Fitness', subtitle: '1 Main St, Stony Brook, NY' } }} />
      </AppSettingsProvider>,
    );
    expect(screen.getByTestId('save-place-address')).toHaveTextContent('1 Main St, Stony Brook, NY');
  });
});

describe('Map buttons placement (DetailMapPage)', () => {
  const page = (mapButtonsTop?: number) => render(
    <AppSettingsProvider>
      <DetailMapPage action={<></>} contentTestID="c" controls={null} map={null} mapButtons={<></>} mapButtonsTop={mapButtonsTop} mapHeight={300} mapTestID="m" scrollTestID="s" testID="t">{null}</DetailMapPage>
    </AppSettingsProvider>,
  );

  it('sits just above the sheet by default, and under the top row when asked', () => {
    expect(StyleSheet.flatten(page().getByTestId('s-map-buttons').props.style)).toMatchObject({ bottom: expect.any(Number) });
    const top = StyleSheet.flatten(page(64).getByTestId('s-map-buttons').props.style);
    expect(top.top).toBe(64);
    expect(top.bottom).toBeUndefined();
  });
});

describe('Route View opened from search', () => {
  it('stays on the direction it opened on when live times come in', async () => {
    const [first, second] = routeById.s1.directions;
    const base: RouteDetail = { ...routeById.s1, alert: 'No delays reported on this route.', serviceAlerts: [] };
    const live = (route: RouteDetail): RouteDetail => ({ ...route, directions: [{ ...first, minutes: 40, live: true, unavailable: false }, { ...second, minutes: 3, live: true, unavailable: false }] });
    const screen = render(<AppSettingsProvider><RouteDetailView isFavorite={false} onBack={jest.fn()} onToggleFavorite={jest.fn()} route={base} wholeRoute={true} /></AppSettingsProvider>);
    await act(async () => {});
    expect(screen.getByTestId('route-direction-switch-0').props.accessibilityState.selected).toBe(true);
    screen.rerender(<AppSettingsProvider><RouteDetailView isFavorite={false} onBack={jest.fn()} onToggleFavorite={jest.fn()} route={live(base)} wholeRoute={true} /></AppSettingsProvider>);
    await act(async () => {});
    expect(screen.getByTestId('route-direction-switch-0').props.accessibilityState.selected).toBe(true);
    screen.unmount();

    // Opened at the rider's own stop, the sooner direction still leads.
    const atStop = render(<AppSettingsProvider><RouteDetailView isFavorite={false} onBack={jest.fn()} onToggleFavorite={jest.fn()} route={live(base)} /></AppSettingsProvider>);
    await act(async () => {});
    expect(atStop.getByTestId('route-direction-switch-1').props.accessibilityState.selected).toBe(true);
  });
});

describe('Route View layout', () => {
  const liveRoute: RouteDetail = { ...routeById.s1, alert: 'No delays reported on this route.', serviceAlerts: [], predictions: [{ minutes: 4, live: true, delayMinutes: 0 }], reversePredictions: [{ minutes: 9, live: true, delayMinutes: 0 }] };
  const renderRoute = (onGo?: () => void) => render(
    <AppSettingsProvider>
      <RouteDetailView isFavorite={false} onBack={jest.fn()} onGo={onGo} onToggleFavorite={jest.fn()} route={liveRoute} />
    </AppSettingsProvider>,
  );

  it('draws the stop line as thick as the map\'s, with the rider\'s stop as a big white bead', async () => {
    const screen = renderRoute();
    await act(async () => {});
    const row = screen.getByTestId('stop-row-0');
    const rails = row.findAll((node: { type: unknown; props: { style?: unknown } }) => typeof node.type === 'string' && StyleSheet.flatten(node.props.style as never)?.position === 'absolute' && StyleSheet.flatten(node.props.style as never)?.height === '50%');
    expect(rails.length).toBeGreaterThan(0);
    expect(StyleSheet.flatten(rails[0]!.props.style).width).toBe(8);
    const dot = within(screen.getByTestId('route-detail-content')).getByTestId('stop-dot-highlighted-0');
    expect(StyleSheet.flatten(dot.props.style)).toMatchObject({ width: 26, backgroundColor: '#FFFFFF' });
  });

  it('moves Locate up under the top buttons when GO is shown', async () => {
    const withGo = renderRoute(jest.fn());
    await act(async () => {});
    expect(withGo.getByTestId('route-go')).toBeTruthy();
    const style = StyleSheet.flatten(withGo.getByTestId('route-detail-scroll-map-buttons').props.style);
    expect(style.top).toEqual(expect.any(Number));
    expect(style.bottom).toBeUndefined();
    withGo.unmount();

    const withoutGo = renderRoute();
    await act(async () => {});
    expect(StyleSheet.flatten(withoutGo.getByTestId('route-detail-scroll-map-buttons').props.style).bottom).toEqual(expect.any(Number));
  });
});
