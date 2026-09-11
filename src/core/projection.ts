import { addDays, parseISO, isAfter } from 'date-fns';
import { Account, Event } from './models';
import { buildCalendar, formatDate, addBusinessDays } from './calendar';

export interface DailyBalancePoint {
  date: string; // YYYY-MM-DD
  balances: Record<string, number>;
  netWorth: number;
  liquidAssets: number;
  realEstateEquity: number;
  totalDebt: number;
  alerts: {
    accountId: string;
    accountName: string;
    type: 'negative' | 'below_floor';
    balance: number;
    threshold: number;
  }[];
}

export interface AlertEpisode {
  accountId: string;
  accountName: string;
  type: 'negative' | 'below_floor';
  startDate: string;
  endDate: string;
  minBalance: number;
  threshold: number;
  durationDays: number;
}

export function groupAlertEpisodes(projectionData: DailyBalancePoint[]): AlertEpisode[] {
  const activeEpisodes = new Map<string, AlertEpisode>();
  const completedEpisodes: AlertEpisode[] = [];

  for (const point of projectionData) {
    const currentAlertKeys = new Set<string>();

    for (const alert of point.alerts) {
      const key = `${alert.accountId}:${alert.type}`;
      currentAlertKeys.add(key);

      const existing = activeEpisodes.get(key);
      if (existing) {
        existing.endDate = point.date;
        existing.minBalance = Math.min(existing.minBalance, alert.balance);
        existing.durationDays += 1;
      } else {
        activeEpisodes.set(key, {
          accountId: alert.accountId,
          accountName: alert.accountName,
          type: alert.type,
          startDate: point.date,
          endDate: point.date,
          minBalance: alert.balance,
          threshold: alert.threshold,
          durationDays: 1,
        });
      }
    }

    for (const [key, episode] of Array.from(activeEpisodes.entries())) {
      if (!currentAlertKeys.has(key)) {
        completedEpisodes.push(episode);
        activeEpisodes.delete(key);
      }
    }
  }

  for (const episode of Array.from(activeEpisodes.values())) {
    completedEpisodes.push(episode);
  }

  return completedEpisodes;
}

export interface ProjectBalancesOptions {
  skipTodayEvents?: boolean;
  executedEvents?: Record<string, boolean>;
}

