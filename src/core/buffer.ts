import { Account, Event, Frequency } from './models';

export function monthlyRate(frequency: Frequency): number {
  switch (frequency) {
    case 'weekly':
      return 52 / 12;
    case 'biweekly':
    case 'biweekly-offset':
      return 26 / 12;
    case 'semi-monthly':
      return 2.0;
    case 'monthly':
      return 1.0;
    case 'quarterly':
      return 4 / 12;
    case 'annual':
      return 1 / 12;
    case 'one-time':
    default:
      return 0.0;
  }
}

export interface BufferResult {
  avgMonthly: number;
  safeBiweekly: number;
}

export function guiltFreeBuffers(
  accounts: Account[],
  events: Event[]
): Record<string, BufferResult> {
  const chqIdsByOwner: Record<string, Set<string>> = {};

  for (const a of accounts) {
    if (a.type === 'chequing' && a.owner !== 'Joint') {
      if (!chqIdsByOwner[a.owner]) {
        chqIdsByOwner[a.owner] = new Set();
      }
      chqIdsByOwner[a.owner].add(a.id);
    }
  }

  const result: Record<string, BufferResult> = {};

  for (const [owner, chqIds] of Object.entries(chqIdsByOwner)) {
    let monthlyIn = 0;
    let monthlyOut = 0;

    for (const e of events) {
      if (!e.active || e.frequency === 'one-time') continue;

      const rate = monthlyRate(e.frequency);

      if (e.event_type === 'inflow' && e.to_account_id && chqIds.has(e.to_account_id)) {
        monthlyIn += e.amount * rate;
      } else if (
        (e.event_type === 'outflow' || e.event_type === 'transfer') &&
        e.from_account_id &&
        chqIds.has(e.from_account_id)
      ) {
        monthlyOut += e.amount * rate;
      }
    }

    const avgMonthly = monthlyIn - monthlyOut;
    const avgBiweekly = (avgMonthly * 12) / 26;

    result[owner] = {
      avgMonthly,
      safeBiweekly: Math.max(0, avgBiweekly),
    };
  }

  return result;
}
