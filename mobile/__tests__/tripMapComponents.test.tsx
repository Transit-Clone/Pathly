/* eslint-disable @typescript-eslint/no-require-imports -- Jest's hoisted mock factory cannot use module-scope imports. */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TripMap as NativeTripMap } from '../src/components/TripMap.native';
import { TripMap as WebTripMap } from '../src/components/TripMap.web';
import type { TripMapProgress } from '../src/data/tripMap';

jest.mock('@react-google-maps/api', () => {
  const React = require('react');
  const { View: MockView } = require('react-native');
  const mockMap = {
    fitBounds: jest.fn(),
    getZoom: jest.fn(() => 14),
    panTo: jest.fn(),
    setZoom: jest.fn(),
  };
  const GoogleMap = ({ children, onLoad, ...props }: { children: React.ReactNode; onLoad?: (map: typeof mockMap) => void }) => {
    React.useEffect(() => onLoad?.(mockMap), [onLoad]);
    return <MockView {...props} testID="web-google-map">{children}</MockView>;
  };
  const Marker = (props: object) => <MockView {...props} testID="web-marker" />;
  const OverlayViewF = ({ children }: { children: React.ReactNode }) => <MockView testID="web-overlay">{children}</MockView>;
  const Polyline = (props: object) => <MockView {...props} testID="web-polyline" />;
  return {
    FLOAT_PANE: 'floatPane',
    GoogleMap,
    Marker,
    OverlayViewF,
    Polyline,
    mockMap,
    useJsApiLoader: () => ({ isLoaded: true }),
  };
});

const ORIGIN = { lat: 40.9, lng: -73.12 };
const DESTINATION = { lat: 40.93, lng: -73.08 };
const progress: TripMapProgress = {
  segments: [
    { path: [ORIGIN, { lat: 40.91, lng: -73.11 }], walk: false, color: '#0062CF', state: 'completed', stepIndex: 0 },
    { path: [{ lat: 40.91, lng: -73.11 }, { lat: 40.92, lng: -73.1 }], walk: true, state: 'current', stepIndex: 1 },
    { path: [{ lat: 40.92, lng: -73.1 }, DESTINATION], walk: false, color: '#F26A21', state: 'upcoming', stepIndex: 2 },
  ],
  stops: [
    { point: ORIGIN, kind: 'start', state: 'completed', visible: true },
    { point: { lat: 40.92, lng: -73.1 }, kind: 'stop', state: 'current', visible: true },
    { point: DESTINATION, kind: 'end', state: 'upcoming', visible: true },
  ],
  followTarget: { lat: 40.92, lng: -73.1 },
};

type WebMapMock = {
  fitBounds: jest.Mock;
  getZoom: jest.Mock;
  panTo: jest.Mock;
  setZoom: jest.Mock;
};

