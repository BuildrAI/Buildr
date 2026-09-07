export const VERIFICATION_COMMAND_TIMEOUT_DEFAULT_MS = 900_000;
export const VERIFICATION_COMMAND_TIMEOUT_MIN_MS = 1_000;
export const VERIFICATION_COMMAND_TIMEOUT_MAX_MS = 1_800_000;

export function resolveVerificationCommandTimeout(value: any) {
  const timeoutMs = value ?? VERIFICATION_COMMAND_TIMEOUT_DEFAULT_MS;
  if (!Number.isInteger(timeoutMs)
    || timeoutMs < VERIFICATION_COMMAND_TIMEOUT_MIN_MS
    || timeoutMs > VERIFICATION_COMMAND_TIMEOUT_MAX_MS) {
    throw new Error(`Verification command timeoutMs must be an integer from ${VERIFICATION_COMMAND_TIMEOUT_MIN_MS} to ${VERIFICATION_COMMAND_TIMEOUT_MAX_MS}.`);
  }
  return timeoutMs;
}
