import { render } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { BeanAvatar } from '../src/avatars/BeanAvatarImage';
import { useAppSettings } from '../src/theme/AppSettings';

jest.mock('../src/theme/AppSettings', () => ({ useAppSettings: jest.fn() }));

function motionPreference(reducedMotionActive: boolean) {
  jest.mocked(useAppSettings).mockReturnValue({ reducedMotionActive } as ReturnType<typeof useAppSettings>);
}

afterEach(() => jest.restoreAllMocks());

it('stops idle animation on unmount and when reduced motion is enabled', () => {
  const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
  const loop = jest.spyOn(Animated, 'loop').mockReturnValue(animation);
  motionPreference(false);
  const screen = render(<BeanAvatar animated={true} />);
  expect(animation.start).toHaveBeenCalledTimes(1);
  motionPreference(true);
  screen.rerender(<BeanAvatar animated={true} />);
  expect(animation.stop).toHaveBeenCalledTimes(1);
  expect(loop).toHaveBeenCalledTimes(1);
  motionPreference(false);
  screen.rerender(<BeanAvatar animated={true} />);
  screen.unmount();
  expect(animation.stop).toHaveBeenCalledTimes(2);
});

it('keeps ordinary profile icons and reduced-motion previews still', () => {
  const loop = jest.spyOn(Animated, 'loop');
  motionPreference(false);
  const screen = render(<BeanAvatar />);
  expect(loop).not.toHaveBeenCalled();
  motionPreference(true);
  screen.rerender(<BeanAvatar animated={true} />);
  expect(loop).not.toHaveBeenCalled();
});
