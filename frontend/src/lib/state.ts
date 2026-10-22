import type { ApiError } from './api';

/**
 * The five states every screen in the console can be in.
 *
 * A missing state is a bug, so they are modelled as a union rather than left
 * to chance: a component that renders data has to say what it renders while
 * it is loading, when it is empty, when it failed, and when it was refused.
 */
export type AsyncState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: ApiError }
  | { readonly kind: 'unauthorized'; readonly error: ApiError }
  | { readonly kind: 'ready'; readonly data: T };

export const loading: AsyncState<never> = { kind: 'loading' };

export function errored(error: ApiError): AsyncState<never> {
  return error.kind === 'unauthorized'
    ? { kind: 'unauthorized', error }
    : { kind: 'error', error };
}

export function ready<T>(data: T): AsyncState<T> {
  return { kind: 'ready', data };
}

export function isReady<T>(state: AsyncState<T>): state is { readonly kind: 'ready'; readonly data: T } {
  return state.kind === 'ready';
}
