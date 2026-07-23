export type Tier6Cutover = {
  /**
   * The real UTC instant represented by the configured offset ISO value.
   * PostgreSQL timestamps are written/read in UTC in production, so readiness
   * checks must use this value.
   */
  instant: Date;
  /**
   * Mikro stores business timestamps as timezone-less Istanbul wall-clock
   * values. Tedious' default useUTC=true exposes those components as a Date
   * ending in Z, so report comparisons must use the same component-preserving
   * representation instead of the real UTC instant.
   */
  mikroWallClock: Date;
};

const OFFSET_ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?([+-]\d{2}:\d{2})$/;

export const parseTier6Cutover = (value: unknown): Tier6Cutover => {
  const raw = String(value || '').trim();
  const match = OFFSET_ISO_PATTERN.exec(raw);
  const instant = new Date(raw);

  if (!match || !Number.isFinite(instant.getTime())) {
    throw new Error(
      'PRICE_LIST_TIER6_CUTOVER_DATE saat ve UTC offset iceren tam ISO-8601 ' +
        'deger olmali (ornegin 2026-07-23T14:30:00+03:00).'
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] || '').padEnd(3, '0') || 0);
  const mikroWallClock = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
  );

  // Date.UTC normalizes invalid values (for example 31 February or 24:01).
  // Reject them instead of silently moving the production cutover boundary.
  if (
    mikroWallClock.getUTCFullYear() !== year ||
    mikroWallClock.getUTCMonth() !== month - 1 ||
    mikroWallClock.getUTCDate() !== day ||
    mikroWallClock.getUTCHours() !== hour ||
    mikroWallClock.getUTCMinutes() !== minute ||
    mikroWallClock.getUTCSeconds() !== second ||
    mikroWallClock.getUTCMilliseconds() !== millisecond
  ) {
    throw new Error(
      'PRICE_LIST_TIER6_CUTOVER_DATE gecerli bir takvim tarihi ve saat olmali.'
    );
  }

  return { instant, mikroWallClock };
};
