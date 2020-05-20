import * as React from 'react';
import { IDatePickerProps, IDatePickerStrings, IDatePickerStyleProps, IDatePickerStyles } from './DatePicker.types';
import {
  KeyCodes,
  classNamesFunction,
  getId,
  getNativeProps,
  divProperties,
  css,
  getPropsWithDefaults,
} from '../../Utilities';
import { Calendar, ICalendar, DayOfWeek } from '../../Calendar';
import { FirstWeekOfYear } from 'office-ui-fabric-react/lib/utilities/dateValues/DateValues';
import { Callout } from '../../Callout';
import { DirectionalHint } from '../../common/DirectionalHint';
import { TextField, ITextField } from '../../TextField';
import { compareDatePart } from 'office-ui-fabric-react/lib/utilities/dateMath/DateMath';
import { FocusTrapZone } from '../../FocusTrapZone';
import { useId, useControllableValue } from '@uifabric/react-hooks';

const getClassNames = classNamesFunction<IDatePickerStyleProps, IDatePickerStyles>();

const DEFAULT_STRINGS: IDatePickerStrings = {
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
  prevYearRangeAriaLabel: 'Previous year range',
  nextYearRangeAriaLabel: 'Next year range',
  closeButtonAriaLabel: 'Close date picker',
  weekNumberFormatString: 'Week number {0}',
};

const DEFAULT_PROPS: IDatePickerProps = {
  allowTextInput: false,
  formatDate: (date: Date) => {
    if (date) {
      return date.toDateString();
    }

    return '';
  },
  parseDateFromString: (dateStr: string) => {
    const date = Date.parse(dateStr);
    if (date) {
      return new Date(date);
    }

    return null;
  },
  firstDayOfWeek: DayOfWeek.Sunday,
  initialPickerDate: new Date(),
  isRequired: false,
  isMonthPickerVisible: true,
  showMonthPickerAsOverlay: false,
  strings: DEFAULT_STRINGS,
  highlightCurrentMonth: false,
  highlightSelectedMonth: false,
  borderless: false,
  pickerAriaLabel: 'Calendar',
  showWeekNumbers: false,
  firstWeekOfYear: FirstWeekOfYear.FirstDay,
  showGoToToday: true,
  dateTimeFormatter: undefined,
  showCloseButton: false,
  underlined: false,
  allFocusable: false,
};

function useDateState({ formatDate, value }: IDatePickerProps) {
  const [selectedDate, setSelectedDate] = useControllableValue(value, undefined);
  const [formattedDate, setFormattedDate] = React.useState(() => formatDate?.(selectedDate) || '');
  const setDate = (date: Date | string | undefined): void => {
    if (typeof date === 'string') {
      setFormattedDate(date);
    } else {
      setSelectedDate(date);
      setFormattedDate(formatDate?.(date) || '');
    }
  };

  React.useEffect(() => {
    const newFormattedDate = formatDate?.(selectedDate) || '';
    if (formattedDate !== newFormattedDate) {
      setFormattedDate(newFormattedDate);
    }
  }, [selectedDate?.getTime(), formatDate]);

  return [selectedDate, formattedDate, setDate] as const;
}

function useIsInitialMount() {
  const isInitialMount = React.useRef(true);
  React.useEffect(() => {
    isInitialMount.current = false;
  }, []);

  return isInitialMount.current;
}

