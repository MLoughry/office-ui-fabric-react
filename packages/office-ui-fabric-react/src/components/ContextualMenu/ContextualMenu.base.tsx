import * as React from 'react';
import {
  IContextualMenuProps,
  IContextualMenuItem,
  ContextualMenuItemType,
  IContextualMenuListProps,
  IContextualMenuStyleProps,
  IContextualMenuStyles,
  IContextualMenuItemRenderProps,
} from './ContextualMenu.types';
import { DirectionalHint } from '../../common/DirectionalHint';
import { FocusZone, FocusZoneDirection, IFocusZoneProps, FocusZoneTabbableElements } from '../../FocusZone';
import { IMenuItemClassNames, IContextualMenuClassNames } from './ContextualMenu.classNames';
import {
  divProperties,
  getNativeProps,
  shallowCompare,
  warnDeprecations,
  Async,
  EventGroup,
  assign,
  classNamesFunction,
  css,
  getDocument,
  getFirstFocusable,
  getId,
  getLastFocusable,
  getRTL,
  getWindow,
  IRenderFunction,
  Point,
  KeyCodes,
  shouldWrapFocus,
  IStyleFunctionOrObject,
  isIOS,
  isMac,
  initializeComponentRef,
  memoizeFunction,
} from '../../Utilities';
import { hasSubmenu, getIsChecked, isItemDisabled } from '../../utilities/contextualMenu/index';
import {
  ResponsiveMode,
  useResponsiveMode,
  IWithResponsiveModeState,
} from '../../utilities/decorators/withResponsiveMode';
import { Callout, ICalloutContentStyleProps, ICalloutContentStyles, Target } from '../../Callout';
import { ContextualMenuItem } from './ContextualMenuItem';
import {
  ContextualMenuSplitButton,
  ContextualMenuButton,
  ContextualMenuAnchor,
  IContextualMenuItemWrapperProps,
} from './ContextualMenuItemWrapper/index';
import { IProcessedStyleSet, concatStyleSetsWithProps } from '../../Styling';
import {
  IContextualMenuItemStyleProps,
  IContextualMenuItemStyles,
  IContextualMenuItemProps,
} from './ContextualMenuItem.types';
import { getItemStyles } from './ContextualMenu.classNames';
import { useMergedRefs, useConst, useId, useAsync, useAsyncTimeout } from '@uifabric/react-hooks';
import { getPropsWithDefaults } from '@uifabric/utilities';

const getClassNames = classNamesFunction<IContextualMenuStyleProps, IContextualMenuStyles>();
const getContextualMenuItemClassNames = classNamesFunction<IContextualMenuItemStyleProps, IContextualMenuItemStyles>();

export interface IContextualMenuState {
  expandedMenuItemKey?: string;
  /** True if the menu was expanded by mouse click OR hover (as opposed to by keyboard) */
  expandedByMouseClick?: boolean;
  contextualMenuItems?: IContextualMenuItem[];
  contextualMenuTarget?: Element;
  submenuTarget?: Element;
  positions?: any;
  slideDirectionalClassName?: string;
  subMenuId?: string;
  submenuDirection?: DirectionalHint;
}

export function getSubmenuItems(item: IContextualMenuItem): IContextualMenuItem[] | undefined {
  return item.subMenuProps ? item.subMenuProps.items : item.items;
}

/**
 * Returns true if a list of menu items can contain a checkbox
 */
export function canAnyMenuItemsCheck(items: IContextualMenuItem[]): boolean {
  return items.some(item => {
    if (item.canCheck) {
      return true;
    }

    // If the item is a section, check if any of the items in the section can check.
    if (item.sectionProps && item.sectionProps.items.some(submenuItem => submenuItem.canCheck === true)) {
      return true;
    }

    return false;
  });
}

const NavigationIdleDelay = 250 /* ms */;

const COMPONENT_NAME = 'ContextualMenu';

const _getMenuItemStylesFunction = memoizeFunction(
  (
    ...styles: (IStyleFunctionOrObject<IContextualMenuItemStyleProps, IContextualMenuItemStyles> | undefined)[]
  ): IStyleFunctionOrObject<IContextualMenuItemStyleProps, IContextualMenuItemStyles> => {
    return (styleProps: IContextualMenuItemStyleProps) =>
      concatStyleSetsWithProps(styleProps, getItemStyles, ...styles);
  },
);

function useTarget(props: IContextualMenuProps, hostElement: React.RefObject<HTMLDivElement | null>) {
  const [target, setTarget] = React.useState<Element | MouseEvent | Point | null>(null);
  const targetWindowRef = React.useRef<Window>();

  React.useEffect(() => {
    if (props.target) {
      if (typeof props.target === 'string') {
        const currentDoc: Document = getDocument(hostElement.current)!;
        setTarget(currentDoc ? (currentDoc.querySelector(props.target) as Element) : null);
        targetWindowRef.current = getWindow(hostElement.current)!;
      } else if (!!(props.target as MouseEvent).stopPropagation) {
        targetWindowRef.current = getWindow((props.target as MouseEvent).target as HTMLElement)!;
        setTarget(props.target as MouseEvent);
      } else if (
        // tslint:disable-next-line:deprecation
        ((props.target as Point).left !== undefined || (props.target as Point).x !== undefined) &&
        // tslint:disable-next-line:deprecation
        ((props.target as Point).top !== undefined || (props.target as Point).y !== undefined)
      ) {
        targetWindowRef.current = getWindow(hostElement.current)!;
        setTarget(props.target as Point);
      } else if ((props.target as React.RefObject<Element>).current !== undefined) {
        setTarget((props.target as React.RefObject<Element>).current);
        targetWindowRef.current = getWindow((props.target as React.RefObject<Element>).current);
      } else {
        const targetElement: Element = props.target as Element;
        targetWindowRef.current = getWindow(targetElement)!;
        setTarget(props.target as Element);
      }
    } else {
      setTarget(null);
      targetWindowRef.current = getWindow(hostElement.current)!;
    }
  }, [props.target]);

  return [target, targetWindowRef] as const;
}

