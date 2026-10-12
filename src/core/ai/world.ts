/**
 * Unified projection engine ("One World").
 *
 * Every consumer that talks about future balances — the AI chat, its tools, the provenance
 * verifier and the in-chat charts — goes through `projectWorld`, so they all honour the same
 * rules as the Dashboard:
 *   - `balancesReflectToday` → today's scheduled events are already in the starting balances
 *   - `executedEvents`       → events the user ticked off in the Timeline are not re-applied
 *   - scenario changes       → hypothetical changes / "assumed landed" adjustments layered on top
 */
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Account, Event } from '../models';
import { DailyBalancePoint, projectBalances } from '../projection';
import { buildCalendar } from '../calendar';
import { applyChangesToBlueprint, BlueprintChange } from '../tools';

export const DEFAULT_HORIZON_DAYS = 30;

export interface PlannerWorld {
  accounts: Account[];
  events: Event[];
  executedEvents?: Record<string, boolean>;
  balancesReflectToday?: boolean;
  /** YYYY-MM-DD. Defaults to the local date. */
  today?: string;
}

/** Direct adjustment of a starting balance (used for "treat as landed" assumptions). */
export interface BalanceAdjustment {
  type: 'adjust_balance';
  account_id: string;
  delta_cents: number;
  note?: string;
}

export type ScenarioChange = BlueprintChange | BalanceAdjustment;

export const isBalanceAdjustment = (c: ScenarioChange): c is BalanceAdjustment =>
  c.type === 'adjust_balance';

/* ── Money helpers ─────────────────────────────────────────────────────────── */

export const toCents = (v: number | null | undefined): number => Math.round((v || 0) * 100);

const cadFormatter = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

/** Canonical money formatting used everywhere the AI or the UI quotes engine figures. */
export function formatCents(cents: number): string {
  return cadFormatter.format(cents / 100);
}

export const isCashAccount = (a: Pick<Account, 'type'>) => !['debt', 'liability'].includes(a.type);

