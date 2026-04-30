export const SERVER_TERMINAL_OUTPUT_ENABLED = false;

export function serverLog(...args: unknown[]): void {
  if (!SERVER_TERMINAL_OUTPUT_ENABLED) return;
  console.log(...args);
}

export function serverWarn(...args: unknown[]): void {
  if (!SERVER_TERMINAL_OUTPUT_ENABLED) return;
  console.warn(...args);
}

export function serverError(...args: unknown[]): void {
  if (!SERVER_TERMINAL_OUTPUT_ENABLED) return;
  console.error(...args);
}