function useEventGroup() {
  const eventGroup = useConst(() => new EventGroup({}));

  React.useEffect(
    () => () => {
      eventGroup.dispose;
    },
    [],
  );

  return eventGroup;
}

function useShowHideHandlers(props: IContextualMenuProps, targetWindowRef: React.RefObject<Window | undefined>) {
  const eventGroup = useEventGroup();

  React.useEffect(() => {
    if (!props.hidden) {
      const onDismissCallback = () => props.onDismiss?.();
      eventGroup.on(targetWindowRef.current, 'resize', onDismissCallback);

      return () => {
        eventGroup.off(targetWindowRef.current, 'resize', onDismissCallback);
      };
    }
  }, [!!props.hidden, props.onDismiss]);

  React.useEffect(() => {
    if (!props.hidden) {
      props.onMenuOpened?.();

      return () => {
        props.onMenuDismissed?.();
      };
    }
  }, [!!props.hidden]);
}

function useShouldUpdateFocusOnMouseMove({ delayUpdateFocusOnHover, hidden }: IContextualMenuProps) {
  const shouldUpdateFocusOnMouseEvent = React.useRef<boolean>(!delayUpdateFocusOnHover);
  const gotMouseMove = React.useRef<boolean>(false);

  React.useEffect(() => {
    shouldUpdateFocusOnMouseEvent.current = !delayUpdateFocusOnHover;
    gotMouseMove.current = !delayUpdateFocusOnHover && gotMouseMove.current;
  }, [delayUpdateFocusOnHover]);

  React.useEffect(() => {
    shouldUpdateFocusOnMouseEvent.current = false;
    gotMouseMove.current = hidden ? !delayUpdateFocusOnHover : false;
  }, [hidden]);

  const onMenuFocusCapture = () => {
    if (delayUpdateFocusOnHover) {
      shouldUpdateFocusOnMouseEvent.current = true;
    }
  };

  return [shouldUpdateFocusOnMouseEvent, gotMouseMove, onMenuFocusCapture] as const;
}

function useScrollTracker(async: Async) {
  const isScrollIdle = React.useRef<boolean>(true);
  const scrollIdleTimeoutId = React.useRef<number | undefined>();
  const [setScrollTimeout, , isScrollTimeoutPending] = useAsyncTimeout(async);
  const [setEnterTimeout, , isEnterTimeoutActive] = useAsyncTimeout(async);

  /**
   * Scroll handler for the callout to make sure the mouse events
   * for updating focus are not interacting during scroll
   */
  const onScroll = () => {
    if (isScrollIdle.current || !isScrollTimeoutPending()) {
      isScrollIdle.current = false;
    }

    scrollIdleTimeoutId.current = setScrollTimeout(() => (isScrollIdle.current = true), NavigationIdleDelay);
  };

  return [isScrollIdle, onScroll] as const;
}

function useIsMounted() {
  const isMounted = React.useRef(false);

  React.useEffect(() => {
    isMounted.current = false;
    return () => {
      isMounted.current = true;
    };
  }, []);

  return isMounted;
}

function useFocusHandler(props: IContextualMenuProps, targetWindowRef: React.RefObject<Window | undefined>) {
  const shouldFocusPreviousElementOnUnmount = React.useRef<boolean>(false);
  const previousActiveElement = React.useRef<HTMLElement | null>(null);

  // Using useLayoutEffect to capture the existing focus before changes are flushed and focus changes
  React.useLayoutEffect(() => {
    if (!props.hidden) {
      previousActiveElement.current = targetWindowRef.current
        ? (targetWindowRef.current.document.activeElement as HTMLElement)
        : null;
      shouldFocusPreviousElementOnUnmount.current = false;
    } else if (shouldFocusPreviousElementOnUnmount.current && previousActiveElement.current) {
      // This slight delay is required so that we can unwind the stack, const react try to mess with focus, and then
      // apply the correct focus. Without the setTimeout, we end up focusing the correct thing, and then React wants
      // to reset the focus back to the thing it thinks should have been focused.
      // Note: Cannot be replaced by this._async.setTimout because those will be removed by the time this is called.
      setTimeout(() => {
        previousActiveElement.current && previousActiveElement.current.focus();
      }, 0);
    }
  }, [props.hidden]);

  const setShouldFocusPreviousElementOnUnmount = () => {
    shouldFocusPreviousElementOnUnmount.current = true;
  };

  return setShouldFocusPreviousElementOnUnmount;
}

