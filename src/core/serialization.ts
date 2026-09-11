import {
  Blueprint,
  BlueprintSchema,
  Member,
  Account,
  Event,
  AccountType,
} from './models';
import { nextOccurrence } from './calendar';
import { format } from 'date-fns';

const ACCOUNT_CORE_FIELDS = ['id', 'name', 'type', 'owner', 'balance'];

const ACCOUNT_TYPE_FIELDS: Record<AccountType, string[]> = {
  chequing: ['target_floor'],
  savings: ['interest_rate', 'target_floor'],
  investment: ['interest_rate', 'target_floor'],
  debt: [],
  liability: ['interest_rate', 'market_value'],
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function accountToDict(a: Account): Record<string, any> {
  const allowed = new Set([
    ...ACCOUNT_CORE_FIELDS,
    ...(ACCOUNT_TYPE_FIELDS[a.type] || []),
  ]);

  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(a)) {
    if (!allowed.has(key)) continue;
    if (val === null || val === undefined) continue;
    // Omit zeros for optional numerical fields if not core
    if (
      ['interest_rate', 'market_value'].includes(key) &&
      val === 0 &&
      a.type !== 'liability'
    ) {
      continue;
    }
    result[key] = val;
  }
  return result;
}

export function eventToDict(e: Event): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(e)) {
    if (val === null || val === undefined) continue;
    if (key === 'notes' && val === '') continue;
    if (key === 'active' && val === true) continue; // default true
    if (key === 'execution' && val === 'auto') continue; // default auto
    if (key === 'weekend_shift' && val === 'none') continue; // default none
    if (key === 'clearing_days' && val === 0) continue; // default 0
    result[key] = val;
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const nxt = nextOccurrence(e, todayStr);
  if (nxt) {
    result.next_occurrence = nxt;
  }
  return result;
}

export function compressBlueprintIds(data: {
  members: Member[];
  accounts: Account[];
  events: Event[];
}): {
  members: Member[];
  accounts: Account[];
  events: Event[];
} {
  const acctMap: Record<string, string> = {};
  let acctIdx = 1;
  const compressedAccounts = data.accounts.map((a) => {
    if (a.id.length <= 6) {
      acctMap[a.id] = a.id;
      return a;
    }
    const newId = `a${acctIdx++}`;
    acctMap[a.id] = newId;
    return { ...a, id: newId };
  });

  let evtIdx = 1;
  const compressedEvents = data.events.map((e) => {
    const newId = e.id.length <= 6 ? e.id : `e${evtIdx++}`;
    return {
      ...e,
      id: newId,
      from_account_id: e.from_account_id ? acctMap[e.from_account_id] || e.from_account_id : null,
      to_account_id: e.to_account_id ? acctMap[e.to_account_id] || e.to_account_id : null,
    };
  });

  return {
    members: data.members,
    accounts: compressedAccounts,
    events: compressedEvents,
  };
}

export function blueprintToJson(
  data: {
    members: Member[];
    accounts: Account[];
    events: Event[];
  },
  options: { minified?: boolean; compactIds?: boolean } = {}
): string {
  const { minified = true, compactIds = true } = options;
  const targetData = compactIds ? compressBlueprintIds(data) : data;

  const cleanData = {
    current_date: format(new Date(), 'yyyy-MM-dd'),
    members: targetData.members.map((m) => ({ id: m.id, name: m.name })),
    accounts: targetData.accounts.map(accountToDict),
    events: targetData.events.map(eventToDict),
  };

  return minified
    ? JSON.stringify(cleanData)
    : JSON.stringify(cleanData, null, 2);
}

export function jsonToBlueprint(rawStr: string): Blueprint {
  const byteLen = new TextEncoder().encode(rawStr).length;
  if (byteLen > MAX_BYTES) {
    throw new Error(
      `Blueprint exceeds maximum allowed size of ${MAX_BYTES / 1024 / 1024} MB`
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawStr);
  } catch (err: any) {
    throw new Error(`Invalid JSON format: ${err.message}`);
  }

  // Pre-process accounts & events to strip legacy fields or set defaults
  if (parsed.accounts && Array.isArray(parsed.accounts)) {
    parsed.accounts = parsed.accounts.map((a: any) => {
      const allowed = new Set([
        ...ACCOUNT_CORE_FIELDS,
        ...(ACCOUNT_TYPE_FIELDS[a.type as AccountType] || []),
      ]);
      const clean: Record<string, any> = {};
      for (const [k, v] of Object.entries(a)) {
        if (allowed.has(k)) clean[k] = v;
      }
      return clean;
    });
  }

  if (parsed.events && Array.isArray(parsed.events)) {
    parsed.events = parsed.events.map((e: any) => {
      const { next_occurrence, ...rest } = e;
      return rest;
    });
  }

  const result = BlueprintSchema.safeParse(parsed);
  if (!result.success) {
    const errorMsg = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new Error(`Blueprint validation error: ${errorMsg}`);
  }

  return result.data;
}

