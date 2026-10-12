/**
 * AI tool suite (single source of truth).
 *
 * The JSON schemas here are sent to the backend with every chat request, and the executor runs
 * entirely client-side against the unified engine (`world.ts`). Every money figure a tool
 * produces is registered as a `FigureSource` so the provenance verifier can trace numbers in
 * the assistant's prose back to the exact engine output they came from.
 */
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Account, Event } from '../models';
import { BlueprintChange, BlueprintChangeSchema } from '../tools';
import {
  AccountOutlook,
  AccountStatus,
  BalanceAdjustment,
  DEFAULT_HORIZON_DAYS,
  PlannerWorld,
  ScenarioChange,
  ScheduleRow,
  applyScenario,
  buildSchedule,
  formatCents,
  isCashAccount,
  projectWorld,
  snapshotId,
  statusRank,
  summarizeOutlook,
  toCents,
  worldToday,
  worstStatus,
} from './world';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type ToolName =
  | 'get_snapshot'
  | 'get_schedule'
  | 'simulate'
  | 'propose_blueprint_changes'
  | 'record_actual';

/** Tools that only read state: rendered as compact steps, never as big cards. */
export const READ_TOOLS = new Set<string>(['get_snapshot', 'get_schedule']);
/** Tools that hand control back to the user: the agent loop stops after them. */
export const AWAIT_USER_TOOLS = new Set<string>(['propose_blueprint_changes', 'record_actual']);

export interface FigureSource {
  cents: number;
  label: string;
}

export interface SimAccountRow {
  id: string;
  name: string;
  before: AccountOutlook;
  after: AccountOutlook;
  changed: boolean;
}

export interface SimulationView {
  label: string;
  verdict_before: AccountStatus;
  verdict_after: AccountStatus;
  accounts: SimAccountRow[];
  change_descriptions: string[];
  assumptions: string[];
  horizon_days: number;
}

export interface ScheduleView {
  from: string;
  to: string;
  account_id: string | null;
  rows: ScheduleRow[];
}

export interface SnapshotView {
  as_of: string;
  snapshot_id: string;
  outlook: AccountOutlook[];
  overall: AccountStatus;
}

export interface ActualTransaction {
  from_account_id?: string | null;
  to_account_id?: string | null;
  amount_cents: number;
  date?: string;
}

export interface ActualView {
  description: string;
  transactions: ActualTransaction[];
  transaction_descriptions: string[];
  adjustments: BalanceAdjustment[];
  accounts: { id: string; name: string; before_cents: number; after_cents: number }[];
  risks: string[];
}

export interface ToolExecution {
  name: string;
  ok: boolean;
  error?: string;
  /** One-line, human description of what the tool did (used in the step trace). */
  summary: string;
  /** JSON payload returned to the LLM. */
  result: any;
  /** Engine figures produced by this call. */
  sources: FigureSource[];
  label?: string;
  changes?: BlueprintChange[];
  simulation?: SimulationView;
  schedule?: ScheduleView;
  snapshot?: SnapshotView;
  actual?: ActualView;
  awaitsUser?: boolean;
  snapshot_id?: string;
}

export interface ToolContext {
  world: PlannerWorld;
  /** Enabled scenario-tray changes (assumptions) layered under every tool call. */
  assumptions: ScenarioChange[];
  assumptionLabels: string[];
  days?: number;
}

/* ── JSON schemas sent to the LLM ──────────────────────────────────────────── */

const dateProp = { type: 'string', description: 'YYYY-MM-DD, today or later' };