function useMouseHandlers(
  props: IContextualMenuProps,
  host: React.RefObject<HTMLDivElement | null>,
  targetWindow: React.RefObject<Window | undefined>,
) {
  const async = useAsync();
  const [setSubMenuTimeout, clearSubMenuTimeout, isSubMenuTimeoutActive] = useAsyncTimeout(async);
  const [isScrollIdle, onScroll] = useScrollTracker(async);
  const [shouldUpdateFocusOnMouseEvent, gotMouseMove, onMenuFocusCapture] = useShouldUpdateFocusOnMouseMove(props);
  const [expandedByMouseClick, setExpandedByMouseClick] = React.useState(false);
  const [expandedMenuItemKey, setExpandedMenuItemKey] = React.useState<string | undefined>();
  const [submenuTarget, setSubmenuTarget] = React.useState<HTMLElement | undefined>();
  const [subMenuId, setSubMenuId] = React.useState<string | undefined>();
  const isMounted = useIsMounted();
  const setShouldFocusPreviousElementOnUnmount = useFocusHandler(props, targetWindow);
  /** True if the most recent keydown event was for alt (option) or meta (command). */
  const lastKeyDownWasAltOrMeta = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (props.hidden) {
      // We need to dismiss any submenu related state properties,
      // so that when the menu is shown again, the submenu is collapsed
      setExpandedByMouseClick(false);
      setExpandedMenuItemKey(undefined);
      setSubmenuTarget(undefined);
    }
  }, [props.hidden]);

  const shouldIgnoreMouseEvent = () => !isScrollIdle.current || !gotMouseMove.current;

  /**
   * Checks if the submenu should be closed
   */
  const shouldCloseSubMenu = (ev: React.KeyboardEvent<HTMLElement>): boolean => {
    const submenuCloseKey = getRTL(props.theme) ? KeyCodes.right : KeyCodes.left;

    if (ev.which !== submenuCloseKey || !props.isSubMenu) {
      return false;
    }

    return (
      !props.focusZoneProps ||
      props.focusZoneProps.direction === FocusZoneDirection.vertical ||
      (!!props.focusZoneProps?.checkForNoWrap && !shouldWrapFocus(ev.target as HTMLElement, 'data-no-horizontal-wrap'))
    );
  };

  const executeItemClick = (
    item: IContextualMenuItem,
    ev: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
  ): void => {
    if (item.disabled || item.isDisabled) {
      return;
    }

    let dismiss = false;
    if (item.onClick) {
      dismiss = !!item.onClick(ev, item);
    } else if (props.onItemClick) {
      dismiss = !!props.onItemClick(ev, item);
    }

    (dismiss || !ev.defaultPrevented) && props.onDismiss?.(ev, true);
  };

  /**
   * Calls `shouldHandleKey` to determine whether the keyboard event should be handled;
   * if so, stops event propagation and dismisses menu(s).
   * @param ev - The keyboard event.
   * @param shouldHandleKey - Returns whether we should handle this keyboard event.
   * @param dismissAllMenus - If true, dismiss all menus. Otherwise, dismiss only the current menu.
   * Only does anything if `shouldHandleKey` returns true.
   * @returns Whether the event was handled.
   */
  const keyHandler = (
    ev: React.KeyboardEvent<HTMLElement>,
    shouldHandleKey: (ev: React.KeyboardEvent<HTMLElement>) => boolean,
    dismissAllMenus?: boolean,
  ): boolean => {
    let handled = false;

    if (shouldHandleKey(ev)) {
      setShouldFocusPreviousElementOnUnmount();
      props.onDismiss?.(ev, dismissAllMenus);
      ev.preventDefault();
      ev.stopPropagation();
      handled = true;
    }

    return handled;
  };

  const onItemSubMenuExpand = (item: IContextualMenuItem, target: HTMLElement): void => {
    if (expandedMenuItemKey !== item.key) {
      if (expandedMenuItemKey) {
        onSubMenuDismiss();
      }

      // Focus the target to ensure when we close it, we're focusing on the correct element.
      target.focus();
      setExpandedMenuItemKey(item.key);
      setSubmenuTarget(target);
    }
  };

  const shouldHandleKeyDown = (ev: React.KeyboardEvent<HTMLElement>) => {
    return (
      ev.which === KeyCodes.escape || shouldCloseSubMenu(ev) || (ev.which === KeyCodes.up && (ev.altKey || ev.metaKey))
    );
  };

  const onKeyDown = (ev: React.KeyboardEvent<HTMLElement>): boolean => {
    // Take note if we are processing an alt (option) or meta (command) keydown.
    // See comment in _shouldHandleKeyUp for reasoning.
    lastKeyDownWasAltOrMeta.current = isAltOrMeta(ev);

    // On Mac, pressing escape dismisses all levels of native context menus
    const dismissAllMenus = ev.which === KeyCodes.escape && (isMac() || isIOS());

    return keyHandler(ev, shouldHandleKeyDown, dismissAllMenus);
  };

  const onMenuKeyDown = (ev: React.KeyboardEvent<HTMLElement>) => {
    // Mark as handled if onKeyDown returns true (for handling collapse cases)
    // or if we are attempting to expand a submenu
    const handled = onKeyDown(ev);

    if (handled || !host.current) {
      return;
    }

    // If we have a modifier key being pressed, we do not want to move focus.
    // Otherwise, handle up and down keys.
    const hasModifier = !!(ev.altKey || ev.metaKey);
    const isUp = ev.which === KeyCodes.up;
    const isDown = ev.which === KeyCodes.down;
    if (!hasModifier && (isUp || isDown)) {
      const elementToFocus = isUp
        ? getLastFocusable(host.current, host.current.lastChild as HTMLElement, true)
        : getFirstFocusable(host.current, host.current.firstChild as HTMLElement, true);

      if (elementToFocus) {
        elementToFocus.focus();
        ev.preventDefault();
        ev.stopPropagation();
      }
    }
  };

  /**
   * We close the menu on key up only if ALL of the following are true:
   * - Most recent key down was alt or meta (command)
   * - The alt/meta key down was NOT followed by some other key (such as down/up arrow to
   *   expand/collapse the menu)
   * - We're not on a Mac (or iOS)
   *
   * This is because on Windows, pressing alt moves focus to the application menu bar or similar,
   * closing any open context menus. There is not a similar behavior on Macs.
   */
  const shouldHandleKeyUp = (ev: React.KeyboardEvent<HTMLElement>) => {
    const keyPressIsAltOrMetaAlone = lastKeyDownWasAltOrMeta.current && isAltOrMeta(ev);
    lastKeyDownWasAltOrMeta.current = false;
    return !!keyPressIsAltOrMetaAlone && !(isIOS() || isMac());
  };

  const onKeyUp = (ev: React.KeyboardEvent<HTMLElement>): boolean => {
    return keyHandler(ev, shouldHandleKeyUp, true /* dismissAllMenus */);
  };

  /**
   * This function is called ASYNCHRONOUSLY, and so there is a chance it is called
   * after the component is unmounted. The isMounted ref is added to prevent
   * from calling setState() after unmount. Do NOT copy this pattern in synchronous
   * code.
   */
  const onSubMenuDismiss = (ev?: any, dismissAll?: boolean): void => {
    if (dismissAll) {
      props.onDismiss?.(ev, dismissAll);
    } else if (isMounted.current) {
      setExpandedMenuItemKey(undefined);
      setSubmenuTarget(undefined);
    }
  };

  const onAnchorClick = (item: IContextualMenuItem, ev: React.MouseEvent<HTMLElement>) => {
    executeItemClick(item, ev);
    ev.stopPropagation();
  };

  /**
   * Handles updating focus when mouseEnter or mouseMove fire.
   * As part of updating focus, This function will also update
   * the expand/collapse state accordingly.
   */
  const updateFocusOnMouseEvent = (
    item: IContextualMenuItem,
    ev: React.MouseEvent<HTMLElement>,
    target?: HTMLElement,
  ) => {
    const targetElement = target ? target : (ev.currentTarget as HTMLElement);
    const { subMenuHoverDelay: timeoutDuration = NavigationIdleDelay } = this.props;

    if (item.key === expandedMenuItemKey) {
      return;
    }

    clearSubMenuTimeout();

    // If the menu is not expanded we can update focus without any delay
    if (expandedMenuItemKey === undefined) {
      targetElement.focus();
    }

    // Delay updating expanding/dismissing the submenu
    // and only set focus if we have not already done so
    if (hasSubmenu(item)) {
      ev.stopPropagation();
      setSubMenuTimeout(() => {
        targetElement.focus();
        setExpandedByMouseClick(true);
        onItemSubMenuExpand(item, targetElement);
      }, timeoutDuration);
    } else {
      setSubMenuTimeout(() => {
        onSubMenuDismiss(ev);
        targetElement.focus();
      }, timeoutDuration);
    }
  };

  const onItemMouseMove = (item: IContextualMenuItem, ev: React.MouseEvent<HTMLElement>, target: HTMLElement) => {
    const targetElement = ev.currentTarget as HTMLElement;

    // Always do this check to make sure we record a mouseMove if needed (even if we are timed out)
    if (shouldUpdateFocusOnMouseEvent.current) {
      gotMouseMove.current = true;
    } else {
      return;
    }

    if (
      !isScrollIdle.current ||
      isSubMenuTimeoutActive() ||
      targetElement === (targetWindow.current?.document?.activeElement as HTMLElement)
    ) {
      return;
    }

    updateFocusOnMouseEvent(item, ev, target);
  };

  const onItemMouseLeave = (item: IContextualMenuItem, ev: React.MouseEvent<HTMLElement>): void => {
    if (shouldIgnoreMouseEvent()) {
      return;
    }

    clearSubMenuTimeout();

    if (expandedMenuItemKey !== undefined) {
      return;
    }

    /**
     * IE11 focus() method forces parents to scroll to top of element.
     * Edge and IE expose a setActive() function for focusable divs that
     * sets the page focus but does not scroll the parent element.
     */
    if ('setActive' in host.current!) {
      try {
        (host.current as any).setActive();
      } catch (e) {
        /* no-op */
      }
    } else {
      host.current!.focus();
    }
  };

  const onItemMouseEnterBase = (
    item: IContextualMenuItem,
    ev: React.MouseEvent<HTMLElement>,
    target?: HTMLElement,
  ): void => {
    if (shouldIgnoreMouseEvent()) {
      return;
    }

    updateFocusOnMouseEvent(item, ev, target);
  };

  const onItemClick = (
    item: IContextualMenuItem,
    ev: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
    target: HTMLElement = ev.currentTarget,
  ): void => {
    const items = getSubmenuItems(item);

    // Cancel a async menu item hover timeout action from being taken and instead
    // just trigger the click event instead.
    clearSubMenuTimeout();

    if (!hasSubmenu(item) && (!items || !items.length)) {
      // This is an item without a menu. Click it.
      executeItemClick(item, ev);
    } else {
      if (item.key !== expandedMenuItemKey) {
        // This has a collapsed sub menu. Expand it.
        // When Edge + Narrator are used together (regardless of if the button is in a form or not), pressing
        // "Enter" fires this method and not _onMenuKeyDown. Checking ev.nativeEvent.detail differentiates
        // between a real click event and a keypress event (detail should be the number of mouse clicks).
        // ...Plot twist! For a real click event in IE 11, detail is always 0 (Edge sets it properly to 1).
        // So we also check the pointerType property, which both Edge and IE set to "mouse" for real clicks
        // and "" for pressing "Enter" with Narrator on.
        setExpandedByMouseClick(
          ev.nativeEvent.detail !== 0 || (ev.nativeEvent as PointerEvent).pointerType === 'mouse',
        );
        onItemSubMenuExpand(item, target);
      }
    }

    ev.stopPropagation();
    ev.preventDefault();
  };

  const onItemKeyDown = (item: IContextualMenuItem, ev: React.KeyboardEvent<HTMLElement>): void => {
    const openKey = getRTL(props.theme) ? KeyCodes.left : KeyCodes.right;

    if (
      !item.disabled &&
      (ev.which === openKey || ev.which === KeyCodes.enter || (ev.which === KeyCodes.down && (ev.altKey || ev.metaKey)))
    ) {
      setExpandedByMouseClick(false);
      onItemSubMenuExpand(item, ev.currentTarget as HTMLElement);
      ev.preventDefault();
    }
  };

  const getSubMenuId = (item: IContextualMenuItem): string | undefined => {
    return item.subMenuProps?.id ?? subMenuId;
  };

  return {
    expandedMenuItemKey,
    onItemMouseEnterBase,
    onItemMouseLeave,
    onItemMouseMove,
    onItemClick,
    onItemKeyDown,
    onItemSubMenuExpand,
    onSubMenuDismiss,
    clearSubMenuTimeout,
    executeItemClick,
    onAnchorClick,
    getSubMenuId,
  };
}

