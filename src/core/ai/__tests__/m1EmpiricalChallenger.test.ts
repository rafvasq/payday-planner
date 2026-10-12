import { describe, it, expect } from 'vitest';
import { format, addDays, parseISO } from 'date-fns';
import {
  PlannerWorld,
  toCents,
  projectWorld,
  summarizeOutlook,
} from '../world';
import {
  executeTool,
  validateChanges,
  ToolValidationError,
  ToolContext,
  FigureSource,
} from '../toolkit';
import { projectBalances } from '../../projection';
import { Account, Event } from '../../models';

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

describe('M1 Empirical Challenger: Projection Consistency (projectWorld vs projectBalances)', () => {
  const accounts: Account[] = [
    createAccount({ id: 'chq', name: 'Chequing', balance: 3000, target_floor: 800 }),
    createAccount({ id: 'sav', name: 'Savings', type: 'savings', balance: 5000, target_floor: 2000 }),
    createAccount({ id: 'card', name: 'Credit Card', type: 'debt', balance: 600 }),
  ];

  const todayStr = '2026-10-11';

  const events: Event[] = [
    createEvent({
      id: 'ev_today_coffee',
      name: 'Coffee',
      amount: 10,
      from_account_id: 'chq',
      frequency: 'one-time',
      anchor_date: todayStr,
    }),
    createEvent({
      id: 'ev_today_salary',
      name: 'Side Gig',
      event_type: 'inflow',
      amount: 300,
      to_account_id: 'chq',
      frequency: 'one-time',
      anchor_date: todayStr,
    }),
    createEvent({
      id: 'ev_d3_transfer',
      name: 'Save Up',
      event_type: 'transfer',
      amount: 500,
      from_account_id: 'chq',
      to_account_id: 'sav',
      frequency: 'one-time',
      anchor_date: '2026-10-14',
    }),
    createEvent({
      id: 'ev_d7_rent',
      name: 'Rent',
      amount: 1500,
      from_account_id: 'chq',
      frequency: 'one-time',
      anchor_date: '2026-10-18',
    }),
    createEvent({
      id: 'ev_d10_paycard',
      name: 'Pay Card',
      event_type: 'transfer',
      amount: 400,
      from_account_id: 'chq',
      to_account_id: 'card',
      frequency: 'one-time',
      anchor_date: '2026-10-21',
    }),
  ];

  const testCases: Array<{ desc: string; reflectToday: boolean; executed: Record<string, boolean> }> = [
    {
      desc: 'balancesReflectToday = false, executedEvents = empty',
      reflectToday: false,
      executed: {},
    },
    {
      desc: 'balancesReflectToday = true, executedEvents = empty',
      reflectToday: true,
      executed: {},
    },
    {
      desc: 'balancesReflectToday = false, executedEvents = partial (rent executed)',
      reflectToday: false,
      executed: { '2026-10-18_ev_d7_rent': true },
    },
    {
      desc: 'balancesReflectToday = true, executedEvents = partial (today coffee + rent executed)',
      reflectToday: true,
      executed: { '2026-10-11_ev_today_coffee': true, '2026-10-18_ev_d7_rent': true },
    },
    {
      desc: 'balancesReflectToday = false, executedEvents = full checklist',
      reflectToday: false,
      executed: {
        '2026-10-11_ev_today_coffee': true,
        '2026-10-11_ev_today_salary': true,
        '2026-10-14_ev_d3_transfer': true,
        '2026-10-18_ev_d7_rent': true,
        '2026-10-21_ev_d10_paycard': true,
      },
    },
    {
      desc: 'balancesReflectToday = true, executedEvents = full checklist',
      reflectToday: true,
      executed: {
        '2026-10-11_ev_today_coffee': true,
        '2026-10-11_ev_today_salary': true,
        '2026-10-14_ev_d3_transfer': true,
        '2026-10-18_ev_d7_rent': true,
        '2026-10-21_ev_d10_paycard': true,
      },
    },
  ];

  testCases.forEach(({ desc, reflectToday, executed }) => {
    it(`guarantees exact parity: ${desc}`, () => {
      const world: PlannerWorld = {
        accounts,
        events,
        today: todayStr,
        balancesReflectToday: reflectToday,
        executedEvents: executed,
      };

      const days = 15;
      const proj = projectWorld(world, [], days);

      const direct = projectBalances(
        world.accounts,
        world.events,
        proj.start,
        proj.end,
        {
          skipTodayEvents: reflectToday,
          executedEvents: executed,
          forceApplyEventIds: new Set(),
        }
      );

      expect(proj.points.length).toBe(direct.length);
      expect(proj.points).toEqual(direct);

      // Verify each daily point
      for (let i = 0; i < proj.points.length; i++) {
        const ptW = proj.points[i];
        const ptD = direct[i];
        expect(ptW.date).toBe(ptD.date);
        expect(ptW.balances).toEqual(ptD.balances);
        expect(ptW.netWorth).toBe(ptD.netWorth);
        expect(ptW.liquidAssets).toBe(ptD.liquidAssets);
        expect(ptW.totalDebt).toBe(ptD.totalDebt);
      }
    });
  });

  it('guarantees floor breach and overdraft detections align with direct projection points', () => {
    const world: PlannerWorld = {
      accounts,
      events,
      today: todayStr,
      balancesReflectToday: false,
      executedEvents: {},
    };

    const proj = projectWorld(world, [], 15);
    const outlook = summarizeOutlook(proj);

    // Verify chequing account outlook
    const chqOutlook = outlook['chq'];
    expect(chqOutlook).toBeDefined();

    // Compute expected lowest and dates directly from points
    let expectedLowest = Number.POSITIVE_INFINITY;
    let expectedLowestDate = proj.start;
    let expectedFirstBreach: string | null = null;
    let expectedFirstOverdraft: string | null = null;

    for (const pt of proj.points) {
      const bal = toCents(pt.balances['chq']);
      if (bal < expectedLowest) {
        expectedLowest = bal;
        expectedLowestDate = pt.date;
      }
      if (bal < 0 && !expectedFirstOverdraft) {
        expectedFirstOverdraft = pt.date;
      }
      if (bal < 80000 && !expectedFirstBreach) {
        expectedFirstBreach = pt.date;
      }
    }

    expect(chqOutlook.lowest_cents).toBe(expectedLowest);
    expect(chqOutlook.lowest_date).toBe(expectedLowestDate);
    expect(chqOutlook.first_floor_breach).toBe(expectedFirstBreach);
    expect(chqOutlook.first_overdraft).toBe(expectedFirstOverdraft);
  });

  describe('Randomized Stress Harness (50 scenarios)', () => {
    it('executes 50 generated scenarios with random configurations without divergence', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const rndToday = `2026-10-${(10 + (seed % 15)).toString().padStart(2, '0')}`;
        const rndReflect = seed % 2 === 0;

        const rndAccounts: Account[] = [
          createAccount({
            id: 'rnd_chq',
            name: 'Rnd Chequing',
            balance: 1000 + (seed * 137) % 5000,
            target_floor: 200 + (seed * 31) % 1000,
          }),
          createAccount({
            id: 'rnd_sav',
            name: 'Rnd Savings',
            type: 'savings',
            balance: 2000 + (seed * 251) % 10000,
            target_floor: 500,
          }),
          createAccount({
            id: 'rnd_debt',
            name: 'Rnd Card',
            type: 'debt',
            balance: 100 + (seed * 47) % 2000,
          }),
        ];

        const rndEvents: Event[] = [
          createEvent({
            id: `rnd_ev_today_${seed}`,
            amount: 50 + (seed * 19) % 300,
            from_account_id: 'rnd_chq',
            anchor_date: rndToday,
          }),
          createEvent({
            id: `rnd_ev_fut1_${seed}`,
            amount: 100 + (seed * 23) % 500,
            from_account_id: 'rnd_chq',
            anchor_date: format(addDays(parseISO(rndToday), 2), 'yyyy-MM-dd'),
          }),
          createEvent({
            id: `rnd_ev_transfer_${seed}`,
            event_type: 'transfer',
            amount: 75 + (seed * 11) % 400,
            from_account_id: 'rnd_chq',
            to_account_id: 'rnd_sav',
            anchor_date: format(addDays(parseISO(rndToday), 5), 'yyyy-MM-dd'),
          }),
        ];

        const rndExecuted: Record<string, boolean> = {};
        if (seed % 3 === 0) {
          rndExecuted[`${rndToday}_rnd_ev_today_${seed}`] = true;
        }
        if (seed % 5 === 0) {
          rndExecuted[`${format(addDays(parseISO(rndToday), 2), 'yyyy-MM-dd')}_rnd_ev_fut1_${seed}`] = true;
        }

        const rndWorld: PlannerWorld = {
          accounts: rndAccounts,
          events: rndEvents,
          today: rndToday,
          balancesReflectToday: rndReflect,
          executedEvents: rndExecuted,
        };

        const horizon = 10;
        const proj = projectWorld(rndWorld, [], horizon);
        const direct = projectBalances(
          rndWorld.accounts,
          rndWorld.events,
          proj.start,
          proj.end,
          {
            skipTodayEvents: rndReflect,
            executedEvents: rndExecuted,
            forceApplyEventIds: new Set(),
          }
        );

        expect(proj.points.length).toBe(direct.length);
        expect(proj.points).toEqual(direct);
      }
    });
  });
});