describe('native active TripMap', () => {
  beforeEach(() => {
    const maps = jest.requireMock('react-native-maps') as { mockAnimateCamera: jest.Mock; mockFitToCoordinates: jest.Mock };
    maps.mockAnimateCamera.mockClear();
    maps.mockFitToCoordinates.mockClear();
  });

  it('uses an explicit stale-capable marker and progress styles', () => {
    const screen = render(
      <NativeTripMap
        destination={DESTINATION}
        interactive={true}
        navigationProgress={progress}
        origin={ORIGIN}
        testID="native-nav-map"
        userLocation={{ lat: 40.915, lng: -73.105 }}
        userLocationStale={true}
      />,
    );

    const map = screen.getByTestId('native-nav-map', { includeHiddenElements: true });
    expect(map.props.showsUserLocation).toBe(false);
    expect(screen.getByTestId('native-nav-map-user-location', { includeHiddenElements: true }).props.coordinate).toEqual({ latitude: 40.915, longitude: -73.105 });
    expect(StyleSheet.flatten(screen.getByTestId('native-nav-map-user-location-visual', { includeHiddenElements: true }).props.style).opacity).toBe(0.45);
    expect(screen.getByTestId('native-nav-map-progress-completed-0', { includeHiddenElements: true }).props.strokeWidth).toBe(4);
    expect(screen.getByTestId('native-nav-map-progress-current-1', { includeHiddenElements: true }).props.strokeWidth).toBe(8);
    expect(screen.getByTestId('native-nav-map-progress-upcoming-2', { includeHiddenElements: true }).props.strokeColor).toBe('#F26A21');
  });

  it('follows movement, pauses after a pan, and resumes from locate', () => {
    const onFollowModeChange = jest.fn();
    const maps = jest.requireMock('react-native-maps') as { mockFitToCoordinates: jest.Mock };
    const screen = render(
      <NativeTripMap
        centerOnUserRequest={0}
        destination={DESTINATION}
        followUser={true}
        interactive={true}
        navigationProgress={progress}
        onFollowModeChange={onFollowModeChange}
        origin={ORIGIN}
        testID="native-follow-map"
        userLocation={{ lat: 40.915, lng: -73.105 }}
      />,
    );
    const map = screen.getByTestId('native-follow-map', { includeHiddenElements: true });
    fireEvent(map, 'mapReady');
    expect(maps.mockFitToCoordinates).toHaveBeenCalledWith(
      expect.arrayContaining([{ latitude: 40.915, longitude: -73.105 }]),
      expect.objectContaining({ animated: true }),
    );

    maps.mockFitToCoordinates.mockClear();
    screen.rerender(
      <NativeTripMap
        centerOnUserRequest={0}
        destination={DESTINATION}
        followUser={true}
        interactive={true}
        navigationProgress={progress}
        onFollowModeChange={onFollowModeChange}
        origin={ORIGIN}
        testID="native-follow-map"
        userLocation={{ lat: 40.916, lng: -73.104 }}
      />,
    );
    expect(maps.mockFitToCoordinates).toHaveBeenCalledWith(
      expect.arrayContaining([{ latitude: 40.916, longitude: -73.104 }]),
      expect.objectContaining({ animated: true }),
    );

    maps.mockFitToCoordinates.mockClear();
    fireEvent(map, 'panDrag');
    expect(onFollowModeChange).toHaveBeenLastCalledWith(false);
    expect(maps.mockFitToCoordinates).not.toHaveBeenCalled();
    screen.rerender(
      <NativeTripMap
        centerOnUserRequest={0}
        destination={DESTINATION}
        followUser={false}
        interactive={true}
        navigationProgress={progress}
        onFollowModeChange={onFollowModeChange}
        origin={ORIGIN}
        testID="native-follow-map"
        userLocation={{ lat: 40.918, lng: -73.102 }}
      />,
    );
    maps.mockFitToCoordinates.mockClear();
    screen.rerender(
      <NativeTripMap
        centerOnUserRequest={1}
        destination={DESTINATION}
        followUser={false}
        interactive={true}
        navigationProgress={progress}
        onFollowModeChange={onFollowModeChange}
        origin={ORIGIN}
        testID="native-follow-map"
        userLocation={{ lat: 40.918, lng: -73.102 }}
      />,
    );
    expect(onFollowModeChange).toHaveBeenLastCalledWith(true);
    expect(maps.mockFitToCoordinates).toHaveBeenCalledWith(
      expect.arrayContaining([{ latitude: 40.918, longitude: -73.102 }]),
      expect.objectContaining({ animated: true }),
    );
  });

  it('keeps the raw marker visible without following an unaccepted jump', () => {
    const maps = jest.requireMock('react-native-maps') as { mockFitToCoordinates: jest.Mock };
    const accepted = { lat: 40.915, lng: -73.105 };
    const rawJump = { lat: 41.2, lng: -72.7 };
    const screen = render(
      <NativeTripMap
        destination={DESTINATION}
        followLocation={accepted}
        followUser={true}
        interactive={true}
        navigationProgress={progress}
        origin={ORIGIN}
        testID="native-credible-follow-map"
        userLocation={rawJump}
      />,
    );

    fireEvent(screen.getByTestId('native-credible-follow-map', { includeHiddenElements: true }), 'mapReady');
    expect(screen.getByTestId('native-credible-follow-map-user-location', { includeHiddenElements: true }).props.coordinate)
      .toEqual({ latitude: rawJump.lat, longitude: rawJump.lng });
    expect(maps.mockFitToCoordinates).toHaveBeenCalledWith(
      expect.arrayContaining([{ latitude: accepted.lat, longitude: accepted.lng }]),
      expect.objectContaining({ animated: true }),
    );
    expect(maps.mockFitToCoordinates).not.toHaveBeenCalledWith(
      expect.arrayContaining([{ latitude: rawJump.lat, longitude: rawJump.lng }]),
      expect.anything(),
    );
  });

  it('centers the raw marker once on Locate without automatically following an unaccepted fix', () => {
    const onFollowModeChange = jest.fn();
    const maps = jest.requireMock('react-native-maps') as { mockAnimateCamera: jest.Mock; mockFitToCoordinates: jest.Mock };
    const rawLocation = { lat: 41.2, lng: -72.7 };
    const props = {
      destination: DESTINATION,
      followLocation: null,
      interactive: true,
      navigationProgress: progress,
      onFollowModeChange,
      origin: ORIGIN,
      testID: 'native-unaccepted-locate-map',
    };
    const screen = render(
      <NativeTripMap {...props} centerOnUserRequest={0} followUser={false} userLocation={rawLocation} />,
    );

    fireEvent(screen.getByTestId('native-unaccepted-locate-map', { includeHiddenElements: true }), 'mapReady');
    maps.mockAnimateCamera.mockClear();
    maps.mockFitToCoordinates.mockClear();
    screen.rerender(
      <NativeTripMap {...props} centerOnUserRequest={1} followUser={false} userLocation={rawLocation} />,
    );

    expect(onFollowModeChange).toHaveBeenLastCalledWith(true);
    expect(maps.mockAnimateCamera).toHaveBeenCalledWith(
      { center: { latitude: rawLocation.lat, longitude: rawLocation.lng }, zoom: 15 },
      { duration: 350 },
    );
    expect(maps.mockFitToCoordinates).not.toHaveBeenCalled();

    maps.mockAnimateCamera.mockClear();
    screen.rerender(
      <NativeTripMap
        {...props}
        centerOnUserRequest={1}
        followUser={true}
        userLocation={{ lat: rawLocation.lat + 0.01, lng: rawLocation.lng + 0.01 }}
      />,
    );
    expect(maps.mockAnimateCamera).not.toHaveBeenCalled();
    expect(maps.mockFitToCoordinates).not.toHaveBeenCalled();
  });

  it('frames active navigation while the first trustworthy location is unavailable', () => {
    const maps = jest.requireMock('react-native-maps') as { mockFitToCoordinates: jest.Mock };
    const screen = render(
      <NativeTripMap
        destination={DESTINATION}
        followUser={true}
        interactive={true}
        navigationProgress={progress}
        origin={ORIGIN}
        testID="native-no-fix-map"
      />,
    );

    fireEvent(screen.getByTestId('native-no-fix-map', { includeHiddenElements: true }), 'mapReady');

    expect(maps.mockFitToCoordinates).toHaveBeenCalledWith(
      expect.arrayContaining([
        { latitude: ORIGIN.lat, longitude: ORIGIN.lng },
        { latitude: DESTINATION.lat, longitude: DESTINATION.lng },
      ]),
      expect.objectContaining({ animated: false }),
    );
  });
});