const changeItemSchema = {
  anyOf: [
    {
      type: 'object',
      description: 'Skip a single occurrence of a recurring event.',
      properties: {
        type: { type: 'string', enum: ['skip_event'] },
        event_id: { type: 'string' },
        date: dateProp,
      },
      required: ['type', 'event_id', 'date'],
    },
    {
      type: 'object',
      description: 'Skip every occurrence of an event between two dates (inclusive).',
      properties: {
        type: { type: 'string', enum: ['pause_event'] },
        event_id: { type: 'string' },
        from_date: dateProp,
        to_date: dateProp,
      },
      required: ['type', 'event_id', 'from_date', 'to_date'],
    },
    {
      type: 'object',
      description: 'Move one occurrence of an event to another date.',
      properties: {
        type: { type: 'string', enum: ['move_event'] },
        event_id: { type: 'string' },
        from_date: dateProp,
        to_date: dateProp,
      },
      required: ['type', 'event_id', 'from_date', 'to_date'],
    },
    {
      type: 'object',
      description: 'Change the amount of an event (all occurrences).',
      properties: {
        type: { type: 'string', enum: ['set_amount'] },
        event_id: { type: 'string' },
        amount_cents: { type: 'integer' },
      },
      required: ['type', 'event_id', 'amount_cents'],
    },
    {
      type: 'object',
      description: 'One-off payment toward a credit card / debt account.',
      properties: {
        type: { type: 'string', enum: ['pay_debt'] },
        card_id: { type: 'string' },
        from_account_id: { type: 'string' },
        amount_cents: { type: 'integer' },
        date: dateProp,
        name: { type: 'string' },
      },
      required: ['type', 'card_id', 'from_account_id', 'amount_cents', 'date'],
    },
    {
      type: 'object',
      description:
        'A future one-off transfer (with to_account_id) or expense (without). Not for things that already happened — use record_actual for those.',
      properties: {
        type: { type: 'string', enum: ['add_one_time'] },
        from_account_id: { type: 'string' },
        to_account_id: { type: 'string' },
        amount_cents: { type: 'integer' },
        date: dateProp,
        name: { type: 'string' },
      },
      required: ['type', 'from_account_id', 'amount_cents', 'date'],
    },
  ],
};

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_snapshot',
      description:
        'Read the current state from the projection engine: every account balance, floor, headroom, and the 30-day outlook (lowest balance and date, first floor breach, first overdraft, recovery). Includes any active scenario assumptions. Call this instead of computing balances yourself.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_schedule',
      description:
        'List dated cash moves between two dates (default: today to 7 days out), expanded from the recurring rules by the engine, with each event\'s status and the end-of-day balance of the accounts it touches. Use for "what\'s coming up / this week / before payday" questions. Never expand recurrences yourself.',
      parameters: {
        type: 'object',
        properties: {
          from_date: dateProp,
          to_date: { type: 'string', description: 'YYYY-MM-DD, at most 62 days out' },
          account_id: { type: 'string', description: 'Optional: only events touching this account' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'simulate',
      description:
        'Sandbox: test hypothetical future changes and get engine-computed before/after outlooks per account. Nothing is saved. Must contain at least one change. Give the scenario a short human label.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Short scenario name, e.g. "Skip vault sweeps Oct 15"' },
          changes: { type: 'array', minItems: 1, items: changeItemSchema },
        },
        required: ['label', 'changes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_blueprint_changes',
      description:
        'Propose a finalized set of plan changes. The user sees a review card with Apply / Reject. Only after you have simulated them in an earlier turn. Ends your turn.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          changes: { type: 'array', minItems: 1, items: changeItemSchema },
        },
        required: ['label', 'changes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_actual',
      description:
        'Use when the user says a transaction ALREADY happened (a transfer made, bill paid, deposit received). Shows the user a card asking whether to update saved balances, treat it as landed for this conversation only, or note it is already in their balances. Never assume which; ends your turn.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Short human description, e.g. "Transfer R Chequing → EQ Hub"' },
          transactions: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                from_account_id: { type: 'string', description: 'Account money left (omit for deposits)' },
                to_account_id: { type: 'string', description: 'Account money arrived in (omit for expenses)' },
                amount_cents: { type: 'integer' },
                date: { type: 'string', description: 'YYYY-MM-DD when it happened (today or earlier)' },
              },
              required: ['amount_cents'],
            },
          },
        },
        required: ['description', 'transactions'],
      },
    },
  },
];

/* ── Human descriptions ────────────────────────────────────────────────────── */

const prettyDate = (d?: string | null) => {
  if (!d) return '';
  try {
    return format(parseISO(d), 'EEE MMM d');
  } catch {
    return d;
  }
};

export { prettyDate };

