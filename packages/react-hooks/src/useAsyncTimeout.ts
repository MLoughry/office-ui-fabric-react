import * as React from 'react';
import { Async } from '@uifabric/utilities';

/**
 * A hook to manage a timeout that should only have at most a single pending call. Any call to the returned setTimeout
 * method clears any previous timeout
 * @param async- An Async instance, likely from `useAsync`, to create the timeout with
 */
export function useAsyncTimeout(
  async: Async,
): readonly [
  /* setTimeout */ <TCallback extends (...args: unknown[]) => unknown>(
    callback: TCallback,
    timeout: number,
    ...params: Parameters<TCallback>
  ) => void,
  /* clearTimeout */ () => void,
  /* isTimeoutPending */ () => boolean,
] {
  const timerId = React.useRef<number | undefined>();

  const clearTimeout = React.useCallback(() => {
    if (timerId.current !== undefined) {
      async.clearTimeout(timerId.current);
      timerId.current = undefined;
    }
  }, [async]);

  const setTimeout = React.useCallback(
    <TCallback extends (...args: unknown[]) => unknown>(
      callback: TCallback,
      timeout: number,
      ...params: Parameters<TCallback>
    ) => {
      clearTimeout();
      timerId.current = window.setTimeout(
        (...args: Parameters<TCallback>) => {
          timerId.current = 0;
          callback(...args);
        },
        timeout,
        ...params,
      );
    },
    [clearTimeout, async],
  );

  const isTimeoutPending = React.useCallback((): boolean => !!timerId.current, [async]);

  React.useEffect(() => clearTimeout, [async]);

  return [setTimeout, clearTimeout, isTimeoutPending] as const;
}
