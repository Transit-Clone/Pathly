import { fireEvent, render } from '@testing-library/react-native';

import { RouteAlertsPrompt } from '../src/components/RouteAlertsPrompt';
import { SavedPlaceDetailsSheet } from '../src/components/SavedPlaceDetailsSheet';
import { parseAlertTime } from '../src/data/savedRoutes';
import { placeToLocation, type SavedLocation } from '../src/data/userData';
import { AppSettingsProvider } from '../src/theme/AppSettings';

const WORK: SavedLocation = {
  id: 'work-place',
  address: placeToLocation({ id: 'work-place', title: 'Work', subtitle: '123 Main St', location: { latitude: 40.75, longitude: -73.99 } }, 'Destination'),
  dateSaved: null,
};

describe('parseAlertTime', () => {
  it('reads the ways a rider types a time', () => {
    expect(parseAlertTime('7')).toBe(7 * 60);
    expect(parseAlertTime('7:30')).toBe(7 * 60 + 30);
    expect(parseAlertTime('730')).toBe(7 * 60 + 30);
    expect(parseAlertTime('7:30 pm')).toBe(19 * 60 + 30);
    expect(parseAlertTime('7PM')).toBe(19 * 60);
    expect(parseAlertTime('12 am')).toBe(0);
    expect(parseAlertTime('12:15 p.m.')).toBe(12 * 60 + 15);
    expect(parseAlertTime('19:30')).toBe(19 * 60 + 30);
  });

  it("rejects what isn't a time", () => {
    expect(parseAlertTime('')).toBeNull();
    expect(parseAlertTime('soon')).toBeNull();
    expect(parseAlertTime('25:00')).toBeNull();
    expect(parseAlertTime('7:75')).toBeNull();
    expect(parseAlertTime('13 pm')).toBeNull();
  });
});

describe('RouteAlertsPrompt', () => {
  it('takes typed custom hours, without naming the line', () => {
    const onDone = jest.fn();
    const screen = render(
      <AppSettingsProvider>
        <RouteAlertsPrompt onClose={jest.fn()} onDone={onDone} request={{ id: 'lirr:10', setting: 'custom', hours: { start: 7 * 60, end: 19 * 60 } }} />
      </AppSettingsProvider>,
    );
    expect(screen.getByText('Service alerts')).toBeTruthy();
    expect(screen.queryByTestId('route-alerts-start-earlier')).toBeNull();

    fireEvent.changeText(screen.getByTestId('route-alerts-start'), '6:45 am');
    fireEvent.changeText(screen.getByTestId('route-alerts-end'), '9pm');
    fireEvent(screen.getByTestId('route-alerts-end'), 'blur');
    expect(screen.getByTestId('route-alerts-end').props.value).toBe('9:00 PM');

    fireEvent.press(screen.getByTestId('route-alerts-prompt-done'));
    expect(onDone).toHaveBeenCalledWith('custom', { start: 6 * 60 + 45, end: 21 * 60 });
  });

  it("puts a time that doesn't read back to the last good one", () => {
    const onDone = jest.fn();
    const screen = render(
      <AppSettingsProvider>
        <RouteAlertsPrompt onClose={jest.fn()} onDone={onDone} request={{ id: 'lirr:10', setting: 'custom', hours: { start: 7 * 60, end: 19 * 60 } }} />
      </AppSettingsProvider>,
    );
    fireEvent.changeText(screen.getByTestId('route-alerts-start'), 'whenever');
    fireEvent(screen.getByTestId('route-alerts-start'), 'blur');
    expect(screen.getByTestId('route-alerts-start').props.value).toBe('7:00 AM');
    fireEvent.press(screen.getByTestId('route-alerts-prompt-done'));
    expect(onDone).toHaveBeenCalledWith('custom', { start: 7 * 60, end: 19 * 60 });
  });
});

describe('SavedPlaceDetailsSheet', () => {
  it("edits a place straight from its map marker's details", () => {
    const onEdit = jest.fn();
    const screen = render(
      <AppSettingsProvider>
        <SavedPlaceDetailsSheet onClose={jest.fn()} onEdit={onEdit} onGo={jest.fn()} places={[WORK]} />
      </AppSettingsProvider>,
    );
    fireEvent.press(screen.getByTestId('saved-place-details-edit-work-place'));
    expect(onEdit).toHaveBeenCalledWith(WORK);
  });

  it('has no Edit button when editing is off (signed out)', () => {
    const screen = render(
      <AppSettingsProvider>
        <SavedPlaceDetailsSheet onClose={jest.fn()} onGo={jest.fn()} places={[WORK]} />
      </AppSettingsProvider>,
    );
    expect(screen.queryByTestId('saved-place-details-edit-work-place')).toBeNull();
  });
});
