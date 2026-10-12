import { describe, it, expect } from 'vitest';
import {
  TOOL_DEFINITIONS,
  READ_TOOLS,
  AWAIT_USER_TOOLS,
  prettyDate,
  describeChange,
  describeTransaction,
  validateChanges,
  transactionsToAdjustments,
  executeTool,
  ToolValidationError,
  ToolContext,
} from '../toolkit';
import { Account, Event } from '../../models';
import { PlannerWorld, ScenarioChange } from '../world';

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
    id: 'ev_pay',
    name: 'Paycheck',
    event_type: 'inflow',
    amount: 1500,
    from_account_id: null,
    to_account_id: 'chq_main',
    frequency: 'biweekly',
    anchor_date: '2026-10-15',
    active: true,
    execution: 'auto',
    weekend_shift: 'none',
    ...overrides,
  };
}

function createToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  const accounts: Account[] = [
    createAccount({ id: 'chq_main', name: 'Main Chequing', balance: 2500, target_floor: 500 }),
    createAccount({ id: 'sav_eq', name: 'EQ Savings', balance: 4000, target_floor: 1000 }),
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

describe('Tool Definitions and Categorization', () => {
  it('defines exactly the 5 standardized tools with valid function signatures', () => {
    expect(TOOL_DEFINITIONS.length).toBe(5);
    const names = TOOL_DEFINITIONS.map((t) => t.function.name);
    expect(names).toContain('get_snapshot');
    expect(names).toContain('get_schedule');
    expect(names).toContain('simulate');
    expect(names).toContain('propose_blueprint_changes');
    expect(names).toContain('record_actual');
  });

  it('correctly partitions read vs await_user tools', () => {
    expect(READ_TOOLS.has('get_snapshot')).toBe(true);
    expect(READ_TOOLS.has('get_schedule')).toBe(true);
    expect(READ_TOOLS.has('simulate')).toBe(false);

    expect(AWAIT_USER_TOOLS.has('propose_blueprint_changes')).toBe(true);
    expect(AWAIT_USER_TOOLS.has('record_actual')).toBe(true);
    expect(AWAIT_USER_TOOLS.has('simulate')).toBe(false);
  });
});

describe('Human Descriptions & Formatting', () => {
  const accounts: Account[] = [
    createAccount({ id: 'chq_main', name: 'Main Chequing' }),
    createAccount({ id: 'sav_eq', name: 'EQ Savings' }),
    createAccount({ id: 'cc_visa', name: 'Visa', type: 'debt', balance: 500 }),
  ];

  const events: Event[] = [
    createEvent({ id: 'ev_rent', name: 'Rent' }),
  ];

  describe('prettyDate', () => {
    it('formats ISO dates into short friendly strings', () => {
      expect(prettyDate('2026-10-15')).toBe('Thu Oct 15');
      expect(prettyDate('')).toBe('');
      expect(prettyDate(null)).toBe('');
      expect(prettyDate(undefined)).toBe('');
    });

    it('falls back to raw string on invalid date', () => {
      expect(prettyDate('not-a-date')).toBe('not-a-date');
    });
  });

  describe('describeChange', () => {
    it('formats skip_event', () => {
      const c: ScenarioChange = { type: 'skip_event', event_id: 'ev_rent', date: '2026-10-15' };
      expect(describeChange(c, accounts, events)).toBe('Skip "Rent" on Thu Oct 15');
    });

    it('formats pause_event', () => {
      const c: ScenarioChange = {
        type: 'pause_event',
        event_id: 'ev_rent',
        from_date: '2026-10-15',
        to_date: '2026-10-31',
      };
      expect(describeChange(c, accounts, events)).toBe('Pause "Rent" Thu Oct 15 – Sat Oct 31');
    });

    it('formats move_event', () => {
      const c: ScenarioChange = {
        type: 'move_event',
        event_id: 'ev_rent',
        from_date: '2026-10-15',
        to_date: '2026-10-20',
      };
      expect(describeChange(c, accounts, events)).toBe('Move "Rent" from Thu Oct 15 to Tue Oct 20');
    });

    it('formats set_amount', () => {
      const c: ScenarioChange = { type: 'set_amount', event_id: 'ev_rent', amount_cents: 135000 };
      expect(describeChange(c, accounts, events)).toBe('Set "Rent" to $1,350.00');
    });

    it('formats pay_debt', () => {
      const c: ScenarioChange = {
        type: 'pay_debt',
        card_id: 'cc_visa',
        from_account_id: 'chq_main',
        amount_cents: 25000,
        date: '2026-10-15',
      };
      expect(describeChange(c, accounts, events)).toBe(
        'Pay $250.00 to Visa from Main Chequing on Thu Oct 15'
      );
    });

    it('formats add_one_time transfer and expense', () => {
      const transfer: ScenarioChange = {
        type: 'add_one_time',
        from_account_id: 'chq_main',
        to_account_id: 'sav_eq',
        amount_cents: 320000,
        date: '2026-10-15',
      };
      expect(describeChange(transfer, accounts, events)).toBe(
        'Transfer $3,200.00 Main Chequing → EQ Savings on Thu Oct 15'
      );

      const expense: ScenarioChange = {
        type: 'add_one_time',
        from_account_id: 'chq_main',
        amount_cents: 4500,
        date: '2026-10-15',
      };
      expect(describeChange(expense, accounts, events)).toBe(
        'One-off $45.00 expense from Main Chequing on Thu Oct 15'
      );
    });

    it('formats adjust_balance', () => {
      const plus: ScenarioChange = {
        type: 'adjust_balance',
        account_id: 'chq_main',
        delta_cents: 320000,
        note: 'assumed landed',
      };
      expect(describeChange(plus, accounts, events)).toBe('Main Chequing +$3,200.00 (assumed landed)');

      const minus: ScenarioChange = {
        type: 'adjust_balance',
        account_id: 'chq_main',
        delta_cents: -5000,
      };
      expect(describeChange(minus, accounts, events)).toBe('Main Chequing −$50.00');
    });
  });

  describe('describeTransaction', () => {
    it('formats transfer, outflow, and inflow transactions', () => {
      expect(
        describeTransaction(
          { from_account_id: 'chq_main', to_account_id: 'sav_eq', amount_cents: 50000, date: '2026-10-11' },
          accounts
        )
      ).toBe('$500.00 Main Chequing → EQ Savings on Sun Oct 11');

      expect(
        describeTransaction(
          { from_account_id: 'chq_main', amount_cents: 3500, date: '2026-10-11' },
          accounts
        )
      ).toBe('$35.00 out of Main Chequing on Sun Oct 11');

      expect(
        describeTransaction(
          { to_account_id: 'sav_eq', amount_cents: 100000, date: '2026-10-11' },
          accounts
        )
      ).toBe('$1,000.00 into EQ Savings on Sun Oct 11');
    });
  });
});

describe('validateChanges', () => {
  const ctx = createToolContext();
  const world = ctx.world;

  it('rejects empty changes array with helpful error mentioning get_snapshot', () => {
    expect(() => validateChanges([], world)).toThrowError(ToolValidationError);
    expect(() => validateChanges([], world)).toThrowError(
      /To read the current state use get_snapshot or get_schedule/
    );
  });

  it('rejects non-array changes', () => {
    expect(() => validateChanges(null, world)).toThrowError(ToolValidationError);
    expect(() => validateChanges('changes', world)).toThrowError(ToolValidationError);
  });

  it('rejects changes with dates in the past', () => {
    // world.today is 2026-10-11
    const pastChange = [
      {
        type: 'skip_event',
        event_id: 'ev_rent',
        date: '2026-10-09', // In the past!
      },
    ];
    expect(() => validateChanges(pastChange, world)).toThrowError(ToolValidationError);
    expect(() => validateChanges(pastChange, world)).toThrowError(/is in the past/);
  });

  it('rejects invalid date formats', () => {
    const invalidDate = [
      {
        type: 'skip_event',
        event_id: 'ev_rent',
        date: '10/15/2026',
      },
    ];
    expect(() => validateChanges(invalidDate, world)).toThrowError(ToolValidationError);
  });

  it('rejects pause_event when from_date is after to_date', () => {
    const invertedPause = [
      {
        type: 'pause_event',
        event_id: 'ev_rent',
        from_date: '2026-10-25',
        to_date: '2026-10-20',
      },
    ];
    expect(() => validateChanges(invertedPause, world)).toThrowError(ToolValidationError);
    expect(() => validateChanges(invertedPause, world)).toThrowError(/from_date is after to_date/);
  });

  it('rejects unknown event_id', () => {
    const unknownEvent = [
      {
        type: 'skip_event',
        event_id: 'non_existent_event',
        date: '2026-10-15',
      },
    ];
    expect(() => validateChanges(unknownEvent, world)).toThrowError(ToolValidationError);
    expect(() => validateChanges(unknownEvent, world)).toThrowError(/unknown event_id/);
  });

  it('rejects unknown accounts in add_one_time or pay_debt', () => {
    const unknownAcc = [
      {
        type: 'add_one_time',
        from_account_id: 'ghost_account',
        amount_cents: 5000,
        date: '2026-10-15',
      },
    ];
    expect(() => validateChanges(unknownAcc, world)).toThrowError(ToolValidationError);
    expect(() => validateChanges(unknownAcc, world)).toThrowError(/unknown from_account_id/);
  });

  it('rejects non-positive amount_cents', () => {
    const zeroAmount = [
      {
        type: 'add_one_time',
        from_account_id: 'chq_main',
        amount_cents: 0,
        date: '2026-10-15',
      },
    ];
    expect(() => validateChanges(zeroAmount, world)).toThrowError(ToolValidationError);
  });

  it('rejects pay_debt exceeding credit card balance', () => {
    // cc_visa balance is 800 (80000 cents)
    const overPayment = [
      {
        type: 'pay_debt',
        card_id: 'cc_visa',
        from_account_id: 'chq_main',
        amount_cents: 100000, // $1000 > $800 balance
        date: '2026-10-15',
      },
    ];
    expect(() => validateChanges(overPayment, world)).toThrowError(ToolValidationError);
    expect(() => validateChanges(overPayment, world)).toThrowError(/exceeds Visa Infinite balance/);
  });

  it('accepts valid changes across all types', () => {
    const valid = [
      { type: 'skip_event', event_id: 'ev_rent', date: '2026-10-14' },
      { type: 'pause_event', event_id: 'ev_pay', from_date: '2026-10-15', to_date: '2026-10-31' },
      { type: 'set_amount', event_id: 'ev_rent', amount_cents: 110000 },
      { type: 'add_one_time', from_account_id: 'chq_main', to_account_id: 'sav_eq', amount_cents: 50000, date: '2026-10-15' },
      { type: 'pay_debt', card_id: 'cc_visa', from_account_id: 'chq_main', amount_cents: 50000, date: '2026-10-15' },
    ];
    const result = validateChanges(valid, world);
    expect(result.length).toBe(5);
  });
});

describe('transactionsToAdjustments', () => {
  const accounts: Account[] = [
    createAccount({ id: 'chq_1', name: 'Chequing', type: 'chequing', balance: 1000 }),
    createAccount({ id: 'sav_1', name: 'Savings', type: 'savings', balance: 3000 }),
    createAccount({ id: 'cc_1', name: 'Credit Card', type: 'debt', balance: 500 }),
  ];

  it('correctly handles cash outflows and inflows', () => {
    const txOut = [{ from_account_id: 'chq_1', amount_cents: 10000 }];
    const adjOut = transactionsToAdjustments(txOut, accounts);
    expect(adjOut).toEqual([
      { type: 'adjust_balance', account_id: 'chq_1', delta_cents: -10000, note: undefined },
    ]);

    const txIn = [{ to_account_id: 'sav_1', amount_cents: 20000 }];
    const adjIn = transactionsToAdjustments(txIn, accounts);
    expect(adjIn).toEqual([
      { type: 'adjust_balance', account_id: 'sav_1', delta_cents: 20000, note: undefined },
    ]);
  });

  it('correctly handles transfers between cash accounts', () => {
    const tx = [{ from_account_id: 'chq_1', to_account_id: 'sav_1', amount_cents: 320000 }];
    const adj = transactionsToAdjustments(tx, accounts, 'transferred');
    expect(adj).toEqual([
      { type: 'adjust_balance', account_id: 'chq_1', delta_cents: -320000, note: 'transferred' },
      { type: 'adjust_balance', account_id: 'sav_1', delta_cents: 320000, note: 'transferred' },
    ]);
  });

  it('handles debt repayment and debt charges with sign-awareness', () => {
    // Paying debt (transfer from chq_1 to cc_1)
    // Money arrives in debt account -> debt balance DECREASES (-delta)
    const payDebt = [{ from_account_id: 'chq_1', to_account_id: 'cc_1', amount_cents: 25000 }];
    const adjPay = transactionsToAdjustments(payDebt, accounts);
    expect(adjPay).toEqual([
      { type: 'adjust_balance', account_id: 'chq_1', delta_cents: -25000, note: undefined },
      { type: 'adjust_balance', account_id: 'cc_1', delta_cents: -25000, note: undefined },
    ]);

    // Charging on debt (money leaves debt account to pay for something)
    // Money leaves debt account -> debt balance INCREASES (+delta)
    const chargeDebt = [{ from_account_id: 'cc_1', amount_cents: 5000 }];
    const adjCharge = transactionsToAdjustments(chargeDebt, accounts);
    expect(adjCharge).toEqual([
      { type: 'adjust_balance', account_id: 'cc_1', delta_cents: 5000, note: undefined },
    ]);
  });
});

describe('executeTool: Core Dispatcher & Error Handling', () => {
  const ctx = createToolContext();

  it('returns failure when arguments are invalid JSON string', () => {
    const res = executeTool('get_snapshot', '{ invalid json }', ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Arguments were not valid JSON.');
  });

  it('returns failure for unknown tool name', () => {
    const res = executeTool('hack_the_bank', {}, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Unknown tool "hack_the_bank"/);
  });

  it('catches ToolValidationError and returns clean failure message', () => {
    const res = executeTool('simulate', { label: 'Empty', changes: [] }, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/To read the current state use get_snapshot or get_schedule/);
  });
});

describe('executeTool: get_snapshot', () => {
  const ctx = createToolContext();

  it('returns live account balances, floors, headroom, and status', () => {
    const res = executeTool('get_snapshot', {}, ctx);
    expect(res.ok).toBe(true);
    expect(res.name).toBe('get_snapshot');
    expect(res.snapshot_id).toMatch(/^[0-9a-f]{8}$/);
    expect(res.result.as_of).toBe('2026-10-11');
    expect(res.result.balances_reflect_today).toBe(true);

    const accounts = res.result.accounts;
    expect(accounts.length).toBe(2); // 2 cash accounts (chq_main, sav_eq)

    const chq = accounts.find((a: any) => a.account_id === 'chq_main');
    expect(chq.balance).toBe('$2,500.00');
    expect(chq.floor).toBe('$500.00');
    expect(chq.headroom).toBe('$2,000.00');

    // Debts array includes non-cash accounts
    const debts = res.result.debts;
    expect(debts.length).toBe(1);
    expect(debts[0].account_id).toBe('cc_visa');
    expect(debts[0].balance_owed).toBe('$800.00');
  });

  it('emits comprehensive FigureSource list for provenance tracking', () => {
    const res = executeTool('get_snapshot', {}, ctx);
    expect(res.sources.length).toBeGreaterThan(0);

    const chqBalanceSource = res.sources.find((s) => s.label.includes('Main Chequing · balance now'));
    expect(chqBalanceSource).toBeDefined();
    expect(chqBalanceSource?.cents).toBe(250000);

    const chqFloorSource = res.sources.find((s) => s.label.includes('Main Chequing · target floor'));
    expect(chqFloorSource).toBeDefined();
    expect(chqFloorSource?.cents).toBe(50000);

    const chqHeadroomSource = res.sources.find(
      (s) => s.label.includes('Main Chequing · headroom above floor now')
    );
    expect(chqHeadroomSource).toBeDefined();
    expect(chqHeadroomSource?.cents).toBe(200000);

    const debtSource = res.sources.find((s) => s.label.includes('Visa Infinite · balance owed'));
    expect(debtSource).toBeDefined();
    expect(debtSource?.cents).toBe(80000);
  });

  it('reflects active scenario assumptions in context', () => {
    const ctxWithAssumption = createToolContext({
      assumptions: [{ type: 'adjust_balance', account_id: 'chq_main', delta_cents: 50000 }],
      assumptionLabels: ['Assumed bonus +$500'],
    });

    const res = executeTool('get_snapshot', {}, ctxWithAssumption);
    expect(res.result.active_assumptions).toEqual(['Assumed bonus +$500']);
    const chq = res.result.accounts.find((a: any) => a.account_id === 'chq_main');
    expect(chq.balance).toBe('$3,000.00'); // 2500 + 500
  });

  it('exposes applied_plan_skips when executedEvents contains applied skips', () => {
    const baseCtx = createToolContext();
    const ctxWithSkips = createToolContext({
      world: {
        ...baseCtx.world,
        executedEvents: { '2026-10-15_ev_rent': true },
      },
    });

    const res = executeTool('get_snapshot', {}, ctxWithSkips);
    expect(res.ok).toBe(true);
    expect(res.result.applied_plan_skips).toContain('2026-10-15: Rent (skipped/executed in plan)');
  });
});

describe('executeTool: get_schedule', () => {
  const ctx = createToolContext();

  it('expands calendar rows across requested date window', () => {
    const res = executeTool(
      'get_schedule',
      { from_date: '2026-10-11', to_date: '2026-10-20' },
      ctx
    );
    expect(res.ok).toBe(true);
    expect(res.name).toBe('get_schedule');
    expect(res.result.from).toBe('2026-10-11');
    expect(res.result.to).toBe('2026-10-20');
    expect(res.result.days).toBe(10);

    const events = res.result.events;
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.some((e: any) => e.name === 'Rent')).toBe(true);
    expect(events.some((e: any) => e.name === 'Paycheck')).toBe(true);
  });

  it('filters schedule by account_id', () => {
    const res = executeTool(
      'get_schedule',
      { from_date: '2026-10-11', to_date: '2026-10-20', account_id: 'sav_eq' },
      ctx
    );
    expect(res.ok).toBe(true);
    expect(res.result.account).toBe('EQ Savings');
    // Rent and Paycheck only touch chq_main
    expect(res.result.events.length).toBe(0);
  });

  it('throws ToolValidationError when filtering by unknown account_id', () => {
    const res = executeTool(
      'get_schedule',
      { from_date: '2026-10-11', to_date: '2026-10-20', account_id: 'unknown_account' },
      ctx
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Unknown account_id "unknown_account"/);
  });

  it('clamps from_date and to_date boundaries safely', () => {
    // from_date in past clamped to today
    // to_date > 62 days clamped to maxTo
    const res = executeTool(
      'get_schedule',
      { from_date: '2026-10-01', to_date: '2026-12-31' },
      ctx
    );
    expect(res.ok).toBe(true);
    expect(res.result.from).toBe('2026-10-11'); // Clamped to today
    expect(res.result.to).toBe('2026-12-12'); // Clamped to today + 62 days
  });

  it('emits FigureSources for event amounts and balances_after', () => {
    const res = executeTool(
      'get_schedule',
      { from_date: '2026-10-11', to_date: '2026-10-20' },
      ctx
    );
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.sources.some((s) => s.label.includes('Rent'))).toBe(true);
    expect(res.sources.some((s) => s.label.includes('Main Chequing · end of'))).toBe(true);
  });
});

