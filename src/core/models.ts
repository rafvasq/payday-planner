import { z } from 'zod';

export const AccountTypeSchema = z.enum([
  'chequing',
  'savings',
  'debt',
  'investment',
  'liability',
]);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const MemberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type Member = z.infer<typeof MemberSchema>;

export const AccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: AccountTypeSchema,
  owner: z.string().min(1),
  balance: z.number().default(0),
  interest_rate: z.number().optional(),
  market_value: z.number().optional(),
  target_floor: z.number().nullable().optional(),
});
export type Account = z.infer<typeof AccountSchema>;

export const EventTypeSchema = z.enum(['inflow', 'outflow', 'transfer']);
export type EventType = z.infer<typeof EventTypeSchema>;

export const FrequencySchema = z.enum([
  'one-time',
  'weekly',
  'biweekly',
  'biweekly-offset',
  'semi-monthly',
  'monthly',
  'quarterly',
  'annual',
]);
export type Frequency = z.infer<typeof FrequencySchema>;

export const ExecutionTypeSchema = z.enum(['auto', 'manual']);
export type ExecutionType = z.infer<typeof ExecutionTypeSchema>;

export const WeekendShiftSchema = z.enum([
  'none',
  'previous_business_day',
  'next_business_day',
]);
export type WeekendShift = z.infer<typeof WeekendShiftSchema>;

export const EventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  event_type: EventTypeSchema,
  amount: z.number().min(0),
  from_account_id: z.string().nullable().optional().default(null),
  to_account_id: z.string().nullable().optional().default(null),
  frequency: FrequencySchema,
  anchor_date: z.string().min(1),
  end_date: z.string().nullable().optional(),
  notes: z.string().optional(),
  active: z.boolean().optional().default(true),
  execution: ExecutionTypeSchema.optional().default('auto'),
  weekend_shift: WeekendShiftSchema.optional().default('none'),
  clearing_days: z.number().min(0).max(30).optional(),
  next_occurrence: z.string().optional(),
});
export type Event = z.infer<typeof EventSchema>;

export const BlueprintSchema = z.object({
  current_date: z.string().optional(),
  members: z.array(MemberSchema).default([]),
  accounts: z.array(AccountSchema).default([]),
  events: z.array(EventSchema).default([]),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

export interface CalendarRow {
  date: string; // ISO date YYYY-MM-DD
  id: string;
  name: string;
  type: EventType;
  amount: number;
  from_account_id: string | null;
  to_account_id: string | null;
  notes: string;
  execution: ExecutionType;
  weekend_shift: WeekendShift;
  clearing_days?: number;
}
