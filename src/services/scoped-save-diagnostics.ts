/** Explicitly opt-in, sanitized diagnostics for local E8 browser acceptance. */
export function traceScopedSaveDevelopment(
  checkpoint: string,
  details: Record<string, string | number | boolean | null | readonly string[]> = {},
): void {
  if (process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_NAVI_E8_SAVE_DIAGNOSTICS !== 'true') return
  console.info(`[NAVI_E8_SAVE_TRACE] ${JSON.stringify({ checkpoint, ...details })}`)
}