export const ContextualMenuBase = React.forwardRef(
  (props: IContextualMenuProps, forwardedRef: React.Ref<HTMLDivElement>) => {
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const mergedRootRef = useMergedRefs(rootRef, forwardedRef);
    const responsiveMode = useResponsiveMode(rootRef);
    const id = useId('ContextualMenu', props.id);

    const [target, targetWindowRef] = useTarget(props, rootRef);
    useShowHideHandlers(props, targetWindowRef);
    const {
      expandedMenuItemKey,
      onItemMouseEnterBase,
      onItemMouseLeave,
      onItemMouseMove,
      onItemClick,
      onItemSubMenuExpand,
      onSubMenuDismiss,
      onItemKeyDown,
      clearSubMenuTimeout,
      executeItemClick,
      onAnchorClick,
      getSubMenuId,
    } = useMouseHandlers(props, rootRef, targetWindowRef);

    React.useImperativeHandle(
      props.componentRef,
      () => ({
        dismiss(ev?: any, dismissAll?: boolean) {
          props.onDismiss?.(ev, dismissAll);
        },
      }),
      [props.onDismiss],
    );

    const renderSplitButton = (
      item: IContextualMenuItem,
      // tslint:disable-next-line:deprecation
      classNames: IMenuItemClassNames,
      index: number,
      focusableElementIndex: number,
      totalItemCount: number,
      hasCheckmarks?: boolean,
      hasIcons?: boolean,
    ): JSX.Element => {
      return (
        <ContextualMenuSplitButton
          {...getContextualMenuItemWrapperProps(
            item,
            classNames,
            index,
            focusableElementIndex,
            totalItemCount,
            hasCheckmarks,
            hasIcons,
          )}
          onItemClick={onItemClick}
          onItemClickBase={onItemClick}
        />
      );
    };

    const renderAnchorMenuItem = (
      item: IContextualMenuItem,
      // tslint:disable-next-line:deprecation
      classNames: IMenuItemClassNames,
      index: number,
      focusableElementIndex: number,
      totalItemCount: number,
      hasCheckmarks: boolean,
      hasIcons: boolean,
    ): React.ReactNode => {
      return (
        <ContextualMenuAnchor
          {...getContextualMenuItemWrapperProps(
            item,
            classNames,
            index,
            focusableElementIndex,
            totalItemCount,
            hasCheckmarks,
            hasIcons,
          )}
          getSubMenuId={getSubMenuId}
          onItemClick={onAnchorClick}
        />
      );
    };

    const renderButtonItem = (
      item: IContextualMenuItem,
      // tslint:disable-next-line:deprecation
      classNames: IMenuItemClassNames,
      index: number,
      focusableElementIndex: number,
      totalItemCount: number,
      hasCheckmarks?: boolean,
      hasIcons?: boolean,
    ) => {
      return (
        <ContextualMenuButton
          {...getContextualMenuItemWrapperProps(
            item,
            classNames,
            index,
            focusableElementIndex,
            totalItemCount,
            hasCheckmarks,
            hasIcons,
          )}
          getSubMenuId={getSubMenuId}
          onItemClick={onItemClick}
          onItemClickBase={onItemClick}
        />
      );
    };

    const getContextualMenuItemWrapperProps = (
      item: IContextualMenuItem,
      // tslint:disable-next-line:deprecation
      classNames: IMenuItemClassNames,
      index: number,
      focusableElementIndex: number,
      totalItemCount: number,
      hasCheckmarks?: boolean,
      hasIcons?: boolean,
    ) => {
      return {
        classNames,
        contextualMenuItemAs: props.contextualMenuItemAs,
        dismissMenu: props.onDismiss,
        dismissSubMenu: onSubMenuDismiss,
        executeItemClick,
        expandedMenuItemKey,
        focusableElementIndex,
        hasCheckmarks,
        hasIcons,
        index,
        item,
        onItemKeyDown,
        onItemMouseDown: item.onMouseDown,
        onItemMouseEnter: onItemMouseEnterBase,
        onItemMouseLeave,
        onItemMouseMove,
        openSubMenu: onItemSubMenuExpand,
        totalItemCount,
      };
    };

    const renderNormalItem = (
      item: IContextualMenuItem,
      classNames: IMenuItemClassNames, // tslint:disable-line:deprecation
      index: number,
      focusableElementIndex: number,
      totalItemCount: number,
      hasCheckmarks: boolean,
      hasIcons: boolean,
    ): React.ReactNode => {
      if (item.onRender) {
        return item.onRender(
          { 'aria-posinset': focusableElementIndex + 1, 'aria-setsize': totalItemCount, ...item },
          (ev, dismissAll) => props.onDismiss?.(ev, dismissAll),
        );
      }
      if (item.href) {
        return renderAnchorMenuItem(
          item,
          classNames,
          index,
          focusableElementIndex,
          totalItemCount,
          hasCheckmarks,
          hasIcons,
        );
      }

      if (item.split && hasSubmenu(item)) {
        return renderSplitButton(
          item,
          classNames,
          index,
          focusableElementIndex,
          totalItemCount,
          hasCheckmarks,
          hasIcons,
        );
      }

      return renderButtonItem(item, classNames, index, focusableElementIndex, totalItemCount, hasCheckmarks, hasIcons);
    };

    return (
      <ContextualMenuBaseClass
        {...props}
        domRef={mergedRootRef}
        responsiveMode={responsiveMode}
        _target={target}
        _targetWindow={targetWindowRef}
        id={id}
      />
    );
  },
);
ContextualMenuBase.displayName = 'ContextualMenuBase';

