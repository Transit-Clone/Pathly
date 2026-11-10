import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { Animated, StyleSheet, Text } from 'react-native';

import { AnimatedSwitch } from '../src/components/AnimatedSwitch';
import { SheetPanel } from '../src/components/SheetPanel';
import { MARKER_SETTLE_MS, useMarkerTracking } from '../src/hooks/useMarkerTracking';
import { AppSettingsProvider } from '../src/theme/AppSettings';
import { ScreenTransition } from '../src/theme/motion';

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('useMarkerTracking', () => {
  it('tracks a marker only briefly after its look changes, so Android stops re-picturing it', () => {
    jest.useFakeTimers();
    const { result, rerender } = renderHook(({ look }: { look: string }) => useMarkerTracking(look), { initialProps: { look: 'light' } });
    expect(result.current).toBe(true);
    act(() => jest.advanceTimersByTime(MARKER_SETTLE_MS));
    expect(result.current).toBe(false);
    rerender({ look: 'dark' });
    expect(result.current).toBe(true);
    act(() => jest.advanceTimersByTime(MARKER_SETTLE_MS));
    expect(result.current).toBe(false);
  });
});

describe('AnimatedSwitch', () => {
  it('flips on a tap, reports its state, and springs the knob across', () => {
    const spring = jest.spyOn(Animated, 'spring');
    const onValueChange = jest.fn();
    const screen = render(<AppSettingsProvider><AnimatedSwitch accessibilityLabel="Show buses" onValueChange={onValueChange} testID="switch" value={false} /></AppSettingsProvider>);
    const control = screen.getByTestId('switch');
    expect(control.props.accessibilityRole).toBe('switch');
    expect(control.props.accessibilityState).toEqual({ checked: false });
    fireEvent.press(control);
    expect(onValueChange).toHaveBeenCalledWith(true);
    screen.rerender(<AppSettingsProvider><AnimatedSwitch accessibilityLabel="Show buses" onValueChange={onValueChange} testID="switch" value={true} /></AppSettingsProvider>);
    expect(screen.getByTestId('switch').props.accessibilityState).toEqual({ checked: true });
    expect(spring).toHaveBeenCalled();
  });

  it('changes at once under Reduce motion', () => {
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    const screen = render(<AppSettingsProvider initialReducedMotion={true}><AnimatedSwitch onValueChange={jest.fn()} testID="switch" value={false} /></AppSettingsProvider>);
    fireEvent(screen.getByTestId('switch'), 'pressIn');
    expect(spring).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
  });
});

describe('SheetPanel', () => {
  it('starts below its resting place and rises into it', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const screen = render(<AppSettingsProvider><SheetPanel testID="sheet"><Text>Sheet</Text></SheetPanel></AppSettingsProvider>);
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0 }));
    const style = StyleSheet.flatten(screen.getByTestId('sheet').props.style);
    expect(style.transform[0].translateY).toBeGreaterThan(0);
  });
});

describe('ScreenTransition', () => {
  const slideStart = (screen: ReturnType<typeof render>, text: string) => {
    let node = screen.getByText(text).parent;
    while (node && !StyleSheet.flatten(node.props.style)?.transform) node = node.parent;
    return StyleSheet.flatten(node!.props.style).transform[0].translateX as number;
  };

  it('slides a deeper page in from the right and the page gone back to in from the left', () => {
    const deeper = render(<AppSettingsProvider><ScreenTransition depth={0} group="test"><Text>Hub</Text></ScreenTransition></AppSettingsProvider>);
    deeper.rerender(<AppSettingsProvider><ScreenTransition depth={1} group="test" key="page"><Text>Page</Text></ScreenTransition></AppSettingsProvider>);
    expect(slideStart(deeper, 'Page')).toBeGreaterThan(0);
    deeper.rerender(<AppSettingsProvider><ScreenTransition depth={0} group="test" key="hub"><Text>Hub again</Text></ScreenTransition></AppSettingsProvider>);
    expect(slideStart(deeper, 'Hub again')).toBeLessThan(0);
  });
});
