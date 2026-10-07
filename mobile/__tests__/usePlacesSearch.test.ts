import { act, renderHook } from '@testing-library/react-native';

import { autocompletePlaces, getPlacesApiKey } from '../src/data/placesSearch';
import { PLACES_DEBOUNCE_MS, usePlacesSearch } from '../src/hooks/usePlacesSearch';

jest.mock('../src/data/placesSearch', () => ({
  ...jest.requireActual('../src/data/placesSearch'),
  autocompletePlaces: jest.fn(),
  getPlacesApiKey: jest.fn(() => 'test-key'),
}));

const mockAutocomplete = autocompletePlaces as jest.MockedFunction<typeof autocompletePlaces>;
const mockGetKey = getPlacesApiKey as jest.MockedFunction<typeof getPlacesApiKey>;

const place = (id: string) => ({ id, title: id, subtitle: 'NY' });

/** Advances past the debounce and lets the pending request's promise settle. */
async function flushDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(PLACES_DEBOUNCE_MS);
  });
}

describe('usePlacesSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockAutocomplete.mockReset();
    mockGetKey.mockReturnValue('test-key');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays idle and sends nothing for empty or whitespace queries', async () => {
    const { result, rerender } = renderHook(({ query }: { query: string }) => usePlacesSearch(query), { initialProps: { query: '' } });
    expect(result.current.status).toBe('idle');
    rerender({ query: '   ' });
    await flushDebounce();
    expect(result.current.status).toBe('idle');
    expect(mockAutocomplete).not.toHaveBeenCalled();
  });

  it('sends one request for the final query after a burst of typing', async () => {
    mockAutocomplete.mockResolvedValue([place('stony-brook')]);
    const { result, rerender } = renderHook(({ query }: { query: string }) => usePlacesSearch(query), { initialProps: { query: 'S' } });
    rerender({ query: 'St' });
    rerender({ query: 'Sto' });
    rerender({ query: 'Stony' });
    expect(result.current.status).toBe('loading');

    await flushDebounce();

    expect(mockAutocomplete).toHaveBeenCalledTimes(1);
    expect(mockAutocomplete).toHaveBeenCalledWith(expect.objectContaining({ input: 'Stony' }));
    expect(result.current.status).toBe('success');
    expect(result.current.suggestions).toEqual([place('stony-brook')]);
  });

  it('ignores a late response for an older query', async () => {
    let resolveOld: (value: ReturnType<typeof place>[]) => void = () => undefined;
    mockAutocomplete
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce([place('new')]);
    const { result, rerender } = renderHook(({ query }: { query: string }) => usePlacesSearch(query), { initialProps: { query: 'old' } });
    await flushDebounce();

    rerender({ query: 'new' });
    await flushDebounce();
    await act(async () => resolveOld([place('old')]));

    expect(result.current.suggestions).toEqual([place('new')]);
  });

  it('reports unconfigured without a key and never calls Google', async () => {
    mockGetKey.mockReturnValue('');
    const { result } = renderHook(() => usePlacesSearch('Penn Station'));
    await flushDebounce();
    expect(result.current.status).toBe('unconfigured');
    expect(mockAutocomplete).not.toHaveBeenCalled();
  });

  it('reports errors and recovers on retry', async () => {
    mockAutocomplete.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([place('retry')]);
    const { result } = renderHook(() => usePlacesSearch('Penn'));
    await flushDebounce();
    expect(result.current.status).toBe('error');

    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await flushDebounce();
    expect(result.current.status).toBe('success');
    expect(result.current.suggestions).toEqual([place('retry')]);
  });

  it('reuses one session token until the session ends', async () => {
    mockAutocomplete.mockResolvedValue([]);
    const { result, rerender } = renderHook(({ query }: { query: string }) => usePlacesSearch(query), { initialProps: { query: 'a' } });
    await flushDebounce();
    rerender({ query: 'ab' });
    await flushDebounce();
    const [first, second] = mockAutocomplete.mock.calls.map(([options]) => options.sessionToken);
    expect(first).toBe(second);
    expect(result.current.getSessionToken()).toBe(first);

    act(() => result.current.endSession());
    expect(result.current.getSessionToken()).not.toBe(first);
  });
});
