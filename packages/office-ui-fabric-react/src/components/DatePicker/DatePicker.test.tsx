import * as React from 'react';
import * as ReactTestUtils from 'react-dom/test-utils';
import * as renderer from 'react-test-renderer';
import { Calendar, ICalendarStrings } from '../../Calendar';
import { DatePicker } from './DatePicker';
import { DatePickerBase } from './DatePicker.base';
import { IDatePickerStrings } from './DatePicker.types';
import { FirstWeekOfYear } from 'office-ui-fabric-react/lib/utilities/dateValues/DateValues';
import { mount, ReactWrapper } from 'enzyme';
import { resetIds, KeyCodes } from 'office-ui-fabric-react/lib/Utilities';
import { Callout } from 'office-ui-fabric-react/lib/Callout';
import { PrimaryButton } from 'office-ui-fabric-react/lib/Button';

describe('DatePicker', () => {
  const DayPickerStrings: IDatePickerStrings = {
    months: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],

    shortMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],

    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],

    shortDays: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],

    goToToday: 'Go to today',
    prevMonthAriaLabel: 'Go to previous month',
    nextMonthAriaLabel: 'Go to next month',
    prevYearAriaLabel: 'Go to previous year',
    nextYearAriaLabel: 'Go to next year',
    closeButtonAriaLabel: 'Close date picker',

    isRequiredErrorMessage: 'Field is required.',

    invalidInputErrorMessage: 'Invalid date format.',
  };

  beforeEach(() => {
    resetIds();
  });

  it('renders default DatePicker correctly', () => {
    // This will only render the input. Calendar component has its own snapshot.
    const component = renderer.create(<DatePicker />);
    const tree = component.toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('can add an id to the container', () => {
    const wrapper = mount(<DatePickerBase id="foo" />);

    expect(wrapper.getElement().props.id).toEqual('foo');
  });

  it('should not open DatePicker when disabled, no label', () => {
    const wrapper = mount(<DatePickerBase disabled />);
    wrapper.find('i').simulate('click');

    expect(wrapper.find('[role="dialog"]').length).toBe(0);
  });

  // if isDatePickerShown is not set, the DatePicker should not
  // be rendered and therefore aria-owns should not exist
  it('should not render DatePicker when isDatePickerShown is not set', () => {
    const datePicker = mount(<DatePickerBase />);

    expect(datePicker.find('[aria-owns]').length).toBe(0);
  });

  // if isDatePickerShown is set, the DatePicker should be rendered
  // and aria-owns should exist
  it('should render DatePicker when isDatePickerShown is set', () => {
    const datePicker = mount(<DatePickerBase />);
    datePicker.find('i').simulate('click');

    expect(
      datePicker
        .find('[aria-owns]')
        .getDOMNode()
        .getAttribute('aria-owns'),
    ).toBeDefined();
  });

  // if isDatePickerShown is set, the DatePicker should be rendered
  // and the calloutId should exist in the DOM
  it('should render DatePicker and calloutId must exist in the DOM when isDatePickerShown is set', () => {
    const datePicker = mount(<DatePickerBase />);
    datePicker.find('i').simulate('click');

    const calloutId = datePicker
      .find('[aria-owns]')
      .getDOMNode()
      .getAttribute('aria-owns');

    expect(datePicker.find(`#${calloutId}`).exists()).toBe(true);
  });

  it('should not open DatePicker when disabled, with label', () => {
    const wrapper = mount(<DatePickerBase disabled label="label" />);
    wrapper.find('i').simulate('click');

    expect(wrapper.find('[aria-owns]').length).toBe(0);
  });

  it('should call onSelectDate even when required input is empty when allowTextInput is true', () => {
    const onSelectDate = jest.fn();
    const datePicker = mount(<DatePickerBase isRequired={true} allowTextInput={true} onSelectDate={onSelectDate} />);
    const textField = datePicker.find('input');

    expect(textField).toBeDefined();

    textField.simulate('change', { target: { value: 'Jan 1 2030' } }).simulate('blur');
    textField.simulate('change', { target: { value: '' } }).simulate('blur');

    expect(onSelectDate).toHaveBeenCalledTimes(2);

    datePicker.unmount();
  });

  it('clears error message when required input has date text and allowTextInput is true', () => {
    jest.useFakeTimers();
    const datePicker = mount(<DatePickerBase isRequired={true} allowTextInput={true} strings={DayPickerStrings} />);
    const textField = datePicker.find('input');
    expect(textField).toBeDefined();
    expect(getRenderedErrorMessage(datePicker)).toBeUndefined();

    textField.simulate('click').simulate('click'); // open the datepicker then dismiss
    expect(getRenderedErrorMessage(datePicker)).toBe(DayPickerStrings.isRequiredErrorMessage);
    textField.simulate('change', { target: { value: 'Jan 1 2030' } }).simulate('blur');
    expect(getRenderedErrorMessage(datePicker)).toBeFalsy();

    datePicker.unmount();
    jest.useRealTimers();
  });

  it('clears error message when required input has date selected from calendar and allowTextInput is true', () => {
    jest.useFakeTimers();
    const datePicker = mount(<DatePickerBase isRequired={true} allowTextInput={true} strings={DayPickerStrings} />);
    const textField = datePicker.find('input');
    expect(textField).toBeDefined();
    expect(getRenderedErrorMessage(datePicker)).toBeUndefined();

    textField.simulate('click').simulate('click'); // open the datepicker then dismiss
    expect(getRenderedErrorMessage(datePicker)).toBe(DayPickerStrings.isRequiredErrorMessage);

    // open calendar and select first day
    textField.simulate('click');
    const selectableDateInCalender = datePicker.find('.ms-DatePicker td button[data-is-focusable=true]').at(0);
    selectableDateInCalender.simulate('click');

    expect(getRenderedErrorMessage(datePicker)).toBeFalsy();

    datePicker.unmount();
    jest.useRealTimers();
  });

  it('should not clear initial error when datepicker is opened', () => {
    jest.useFakeTimers();
    const datePicker = mount(
      <DatePickerBase
        isRequired={true}
        allowTextInput={true}
        maxDate={new Date('2020-04-01')}
        value={new Date('2020-04-02')}
      />,
    );

    // assert initial error exists
    expect(getRenderedErrorMessage(datePicker)).toBeTruthy();

    const textField = datePicker.find('input');

    expect(textField).toBeDefined();

    // open the datepicker
    textField.simulate('click').simulate('click');

    // assert initial error remains
    expect(getRenderedErrorMessage(datePicker)).toBeTruthy();

    datePicker.unmount();
    jest.useRealTimers();
  });

  it('should call custom onChange when allowTextInput is true', () => {
    const onChange = jest.fn();
    const datePicker = mount(<DatePickerBase allowTextInput={true} textField={{ onChange: onChange }} />);
    const textField = datePicker.find('input');

    expect(textField).toBeDefined();

    textField.simulate('change', { target: { value: 'Jan 1 2020' } }).simulate('blur');
    textField.simulate('change', { target: { value: '' } }).simulate('blur');

    expect(onChange).toHaveBeenCalledTimes(2);

    datePicker.unmount();
  });

  // @todo: usage of document.querySelector is incorrectly testing DOM mounted by previous tests and needs to be fixed.
  xit('should call onSelectDate only once when allowTextInput is true and popup is used to select the value', () => {
    const onSelectDate = jest.fn();
    const datePicker = mount(<DatePickerBase allowTextInput={true} onSelectDate={onSelectDate} />);

    datePicker.setState({ isDatePickerShown: true });
    ReactTestUtils.Simulate.click(document.querySelector('.ms-DatePicker-day--today') as HTMLButtonElement);

    expect(onSelectDate).toHaveBeenCalledTimes(1);

    datePicker.setState({ isDatePickerShown: false });

    datePicker.unmount();
  });

  it('should set "Calendar" as the Callout\'s aria-label', () => {
    const datePicker = mount(<DatePickerBase />);
    datePicker.find('i').simulate('click');

    const calloutProps = datePicker.find(Callout).props();

    expect(calloutProps.ariaLabel).toBe('Calendar');
  });

  it('should close parent Callout if Esc is pressed', () => {
    const menu = (props: any) => {
      return (
        <Callout {...props}>
          <DatePicker />
        </Callout>
      );
    };
    const wrapper = mount(
      <PrimaryButton
        menuAs={menu}
        menuProps={{
          items: [],
        }}
      />,
    );
    wrapper.simulate('click');
    let callout = wrapper.find(Callout);
    expect(callout.exists()).toBe(true);

    const datePicker = wrapper.find(DatePickerBase);
    datePicker.simulate('keydown', { which: KeyCodes.escape });

    callout = wrapper.find(Callout);
    expect(callout.exists()).toBe(false);
  });

  xit('should reflect the correct date in the input field when selecting a value', () => {
    const today = new Date('January 15, 2020');
    const initiallySelectedDate = new Date('January 10, 2020');
    // initialPickerDate defaults to Date.now() if not provided so it must be given to ensure
    // that the datepicker opens on the correct month
    const datePicker = mount(
      <DatePickerBase allowTextInput={true} today={today} initialPickerDate={initiallySelectedDate} />,
    );

    datePicker.setState({ isDatePickerShown: true });
    const todayButton = document.querySelector('.ms-DatePicker-day--today') as HTMLButtonElement;
    ReactTestUtils.Simulate.click(todayButton);

    const selectedDate = datePicker
      .find('input')
      .first()
      .getDOMNode()
      .getAttribute('value');

    expect(selectedDate).toEqual('Wed Jan 15 2020');

    datePicker.setState({ isDatePickerShown: false });

    datePicker.unmount();
  });

  xit('reflects the correct date in the input field when selecting a value and a different format is given', () => {
    const today = new Date('January 15, 2020');
    const initiallySelectedDate = new Date('January 10, 2020');
    const onFormatDate = (date: Date): string => {
      return date.getDate() + '/' + (date.getMonth() + 1) + '/' + (date.getFullYear() % 100);
    };
    // initialPickerDate defaults to Date.now() if not provided so it must be given to ensure
    // that the datepicker opens on the correct month
    const datePicker = mount(
      <DatePickerBase
        allowTextInput={true}
        today={today}
        formatDate={onFormatDate}
        initialPickerDate={initiallySelectedDate}
      />,
    );

    datePicker.setState({ isDatePickerShown: true });
    const todayButton = document.querySelector('.ms-DatePicker-day--today') as HTMLButtonElement;
    ReactTestUtils.Simulate.click(todayButton);

    const selectedDate = datePicker
      .find('input')
      .first()
      .getDOMNode()
      .getAttribute('value');

    expect(selectedDate).toEqual('15/1/20');

    datePicker.setState({ isDatePickerShown: false });

    datePicker.unmount();
  });

  describe('when Calendar properties are not specified', () => {
    const datePicker = mount(<DatePickerBase />);
    datePicker.find('i').simulate('click');
    const calendarProps = datePicker.find(Calendar).props();

    it('renders Calendar with isMonthPickerVisible as true by defaut', () => {
      expect(calendarProps.isMonthPickerVisible).toBe(true);
    });

    it('renders Calendar with showMonthPickerAsOverlay as false by defaut', () => {
      expect(calendarProps.showMonthPickerAsOverlay).toBe(false);
    });

    it('renders Calendar with highlightCurrentMonth as false by defaut', () => {
      expect(calendarProps.highlightCurrentMonth).toBe(false);
    });

    it('renders Calendar with showWeekNumbers as false by defaut', () => {
      expect(calendarProps.showWeekNumbers).toBe(false);
    });

    it('renders Calendar with firstWeekOfYear as FirstWeekOfYear.FirstDay by defaut', () => {
      expect(calendarProps.firstWeekOfYear).toBe(FirstWeekOfYear.FirstDay);
    });

    it('renders Calendar with showGoToToday as true by defaut', () => {
      expect(calendarProps.showGoToToday).toBe(true);
    });
  });

  describe('when Calendar properties are specified', () => {
    const value = new Date(2017, 10, 1);
    const today = new Date(2017, 9, 31);
    const dateTimeFormatter = {
      formatMonthDayYear: (date: Date, strings?: ICalendarStrings) => 'm/d/y',
      formatMonthYear: (date: Date, strings?: ICalendarStrings) => 'm/y',
      formatDay: (date: Date) => 'd',
      formatYear: (date: Date) => 'y',
    };

    const datePicker = mount(
      <DatePickerBase
        isMonthPickerVisible={false}
        showMonthPickerAsOverlay={true}
        value={value}
        today={today}
        firstDayOfWeek={2}
        highlightCurrentMonth={true}
        showWeekNumbers={true}
        firstWeekOfYear={FirstWeekOfYear.FirstFullWeek}
        showGoToToday={false}
        dateTimeFormatter={dateTimeFormatter}
      />,
    );
    datePicker.find('i').simulate('click');

    const calendarProps = datePicker.find(Calendar).props();

    it('renders Calendar with same isMonthPickerVisible', () => {
      expect(calendarProps.isMonthPickerVisible).toBe(false);
    });

    it('renders Calendar with same showMonthPickerAsOverlay', () => {
      expect(calendarProps.showMonthPickerAsOverlay).toBe(true);
    });

    it('renders Calendar with same value', () => {
      expect(calendarProps.value).toBe(value);
    });

    it('renders Calendar with same today', () => {
      expect(calendarProps.today).toBe(today);
    });

    it('renders Calendar with same firstDayOfWeek', () => {
      expect(calendarProps.firstDayOfWeek).toBe(2);
    });

    it('renders Calendar with same highlightCurrentMonth', () => {
      expect(calendarProps.highlightCurrentMonth).toBe(true);
    });

    it('renders Calendar with same showWeekNumbers', () => {
      expect(calendarProps.showWeekNumbers).toBe(true);
    });

    it('renders Calendar with same firstWeekOfYear', () => {
      expect(calendarProps.firstWeekOfYear).toBe(FirstWeekOfYear.FirstFullWeek);
    });

    it('renders Calendar with same showGoToToday', () => {
      expect(calendarProps.showGoToToday).toBe(false);
    });

    it('renders Calendar with same dateTimeFormatter', () => {
      expect(calendarProps.dateTimeFormatter).toBe(dateTimeFormatter);
    });
  });

  describe('when date boundaries are specified', () => {
    const defaultDate = new Date('Dec 15 2017');
    const minDate = new Date('Jan 1 2017');
    const maxDate = new Date('Dec 31 2017');
    const strings: IDatePickerStrings = {
      months: [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ],
      shortMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      shortDays: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
      goToToday: 'Go to today',
      isOutOfBoundsErrorMessage: 'out of bounds',
    };
    let datePicker: ReactWrapper<any, any>;

    beforeEach(() => {
      jest.useFakeTimers();
      datePicker = mount(
        <DatePickerBase
          allowTextInput={true}
          minDate={minDate}
          maxDate={maxDate}
          value={defaultDate}
          strings={strings}
        />,
      );
    });

    afterEach(() => {
      datePicker.unmount();
      jest.useRealTimers();
    });

    it('should throw validation error for date outside boundary', () => {
      // before minDate
      datePicker
        .find('input')
        .simulate('change', { target: { value: 'Jan 1 2010' } })
        .simulate('blur');
      expect(getRenderedErrorMessage(datePicker)).toBe('out of bounds');

      // after maxDate
      datePicker
        .find('input')
        .simulate('change', { target: { value: 'Jan 1 2020' } })
        .simulate('blur');
      expect(getRenderedErrorMessage(datePicker)).toBe('out of bounds');
    });

    it('should not throw validation error for date inside boundary', () => {
      // in boundary
      datePicker
        .find('input')
        .simulate('change', { target: { value: 'Dec 16 2017' } })
        .simulate('blur');
      expect(getRenderedErrorMessage(datePicker)).toBeFalsy();

      // on boundary
      datePicker
        .find('input')
        .simulate('change', { target: { value: 'Jan 1 2017' } })
        .simulate('blur');
      expect(getRenderedErrorMessage(datePicker)).toBeFalsy();
    });

    it('should throw validation error if boundaries are moved to intersect selected date', () => {
      datePicker.setProps({ minDate: new Date('Dec 16 2017') });
      expect(getRenderedErrorMessage(datePicker)).toBe('out of bounds');
    });
  });
});

function getRenderedErrorMessage(wrapper: ReactWrapper) {
  // Allow <DelayedRender> in TextField to render the error message
  jest.runAllTimers();

  return wrapper.getDOMNode().querySelector('[data-automation-id="error-message"]')?.innerHTML;
}
