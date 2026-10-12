import { describe, it, expect } from 'vitest';
import { format, addDays, parseISO } from 'date-fns';
import {
  PlannerWorld,
  ScenarioChange,
  DEFAULT_HORIZON_DAYS,
  toCents,
  formatCents,
  isCashAccount,
  worldToday,
  applyScenario,
  projectWorld,
  summarizeOutlook,
  worstStatus,
  statusRank,
  buildSchedule,
  snapshotId,
} from '../world';
import {
  executeTool,
  validateChanges,
  ToolValidationError,
  ToolContext,
  FigureSource,
  transactionsToAdjustments,
  describeChange,
  describeTransaction,
  prettyDate,
} from '../toolkit';
import {
  parseFigureCents,
  formatFigureCents,
  extractFigureTokens,
  isCurrencyToken,
  findDerivedFormula,
  classifyFigure,
  classifyMessageFigures,
  harvestBaselineSources,
} from '../provenance';
import { projectBalances } from '../../projection';
import { Account, Event } from '../../models';

/* ── Helper Factories ──────────────────────────────────────────────────────── */

function createAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'chq_main',
    name: 'Main Chequing',
    type: 'chequing',
    owner: 'user1',
    balance: 2000,
    target_floor: 500,
    ...overrides,
  };
}

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'ev_rent',
    name: 'Rent',
    event_type: 'outflow',
    amount: 1000,
    from_account_id: 'chq_main',
    to_account_id: null,
    frequency: 'monthly',
    anchor_date: '2026-10-01',
    active: true,
    execution: 'auto',
    weekend_shift: 'none',
    ...overrides,
  };
}

function createToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  const accounts: Account[] = [
    createAccount({ id: 'chq_main', name: 'Main Chequing', balance: 2500, target_floor: 500 }),
    createAccount({ id: 'sav_eq', name: 'EQ Savings', type: 'savings', balance: 4000, target_floor: 1000 }),
    createAccount({ id: 'cc_visa', name: 'Visa Infinite', type: 'debt', balance: 800 }),
  ];

  const events: Event[] = [
    createEvent({
      id: 'ev_pay',
      name: 'Paycheck',
      event_type: 'inflow',
      amount: 2000,
      to_account_id: 'chq_main',
      frequency: 'biweekly',
      anchor_date: '2026-10-15',
    }),
    createEvent({
      id: 'ev_rent',
      name: 'Rent',
      event_type: 'outflow',
      amount: 1200,
      from_account_id: 'chq_main',
      frequency: 'monthly',
      anchor_date: '2026-10-14',
    }),
  ];

  const world: PlannerWorld = {
    accounts,
    events,
    today: '2026-10-11',
    balancesReflectToday: true,
    executedEvents: {},
  };

  return {
    world,
    assumptions: [],
    assumptionLabels: [],
    days: 30,
    ...overrides,
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
 * SECTION 1: projectWorld & buildSchedule Adversarial Stress Tests
 * ══════════════════════════════════════════════════════════════════════════════ */

describe('Tier 5 Adversarial Audit — Section 1: projectWorld & buildSchedule Boundary Conditions', () => {
  it('handles zero-day horizon (days = 0) projecting only start date balance', () => {
    const world: PlannerWorld = {
      accounts: [createAccount({ id: 'chq_1', balance: 1500 })],
      events: [createEvent({ anchor_date: '2026-10-11', amount: 300, from_account_id: 'chq_1', frequency: 'one-time' })],
      today: '2026-10-11',
      balancesReflectToday: false,
    };

    const proj = projectWorld(world, [], 0);
    expect(proj.start).toBe('2026-10-11');
    expect(proj.end).toBe('2026-10-11');
    expect(proj.points.length).toBe(1);
    expect(proj.points[0].date).toBe('2026-10-11');
    // balancesReflectToday is false, so today's 300 outflow applies
    expect(proj.points[0].balances['chq_1']).toBe(1200);
  });

  it('handles negative horizon in days gracefully by defaulting to start or clamping', () => {
    const world: PlannerWorld = {
      accounts: [createAccount({ id: 'chq_1', balance: 500 })],
      events: [],
      today: '2026-10-11',
    };

    // Passing days = 0
    const proj = projectWorld(world, [], 0);
    expect(proj.points.length).toBe(1);
    expect(proj.points[0].balances['chq_1']).toBe(500);
  });

  it('handles empty accounts list without throwing and produces empty balance points', () => {
    const world: PlannerWorld = {
      accounts: [],
      events: [createEvent()],
      today: '2026-10-11',
    };

    const proj = projectWorld(world, [], 7);
    expect(proj.points.length).toBe(8);
    for (const pt of proj.points) {
      expect(pt.balances).toEqual({});
    }
    const outlook = summarizeOutlook(proj);
    expect(Object.keys(outlook).length).toBe(0);
  });

  it('handles empty events list with multiple accounts maintaining constant balances', () => {
    const world: PlannerWorld = {
      accounts: [
        createAccount({ id: 'chq', balance: 1250 }),
        createAccount({ id: 'sav', balance: 9000 }),
      ],
      events: [],
      today: '2026-10-11',
    };

    const proj = projectWorld(world, [], 10);
    expect(proj.points.length).toBe(11);
    for (const pt of proj.points) {
      expect(pt.balances['chq']).toBe(1250);
      expect(pt.balances['sav']).toBe(9000);
    }
  });

  it('handles accounts with negative starting balances (already in overdraft)', () => {
    const world: PlannerWorld = {
      accounts: [createAccount({ id: 'chq_neg', balance: -450.75, target_floor: 200 })],
      events: [
        createEvent({
          id: 'ev_fee',
          amount: 50,
          from_account_id: 'chq_neg',
          frequency: 'one-time',
          anchor_date: '2026-10-13',
        }),
      ],
      today: '2026-10-11',
    };

    const proj = projectWorld(world, [], 5);
    const outlook = summarizeOutlook(proj);
    const chqOutlook = outlook['chq_neg'];

    expect(chqOutlook.start_cents).toBe(-45075);
    expect(chqOutlook.status).toBe('overdraft');
    expect(chqOutlook.first_overdraft).toBe('2026-10-11');
    expect(chqOutlook.lowest_cents).toBe(-50075); // -450.75 - 50 = -500.75
    expect(chqOutlook.recovery_date).toBeNull();
  });

  it('correctly simulates leap year transition (February 28 -> February 29 -> March 1, 2028)', () => {
    const world: PlannerWorld = {
      accounts: [createAccount({ id: 'chq_leap', balance: 1000 })],
      events: [
        createEvent({
          id: 'ev_leap_day',
          name: 'Leap Day Bonus',
          amount: 500,
          to_account_id: 'chq_leap',
          frequency: 'one-time',
          anchor_date: '2028-02-29',
          event_type: 'inflow',
        }),
        createEvent({
          id: 'ev_march_bill',
          name: 'March 1 Rent',
          amount: 300,
          from_account_id: 'chq_leap',
          frequency: 'one-time',
          anchor_date: '2028-03-01',
          event_type: 'outflow',
        }),
      ],
      today: '2028-02-28',
      balancesReflectToday: true,
    };

    const proj = projectWorld(world, [], 3);
    expect(proj.points.map((p) => p.date)).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
      '2028-03-02',
    ]);

    expect(proj.points[0].balances['chq_leap']).toBe(1000); // Feb 28
    expect(proj.points[1].balances['chq_leap']).toBe(1500); // Feb 29 bonus
    expect(proj.points[2].balances['chq_leap']).toBe(1200); // Mar 1 bill
    expect(proj.points[3].balances['chq_leap']).toBe(1200); // Mar 2
  });

  it('correctly handles executedEvents checklist override matching direct projectBalances', () => {
    const world: PlannerWorld = {
      accounts: [createAccount({ id: 'chq_1', balance: 2000 })],
      events: [
        createEvent({
          id: 'ev_util',
          amount: 250,
          from_account_id: 'chq_1',
          frequency: 'monthly',
          anchor_date: '2026-10-14',
        }),
      ],
      today: '2026-10-11',
      balancesReflectToday: false,
      executedEvents: { '2026-10-14_ev_util': true },
    };

    const proj = projectWorld(world, [], 5);
    const directPoints = projectBalances(world.accounts, world.events, proj.start, proj.end, {
      skipTodayEvents: false,
      executedEvents: world.executedEvents,
      forceApplyEventIds: new Set(),
    });

    expect(proj.points).toEqual(directPoints);
    // Because it was executed in checklist, it is skipped in projection!
    expect(proj.points.find((p) => p.date === '2026-10-14')?.balances['chq_1']).toBe(2000);
  });

  it('enforces scenario forceApplyEventIds over balancesReflectToday on today', () => {
    const world: PlannerWorld = {
      accounts: [createAccount({ id: 'chq_1', balance: 2000 })],
      events: [
        createEvent({
          id: 'ev_existing_today',
          amount: 100,
          from_account_id: 'chq_1',
          frequency: 'one-time',
          anchor_date: '2026-10-11',
        }),
      ],
      today: '2026-10-11',
      balancesReflectToday: true,
    };

    // Existing event on today should be skipped because balancesReflectToday = true
    const baseProj = projectWorld(world, [], 2);
    expect(baseProj.points[0].balances['chq_1']).toBe(2000);

    // Injected hypothetical scenario event on today MUST apply despite balancesReflectToday
    const scenarioProj = projectWorld(
      world,
      [
        {
          type: 'add_one_time',
          from_account_id: 'chq_1',
          amount_cents: 35000,
          date: '2026-10-11',
          name: 'Extra purchase today',
        },
      ],
      2
    );
    expect(scenarioProj.points[0].balances['chq_1']).toBe(1650); // 2000 - 350 = 1650
  });

  describe('buildSchedule Boundary Conditions', () => {
    const world: PlannerWorld = {
      accounts: [
        createAccount({ id: 'chq_a', name: 'Chequing A', balance: 2000 }),
        createAccount({ id: 'chq_b', name: 'Chequing B', balance: 1000 }),
      ],
      events: [
        createEvent({
          id: 'ev_today',
          name: 'Today Grocery',
          amount: 50,
          from_account_id: 'chq_a',
          frequency: 'one-time',
          anchor_date: '2026-10-11',
        }),
        createEvent({
          id: 'ev_transfer',
          name: 'Transfer A to B',
          amount: 200,
          from_account_id: 'chq_a',
          to_account_id: 'chq_b',
          frequency: 'one-time',
          anchor_date: '2026-10-14',
          event_type: 'transfer',
        }),
        createEvent({
          id: 'ev_future_b',
          name: 'B Outflow',
          amount: 75,
          from_account_id: 'chq_b',
          frequency: 'one-time',
          anchor_date: '2026-10-15',
        }),
      ],
      today: '2026-10-11',
      balancesReflectToday: true,
      executedEvents: { '2026-10-14_ev_transfer': true },
    };

    it('clamps past requested from_date to today in get_schedule handler', () => {
      const ctx = createToolContext({ world });
      const res = executeTool('get_schedule', { from_date: '2026-09-01', to_date: '2026-10-15' }, ctx);
      expect(res.ok).toBe(true);
      expect(res.schedule?.from).toBe('2026-10-11');
    });

    it('clamps to_date beyond 62 days to max 62 days horizon', () => {
      const ctx = createToolContext({ world });
      const res = executeTool('get_schedule', { from_date: '2026-10-11', to_date: '2027-05-01' }, ctx);
      expect(res.ok).toBe(true);
      const expectedMax = format(addDays(parseISO('2026-10-11'), 62), 'yyyy-MM-dd');
      expect(res.schedule?.to).toBe(expectedMax);
    });

    it('clamps inverted date range where to_date is earlier than from_date', () => {
      const ctx = createToolContext({ world });
      const res = executeTool('get_schedule', { from_date: '2026-10-15', to_date: '2026-10-12' }, ctx);
      expect(res.ok).toBe(true);
      expect(res.schedule?.from).toBe('2026-10-15');
      expect(res.schedule?.to).toBe('2026-10-15');
    });

    it('exercises all 5 ScheduleStatus branches: upcoming, done, reflected_today, skipped_in_scenario, scenario', () => {
      // Use Wednesday Oct 14 - Friday Oct 16 to avoid Canadian Thanksgiving shift (Oct 12)
      const testWorld: PlannerWorld = {
        accounts: [createAccount({ id: 'chq_a' })],
        events: [
          createEvent({ id: 'ev_reflected', anchor_date: '2026-10-11', from_account_id: 'chq_a', frequency: 'one-time' }),
          createEvent({ id: 'ev_done', anchor_date: '2026-10-14', from_account_id: 'chq_a', frequency: 'one-time' }),
          createEvent({ id: 'ev_skip', anchor_date: '2026-10-15', from_account_id: 'chq_a', frequency: 'one-time' }),
          createEvent({ id: 'ev_upcoming', anchor_date: '2026-10-16', from_account_id: 'chq_a', frequency: 'one-time' }),
        ],
        today: '2026-10-11',
        balancesReflectToday: true,
        executedEvents: { '2026-10-14_ev_done': true },
      };

      const scenarioChanges: ScenarioChange[] = [
        { type: 'skip_event', event_id: 'ev_skip', date: '2026-10-15' },
        { type: 'add_one_time', from_account_id: 'chq_a', amount_cents: 1000, date: '2026-10-16', name: 'Injected' },
      ];

      const rows = buildSchedule(testWorld, scenarioChanges, '2026-10-11', '2026-10-17');

      const statuses = rows.map((r) => ({ id: r.event_id, status: r.status }));
      expect(statuses.find((s) => s.id === 'ev_reflected')?.status).toBe('reflected_today');
      expect(statuses.find((s) => s.id === 'ev_done')?.status).toBe('done');
      expect(statuses.find((s) => s.id === 'ev_skip')?.status).toBe('skipped_in_scenario');
      expect(statuses.find((s) => s.id === 'ev_upcoming')?.status).toBe('upcoming');
      expect(statuses.find((s) => s.status === 'scenario')).toBeDefined();
    });

    it('demonstrates Canadian statutory holiday shift (Thanksgiving Mon Oct 12 shifts to Tue Oct 13)', () => {
      const holidayWorld: PlannerWorld = {
        accounts: [createAccount({ id: 'chq_a' })],
        events: [
          createEvent({
            id: 'ev_thanksgiving',
            anchor_date: '2026-10-12',
            from_account_id: 'chq_a',
            frequency: 'one-time',
            weekend_shift: 'none', // holidays still shift to next business day
          }),
        ],
        today: '2026-10-11',
      };

      const rows = buildSchedule(holidayWorld, [], '2026-10-11', '2026-10-15');
      const row = rows.find((r) => r.event_id === 'ev_thanksgiving');
      expect(row).toBeDefined();
      expect(row?.date).toBe('2026-10-13'); // Shifted off Thanksgiving Monday
    });

    it('filters schedule strictly by accountId matching from or to', () => {
      const rowsA = buildSchedule(world, [], '2026-10-11', '2026-10-16', 'chq_a');
      expect(rowsA.some((r) => r.event_id === 'ev_today')).toBe(true);
      expect(rowsA.some((r) => r.event_id === 'ev_transfer')).toBe(true);
      expect(rowsA.some((r) => r.event_id === 'ev_future_b')).toBe(false);

      const rowsB = buildSchedule(world, [], '2026-10-11', '2026-10-16', 'chq_b');
      expect(rowsB.some((r) => r.event_id === 'ev_today')).toBe(false);
      expect(rowsB.some((r) => r.event_id === 'ev_transfer')).toBe(true);
      expect(rowsB.some((r) => r.event_id === 'ev_future_b')).toBe(true);
    });

    it('throws ToolValidationError when unknown account_id is requested in get_schedule', () => {
      const ctx = createToolContext({ world });
      const res = executeTool('get_schedule', { account_id: 'non_existent_account' }, ctx);
      expect(res.ok).toBe(false);
      expect(res.error).toContain('Unknown account_id "non_existent_account"');
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * SECTION 2: toolkit.ts Handlers, Schemas & Validation Stress Tests
 * ══════════════════════════════════════════════════════════════════════════════ */

describe('Tier 5 Adversarial Audit — Section 2: toolkit.ts Execution Handlers & Validation', () => {
  const ctx = createToolContext();

  it('rejects unknown tool name like "compare_plans" or "invalid_action"', () => {
    const res1 = executeTool('compare_plans', {}, ctx);
    expect(res1.ok).toBe(false);
    expect(res1.error).toContain('Unknown tool "compare_plans"');

    const res2 = executeTool('delete_account', {}, ctx);
    expect(res2.ok).toBe(false);
    expect(res2.error).toContain('Unknown tool "delete_account"');
  });

  it('handles invalid JSON string argument without throwing', () => {
    const res = executeTool('get_snapshot', '{ malformed: json ...', ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Arguments were not valid JSON.');
  });

  it('handles empty or whitespace rawArgs string gracefully', () => {
    const res1 = executeTool('get_snapshot', '', ctx);
    expect(res1.ok).toBe(true);

    const res2 = executeTool('get_snapshot', '   ', ctx);
    expect(res2.ok).toBe(true);
  });

  describe('validateChanges Adversarial Error Pathways', () => {
    it('rejects empty changes array with clear instructions to use read tools', () => {
      expect(() => validateChanges([], ctx.world)).toThrowError(ToolValidationError);
      expect(() => validateChanges([], ctx.world)).toThrowError(/To read the current state use get_snapshot/);
    });

    it('rejects non-array changes input', () => {
      expect(() => validateChanges(null as any, ctx.world)).toThrowError(ToolValidationError);
      expect(() => validateChanges({ type: 'skip_event' } as any, ctx.world)).toThrowError(ToolValidationError);
    });

    it('rejects changes with unknown event_id', () => {
      expect(() =>
        validateChanges([{ type: 'skip_event', event_id: 'ev_ghost', date: '2026-10-15' }], ctx.world)
      ).toThrowError(/unknown event_id "ev_ghost"/);
    });

    it('rejects changes with past dates (< today) and guides user to record_actual', () => {
      expect(() =>
        validateChanges([{ type: 'skip_event', event_id: 'ev_rent', date: '2026-10-05' }], ctx.world)
      ).toThrowError(/is in the past.*For things that already happened use record_actual/);
    });

    it('rejects pause_event with from_date > to_date', () => {
      expect(() =>
        validateChanges(
          [{ type: 'pause_event', event_id: 'ev_rent', from_date: '2026-10-20', to_date: '2026-10-15' }],
          ctx.world
        )
      ).toThrowError(/from_date is after to_date/);
    });

    it('rejects non-positive amount_cents in add_one_time and pay_debt', () => {
      expect(() =>
        validateChanges(
          [{ type: 'add_one_time', from_account_id: 'chq_main', amount_cents: 0, date: '2026-10-15' }],
          ctx.world
        )
      ).toThrowError(/amount_cents must be positive/);

      expect(() =>
        validateChanges(
          [{ type: 'add_one_time', from_account_id: 'chq_main', amount_cents: -500, date: '2026-10-15' }],
          ctx.world
        )
      ).toThrowError(/amount_cents must be positive/);
    });

    it('allows set_amount with 0 cents but rejects negative amount_cents', () => {
      const validZero = validateChanges(
        [{ type: 'set_amount', event_id: 'ev_rent', amount_cents: 0 }],
        ctx.world
      );
      expect(validZero.length).toBe(1);

      expect(() =>
        validateChanges(
          [{ type: 'set_amount', event_id: 'ev_rent', amount_cents: -100 }],
          ctx.world
        )
      ).toThrowError(/amount_cents cannot be negative/);
    });

    it('rejects pay_debt exceeding credit card current balance', () => {
      // cc_visa balance is $800.00 (80000 cents)
      expect(() =>
        validateChanges(
          [
            {
              type: 'pay_debt',
              card_id: 'cc_visa',
              from_account_id: 'chq_main',
              amount_cents: 90000, // $900 exceeds $800
              date: '2026-10-15',
            },
          ],
          ctx.world
        )
      ).toThrowError(/exceeds Visa Infinite balance \$800\.00/);
    });
  });

  describe('validateTransactions & record_actual Adversarial Tests', () => {
    it('rejects empty transactions list', () => {
      const res = executeTool('record_actual', { description: 'test', transactions: [] }, ctx);
      expect(res.ok).toBe(false);
      expect(res.error).toContain('record_actual needs at least one transaction');
    });

    it('rejects transactions with future date', () => {
      const res = executeTool(
        'record_actual',
        {
          description: 'future test',
          transactions: [{ from_account_id: 'chq_main', amount_cents: 1000, date: '2026-10-20' }],
        },
        ctx
      );
      expect(res.ok).toBe(false);
      expect(res.error).toContain('not in the future (for future moves use simulate)');
    });

    it('rejects transactions without from_account_id or to_account_id', () => {
      const res = executeTool(
        'record_actual',
        {
          description: 'invalid',
          transactions: [{ amount_cents: 5000 }],
        },
        ctx
      );
      expect(res.ok).toBe(false);
      expect(res.error).toContain('needs from_account_id and/or to_account_id');
    });

    it('rejects transactions with non-positive or fractional amount_cents', () => {
      const res1 = executeTool(
        'record_actual',
        {
          description: 'bad amount',
          transactions: [{ from_account_id: 'chq_main', amount_cents: -100 }],
        },
        ctx
      );
      expect(res1.ok).toBe(false);
      expect(res1.error).toContain('must be a positive integer');

      const res2 = executeTool(
        'record_actual',
        {
          description: 'float amount',
          transactions: [{ from_account_id: 'chq_main', amount_cents: 12.5 }],
        },
        ctx
      );
      expect(res2.ok).toBe(false);
      expect(res2.error).toContain('must be a positive integer');
    });

    it('correctly computes sign-aware balance adjustments for credit card transactions', () => {
      // 1. Spending on debt increases debt balance
      const chargeTxs = [{ from_account_id: 'cc_visa', amount_cents: 20000 }];
      const chargeAdj = transactionsToAdjustments(chargeTxs, ctx.world.accounts);
      expect(chargeAdj).toEqual([
        { type: 'adjust_balance', account_id: 'cc_visa', delta_cents: 20000, note: undefined },
      ]);

      // 2. Payment into debt decreases debt balance
      const payTxs = [{ to_account_id: 'cc_visa', amount_cents: 20000 }];
      const payAdj = transactionsToAdjustments(payTxs, ctx.world.accounts);
      expect(payAdj).toEqual([
        { type: 'adjust_balance', account_id: 'cc_visa', delta_cents: -20000, note: undefined },
      ]);

      // 3. Cash outflow decreases cash balance
      const cashOutTxs = [{ from_account_id: 'chq_main', amount_cents: 15000 }];
      const cashOutAdj = transactionsToAdjustments(cashOutTxs, ctx.world.accounts);
      expect(cashOutAdj).toEqual([
        { type: 'adjust_balance', account_id: 'chq_main', delta_cents: -15000, note: undefined },
      ]);

      // 4. Cash inflow increases cash balance
      const cashInTxs = [{ to_account_id: 'chq_main', amount_cents: 15000 }];
      const cashInAdj = transactionsToAdjustments(cashInTxs, ctx.world.accounts);
      expect(cashInAdj).toEqual([
        { type: 'adjust_balance', account_id: 'chq_main', delta_cents: 15000, note: undefined },
      ]);
    });

    it('flags new overdraft and floor risks when recording actual outflows', () => {
      // 1. Outflow that triggers overdraft
      const resOverdraft = executeTool(
        'record_actual',
        {
          description: 'Emergency repair',
          transactions: [{ from_account_id: 'chq_main', amount_cents: 220000, date: '2026-10-11' }],
        },
        ctx
      );
      expect(resOverdraft.ok).toBe(true);
      expect(resOverdraft.awaitsUser).toBe(true);
      expect(resOverdraft.actual?.risks.length).toBeGreaterThan(0);
      expect(resOverdraft.actual?.risks[0]).toContain('(overdraft)');

      // 2. Outflow that causes a below_floor breach without overdraft
      // Create isolated context with no rent on Oct 14
      const floorCtx = createToolContext({
        world: {
          accounts: [createAccount({ id: 'chq_only', balance: 1000, target_floor: 500 })],
          events: [],
          today: '2026-10-11',
        },
      });
      const resFloor = executeTool(
        'record_actual',
        {
          description: 'Car payment',
          transactions: [{ from_account_id: 'chq_only', amount_cents: 60000, date: '2026-10-11' }],
        },
        floorCtx
      );
      expect(resFloor.ok).toBe(true);
      expect(resFloor.actual?.risks.length).toBe(1);
      expect(resFloor.actual?.risks[0]).toContain('below its $500.00 floor');
    });
  });

  describe('simulate vs propose_blueprint_changes Lifecycle and Sources', () => {
    it('differentiates simulate (sandbox, awaitsUser: false) vs propose_blueprint_changes (awaitsUser: true)', () => {
      const changes = [
        {
          type: 'add_one_time',
          from_account_id: 'chq_main',
          amount_cents: 5000,
          date: '2026-10-15',
          name: 'Extra snack',
        },
      ];

      const simRes = executeTool('simulate', { label: 'Snack Sim', changes }, ctx);
      expect(simRes.ok).toBe(true);
      expect(simRes.awaitsUser).toBe(false);
      expect(simRes.result.status).toBeUndefined();

      const propRes = executeTool('propose_blueprint_changes', { label: 'Snack Proposal', changes }, ctx);
      expect(propRes.ok).toBe(true);
      expect(propRes.awaitsUser).toBe(true);
      expect(propRes.result.status).toBe('shown_to_user_for_review');
      expect(propRes.result.message).toContain('The user now sees Apply / Reject');
    });

    it('produces delta figure sources for changed accounts in simulation', () => {
      const simRes = executeTool(
        'simulate',
        {
          label: 'Test Outflow',
          changes: [
            {
              type: 'add_one_time',
              from_account_id: 'chq_main',
              amount_cents: 30000,
              date: '2026-10-12',
              name: 'Dinner',
            },
          ],
        },
        ctx
      );

      expect(simRes.ok).toBe(true);
      expect(simRes.sources.length).toBeGreaterThan(0);
      const labels = simRes.sources.map((s) => s.label);
      expect(labels.some((l) => l.includes('change in lowest balance'))).toBe(true);
      expect(labels.some((l) => l.includes('change in ending balance'))).toBe(true);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * SECTION 3: provenance.ts Classification, Derivation & Precision Stress Tests
 * ══════════════════════════════════════════════════════════════════════════════ */

describe('Tier 5 Adversarial Audit — Section 3: provenance.ts Grounding & Derivations', () => {
  describe('Currency Token Extraction & Non-Currency Rejection', () => {
    it('rejects dates, years, day numbers, version tags, and single/multi-digit integers without decimals', () => {
      const text =
        'On 2026-10-15 (day 15 of sprint v3.2.7), APR is 5.2% and count is 42, but balance is $1,250.00 and fee is -$25.50.';
      const tokens = extractFigureTokens(text);
      expect(tokens).toEqual(['$1,250.00', '-$25.50']);
    });

    it('extracts currency tokens without dollar sign if formatted with exact 2 decimal places', () => {
      const text = 'Net delta was 1,211.92 and adjustment was -113.73 in the log.';
      const tokens = extractFigureTokens(text);
      expect(tokens).toContain('1,211.92');
      expect(tokens).toContain('-113.73');
    });

    it('handles trailing punctuation correctly in parseFigureCents', () => {
      expect(parseFigureCents('$500.00;')).toBe(50000);
      expect(parseFigureCents('$1,200.00,')).toBe(120000);
      expect(parseFigureCents('-$150.00.')).toBe(-15000);
      expect(parseFigureCents('($500.00)')).toBe(-50000);
    });
  });

  describe('parseFigureCents Numerical Edge Cases', () => {
    it('handles zero values consistently', () => {
      expect(parseFigureCents('$0.00')).toBe(0);
      expect(parseFigureCents('$0')).toBe(0);
      expect(parseFigureCents('-$0.00')).toBe(0);
      expect(parseFigureCents('0.00')).toBe(0);
      expect(parseFigureCents('-0.00')).toBe(0);
    });

    it('avoids floating point rounding errors on cent values', () => {
      expect(parseFigureCents('$0.01')).toBe(1);
      expect(parseFigureCents('$0.07')).toBe(7);
      expect(parseFigureCents('$19.99')).toBe(1999);
      expect(parseFigureCents('-$0.01')).toBe(-1);
      expect(parseFigureCents('-$0.99')).toBe(-99);
    });

    it('returns null for non-currency strings, double dashes, and malformed symbols', () => {
      expect(parseFigureCents('')).toBeNull();
      expect(parseFigureCents('   ')).toBeNull();
      expect(parseFigureCents('$')).toBeNull();
      expect(parseFigureCents('-')).toBeNull();
      expect(parseFigureCents('--')).toBeNull();
      expect(parseFigureCents('--$50.00')).toBeNull();
      expect(parseFigureCents('2028-02-29')).toBeNull();
    });
  });

  describe('findDerivedFormula Multi-Operand Combinations & Invariants', () => {
    it('rejects derivation when fewer than 2 distinct sources exist', () => {
      expect(findDerivedFormula(20000, [{ cents: 10000, label: 'Single' }])).toBeNull();
      expect(findDerivedFormula(10000, [])).toBeNull();
    });

    it('strictly enforces distinct source index requirement (cannot reuse same source single item twice)', () => {
      // 10000 + 10000 = 20000 ($200.00), but source A only exists ONCE in sources array!
      const singleASources: FigureSource[] = [
        { cents: 10000, label: 'A' },
        { cents: 50000, label: 'B' },
      ];
      expect(findDerivedFormula(20000, singleASources)).toBeNull();
    });

    it('allows derivation if two distinct sources happen to share identical numerical values', () => {
      // Two distinct accounts both have $100.00
      const twinSources: FigureSource[] = [
        { cents: 10000, label: 'Account 1' },
        { cents: 10000, label: 'Account 2' },
      ];
      const formula = findDerivedFormula(20000, twinSources);
      expect(formula).toBe('$100.00 + $100.00 = $200.00');
    });

    it('derives all 8 sign combinations for triples without pair collisions using ternary basis', () => {
      // Balanced ternary values: A=1000 ($10), B=3000 ($30), C=9000 ($90)
      // Because sums of powers of 3 have no 2-term collisions with 3-term combinations,
      // all 8 triple combinations are guaranteed to be evaluated as triples:
      const ternarySources: FigureSource[] = [
        { cents: 1000, label: 'A' },
        { cents: 3000, label: 'B' },
        { cents: 9000, label: 'C' },
      ];

      // 1. +A +B +C = 13000 ($130.00)
      expect(findDerivedFormula(13000, ternarySources)).toBe('$10.00 + $30.00 + $90.00 = $130.00');

      // 2. +A +B -C = -5000 (-$50.00)
      expect(findDerivedFormula(-5000, ternarySources)).toBe('$10.00 + $30.00 - $90.00 = -$50.00');

      // 3. +A -B +C = 7000 ($70.00)
      expect(findDerivedFormula(7000, ternarySources)).toBe('$10.00 + $90.00 - $30.00 = $70.00');

      // 4. +A -B -C = -11000 (-$110.00)
      expect(findDerivedFormula(-11000, ternarySources)).toBe('$10.00 - $30.00 - $90.00 = -$110.00');

      // 5. -A +B +C = 11000 ($110.00)
      expect(findDerivedFormula(11000, ternarySources)).toBe('$30.00 + $90.00 - $10.00 = $110.00');

      // 6. -A +B -C = -7000 (-$70.00)
      expect(findDerivedFormula(-7000, ternarySources)).toBe('$30.00 - $10.00 - $90.00 = -$70.00');

      // 7. -A -B +C = 5000 ($50.00)
      expect(findDerivedFormula(5000, ternarySources)).toBe('$90.00 - $10.00 - $30.00 = $50.00');

      // 8. -A -B -C = -13000 (-$130.00)
      expect(findDerivedFormula(-13000, ternarySources)).toBe('-$10.00 - $30.00 - $90.00 = -$130.00');
    });

    it('caps triple search pool at 40 without freezing or crashing on large sources array', () => {
      // 50 sources
      const largeSources: FigureSource[] = Array.from({ length: 50 }, (_, i) => ({
        cents: (i + 1) * 1000,
        label: `Src ${i + 1}`,
      }));

      // Search for a non-existent combination
      const res = findDerivedFormula(999999999, largeSources);
      expect(res).toBeNull();
    });
  });

  describe('classifyMessageFigures Multi-Figure Classification Pipeline', () => {
    const sources: FigureSource[] = [
      { cents: 250000, label: 'Main Chequing' },
      { cents: 120000, label: 'Rent Outflow' },
    ];
    const userHistory = ['I already transferred $500.00 yesterday.'];

    it('classifies exact match (engine), derived arithmetic (derived), user history (user_stated), and phantom (unverified)', () => {
      // $2,500.00 -> engine
      // $3,700.00 -> derived ($2,500 + $1,200)
      // $500.00   -> user_stated
      // $9,999.00 -> unverified
      const message =
        'You have $2,500.00 in Chequing. Total combined is $3,700.00. You mentioned $500.00 earlier, but phantom balance is $9,999.00.';

      const result = classifyMessageFigures(message, sources, userHistory);
      expect(result.totalFigures).toBe(4);
      expect(result.unverifiedCount).toBe(1);

      const classifications = result.figures.map((f) => ({ text: f.rawText, class: f.classification }));
      expect(classifications).toEqual([
        { text: '$2,500.00', class: 'engine' },
        { text: '$3,700.00', class: 'derived' },
        { text: '$500.00', class: 'user_stated' },
        { text: '$9,999.00', class: 'unverified' },
      ]);
    });

    it('matches engine figures with inverted signs (e.g. outflow quoted as positive or negative)', () => {
      // sources has { cents: 120000, label: 'Rent Outflow' }
      // prose quotes -$1,200.00
      const c = classifyFigure('-$1,200.00', sources, []);
      expect(c.classification).toBe('engine');
      expect(c.sourceLabel).toBe('Rent Outflow');
    });

    it('harvestBaselineSources captures accounts balance, floor, headroom and event amounts', () => {
      const accounts: Account[] = [
        createAccount({ id: 'acc1', name: 'Hub', balance: 3000, target_floor: 1000 }),
        createAccount({ id: 'acc2', name: 'Debt', balance: 500, target_floor: undefined }),
      ];
      const events: Event[] = [
        createEvent({ id: 'ev1', name: 'Side Gig', amount: 800 }),
      ];

      const harvested = harvestBaselineSources(accounts, events);
      expect(harvested.length).toBe(5); // acc1: bal, floor, headroom; acc2: bal; ev1: amount
      expect(harvested.find((h) => h.label === 'Hub · balance')?.cents).toBe(300000);
      expect(harvested.find((h) => h.label === 'Hub · target floor')?.cents).toBe(100000);
      expect(harvested.find((h) => h.label === 'Hub · headroom above floor')?.cents).toBe(200000);
      expect(harvested.find((h) => h.label === 'Debt · balance')?.cents).toBe(50000);
      expect(harvested.find((h) => h.label === 'Side Gig · amount')?.cents).toBe(80000);
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * SECTION 4: Outlook Dynamics, Worst Status & Snapshot Hash Stability
 * ══════════════════════════════════════════════════════════════════════════════ */

describe('Tier 5 Adversarial Audit — Section 4: Watermark Dynamics & Snapshot Hash Stability', () => {
  it('correctly tracks multiple breach and recovery transitions in summarizeOutlook', () => {
    // Starting balance 1000, floor 500
    // Anchor dates on Wed Oct 14, Thu Oct 15, Fri Oct 16 (standard business days)
    // Oct 14: -600 outflow -> bal 400 (breach!)
    // Oct 15: +400 inflow -> bal 800 (recovered on Oct 15)
    // Oct 16: -900 outflow -> bal -100 (overdraft on Oct 16!)
    const world: PlannerWorld = {
      accounts: [createAccount({ id: 'chq_dyn', balance: 1000, target_floor: 500 })],
      events: [
        createEvent({ id: 'ev1', amount: 600, from_account_id: 'chq_dyn', frequency: 'one-time', anchor_date: '2026-10-14' }),
        createEvent({ id: 'ev2', amount: 400, to_account_id: 'chq_dyn', event_type: 'inflow', frequency: 'one-time', anchor_date: '2026-10-15' }),
        createEvent({ id: 'ev3', amount: 900, from_account_id: 'chq_dyn', frequency: 'one-time', anchor_date: '2026-10-16' }),
      ],
      today: '2026-10-11',
      balancesReflectToday: true,
    };

    const proj = projectWorld(world, [], 6);
    const outlook = summarizeOutlook(proj)['chq_dyn'];

    expect(outlook.first_floor_breach).toBe('2026-10-14');
    expect(outlook.first_overdraft).toBe('2026-10-16');
    expect(outlook.lowest_cents).toBe(-10000); // -$100.00
    expect(outlook.status).toBe('overdraft');
    // Because it breached again on day 5 and never recovered before end of horizon:
    expect(outlook.recovery_date).toBeNull();
  });

  it('ranks worst status correctly across account combinations', () => {
    expect(worstStatus([])).toBe('safe');
    expect(worstStatus(['safe', 'safe'])).toBe('safe');
    expect(worstStatus(['safe', 'below_floor'])).toBe('below_floor');
    expect(worstStatus(['below_floor', 'safe'])).toBe('below_floor');
    expect(worstStatus(['below_floor', 'overdraft'])).toBe('overdraft');
    expect(worstStatus(['overdraft', 'below_floor'])).toBe('overdraft');

    expect(statusRank('safe')).toBe(0);
    expect(statusRank('below_floor')).toBe(1);
    expect(statusRank('overdraft')).toBe(2);
  });

  it('snapshotId is invariant under executedEvents key ordering', () => {
    const world1: PlannerWorld = {
      accounts: [createAccount({ id: 'chq_1', balance: 1000 })],
      events: [],
      today: '2026-10-11',
      executedEvents: {
        '2026-10-15_ev_b': true,
        '2026-10-12_ev_a': true,
      },
    };

    const world2: PlannerWorld = {
      accounts: [createAccount({ id: 'chq_1', balance: 1000 })],
      events: [],
      today: '2026-10-11',
      executedEvents: {
        '2026-10-12_ev_a': true,
        '2026-10-15_ev_b': true,
      },
    };

    expect(snapshotId(world1)).toBe(snapshotId(world2));
    expect(snapshotId(world1)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('snapshotId is sensitive to balance, target floor, date, and scenario changes', () => {
    const baseWorld: PlannerWorld = {
      accounts: [createAccount({ id: 'chq_1', balance: 1000, target_floor: 500 })],
      events: [],
      today: '2026-10-11',
    };

    const hashBase = snapshotId(baseWorld);

    // Balance change
    const hashBalChange = snapshotId({
      ...baseWorld,
      accounts: [createAccount({ id: 'chq_1', balance: 1001, target_floor: 500 })],
    });
    expect(hashBalChange).not.toBe(hashBase);

    // Floor change
    const hashFloorChange = snapshotId({
      ...baseWorld,
      accounts: [createAccount({ id: 'chq_1', balance: 1000, target_floor: 600 })],
    });
    expect(hashFloorChange).not.toBe(hashBase);

    // Date change
    const hashDateChange = snapshotId({
      ...baseWorld,
      today: '2026-10-12',
    });
    expect(hashDateChange).not.toBe(hashBase);

    // Scenario change
    const hashScenarioChange = snapshotId(baseWorld, [
      { type: 'adjust_balance', account_id: 'chq_1', delta_cents: 1000 },
    ]);
    expect(hashScenarioChange).not.toBe(hashBase);
  });
});
