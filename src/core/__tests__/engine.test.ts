import { describe, it, expect } from 'vitest';
import {
  advanceMonth,
  advanceQuarter,
  addBusinessDays,
  getOccurrences,
  nextOccurrence,
  buildCalendar,
} from '../calendar';
import { projectBalances, groupAlertEpisodes } from '../projection';
import { guiltFreeBuffers } from '../buffer';
import {
  blueprintToJson,
  jsonToBlueprint,
  defaultAccounts,
  defaultEvents,
} from '../serialization';
import { Event, Account, Member } from '../models';

function makeEvent(
  frequency: Event['frequency'],
  anchor: string,
  overrides: Partial<Event> = {}
): Event {
  return {
    id: 'test-id',
    name: 'Test',
    event_type: 'inflow',
    amount: 100,
    from_account_id: null,
    to_account_id: 'chq_a',
    frequency,
    anchor_date: anchor,
    active: true,
    execution: 'auto',
    weekend_shift: 'none',
    ...overrides,
  };
}

describe('Calendar Engine', () => {
  it('advanceMonth handles normal and year-wrap', () => {
    expect(advanceMonth(new Date(2026, 0, 15)).getMonth()).toBe(1); // Jan -> Feb
    const decWrap = advanceMonth(new Date(2026, 11, 1));
    expect(decWrap.getFullYear()).toBe(2027);
    expect(decWrap.getMonth()).toBe(0);
  });

  it('advanceQuarter handles normal and year-wrap', () => {
    expect(advanceQuarter(new Date(2026, 0, 1)).getMonth()).toBe(3); // Jan -> Apr
    const novWrap = advanceQuarter(new Date(2026, 10, 1));
    expect(novWrap.getFullYear()).toBe(2027);
    expect(novWrap.getMonth()).toBe(1); // Nov + 3 = Feb
  });

  it('getOccurrences: one-time in and out of range', () => {
    const e = makeEvent('one-time', '2026-03-15');
    expect(getOccurrences(e, '2026-03-01', '2026-03-31')).toEqual(['2026-03-15']);
    expect(getOccurrences(e, '2026-04-01', '2026-04-30')).toEqual([]);
  });

  it('getOccurrences: biweekly and biweekly-offset', () => {
    const e1 = makeEvent('biweekly', '2026-01-02');
    const res1 = getOccurrences(e1, '2026-01-01', '2026-01-31');
    expect(res1).toEqual(['2026-01-02', '2026-01-16', '2026-01-30']);

    const e2 = makeEvent('biweekly-offset', '2026-01-09');
    const res2 = getOccurrences(e2, '2026-01-01', '2026-01-31');
    expect(res2).toEqual(['2026-01-09', '2026-01-23']);
  });

  it('getOccurrences: weekly and monthly', () => {
    const eWeekly = makeEvent('weekly', '2026-01-05');
    const resWeekly = getOccurrences(eWeekly, '2026-01-05', '2026-01-26');
    expect(resWeekly.length).toBe(4);

    const eMonthly = makeEvent('monthly', '2026-01-01');
    const resMonthly = getOccurrences(eMonthly, '2026-01-01', '2026-06-30');
    expect(resMonthly.length).toBe(6);
    expect(resMonthly[0]).toBe('2026-01-01');
    expect(resMonthly[5]).toBe('2026-06-01');
  });

  it('getOccurrences: quarterly and annual', () => {
    const eQ = makeEvent('quarterly', '2026-01-01');
    expect(getOccurrences(eQ, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-01',
      '2026-04-01',
      '2026-07-01',
      '2026-10-01',
    ]);

    const eAnnual = makeEvent('annual', '2026-05-15');
    expect(getOccurrences(eAnnual, '2026-01-01', '2028-12-31')).toEqual([
      '2026-05-15',
      '2027-05-15',
      '2028-05-15',
    ]);
  });

  it('getOccurrences: weekend shift previous and next business day', () => {
    // 2026-01-03 is Saturday
    const ePrev = makeEvent('one-time', '2026-01-03', {
      weekend_shift: 'previous_business_day',
    });
    expect(getOccurrences(ePrev, '2026-01-01', '2026-01-31')).toEqual(['2026-01-02']); // Friday

    const eNext = makeEvent('one-time', '2026-01-03', {
      weekend_shift: 'next_business_day',
    });
    expect(getOccurrences(eNext, '2026-01-01', '2026-01-31')).toEqual(['2026-01-05']); // Monday
  });

  it('getOccurrences: end_date capping and inactive status', () => {
    const eCap = makeEvent('monthly', '2026-01-01', { end_date: '2026-03-31' });
    expect(getOccurrences(eCap, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);

    const eInactive = makeEvent('monthly', '2026-01-01', { active: false });
    expect(getOccurrences(eInactive, '2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('nextOccurrence correctly calculates next date', () => {
    const e = makeEvent('biweekly', '2026-01-03', {
      weekend_shift: 'next_business_day',
    });
    expect(nextOccurrence(e, '2026-01-01')).toBe('2026-01-05');
  });

  it('buildCalendar sorts rows by date YYYY-MM-DD', () => {
    const e1 = makeEvent('one-time', '2026-01-01', { id: 'e1' });
    const e2 = makeEvent('one-time', '2026-01-01', { id: 'e2' });
    const e3 = makeEvent('one-time', '2026-02-01', { id: 'e3' });

    const rows = buildCalendar([e1, e2, e3], '2026-01-01', '2026-02-28');
    expect(rows.length).toBe(3);
    expect(rows[0].id).toBe('e1');
    expect(rows[1].id).toBe('e2');
    expect(rows[2].date).toBe('2026-02-01');
  });
});

describe('Blueprint Serialization', () => {
  it('blueprintToJson & jsonToBlueprint round-trip cleanly', () => {
    const state = {
      members: [{ id: 'A', name: 'Person A' }],
      accounts: [
        {
          id: 'chq_a',
          name: 'Chequing A',
          type: 'chequing' as const,
          owner: 'A',
          balance: 1000,
          interest_rate: 0,
          market_value: 0,
          target_floor: 500,
        },
      ],
      events: [makeEvent('monthly', '2026-01-01', { id: 'e1' })],
    };

    const jsonStr = blueprintToJson(state, { minified: false, compactIds: false });
    const parsed = jsonToBlueprint(jsonStr);

    expect(parsed.current_date).toBeDefined();
    expect(parsed.members.length).toBe(1);
    expect(parsed.accounts.length).toBe(1);
    expect(parsed.accounts[0].target_floor).toBe(500);
    expect(parsed.events[0].id).toBe('e1');
  });

  it('blueprintToJson minifies JSON and compresses long UUIDs when enabled', () => {
    const state = {
      members: [],
      accounts: [
        {
          id: 'long-account-uuid-9999',
          name: 'Long Acc',
          type: 'chequing' as const,
          owner: 'A',
          balance: 100,
        },
      ],
      events: [
        makeEvent('monthly', '2026-01-01', {
          id: 'long-event-uuid-8888',
          name: 'Long Evt',
          event_type: 'transfer',
          amount: 50,
          from_account_id: 'long-account-uuid-9999',
          to_account_id: null,
        }),
      ],
    };

    const minifiedStr = blueprintToJson(state, { minified: true, compactIds: true });
    expect(minifiedStr.includes('\n')).toBe(false); // No line breaks!

    const parsed = jsonToBlueprint(minifiedStr);
    expect(parsed.accounts[0].id).toBe('a1');
    expect(parsed.events[0].id).toBe('e1');
    expect(parsed.events[0].from_account_id).toBe('a1');
  });

  it('sparse json export omits irrelevant fields per account type', () => {
    const state = {
      members: [],
      accounts: [
        {
          id: 'chq_a',
          name: 'Chequing A',
          type: 'chequing' as const,
          owner: 'A',
          balance: 1000,
          market_value: 5000, // Should be omitted for chequing
        },
      ],
      events: [],
    };

    const jsonStr = blueprintToJson(state);
    const rawObj = JSON.parse(jsonStr);
    expect(rawObj.accounts[0].market_value).toBeUndefined();
  });

  it('imports legacy user blueprint JSON cleanly', () => {
    const legacyUserJson = JSON.stringify({
      members: [
        { id: "A", name: "Person A" },
        { id: "B", name: "Person B" }
      ],
      accounts: [
        { id: "chq_a", name: "Chequing A", type: "chequing", owner: "A", balance: 0 },
        { id: "sav1", name: "Emergency Fund", type: "savings", owner: "Joint", balance: 5000 }
      ],
      events: [
        {
          id: "e_pay_a",
          name: "A Paycheque",
          event_type: "inflow",
          amount: 2500,
          from_account_id: null,
          to_account_id: "chq_a",
          frequency: "biweekly",
          anchor_date: "2026-01-02",
          next_occurrence: "2026-09-11"
        }
      ]
    });

    const parsed = jsonToBlueprint(legacyUserJson);
    expect(parsed.members.length).toBe(2);
    expect(parsed.accounts.length).toBe(2);
    expect(parsed.events.length).toBe(1);
    expect(parsed.events[0].id).toBe("e_pay_a");
    expect(parsed.events[0].active).toBe(true);
    expect(parsed.events[0].execution).toBe("auto");
  });

  it('imports real-world complex blueprint with mortgages, credit cards, and transfers', () => {
    const realBlueprintJson = JSON.stringify({
      members: [{ id: "A", name: "R" }, { id: "B", name: "J" }],
      accounts: [
        { id: "chq_r", name: "R Chequing", type: "chequing", owner: "A", balance: 500.0 },
        { id: "condo_mtg", name: "TD Condo Mortgage", type: "liability", owner: "A", balance: 476070.44, market_value: 480000.0 },
        { id: "house_mtg", name: "TD House Mortgage", type: "liability", owner: "Joint", balance: 537258.3, market_value: 840000.0 },
        { id: "td_visa_aa92", name: "TD Visa", type: "debt", owner: "Joint", balance: 0.0, payment_due_date: "2026-09-24" }
      ],
      events: [
        {
          id: "aaa00001-0000-0000-0000-000000000001",
          name: "R Paystub",
          event_type: "inflow",
          amount: 4215.58,
          from_account_id: null,
          to_account_id: "chq_r",
          frequency: "biweekly",
          anchor_date: "2026-01-01"
        }
      ]
    });

    const parsed = jsonToBlueprint(realBlueprintJson);
    expect(parsed.members.length).toBe(2);
    expect(parsed.accounts.length).toBe(4);
    expect(parsed.events.length).toBe(1);
    expect(parsed.accounts[1].market_value).toBe(480000);
  });
});

describe('Cashflow Balance & Net Worth Projections', () => {

  const sampleAccounts: Account[] = [
    { id: 'chq', name: 'Chequing', type: 'chequing', owner: 'A', balance: 1000 },
    { id: 'sav', name: 'Savings', type: 'savings', owner: 'A', balance: 500 },
    { id: 'loc', name: 'LOC', type: 'debt', owner: 'A', balance: 200 },
  ];

  it('projectBalances reflects inflows and outflows correctly', () => {
    const events: Event[] = [
      makeEvent('one-time', '2026-04-01', {
        id: 'e1',
        event_type: 'inflow',
        amount: 500,
        from_account_id: null,
        to_account_id: 'chq',
      }),
      makeEvent('one-time', '2026-04-02', {
        id: 'e2',
        event_type: 'outflow',
        amount: 200,
        from_account_id: 'chq',
        to_account_id: null,
      }),
    ];

    const points = projectBalances(sampleAccounts, events, '2026-04-01', '2026-04-03');
    expect(points[0].balances['chq']).toBe(1500); // 1000 + 500
    expect(points[1].balances['chq']).toBe(1300); // 1500 - 200
  });

  it('projectBalances transfer to debt reduces debt balance and preserves Net Worth', () => {
    // LOC transfer payment of 200
    const events: Event[] = [
      makeEvent('one-time', '2026-04-02', {
        id: 'e1',
        event_type: 'transfer',
        amount: 200,
        from_account_id: 'chq',
        to_account_id: 'loc',
      }),
    ];

    const points = projectBalances(sampleAccounts, events, '2026-04-01', '2026-04-03');
    // Before payment on Apr 01: chq=1000, sav=500, loc=200 -> Assets=1500, Debt=200 -> NW=1300
    expect(points[0].netWorth).toBe(1300);

    // After payment on Apr 02: chq=800, sav=500, loc=0 -> Assets=1300, Debt=0 -> NW=1300
    expect(points[1].balances['chq']).toBe(800);
    expect(points[1].balances['loc']).toBe(0);
    expect(points[1].netWorth).toBe(1300);
  });

  it('projectBalances triggers low balance and target floor alerts', () => {
    const acctsWithFloor: Account[] = [
      { id: 'chq', name: 'Chequing', type: 'chequing', owner: 'A', balance: 300, target_floor: 500 },
    ];
    const events: Event[] = [
      makeEvent('one-time', '2026-04-02', {
        id: 'e1',
        event_type: 'outflow',
        amount: 400,
        from_account_id: 'chq',
        to_account_id: null,
      }),
    ];

    const points = projectBalances(acctsWithFloor, events, '2026-04-01', '2026-04-03');
    // Apr 01: balance 300 < target_floor 500 -> below_floor alert
    expect(points[0].alerts.length).toBe(1);
    expect(points[0].alerts[0].type).toBe('below_floor');

    // Apr 02: balance -100 < 0 -> negative alert
    expect(points[1].alerts.length).toBe(1);
    expect(points[1].alerts[0].type).toBe('negative');

    const episodes = groupAlertEpisodes(points);
    expect(episodes.length).toBe(2);
    expect(episodes[0]).toEqual({
      accountId: 'chq',
      accountName: 'Chequing',
      type: 'below_floor',
      startDate: '2026-04-01',
      endDate: '2026-04-01',
      minBalance: 300,
      threshold: 500,
      durationDays: 1,
    });
    expect(episodes[1]).toEqual({
      accountId: 'chq',
      accountName: 'Chequing',
      type: 'negative',
      startDate: '2026-04-02',
      endDate: '2026-04-03',
      minBalance: -100,
      threshold: 0,
      durationDays: 2,
    });
  });

  it('skipTodayEvents avoids double-counting events scheduled on starting date', () => {
    const accts: Account[] = [
      { id: 'chq_r', name: 'R Chequing', type: 'chequing', owner: 'A', balance: 1092.17, target_floor: 1000 },
    ];
    const events: Event[] = [
      makeEvent('one-time', '2026-09-11', {
        id: 'condo_mtg',
        name: 'Condo Mortgage',
        event_type: 'outflow',
        amount: 1254,
        from_account_id: 'chq_r',
      }),
    ];

    // With skipTodayEvents: true
    const ptsSkipped = projectBalances(accts, events, '2026-09-11', '2026-09-12', { skipTodayEvents: true });
    expect(ptsSkipped[0].balances['chq_r']).toBe(1092.17);
    expect(ptsSkipped[0].alerts.filter((a) => a.type === 'negative').length).toBe(0);

    // With skipTodayEvents: false
    const ptsNotSkipped = projectBalances(accts, events, '2026-09-11', '2026-09-12', { skipTodayEvents: false });
    expect(ptsNotSkipped[0].balances['chq_r']).toBe(1092.17 - 1254);
    expect(ptsNotSkipped[0].alerts.filter((a) => a.type === 'negative').length).toBe(1);
  });

  it('addBusinessDays correctly skips weekends', () => {
    // 2026-01-02 is Friday
    const fri = new Date(2026, 0, 2);
    const settled = addBusinessDays(fri, 3);
    // Friday + 1 = Mon (Jan 5), + 2 = Tue (Jan 6), + 3 = Wed (Jan 7)
    expect(settled.getDate()).toBe(7);
  });

  it('projectBalances handles transfer clearing_days delay accurately', () => {
    const accts: Account[] = [
      { id: 'chq_a', name: 'Chequing A', type: 'chequing', owner: 'A', balance: 1000 },
      { id: 'chq_b', name: 'Chequing B', type: 'chequing', owner: 'B', balance: 500 },
    ];
    // Friday 2026-01-02 transfer of 200 with 3 business days delay
    const evts: Event[] = [
      makeEvent('one-time', '2026-01-02', {
        id: 't1',
        event_type: 'transfer',
        amount: 200,
        from_account_id: 'chq_a',
        to_account_id: 'chq_b',
        clearing_days: 3,
      }),
    ];

    const pts = projectBalances(accts, evts, '2026-01-02', '2026-01-08');
    // Day 0: Jan 02 (Friday) -> A debited immediately to 800, B remains 500
    const dayFri = pts.find((p) => p.date === '2026-01-02')!;
    expect(dayFri.balances['chq_a']).toBe(800);
    expect(dayFri.balances['chq_b']).toBe(500);

    // Day 3: Jan 05 (Monday) -> B remains 500
    const dayMon = pts.find((p) => p.date === '2026-01-05')!;
    expect(dayMon.balances['chq_b']).toBe(500);

    // Day 5: Jan 07 (Wednesday) -> 3rd business day, B credited to 700!
    const dayWed = pts.find((p) => p.date === '2026-01-07')!;
    expect(dayWed.balances['chq_a']).toBe(800);
    expect(dayWed.balances['chq_b']).toBe(700);
  });

  it('simulates user Oct 1 transition loading period without negative balance alerts', () => {
    const rawUserJson = `{"members":[{"id":"A","name":"Member A"},{"id":"B","name":"Member B"}],"accounts":[{"id":"chq_r","name":"Chequing A","type":"chequing","owner":"A","balance":1000,"target_floor":1000},{"id":"chq_j","name":"Chequing B","type":"chequing","owner":"B","balance":0,"target_floor":250},{"id":"hub","name":"Joint Hub","type":"savings","owner":"Joint","balance":3500,"interest_rate":1,"target_floor":3200},{"id":"neo1","name":"Emergency Fund","type":"savings","owner":"Joint","balance":10000,"interest_rate":2.5},{"id":"neo2","name":"Goals Fund","type":"savings","owner":"Joint","balance":0,"interest_rate":2.5},{"id":"a1","name":"Mortgage A","type":"liability","owner":"A","balance":400000,"interest_rate":3.99,"market_value":450000},{"id":"a2","name":"Mortgage B","type":"liability","owner":"Joint","balance":500000,"interest_rate":4.14,"market_value":800000},{"id":"a3","name":"Credit Card 1","type":"debt","owner":"A","balance":0},{"id":"a4","name":"Credit Card 2","type":"debt","owner":"Joint","balance":0}],"events":[{"id":"e1","name":"A Paystub","event_type":"inflow","amount":4000,"to_account_id":"chq_r","frequency":"biweekly","anchor_date":"2026-01-01","next_occurrence":"2026-09-24"},{"id":"e2","name":"Side Income","event_type":"inflow","amount":2000,"to_account_id":"chq_r","frequency":"monthly","anchor_date":"2026-09-01","weekend_shift":"next_business_day","next_occurrence":"2026-10-01"},{"id":"e3","name":"B Paystub","event_type":"inflow","amount":2500,"to_account_id":"chq_j","frequency":"biweekly","anchor_date":"2026-09-17","next_occurrence":"2026-09-17"},{"id":"e4","name":"Mortgage A Outflow","event_type":"outflow","amount":1200,"from_account_id":"chq_r","frequency":"biweekly","anchor_date":"2026-03-27","next_occurrence":"2026-09-25"},{"id":"e5","name":"Maintenance Fees","event_type":"outflow","amount":500,"from_account_id":"chq_r","frequency":"monthly","anchor_date":"2026-08-31","next_occurrence":"2026-09-30"},{"id":"e6","name":"A -> Joint Hub","event_type":"transfer","amount":3000,"from_account_id":"chq_r","to_account_id":"hub","frequency":"biweekly","anchor_date":"2026-09-24","execution":"manual","clearing_days":3,"next_occurrence":"2026-09-24"},{"id":"e7","name":"B -> Joint Hub","event_type":"transfer","amount":2225,"from_account_id":"chq_j","to_account_id":"hub","frequency":"biweekly","anchor_date":"2026-09-17","end_date":"2027-07-01","execution":"manual","clearing_days":3,"next_occurrence":"2026-09-17"},{"id":"e8","name":"Mortgage B Outflow","event_type":"outflow","amount":1300,"from_account_id":"hub","frequency":"biweekly","anchor_date":"2026-04-03","next_occurrence":"2026-09-18"}]}`;
    const bp = jsonToBlueprint(rawUserJson);
    const pts = projectBalances(bp.accounts, bp.events, '2026-09-12', '2026-10-15');

    // Verify zero negative balance alerts after Sept 11 pull
    const postOct1Pts = pts.filter((p) => p.date >= '2026-10-01');
    const negativeAlerts = postOct1Pts.flatMap((p) => p.alerts.filter((a) => a.type === 'negative'));
    expect(negativeAlerts.length).toBe(0);

    // Verify chq_j reaches $275 after B -> Hub transfer on Sept 17
    const sept17 = pts.find((p) => p.date === '2026-09-17')!;
    expect(sept17.balances['chq_j']).toBe(275);
  });
});

describe('Guilt-Free Spending Buffer Calculation', () => {
  it('guiltFreeBuffers calculates average monthly and safe biweekly correctly', () => {
    const accounts: Account[] = [
      { id: 'chq_a', name: 'Chequing A', type: 'chequing', owner: 'A', balance: 0 },
      { id: 'hub', name: 'Hub', type: 'savings', owner: 'Joint', balance: 0 },
    ];
    const events: Event[] = [
      makeEvent('biweekly', '2026-01-02', {
        id: 'e1',
        event_type: 'inflow',
        amount: 2500,
        from_account_id: null,
        to_account_id: 'chq_a',
      }),
      makeEvent('monthly', '2026-01-01', {
        id: 'e2',
        event_type: 'outflow',
        amount: 400,
        from_account_id: 'chq_a',
        to_account_id: null,
      }),
      makeEvent('biweekly', '2026-01-02', {
        id: 'e3',
        event_type: 'transfer',
        amount: 1500,
        from_account_id: 'chq_a',
        to_account_id: 'hub',
      }),
    ];

    const res = guiltFreeBuffers(accounts, events);
    expect(res['A']).toBeDefined();
    const { avgMonthly, safeBiweekly } = res['A'];

    const expectedMonthly = 2500 * (26 / 12) - 400 - 1500 * (26 / 12);
    expect(Math.abs(avgMonthly - expectedMonthly)).toBeLessThan(0.01);
    expect(Math.abs(safeBiweekly - (expectedMonthly * 12 / 26))).toBeLessThan(0.01);
  });

  it('guiltFreeBuffers default data integrity check', () => {
    const accts = defaultAccounts();
    const evts = defaultEvents();
    const accountIds = new Set(accts.map((a) => a.id));

    for (const e of evts) {
      if (e.from_account_id) expect(accountIds.has(e.from_account_id)).toBe(true);
      if (e.to_account_id) expect(accountIds.has(e.to_account_id)).toBe(true);
    }
  });
});