describe('executeTool: simulate', () => {
  const ctx = createToolContext();

  it('rejects empty changes array with ToolValidationError', () => {
    const res = executeTool('simulate', { label: 'Empty', changes: [] }, ctx);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/No changes provided/);
  });

  it('rejects past dates in simulation changes', () => {
    const res = executeTool(
      'simulate',
      {
        label: 'Past Sim',
        changes: [{ type: 'skip_event', event_id: 'ev_rent', date: '2026-10-05' }],
      },
      ctx
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/is in the past/);
  });

  it('simulates valid changes and returns before/after comparisons and figure sources', () => {
    const res = executeTool(
      'simulate',
      {
        label: 'Skip Rent',
        changes: [{ type: 'skip_event', event_id: 'ev_rent', date: '2026-10-14' }],
      },
      ctx
    );

    expect(res.ok).toBe(true);
    expect(res.name).toBe('simulate');
    expect(res.awaitsUser).toBe(false);
    expect(res.label).toBe('Skip Rent');
    expect(res.summary).toMatch(/Simulated "Skip Rent"/);

    // Accounts changed
    const changed = res.result.accounts_changed;
    expect(changed.length).toBe(1);
    expect(changed[0].account_id).toBe('chq_main');
    // Rent was $1200, so lowest balance improves by +$1,200.00
    expect(changed[0].change_in_lowest).toBe('$1,200.00');

    // Emits figure sources
    expect(res.sources.length).toBeGreaterThan(0);
    expect(
      res.sources.some((s) => s.label.includes('change in lowest balance ("Skip Rent")'))
    ).toBe(true);
    expect(
      res.sources.some((s) => s.label.includes('change in ending balance ("Skip Rent")'))
    ).toBe(true);
  });

  it('flags worsened accounts in new_problems', () => {
    // Starting balance 2500, floor 500. Add $2300 expense on Oct 13 -> drops to $200 (below floor!)
    const res = executeTool(
      'simulate',
      {
        label: 'Big Shopping',
        changes: [
          {
            type: 'add_one_time',
            from_account_id: 'chq_main',
            amount_cents: 230000,
            date: '2026-10-13',
          },
        ],
      },
      ctx
    );

    expect(res.ok).toBe(true);
    expect(res.result.new_problems.length).toBeGreaterThan(0);
    expect(res.result.new_problems[0]).toMatch(/Main Chequing becomes OVERDRAFT \(below \$0\)/);
  });
});

