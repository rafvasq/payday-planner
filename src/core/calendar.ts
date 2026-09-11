import {
  addDays,
  addYears,
  format,
  getDaysInMonth,
  getDay,
  parseISO,
  isBefore,
  isAfter,
  isEqual,
} from 'date-fns';
import { Event, WeekendShift, CalendarRow } from './models';

/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * Advance a date by 1 month, capping the day to the last day of the new month.
 */
export function advanceMonth(d: Date): Date {
  let year = d.getFullYear();
  let month = d.getMonth() + 1; // 0-indexed to 1-indexed

  if (month === 12) {
    year += 1;
    month = 0;
  }
  const lastDay = getDaysInMonth(new Date(year, month, 1));
  const newDay = Math.min(d.getDate(), lastDay);
  return new Date(year, month, newDay);
}

/**
 * Advance a date by 3 months (1 quarter), capping day to month's last day.
 */
export function advanceQuarter(d: Date): Date {
  let m = d.getMonth() + 3;
  let y = d.getFullYear() + Math.floor(m / 12);
  m = m % 12;
  const lastDay = getDaysInMonth(new Date(y, m, 1));
  const newDay = Math.min(d.getDate(), lastDay);
  return new Date(y, m, newDay);
}

/**
 * Shift a date off a weekend per rule.
 * Sunday = 0, Saturday = 6 in JS getDay().
 */
export function applyWeekendShift(d: Date, rule: WeekendShift): Date {
  const day = getDay(d);
  if (rule === 'previous_business_day') {
    if (day === 6) return addDays(d, -1); // Saturday -> Friday
    if (day === 0) return addDays(d, -2); // Sunday -> Friday
  } else if (rule === 'next_business_day') {
    if (day === 6) return addDays(d, 2); // Saturday -> Monday
    if (day === 0) return addDays(d, 1); // Sunday -> Monday
  }
  return d;
}

/**
 * Add N business days (skipping Saturday and Sunday) to a date.
 */
export function addBusinessDays(d: Date, days: number): Date {
  if (days <= 0) return d;
  let cur = new Date(d.getTime());
  let added = 0;
  while (added < days) {
    cur = addDays(cur, 1);
    const day = getDay(cur);
    if (day !== 0 && day !== 6) {
      added++;
    }
  }
  return cur;
}

/**
 * Calculate all occurrence dates for an event within [startStr, endStr].
 * Strings are YYYY-MM-DD ISO format.
 */
export function getOccurrences(
  event: Event,
  startStr: string,
  endStr: string
): string[] {
  if (!event.active) return [];

  const start = parseISO(startStr);
  const end = parseISO(endStr);
  const anchor = parseISO(event.anchor_date);
  const endCap = event.end_date ? parseISO(event.end_date) : null;

  const shift = (d: Date) => applyWeekendShift(d, event.weekend_shift);

  const isValidOccurrence = (d: Date): boolean => {
    const isAfterOrEqualStart = isAfter(d, start) || isEqual(d, start);
    const isBeforeOrEqualEnd = isBefore(d, end) || isEqual(d, end);
    const isBeforeOrEqualCap = !endCap || isBefore(d, endCap) || isEqual(d, endCap);
    return isAfterOrEqualStart && isBeforeOrEqualEnd && isBeforeOrEqualCap;
  };

  if (event.frequency === 'one-time') {
    const shifted = shift(anchor);
    return isValidOccurrence(shifted) ? [formatDate(shifted)] : [];
  }

  const results: string[] = [];
  let cur = new Date(anchor.getTime());

  if (event.frequency === 'biweekly' || event.frequency === 'biweekly-offset') {
    while (isBefore(shift(cur), start)) {
      cur = addDays(cur, 14);
    }
    while (isBefore(shift(cur), end) || isEqual(shift(cur), end)) {
      const shifted = shift(cur);
      if (isValidOccurrence(shifted)) {
        results.push(formatDate(shifted));
      }
      cur = addDays(cur, 14);
    }
  } else if (event.frequency === 'weekly') {
    while (isBefore(shift(cur), start)) {
      cur = addDays(cur, 7);
    }
    while (isBefore(shift(cur), end) || isEqual(shift(cur), end)) {
      const shifted = shift(cur);
      if (isValidOccurrence(shifted)) {
        results.push(formatDate(shifted));
      }
      cur = addDays(cur, 7);
    }
  } else if (event.frequency === 'monthly') {
    while (isBefore(shift(cur), start)) {
      cur = advanceMonth(cur);
    }
    while (isBefore(shift(cur), end) || isEqual(shift(cur), end)) {
      const shifted = shift(cur);
      if (isValidOccurrence(shifted)) {
        results.push(formatDate(shifted));
      }
      cur = advanceMonth(cur);
    }
  } else if (event.frequency === 'quarterly') {
    while (isBefore(shift(cur), start)) {
      cur = advanceQuarter(cur);
    }
    while (isBefore(shift(cur), end) || isEqual(shift(cur), end)) {
      const shifted = shift(cur);
      if (isValidOccurrence(shifted)) {
        results.push(formatDate(shifted));
      }
      cur = advanceQuarter(cur);
    }
  } else if (event.frequency === 'annual') {
    while (isBefore(shift(cur), start)) {
      cur = addYears(cur, 1);
    }
    while (isBefore(shift(cur), end) || isEqual(shift(cur), end)) {
      const shifted = shift(cur);
      if (isValidOccurrence(shifted)) {
        results.push(formatDate(shifted));
      }
      cur = addYears(cur, 1);
    }
  } else if (event.frequency === 'semi-monthly') {
    // 1st & 15th (or anchor day & anchor day + 14)
    const day1 = anchor.getDate();
    const day2 = day1 > 15 ? day1 - 15 : day1 + 15;
    const sortedDays = [Math.min(day1, day2), Math.max(day1, day2)];

    let year = anchor.getFullYear();
    let month = anchor.getMonth();

    while (true) {
      for (const d of sortedDays) {
        const maxDays = getDaysInMonth(new Date(year, month, 1));
        const occDate = new Date(year, month, Math.min(d, maxDays));
        const shifted = shift(occDate);
        if (isBefore(shifted, start)) continue;
        if (isAfter(shifted, end)) return results;
        if (isValidOccurrence(shifted)) {
          results.push(formatDate(shifted));
        }
      }
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      if (new Date(year, month, 1) > end) break;
    }
  }

  return results;
}