describe('web active TripMap', () => {
  beforeAll(() => {
    class MockLatLngBounds {
      points: { lat: number; lng: number }[] = [];

      extend(point: { lat: number; lng: number }) {
        this.points.push(point);
        return this;
      }
    }
    (globalThis as unknown as { google: unknown }).google = {
      maps: {
        LatLngBounds: MockLatLngBounds,
        SymbolPath: { CIRCLE: 'circle' },
      },
    };
  });

  beforeEach(() => {
    const { mockMap } = jest.requireMock('@react-google-maps/api') as { mockMap: WebMapMock };
    Object.values(mockMap).forEach((method) => method.mockClear());
    mockMap.getZoom.mockReturnValue(14);
  });

  it('matches native marker freshness and completed/current/upcoming styling', async () => {
    const screen = render(
      <WebTripMap
        destination={DESTINATION}
        interactive={true}
        navigationProgress={progress}
        origin={ORIGIN}
        testID="web-nav-map"
        userLocation={{ lat: 40.915, lng: -73.105 }}
        userLocationStale={true}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('web-nav-map-user-location')).toBeTruthy());
    expect(StyleSheet.flatten(screen.getByTestId('web-nav-map-user-location').props.style).opacity).toBe(0.45);

    const lines = screen.getAllByTestId('web-polyline', { includeHiddenElements: true });
    expect(lines[0]!.props.options).toMatchObject({ strokeOpacity: 0.45, strokeWeight: 4 });
    expect(lines[1]!.props.options.icons[0].icon.scale).toBe(4.25);
    expect(lines[2]!.props.options).toMatchObject({ strokeColor: '#F26A21', strokeOpacity: 1, strokeWeight: 6 });
  });

  it('follows mock movement, pauses on pan or zoom, and resumes from locate', async () => {
    const onFollowModeChange = jest.fn();
    const { mockMap } = jest.requireMock('@react-google-maps/api') as { mockMap: WebMapMock };
    const props = {
      destination: DESTINATION,
      interactive: true,
      navigationProgress: progress,
      onFollowModeChange,
      origin: ORIGIN,
      testID: 'web-follow-map',
    };
    const screen = render(<WebTripMap {...props} centerOnUserRequest={0} followUser={true} userLocation={{ lat: 40.915, lng: -73.105 }} />);
    await waitFor(() => expect(mockMap.fitBounds).toHaveBeenCalled());
    const latestBounds = mockMap.fitBounds.mock.calls.at(-1)![0] as { points: { lat: number; lng: number }[] };
    expect(latestBounds.points).toContainEqual({ lat: 40.915, lng: -73.105 });

    mockMap.fitBounds.mockClear();
    screen.rerender(<WebTripMap {...props} centerOnUserRequest={0} followUser={true} userLocation={{ lat: 40.916, lng: -73.104 }} />);
    await waitFor(() => expect(mockMap.fitBounds).toHaveBeenCalled());
    const movedBounds = mockMap.fitBounds.mock.calls.at(-1)![0] as { points: { lat: number; lng: number }[] };
    expect(movedBounds.points).toContainEqual({ lat: 40.916, lng: -73.104 });

    const map = screen.getByTestId('web-google-map', { includeHiddenElements: true });
    fireEvent(map, 'dragStart');
    expect(onFollowModeChange).toHaveBeenLastCalledWith(false);
    fireEvent(map, 'idle');
    fireEvent(map, 'zoomChanged');
    expect(onFollowModeChange).toHaveBeenLastCalledWith(false);

    screen.rerender(<WebTripMap {...props} centerOnUserRequest={0} followUser={false} userLocation={{ lat: 40.918, lng: -73.102 }} />);
    mockMap.fitBounds.mockClear();
    screen.rerender(<WebTripMap {...props} centerOnUserRequest={1} followUser={false} userLocation={{ lat: 40.918, lng: -73.102 }} />);
    await act(async () => undefined);
    expect(onFollowModeChange).toHaveBeenLastCalledWith(true);
    expect(mockMap.fitBounds).toHaveBeenCalled();
    const resumedBounds = mockMap.fitBounds.mock.calls.at(-1)![0] as { points: { lat: number; lng: number }[] };
    expect(resumedBounds.points).toContainEqual({ lat: 40.918, lng: -73.102 });
  });

  it('centers the raw marker once on Locate without automatically following an unaccepted fix', async () => {
    const onFollowModeChange = jest.fn();
    const { mockMap } = jest.requireMock('@react-google-maps/api') as { mockMap: WebMapMock };
    const rawLocation = { lat: 41.2, lng: -72.7 };
    const props = {
      destination: DESTINATION,
      followLocation: null,
      interactive: true,
      navigationProgress: progress,
      onFollowModeChange,
      origin: ORIGIN,
      testID: 'web-unaccepted-locate-map',
    };
    const screen = render(
      <WebTripMap {...props} centerOnUserRequest={0} followUser={false} userLocation={rawLocation} />,
    );
    await waitFor(() => expect(mockMap.fitBounds).toHaveBeenCalled());
    mockMap.fitBounds.mockClear();
    mockMap.panTo.mockClear();
    mockMap.setZoom.mockClear();

    screen.rerender(
      <WebTripMap {...props} centerOnUserRequest={1} followUser={false} userLocation={rawLocation} />,
    );
    await waitFor(() => expect(mockMap.panTo).toHaveBeenCalledWith(rawLocation));
    expect(onFollowModeChange).toHaveBeenLastCalledWith(true);
    expect(mockMap.setZoom).toHaveBeenCalledWith(15);
    expect(mockMap.fitBounds).not.toHaveBeenCalled();

    mockMap.panTo.mockClear();
    mockMap.setZoom.mockClear();
    screen.rerender(
      <WebTripMap
        {...props}
        centerOnUserRequest={1}
        followUser={true}
        userLocation={{ lat: rawLocation.lat + 0.01, lng: rawLocation.lng + 0.01 }}
      />,
    );
    await act(async () => undefined);
    expect(mockMap.panTo).not.toHaveBeenCalled();
    expect(mockMap.setZoom).not.toHaveBeenCalled();
    expect(mockMap.fitBounds).not.toHaveBeenCalled();
  });
});