export function localToday(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export const worldToday = (w: PlannerWorld) => w.today || localToday();

/* ── Scenario application ──────────────────────────────────────────────────── */

export interface EffectiveWorld extends PlannerWorld {
  /** Ids of injected one-off events; these apply even "today" when balances reflect today. */
  forceApplyEventIds: Set<string>;
}

/**
 * Layer scenario changes on top of a world. Always pass the *combined* change list
 * (assumptions + simulation changes) in one call so injected event ids never collide.
 */
export function applyScenario(
  world: PlannerWorld,
  changes: ScenarioChange[] = [],
  options: { idPrefix?: string } = {}
): EffectiveWorld {
  const adjustments = changes.filter(isBalanceAdjustment);
  const blueprintChanges = changes.filter((c) => !isBalanceAdjustment(c)) as BlueprintChange[];

  let accounts = world.accounts;
  if (adjustments.length > 0) {
    accounts = accounts.map((a) => {
      const delta = adjustments
        .filter((x) => x.account_id === a.id)
        .reduce((s, x) => s + x.delta_cents, 0);
      return delta !== 0 ? { ...a, balance: (toCents(a.balance) + delta) / 100 } : a;
    });
  }

  if (blueprintChanges.length === 0) {
    return { ...world, accounts, forceApplyEventIds: new Set() };
  }

  const { newAccounts, newEvents, executedEventsOverrides } = applyChangesToBlueprint(
    accounts,
    world.events,
    blueprintChanges,
    options
  );
  const originalIds = new Set(world.events.map((e) => e.id));
  return {
    ...world,
    accounts: newAccounts,
    events: newEvents,
    executedEvents: { ...(world.executedEvents || {}), ...executedEventsOverrides },
    forceApplyEventIds: new Set(newEvents.filter((e) => !originalIds.has(e.id)).map((e) => e.id)),
  };
}

/* ── Projection ────────────────────────────────────────────────────────────── */

export interface WorldProjection {
  start: string;
  end: string;
  points: DailyBalancePoint[];
  world: EffectiveWorld;
}

export function projectWorld(
  world: PlannerWorld,
  changes: ScenarioChange[] = [],
  days: number = DEFAULT_HORIZON_DAYS
): WorldProjection {
  const effective = applyScenario(world, changes);
  const start = worldToday(world);
  const end = format(addDays(parseISO(start), days), 'yyyy-MM-dd');
  const points = projectBalances(effective.accounts, effective.events, start, end, {
    skipTodayEvents: !!world.balancesReflectToday,
    executedEvents: effective.executedEvents,
    forceApplyEventIds: effective.forceApplyEventIds,
  });
  return { start, end, points, world: effective };
}

/* ── Outlook (watermarks) ──────────────────────────────────────────────────── */

export type AccountStatus = 'safe' | 'below_floor' | 'overdraft';

export interface AccountOutlook {
  id: string;
  name: string;
  type: Account['type'];
  floor_cents: number | null;
  start_cents: number;
  end_cents: number;
  lowest_cents: number;
  lowest_date: string;
  first_floor_breach: string | null;
  first_overdraft: string | null;
  recovery_date: string | null;
  status: AccountStatus;
}

export function summarizeOutlook(proj: WorldProjection): Record<string, AccountOutlook> {
  const out: Record<string, AccountOutlook> = {};
  for (const a of proj.world.accounts) {
    if (!isCashAccount(a)) continue;
    const floor = a.target_floor != null && a.target_floor > 0 ? toCents(a.target_floor) : null;
    const start = toCents(a.balance);
    const o: AccountOutlook = {
      id: a.id,
      name: a.name,
      type: a.type,
      floor_cents: floor,
      start_cents: start,
      end_cents: start,
      lowest_cents: Number.POSITIVE_INFINITY,
      lowest_date: proj.start,
      first_floor_breach: null,
      first_overdraft: null,
      recovery_date: null,
      status: 'safe',
    };
    let inBreach = false;
    for (const pt of proj.points) {
      const bal = toCents(pt.balances[a.id] ?? 0);
      if (bal < o.lowest_cents) {
        o.lowest_cents = bal;
        o.lowest_date = pt.date;
      }
      if (bal < 0 && !o.first_overdraft) o.first_overdraft = pt.date;
      const breached = bal < 0 || (floor !== null && bal < floor);
      if (breached && floor !== null && bal < floor && !o.first_floor_breach) o.first_floor_breach = pt.date;
      if (breached) {
        inBreach = true;
        o.recovery_date = null;
      } else if (inBreach) {
        inBreach = false;
        o.recovery_date = pt.date;
      }
      o.end_cents = bal;
    }
    if (!Number.isFinite(o.lowest_cents)) o.lowest_cents = start;
    o.status =
      o.lowest_cents < 0 ? 'overdraft' : floor !== null && o.lowest_cents < floor ? 'below_floor' : 'safe';
    out[a.id] = o;
  }
  return out;
}

const STATUS_RANK: Record<AccountStatus, number> = { safe: 0, below_floor: 1, overdraft: 2 };

export function worstStatus(statuses: AccountStatus[]): AccountStatus {
  return statuses.reduce<AccountStatus>((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), 'safe');
}

export function statusRank(s: AccountStatus) {
  return STATUS_RANK[s];
}

/* ── Schedule ──────────────────────────────────────────────────────────────── */

export type ScheduleStatus = 'upcoming' | 'done' | 'reflected_today' | 'skipped_in_scenario' | 'scenario';

export interface ScheduleRow {
  date: string;
  event_id: string;
  name: string;
  type: Event['event_type'];
  amount_cents: number;
  from_account_id: string | null;
  to_account_id: string | null;
  status: ScheduleStatus;
  /** End-of-day balances (cents) of the accounts this event touches. */
  balances_after: Record<string, number>;
}

export function buildSchedule(
  world: PlannerWorld,
  changes: ScenarioChange[],
  from: string,
  to: string,
  accountId?: string | null
): ScheduleRow[] {
  const today = worldToday(world);
  const horizon = Math.max(0, differenceInCalendarDays(parseISO(to), parseISO(today)));
  const proj = projectWorld(world, changes, horizon);
  const pointByDate = new Map(proj.points.map((p) => [p.date, p]));
  const eff = proj.world;
  const userExecuted = world.executedEvents || {};

  return buildCalendar(eff.events, from, to)
    .filter((r) => !accountId || r.from_account_id === accountId || r.to_account_id === accountId)
    .map((r) => {
      const key = `${r.date}_${r.id}`;
      let status: ScheduleStatus = 'upcoming';
      if (eff.forceApplyEventIds.has(r.id)) status = 'scenario';
      else if (userExecuted[key]) status = 'done';
      else if (eff.executedEvents?.[key]) status = 'skipped_in_scenario';
      else if (world.balancesReflectToday && r.date === today) status = 'reflected_today';

      const pt = pointByDate.get(r.date);
      const balances_after: Record<string, number> = {};
      for (const id of [r.from_account_id, r.to_account_id]) {
        if (id && pt && pt.balances[id] !== undefined) balances_after[id] = toCents(pt.balances[id]);
      }
      return {
        date: r.date,
        event_id: r.id,
        name: r.name,
        type: r.type,
        amount_cents: toCents(r.amount),
        from_account_id: r.from_account_id,
        to_account_id: r.to_account_id,
        status,
        balances_after,
      };
    });
}

/* ── Snapshot identity ─────────────────────────────────────────────────────── */

/** Short stable hash of everything that influences a projection. */
export function snapshotId(world: PlannerWorld, changes: ScenarioChange[] = []): string {
  const payload = JSON.stringify({
    a: world.accounts.map((a) => [a.id, a.balance, a.target_floor ?? null, a.type]),
    e: world.events,
    x: Object.keys(world.executedEvents || {})
      .filter((k) => world.executedEvents![k])
      .sort(),
    r: !!world.balancesReflectToday,
    t: worldToday(world),
    c: changes,
  });
  let h = 5381;
  for (let i = 0; i < payload.length; i++) h = ((h << 5) + h + payload.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}