function useDatePickerVisibilityState(
  { onAfterMenuDismiss, disableAutoFocus, allowTextInput, disabled }: IDatePickerProps,
  validateTextInput: () => void,
) {
  const [isDatePickerShown, setIsDatePickerShown] = React.useState(false);
  const isInitialMount = useIsInitialMount();
  const preventFocusOpeningPicker = React.useRef(false);

  React.useEffect(() => {
    if (!isInitialMount && !isDatePickerShown) {
      onAfterMenuDismiss?.();
    }
  }, [isDatePickerShown]);

  const showCalendar = () => {
    if (!isDatePickerShown) {
      preventFocusOpeningPicker.current = true;
      setIsDatePickerShown(true);
    }
  };

  const hideCalendar = () => {
    if (isDatePickerShown) {
      setIsDatePickerShown(false);
    }
  };

  React.useLayoutEffect(() => {
    if (!isDatePickerShown && !isInitialMount) {
      validateTextInput();
    }
  }, [isDatePickerShown]);

  const onCalendarDismiss = () => {
    preventFocusOpeningPicker.current = true;
    hideCalendar();
  };

  const onTextFieldFocus = () => {
    if (disableAutoFocus) {
      return;
    }

    if (!allowTextInput) {
      if (!preventFocusOpeningPicker.current) {
        showCalendar();
      } else {
        preventFocusOpeningPicker.current = false;
      }
    }
  };

  const onIconClick = (ev: React.MouseEvent<HTMLElement>): void => {
    ev.stopPropagation();
    if (!isDatePickerShown && !disabled) {
      showCalendar();
    } else if (allowTextInput) {
      hideCalendar();
    }
  };

  const onTextFieldClick = (ev: React.MouseEvent<HTMLElement>): void => {
    if (!disableAutoFocus && !isDatePickerShown && !disabled) {
      showCalendar();
      return;
    }
    if (allowTextInput) {
      hideCalendar();
    }
  };

  const onTextFieldKeyDown = (ev: React.KeyboardEvent<HTMLElement>): void => {
    switch (ev.which) {
      case KeyCodes.enter:
        ev.preventDefault();
        ev.stopPropagation();
        if (!isDatePickerShown) {
          validateTextInput();
          showCalendar();
        } else {
          // When DatePicker allows input date string directly,
          // it is expected to hit another enter to close the popup
          if (allowTextInput) {
            hideCalendar();
          }
        }
        break;

      case KeyCodes.escape:
        if (isDatePickerShown) {
          ev.stopPropagation();
        }
        onCalendarDismiss();
        break;

      default:
        break;
    }
  };

  return [
    isDatePickerShown,
    setIsDatePickerShown,
    hideCalendar,
    onCalendarDismiss,
    onTextFieldFocus,
    onIconClick,
    onTextFieldClick,
    onTextFieldKeyDown,
  ] as const;
}

function useErrorMessage(
  {
    isRequired,
    allowTextInput,
    strings,
    parseDateFromString,
    onSelectDate,
    formatDate,
    minDate,
    maxDate,
  }: IDatePickerProps,
  selectedDate: Date | undefined,
  formattedDate: string,
  setDate: (date: Date | string | undefined) => void,
) {
  const isInitialMount = useIsInitialMount();
  const [errorMessage, setErrorMessage] = React.useState<string | undefined>();

  if (!isInitialMount && isRequired && !selectedDate) {
    const requiredErrorMessage = strings?.isRequiredErrorMessage || ' ';
    if (errorMessage !== requiredErrorMessage) {
      setErrorMessage(requiredErrorMessage);
    }
  } else if (selectedDate && isDateOutOfBounds(selectedDate, minDate, maxDate)) {
    const isOutOfBoundsErrorMessage = strings?.isOutOfBoundsErrorMessage || ' ';
    if (errorMessage !== isOutOfBoundsErrorMessage) {
      setErrorMessage(isOutOfBoundsErrorMessage);
    }
  }

  const validateTextInput = () => {
    if (allowTextInput) {
      let date = null;

      if (formattedDate) {
        // Don't parse if the selected date has the same formatted string as what we're about to parse.
        // The formatted string might be ambiguous (ex: "1/2/3" or "New Year Eve") and the parser might
        // not be able to come up with the exact same date.
        if (selectedDate && !errorMessage && formatDate && formatDate(selectedDate) === formattedDate) {
          return;
        }
        date = parseDateFromString!(formattedDate);

        // Check if date is null, or date is Invalid Date
        if (!date || isNaN(date.getTime())) {
          // Reset invalid input field, if formatting is available
          setDate(selectedDate);

          setErrorMessage(strings!.invalidInputErrorMessage || ' ');
        } else {
          // Check against optional date boundaries
          if (isDateOutOfBounds(date, minDate, maxDate)) {
            setErrorMessage(strings!.isOutOfBoundsErrorMessage || ' ');
          } else {
            setErrorMessage('');
            setDate(date);
          }
        }
      } else {
        // Only show error for empty formattedDate if it is a required field
        setErrorMessage(isRequired ? strings!.isRequiredErrorMessage || ' ' : '');
      }

      // Execute onSelectDate callback
      // If no input date string or input date string is invalid
      // date variable will be null, callback should expect null value for this case
      onSelectDate?.(date);
    } else if (isRequired && !formattedDate) {
      // Check when DatePicker is a required field but has NO input value
      setErrorMessage(strings!.isRequiredErrorMessage || ' ');
    } else {
      // Cleanup the error message
      setErrorMessage('');
    }
  };

  return [errorMessage, setErrorMessage, validateTextInput] as const;
}

