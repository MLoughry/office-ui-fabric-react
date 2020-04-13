import * as React from 'react';
import { IProcessedStyleSet } from '../../Styling';
import { Label, ILabelStyleProps, ILabelStyles } from '../../Label';
import { Icon } from '../../Icon';
import {
  DelayedRender,
  IStyleFunctionOrObject,
  classNamesFunction,
  getNativeProps,
  inputProperties,
  textAreaProperties,
  warn,
  warnControlledUsage,
  warnMutuallyExclusive,
} from '../../Utilities';
import { ITextField, ITextFieldProps, ITextFieldStyleProps, ITextFieldStyles } from './TextField.types';
import { useId, useControllableValue, useAsync, useRenderFunction } from '@uifabric/react-hooks';

const getClassNames = classNamesFunction<ITextFieldStyleProps, ITextFieldStyles>();

/** @internal */
export interface ITextFieldSnapshot {
  /**
   * If set, the text field is changing between single- and multi-line, so we'll need to reset
   * selection/cursor after the change completes.
   */
  selection?: [number | null, number | null];
}

const DEFAULT_STATE_VALUE = '';
const COMPONENT_NAME = 'TextField';

function useWarnControlledUsage(id: string, props: ITextFieldProps, currentValue: string | undefined): void {
  // Show warnings if props are being used in an invalid way
  const _previousProps = React.useRef<ITextFieldProps>();
  const _hasWarnedNullValue = React.useRef<boolean>(false);

  React.useEffect(() => {
    warnControlledUsage({
      componentId: id,
      componentName: COMPONENT_NAME,
      props: props,
      oldProps: _previousProps.current,
      valueProp: 'value',
      defaultValueProp: 'defaultValue',
      onChangeProp: 'onChange',
      readOnlyProp: 'readOnly',
    });

    if (props.value === null && !_hasWarnedNullValue.current) {
      _hasWarnedNullValue.current = true;
      warn(
        `Warning: 'value' prop on '${COMPONENT_NAME}' should not be null. Consider using an ` +
          'empty string to clear the component or undefined to indicate an uncontrolled component.',
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      warnMutuallyExclusive(COMPONENT_NAME, props, {
        errorMessage: 'onGetErrorMessage',
      });
    }

    _previousProps.current = props;
  });
}

function useFocusHandlers(
  props: ITextFieldProps,
  value: string | undefined,
  validate: (value: string | undefined) => void,
  textFieldObject: ITextField,
) {
  const [isFocused, setIsFocused] = React.useState(false);

  const onFocus = React.useCallback(
    (ev: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      if (props.onFocus) {
        props.onFocus(ev);
      }

      setIsFocused(true);

      if (props.validateOnFocusIn) {
        validate(value);
      }
    },
    [props.onFocus, props.validateOnFocusIn, validate],
  );

  const onBlur = React.useCallback(
    (ev: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      if (props.onBlur) {
        props.onBlur(ev);
      }
      setIsFocused(false);

      if (props.validateOnFocusOut) {
        validate(value);
      }
    },
    [props.onBlur, props.validateOnFocusOut, validate],
  );

  useResetSelection(textFieldObject, props, isFocused);

  return [isFocused, onFocus, onBlur] as const;
}

function useResetSelection(textFieldObject: ITextField, props: ITextFieldProps, isFocused: boolean) {
  const selectionSnapshot = React.useRef<(number | null)[]>([]);
  React.useLayoutEffect(() => {
    selectionSnapshot.current = [textFieldObject.selectionStart, textFieldObject.selectionEnd];
  }, [props.multiline]);
  React.useEffect(() => {
    if (isFocused) {
      const [start = null, end = null] = selectionSnapshot.current;
      // The text field has just changed between single- and multi-line, so we need to reset focus
      // and selection/cursor.
      textFieldObject.focus();
      if (start !== null && end !== null && start >= 0 && end >= 0) {
        textFieldObject.setSelectionRange(start, end);
      }
    }
  }, [props.multiline]);
}

function useValidate(props: ITextFieldProps, currentValue: string | undefined) {
  const async = useAsync();
  const latestValidateValue = React.useRef<string | undefined>();
  const lastValidation = React.useRef<number>(0);
  const [errorMessageState, setErrorMessage] = React.useState<string | JSX.Element>('');

  const _notifyAfterValidate = React.useCallback(
    (newValue: string | undefined, errorMessage: string | JSX.Element): void => {
      if (newValue === currentValue && props.onNotifyValidationResult) {
        props.onNotifyValidationResult(errorMessage, newValue);
      }
    },
    [currentValue, props.onNotifyValidationResult],
  );

  const validate = React.useCallback(
    (newValue: string | undefined): void => {
      // In case validate is called again while validation promise is executing
      if (latestValidateValue.current === newValue && _shouldValidateAllChanges(props)) {
        return;
      }

      latestValidateValue.current = newValue;
      const onGetErrorMessage = props.onGetErrorMessage;
      const result = onGetErrorMessage && onGetErrorMessage(newValue || '');

      if (result !== undefined) {
        if (typeof result === 'string' || !('then' in result)) {
          setErrorMessage(result);
          _notifyAfterValidate(newValue, result);
        } else {
          const currentValidation: number = ++lastValidation.current;

          result.then((errorMessage: string | JSX.Element) => {
            if (currentValidation === lastValidation.current) {
              setErrorMessage(errorMessage);
            }
            _notifyAfterValidate(newValue, errorMessage);
          });
        }
      } else {
        _notifyAfterValidate(newValue, '');
      }
    },
    [_notifyAfterValidate, props.onGetErrorMessage],
  );

  const delayedValidate: (value: string | undefined) => void = async.debounce(validate, props.deferredValidationTime);

  React.useEffect(() => {
    if (props.validateOnLoad) {
      validate(currentValue);
    }
  }, []);

  React.useEffect(() => {
    // Clear error message if needed
    // TODO: is there any way to do this without an extra render?
    if (errorMessageState && !props.errorMessage) {
      setErrorMessage('');
    }
  }, [currentValue]);

  React.useLayoutEffect(() => {
    // TODO: #5875 added logic to trigger validation in componentWillReceiveProps and other places.
    // This seems a bit odd and hard to integrate with the new approach.
    // (Starting to think we should just put the validation logic in a separate wrapper component...?)
    if (_shouldValidateAllChanges(props)) {
      delayedValidate(currentValue);
    }
  }, [currentValue]);

  return [errorMessageState || '', validate] as const;
}

function useAutoAdjustHeight(
  props: ITextFieldProps,
  currentValue: string | undefined,
  textElement: React.RefObject<HTMLTextAreaElement | HTMLInputElement | undefined>,
) {
  React.useEffect(() => {
    if (textElement.current && props.autoAdjustHeight && props.multiline) {
      const textField = textElement.current!;
      textField.style.height = '';
      textField.style.height = textField.scrollHeight + 'px';
    }
  }, [currentValue]);
}

function useComponentRef(
  props: ITextFieldProps,
  value: string | undefined,
  _textElement: React.RefObject<HTMLTextAreaElement | HTMLInputElement | undefined>,
) {
  const textFieldObject = {
    /** Gets the current value of the input. */
    get value() {
      return value;
    },

    /** Sets focus to the input. */
    focus() {
      _textElement.current?.focus?.();
    },

    /** Blurs the input */
    blur() {
      _textElement.current?.blur?.();
    },

    /** Select the value of the text field. */
    select() {
      _textElement.current?.select?.();
    },

    /** Sets the selection start of the text field to a specified value. */
    setSelectionStart(valueIndex: number) {
      if (_textElement.current) {
        _textElement.current.selectionStart = valueIndex;
      }
    },

    /** Sets the selection end of the text field to a specified value. */
    setSelectionEnd(valueIndex: number) {
      if (_textElement.current) {
        _textElement.current.selectionEnd = valueIndex;
      }
    },
    /**
     * Sets the start and end positions of a selection in a text field.
     * Call with start and end set to the same value to set the cursor position.
     * @param start - Index of the start of the selection.
     * @param end - Index of the end of the selection.
     */
    setSelectionRange(start: number, end: number) {
      if (_textElement.current) {
        _textElement.current.setSelectionRange(start, end);
      }
    },

    /** Gets the selection start of the text field. Returns -1 if there is no selection. */
    get selectionStart() {
      return _textElement.current?.selectionStart ?? -1;
    },

    /** Gets the selection end of the text field. Returns -1 if there is no selection. */
    get selectionEnd() {
      return _textElement.current?.selectionEnd ?? -1;
    },
  };
  React.useImperativeHandle(props.componentRef, () => textFieldObject, [value]);

  return textFieldObject;
}

function useOnChangeHandler(
  props: ITextFieldProps,
  currentValue: string | undefined,
  setValue: (newValue: string | undefined, ev: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => void,
) {
  const _lastChangeValue = React.useRef<string | undefined>();
  const _onInputChange = React.useCallback(
    (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      // Previously, we needed to call both onInput and onChange due to some weird IE/React issues,
      // which have *probably* been fixed now:
      // - https://github.com/microsoft/fluentui/issues/744 (likely fixed)
      // - https://github.com/microsoft/fluentui/issues/824 (confirmed fixed)

      // TODO (Fabric 8?) - Switch to calling only onChange. This switch is pretty disruptive for
      // tests (ours and maybe consumers' too), so it seemed best to do the switch in a major bump.

      const element = event.target as HTMLInputElement;
      const value = element.value;
      // Ignore this event if the value is undefined (in case one of the IE bugs comes back)
      if (value === undefined || value === _lastChangeValue.current) {
        return;
      }
      _lastChangeValue.current = value;

      // This is so developers can access the event properties in asynchronous callbacks
      // https://reactjs.org/docs/events.html#event-pooling
      event.persist();

      if (currentValue !== value) {
        setValue(value, event);
      }
    },
    [setValue, currentValue],
  );

  React.useEffect(() => {
    // Reset the record of the last value seen by a change/input event
    _lastChangeValue.current = undefined;
  }, [currentValue]);

  return _onInputChange;
}

function useDescription(
  props: ITextFieldProps,
  errorMessage: string | JSX.Element,
  classNames: IProcessedStyleSet<ITextFieldStyles>,
) {
  const isDescriptionAvailable = !!(props.onRenderDescription || props.description || errorMessage);
  const _descriptionId = useId(COMPONENT_NAME + 'Description');

  const renderDescription = useRenderFunction(
    props,
    'onRenderDescription',
    (textFieldProps: ITextFieldProps): JSX.Element | null => {
      if (textFieldProps.description) {
        return <span className={classNames.description}>{textFieldProps.description}</span>;
      }
      return null;
    },
  );

  return [
    isDescriptionAvailable,
    renderDescription,
    _descriptionId,
    isDescriptionAvailable ? _descriptionId : props['aria-describedby'], // aria-describedby for text input
  ] as const;
}

function useRenderLabel(props: ITextFieldProps, classNames: IProcessedStyleSet<ITextFieldStyles>, id: string) {
  const labelId = useId(COMPONENT_NAME + 'Label');

  const renderLabel = useRenderFunction(
    props,
    'onRenderLabel',
    (textFieldProps: ITextFieldProps): JSX.Element | null => {
      const { label, required } = textFieldProps;
      // IProcessedStyleSet definition requires casting for what Label expects as its styles prop
      const labelStyles = classNames.subComponentStyles
        ? (classNames.subComponentStyles.label as IStyleFunctionOrObject<ILabelStyleProps, ILabelStyles>)
        : undefined;

      if (label) {
        return (
          <Label required={required} htmlFor={id} styles={labelStyles} disabled={textFieldProps.disabled} id={labelId}>
            {textFieldProps.label}
          </Label>
        );
      }
      return null;
    },
  );

  return [renderLabel, labelId] as const;
}

// tslint:disable-next-line:no-function-expression
export const TextFieldBase = React.forwardRef(function(
  props: ITextFieldProps,
  forwardedRef: React.Ref<HTMLDivElement>,
) {
  props = { resizable: true, deferredValidationTime: 200, validateOnLoad: true, ...props };

  const _textElement = React.useRef<HTMLTextAreaElement | HTMLInputElement>();
  const _id = useId(COMPONENT_NAME, props.id);

  const [value, setValue] = useControllableValue(
    // A number isn't allowed per the props, but happens anyway.
    typeof props.value === 'number' ? String(props.value) : props.value,
    typeof props.defaultValue === 'number' ? String(props.defaultValue) : props.defaultValue ?? DEFAULT_STATE_VALUE,
    props.onChange,
  );

  useWarnControlledUsage(_id, props, value);
  useAutoAdjustHeight(props, value, _textElement);
  const textFieldObject = useComponentRef(props, value, _textElement);
  const [errorMessage, validate] = useValidate(props, value);
  const [isFocused, onFocus, onBlur] = useFocusHandlers(props, value, validate, textFieldObject);

  const {
    borderless,
    className,
    disabled,
    iconProps,
    inputClassName,
    label,
    multiline,
    required,
    underlined,
    prefix,
    resizable,
    suffix,
    theme,
    styles,
    autoAdjustHeight,
  } = props;

  const classNames = getClassNames(styles!, {
    theme: theme!,
    className,
    disabled,
    focused: isFocused,
    required,
    multiline,
    hasLabel: !!label,
    hasErrorMessage: !!errorMessage,
    borderless,
    resizable,
    hasIcon: !!iconProps,
    underlined,
    inputClassName,
    autoAdjustHeight,
  });
  const [renderLabel, labelId] = useRenderLabel(props, classNames, _id);
  const onInputChange = useOnChangeHandler(props, value, setValue);

  const ariaLabelledBy = props['aria-labelledby'] || (props.label ? labelId : undefined);
  const [isDescriptionAvailable, renderDescription, descriptionId, ariaDescribedBy] = useDescription(
    props,
    errorMessage,
    classNames,
  );

  const renderTextArea = (): React.ReactElement<React.HTMLAttributes<HTMLAreaElement>> => {
    const textAreaProps = getNativeProps<React.TextareaHTMLAttributes<HTMLTextAreaElement>>(props, textAreaProperties, [
      'defaultValue',
    ]);
    return (
      <textarea
        id={_id}
        {...textAreaProps}
        ref={_textElement as React.RefObject<HTMLTextAreaElement>}
        value={value || ''}
        onInput={onInputChange}
        onChange={onInputChange}
        className={classNames.field}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={!!errorMessage}
        aria-label={props.ariaLabel}
        readOnly={props.readOnly}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  };

  const renderInput = (): React.ReactElement<React.HTMLAttributes<HTMLInputElement>> => {
    const inputProps = getNativeProps<React.HTMLAttributes<HTMLInputElement>>(props, inputProperties, ['defaultValue']);
    return (
      <input
        type={'text'}
        id={_id}
        aria-labelledby={ariaLabelledBy}
        {...inputProps}
        ref={_textElement as React.RefObject<HTMLInputElement>}
        value={value || ''}
        onInput={onInputChange}
        onChange={onInputChange}
        className={classNames.field}
        aria-label={props.ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={!!errorMessage}
        readOnly={props.readOnly}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  };

  const renderPrefix = useRenderFunction(props, 'onRenderPrefix', () => (
    <span style={{ paddingBottom: '1px' }}>{props.prefix}</span>
  ));

  const renderSuffix = useRenderFunction(props, 'onRenderPrefix', () => (
    <span style={{ paddingBottom: '1px' }}>{props.suffix}</span>
  ));

  return (
    <div className={classNames.root} ref={forwardedRef}>
      <div className={classNames.wrapper}>
        {renderLabel()}
        <div className={classNames.fieldGroup}>
          {(prefix !== undefined || props.onRenderPrefix) && <div className={classNames.prefix}>{renderPrefix()}</div>}
          {multiline ? renderTextArea() : renderInput()}
          {iconProps && <Icon className={classNames.icon} {...iconProps} />}
          {(suffix !== undefined || props.onRenderSuffix) && <div className={classNames.suffix}>{renderSuffix()}</div>}
        </div>
      </div>
      {isDescriptionAvailable && (
        <span id={descriptionId}>
          {renderDescription()}
          {errorMessage && (
            <div role="alert">
              <DelayedRender>
                <p className={classNames.errorMessage}>
                  <span data-automation-id="error-message">{errorMessage}</span>
                </p>
              </DelayedRender>
            </div>
          )}
        </span>
      )}
    </div>
  );
});

/**
 * If `validateOnFocusIn` or `validateOnFocusOut` is true, validation should run **only** on that event.
 * Otherwise, validation should run on every change.
 */
function _shouldValidateAllChanges(props: ITextFieldProps): boolean {
  return !(props.validateOnFocusIn || props.validateOnFocusOut);
}