function getSubMenuRenderFunction(props: IContextualMenuProps) {
  const onRenderSubMenu = () => {
    throw Error(
      'ContextualMenuBase: onRenderSubMenu callback is null or undefined. ' +
        'Please ensure to set `onRenderSubMenu` property either manually or with `styled` helper.',
    );
  };

  return props.onRenderSubMenu
    ? (subMenuProps: IContextualMenuProps) => props.onRenderSubMenu!(subMenuProps, onRenderSubMenu)
    : onRenderSubMenu;
}

interface IContextualMenuSeparatorProps {
  index: number;
  classNames: IMenuItemClassNames; // tslint:disable-line:deprecation
  top?: boolean;
  fromSection?: boolean;
  children?: React.ReactNode;
}

const ContextualMenuSeparator: React.FunctionComponent<IContextualMenuSeparatorProps> = ({
  index,
  classNames,
  top,
  fromSection,
}: IContextualMenuSeparatorProps) => {
  if (fromSection || index > 0) {
    return <li role="separator" className={classNames.divider} aria-hidden="true" />;
  }
  return null;
};
ContextualMenuSeparator.displayName = 'ContextualMenuSeparator';

interface IContextualMenuHeaderItemProps {
  contextualMenuItemAs?: React.ComponentType<IContextualMenuItemProps>;
  item: IContextualMenuItem;
  // tslint:disable-next-line:deprecation
  itemClassNames: IMenuItemClassNames;
  index: number;
  hasCheckmarks: boolean;
  hasIcons: boolean;
  onItemClick: (
    item: IContextualMenuItem,
    ev: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
  ) => void;
  // tslint:disable-next-line:deprecation
  menuClassNames: IProcessedStyleSet<IContextualMenuStyles> | IContextualMenuClassNames;
}