function isDateOutOfBounds(date: Date, minDate?: Date, maxDate?: Date): boolean {
  return (!!minDate && compareDatePart(minDate!, date) > 0) || (!!maxDate && compareDatePart(maxDate!, date) < 0);
}

export const DatePickerBase = React.forwardRef(
  (propsWithoutDefaults: IDatePickerProps, forwardedRef: React.Ref<unknown>) => {
    const props = getPropsWithDefaults(DEFAULT_PROPS, propsWithoutDefaults);

    const id = useId('DatePicker', props.id);
    const calendar = React.useRef<ICalendar>(null);
    const datePickerDiv = React.useRef<HTMLDivElement>(null);
    const textField = React.useRef<ITextField>(null);

    const [selectedDate, formattedDate, setDate] = useDateState(props);
    const [errorMessage, setErrorMessage, validateTextInput] = useErrorMessage(
      props,
      selectedDate,
      formattedDate,
      setDate,
    );
    const [
      isDatePickerShown,
      setIsDatePickerShown,
      hideCalendar,
      onCalendarDismiss,
      onTextFieldFocus,
      onIconClick,
      onTextFieldClick,
      onTextFieldKeyDown,
    ] = useDatePickerVisibilityState(props, validateTextInput);

    React.useImperativeHandle(
      props.componentRef,
      () => ({
        focus() {
          textField.current?.focus?.();
        },
        reset() {
          setErrorMessage(undefined);
          setIsDatePickerShown(false);
          setDate(props.value || props.initialPickerDate);
        },
      }),
      [],
    );

    const {
      firstDayOfWeek,
      strings,
      label,
      theme,
      className,
      styles,
      initialPickerDate,
      isRequired,
      disabled,
      ariaLabel,
      pickerAriaLabel,
      placeholder,
      allowTextInput,
      borderless,
      minDate,
      maxDate,
      showCloseButton,
      calendarProps,
      calloutProps,
      textField: textFieldProps,
      underlined,
      allFocusable,
      calendarAs: CalendarType = Calendar,
      tabIndex,
    } = props;

    const onTextFieldChanged = (
      ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
      newValue: string,
    ): void => {
      if (allowTextInput) {
        if (isDatePickerShown) {
          hideCalendar();
        }

        setDate(newValue);
        setErrorMessage(isRequired && !newValue ? strings!.isRequiredErrorMessage || ' ' : undefined);
      }

      props.textField?.onChange?.(ev, newValue);
    };

    const onCalloutPositioned = (): void => {
      let shouldFocus = true;
      // If the user has specified that the callout shouldn't use initial focus, then respect
      // that and don't attempt to set focus. That will default to true within the callout
      // so we need to check if it's undefined here.
      if (props.calloutProps?.setInitialFocus !== undefined) {
        shouldFocus = props.calloutProps.setInitialFocus;
      }
      if (shouldFocus) {
        calendar.current?.focus();
      }
    };

    const onSelectDate = (date: Date): void => {
      props.calendarProps?.onSelectDate?.(date);
      props.onSelectDate?.(date);
      setDate(date);
      onCalendarDismiss();
    };

    const classNames = getClassNames(styles, {
      theme: theme!,
      className,
      disabled,
      label: !!label,
      isDatePickerShown,
    });

    const calloutId = getId('DatePicker-Callout');
    const nativeProps = getNativeProps<React.HTMLAttributes<HTMLDivElement>>(props, divProperties, ['value']);
    const iconProps = textFieldProps && textFieldProps.iconProps;

    return (
      <div {...nativeProps} className={classNames.root}>
        <div ref={datePickerDiv} aria-haspopup="true" aria-owns={isDatePickerShown ? calloutId : undefined}>
          <TextField
            role="combobox"
            label={label}
            aria-expanded={isDatePickerShown}
            ariaLabel={ariaLabel}
            aria-controls={isDatePickerShown ? calloutId : undefined}
            required={isRequired}
            disabled={disabled}
            errorMessage={isDatePickerShown ? undefined : errorMessage}
            placeholder={placeholder}
            borderless={borderless}
            value={formattedDate}
            componentRef={textField}
            underlined={underlined}
            tabIndex={tabIndex}
            readOnly={!allowTextInput}
            {...textFieldProps}
            id={id + '-label'}
            className={css(classNames.textField, textFieldProps && textFieldProps.className)}
            iconProps={{
              iconName: 'Calendar',
              ...iconProps,
              className: css(classNames.icon, iconProps && iconProps.className),
              onClick: onIconClick,
            }}
            onKeyDown={onTextFieldKeyDown}
            onFocus={onTextFieldFocus}
            onBlur={validateTextInput}
            onClick={onTextFieldClick}
            onChange={onTextFieldChanged}
          />
        </div>
        {isDatePickerShown && (
          <Callout
            id={calloutId}
            role="dialog"
            ariaLabel={pickerAriaLabel}
            isBeakVisible={false}
            gapSpace={0}
            doNotLayer={false}
            target={datePickerDiv.current}
            directionalHint={DirectionalHint.bottomLeftEdge}
            {...calloutProps}
            className={css(classNames.callout, calloutProps && calloutProps.className)}
            onDismiss={onCalendarDismiss}
            onPositioned={onCalloutPositioned}
          >
            <FocusTrapZone
              isClickableOutsideFocusTrap={true}
              disableFirstFocus={props.disableAutoFocus}
              forceFocusInsideTrap={false}
            >
              <CalendarType
                {...calendarProps}
                onSelectDate={onSelectDate}
                onDismiss={onCalendarDismiss}
                isMonthPickerVisible={props.isMonthPickerVisible}
                showMonthPickerAsOverlay={props.showMonthPickerAsOverlay}
                today={props.today}
                value={selectedDate || initialPickerDate}
                firstDayOfWeek={firstDayOfWeek}
                strings={strings!}
                highlightCurrentMonth={props.highlightCurrentMonth}
                highlightSelectedMonth={props.highlightSelectedMonth}
                showWeekNumbers={props.showWeekNumbers}
                firstWeekOfYear={props.firstWeekOfYear}
                showGoToToday={props.showGoToToday}
                dateTimeFormatter={props.dateTimeFormatter}
                minDate={minDate}
                maxDate={maxDate}
                componentRef={calendar}
                showCloseButton={showCloseButton}
                allFocusable={allFocusable}
              />
            </FocusTrapZone>
          </Callout>
        )}
      </div>
    );
  },
);
DatePickerBase.displayName = 'DatePickerBase';
