import { describe, it, expect } from 'vitest';
import { getValidatedToolSchema } from '../tools';
import { Account, Event } from '../models';

describe('Tool Zod Validation', () => {
  const accounts: Account[] = [
    { id: 'hub', name: 'Hub', type: 'chequing', owner: 'joint', balance: 5000 },
    { id: 'card', name: 'Credit Card', type: 'debt', owner: 'joint', balance: 1000 },
  ];
  const events: Event[] = [
    { id: 'ev1', name: 'Rent', event_type: 'outflow', amount: 150000, frequency: 'monthly', anchor_date: '2026-10-15', from_account_id: 'hub', to_account_id: null, active: true, execution: 'manual', weekend_shift: 'none' }
  ];
  const today = '2026-10-10';

  const schema = getValidatedToolSchema(accounts, events, today);

  it('validates unknown event ID', () => {
    const res = schema.safeParse({ changes: [{ type: 'skip_event', event_id: 'unknown_ev', date: '2026-10-15' }] });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain('Unknown event_id: unknown_ev');
    }
  });

  it('validates past dates', () => {
    const res = schema.safeParse({ changes: [{ type: 'skip_event', event_id: 'ev1', date: '2026-10-09' }] });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain('Date cannot be in the past');
    }
  });

  it('validates over-balance pay_debt', () => {
    const res = schema.safeParse({ changes: [{ type: 'pay_debt', card_id: 'card', from_account_id: 'hub', amount_cents: 150000, date: '2026-10-15' }] });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain('exceeds card balance 100000');
    }
  });

  it('accepts valid changes', () => {
    const res = schema.safeParse({ changes: [{ type: 'pay_debt', card_id: 'card', from_account_id: 'hub', amount_cents: 50000, date: '2026-10-15' }] });
    expect(res.success).toBe(true);
  });
});