const ContextualMenuHeaderItem: React.FunctionComponent<IContextualMenuHeaderItemProps> = ({
  contextualMenuItemAs: ChildrenRenderer = ContextualMenuItem,
  item,
  itemClassNames,
  index,
  hasCheckmarks,
  hasIcons,
  onItemClick,
  menuClassNames,
}: IContextualMenuHeaderItemProps) => {
  const { itemProps, id } = item;
  const divHtmlProperties = itemProps && getNativeProps<React.HTMLAttributes<HTMLDivElement>>(itemProps, divProperties);
  return (
    // tslint:disable-next-line:deprecation
    <div id={id} className={menuClassNames.header} {...divHtmlProperties} style={item.style}>
      <ChildrenRenderer
        item={item}
        classNames={itemClassNames}
        index={index}
        onCheckmarkClick={hasCheckmarks ? onItemClick : undefined}
        hasIcons={hasIcons}
        {...itemProps}
      />
    </div>
  );
};
ContextualMenuHeaderItem.displayName = 'ContextualMenuHeaderItem';

class ContextualMenuBaseClass extends React.Component<
  IContextualMenuProps & {
    domRef: (ref: HTMLDivElement | null) => void;
    _target: Element | MouseEvent | Point | null;
    _targetWindow: React.RefObject<Window | undefined>;
  } & IWithResponsiveModeState,
  IContextualMenuState
