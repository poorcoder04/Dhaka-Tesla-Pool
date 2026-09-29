import { expect } from "vitest";

import { AppError } from "../../src/utils/AppError.js";

/**
 * Asserts that `promise` rejects with an AppError carrying the expected HTTP
 * status, and returns the error so the caller can make further assertions.
 *
 * Services in this codebase signal every refusal with AppError(409/403/404)
 * rather than a raw Prisma error, so checking the status code is checking real
 * behaviour — not an implementation detail of an assertion library.
 */
export async function expectAppError(
  promise: Promise<unknown>,
  statusCode: number,
  messageContains?: string,
): Promise<AppError> {
  let error: unknown;

  try {
    await promise;
  } catch (caught) {
    error = caught;
  }

  expect(error, "expected the promise to reject, but it resolved").toBeInstanceOf(
    AppError,
  );

  const appError = error as AppError;
  expect(appError.statusCode).toBe(statusCode);

  if (messageContains) {
    expect(appError.message).toContain(messageContains);
  }

  return appError;
}