describe('executeTool: propose_blueprint_changes', () => {
  const ctx = createToolContext();

  it('returns awaitsUser: true and review status', () => {
    const res = executeTool(
      'propose_blueprint_changes',
      {
        label: 'Skip Rent Proposal',
        changes: [{ type: 'skip_event', event_id: 'ev_rent', date: '2026-10-14' }],
      },
      ctx
    );

    expect(res.ok).toBe(true);
    expect(res.name).toBe('propose_blueprint_changes');
    expect(res.awaitsUser).toBe(true);
    expect(res.result.status).toBe('shown_to_user_for_review');
    expect(res.result.message).toMatch(/The user now sees Apply \/ Reject/);
  });

  it('defaults label to "Proposed changes" when omitted', () => {
    const res = executeTool(
      'propose_blueprint_changes',
      {
        changes: [{ type: 'skip_event', event_id: 'ev_rent', date: '2026-10-14' }],
      },
      ctx
    );

    expect(res.ok).toBe(true);
    expect(res.label).toBe('Proposed changes');
  });
});

describe('executeTool: record_actual', () => {
  const ctx = createToolContext();

  it('validates transactions: rejects empty transactions', () => {
    const res = executeTool(
      'record_actual',
      { description: 'Nothing', transactions: [] },
      ctx
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/record_actual needs at least one transaction/);
  });

  it('validates transactions: rejects non-positive or non-integer amounts', () => {
    const resZero = executeTool(
      'record_actual',
      {
        description: 'Zero',
        transactions: [{ from_account_id: 'chq_main', amount_cents: 0 }],
      },
      ctx
    );
    expect(resZero.ok).toBe(false);
    expect(resZero.error).toMatch(/amount_cents must be a positive integer/);

    const resFloat = executeTool(
      'record_actual',
      {
        description: 'Float',
        transactions: [{ from_account_id: 'chq_main', amount_cents: 12.34 }],
      },
      ctx
    );
    expect(resFloat.ok).toBe(false);
  });

  it('validates transactions: rejects future dates', () => {
    const resFuture = executeTool(
      'record_actual',
      {
        description: 'Future transfer',
        transactions: [
          {
            from_account_id: 'chq_main',
            to_account_id: 'sav_eq',
            amount_cents: 50000,
            date: '2026-10-25', // Future!
          },
        ],
      },
      ctx
    );
    expect(resFuture.ok).toBe(false);
    expect(resFuture.error).toMatch(/not in the future \(for future moves use simulate\)/);
  });

  it('validates transactions: rejects missing accounts or unknown accounts', () => {
    const resNoAcc = executeTool(
      'record_actual',
      {
        description: 'No acc',
        transactions: [{ amount_cents: 5000 }],
      },
      ctx
    );
    expect(resNoAcc.ok).toBe(false);
    expect(resNoAcc.error).toMatch(/needs from_account_id and\/or to_account_id/);

    const resUnknown = executeTool(
      'record_actual',
      {
        description: 'Bad acc',
        transactions: [{ from_account_id: 'phantom', amount_cents: 5000 }],
      },
      ctx
    );
    expect(resUnknown.ok).toBe(false);
    expect(resUnknown.error).toMatch(/unknown from_account_id/);
  });

  it('executes valid past transfer with balance previews and awaitsUser: true', () => {
    // Transfer $1,000 from chq_main ($2500) to sav_eq ($4000)
    const res = executeTool(
      'record_actual',
      {
        description: 'Transferred $1000 to EQ Savings',
        transactions: [
          {
            from_account_id: 'chq_main',
            to_account_id: 'sav_eq',
            amount_cents: 100000,
            date: '2026-10-10', // In the past
          },
        ],
      },
      ctx
    );

    expect(res.ok).toBe(true);
    expect(res.name).toBe('record_actual');
    expect(res.awaitsUser).toBe(true);
    expect(res.result.status).toBe('awaiting_user_choice');
    expect(res.result.instructions).toMatch(/The user is now choosing/);

    const preview = res.result.balance_preview;
    expect(preview.length).toBe(2);

    const chqPreview = preview.find((p: any) => p.account === 'Main Chequing');
    expect(chqPreview.before).toBe('$2,500.00');
    expect(chqPreview.after).toBe('$1,500.00');

    const savPreview = preview.find((p: any) => p.account === 'EQ Savings');
    expect(savPreview.before).toBe('$4,000.00');
    expect(savPreview.after).toBe('$5,000.00');

    // Emits figure sources
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.sources.some((s) => s.label.includes('Transferred $1000 to EQ Savings · amount'))).toBe(true);
  });

  it('surfaces new risks if the recorded transaction creates a floor breach or overdraft', () => {
    // Starting balance is $2500, floor is $500, rent is $1200 on Oct 14.
    // If we record a past outflow of $1500 from chq_main:
    // starting balance becomes $1000.
    // On Oct 14, rent ($1200) drops it to -$200 (overdraft!).
    const res = executeTool(
      'record_actual',
      {
        description: 'Spent $1500 cash',
        transactions: [
          {
            from_account_id: 'chq_main',
            amount_cents: 150000,
            date: '2026-10-10',
          },
        ],
      },
      ctx
    );

    expect(res.ok).toBe(true);
    expect(res.result.new_risks_if_landed.length).toBeGreaterThan(0);
    expect(res.result.new_risks_if_landed[0]).toMatch(/Main Chequing would project -\$200\.00/);
    expect(res.result.new_risks_if_landed[0]).toMatch(/overdraft/);
  });
});