export function defaultMembers(): Member[] {
  return [
    { id: 'A', name: 'Person A' },
    { id: 'B', name: 'Person B' },
  ];
}

export function defaultAccounts(): Account[] {
  return [
    { id: 'chq_a', name: 'Chequing A', type: 'chequing', owner: 'A', balance: 0, interest_rate: 0, market_value: 0 },
    { id: 'chq_b', name: 'Chequing B', type: 'chequing', owner: 'B', balance: 0, interest_rate: 0, market_value: 0 },
    { id: 'hub', name: 'Joint Hub', type: 'savings', owner: 'Joint', balance: 0, interest_rate: 0, market_value: 0 },
    { id: 'sav1', name: 'Emergency Fund', type: 'savings', owner: 'Joint', balance: 5000, interest_rate: 0, market_value: 0 },
    { id: 'sav2', name: 'Goals Fund', type: 'savings', owner: 'Joint', balance: 0, interest_rate: 0, market_value: 0 },
    { id: 'loc', name: 'Line of Credit', type: 'debt', owner: 'A', balance: 0, interest_rate: 0, market_value: 0 },
    { id: 'inv_a', name: 'Investment A', type: 'investment', owner: 'A', balance: 0, interest_rate: 0, market_value: 0 },
    { id: 'inv_b', name: 'Investment B', type: 'investment', owner: 'B', balance: 0, interest_rate: 0, market_value: 0 },
    { id: 'mtg', name: 'Mortgage', type: 'liability', owner: 'Joint', balance: 0, interest_rate: 0, market_value: 0 },
  ];
}

export function defaultEvents(): Event[] {
  return [
    {
      id: 'e_pay_a',
      name: 'A Paycheque',
      event_type: 'inflow',
      amount: 2500,
      from_account_id: null,
      to_account_id: 'chq_a',
      frequency: 'biweekly',
      anchor_date: '2026-01-02',
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'e_pay_b',
      name: 'B Paycheque',
      event_type: 'inflow',
      amount: 2000,
      from_account_id: null,
      to_account_id: 'chq_b',
      frequency: 'biweekly',
      anchor_date: '2026-01-09',
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'e_bills_a',
      name: 'A Personal Bills',
      event_type: 'outflow',
      amount: 400,
      from_account_id: 'chq_a',
      to_account_id: null,
      frequency: 'monthly',
      anchor_date: '2026-01-01',
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'e_bills_b',
      name: 'B Personal Bills',
      event_type: 'outflow',
      amount: 300,
      from_account_id: 'chq_b',
      to_account_id: null,
      frequency: 'monthly',
      anchor_date: '2026-01-01',
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'e_inst',
      name: 'Installment Payment',
      event_type: 'outflow',
      amount: 200,
      from_account_id: 'chq_a',
      to_account_id: null,
      frequency: 'monthly',
      anchor_date: '2026-01-01',
      end_date: '2026-06-30',
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'e_hub_a',
      name: 'A → Joint Hub',
      event_type: 'transfer',
      amount: 1500,
      from_account_id: 'chq_a',
      to_account_id: 'hub',
      frequency: 'biweekly',
      anchor_date: '2026-01-02',
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'e_hub_b',
      name: 'B → Joint Hub',
      event_type: 'transfer',
      amount: 1200,
      from_account_id: 'chq_b',
      to_account_id: 'hub',
      frequency: 'biweekly',
      anchor_date: '2026-01-09',
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'e_mtg',
      name: 'Mortgage',
      event_type: 'outflow',
      amount: 1800,
      from_account_id: 'hub',
      to_account_id: 'mtg',
      frequency: 'monthly',
      anchor_date: '2026-01-01',
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'e_shared',
      name: 'Shared Bills',
      event_type: 'outflow',
      amount: 500,
      from_account_id: 'hub',
      to_account_id: null,
      frequency: 'monthly',
      anchor_date: '2026-01-01',
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
    {
      id: 'e_loc',
      name: 'LOC Payment',
      event_type: 'transfer',
      amount: 500,
      from_account_id: 'hub',
      to_account_id: 'loc',
      frequency: 'biweekly',
      anchor_date: '2026-01-02',
      end_date: '2026-12-31',
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
    },
  ];
}
