import * as React from 'react';
import {
  IDatePicker,
  IDatePickerProps,
  IDatePickerStrings,
  IDatePickerStyleProps,
  IDatePickerStyles,
} from './DatePicker.types';
import {
  KeyCodes,
  classNamesFunction,
  getId,
  getNativeProps,
  divProperties,
  css,
  initializeComponentRef,
  getPropsWithDefaults,
} from '../../Utilities';
import { Calendar, ICalendar, DayOfWeek } from '../../Calendar';
import { FirstWeekOfYear } from '../../utilities/dateValues/DateValues';
import { Callout } from '../../Callout';
import { DirectionalHint } from '../../common/DirectionalHint';
import { TextField, ITextField } from '../../TextField';
import { compareDatePart } from '../../utilities/dateMath/DateMath';
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

function useDateState({ formatDate, onSelectDate, value, initialPickerDate }: IDatePickerProps) {
  const [selectedDate, setSelectedDate] = useControllableValue(value, initialPickerDate, (ev, date) =>
    onSelectDate?.(date),
  );
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
  }, [
    // Issue# 1274: Check if the date value changed from old value, i.e., if indeed a new date is being
    // passed in or if the formatting function was modified. We only update the selected date if either of these
    // had a legit change. Note tha the bug will still repro when only the formatDate was passed in props and this
    // is the result of the onSelectDate callback, but this should be a rare scenario.
    selectedDate?.getTime(),
    formatDate,
  ]);

  return [selectedDate, formattedDate, setDate] as const;
}

function useIsInitialMount() {
  const isInitialMount = React.useRef(true);
  React.useEffect(() => {
    isInitialMount.current = false;
  }, []);

  return isInitialMount.current;
}

function useIsDatePickerShown({ onAfterMenuDismiss }: IDatePickerProps) {
  const [isDatePickerShown, setIsDatePickerShown] = React.useState(false);
  const isInitialMount = useIsInitialMount();
  React.useEffect(() => {
    if (!isInitialMount && !isDatePickerShown) {
      onAfterMenuDismiss?.();
    }
  }, [isDatePickerShown]);

  return [isDatePickerShown, setIsDatePickerShown] as const;
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
  isDatePickerShown: boolean,
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
      if (onSelectDate) {
        // If no input date string or input date string is invalid
        // date variable will be null, callback should expect null value for this case
        onSelectDate(date);
      }
    } else if (isRequired && !formattedDate) {
      // Check when DatePicker is a required field but has NO input value
      setErrorMessage(strings!.isRequiredErrorMessage || ' ');
    } else {
      // Cleanup the error message
      setErrorMessage('');
    }
  };

  return [isDatePickerShown ? undefined : errorMessage, setErrorMessage, validateTextInput] as const;
}

function isDateOutOfBounds(date: Date, minDate?: Date, maxDate?: Date): boolean {
  return (!!minDate && compareDatePart(minDate!, date) > 0) || (!!maxDate && compareDatePart(maxDate!, date) < 0);
}

export const DatePickerBase = React.forwardRef(
  (propsWithoutDefaults: IDatePickerProps, forwardedRef: React.Ref<unknown>) => {
    const props = getPropsWithDefaults(DEFAULT_PROPS, propsWithoutDefaults);
    const id = useId('DatePicker', props.id);
    const [selectedDate, formattedDate, setDate] = useDateState(props);
    const [isDatePickerShown, setIsDatePickerShown] = useIsDatePickerShown(props);
    const [errorMessage, setErrorMessage, validateTextInput] = useErrorMessage(
      props,
      isDatePickerShown,
      selectedDate,
      formattedDate,
      setDate,
    );

    return (
      <DatePickerBaseClass
        {...props}
        hoisted={{
          id,
          selectedDate,
          formattedDate,
          setDate,
          isDatePickerShown,
          setIsDatePickerShown,
          errorMessage,
          setErrorMessage,
          validateTextInput,
        }}
      />
    );
  },
);
DatePickerBase.displayName = 'DatePickerBase';

