export const TICK_INTERVAL_HOURS = 4;

export function tickKey(now = new Date()) {
  const intervalMs = TICK_INTERVAL_HOURS * 60 * 60 * 1_000;
  return new Date(Math.floor(now.getTime() / intervalMs) * intervalMs).toISOString();
}

export function tickEventId(currentTickKey: string) {
  return `blackstone-tick:${currentTickKey}`;
}
