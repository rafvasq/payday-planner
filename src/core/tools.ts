import { getOccurrences } from './calendar';
import { z } from 'zod';
import { Account, Event } from './models';

export const SkipEventSchema = z.object({
  type: z.literal('skip_event'),
  event_id: z.string(),
  date: z.string() // YYYY-MM-DD
});

export const PauseEventSchema = z.object({
  type: z.literal('pause_event'),
  event_id: z.string(),
  from_date: z.string(),
  to_date: z.string()
});

export const MoveEventSchema = z.object({
  type: z.literal('move_event'),
  event_id: z.string(),
  from_date: z.string(),
  to_date: z.string()
});

export const SetAmountSchema = z.object({
  type: z.literal('set_amount'),
  event_id: z.string(),
  amount_cents: z.number().int()
});

export const PayDebtSchema = z.object({
  type: z.literal('pay_debt'),
  card_id: z.string(),
  from_account_id: z.string(),
  amount_cents: z.number().int(),
  date: z.string()
});

export const AddOneTimeSchema = z.object({
  type: z.literal('add_one_time'),
  from_account_id: z.string(),
  to_account_id: z.string().nullable().optional(),
  amount_cents: z.number().int(),
  date: z.string()
});

export const BlueprintChangeSchema = z.union([
  SkipEventSchema,
  PauseEventSchema,
  MoveEventSchema,
  SetAmountSchema,
  PayDebtSchema,
  AddOneTimeSchema
]);

export type BlueprintChange = z.infer<typeof BlueprintChangeSchema>;

export const SimulateToolSchema = z.object({
  changes: z.array(BlueprintChangeSchema)
});

export const ProposeToolSchema = z.object({
  changes: z.array(BlueprintChangeSchema)
});

export function getValidatedToolSchema(accounts: Account[], events: Event[], todayStr: string) {
  const StateValidatedChange = BlueprintChangeSchema.superRefine((val, ctx) => {
    if ('event_id' in val) {
      if (!events.some(e => e.id === val.event_id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown event_id: ${val.event_id}` });
      }
    }
    if ('date' in val && val.date < todayStr) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Date cannot be in the past: ${val.date}` });
    }
    if ('from_date' in val && val.from_date < todayStr) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `from_date cannot be in the past: ${val.from_date}` });
    }
    if ('to_date' in val && val.to_date < todayStr) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `to_date cannot be in the past: ${val.to_date}` });
    }
    if (val.type === 'pay_debt') {
      const card = accounts.find(a => a.id === val.card_id);
      if (!card) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown card_id: ${val.card_id}` });
      } else if (val.amount_cents > Math.round(card.balance * 100)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Over-balance pay_debt: amount ${val.amount_cents} exceeds card balance ${Math.round(card.balance * 100)}` });
      }
    }
  });

  return z.object({
    changes: z.array(StateValidatedChange)
  });
}