type IDatePickerBaseClassProps = Omit<IDatePickerProps, 'value' | 'id'> & {
  hoisted: {
    selectedDate: Date | undefined;
    id: string;
    formattedDate: string;
    setDate: (value: Date | string | undefined) => void;
    isDatePickerShown: boolean;
    setIsDatePickerShown: (value: boolean) => void;
    errorMessage: string | undefined;
    setErrorMessage: (value: string | undefined) => void;
    validateTextInput: () => void;
  };
};

class DatePickerBaseClass extends React.Component<IDatePickerBaseClassProps, never> implements IDatePicker {
  private _calendar = React.createRef<ICalendar>();
  private _datePickerDiv = React.createRef<HTMLDivElement>();
  private _textField = React.createRef<ITextField>();
  private _preventFocusOpeningPicker: boolean;
  private _id: string;

  constructor(props: IDatePickerBaseClassProps) {
    super(props);

    initializeComponentRef(this);

    this._id = props.hoisted.id;

    this._preventFocusOpeningPicker = false;
  }

  public render(): JSX.Element {
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
      hoisted: { selectedDate, formattedDate, isDatePickerShown },
    } = this.props;

    const classNames = getClassNames(styles, {
      theme: theme!,
      className,
      disabled,
      label: !!label,
      isDatePickerShown,
    });

    const calloutId = getId('DatePicker-Callout');
    const nativeProps = getNativeProps<React.HTMLAttributes<HTMLDivElement>>(this.props, divProperties, ['value']);
    const iconProps = textFieldProps && textFieldProps.iconProps;