> {
  // The default ContextualMenu properties have no items and beak, the default submenu direction is right and top.
  public static defaultProps: IContextualMenuProps = {
    items: [],
    shouldFocusOnMount: true,
    gapSpace: 0,
    directionalHint: DirectionalHint.bottomAutoEdge,
    beakWidth: 16,
  };

  private _id: string;

  private _adjustedFocusZoneProps: IFocusZoneProps;

  // tslint:disable-next-line:deprecation
  private _classNames: IProcessedStyleSet<IContextualMenuStyles> | IContextualMenuClassNames;

  constructor(props: any) {
    super(props);

    warnDeprecations(COMPONENT_NAME, props, {
      getMenuClassNames: 'styles',
    });
    this._id = props.id;

    this.state = {
      contextualMenuItems: undefined,
      subMenuId: getId('ContextualMenu'),
    };
  }

  public shouldComponentUpdate(newProps: IContextualMenuProps, newState: IContextualMenuState): boolean {
    if (!newProps.shouldUpdateWhenHidden && this.props.hidden && newProps.hidden) {
      // Do not update when hidden.
      return false;
    }

    return !shallowCompare(this.props, newProps) || !shallowCompare(this.state, newState);
  }

  public render(): JSX.Element | null {
    let { isBeakVisible } = this.props;

    const {
      items,
      labelElementId,
      id,
      className,
      beakWidth,
      directionalHint,
      directionalHintForRTL,
      alignTargetEdge,
      gapSpace,
      coverTarget,
      ariaLabel,
      doNotLayer,
      target,
      bounds,
      useTargetWidth,
      useTargetAsMinWidth,
      directionalHintFixed,
      shouldFocusOnMount,
      shouldFocusOnContainer,
      title,
      styles,
      theme,
      calloutProps,
      onRenderMenuList = this._onRenderMenuList,
      focusZoneProps,
      // tslint:disable-next-line:deprecation
      getMenuClassNames,
    } = this.props;

    this._classNames = getMenuClassNames
      ? getMenuClassNames(theme!, className)
      : getClassNames(styles, {
          theme: theme!,
          className: className,
        });

    const hasIcons = itemsHaveIcons(items);

    function itemsHaveIcons(contextualMenuItems: IContextualMenuItem[]): boolean {
      for (const item of contextualMenuItems) {
        if (!!item.iconProps) {
          return true;
        }

        if (
          item.itemType === ContextualMenuItemType.Section &&
          item.sectionProps &&
          itemsHaveIcons(item.sectionProps.items)
        ) {
          return true;
        }
      }

      return false;
    }

    this._adjustedFocusZoneProps = getPropsWithDefaults(
      { direction: FocusZoneDirection.vertical },
      focusZoneProps ?? {},
    );

    const hasCheckmarks = canAnyMenuItemsCheck(items);
    const submenuProps = this.state.expandedMenuItemKey && this.props.hidden !== true ? this._getSubmenuProps() : null;

    isBeakVisible = isBeakVisible === undefined ? this.props.responsiveMode! <= ResponsiveMode.medium : isBeakVisible;
    /**
     * When useTargetWidth is true, get the width of the target element and apply it for the context menu container
     */
    let contextMenuStyle;
    const targetAsHtmlElement = this.props._target as HTMLElement;
    if ((useTargetWidth || useTargetAsMinWidth) && targetAsHtmlElement && targetAsHtmlElement.offsetWidth) {
      const targetBoundingRect = targetAsHtmlElement.getBoundingClientRect();
      const targetWidth = targetBoundingRect.width - 2 /* Accounts for 1px border */;

      if (useTargetWidth) {
        contextMenuStyle = {
          width: targetWidth,
        };
      } else if (useTargetAsMinWidth) {
        contextMenuStyle = {
          minWidth: targetWidth,
        };
      }
    }

    // The menu should only return if items were provided, if no items were provided then it should not appear.
    if (items && items.length > 0) {
      let totalItemCount = 0;
      for (const item of items) {
        if (item.itemType !== ContextualMenuItemType.Divider && item.itemType !== ContextualMenuItemType.Header) {
          const itemCount = item.customOnRenderListLength ? item.customOnRenderListLength : 1;
          totalItemCount += itemCount;
        }
      }

      const calloutStyles = this._classNames.subComponentStyles
        ? (this._classNames.subComponentStyles.callout as IStyleFunctionOrObject<
            ICalloutContentStyleProps,
            ICalloutContentStyles
          >)
        : undefined;

      return (
        <Callout
          styles={calloutStyles}
          {...calloutProps}
          target={target}
          isBeakVisible={isBeakVisible}
          beakWidth={beakWidth}
          directionalHint={directionalHint}
          directionalHintForRTL={directionalHintForRTL}
          gapSpace={gapSpace}
          coverTarget={coverTarget}
          doNotLayer={doNotLayer}
          className={css('ms-ContextualMenu-Callout', calloutProps && calloutProps.className)}
          setInitialFocus={shouldFocusOnMount}
          onDismiss={this.props.onDismiss}
          onScroll={this._onScroll}
          bounds={bounds}
          directionalHintFixed={directionalHintFixed}
          alignTargetEdge={alignTargetEdge}
          hidden={this.props.hidden}
        >
          <div
            aria-label={ariaLabel}
            aria-labelledby={labelElementId}
            style={contextMenuStyle}
            ref={(host: HTMLDivElement) => {
              this._host = host;
              this.props.domRef(host);
            }}
            id={id}
            className={this._classNames.container}
            tabIndex={shouldFocusOnContainer ? 0 : -1}
            onKeyDown={this._onMenuKeyDown}
            onKeyUp={this._onKeyUp}
            onFocusCapture={this._onMenuFocusCapture}
          >
            {title && <div className={this._classNames.title}> {title} </div>}
            {items && items.length ? (
              <FocusZone
                {...this._adjustedFocusZoneProps}
                className={this._classNames.root}
                isCircularNavigation={true}
                handleTabKey={FocusZoneTabbableElements.all}
              >
                {onRenderMenuList(
                  {
                    items,
                    totalItemCount,
                    hasCheckmarks,
                    hasIcons,
                    defaultMenuItemRenderer: this._renderMenuItem,
                  },
                  this._onRenderMenuList,
                )}
              </FocusZone>
            ) : null}
            {submenuProps && getSubMenuRenderFunction(this.props)(submenuProps)}
          </div>
        </Callout>
      );
    } else {
      return null;
    }
  }

  private _onRenderMenuList = (
    menuListProps: IContextualMenuListProps,
    defaultRender?: IRenderFunction<IContextualMenuListProps>,
  ): JSX.Element => {
    let indexCorrection = 0;
    return (
      <ul className={this._classNames.list} onKeyDown={this._onKeyDown} onKeyUp={this._onKeyUp} role="menu">
        {menuListProps.items.map((item, index) => {
          const menuItem = this._renderMenuItem({
            ...item,
            index,
            focusableElementIndex: indexCorrection,
            totalItemCount: menuListProps.totalItemCount,
            hasCheckmarks: menuListProps.hasCheckmarks,
            hasIcons: menuListProps.hasIcons,
          });
          if (item.itemType !== ContextualMenuItemType.Divider && item.itemType !== ContextualMenuItemType.Header) {
            const indexIncrease = item.customOnRenderListLength ? item.customOnRenderListLength : 1;
            indexCorrection += indexIncrease;
          }
          return menuItem;
        })}
      </ul>
    );
  };

  private _renderMenuItem = (item: IContextualMenuItemRenderProps): React.ReactNode => {
    const renderedItems: React.ReactNode[] = [];
    const iconProps = item.iconProps || { iconName: 'None' };
    const {
      getItemClassNames, // tslint:disable-line:deprecation
      itemProps,
      index,
      focusableElementIndex,
      totalItemCount,
      hasCheckmarks,
      hasIcons,
    } = item;
    const styles = itemProps ? itemProps.styles : undefined;

    // We only send a dividerClassName when the item to be rendered is a divider.
    // For all other cases, the default divider style is used.
    const dividerClassName = item.itemType === ContextualMenuItemType.Divider ? item.className : undefined;
    const subMenuIconClassName = item.submenuIconProps ? item.submenuIconProps.className : '';

    // tslint:disable-next-line:deprecation
    let itemClassNames: IMenuItemClassNames;

    // IContextualMenuItem#getItemClassNames for backwards compatibility
    // otherwise uses mergeStyles for class names.
    if (getItemClassNames) {
      itemClassNames = getItemClassNames(
        this.props.theme!,
        isItemDisabled(item),
        this.state.expandedMenuItemKey === item.key,
        !!getIsChecked(item),
        !!item.href,
        iconProps.iconName !== 'None',
        item.className,
        dividerClassName,
        iconProps.className,
        subMenuIconClassName,
        item.primaryDisabled,
      );
    } else {
      const itemStyleProps: IContextualMenuItemStyleProps = {
        theme: this.props.theme!,
        disabled: isItemDisabled(item),
        expanded: this.state.expandedMenuItemKey === item.key,
        checked: !!getIsChecked(item),
        isAnchorLink: !!item.href,
        knownIcon: iconProps.iconName !== 'None',
        itemClassName: item.className,
        dividerClassName,
        iconClassName: iconProps.className,
        subMenuClassName: subMenuIconClassName,
        primaryDisabled: item.primaryDisabled,
      };

      // We need to generate default styles then override if styles are provided
      // since the ContextualMenu currently handles item classNames.
      itemClassNames = getContextualMenuItemClassNames(
        _getMenuItemStylesFunction(this._classNames.subComponentStyles?.menuItem, styles),
        itemStyleProps,
      );
    }

    // tslint:disable-next-line:deprecation
    if (item.text === '-' || item.name === '-') {
      item.itemType = ContextualMenuItemType.Divider;
    }
    switch (item.itemType) {
      case ContextualMenuItemType.Divider:
        renderedItems.push(
          <ContextualMenuSeparator key={`separator-${index}`} index={index} classNames={itemClassNames} />,
        );
        break;
      case ContextualMenuItemType.Header:
        renderedItems.push(
          <ContextualMenuSeparator key={`separator-${index}`} index={index} classNames={itemClassNames} />,
        );
        const headerItem = (
          <ContextualMenuHeaderItem
            key={`header-${index}`}
            contextualMenuItemAs={this.props.contextualMenuItemAs}
            item={item}
            itemClassNames={itemClassNames}
            index={index}
            hasCheckmarks={hasCheckmarks}
            hasIcons={hasIcons}
            onItemClick={this._onItemClick}
            menuClassNames={this._classNames}
          />
        );
        renderedItems.push(
          <ContextualMenuListItem
            content={headerItem}
            key={item.key || index}
            classNames={itemClassNames}
            title={item.title}
          />,
        );
        break;
      case ContextualMenuItemType.Section:
        renderedItems.push(this._renderSectionItem(item, itemClassNames, index, hasCheckmarks, hasIcons));
        break;
      default:
        const menuItem = this._renderNormalItem(
          item,
          itemClassNames,
          index,
          focusableElementIndex,
          totalItemCount,
          hasCheckmarks,
          hasIcons,
        );
        renderedItems.push(
          <ContextualMenuListItem
            content={menuItem}
            key={item.key || index}
            classNames={itemClassNames}
            title={item.title}
          />,
        );
        break;
    }

    return renderedItems;
  };

  private _renderSectionItem(
    sectionItem: IContextualMenuItem,
    // tslint:disable-next-line:deprecation
    menuClassNames: IMenuItemClassNames,
    index: number,
    hasCheckmarks: boolean,
    hasIcons: boolean,
  ) {
    const sectionProps = sectionItem.sectionProps;
    if (!sectionProps) {
      return;
    }

    let headerItem;
    let groupProps;
    if (sectionProps.title) {
      // Since title is a user-facing string, it needs to be stripped of whitespace in order to build a valid element ID
      const id = this._id + sectionProps.title.replace(/\s/g, '');
      const headerContextualMenuItem: IContextualMenuItem = {
        key: `section-${sectionProps.title}-title`,
        itemType: ContextualMenuItemType.Header,
        text: sectionProps.title,
        id: id,
      };
      groupProps = {
        role: 'group',
        'aria-labelledby': id,
      };
      headerItem = (
        <ContextualMenuHeaderItem
          key={`header-${index}`}
          contextualMenuItemAs={this.props.contextualMenuItemAs}
          item={headerContextualMenuItem}
          itemClassNames={menuClassNames}
          index={index}
          hasCheckmarks={hasCheckmarks}
          hasIcons={hasIcons}
          onItemClick={this._onItemClick}
          menuClassNames={this._classNames}
        />
      );
    }

    if (sectionProps.items && sectionProps.items.length > 0) {
      return (
        <li role="presentation" key={sectionProps.key || sectionItem.key || `section-${index}`}>
          <div {...groupProps}>
            <ul className={this._classNames.list}>
              {sectionProps.topDivider && (
                <ContextualMenuSeparator
                  key={`separator-${index}-top`}
                  index={index}
                  classNames={menuClassNames}
                  top={true}
                  fromSection={true}
                />
              )}
              {headerItem && (
                <ContextualMenuListItem
                  content={headerItem}
                  key={sectionItem.key || index}
                  classNames={menuClassNames}
                  title={sectionItem.title}
                />
              )}
              {sectionProps.items.map((contextualMenuItem, itemsIndex) =>
                this._renderMenuItem({
                  ...contextualMenuItem,
                  index: itemsIndex,
                  focusableElementIndex: itemsIndex,
                  totalItemCount: sectionProps.items.length,
                  hasCheckmarks,
                  hasIcons,
                }),
              )}
              {sectionProps.bottomDivider && (
                <ContextualMenuSeparator
                  key={`separator-${index}-bottom`}
                  index={index}
                  classNames={menuClassNames}
                  top={false}
                  fromSection={true}
                />
              )}
            </ul>
          </div>
        </li>
      );
    }
  }

  private _getSubmenuProps() {
    const { submenuTarget, expandedMenuItemKey } = this.state;
    const item = this._findItemByKey(expandedMenuItemKey!);
    let submenuProps: IContextualMenuProps | null = null;

    if (item) {
      submenuProps = {
        items: getSubmenuItems(item)!,
        target: submenuTarget,
        onDismiss: this._onSubMenuDismiss,
        isSubMenu: true,
        id: this.state.subMenuId,
        shouldFocusOnMount: true,
        shouldFocusOnContainer: this.state.expandedByMouseClick,
        directionalHint: getRTL(this.props.theme) ? DirectionalHint.leftTopEdge : DirectionalHint.rightTopEdge,
        className: this.props.className,
        gapSpace: 0,
        isBeakVisible: false,
      };

      if (item.subMenuProps) {
        assign(submenuProps, item.subMenuProps);
      }
    }
    return submenuProps;
  }

  private _findItemByKey(key: string): IContextualMenuItem | undefined {
    const { items } = this.props;
    return this._findItemByKeyFromItems(key, items);
  }

  /**
   * Returns the item that mathes a given key if any.
   * @param key - The key of the item to match
   * @param items - The items to look for the key
   */
  private _findItemByKeyFromItems(key: string, items: IContextualMenuItem[]): IContextualMenuItem | undefined {
    for (const item of items) {
      if (item.itemType === ContextualMenuItemType.Section && item.sectionProps) {
        const match = this._findItemByKeyFromItems(key, item.sectionProps.items);
        if (match) {
          return match;
        }
      } else if (item.key && item.key === key) {
        return item;
      }
    }
  }
}

function ContextualMenuListItem({
  content,
  classNames,
  title,
}: {
  content: React.ReactNode;
  classNames: IMenuItemClassNames; // tslint:disable-line:deprecation
  title?: string;
}) {
  return (
    <li role="presentation" title={title} className={classNames.item}>
      {content}
    </li>
  );
}

/**
 * Returns true if the key for the event is alt (Mac option) or meta (Mac command).
 */
function isAltOrMeta(ev: React.KeyboardEvent<HTMLElement>): boolean {
  return ev.which === KeyCodes.alt || ev.key === 'Meta';
}
