import { Account, Event } from './models';
import { projectBalances } from './projection';
import { format, addDays } from 'date-fns';

export function getKnownCents(accounts: Account[], events: Event[], exemptMessages: string[], days: number = 30): Set<number> {
    const known = new Set<number>();
    
    const toCents = (val: number) => Math.round(Math.abs(val) * 100);

    // 1. Extract from user/tool messages (any $ value)
    const regex = /-?\$?-?\s*\d+(?:,\d+)*(?:\.\d{2})?/g;
    for (const msg of exemptMessages) {
        const matches = msg.match(regex);
        if (matches) {
            for (const m of matches) {
                if (!m.includes('$')) continue;
                const clean = m.replace(/[$\s-]/g, '').replace(/,/g, '');
                const val = Math.round(parseFloat(clean) * 100);
                known.add(val);
            }
        }
    }

    // 2. Extract from blueprint (accounts, events)
    for (const a of accounts) {
        known.add(toCents(a.balance));
        if (a.target_floor) known.add(toCents(a.target_floor));
    }
    for (const e of events) {
        known.add(toCents(e.amount));
    }

    // 3. Extract from frozen ledger (projection output)
    const today = new Date();
    const startStr = format(today, 'yyyy-MM-dd');
    const endDate = addDays(today, days);
    const endStr = format(endDate, 'yyyy-MM-dd');
    
    const projection = projectBalances(accounts, events, startStr, endStr);
    for (const pt of projection) {
        known.add(toCents(pt.totalDebt));
        known.add(toCents(pt.totalCredit));
        known.add(toCents(pt.liquidAssets));
        known.add(toCents(pt.netWorth));
        for (const bal of Object.values(pt.balances)) {
            known.add(toCents(bal));
        }
        for (const alert of pt.alerts) {
            known.add(toCents(alert.balance));
        }
    }

    // 4. Headrooms
    for (const a of accounts) {
        if (!['debt', 'liability'].includes(a.type)) {
            const floor = a.target_floor || 0;
            const pt = projection[0];
            const bal = pt.balances[a.id] || 0;
            known.add(toCents(bal - floor));
        }
    }

    return known;
}

export function findUnmatchedFigures(assistantMessage: string, knownCents: Set<number>): string[] {
    const unmatched: string[] = [];
    const regex = /-?\$?-?\s*\d+(?:,\d+)*(?:\.\d{2})?/g;
    const matches = assistantMessage.match(regex);
    if (!matches) return [];

    const seen = new Set<string>();

    for (const m of matches) {
        if (!m.includes('$')) continue;
        if (seen.has(m)) continue;
        seen.add(m);

        const clean = m.replace(/[$\s-]/g, '').replace(/,/g, '');
        const valCents = Math.round(parseFloat(clean) * 100);
        
        if (!knownCents.has(valCents)) {
            unmatched.push(m);
        }
    }

    return unmatched;
}