export function describeChange(c: ScenarioChange, accounts: Account[], events: Event[]): string {
  const acc = (id?: string | null) => (id ? accounts.find((a) => a.id === id)?.name || id : '');
  const ev = (id: string) => events.find((e) => e.id === id)?.name || id;
  switch (c.type) {
    case 'skip_event':
      return `Skip "${ev(c.event_id)}" on ${prettyDate(c.date)}`;
    case 'pause_event':
      return `Pause "${ev(c.event_id)}" ${prettyDate(c.from_date)} – ${prettyDate(c.to_date)}`;
    case 'move_event':
      return `Move "${ev(c.event_id)}" from ${prettyDate(c.from_date)} to ${prettyDate(c.to_date)}`;
    case 'set_amount':
      return `Set "${ev(c.event_id)}" to ${formatCents(c.amount_cents)}`;
    case 'pay_debt':
      return `Pay ${formatCents(c.amount_cents)} to ${acc(c.card_id)} from ${acc(c.from_account_id)} on ${prettyDate(c.date)}`;
    case 'add_one_time':
      return c.to_account_id
        ? `Transfer ${formatCents(c.amount_cents)} ${acc(c.from_account_id)} → ${acc(c.to_account_id)} on ${prettyDate(c.date)}`
        : `One-off ${formatCents(c.amount_cents)} expense from ${acc(c.from_account_id)} on ${prettyDate(c.date)}`;
    case 'adjust_balance':
      return `${acc(c.account_id)} ${c.delta_cents >= 0 ? '+' : '−'}${formatCents(Math.abs(c.delta_cents))}${c.note ? ` (${c.note})` : ''}`;
    default:
      return (c as any).type;
  }
}

export function describeTransaction(t: ActualTransaction, accounts: Account[]): string {
  const acc = (id?: string | null) => (id ? accounts.find((a) => a.id === id)?.name || id : '');
  const when = t.date ? ` on ${prettyDate(t.date)}` : '';
  if (t.from_account_id && t.to_account_id)
    return `${formatCents(t.amount_cents)} ${acc(t.from_account_id)} → ${acc(t.to_account_id)}${when}`;
  if (t.from_account_id) return `${formatCents(t.amount_cents)} out of ${acc(t.from_account_id)}${when}`;
  return `${formatCents(t.amount_cents)} into ${acc(t.to_account_id)}${when}`;
}

/* ── Validation ────────────────────────────────────────────────────────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ToolValidationError extends Error {}

export function validateChanges(raw: unknown, world: PlannerWorld): BlueprintChange[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ToolValidationError(
      'No changes provided. To read the current state use get_snapshot or get_schedule; simulate needs at least one change.'
    );
  }
  const today = worldToday(world);
  const problems: string[] = [];
  const out: BlueprintChange[] = [];
  const accountIds = new Set(world.accounts.map((a) => a.id));
  const eventIds = new Set(world.events.map((e) => e.id));

  raw.forEach((item, i) => {
    const n = `Change ${i + 1}`;
    const parsed = BlueprintChangeSchema.safeParse(item);
    if (!parsed.success) {
      problems.push(`${n} (${(item as any)?.type ?? 'unknown type'}) is malformed: ${parsed.error.issues.map((x) => `${x.path.join('.') || 'value'} ${x.message}`).join(', ')}`);
      return;
    }
    const c = parsed.data;
    if ('event_id' in c && !eventIds.has(c.event_id)) problems.push(`${n}: unknown event_id "${c.event_id}"`);
    for (const key of ['date', 'from_date', 'to_date'] as const) {
      const v = (c as any)[key];
      if (v === undefined) continue;
      if (!DATE_RE.test(v)) problems.push(`${n}: ${key} must be YYYY-MM-DD (got "${v}")`);
      else if (v < today) problems.push(`${n}: ${key} ${v} is in the past (today is ${today}). For things that already happened use record_actual.`);
    }
    if (c.type === 'pause_event' && c.from_date > c.to_date) problems.push(`${n}: from_date is after to_date`);
    if ('amount_cents' in c && c.amount_cents <= 0 && c.type !== 'set_amount') problems.push(`${n}: amount_cents must be positive`);
    if (c.type === 'set_amount' && c.amount_cents < 0) problems.push(`${n}: amount_cents cannot be negative`);
    if ('from_account_id' in c && !accountIds.has(c.from_account_id)) problems.push(`${n}: unknown from_account_id "${c.from_account_id}"`);
    if (c.type === 'add_one_time' && c.to_account_id && !accountIds.has(c.to_account_id)) problems.push(`${n}: unknown to_account_id "${c.to_account_id}"`);
    if (c.type === 'pay_debt') {
      const card = world.accounts.find((a) => a.id === c.card_id);
      if (!card) problems.push(`${n}: unknown card_id "${c.card_id}"`);
      else if (c.amount_cents > toCents(card.balance))
        problems.push(`${n}: payment ${formatCents(c.amount_cents)} exceeds ${card.name} balance ${formatCents(toCents(card.balance))}`);
    }
    out.push(c);
  });

  if (problems.length) throw new ToolValidationError(problems.join('; '));
  return out;
}

function validateTransactions(raw: unknown, world: PlannerWorld): ActualTransaction[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new ToolValidationError('record_actual needs at least one transaction');
  const today = worldToday(world);
  const ids = new Set(world.accounts.map((a) => a.id));
  const problems: string[] = [];
  const out: ActualTransaction[] = [];
  raw.forEach((t: any, i) => {
    const n = `Transaction ${i + 1}`;
    if (!t || typeof t !== 'object') return problems.push(`${n} is malformed`);
    const amt = Number(t.amount_cents);
    if (!Number.isInteger(amt) || amt <= 0) problems.push(`${n}: amount_cents must be a positive integer`);
    const from = t.from_account_id || null;
    const to = t.to_account_id || null;
    if (!from && !to) problems.push(`${n}: needs from_account_id and/or to_account_id`);
    if (from && !ids.has(from)) problems.push(`${n}: unknown from_account_id "${from}"`);
    if (to && !ids.has(to)) problems.push(`${n}: unknown to_account_id "${to}"`);
    if (t.date && (!DATE_RE.test(t.date) || t.date > today)) problems.push(`${n}: date must be YYYY-MM-DD and not in the future (for future moves use simulate)`);
    out.push({ from_account_id: from, to_account_id: to, amount_cents: amt, date: t.date || today });
  });
  if (problems.length) throw new ToolValidationError(problems.join('; '));
  return out;
}

/** Converts actual transactions into starting-balance adjustments (sign-aware for debts). */
export function transactionsToAdjustments(txs: ActualTransaction[], accounts: Account[], note?: string): BalanceAdjustment[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const adj: BalanceAdjustment[] = [];
  for (const t of txs) {
    if (t.from_account_id) {
      const a = byId.get(t.from_account_id);
      const isDebt = a ? !isCashAccount(a) : false;
      adj.push({ type: 'adjust_balance', account_id: t.from_account_id, delta_cents: isDebt ? t.amount_cents : -t.amount_cents, note });
    }
    if (t.to_account_id) {
      const a = byId.get(t.to_account_id);
      const isDebt = a ? !isCashAccount(a) : false;
      adj.push({ type: 'adjust_balance', account_id: t.to_account_id, delta_cents: isDebt ? -t.amount_cents : t.amount_cents, note });
    }
  }
  return adj;
}

