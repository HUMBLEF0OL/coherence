/** Returns current time as ISO-8601 UTC string. Used by all log writers (NFR-OBS-5). */
export function nowIsoUtc(): string {
  return new Date().toISOString();
}
