import { act, renderHook, waitFor } from '@testing-library/react-native';
import { httpsCallable } from 'firebase/functions';

import { useWalkingPath } from '../src/data/walkingPath';

const getWalkingPath = httpsCallable({} as never, 'getWalkingPath') as unknown as jest.Mock;
const here = { latitude: 40.7549, longitude: -73.984 };
const path = [{ lat: 40.7549, lon: -73.984 }, { lat: 40.7552, lon: -73.9866 }, { lat: 40.7553, lon: -73.9868 }];

describe('useWalkingPath', () => {
  beforeEach(() => {
    getWalkingPath.mockReset();
    getWalkingPath.mockResolvedValue({ data: { walk: { meters: 240, path } } });
  });

  it('loads the walk to the stop, and asks again only once the rider has moved ~20 m', async () => {
    const { result, rerender } = renderHook(({ location }: { location: typeof here }) => useWalkingPath('subway', '127', location), { initialProps: { location: here } });
    await waitFor(() => expect(result.current).toEqual(path));
    expect(getWalkingPath).toHaveBeenCalledWith({ agencyId: 'subway', stopId: '127', lat: here.latitude, lon: here.longitude });

    rerender({ location: { latitude: here.latitude + 0.00003, longitude: here.longitude } });
    expect(getWalkingPath).toHaveBeenCalledTimes(1);
    await act(async () => rerender({ location: { latitude: here.latitude + 0.0004, longitude: here.longitude } }));
    expect(getWalkingPath).toHaveBeenCalledTimes(2);
  });

  it('drops the old walk at once when the stop changes', async () => {
    const { result, rerender } = renderHook(({ stopId }: { stopId: string }) => useWalkingPath('subway', stopId, here), { initialProps: { stopId: '127' } });
    await waitFor(() => expect(result.current).toEqual(path));
    getWalkingPath.mockReturnValue(new Promise(() => {}));
    rerender({ stopId: '725' });
    expect(result.current).toBeNull();
  });

  it('draws nothing without a known location, when there is no walk, or when the call fails', async () => {
    const { result: noLocation } = renderHook(() => useWalkingPath('subway', '127', undefined));
    expect(noLocation.current).toBeNull();
    expect(getWalkingPath).not.toHaveBeenCalled();

    getWalkingPath.mockResolvedValue({ data: { walk: null } });
    const { result: none } = renderHook(() => useWalkingPath('subway', '127', here));
    await waitFor(() => expect(getWalkingPath).toHaveBeenCalled());
    expect(none.current).toBeNull();

    getWalkingPath.mockRejectedValue(Object.assign(new Error('not found'), { code: 'functions/not-found' }));
    const { result: failed } = renderHook(() => useWalkingPath('lirr', '14', here));
    await waitFor(() => expect(getWalkingPath).toHaveBeenCalledTimes(2));
    expect(failed.current).toBeNull();
  });
});