/* ── Output helpers ────────────────────────────────────────────────────────── */

const STATUS_TEXT: Record<AccountStatus, string> = {
  safe: 'safe',
  below_floor: 'dips below floor',
  overdraft: 'OVERDRAFT (below $0)',
};
export const statusText = (s: AccountStatus) => STATUS_TEXT[s];

function outlookToLlm(o: AccountOutlook) {
  return {
    status: STATUS_TEXT[o.status],
    lowest: formatCents(o.lowest_cents),
    lowest_date: o.lowest_date,
    end_balance: formatCents(o.end_cents),
    first_floor_breach: o.first_floor_breach,
    first_overdraft: o.first_overdraft,
    recovery_date: o.recovery_date,
  };
}

function outlookSources(o: AccountOutlook, suffix: string): FigureSource[] {
  const s: FigureSource[] = [
    { cents: o.start_cents, label: `${o.name} · balance now${suffix}` },
    { cents: o.lowest_cents, label: `${o.name} · lowest balance (${prettyDate(o.lowest_date)})${suffix}` },
    { cents: o.end_cents, label: `${o.name} · balance at end of horizon${suffix}` },
  ];
  if (o.floor_cents !== null) {
    s.push({ cents: o.floor_cents, label: `${o.name} · target floor` });
    s.push({ cents: o.start_cents - o.floor_cents, label: `${o.name} · headroom above floor now${suffix}` });
    s.push({ cents: o.lowest_cents - o.floor_cents, label: `${o.name} · shortfall/headroom vs floor at lowest${suffix}` });
  }
  return s;
}

/* ── Executor ──────────────────────────────────────────────────────────────── */