describe('M1 Empirical Challenger: simulate Tool Validation & Rejections', () => {
  const ctx = createToolContext();
  const world = ctx.world; // today: 2026-10-11

  it('rejects empty changes array with ToolValidationError', () => {
    expect(() => validateChanges([], world)).toThrowError(ToolValidationError);
    expect(() => validateChanges([], world)).toThrowError(
      /To read the current state use get_snapshot or get_schedule; simulate needs at least one change/
    );

    const execRes = executeTool('simulate', { label: 'Empty Sim', changes: [] }, ctx);
    expect(execRes.ok).toBe(false);
    expect(execRes.error).toContain('To read the current state use get_snapshot or get_schedule');
    expect(execRes.result.error).toContain('To read the current state use get_snapshot or get_schedule');
  });

  it('rejects non-array changes (null, undefined, string, object)', () => {
    expect(() => validateChanges(null, world)).toThrowError(ToolValidationError);
    expect(() => validateChanges(undefined, world)).toThrowError(ToolValidationError);
    expect(() => validateChanges('skip', world)).toThrowError(ToolValidationError);
    expect(() => validateChanges({}, world)).toThrowError(ToolValidationError);

    const execRes = executeTool('simulate', { label: 'Invalid Type', changes: 'not-an-array' }, ctx);
    expect(execRes.ok).toBe(false);
  });

  it('rejects changes with dates in the past across all change types', () => {
    const pastDate = '2026-10-10'; // world.today is 2026-10-11

    // 1. skip_event
    expect(() =>
      validateChanges([{ type: 'skip_event', event_id: 'ev_rent', date: pastDate }], world)
    ).toThrowError(/is in the past \(today is 2026-10-11\)\. For things that already happened use record_actual/);

    // 2. pause_event from_date
    expect(() =>
      validateChanges(
        [{ type: 'pause_event', event_id: 'ev_pay', from_date: pastDate, to_date: '2026-10-20' }],
        world
      )
    ).toThrowError(/is in the past/);

    // 3. move_event from_date / to_date
    expect(() =>
      validateChanges(
        [{ type: 'move_event', event_id: 'ev_rent', from_date: pastDate, to_date: '2026-10-20' }],
        world
      )
    ).toThrowError(/is in the past/);

    // 4. pay_debt date
    expect(() =>
      validateChanges(
        [
          {
            type: 'pay_debt',
            card_id: 'cc_visa',
            from_account_id: 'chq_main',
            amount_cents: 10000,
            date: pastDate,
          },
        ],
        world
      )
    ).toThrowError(/is in the past/);

    // 5. add_one_time date
    expect(() =>
      validateChanges(
        [
          {
            type: 'add_one_time',
            from_account_id: 'chq_main',
            amount_cents: 5000,
            date: pastDate,
          },
        ],
        world
      )
    ).toThrowError(/is in the past/);
  });

  it('allows changes with date = today or in the future', () => {
    const todayChanges = [
      {
        type: 'add_one_time',
        from_account_id: 'chq_main',
        amount_cents: 10000,
        date: '2026-10-11', // Today
      },
      {
        type: 'skip_event',
        event_id: 'ev_rent',
        date: '2026-10-14', // Future
      },
    ];

    expect(() => validateChanges(todayChanges, world)).not.toThrow();
    const validated = validateChanges(todayChanges, world);
    expect(validated.length).toBe(2);
  });

  it('rejects inverted date ranges (from_date > to_date)', () => {
    expect(() =>
      validateChanges(
        [
          {
            type: 'pause_event',
            event_id: 'ev_rent',
            from_date: '2026-10-25',
            to_date: '2026-10-15',
          },
        ],
        world
      )
    ).toThrowError(/from_date is after to_date/);
  });

  it('rejects non-positive amounts', () => {
    expect(() =>
      validateChanges(
        [{ type: 'add_one_time', from_account_id: 'chq_main', amount_cents: 0, date: '2026-10-15' }],
        world
      )
    ).toThrowError(/amount_cents must be positive/);

    expect(() =>
      validateChanges(
        [{ type: 'add_one_time', from_account_id: 'chq_main', amount_cents: -500, date: '2026-10-15' }],
        world
      )
    ).toThrowError(/amount_cents must be positive/);

    expect(() =>
      validateChanges(
        [{ type: 'set_amount', event_id: 'ev_rent', amount_cents: -100 }],
        world
      )
    ).toThrowError(/amount_cents cannot be negative/);
  });

  it('rejects debt repayment exceeding current card balance', () => {
    // cc_visa balance is $800 = 80000 cents
    expect(() =>
      validateChanges(
        [
          {
            type: 'pay_debt',
            card_id: 'cc_visa',
            from_account_id: 'chq_main',
            amount_cents: 80001,
            date: '2026-10-15',
          },
        ],
        world
      )
    ).toThrowError(/payment \$800\.01 exceeds Visa Infinite balance \$800\.00/);
  });

  it('rejects references to nonexistent accounts or events', () => {
    expect(() =>
      validateChanges(
        [{ type: 'skip_event', event_id: 'ghost_event', date: '2026-10-15' }],
        world
      )
    ).toThrowError(/unknown event_id "ghost_event"/);

    expect(() =>
      validateChanges(
        [{ type: 'add_one_time', from_account_id: 'ghost_acct', amount_cents: 1000, date: '2026-10-15' }],
        world
      )
    ).toThrowError(/unknown from_account_id "ghost_acct"/);

    expect(() =>
      validateChanges(
        [
          {
            type: 'add_one_time',
            from_account_id: 'chq_main',
            to_account_id: 'ghost_dest',
            amount_cents: 1000,
            date: '2026-10-15',
          },
        ],
        world
      )
    ).toThrowError(/unknown to_account_id "ghost_dest"/);
  });
});

