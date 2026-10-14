import { act, renderHook, waitFor } from '@testing-library/react-native';

import { autocompletePlaces, type SearchPlace } from '../src/data/placesSearch';
import { mergeSearchResults, searchTransitStops } from '../src/data/stopSearch';
import { usePlacesSearch } from '../src/hooks/usePlacesSearch';

jest.mock('../src/data/placesSearch', () => ({
  ...jest.requireActual('../src/data/placesSearch'),
  getPlacesApiKey: jest.fn(() => 'test-key'),
  autocompletePlaces: jest.fn(),
}));
jest.mock('../src/data/stopSearch', () => ({
  ...jest.requireActual('../src/data/stopSearch'),
  searchTransitStops: jest.fn(),
}));

const mockAutocomplete = autocompletePlaces as jest.MockedFunction<typeof autocompletePlaces>;
const mockStops = searchTransitStops as jest.MockedFunction<typeof searchTransitStops>;

const stop = (title: string, kind: SearchPlace['kind'] = 'rail'): SearchPlace => ({ id: `stop:${title}`, title, subtitle: 'LIRR', kind, source: 'pathly', routes: [{ shortName: 'PJ', color: '#00985F' }] });
const place = (title: string, kind: SearchPlace['kind'] = 'place'): SearchPlace => ({ id: `g:${title}`, title, subtitle: 'Queens, NY', kind, source: 'google' });

beforeEach(() => {
  mockAutocomplete.mockReset();
  mockStops.mockReset();
});

describe('mergeSearchResults', () => {
  it('lists up to three stops first, then Google places in their order', () => {
    const merged = mergeSearchResults(
      [stop('Jamaica'), stop('Jamaica-179 St', 'subway'), stop('Jamaica Bus Term', 'bus'), stop('Jamaica Center', 'subway')],
      [place('Jamaica Ave'), place('Jamaica Hospital')],
    );
    expect(merged.map((item) => item.title)).toEqual(['Jamaica', 'Jamaica-179 St', 'Jamaica Bus Term', 'Jamaica Ave', 'Jamaica Hospital']);
  });

  it('leaves out a Google station a listed stop already covers, but not a plain place', () => {
    const merged = mergeSearchResults(
      [stop('Jamaica')],
      [place('Jamaica Station', 'rail'), place('Jamaica', 'place'), place('Penn Station', 'rail')],
    );
    expect(merged.map((item) => item.id)).toEqual(['stop:Jamaica', 'g:Jamaica', 'g:Penn Station']);
  });
});

describe('usePlacesSearch', () => {
  it('shows stops above Google places once both answer', async () => {
    mockAutocomplete.mockResolvedValue([place('Jamaica Ave')]);
    mockStops.mockResolvedValue([stop('Jamaica')]);
    const { result } = renderHook(() => usePlacesSearch('jamaica', { latitude: 40.9, longitude: -73.1 }));
    await waitFor(() => expect(result.current.suggestions.map((item) => item.title)).toEqual(['Jamaica', 'Jamaica Ave']));
    expect(mockStops).toHaveBeenCalledWith('jamaica', { latitude: 40.9, longitude: -73.1 });
  });

  it("shows Google's places on their own when the stop search fails", async () => {
    mockAutocomplete.mockResolvedValue([place('Jamaica Ave')]);
    mockStops.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePlacesSearch('jamaica'));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.suggestions.map((item) => item.title)).toEqual(['Jamaica Ave']);
  });

  it('adds stops that arrive late above the Google rows, keeping their order', async () => {
    let answerStops: (stops: SearchPlace[]) => void = () => undefined;
    mockAutocomplete.mockResolvedValue([place('Jamaica Ave'), place('Jamaica Hospital')]);
    mockStops.mockReturnValue(new Promise((resolve) => {
      answerStops = resolve;
    }));
    const { result } = renderHook(() => usePlacesSearch('jamaica'));
    await waitFor(() => expect(result.current.suggestions.map((item) => item.title)).toEqual(['Jamaica Ave', 'Jamaica Hospital']));
    await act(async () => answerStops([stop('Jamaica')]));
    expect(result.current.suggestions.map((item) => item.title)).toEqual(['Jamaica', 'Jamaica Ave', 'Jamaica Hospital']);
  });

  it('shows matching stops even when Google has no places', async () => {
    mockAutocomplete.mockResolvedValue([]);
    mockStops.mockResolvedValue([stop('Stony Brook')]);
    const { result } = renderHook(() => usePlacesSearch('stony brook'));
    await waitFor(() => expect(result.current.suggestions.map((item) => item.title)).toEqual(['Stony Brook']));
  });
});