export function executeTool(name: string, rawArgs: string | Record<string, unknown>, ctx: ToolContext): ToolExecution {
  let args: any = {};
  try {
    args = typeof rawArgs === 'string' ? (rawArgs.trim() ? JSON.parse(rawArgs) : {}) : rawArgs || {};
  } catch {
    return fail(name, 'Arguments were not valid JSON.');
  }
  try {
    switch (name) {
      case 'get_snapshot':
        return runSnapshot(ctx);
      case 'get_schedule':
        return runSchedule(args, ctx);
      case 'simulate':
        return runSimulate(args, ctx, false);
      case 'propose_blueprint_changes':
        return runSimulate(args, ctx, true);
      case 'record_actual':
        return runRecordActual(args, ctx);
      default:
        return fail(name, `Unknown tool "${name}". Available: get_snapshot, get_schedule, simulate, propose_blueprint_changes, record_actual.`);
    }
  } catch (e: any) {
    return fail(name, e instanceof ToolValidationError ? e.message : `Tool failed: ${e?.message || e}`);
  }
}

function fail(name: string, error: string): ToolExecution {
  return {
    name,
    ok: false,
    error,
    summary: `${name} failed`,
    result: { error },
    sources: [],
  };
}

function runSnapshot(ctx: ToolContext): ToolExecution {
  const days = ctx.days ?? DEFAULT_HORIZON_DAYS;
  const proj = projectWorld(ctx.world, ctx.assumptions, days);
  const outlook = Object.values(summarizeOutlook(proj));
  const overall = worstStatus(outlook.map((o) => o.status));
  const sid = snapshotId(ctx.world, ctx.assumptions);
  const suffix = ctx.assumptionLabels.length ? ' · with scenario assumptions' : '';
  const sources = outlook.flatMap((o) => outlookSources(o, suffix));
  const debts = proj.world.accounts.filter((a) => !isCashAccount(a));
  debts.forEach((d) => sources.push({ cents: toCents(d.balance), label: `${d.name} · balance owed` }));

  const appliedPlanSkips: string[] = [];
  const eventsMap = new Map(ctx.world.events.map((e) => [e.id, e.name]));
  const userExec = ctx.world.executedEvents || {};
  for (const [key, val] of Object.entries(userExec)) {
    if (!val) continue;
    const underscoreIdx = key.indexOf('_');
    if (underscoreIdx > 0) {
      const dt = key.slice(0, underscoreIdx);
      const eid = key.slice(underscoreIdx + 1);
      const name = eventsMap.get(eid) || eid;
      appliedPlanSkips.push(`${dt}: ${name} (skipped/executed in plan)`);
    } else {
      appliedPlanSkips.push(key);
    }
  }

  return {
    name: 'get_snapshot',
    ok: true,
    summary: `Read plan snapshot (${outlook.length} accounts, ${days}-day outlook)`,
    snapshot_id: sid,
    snapshot: { as_of: proj.start, snapshot_id: sid, outlook, overall },
    sources,
    result: {
      as_of: proj.start,
      snapshot_id: sid,
      horizon_days: days,
      balances_reflect_today: !!ctx.world.balancesReflectToday,
      applied_plan_skips: appliedPlanSkips,
      active_assumptions: ctx.assumptionLabels,
      overall_status: STATUS_TEXT[overall],
      accounts: outlook.map((o) => ({
        account_id: o.id,
        name: o.name,
        type: o.type,
        balance: formatCents(o.start_cents),
        floor: o.floor_cents !== null ? formatCents(o.floor_cents) : null,
        headroom: o.floor_cents !== null ? formatCents(o.start_cents - o.floor_cents) : null,
        ...outlookToLlm(o),
      })),
      debts: debts.map((d) => ({ account_id: d.id, name: d.name, type: d.type, balance_owed: formatCents(toCents(d.balance)) })),
    },
  };
}