export function applyChangesToBlueprint(
  accounts: Account[],
  events: Event[],
  changes: BlueprintChange[]
): { newAccounts: Account[], newEvents: Event[], executedEventsOverrides: Record<string, boolean> } {
  const newAccounts = JSON.parse(JSON.stringify(accounts)) as Account[];
  const newEvents = JSON.parse(JSON.stringify(events)) as Event[];
  const executedEventsOverrides: Record<string, boolean> = {};

  for (const c of changes) {
    if (c.type === 'skip_event') {
      executedEventsOverrides[`${c.date}_${c.event_id}`] = true;
    } else if (c.type === 'pause_event') {
      const ev = newEvents.find(e => e.id === c.event_id);
      if (ev) {
        const occurrences = getOccurrences(ev, c.from_date, c.to_date);
        for (const date of occurrences) {
          executedEventsOverrides[`${date}_${c.event_id}`] = true;
        }
      }
    } else if (c.type === 'set_amount') {
      const ev = newEvents.find(e => e.id === c.event_id);
      if (ev) ev.amount = c.amount_cents / 100;
    } else if (c.type === 'pay_debt') {
      newEvents.push({
        id: `temp_pay_${Math.random()}`,
        name: `Pay Debt`,
        event_type: 'transfer',
        amount: c.amount_cents / 100,
        from_account_id: c.from_account_id,
        to_account_id: c.card_id,
        frequency: 'one-time',
        anchor_date: c.date,
        active: true,
        execution: 'auto',
        weekend_shift: 'none'
      });
    } else if (c.type === 'add_one_time') {
      newEvents.push({
        id: `temp_add_${Math.random()}`,
        name: `One-time`,
        event_type: c.to_account_id ? 'transfer' : 'outflow',
        amount: c.amount_cents / 100,
        from_account_id: c.from_account_id,
        to_account_id: c.to_account_id || null,
        frequency: 'one-time',
        anchor_date: c.date,
        active: true,
        execution: 'auto',
        weekend_shift: 'none'
      });
    } else if (c.type === 'move_event') {
      // Basic support for moving an event date explicitly
      // It's tricky to implement natively without engine changes if it's recurring.
      // So let's skip the original date, and add a one-time on the new date.
      executedEventsOverrides[`${c.from_date}_${c.event_id}`] = true;
      const original = newEvents.find(e => e.id === c.event_id);
      if (original) {
        newEvents.push({
            ...original,
            id: `temp_move_${Math.random()}`,
            frequency: 'one-time',
            anchor_date: c.to_date
        });
      }
    }
  }

  return { newAccounts, newEvents, executedEventsOverrides };
}

import { projectBalances } from './projection';
import { format, addDays } from 'date-fns';

export function getWatermarks(accounts: Account[], events: Event[], executedEventsOverrides: Record<string, boolean>, days: number = 30) {
  const today = new Date();
  const startStr = format(today, 'yyyy-MM-dd');
  const endStr = format(addDays(today, days), 'yyyy-MM-dd');
  
  const projection = projectBalances(accounts, events, startStr, endStr, { executedEvents: executedEventsOverrides });
  
  const watermarks: Record<string, { minBal: number, breach: string | null }> = {};
  for (const a of accounts) {
    if (['debt', 'liability'].includes(a.type)) continue;
    watermarks[a.id] = { minBal: a.balance, breach: null };
  }

  for (const pt of projection) {
    for (const a of accounts) {
      if (['debt', 'liability'].includes(a.type)) continue;
      const bal = pt.balances[a.id] || 0;
      const wm = watermarks[a.id];
      if (bal < wm.minBal) wm.minBal = bal;
      const floor = a.target_floor || 0;
      if (bal < floor && !wm.breach) wm.breach = pt.date;
    }
  }
  return watermarks;
}

export function generateSimulationDiff(accounts: Account[], events: Event[], changes: BlueprintChange[], days: number = 30) {
  const baseWatermarks = getWatermarks(accounts, events, {}, days);
  const { newAccounts, newEvents, executedEventsOverrides } = applyChangesToBlueprint(accounts, events, changes);
  const newWatermarks = getWatermarks(newAccounts, newEvents, executedEventsOverrides, days);

  const diff: any = {};
  for (const a of accounts) {
    if (['debt', 'liability'].includes(a.type)) continue;
    const oldW = baseWatermarks[a.id];
    const newW = newWatermarks[a.id];
    
    if (oldW.minBal !== newW.minBal || oldW.breach !== newW.breach) {
      diff[a.id] = {
        name: a.name,
        lowest_balance_before: oldW.minBal,
        lowest_balance_after: newW.minBal,
        lowest_balance_change: newW.minBal - oldW.minBal,
        first_breach_before: oldW.breach || "None",
        first_breach_after: newW.breach || "None"
      };
    }
  }

  return {
    affected_accounts: diff,
    status: "Simulation succeeded."
  };
}
