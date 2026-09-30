import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as ReactNative from 'react-native';

import { AppSettingsProvider, resolveScheme, useAppSettings, type Appearance } from '../src/theme/AppSettings';
import { darkColors, lightColors } from '../src/theme/colors';

function renderSettings(initialAppearance?: Appearance) {
  return renderHook(() => useAppSettings(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AppSettingsProvider initialAppearance={initialAppearance}>{children}</AppSettingsProvider>
    ),
  });
}

describe('app settings', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves Light, Dark, and System appearance', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
  });

  it('defaults to light and switches palettes when appearance changes', () => {
    const { result } = renderSettings();
    expect(result.current.appearance).toBe('light');
    expect(result.current.colors).toBe(lightColors);
    act(() => result.current.setAppearance('dark'));
    expect(result.current.isDark).toBe(true);
    expect(result.current.colors).toBe(darkColors);
  });

  it('follows the device scheme in System mode', () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    const { result } = renderSettings('system');
    expect(result.current.scheme).toBe('dark');
  });

  it('combines the app toggle and the device reduce-motion preference', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { result } = renderSettings();
    await act(async () => undefined);
    expect(result.current.reducedMotion).toBe(false);
    expect(result.current.reducedMotionActive).toBe(true);
  });

  it('activates reduced motion from the app toggle alone', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { result } = renderSettings();
    await act(async () => undefined);
    expect(result.current.reducedMotionActive).toBe(false);
    act(() => result.current.setReducedMotion(true));
    expect(result.current.reducedMotionActive).toBe(true);
  });
});