function runSchedule(args: any, ctx: ToolContext): ToolExecution {
  const today = worldToday(ctx.world);
  let from: string = typeof args.from_date === 'string' && DATE_RE.test(args.from_date) ? args.from_date : today;
  if (from < today) from = today;
  let to: string =
    typeof args.to_date === 'string' && DATE_RE.test(args.to_date)
      ? args.to_date
      : format(addDays(parseISO(from), 7), 'yyyy-MM-dd');
  const maxTo = format(addDays(parseISO(today), 62), 'yyyy-MM-dd');
  if (to > maxTo) to = maxTo;
  if (to < from) to = from;
  const accountId: string | null = args.account_id || null;
  if (accountId && !ctx.world.accounts.some((a) => a.id === accountId)) {
    throw new ToolValidationError(`Unknown account_id "${accountId}"`);
  }

  const eff = applyScenario(ctx.world, ctx.assumptions);
  const rows = buildSchedule(ctx.world, ctx.assumptions, from, to, accountId);
  const accName = (id: string | null) => (id ? eff.accounts.find((a) => a.id === id)?.name || id : null);

  const sources: FigureSource[] = [];
  for (const r of rows) {
    sources.push({ cents: r.amount_cents, label: `${r.name} · ${prettyDate(r.date)}` });
    for (const [id, cents] of Object.entries(r.balances_after)) {
      sources.push({ cents, label: `${accName(id)} · end of ${prettyDate(r.date)}` });
    }
  }

  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  return {
    name: 'get_schedule',
    ok: true,
    summary: `Checked schedule ${prettyDate(from)} – ${prettyDate(to)}${accountId ? ` for ${accName(accountId)}` : ''} (${rows.length} event${rows.length === 1 ? '' : 's'})`,
    schedule: { from, to, account_id: accountId, rows },
    sources,
    result: {
      from,
      to,
      days,
      account: accountId ? accName(accountId) : 'all accounts',
      active_assumptions: ctx.assumptionLabels,
      events: rows.map((r) => ({
        date: r.date,
        event_id: r.event_id,
        name: r.name,
        type: r.type,
        amount: formatCents(r.amount_cents),
        amount_cents: r.amount_cents,
        from: accName(r.from_account_id),
        to: accName(r.to_account_id),
        status: r.status,
        balances_after: Object.fromEntries(Object.entries(r.balances_after).map(([id, c]) => [accName(id) as string, formatCents(c)])),
      })),
      status_legend: {
        upcoming: 'will be applied by the engine',
        done: 'user marked it done; already in balances',
        reflected_today: "today's event; balances already reflect it",
        skipped_in_scenario: 'skipped by an active assumption',
        scenario: 'injected by an active assumption',
      },
    },
  };
}

function runSimulate(args: any, ctx: ToolContext, isProposal: boolean): ToolExecution {
  const name = isProposal ? 'propose_blueprint_changes' : 'simulate';
  const changes = validateChanges(args.changes, ctx.world);
  const days = ctx.days ?? DEFAULT_HORIZON_DAYS;
  const label = typeof args.label === 'string' && args.label.trim() ? args.label.trim() : isProposal ? 'Proposed changes' : 'Scenario';

  const before = summarizeOutlook(projectWorld(ctx.world, ctx.assumptions, days));
  const after = summarizeOutlook(projectWorld(ctx.world, [...ctx.assumptions, ...changes], days));
  const effAccounts = applyScenario(ctx.world, ctx.assumptions).accounts;
  const descriptions = changes.map((c) => describeChange(c, effAccounts, ctx.world.events));

  const rows: SimAccountRow[] = Object.keys(before).map((id) => {
    const b = before[id];
    const a = after[id];
    const changed =
      b.lowest_cents !== a.lowest_cents ||
      b.end_cents !== a.end_cents ||
      b.first_floor_breach !== a.first_floor_breach ||
      b.first_overdraft !== a.first_overdraft;
    return { id, name: b.name, before: b, after: a, changed };
  });

  const verdictBefore = worstStatus(Object.values(before).map((o) => o.status));
  const verdictAfter = worstStatus(Object.values(after).map((o) => o.status));

  const sources: FigureSource[] = [];
  for (const r of rows.filter((x) => x.changed)) {
    sources.push(...outlookSources(r.before, ' · before'));
    sources.push(...outlookSources(r.after, ` · after "${label}"`));
    sources.push({ cents: r.after.lowest_cents - r.before.lowest_cents, label: `${r.name} · change in lowest balance ("${label}")` });
    sources.push({ cents: r.after.end_cents - r.before.end_cents, label: `${r.name} · change in ending balance ("${label}")` });
  }
  changes.forEach((c, i) => {
    if ('amount_cents' in c) sources.push({ cents: c.amount_cents, label: descriptions[i] });
  });

  const changedRows = rows.filter((r) => r.changed);
  const worsened = changedRows.filter((r) => statusRank(r.after.status) > statusRank(r.before.status));

  return {
    name,
    ok: true,
    label,
    changes,
    awaitsUser: isProposal,
    summary: `${isProposal ? 'Proposed' : 'Simulated'} "${label}" — ${descriptions.join('; ')}`,
    simulation: {
      label,
      verdict_before: verdictBefore,
      verdict_after: verdictAfter,
      accounts: rows,
      change_descriptions: descriptions,
      assumptions: ctx.assumptionLabels,
      horizon_days: days,
    },
    sources,
    result: {
      ...(isProposal ? { status: 'shown_to_user_for_review', message: 'The user now sees Apply / Reject. Do not call more tools this turn.' } : {}),
      label,
      horizon_days: days,
      active_assumptions: ctx.assumptionLabels,
      changes: descriptions,
      verdict_before: STATUS_TEXT[verdictBefore],
      verdict_after: STATUS_TEXT[verdictAfter],
      accounts_changed: changedRows.map((r) => ({
        account_id: r.id,
        account: r.name,
        floor: r.after.floor_cents !== null ? formatCents(r.after.floor_cents) : null,
        before: outlookToLlm(r.before),
        after: outlookToLlm(r.after),
        change_in_lowest: formatCents(r.after.lowest_cents - r.before.lowest_cents),
      })),
      accounts_unchanged: rows.filter((r) => !r.changed).map((r) => r.name),
      new_problems: worsened.map((r) => `${r.name} becomes ${STATUS_TEXT[r.after.status]} (lowest ${formatCents(r.after.lowest_cents)} on ${r.after.lowest_date})`),
    },
  };
}