describe('M1 Empirical Challenger: get_snapshot Correctness & Figure Sources', () => {
  const ctx = createToolContext();

  it('returns correctly formatted snapshot structure', () => {
    const res = executeTool('get_snapshot', {}, ctx);
    expect(res.ok).toBe(true);
    expect(res.name).toBe('get_snapshot');
    expect(res.snapshot_id).toMatch(/^[0-9a-f]{8}$/);
    expect(res.result.as_of).toBe('2026-10-11');
    expect(res.result.horizon_days).toBe(30);
    expect(res.result.balances_reflect_today).toBe(true);
    expect(res.result.overall_status).toBe('safe');

    // Only cash accounts in accounts
    const accounts = res.result.accounts;
    expect(accounts.length).toBe(2);
    expect(accounts.map((a: any) => a.account_id)).toEqual(['chq_main', 'sav_eq']);

    // Debts listed separately
    const debts = res.result.debts;
    expect(debts.length).toBe(1);
    expect(debts[0].account_id).toBe('cc_visa');
    expect(debts[0].balance_owed).toBe('$800.00');
  });

  it('generates exact figure sources matching account balances, floors, and headroom', () => {
    const res = executeTool('get_snapshot', {}, ctx);
    const sources: FigureSource[] = res.sources;

    // Check Main Chequing figures
    const chqBalance = sources.find((s) => s.label === 'Main Chequing · balance now');
    expect(chqBalance?.cents).toBe(250000);

    const chqFloor = sources.find((s) => s.label === 'Main Chequing · target floor');
    expect(chqFloor?.cents).toBe(50000);

    const chqHeadroom = sources.find((s) => s.label === 'Main Chequing · headroom above floor now');
    expect(chqHeadroom?.cents).toBe(200000); // 250000 - 50000

    // Check EQ Savings figures
    const savBalance = sources.find((s) => s.label === 'EQ Savings · balance now');
    expect(savBalance?.cents).toBe(400000);

    const savFloor = sources.find((s) => s.label === 'EQ Savings · target floor');
    expect(savFloor?.cents).toBe(100000);

    const savHeadroom = sources.find((s) => s.label === 'EQ Savings · headroom above floor now');
    expect(savHeadroom?.cents).toBe(300000); // 400000 - 100000

    // Check Visa Infinite figures
    const debtSource = sources.find((s) => s.label === 'Visa Infinite · balance owed');
    expect(debtSource?.cents).toBe(80000);
  });

  it('incorporates scenario assumptions with labeled figure sources', () => {
    const ctxWithAssumptions = createToolContext({
      assumptions: [
        { type: 'adjust_balance', account_id: 'chq_main', delta_cents: 100000 },
      ],
      assumptionLabels: ['Bonus +$1,000'],
    });

    const res = executeTool('get_snapshot', {}, ctxWithAssumptions);
    expect(res.ok).toBe(true);
    expect(res.result.active_assumptions).toEqual(['Bonus +$1,000']);

    const chq = res.result.accounts.find((a: any) => a.account_id === 'chq_main');
    expect(chq.balance).toBe('$3,500.00'); // 2500 + 1000

    const chqSource = res.sources.find((s) =>
      s.label.includes('Main Chequing · balance now · with scenario assumptions')
    );
    expect(chqSource).toBeDefined();
    expect(chqSource?.cents).toBe(350000);
  });
});

