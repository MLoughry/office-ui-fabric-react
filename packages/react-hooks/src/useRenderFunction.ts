import { IRenderFunction } from '@uifabric/utilities';

export type RenderFunctionNames<TProps extends {}> = {
  // tslint:disable-next-line:no-any  This is used to filter out any properties of "any" type
  [K in keyof TProps]: any extends TProps[K] ? never : IRenderFunction<TProps> extends TProps[K] ? K : never;
}[keyof TProps];

export function useRenderFunction<TProps extends {}, TRenderFunctionName extends RenderFunctionNames<TProps>>(
  props: TProps,
  renderFunctionName: TRenderFunctionName,
  defaultRender: (props: TProps) => JSX.Element | null,
) {
  const propsRenderFunction: IRenderFunction<TProps> | undefined = props[renderFunctionName];
  return propsRenderFunction ? () => propsRenderFunction(props, defaultRender) : () => defaultRender(props);
}
