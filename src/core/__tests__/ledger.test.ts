import { describe, it, expect } from 'vitest';
import { generateLedgerContext } from '../ledger';
import { Account, Event } from '../models';

describe('generateLedgerContext', () => {
  const accounts: Account[] = [
    {
      id: 'hub',
      name: 'EQ Hub',
      type: 'savings',
      owner: 'user',
      balance: 1000,
      target_floor: 500,
    },
  ];

  const events: Event[] = [
    {
      id: 'e_bill',
      name: 'Large Bill',
      event_type: 'outflow',
      amount: 800,
      from_account_id: 'hub',
      to_account_id: null,
      frequency: 'one-time',
      anchor_date: '2026-10-15',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
  ];

  it('reports breach and lowest balance when bill is active', () => {
    const text = generateLedgerContext(accounts, events, 30);
    expect(text).toContain('Lowest 200 on 2026-10-15');
    expect(text).toContain('FIRST BREACH: 2026-10-15');
  });

  it('respects executedEvents options so skipped bills do not trigger breach', () => {
    const text = generateLedgerContext(accounts, events, 30, {
      executedEvents: { '2026-10-15_e_bill': true },
    });
    // With bill skipped, balance stays at 1000, which is above floor 500
    expect(text).toContain('Lowest 1000');
    expect(text).not.toContain('FIRST BREACH');
  });
});