export function projectBalances(
  accounts: Account[],
  events: Event[],
  startStr: string,
  endStr: string,
  options: ProjectBalancesOptions = {}
): DailyBalancePoint[] {
  const balances: Record<string, number> = {};
  const acctMap: Record<string, Account> = {};

  for (const a of accounts) {
    balances[a.id] = a.balance;
    acctMap[a.id] = a;
  }

  const calendarRows = buildCalendar(events, startStr, endStr);
  const calendarByDate: Record<string, typeof calendarRows> = {};

  for (const row of calendarRows) {
    if (!calendarByDate[row.date]) {
      calendarByDate[row.date] = [];
    }
    calendarByDate[row.date].push(row);
  }

  const pendingCredits: Record<string, { tid: string; amt: number }[]> = {};
  const resultPoints: DailyBalancePoint[] = [];

  let curDate = parseISO(startStr);
  const endDate = parseISO(endStr);

  const assetIds = accounts
    .filter((a) => ['chequing', 'savings', 'investment'].includes(a.type))
    .map((a) => a.id);
  const debtIds = accounts
    .filter((a) => a.type === 'debt')
    .map((a) => a.id);
  const reIds = accounts
    .filter((a) => a.type === 'liability' && (a.market_value || 0) > 0)
    .map((a) => a.id);
  const nakedLiabIds = accounts
    .filter((a) => a.type === 'liability' && (a.market_value || 0) === 0)
    .map((a) => a.id);
  const reMarketSum = accounts
    .filter((a) => a.type === 'liability' && (a.market_value || 0) > 0)
    .reduce((sum, a) => sum + (a.market_value || 0), 0);

  while (!isAfter(curDate, endDate)) {
    const dtStr = formatDate(curDate);

    // Apply pending credits clearing on dtStr
    if (pendingCredits[dtStr]) {
      for (const item of pendingCredits[dtStr]) {
        if (item.tid && item.tid in balances) {
          const dest = acctMap[item.tid];
          if (dest && ['debt', 'liability'].includes(dest.type)) {
            balances[item.tid] -= item.amt;
          } else {
            balances[item.tid] += item.amt;
          }
        }
      }
    }

    // Apply events occurring on dtStr
    const isToday = dtStr === startStr;
    const todaysEvents = calendarByDate[dtStr] || [];
    for (const ev of todaysEvents) {
      if (isToday && options.skipTodayEvents) {
        continue;
      }
      const execKey = `${dtStr}_${ev.id}`;
      if (options.executedEvents && options.executedEvents[execKey]) {
        continue;
      }

      const amt = ev.amount;
      const fid = ev.from_account_id;
      const tid = ev.to_account_id;

      if (ev.type === 'inflow') {
        if (tid && tid in balances) {
          balances[tid] += amt;
        }
      } else if (ev.type === 'outflow') {
        if (fid && fid in balances) {
          const src = acctMap[fid];
          if (src && ['debt', 'liability'].includes(src.type)) {
            balances[fid] += amt; // Outflow charged to credit card/debt increases what is owed
          } else {
            balances[fid] -= amt;
          }
        }
      } else if (ev.type === 'transfer') {
        // Immediate debit from source account
        if (fid && fid in balances) {
          const src = acctMap[fid];
          if (src && ['debt', 'liability'].includes(src.type)) {
            balances[fid] += amt;
          } else {
            balances[fid] -= amt;
          }
        }

        // Credit to destination account (immediate or delayed)
        if (tid) {
          if (ev.clearing_days && ev.clearing_days > 0) {
            const settleDate = formatDate(addBusinessDays(curDate, ev.clearing_days));
            if (!pendingCredits[settleDate]) {
              pendingCredits[settleDate] = [];
            }
            pendingCredits[settleDate].push({ tid, amt });
          } else if (tid in balances) {
            const dest = acctMap[tid];
            if (dest && ['debt', 'liability'].includes(dest.type)) {
              balances[tid] -= amt;
            } else {
              balances[tid] += amt;
            }
          }
        }
      }
    }

    // Compute Net Worth metrics
    const liquidAssets = assetIds.reduce(
      (sum, id) => sum + (balances[id] || 0),
      0
    );
    const debtSum = debtIds.reduce((sum, id) => sum + (balances[id] || 0), 0);
    const reOwed = reIds.reduce((sum, id) => sum + (balances[id] || 0), 0);
    const nakedLiab = nakedLiabIds.reduce(
      (sum, id) => sum + (balances[id] || 0),
      0
    );

    const reEquity = reMarketSum - reOwed;
    const netWorth = liquidAssets + reEquity - nakedLiab - debtSum;

    // Evaluate low-balance alerts
    const alerts: DailyBalancePoint['alerts'] = [];
    for (const a of accounts) {
      // Debt and liability balances represent money owed, not asset cash
      if (['debt', 'liability'].includes(a.type)) continue;

      const bal = balances[a.id] || 0;
      if (bal < 0) {
        alerts.push({
          accountId: a.id,
          accountName: a.name,
          type: 'negative',
          balance: bal,
          threshold: 0,
        });
      } else if (
        a.target_floor !== null &&
        a.target_floor !== undefined &&
        bal < a.target_floor
      ) {
        alerts.push({
          accountId: a.id,
          accountName: a.name,
          type: 'below_floor',
          balance: bal,
          threshold: a.target_floor,
        });
      }
    }

    resultPoints.push({
      date: dtStr,
      balances: { ...balances },
      netWorth,
      liquidAssets,
      realEstateEquity: reEquity,
      totalDebt: debtSum,
      alerts,
    });

    curDate = addDays(curDate, 1);
  }

  return resultPoints;
}
