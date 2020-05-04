import * as React from 'react';
import { hasSubmenu, getIsChecked } from '../../utilities/contextualMenu/index';
import { getRTL } from '../../Utilities';
import { Icon } from '../../Icon';
import { IContextualMenuItemProps } from './ContextualMenuItem.types';

export const ContextualMenuItemBase = React.forwardRef(
  (props: IContextualMenuItemProps, forwardedRef: React.Ref<HTMLDivElement>) => {
    const { item, classNames, onCheckmarkClick, getSubmenuTarget, theme, hasIcons } = props;

    const openSubMenu = (): void => {
      const submenuTarget = getSubmenuTarget?.();
      if (hasSubmenu(item) && submenuTarget) {
        props.openSubMenu?.(item, submenuTarget);
      }
    };

    const dismissSubMenu = (): void => {
      if (hasSubmenu(item)) {
        props.dismissSubMenu?.();
      }
    };

    const dismissMenu = (dismissAll?: boolean): void => {
      props.dismissMenu?.(undefined /* ev */, dismissAll);
    };

    React.useImperativeHandle(props.componentRef, () => ({ openSubMenu, dismissSubMenu, dismissMenu }), [
      openSubMenu,
      dismissSubMenu,
      dismissMenu,
    ]);

    // tslint:disable-next-line: deprecation
    const itemName = item.text || item.name;

    return (
      <div className={item.split ? classNames.linkContentMenu : classNames.linkContent} ref={forwardedRef}>
        {/* renderCheckmark */
        onCheckmarkClick ? (
          <Icon
            iconName={item.canCheck !== false && getIsChecked(item) ? 'CheckMark' : ''}
            className={classNames.checkmarkIcon}
            onClick={onCheckmarkClick.bind(null, item)}
          />
        ) : null}
        {/*renderItemIcon*/ hasIcons
          ? item.onRenderIcon?.(props) ?? <Icon {...item.iconProps} className={classNames.icon} />
          : null}
        {/*renderItemName*/ itemName ? <span className={classNames.label}>{itemName}</span> : null}
        {/* renderSecondaryText */
        item.secondaryText ? <span className={classNames.secondaryText}>{item.secondaryText}</span> : null}
        {/* renderSubMenuIcon */
        hasSubmenu(item) ? (
          <Icon
            iconName={getRTL(theme) ? 'ChevronLeft' : 'ChevronRight'}
            {...item.submenuIconProps}
            className={classNames.subMenuIcon}
          />
        ) : null}
      </div>
    );
  },
);
ContextualMenuItemBase.displayName = 'ContextualMenuItemBase';
