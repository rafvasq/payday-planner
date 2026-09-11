import React, { useMemo } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { guiltFreeBuffers, monthlyRate } from '../core/buffer';
import { buildCalendar } from '../core/calendar';
import { ProjectionChart } from './ProjectionChart';
import { format, addDays } from 'date-fns';
import { Wallet, ShieldCheck, DollarSign, ArrowUpRight, ArrowDownRight, CreditCard, ChevronDown } from 'lucide-react';

const ACCT_TYPE_LABELS: Record<string, string> = {
  chequing: 'Chequing',
  savings: 'Savings',
  investment: 'Investments',
  debt: 'Debt',
  liability: 'Liabilities',
};

const ACCT_TYPE_COLORS: Record<string, string> = {
  chequing: 'bg-blue-50 text-blue-700 border-blue-200',
  savings: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  investment: 'bg-amber-50 text-amber-700 border-amber-200',
  debt: 'bg-rose-50 text-rose-700 border-rose-200',
  liability: 'bg-purple-50 text-purple-700 border-purple-200',
};

export const Dashboard: React.FC = () => {
  const { accounts, events, members } = usePlannerStore();

  const metrics = useMemo(() => {
    const liquid = accounts
      .filter((a) => ['chequing', 'savings', 'investment'].includes(a.type))
      .reduce((sum, a) => sum + a.balance, 0);

    const reEquity = accounts
      .filter((a) => a.type === 'liability' && (a.market_value || 0) > 0)
      .reduce((sum, a) => sum + ((a.market_value || 0) - a.balance), 0);

    const nakedLiab = accounts
      .filter((a) => a.type === 'liability' && (a.market_value || 0) === 0)
      .reduce((sum, a) => sum + a.balance, 0);

    const debt = accounts
      .filter((a) => a.type === 'debt')
      .reduce((sum, a) => sum + a.balance, 0);

    const netWorth = liquid + reEquity - nakedLiab - debt;

    return { liquid, reEquity, debt, netWorth };
  }, [accounts]);

  const cashflow = useMemo(() => {
    const bw = 12 / 26;
    const moIn = events
      .filter((e) => e.active && e.event_type === 'inflow')
      .reduce((sum, e) => sum + e.amount * monthlyRate(e.frequency), 0);

    const moToHub = events
      .filter((e) => e.active && e.event_type === 'transfer' && e.to_account_id === 'hub')
      .reduce((sum, e) => sum + e.amount * monthlyRate(e.frequency), 0);

    const moBills = events
      .filter((e) => e.active && e.event_type === 'outflow')
      .reduce((sum, e) => sum + e.amount * monthlyRate(e.frequency), 0);

    const moSavings = events
      .filter((e) => e.active && e.event_type === 'transfer' && e.to_account_id !== 'hub')
      .reduce((sum, e) => sum + e.amount * monthlyRate(e.frequency), 0);

    return {
      bwIn: moIn * bw,
      bwToHub: moToHub * bw,
      bwBills: moBills * bw,
      bwSavings: moSavings * bw,
      moIn,
      moToHub,
      moBills,
      moSavings,
    };
  }, [events]);

  const buffers = useMemo(() => {
    return guiltFreeBuffers(accounts, events);
  }, [accounts, events]);

  const checklist = useMemo(() => {
    const today = new Date();
    const startStr = format(today, 'yyyy-MM-dd');
    const endStr = format(addDays(today, 14), 'yyyy-MM-dd');
    const rows = buildCalendar(events, startStr, endStr);

    const grouped: Record<string, typeof rows> = {};
    for (const r of rows) {
      if (!grouped[r.date]) grouped[r.date] = [];
      grouped[r.date].push(r);
    }
    return grouped;
  }, [events]);

  const memberMap = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => (map[m.id] = m.name));
    return map;
  }, [members]);

  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((a) => (map[a.id] = a.name));
    return map;
  }, [accounts]);

  return (
    <div className="space-y-6">
      {/* Net Worth KPIs */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400 mb-2">
          Net Worth Snapshot
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
              Net Worth
            </span>
            <div className="text-2xl font-extrabold text-ink-900 mt-1">
              ${metrics.netWorth.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-[11px] text-ink-400 mt-1">Total Assets minus Liabilities</p>
          </div>

          <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
              Liquid Assets
            </span>
            <div className="text-2xl font-extrabold text-emerald-600 mt-1">
              ${metrics.liquid.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-[11px] text-ink-400 mt-1">Chequing, Savings, Investments</p>
          </div>

          <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
              Real Estate Equity
            </span>
            <div className="text-2xl font-extrabold text-amber-700 mt-1">
              ${metrics.reEquity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-[11px] text-ink-400 mt-1">Market Value minus Mortgage balance</p>
          </div>

          <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
              Total Debt
            </span>
            <div className="text-2xl font-extrabold text-rose-600 mt-1">
              ${metrics.debt.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-[11px] text-ink-400 mt-1">Lines of credit & credit cards</p>
          </div>
        </div>
      </div>

      {/* Biweekly Cashflow Summary */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400 mb-2">
          Biweekly Cashflow
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                Combined Inflow
              </span>
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl font-bold text-ink-900 mt-1">
              ${cashflow.bwIn.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              <span className="text-xs text-ink-400 font-normal"> / payday</span>
            </div>
            <div className="text-[11px] text-ink-400 mt-1">
              ${cashflow.moIn.toLocaleString('en-US', { maximumFractionDigits: 0 })} / mo
            </div>
          </div>

          <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                → Joint Hub
              </span>
              <ArrowDownRight className="w-4 h-4 text-brand-500" />
            </div>
            <div className="text-xl font-bold text-ink-900 mt-1">
              ${cashflow.bwToHub.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              <span className="text-xs text-ink-400 font-normal"> / payday</span>
            </div>
            <div className="text-[11px] text-ink-400 mt-1">
              ${cashflow.moToHub.toLocaleString('en-US', { maximumFractionDigits: 0 })} / mo
            </div>
          </div>

          <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                Bills & Outflows
              </span>
              <ArrowDownRight className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl font-bold text-ink-900 mt-1">
              ${cashflow.bwBills.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              <span className="text-xs text-ink-400 font-normal"> / payday</span>
            </div>
            <div className="text-[11px] text-ink-400 mt-1">
              ${cashflow.moBills.toLocaleString('en-US', { maximumFractionDigits: 0 })} / mo
            </div>
          </div>

          <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                → Savings & Debt
              </span>
              <ArrowDownRight className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold text-ink-900 mt-1">
              ${cashflow.bwSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              <span className="text-xs text-ink-400 font-normal"> / payday</span>
            </div>
            <div className="text-[11px] text-ink-400 mt-1">
              ${cashflow.moSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })} / mo
            </div>
          </div>
        </div>
      </div>

      {/* Guilt-Free Personal Allowance */}
      {Object.keys(buffers).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">
              Guilt-Free Personal Allowance (Discretionary Fun Money)
            </h2>
            <span className="text-[11px] text-ink-400 font-medium">
              100% guilt-free for dining out, shopping, hobbies & tickets
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(buffers).map(([ownerId, { avgMonthly, safeBiweekly }]) => {
              const name = memberMap[ownerId] || ownerId;
              const safePayday = safeBiweekly;
              const avgPayday = (avgMonthly * 12) / 26;

              return (
                <div
                  key={ownerId}
                  className="bg-white border border-brand-200 bg-linear-to-br from-brand-50/40 via-white to-emerald-50/20 rounded-xl p-4 shadow-xs relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-brand-500" />
                      <span>{name} — Guilt-Free Fun Money</span>
                    </span>
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  </div>

                  <div className="text-2xl font-extrabold text-ink-900 mt-2">
                    ${safePayday.toLocaleString('en-US', { maximumFractionDigits: 0 })}{' '}
                    <span className="text-xs font-semibold text-ink-500">/ payday</span>
                  </div>

                  <div className="text-xs text-ink-500 mt-1">
                    avg ${avgPayday.toLocaleString('en-US', { maximumFractionDigits: 0 })} / payday · ${avgMonthly.toLocaleString('en-US', { maximumFractionDigits: 0 })} / month
                  </div>

                  <p className="text-[11px] text-ink-400 mt-2 pt-2 border-t border-ink-100 italic">
                    Pure discretionary cash after all mortgages, bills, taxes, and joint savings sweeps are 100% paid.
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Embedded Balance Projection Chart */}
      <ProjectionChart />

      {/* Accounts Grouped */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400 mb-2">
          Account Balances
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((acct) => (
            <div
              key={acct.id}
              className="bg-white border border-ink-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs hover:border-ink-300 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ink-900">{acct.name}</span>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                      ACCT_TYPE_COLORS[acct.type] || 'bg-ink-100 text-ink-700'
                    }`}
                  >
                    {acct.owner}
                  </span>
                </div>
                <span className="text-xs text-ink-400">
                  {ACCT_TYPE_LABELS[acct.type] || acct.type}
                </span>
              </div>

              <div className="text-right font-bold text-ink-900 text-base">
                ${acct.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next 14 Days Checklist Preview */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400 mb-2">
          Next 14 Days — Checklist
        </h2>
        <div className="space-y-2">
          {Object.entries(checklist).map(([dateStr, items]) => {
            const dateObj = new Date(dateStr + 'T00:00:00');
            const hasPayday = items.some((i) => i.type === 'inflow');
            return (
              <details
                key={dateStr}
                open={hasPayday}
                className="bg-white border border-ink-200 rounded-xl overflow-hidden group"
              >
                <summary className="px-4 py-3 font-semibold text-xs text-ink-900 flex items-center justify-between cursor-pointer select-none bg-white hover:bg-ink-100/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span>{format(dateObj, 'EEE, MMM dd')}</span>
                    {hasPayday && <span className="text-sm">💰 Payday</span>}
                    <span className="text-[10px] text-ink-400 font-normal">
                      ({items.length} event{items.length > 1 ? 's' : ''})
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-ink-400 group-open:rotate-180 transition-transform" />
                </summary>

                <div className="px-4 pb-3 pt-1 border-t border-ink-200/60 divide-y divide-ink-100">
                  {items.map((row) => {
                    const fromStr = accountMap[row.from_account_id || ''] || row.from_account_id || '—';
                    const toStr = accountMap[row.to_account_id || ''] || row.to_account_id || '—';

                    let badgeColor = 'text-blue-600 bg-blue-50';
                    let directionStr = `${fromStr} → ${toStr}`;
                    let sign = '→';

                    if (row.type === 'inflow') {
                      badgeColor = 'text-emerald-600 bg-emerald-50';
                      directionStr = `→ ${toStr}`;
                      sign = '+';
                    } else if (row.type === 'outflow') {
                      badgeColor = 'text-rose-600 bg-rose-50';
                      directionStr = `from ${fromStr}`;
                      sign = '−';
                    }

                    return (
                      <div
                        key={row.id + row.date}
                        className="py-2 flex items-center justify-between text-xs gap-3"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[11px] ${badgeColor}`}
                          >
                            {sign} ${row.amount.toLocaleString()}
                          </span>
                          <span className="font-semibold text-ink-900">{row.name}</span>
                          <span className="text-ink-400">{directionStr}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
};