    return (
      <div {...nativeProps} className={classNames.root}>
        <div ref={this._datePickerDiv} aria-haspopup="true" aria-owns={isDatePickerShown ? calloutId : undefined}>
          <TextField
            role="combobox"
            label={label}
            aria-expanded={isDatePickerShown}
            ariaLabel={ariaLabel}
            aria-controls={isDatePickerShown ? calloutId : undefined}
            required={isRequired}
            disabled={disabled}
            errorMessage={this.props.hoisted.errorMessage}
            placeholder={placeholder}
            borderless={borderless}
            value={formattedDate}
            componentRef={this._textField}
            underlined={underlined}
            tabIndex={tabIndex}
            readOnly={!allowTextInput}
            {...textFieldProps}
            id={this._id + '-label'}
            className={css(classNames.textField, textFieldProps && textFieldProps.className)}
            iconProps={{
              iconName: 'Calendar',
              ...iconProps,
              className: css(classNames.icon, iconProps && iconProps.className),
              onClick: this._onIconClick,
            }}
            onKeyDown={this._onTextFieldKeyDown}
            onFocus={this._onTextFieldFocus}
            onBlur={this.props.hoisted.validateTextInput}
            onClick={this._onTextFieldClick}
            onChange={this._onTextFieldChanged}
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
            target={this._datePickerDiv.current}
            directionalHint={DirectionalHint.bottomLeftEdge}
            {...calloutProps}
            className={css(classNames.callout, calloutProps && calloutProps.className)}
            onDismiss={this._calendarDismissed}
            onPositioned={this._onCalloutPositioned}
          >
            <FocusTrapZone
              isClickableOutsideFocusTrap={true}
              disableFirstFocus={this.props.disableAutoFocus}
              forceFocusInsideTrap={false}
            >
              <CalendarType
                {...calendarProps}
                onSelectDate={this._onSelectDate}
                onDismiss={this._calendarDismissed}
                isMonthPickerVisible={this.props.isMonthPickerVisible}
                showMonthPickerAsOverlay={this.props.showMonthPickerAsOverlay}
                today={this.props.today}
                value={selectedDate || initialPickerDate}
                firstDayOfWeek={firstDayOfWeek}
                strings={strings!}
                highlightCurrentMonth={this.props.highlightCurrentMonth}
                highlightSelectedMonth={this.props.highlightSelectedMonth}
                showWeekNumbers={this.props.showWeekNumbers}
                firstWeekOfYear={this.props.firstWeekOfYear}
                showGoToToday={this.props.showGoToToday}
                dateTimeFormatter={this.props.dateTimeFormatter}
                minDate={minDate}
                maxDate={maxDate}
                componentRef={this._calendar}
                showCloseButton={showCloseButton}
                allFocusable={allFocusable}
              />
            </FocusTrapZone>
          </Callout>
        )}
      </div>
    );
  }

  public focus(): void {
    this._textField.current?.focus();
  }

  public reset(): void {
    // this.setState(this._getDefaultState());
  }

  private _onSelectDate = (date: Date): void => {
    if (this.props.calendarProps && this.props.calendarProps.onSelectDate) {
      this.props.calendarProps.onSelectDate(date);
    }

    this.props.hoisted.setDate(date);

    this._calendarDismissed();
  };

  private _onCalloutPositioned = (): void => {
    let shouldFocus = true;
    // If the user has specified that the callout shouldn't use initial focus, then respect
    // that and don't attempt to set focus. That will default to true within the callout
    // so we need to check if it's undefined here.
    if (this.props.calloutProps && this.props.calloutProps.setInitialFocus !== undefined) {
      shouldFocus = this.props.calloutProps.setInitialFocus;
    }
    if (shouldFocus) {
      this._calendar.current?.focus();
    }
  };

  private _onTextFieldFocus = (ev: React.FocusEvent<HTMLElement>): void => {
    if (this.props.disableAutoFocus) {
      return;
    }

    if (!this.props.allowTextInput) {
      if (!this._preventFocusOpeningPicker) {
        this._showDatePickerPopup();
      } else {
        this._preventFocusOpeningPicker = false;
      }
    }
  };

  private _onTextFieldChanged = (
    ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
    newValue: string,
  ): void => {
    const { allowTextInput, textField } = this.props;

    if (allowTextInput) {
      if (this.props.hoisted.isDatePickerShown) {
        this._dismissDatePickerPopup();
      }

      const { isRequired, strings } = this.props;

      this.props.hoisted.setDate(newValue);
      this.props.hoisted.setErrorMessage(isRequired && !newValue ? strings!.isRequiredErrorMessage || ' ' : undefined);
    }

    if (textField && textField.onChange) {
      textField.onChange(ev, newValue);
    }
  };

  private _onTextFieldKeyDown = (ev: React.KeyboardEvent<HTMLElement>): void => {
    switch (ev.which) {
      case KeyCodes.enter:
        ev.preventDefault();
        ev.stopPropagation();
        if (!this.props.hoisted.isDatePickerShown) {
          this.props.hoisted.validateTextInput();
          this._showDatePickerPopup();
        } else {
          // When DatePicker allows input date string directly,
          // it is expected to hit another enter to close the popup
          if (this.props.allowTextInput) {
            this._dismissDatePickerPopup();
          }
        }
        break;

      case KeyCodes.escape:
        this._handleEscKey(ev);
        break;

      default:
        break;
    }
  };

  private _onTextFieldClick = (ev: React.MouseEvent<HTMLElement>): void => {
    if (!this.props.disableAutoFocus && !this.props.hoisted.isDatePickerShown && !this.props.disabled) {
      this._showDatePickerPopup();
      return;
    }
    if (this.props.allowTextInput) {
      this._dismissDatePickerPopup();
    }
  };

  private _onIconClick = (ev: React.MouseEvent<HTMLElement>): void => {
    ev.stopPropagation();
    if (!this.props.hoisted.isDatePickerShown && !this.props.disabled) {
      this._showDatePickerPopup();
    } else if (this.props.allowTextInput) {
      this._dismissDatePickerPopup();
    }
  };

  private _showDatePickerPopup(): void {
    if (!this.props.hoisted.isDatePickerShown) {
      this._preventFocusOpeningPicker = true;
      this.props.hoisted.setIsDatePickerShown(true);
    }
  }

  private _dismissDatePickerPopup = (): void => {
    if (this.props.hoisted.isDatePickerShown) {
      this.props.hoisted.setIsDatePickerShown(false);
      this.props.hoisted.validateTextInput();
    }
  };

  /**
   * Callback for closing the calendar callout
   */
  private _calendarDismissed = (): void => {
    this._preventFocusOpeningPicker = true;
    this._dismissDatePickerPopup();
    // don't need to focus the text box, if necessary the focusTrapZone will do it
  };

  private _handleEscKey = (ev: React.KeyboardEvent<HTMLElement>): void => {
    if (this.props.hoisted.isDatePickerShown) {
      ev.stopPropagation();
    }
    this._calendarDismissed();
  };
}
