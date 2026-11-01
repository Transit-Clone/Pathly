import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

import { DetailMapPage } from '../src/components/DetailMapPage';
import { AccessibilitySettings } from '../src/components/SettingsPages';
import { MAP_LOGO_CLEARANCE, thumbSide } from '../src/hooks/useThumbSide';
import { AppSettingsProvider, DISPLAY_SETTINGS_KEY, useAppSettings } from '../src/theme/AppSettings';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

const wrapper = ({ children }: { children: ReactNode }) => <AppSettingsProvider>{children}</AppSettingsProvider>;

async function savedDisplay(leftHanded: boolean) {
  await AsyncStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify({ leftHanded }));
}

/** The flattened style of the positioned wrapper around a control on the page. */
function renderPage() {
  const screen = render(
    <DetailMapPage
      action={<View testID="the-action" />}
      contentTestID="content"
      controls={<Text>Controls</Text>}
      map={<View />}
      mapButtons={<View testID="the-button" />}
      mapHeight={400}
      mapTestID="map"
      scrollTestID="scroll"
      testID="page"
    >
      <Text>Sheet</Text>
    </DetailMapPage>,
    { wrapper },
  );
  return {
    ...screen,
    placed: (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).parent?.parent?.props.style),
  };
}

describe('left-handed mode', () => {
  beforeEach(() => AsyncStorage.clear());

  it('places controls by the setting, and leaves the default layout alone', () => {
    const right = thumbSide(false);
    expect(right.anchor(16)).toEqual({ right: 16 });
    expect(right.edgeMargin(4)).toEqual({ marginRight: 4 });
    expect(right.towardEdge(200)).toBe(200);
    expect(right.row).toBe('row');
    expect(right.mapBottomClearance).toBe(0);

    const left = thumbSide(true);
    expect(left.anchor(16)).toEqual({ left: 16 });
    expect(left.edgeMargin(4)).toEqual({ marginLeft: 4 });
    expect(left.towardEdge(200)).toBe(-200);
    expect(left.row).toBe('row-reverse');
    expect(left.mapBottomClearance).toBe(MAP_LOGO_CLEARANCE);
  });

  it('defaults to off, persists across launches, and ignores a bad saved value', async () => {
    const first = renderHook(() => useAppSettings(), { wrapper });
    await act(async () => undefined);
    expect(first.result.current.leftHanded).toBe(false);

    act(() => first.result.current.setLeftHanded(true));
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(DISPLAY_SETTINGS_KEY))!)).toMatchObject({ leftHanded: true }));
    first.unmount();

    const relaunched = renderHook(() => useAppSettings(), { wrapper });
    await waitFor(() => expect(relaunched.result.current.leftHanded).toBe(true));
    relaunched.unmount();

    await AsyncStorage.setItem(DISPLAY_SETTINGS_KEY, '{"leftHanded":"yes"}');
    const corrupted = renderHook(() => useAppSettings(), { wrapper });
    await act(async () => undefined);
    expect(corrupted.result.current.leftHanded).toBe(false);
  });

  it('switches from the Accessibility page', async () => {
    const onFeedback = jest.fn();
    const screen = render(<AccessibilitySettings onFeedback={onFeedback} />, { wrapper });
    await act(async () => undefined);
    expect(screen.getByTestId('toggle-left-handed').props.value).toBe(false);
    fireEvent(screen.getByTestId('toggle-left-handed'), 'valueChange', true);
    expect(onFeedback).toHaveBeenCalledWith('Left-handed mode on');
    expect(screen.getByTestId('toggle-left-handed').props.value).toBe(true);
  });

  it('keeps the map buttons and sticky action on the right when off', async () => {
    const screen = renderPage();
    await act(async () => undefined);
    expect(screen.placed('the-button')).toMatchObject({ right: 16, bottom: 86, flexDirection: 'row' });
    expect(screen.placed('the-button').left).toBeUndefined();
    expect(screen.placed('the-action')).toMatchObject({ right: 18 });
  });

  it('moves them to the left when on, lifted clear of the map logo', async () => {
    await savedDisplay(true);
    const screen = renderPage();
    await waitFor(() => expect(screen.placed('the-button')).toMatchObject({ left: 16, bottom: 86 + MAP_LOGO_CLEARANCE, flexDirection: 'row-reverse' }));
    expect(screen.placed('the-button').right).toBeUndefined();
    expect(screen.placed('the-action')).toMatchObject({ left: 18 });
    expect(screen.placed('the-action').right).toBeUndefined();
  });
});