describe('M1 Empirical Challenger: get_schedule Correctness & Figure Sources', () => {
  const ctx = createToolContext();

  it('correctly expands upcoming schedule with events and balances_after', () => {
    const res = executeTool(
      'get_schedule',
      { from_date: '2026-10-11', to_date: '2026-10-18' },
      ctx
    );

    expect(res.ok).toBe(true);
    expect(res.result.from).toBe('2026-10-11');
    expect(res.result.to).toBe('2026-10-18');
    expect(res.result.days).toBe(8);

    const events = res.result.events;
    expect(events.length).toBeGreaterThanOrEqual(2);

    const rent = events.find((e: any) => e.name === 'Rent');
    expect(rent).toBeDefined();
    expect(rent.amount).toBe('$1,200.00');
    expect(rent.status).toBe('upcoming');
    expect(rent.balances_after['Main Chequing']).toBeDefined();

    const pay = events.find((e: any) => e.name === 'Paycheck');
    expect(pay).toBeDefined();
    expect(pay.amount).toBe('$2,000.00');
    expect(pay.status).toBe('upcoming');
    expect(pay.balances_after['Main Chequing']).toBeDefined();
  });

  it('correctly filters events by account_id and rejects invalid accounts', () => {
    const resSav = executeTool(
      'get_schedule',
      { from_date: '2026-10-11', to_date: '2026-10-18', account_id: 'sav_eq' },
      ctx
    );
    expect(resSav.ok).toBe(true);
    expect(resSav.result.account).toBe('EQ Savings');
    expect(resSav.result.events.length).toBe(0); // neither rent nor paycheck touches EQ savings

    const resUnknown = executeTool(
      'get_schedule',
      { from_date: '2026-10-11', to_date: '2026-10-18', account_id: 'fake_acc' },
      ctx
    );
    expect(resUnknown.ok).toBe(false);
    expect(resUnknown.error).toContain('Unknown account_id "fake_acc"');
  });

  it('clamps date range boundaries: from_date in past clamped to today, to_date clamped to +62 days', () => {
    const res = executeTool(
      'get_schedule',
      { from_date: '2026-09-01', to_date: '2026-12-31' },
      ctx
    );
    expect(res.ok).toBe(true);
    expect(res.result.from).toBe('2026-10-11'); // today
    expect(res.result.to).toBe('2026-12-12'); // today + 62 days
  });

  it('generates FigureSources for event amounts and balances_after', () => {
    const res = executeTool(
      'get_schedule',
      { from_date: '2026-10-11', to_date: '2026-10-18' },
      ctx
    );

    const sources = res.sources;
    expect(sources.length).toBeGreaterThan(0);

    const rentAmt = sources.find((s) => s.label.includes('Rent') && s.cents === 120000);
    expect(rentAmt).toBeDefined();

    const payAmt = sources.find((s) => s.label.includes('Paycheck') && s.cents === 200000);
    expect(payAmt).toBeDefined();

    const chqEndBalance = sources.find((s) => s.label.includes('Main Chequing · end of'));
    expect(chqEndBalance).toBeDefined();
  });
});
