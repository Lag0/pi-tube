import type { PiTubeError } from "./errors.ts";

/** Successful outcome of an operation. */
export interface Success<T> {
  readonly success: true;
  readonly data: T;
}

/** Failed outcome of an operation; `error` carries the business failure. */
export interface Failure<E> {
  readonly success: false;
  readonly error: E;
}

/** Outcome of every core operation: business failures are values, never exceptions. */
export type Result<T, E = PiTubeError> = Success<T> | Failure<E>;

/** Wraps `data` in a successful result. */
export const ok = <T>(data: T): Success<T> => ({ success: true, data });

/** Wraps `error` in a failed result. */
export const err = <E>(error: E): Failure<E> => ({ success: false, error });
