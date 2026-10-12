import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HORIZON_DAYS,
  PlannerWorld,
  BalanceAdjustment,
  ScenarioChange,
  isBalanceAdjustment,
  toCents,
  formatCents,
  isCashAccount,
  localToday,
  worldToday,
  applyScenario,
  projectWorld,
  summarizeOutlook,
  worstStatus,
  statusRank,
  buildSchedule,
  snapshotId,
} from '../world';
import { Account, Event } from '../../models';
import { projectBalances } from '../../projection';

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

describe('Money Helpers and Basics', () => {
  describe('toCents', () => {
    it('converts positive and negative numbers to integer cents', () => {
      expect(toCents(100)).toBe(10000);
      expect(toCents(19.99)).toBe(1999);
      expect(toCents(-50.25)).toBe(-5025);
      expect(toCents(0)).toBe(0);
    });

    it('handles floating point precision rounding correctly', () => {
      // 0.1 + 0.2 in JS is 0.30000000000000004
      expect(toCents(0.1 + 0.2)).toBe(30);
      expect(toCents(19.999)).toBe(2000);
    });

    it('treats null and undefined as 0 cents', () => {
      expect(toCents(null)).toBe(0);
      expect(toCents(undefined)).toBe(0);
    });
  });

  describe('formatCents', () => {
    it('formats cents in Canadian Dollar currency', () => {
      expect(formatCents(10000)).toBe('$100.00');
      expect(formatCents(0)).toBe('$0.00');
      expect(formatCents(123456)).toBe('$1,234.56');
      // Negative formatting
      const neg = formatCents(-5025);
      expect(neg).toMatch(/-?\$?50\.25/);
    });
  });

  describe('isCashAccount', () => {
    it('identifies chequing, savings, and investment as cash accounts', () => {
      expect(isCashAccount({ type: 'chequing' })).toBe(true);
      expect(isCashAccount({ type: 'savings' })).toBe(true);
      expect(isCashAccount({ type: 'investment' })).toBe(true);
    });

    it('identifies debt and liability as non-cash accounts', () => {
      expect(isCashAccount({ type: 'debt' })).toBe(false);
      expect(isCashAccount({ type: 'liability' })).toBe(false);
    });
  });

  describe('worldToday and localToday', () => {
    it('returns world.today when specified', () => {
      const world: PlannerWorld = {
        accounts: [],
        events: [],
        today: '2026-10-15',
      };
      expect(worldToday(world)).toBe('2026-10-15');
    });

    it('falls back to localToday() when world.today is omitted', () => {
      const world: PlannerWorld = {
        accounts: [],
        events: [],
      };
      expect(worldToday(world)).toBe(localToday());
      expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('isBalanceAdjustment', () => {
    it('discriminates BalanceAdjustment vs BlueprintChange', () => {
      const adj: BalanceAdjustment = {
        type: 'adjust_balance',
        account_id: 'chq_main',
        delta_cents: 5000,
      };
      const blueprintChange: ScenarioChange = {
        type: 'skip_event',
        event_id: 'ev_rent',
        date: '2026-10-01',
      };
      expect(isBalanceAdjustment(adj)).toBe(true);
      expect(isBalanceAdjustment(blueprintChange)).toBe(false);
    });
  });
});

describe('applyScenario', () => {
  const baseAccounts: Account[] = [
    createAccount({ id: 'chq_1', name: 'Chequing', balance: 1000 }),
    createAccount({ id: 'sav_1', name: 'Savings', balance: 5000 }),
    createAccount({ id: 'cc_1', name: 'Credit Card', type: 'debt', balance: 400 }),
  ];

  const baseEvents: Event[] = [
    createEvent({ id: 'ev_pay', name: 'Paycheck', event_type: 'inflow', amount: 2000, to_account_id: 'chq_1' }),
    createEvent({ id: 'ev_bill', name: 'Phone Bill', event_type: 'outflow', amount: 100, from_account_id: 'chq_1' }),
  ];

  const baseWorld: PlannerWorld = {
    accounts: baseAccounts,
    events: baseEvents,
    today: '2026-10-11',
    balancesReflectToday: true,
    executedEvents: { '2026-10-11_ev_bill': true },
  };

  it('returns untouched world if no changes are provided', () => {
    const res = applyScenario(baseWorld, []);
    expect(res.accounts).toEqual(baseWorld.accounts);
    expect(res.events).toEqual(baseWorld.events);
    expect(res.forceApplyEventIds.size).toBe(0);
    expect(res.executedEvents).toEqual(baseWorld.executedEvents);
  });

  it('adjusts account balances for BalanceAdjustment changes', () => {
    const changes: ScenarioChange[] = [
      { type: 'adjust_balance', account_id: 'chq_1', delta_cents: 30000 }, // +$300
      { type: 'adjust_balance', account_id: 'chq_1', delta_cents: -5000 }, // -$50
      { type: 'adjust_balance', account_id: 'sav_1', delta_cents: -20000 }, // -$200
    ];

    const res = applyScenario(baseWorld, changes);
    const chq = res.accounts.find((a) => a.id === 'chq_1');
    const sav = res.accounts.find((a) => a.id === 'sav_1');
    const cc = res.accounts.find((a) => a.id === 'cc_1');

    // 1000 + 300 - 50 = 1250
    expect(chq?.balance).toBe(1250);
    // 5000 - 200 = 4800
    expect(sav?.balance).toBe(4800);
    // cc_1 had 0 delta, so unchanged
    expect(cc?.balance).toBe(400);
    expect(res.forceApplyEventIds.size).toBe(0);
  });

  it('applies blueprint changes (skip_event, pause_event, set_amount)', () => {
    const changes: ScenarioChange[] = [
      { type: 'skip_event', event_id: 'ev_pay', date: '2026-10-15' },
      { type: 'set_amount', event_id: 'ev_bill', amount_cents: 15000 }, // $150
    ];

    const res = applyScenario(baseWorld, changes);
    expect(res.executedEvents?.['2026-10-15_ev_pay']).toBe(true);
    expect(res.executedEvents?.['2026-10-11_ev_bill']).toBe(true); // preserves existing
    const bill = res.events.find((e) => e.id === 'ev_bill');
    expect(bill?.amount).toBe(150);
  });

  it('marks newly injected events in forceApplyEventIds', () => {
    const changes: ScenarioChange[] = [
      {
        type: 'add_one_time',
        from_account_id: 'chq_1',
        to_account_id: 'sav_1',
        amount_cents: 25000,
        date: '2026-10-11',
        name: 'Transfer to Savings',
      },
      {
        type: 'pay_debt',
        card_id: 'cc_1',
        from_account_id: 'chq_1',
        amount_cents: 10000,
        date: '2026-10-12',
        name: 'Pay Visa',
      },
    ];

    const res = applyScenario(baseWorld, changes);
    expect(res.events.length).toBe(baseEvents.length + 2);
    expect(res.forceApplyEventIds.size).toBe(2);
    for (const id of res.forceApplyEventIds) {
      expect(res.events.some((e) => e.id === id)).toBe(true);
    }
  });

  it('supports combined balance adjustments and blueprint changes', () => {
    const changes: ScenarioChange[] = [
      { type: 'adjust_balance', account_id: 'chq_1', delta_cents: 5000 },
      {
        type: 'add_one_time',
        from_account_id: 'chq_1',
        amount_cents: 2000,
        date: '2026-10-12',
      },
    ];

    const res = applyScenario(baseWorld, changes);
    expect(res.accounts.find((a) => a.id === 'chq_1')?.balance).toBe(1050);
    expect(res.events.length).toBe(baseEvents.length + 1);
    expect(res.forceApplyEventIds.size).toBe(1);
  });

  it('does not mutate original input world or its accounts/events', () => {
    const originalChqBalance = baseWorld.accounts[0].balance;
    const originalEventsCount = baseWorld.events.length;

    applyScenario(baseWorld, [
      { type: 'adjust_balance', account_id: 'chq_1', delta_cents: 10000 },
      {
        type: 'add_one_time',
        from_account_id: 'chq_1',
        amount_cents: 5000,
        date: '2026-10-12',
      },
    ]);

    expect(baseWorld.accounts[0].balance).toBe(originalChqBalance);
    expect(baseWorld.events.length).toBe(originalEventsCount);
  });
});

describe('projectWorld & Projection Consistency', () => {
  const account1 = createAccount({ id: 'chq_1', name: 'Chequing', balance: 1500, target_floor: 500 });
  const account2 = createAccount({ id: 'sav_1', name: 'Savings', balance: 3000, target_floor: 1000 });

  const eventToday = createEvent({
    id: 'ev_today',
    name: 'Today Grocery',
    event_type: 'outflow',
    amount: 100,
    from_account_id: 'chq_1',
    frequency: 'one-time',
    anchor_date: '2026-10-11',
  });

  const eventFuture = createEvent({
    id: 'ev_future',
    name: 'Future Bill',
    event_type: 'outflow',
    amount: 200,
    from_account_id: 'chq_1',
    frequency: 'one-time',
    anchor_date: '2026-10-14',
  });

  it('produces identical points to projectBalances when balancesReflectToday is false', () => {
    const world: PlannerWorld = {
      accounts: [account1, account2],
      events: [eventToday, eventFuture],
      today: '2026-10-11',
      balancesReflectToday: false,
      executedEvents: {},
    };

    const proj = projectWorld(world, [], 14);
    const directPoints = projectBalances(world.accounts, world.events, proj.start, proj.end, {
      skipTodayEvents: false,
      executedEvents: {},
      forceApplyEventIds: new Set(),
    });

    expect(proj.points).toEqual(directPoints);
    expect(proj.points[0].balances['chq_1']).toBe(1400); // 1500 - 100 today
    expect(proj.points[3].balances['chq_1']).toBe(1200); // 1400 - 200 on Oct 14
  });

  it('produces identical points to projectBalances when balancesReflectToday is true', () => {
    const world: PlannerWorld = {
      accounts: [account1, account2],
      events: [eventToday, eventFuture],
      today: '2026-10-11',
      balancesReflectToday: true,
      executedEvents: {},
    };

    const proj = projectWorld(world, [], 14);
    const directPoints = projectBalances(world.accounts, world.events, proj.start, proj.end, {
      skipTodayEvents: true,
      executedEvents: {},
      forceApplyEventIds: new Set(),
    });

    expect(proj.points).toEqual(directPoints);
    expect(proj.points[0].balances['chq_1']).toBe(1500); // Today's event skipped (already reflected)
    expect(proj.points[3].balances['chq_1']).toBe(1300); // 1500 - 200 on Oct 14
  });

  it('respects executedEvents checklist overrides identical to projectBalances', () => {
    const world: PlannerWorld = {
      accounts: [account1, account2],
      events: [eventToday, eventFuture],
      today: '2026-10-11',
      balancesReflectToday: false,
      executedEvents: { '2026-10-14_ev_future': true },
    };

    const proj = projectWorld(world, [], 14);
    const directPoints = projectBalances(world.accounts, world.events, proj.start, proj.end, {
      skipTodayEvents: false,
      executedEvents: { '2026-10-14_ev_future': true },
      forceApplyEventIds: new Set(),
    });

    expect(proj.points).toEqual(directPoints);
    expect(proj.points[0].balances['chq_1']).toBe(1400); // 1500 - 100
    expect(proj.points[3].balances['chq_1']).toBe(1400); // 1400 (Oct 14 bill skipped because executed)
  });

  it('force applies hypothetical events on today even when balancesReflectToday is true', () => {
    const world: PlannerWorld = {
      accounts: [account1],
      events: [eventToday],
      today: '2026-10-11',
      balancesReflectToday: true,
      executedEvents: {},
    };

    // Add hypothetical one-time outflow on today
    const simChanges: ScenarioChange[] = [
      {
        type: 'add_one_time',
        from_account_id: 'chq_1',
        amount_cents: 30000, // $300
        date: '2026-10-11',
      },
    ];

    const proj = projectWorld(world, simChanges, 7);
    // eventToday is skipped because balancesReflectToday is true,
    // but the hypothetical $300 add_one_time IS applied today!
    expect(proj.points[0].balances['chq_1']).toBe(1200); // 1500 - 300
  });

  it('projects across the requested horizon days', () => {
    const world: PlannerWorld = {
      accounts: [account1],
      events: [],
      today: '2026-10-11',
    };

    const projDefault = projectWorld(world);
    expect(projDefault.points.length).toBe(DEFAULT_HORIZON_DAYS + 1);
    expect(projDefault.start).toBe('2026-10-11');
    expect(projDefault.end).toBe('2026-11-10');

    const proj7 = projectWorld(world, [], 7);
    expect(proj7.points.length).toBe(8); // days 0 to 7
    expect(proj7.end).toBe('2026-10-18');
  });
});

describe('summarizeOutlook', () => {
  const accountChq = createAccount({ id: 'chq_1', name: 'Chequing', balance: 1000, target_floor: 400 });
  const accountDebt = createAccount({ id: 'debt_1', name: 'Credit Card', type: 'debt', balance: 300 });

  it('skips non-cash accounts (debts/liabilities)', () => {
    const world: PlannerWorld = {
      accounts: [accountChq, accountDebt],
      events: [],
      today: '2026-10-11',
    };
    const proj = projectWorld(world, [], 10);
    const outlook = summarizeOutlook(proj);

    expect(outlook['chq_1']).toBeDefined();
    expect(outlook['debt_1']).toBeUndefined();
  });

  it('correctly marks "safe" when balance never dips below floor', () => {
    const world: PlannerWorld = {
      accounts: [accountChq],
      events: [
        createEvent({
          id: 'ev_small',
          amount: 200,
          from_account_id: 'chq_1',
          frequency: 'one-time',
          anchor_date: '2026-10-15',
        }),
      ],
      today: '2026-10-11',
    };
    const proj = projectWorld(world, [], 10);
    const outlook = summarizeOutlook(proj);
    const o = outlook['chq_1'];

    expect(o.status).toBe('safe');
    expect(o.floor_cents).toBe(40000);
    expect(o.start_cents).toBe(100000);
    expect(o.lowest_cents).toBe(80000); // 1000 - 200 = 800 (>= 400 floor)
    expect(o.lowest_date).toBe('2026-10-15');
    expect(o.first_floor_breach).toBeNull();
    expect(o.first_overdraft).toBeNull();
    expect(o.recovery_date).toBeNull();
  });

  it('correctly marks "below_floor" and computes breach and recovery dates', () => {
    const world: PlannerWorld = {
      accounts: [accountChq],
      events: [
        // Dips below $400 floor on Oct 14 to $200
        createEvent({
          id: 'ev_dip',
          amount: 800,
          from_account_id: 'chq_1',
          frequency: 'one-time',
          anchor_date: '2026-10-14',
        }),
        // Recovers on Oct 18 with paycheck +$1000 -> $1200
        createEvent({
          id: 'ev_pay',
          event_type: 'inflow',
          amount: 1000,
          to_account_id: 'chq_1',
          frequency: 'one-time',
          anchor_date: '2026-10-18',
        }),
      ],
      today: '2026-10-11',
    };
    const proj = projectWorld(world, [], 14);
    const outlook = summarizeOutlook(proj);
    const o = outlook['chq_1'];

    expect(o.status).toBe('below_floor');
    expect(o.lowest_cents).toBe(20000); // $200
    expect(o.lowest_date).toBe('2026-10-14');
    expect(o.first_floor_breach).toBe('2026-10-14');
    expect(o.first_overdraft).toBeNull();
    expect(o.recovery_date).toBe('2026-10-18');
    expect(o.end_cents).toBe(120000);
  });

  it('correctly marks "overdraft" when balance dips below 0', () => {
    const world: PlannerWorld = {
      accounts: [accountChq],
      events: [
        createEvent({
          id: 'ev_huge',
          amount: 1200, // starting 1000 -> -200
          from_account_id: 'chq_1',
          frequency: 'one-time',
          anchor_date: '2026-10-16',
        }),
      ],
      today: '2026-10-11',
    };
    const proj = projectWorld(world, [], 10);
    const outlook = summarizeOutlook(proj);
    const o = outlook['chq_1'];

    expect(o.status).toBe('overdraft');
    expect(o.lowest_cents).toBe(-20000);
    expect(o.lowest_date).toBe('2026-10-16');
    expect(o.first_overdraft).toBe('2026-10-16');
    expect(o.first_floor_breach).toBe('2026-10-16');
    expect(o.recovery_date).toBeNull();
  });

  it('handles account without target_floor: safe if >= 0, overdraft if < 0', () => {
    const accNoFloor = createAccount({ id: 'chq_nofloor', balance: 500, target_floor: null });
    const world: PlannerWorld = {
      accounts: [accNoFloor],
      events: [
        createEvent({
          id: 'ev_spend',
          amount: 400,
          from_account_id: 'chq_nofloor',
          frequency: 'one-time',
          anchor_date: '2026-10-12',
        }),
      ],
      today: '2026-10-11',
    };
    const proj = projectWorld(world, [], 5);
    const outlook = summarizeOutlook(proj);
    const o = outlook['chq_nofloor'];

    expect(o.floor_cents).toBeNull();
    expect(o.lowest_cents).toBe(10000);
    expect(o.status).toBe('safe');
    expect(o.first_floor_breach).toBeNull();
  });
});

describe('worstStatus and statusRank', () => {
  it('correctly orders safe < below_floor < overdraft', () => {
    expect(statusRank('safe')).toBe(0);
    expect(statusRank('below_floor')).toBe(1);
    expect(statusRank('overdraft')).toBe(2);
  });

  it('returns worst status in a list of statuses', () => {
    expect(worstStatus(['safe', 'safe'])).toBe('safe');
    expect(worstStatus(['safe', 'below_floor'])).toBe('below_floor');
    expect(worstStatus(['below_floor', 'overdraft', 'safe'])).toBe('overdraft');
    expect(worstStatus([])).toBe('safe');
  });
});

describe('buildSchedule', () => {
  const accountChq = createAccount({ id: 'chq_1', name: 'Main Chequing', balance: 2000 });
  const accountSav = createAccount({ id: 'sav_1', name: 'High Interest Savings', balance: 10000 });

  const eventWeekly = createEvent({
    id: 'ev_groceries',
    name: 'Groceries',
    amount: 150,
    from_account_id: 'chq_1',
    frequency: 'weekly',
    anchor_date: '2026-10-11', // Sunday Oct 11, Oct 18, Oct 25
  });

  const eventMonthly = createEvent({
    id: 'ev_transfer',
    name: 'Savings Transfer',
    event_type: 'transfer',
    amount: 500,
    from_account_id: 'chq_1',
    to_account_id: 'sav_1',
    frequency: 'monthly',
    anchor_date: '2026-10-15',
  });

  it('expands calendar rows with post-event balances in cents', () => {
    const world: PlannerWorld = {
      accounts: [accountChq, accountSav],
      events: [eventWeekly, eventMonthly],
      today: '2026-10-11',
      balancesReflectToday: false,
    };

    const rows = buildSchedule(world, [], '2026-10-11', '2026-10-20');
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const oct11 = rows.find((r) => r.event_id === 'ev_groceries' && r.date === '2026-10-11');
    expect(oct11).toBeDefined();
    expect(oct11?.amount_cents).toBe(15000);
    expect(oct11?.status).toBe('upcoming');
    expect(oct11?.balances_after['chq_1']).toBeDefined();

    const oct15 = rows.find((r) => r.event_id === 'ev_transfer');
    expect(oct15).toBeDefined();
    expect(oct15?.amount_cents).toBe(50000);
    expect(oct15?.balances_after['chq_1']).toBeDefined();
    expect(oct15?.balances_after['sav_1']).toBeDefined();
  });

  it('filters schedule by accountId', () => {
    const world: PlannerWorld = {
      accounts: [accountChq, accountSav],
      events: [eventWeekly, eventMonthly],
      today: '2026-10-11',
    };

    // Groceries only touches chq_1; savings transfer touches both chq_1 and sav_1
    const savRows = buildSchedule(world, [], '2026-10-11', '2026-10-20', 'sav_1');
    expect(savRows.every((r) => r.from_account_id === 'sav_1' || r.to_account_id === 'sav_1')).toBe(true);
    expect(savRows.some((r) => r.event_id === 'ev_groceries')).toBe(false);
  });

  it('tags statuses: done, reflected_today, skipped_in_scenario, scenario', () => {
    const world: PlannerWorld = {
      accounts: [accountChq, accountSav],
      events: [eventWeekly, eventMonthly],
      today: '2026-10-11',
      balancesReflectToday: true,
      executedEvents: {
        '2026-10-15_ev_transfer': true, // User marked done
      },
    };

    const scenarioChanges: ScenarioChange[] = [
      // Skip groceries on Oct 18
      { type: 'skip_event', event_id: 'ev_groceries', date: '2026-10-18' },
      // Inject scenario event
      {
        type: 'add_one_time',
        from_account_id: 'chq_1',
        amount_cents: 8000,
        date: '2026-10-13',
        name: 'Extra Bonus',
      },
    ];

    const rows = buildSchedule(world, scenarioChanges, '2026-10-11', '2026-10-20');

    // Oct 11 Groceries on today with balancesReflectToday=true -> 'reflected_today'
    const oct11 = rows.find((r) => r.event_id === 'ev_groceries' && r.date === '2026-10-11');
    expect(oct11?.status).toBe('reflected_today');

    // Oct 15 Transfer marked done by user -> 'done'
    const oct15 = rows.find((r) => r.event_id === 'ev_transfer');
    expect(oct15?.status).toBe('done');

    // Oct 18 Groceries skipped in scenario -> 'skipped_in_scenario'
    const oct18 = rows.find((r) => r.event_id === 'ev_groceries' && r.date === '2026-10-18');
    expect(oct18?.status).toBe('skipped_in_scenario');

    // Extra Bonus injected one-off -> 'scenario'
    const injected = rows.find((r) => r.name === 'Extra Bonus');
    expect(injected?.status).toBe('scenario');
  });
});

describe('snapshotId', () => {
  const baseWorld: PlannerWorld = {
    accounts: [
      createAccount({ id: 'chq_1', balance: 1000, target_floor: 300 }),
      createAccount({ id: 'sav_1', balance: 5000, target_floor: 1000 }),
    ],
    events: [createEvent({ id: 'ev_1', amount: 100 })],
    executedEvents: { '2026-10-11_ev_1': true },
    balancesReflectToday: true,
    today: '2026-10-11',
  };

  it('generates a stable, deterministic 8-character hex string', () => {
    const id1 = snapshotId(baseWorld);
    const id2 = snapshotId(baseWorld);

    expect(id1).toMatch(/^[0-9a-f]{8}$/);
    expect(id1).toBe(id2);
  });

  it('mutates when accounts change', () => {
    const original = snapshotId(baseWorld);

    const balanceChanged: PlannerWorld = {
      ...baseWorld,
      accounts: [
        createAccount({ id: 'chq_1', balance: 1001, target_floor: 300 }),
        baseWorld.accounts[1],
      ],
    };
    expect(snapshotId(balanceChanged)).not.toBe(original);

    const floorChanged: PlannerWorld = {
      ...baseWorld,
      accounts: [
        createAccount({ id: 'chq_1', balance: 1000, target_floor: 400 }),
        baseWorld.accounts[1],
      ],
    };
    expect(snapshotId(floorChanged)).not.toBe(original);
  });

  it('mutates when events change', () => {
    const original = snapshotId(baseWorld);

    const eventChanged: PlannerWorld = {
      ...baseWorld,
      events: [createEvent({ id: 'ev_1', amount: 150 })],
    };
    expect(snapshotId(eventChanged)).not.toBe(original);
  });

  it('mutates when executedEvents change', () => {
    const original = snapshotId(baseWorld);

    const executedChanged: PlannerWorld = {
      ...baseWorld,
      executedEvents: {
        '2026-10-11_ev_1': true,
        '2026-10-12_ev_2': true,
      },
    };
    expect(snapshotId(executedChanged)).not.toBe(original);
  });

  it('is invariant to key order in executedEvents', () => {
    const worldA: PlannerWorld = {
      ...baseWorld,
      executedEvents: {
        'key_b': true,
        'key_a': true,
      },
    };
    const worldB: PlannerWorld = {
      ...baseWorld,
      executedEvents: {
        'key_a': true,
        'key_b': true,
      },
    };
    expect(snapshotId(worldA)).toBe(snapshotId(worldB));
  });

  it('mutates when balancesReflectToday or today date changes', () => {
    const original = snapshotId(baseWorld);

    const flagChanged: PlannerWorld = {
      ...baseWorld,
      balancesReflectToday: false,
    };
    expect(snapshotId(flagChanged)).not.toBe(original);

    const dateChanged: PlannerWorld = {
      ...baseWorld,
      today: '2026-10-12',
    };
    expect(snapshotId(dateChanged)).not.toBe(original);
  });

  it('mutates when scenario changes are added', () => {
    const original = snapshotId(baseWorld, []);

    const withChanges = snapshotId(baseWorld, [
      { type: 'adjust_balance', account_id: 'chq_1', delta_cents: 5000 },
    ]);
    expect(withChanges).not.toBe(original);
  });
});
