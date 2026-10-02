import { Account, Event } from './models';
import { projectBalances } from './projection';
import { addDays, format } from 'date-fns';

export function generateLedgerContext(accounts: Account[], events: Event[], days: number = 30): string {
    const today = new Date();
    const startStr = format(today, 'yyyy-MM-dd');
    const endDate = addDays(today, days);
    const endStr = format(endDate, 'yyyy-MM-dd');

    const projection = projectBalances(accounts, events, startStr, endStr);
    
    // The Summary Block
    const initialPoint = projection[0];
    const initialDebt = initialPoint.totalDebt;
    const initialCredit = initialPoint.totalCredit;
    const initialLiquid = initialPoint.liquidAssets;
    
    // The Watermark
    // We track for each account: first breach, lowest date/value, recovery
    const watermarks: Record<string, {minBal: number, minDate: string, breach: string | null, recovery: string | null}> = {};
    for (const a of accounts) {
        if (['debt', 'liability'].includes(a.type)) continue;
        watermarks[a.id] = { minBal: a.balance, minDate: startStr, breach: null, recovery: null };
    }

    for (const pt of projection) {
        for (const a of accounts) {
            if (['debt', 'liability'].includes(a.type)) continue;
            const bal = pt.balances[a.id] || 0;
            const wm = watermarks[a.id];
            
            if (bal < wm.minBal) {
                wm.minBal = bal;
                wm.minDate = pt.date;
            }

            const floor = a.target_floor !== null && a.target_floor !== undefined ? a.target_floor : 0;
            if (bal < floor) {
                if (!wm.breach) wm.breach = pt.date;
                wm.recovery = null; // resets recovery since it breached again or is still breached
            } else if (wm.breach && !wm.recovery) {
                wm.recovery = pt.date;
            }
        }
    }

    let summaryText = `\n--- SUMMARY BLOCK ---\nHorizon: ${days} days (${startStr} to ${endStr})\n`;
    summaryText += `Total Liquid: ${initialLiquid}\nTotal Debt: ${initialDebt}\nOver-Balance Credits: ${initialCredit}\n\n`;
    summaryText += `--- ACCOUNT WATERMARKS ---\n`;
    for (const a of accounts) {
        if (['debt', 'liability'].includes(a.type)) continue;
        const wm = watermarks[a.id];
        const floor = a.target_floor !== null && a.target_floor !== undefined ? a.target_floor : 0;
        const headroom = initialPoint.balances[a.id] !== undefined ? initialPoint.balances[a.id] - floor : 0;
        
        summaryText += `- [${a.id}] ${a.name}: Headroom ${headroom} | Lowest ${wm.minBal} on ${wm.minDate}`;
        if (wm.breach) {
            summaryText += ` | FIRST BREACH: ${wm.breach}`;
            if (wm.recovery) summaryText += ` | RECOVERY: ${wm.recovery}`;
            else summaryText += ` | NO RECOVERY IN HORIZON`;
        }
        summaryText += `\n`;
    }

    let promptContext = summaryText + `\n--- TRUNCATION NOTICE ---\nFull horizon computed safely. Engine output is reliable.\n`;

    promptContext += `\nCRITICAL INSTRUCTION: Any balances, debts, or dates found in previous assistant replies predate this current ledger and are strictly SUPERSEDED. You must use the numbers provided here.\n`;
    return promptContext;
}
