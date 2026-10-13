import { BadRequestException } from '@nestjs/common';

/**
 * Shared date-bucketing helpers for trend graphs across the dealer, admin, and
 * per-listing analytics dashboards. Keeping this in one place avoids the same
 * bucketing logic drifting between call sites.
 */

/** Bucket size for a dashboard trend graph (day/week/month/year) */
export enum DashboardGranularity {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

const DEFAULT_LOOKBACK_DAYS: Record<DashboardGranularity, number> = {
  [DashboardGranularity.DAILY]: 30,
  [DashboardGranularity.WEEKLY]: 84,
  [DashboardGranularity.MONTHLY]: 365,
  [DashboardGranularity.YEARLY]: 365 * 5,
};

/**
 * Resolves the effective [start, end] window. When either bound is omitted, defaults to a
 * look-back window sized to `granularity` (30 days / 12 weeks / 12 months / 5 years) ending today.
 */
export function resolveDashboardDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
  granularity?: DashboardGranularity | string,
): { start: Date; end: Date; normalizedGranularity: DashboardGranularity } {
  const normGranularity =
    typeof granularity === 'string' &&
    Object.values(DashboardGranularity).includes(
      granularity.toLowerCase().trim() as DashboardGranularity,
    )
      ? (granularity.toLowerCase().trim() as DashboardGranularity)
      : DashboardGranularity.DAILY;

  const end = endDate ? new Date(endDate) : new Date();
  if (isNaN(end.getTime())) {
    throw new BadRequestException(`Invalid endDate: "${endDate}"`);
  }
  end.setUTCHours(23, 59, 59, 999);

  let start: Date;
  if (startDate) {
    start = new Date(startDate);
    if (isNaN(start.getTime())) {
      throw new BadRequestException(`Invalid startDate: "${startDate}"`);
    }
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start = new Date(
      end.getTime() - DEFAULT_LOOKBACK_DAYS[normGranularity] * 86_400_000,
    );
    start.setUTCHours(0, 0, 0, 0);
  }

  if (start > end) {
    throw new BadRequestException('startDate must be before endDate');
  }

  return { start, end, normalizedGranularity: normGranularity };
}

/** Returns the bucket key a given timestamp falls into for the requested granularity. */
export function getDashboardBucketKey(
  date: Date,
  granularity: DashboardGranularity,
): string {
  const d = new Date(date);
  switch (granularity) {
    case DashboardGranularity.YEARLY:
      return `${d.getUTCFullYear()}`;
    case DashboardGranularity.MONTHLY:
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    case DashboardGranularity.WEEKLY: {
      const isoDay = d.getUTCDay() || 7; // Monday=1 .. Sunday=7
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() - isoDay + 1);
      monday.setUTCHours(0, 0, 0, 0);
      return monday.toISOString().slice(0, 10);
    }
    case DashboardGranularity.DAILY:
    default:
      return d.toISOString().slice(0, 10);
  }
}

/** Builds the ordered list of bucket keys spanning [start, end] for the requested granularity. */
export function buildDashboardBucketKeys(
  start: Date,
  end: Date,
  granularity: DashboardGranularity,
): string[] {
  const MAX_BUCKETS = 400;
  const keys: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end && keys.length < MAX_BUCKETS) {
    const key = getDashboardBucketKey(cursor, granularity);
    if (keys[keys.length - 1] !== key) keys.push(key);

    switch (granularity) {
      case DashboardGranularity.YEARLY:
        cursor.setUTCFullYear(cursor.getUTCFullYear() + 1, 0, 1);
        break;
      case DashboardGranularity.MONTHLY:
        cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
        break;
      case DashboardGranularity.WEEKLY:
        cursor.setUTCDate(cursor.getUTCDate() + 7);
        break;
      case DashboardGranularity.DAILY:
      default:
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        break;
    }
  }

  return keys;
}

/** The immediately preceding window of the same length as [start, end] — used for growth-% comparisons. */
export function getPreviousPeriodRange(
  start: Date,
  end: Date,
): { start: Date; end: Date } {
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { start: prevStart, end: prevEnd };
}

/** Percentage change from `previous` to `current`, rounded to one decimal. Null when there's no baseline. */
export function computeGrowthPercent(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
