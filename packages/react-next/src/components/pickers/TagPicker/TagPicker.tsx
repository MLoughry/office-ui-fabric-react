import * as React from 'react';
import { styled, getPropsWithDefaults } from '../../../Utilities';
import { BasePicker } from '../BasePicker';
import { IBasePickerStyleProps, IBasePickerStyles } from '../BasePicker.types';
import { getStyles } from '../BasePicker.styles';
import { TagItem } from './TagItem';
import { TagItemSuggestion } from './TagItemSuggestion';
import { ITagPickerProps, ITag, ITagItemProps } from './TagPicker.types';

const DEFAULT_PROPS = {
  onRenderItem: (props: ITagItemProps) => <TagItem {...props}>{props.item.name}</TagItem>,
  onRenderSuggestionsItem: (props: ITag) => <TagItemSuggestion>{props.name}</TagItemSuggestion>,
} as const;
/**
 * MemberList layout. The selected people show up below the search box.
 * {@docCategory TagPicker}
 */
export const TagPickerBase = React.forwardRef(
  (propsWithoutDefaults: ITagPickerProps, forwardedRef: React.Ref<BasePicker<ITag, ITagPickerProps>>) => {
    const props = getPropsWithDefaults(DEFAULT_PROPS, propsWithoutDefaults);
    return <BasePicker<ITag, ITagPickerProps> {...props} ref={forwardedRef} />;
  },
);
TagPickerBase.displayName = 'TagPickerBase';

export const TagPicker = styled<ITagPickerProps, IBasePickerStyleProps, IBasePickerStyles>(
  TagPickerBase,
  getStyles,
  undefined,
  {
    scope: 'TagPicker',
  },
);