function runRecordActual(args: any, ctx: ToolContext): ToolExecution {
  const txs = validateTransactions(args.transactions, ctx.world);
  const description = typeof args.description === 'string' && args.description.trim() ? args.description.trim() : 'Recorded transaction';
  const days = ctx.days ?? DEFAULT_HORIZON_DAYS;

  const eff = applyScenario(ctx.world, ctx.assumptions);
  const adjustments = transactionsToAdjustments(txs, eff.accounts, description);
  const touched = Array.from(new Set(adjustments.map((a) => a.account_id)));
  const accounts = touched.map((id) => {
    const a = eff.accounts.find((x) => x.id === id)!;
    const before = toCents(a.balance);
    const delta = adjustments.filter((x) => x.account_id === id).reduce((s, x) => s + x.delta_cents, 0);
    return { id, name: a.name, before_cents: before, after_cents: before + delta };
  });

  const outBefore = summarizeOutlook(projectWorld(ctx.world, ctx.assumptions, days));
  const outAfter = summarizeOutlook(projectWorld(ctx.world, [...ctx.assumptions, ...adjustments], days));
  const risks: string[] = [];
  for (const id of Object.keys(outAfter)) {
    const b = outBefore[id];
    const a = outAfter[id];
    if (b && statusRank(a.status) > statusRank(b.status)) {
      risks.push(
        a.status === 'overdraft'
          ? `${a.name} would project ${formatCents(a.lowest_cents)} on ${prettyDate(a.lowest_date)} (overdraft).`
          : `${a.name} would dip to ${formatCents(a.lowest_cents)} on ${prettyDate(a.lowest_date)}, below its ${formatCents(a.floor_cents ?? 0)} floor.`
      );
    }
  }

  const sources: FigureSource[] = [];
  accounts.forEach((a) => {
    sources.push({ cents: a.before_cents, label: `${a.name} · balance before "${description}"` });
    sources.push({ cents: a.after_cents, label: `${a.name} · balance after "${description}"` });
  });
  txs.forEach((t) => sources.push({ cents: t.amount_cents, label: `${description} · amount` }));
  Object.values(outAfter).forEach((o) => {
    if (touched.includes(o.id)) sources.push(...outlookSources(o, ` · if "${description}" landed`));
  });

  const txDescriptions = txs.map((t) => describeTransaction(t, eff.accounts));
  return {
    name: 'record_actual',
    ok: true,
    awaitsUser: true,
    label: description,
    summary: `Asked how to record "${description}"`,
    actual: { description, transactions: txs, transaction_descriptions: txDescriptions, adjustments, accounts, risks },
    sources,
    result: {
      status: 'awaiting_user_choice',
      description,
      transactions: txDescriptions,
      balance_preview: accounts.map((a) => ({ account: a.name, before: formatCents(a.before_cents), after: formatCents(a.after_cents) })),
      new_risks_if_landed: risks,
      instructions:
        'The user is now choosing: (1) update saved balances, (2) treat as landed in this conversation only, or (3) it is already in their balances. Do NOT assume an option and do not call more tools this turn. Briefly tell the user what you will check once they choose.',
    },
  };
}