/**
 * Return ISO date string of next occurrence of event on or after fromDateStr.
 */
export function nextOccurrence(
  event: Event,
  fromDateStr: string
): string | null {
  if (!event.active) return null;

  const fromDate = parseISO(fromDateStr);
  const anchor = parseISO(event.anchor_date);
  const endCap = event.end_date ? parseISO(event.end_date) : null;
  const shift = (d: Date) => applyWeekendShift(d, event.weekend_shift);

  let cur = new Date(anchor.getTime());

  if (event.frequency === 'one-time') {
    // anchor stays cur
  } else if (event.frequency === 'biweekly' || event.frequency === 'biweekly-offset') {
    while (isBefore(shift(cur), fromDate)) {
      cur = addDays(cur, 14);
    }
  } else if (event.frequency === 'weekly') {
    while (isBefore(shift(cur), fromDate)) {
      cur = addDays(cur, 7);
    }
  } else if (event.frequency === 'monthly') {
    while (isBefore(shift(cur), fromDate)) {
      cur = advanceMonth(cur);
    }
  } else if (event.frequency === 'quarterly') {
    while (isBefore(shift(cur), fromDate)) {
      cur = advanceQuarter(cur);
    }
  } else if (event.frequency === 'annual') {
    while (isBefore(shift(cur), fromDate)) {
      cur = addYears(cur, 1);
    }
  } else if (event.frequency === 'semi-monthly') {
    const day1 = anchor.getDate();
    const day2 = day1 > 15 ? day1 - 15 : day1 + 15;
    const sortedDays = [Math.min(day1, day2), Math.max(day1, day2)];

    let year = anchor.getFullYear();
    let month = anchor.getMonth();

    while (true) {
      for (const d of sortedDays) {
        const maxDays = getDaysInMonth(new Date(year, month, 1));
        const occDate = new Date(year, month, Math.min(d, maxDays));
        const shifted = shift(occDate);
        if (!isBefore(shifted, fromDate)) {
          if (endCap && isAfter(shifted, endCap)) return null;
          return formatDate(shifted);
        }
      }
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
  } else {
    return null;
  }

  const shifted = shift(cur);
  if (isBefore(shifted, fromDate)) return null;
  if (endCap && isAfter(shifted, endCap)) return null;
  return formatDate(shifted);
}

/**
 * Build a sorted list of calendar rows between startStr and endStr
 */
export function buildCalendar(
  events: Event[],
  startStr: string,
  endStr: string
): CalendarRow[] {
  const rows: CalendarRow[] = [];

  for (const event of events) {
    const occurrences = getOccurrences(event, startStr, endStr);
    for (const occ of occurrences) {
      rows.push({
        date: occ,
        id: event.id,
        name: event.name,
        type: event.event_type,
        amount: event.amount,
        from_account_id: event.from_account_id,
        to_account_id: event.to_account_id,
        notes: event.notes || '',
        execution: event.execution || 'auto',
        weekend_shift: event.weekend_shift || 'none',
        clearing_days: event.clearing_days || 0,
      });
    }
  }

  // Stable sort by date YYYY-MM-DD preserving insertion order for same-day events
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}
