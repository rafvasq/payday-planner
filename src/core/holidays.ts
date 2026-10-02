/**
 * Payments Canada Holiday Calendar
 *
 * Hand-maintained from the official Payments Canada schedule:
 * https://www.payments.ca/resources/payment-processing-holidays
 *
 * IMPORTANT NOTES:
 * - National Day for Truth and Reconciliation (Sept 30) is a federal
 *   statutory holiday but is NOT a Payments Canada settlement holiday
 *   for 2025/2026. Bank settlements proceed normally on Sept 30.
 *   Source: Payments Canada's published holiday schedule.
 * - Civic Holiday (first Monday in August) is NOT a Payments Canada
 *   settlement holiday in most provinces but IS observed by some banks.
 *   It is excluded here to match the Payments Canada schedule.
 * - When a statutory holiday falls on a weekend, Payments Canada observes
 *   the Monday (or Friday) as listed in their schedule. The dates below
 *   reflect the actual observed dates, not the nominal dates.
 */

/**
 * Map of year -> sorted array of ISO date strings (YYYY-MM-DD) that are
 * Payments Canada non-business days (excluding weekends, which are handled
 * separately by the engine).
 */
const HOLIDAYS: Record<number, string[]> = {
  2025: [
    '2025-01-01', // New Year's Day
    '2025-02-17', // Family Day
    '2025-04-18', // Good Friday
    '2025-05-19', // Victoria Day
    '2025-07-01', // Canada Day
    '2025-09-01', // Labour Day
    '2025-10-13', // Thanksgiving
    '2025-11-11', // Remembrance Day
    '2025-12-25', // Christmas Day
    '2025-12-26', // Boxing Day
  ],
  2026: [
    '2026-01-01', // New Year's Day
    '2026-02-16', // Family Day
    '2026-04-03', // Good Friday
    '2026-05-18', // Victoria Day
    '2026-07-01', // Canada Day
    '2026-09-07', // Labour Day
    '2026-10-12', // Thanksgiving
    '2026-11-11', // Remembrance Day (Wednesday)
    '2026-12-25', // Christmas Day
    '2026-12-28', // Boxing Day (observed Monday, Dec 26 is Saturday)
  ],
  2027: [
    '2027-01-01', // New Year's Day
    '2027-02-15', // Family Day
    '2027-03-26', // Good Friday
    '2027-05-24', // Victoria Day
    '2027-07-01', // Canada Day
    '2027-09-06', // Labour Day
    '2027-10-11', // Thanksgiving
    '2027-11-11', // Remembrance Day (Thursday)
    '2027-12-27', // Christmas Day (observed Monday, Dec 25 is Saturday)
    '2027-12-28', // Boxing Day (observed Tuesday)
  ],
};

/** Set of all holiday date strings for O(1) lookup */
const HOLIDAY_SET: Set<string> = new Set(
  Object.values(HOLIDAYS).flat()
);

/** Sorted array of all covered years */
const COVERED_YEARS: number[] = Object.keys(HOLIDAYS)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * Returns true if the given ISO date string (YYYY-MM-DD) is a
 * Payments Canada non-business day (holiday). Does NOT check weekends.
 */
export function isPaymentsCanadaHoliday(dateStr: string): boolean {
  return HOLIDAY_SET.has(dateStr);
}

/**
 * Returns true if the given date (as Date object) is a non-business day:
 * either a weekend (Saturday/Sunday) or a Payments Canada holiday.
 */
export function isNonBusinessDay(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return true;
  // Format to YYYY-MM-DD for holiday lookup
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return HOLIDAY_SET.has(`${y}-${m}-${dd}`);
}

/**
 * Returns the range of years covered by the holiday calendar.
 * The engine should warn if a projection extends past this range.
 */
export function getHolidayCalendarCoverage(): { minYear: number; maxYear: number } {
  return {
    minYear: COVERED_YEARS[0],
    maxYear: COVERED_YEARS[COVERED_YEARS.length - 1],
  };
}

/**
 * Returns true if every year in the given range [startYear, endYear]
 * is covered by the holiday calendar.
 */
export function isCalendarCovered(startYear: number, endYear: number): boolean {
  for (let y = startYear; y <= endYear; y++) {
    if (!(y in HOLIDAYS)) return false;
  }
  return true;
}

/**
 * Returns the list of uncovered years in the given range.
 * Empty array means full coverage.
 */
export function getUncoveredYears(startYear: number, endYear: number): number[] {
  const uncovered: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    if (!(y in HOLIDAYS)) uncovered.push(y);
  }
  return uncovered;
}
