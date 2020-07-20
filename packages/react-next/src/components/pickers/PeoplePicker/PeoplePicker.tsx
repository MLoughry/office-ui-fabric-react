import * as React from 'react';

import { getRTL, getInitials, styled } from '../../../Utilities';
import { BasePicker, BasePickerListBelow } from '../BasePicker';
import {
  IBasePickerProps,
  IBasePickerSuggestionsProps,
  ValidationState,
  IBasePickerStyleProps,
  IBasePickerStyles,
} from '../BasePicker.types';
import { PeoplePickerItem } from './PeoplePickerItems/PeoplePickerItem';
import { IPersonaProps } from '../../../Persona';
import { PeoplePickerItemSuggestion } from './PeoplePickerItems/PeoplePickerItemSuggestion';
import { IPeoplePickerItemSelectedProps } from './PeoplePickerItems/PeoplePickerItem.types';
import { getStyles } from '../BasePicker.styles';
import { IObjectWithKey } from '@uifabric/utilities';
import { getPropsWithDefaults } from '@uifabric/utilities';

/**
 * PeoplePicker props interface which renders Personas as items.
 * {@docCategory PeoplePicker}
 * */
export interface IPeoplePickerProps extends IBasePickerProps<IPersonaProps> {}

/**
 * {@docCategory PeoplePicker}
 */
export const BasePeoplePicker = React.forwardRef(
  (
    props: IPeoplePickerProps,
    forwardedRef: React.Ref<BasePicker<IPersonaProps & IObjectWithKey, IPeoplePickerProps>>,
  ) => {
    return <BasePicker<IPersonaProps & IObjectWithKey, IPeoplePickerProps> {...props} ref={forwardedRef} />;
  },
);
BasePeoplePicker.displayName = 'BasePeoplePicker';

/**
 * {@docCategory PeoplePicker}
 */
export const MemberListPeoplePicker = React.forwardRef(
  (props: IPeoplePickerProps, forwardedRef: React.Ref<BasePickerListBelow<IPersonaProps, IPeoplePickerProps>>) => {
    return <BasePickerListBelow<IPersonaProps, IPeoplePickerProps> {...props} ref={forwardedRef} />;
  },
);
MemberListPeoplePicker.displayName = 'MemberListPeoplePicker';

const DEFAULT_NORMAL_PEOPLE_PICKER_BASE_PROPS = {
  onRenderItem: (props: IPeoplePickerItemSelectedProps) => <PeoplePickerItem {...props} />,
  onRenderSuggestionsItem: (personaProps: IPersonaProps, suggestionsProps?: IBasePickerSuggestionsProps) => (
    <PeoplePickerItemSuggestion personaProps={personaProps} suggestionsProps={suggestionsProps} />
  ),
  createGenericItem: createGenericItem,
} as const;
/**
 * Standard People Picker.
 * {@docCategory PeoplePicker}
 */
export const NormalPeoplePickerBase = React.forwardRef(
  (
    propsWithoutDefaults: IPeoplePickerProps,
    forwardedRef: React.Ref<BasePicker<IPersonaProps & IObjectWithKey, IPeoplePickerProps>>,
  ) => {
    const props = getPropsWithDefaults(DEFAULT_NORMAL_PEOPLE_PICKER_BASE_PROPS, propsWithoutDefaults);
    return <BasePeoplePicker {...props} ref={forwardedRef} />;
  },
);
NormalPeoplePickerBase.displayName = 'NormalPeoplePickerBase';

const DEFAULT_COMPACT_PEOPLE_PICKER_BASE_PROPS = {
  onRenderItem: (props: IPeoplePickerItemSelectedProps) => <PeoplePickerItem {...props} />,
  onRenderSuggestionsItem: (personaProps: IPersonaProps, suggestionsProps?: IBasePickerSuggestionsProps) => (
    <PeoplePickerItemSuggestion personaProps={personaProps} suggestionsProps={suggestionsProps} compact={true} />
  ),
  createGenericItem: createGenericItem,
} as const;
/**
 * Compact layout. It uses personas without secondary text when displaying search results.
 * {@docCategory PeoplePicker}
 */
export const CompactPeoplePickerBase = React.forwardRef(
  (
    propsWithoutDefaults: IPeoplePickerProps,
    forwardedRef: React.Ref<BasePicker<IPersonaProps & IObjectWithKey, IPeoplePickerProps>>,
  ) => {
    const props = getPropsWithDefaults(DEFAULT_COMPACT_PEOPLE_PICKER_BASE_PROPS, propsWithoutDefaults);
    return <BasePeoplePicker {...props} ref={forwardedRef} />;
  },
);
CompactPeoplePickerBase.displayName = 'CompactPeoplePickerBase';

const DEFAULT_LIST_PEOPLE_PICKER_BASE_PROPS = {
  onRenderItem: (props: IPeoplePickerItemSelectedProps) => <PeoplePickerItem {...props} />,
  onRenderSuggestionsItem: (personaProps: IPersonaProps, suggestionsProps?: IBasePickerSuggestionsProps) => (
    <PeoplePickerItemSuggestion personaProps={personaProps} suggestionsProps={suggestionsProps} compact={true} />
  ),
  createGenericItem: createGenericItem,
} as const;
/**
 * MemberList layout. The selected people show up below the search box.
 * {@docCategory PeoplePicker}
 */
export const ListPeoplePickerBase = React.forwardRef(
  (
    propsWithoutDefaults: IPeoplePickerProps,
    forwardedRef: React.Ref<BasePickerListBelow<IPersonaProps & IObjectWithKey, IPeoplePickerProps>>,
  ) => {
    const props = getPropsWithDefaults(DEFAULT_LIST_PEOPLE_PICKER_BASE_PROPS, propsWithoutDefaults);
    return <MemberListPeoplePicker {...props} ref={forwardedRef} />;
  },
);
ListPeoplePickerBase.displayName = 'ListPeoplePickerBase';

/**
 * {@docCategory PeoplePicker}
 */
export interface IGenericItem {
  primaryText: string;
  imageInitials: string;
  ValidationState: ValidationState;
}

/**
 * {@docCategory PeoplePicker}
 */
export function createGenericItem(
  name: string,
  currentValidationState: ValidationState,
): IGenericItem & { key: React.Key } {
  const personaToConvert = {
    key: name,
    primaryText: name,
    imageInitials: '!',
    ValidationState: currentValidationState,
  };

  if (currentValidationState !== ValidationState.warning) {
    personaToConvert.imageInitials = getInitials(name, getRTL());
  }

  return personaToConvert;
}

export const NormalPeoplePicker = styled<IPeoplePickerProps, IBasePickerStyleProps, IBasePickerStyles>(
  NormalPeoplePickerBase,
  getStyles,
  undefined,
  {
    scope: 'NormalPeoplePicker',
  },
);

export const CompactPeoplePicker = styled<IPeoplePickerProps, IBasePickerStyleProps, IBasePickerStyles>(
  CompactPeoplePickerBase,
  getStyles,
  undefined,
  {
    scope: 'CompactPeoplePicker',
  },
);

export const ListPeoplePicker = styled<IPeoplePickerProps, IBasePickerStyleProps, IBasePickerStyles>(
  ListPeoplePickerBase,
  getStyles,
  undefined,
  {
    scope: 'ListPeoplePickerBase',
  },
);
