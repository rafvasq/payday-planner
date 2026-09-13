import React, { useMemo } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { guiltFreeBuffers, monthlyRate } from '../core/buffer';
import { buildCalendar } from '../core/calendar';
import { ProjectionChart } from './ProjectionChart';
import { format, addDays } from 'date-fns';
import { Wallet, ShieldCheck, ArrowUpRight, ArrowDownRight, ChevronDown, PieChart, Activity, Calendar } from 'lucide-react';

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
    <div className="space-y-8 pb-12">
      {/* 1. HERO: Guilt-Free Personal Allowance */}
      {Object.keys(buffers).length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Wallet className="w-5 h-5 text-brand-500" />
            <h2 className="text-sm font-bold text-ink-900">Guilt-Free Personal Allowance</h2>
            <span className="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ml-2">Safe to spend</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(buffers).map(([ownerId, { avgMonthly, safeBiweekly }]) => {
              const name = memberMap[ownerId] || ownerId;
              const safePayday = safeBiweekly;
              const avgPayday = (avgMonthly * 12) / 26;

              return (
                <div
                  key={ownerId}
                  className="bg-white border-2 border-brand-200 bg-linear-to-br from-brand-50/40 via-white to-emerald-50/20 rounded-xl p-5 shadow-xs relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-700 uppercase tracking-wide flex items-center gap-1.5">
                      <span>{name}</span>
                    </span>
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  </div>

                  <div className="text-4xl font-extrabold text-ink-900 mt-2">
                    ${safePayday.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    <span className="text-sm font-semibold text-ink-400 ml-1">/ payday</span>
                  </div>

                  <div className="text-xs font-semibold text-ink-500 mt-2">
                    ${avgPayday.toLocaleString('en-US', { maximumFractionDigits: 0 })} / avg payday · ${avgMonthly.toLocaleString('en-US', { maximumFractionDigits: 0 })} / month
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. CONSOLIDATED: Net Worth & Cashflow (Secondary Metrics) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Activity className="w-5 h-5 text-brand-500" />
          <h2 className="text-sm font-bold text-ink-900">Financial Snapshot</h2>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Net Worth */}
          <div className="col-span-2 lg:col-span-2 bg-white border border-ink-200 rounded-xl p-4 shadow-xs bg-linear-to-b from-ink-50/50 to-white">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Total Net Worth</span>
            <div className="text-xl font-extrabold text-ink-900 mt-1">
              ${metrics.netWorth.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <div className="flex gap-4 mt-2">
              <div>
                <span className="text-[10px] text-ink-400 uppercase">Assets</span>
                <p className="text-xs font-bold text-emerald-600">${(metrics.liquid + metrics.reEquity).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[10px] text-ink-400 uppercase">Debt</span>
                <p className="text-xs font-bold text-rose-600">${metrics.debt.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Cashflow Mini Cards */}
          <div className="bg-white border border-ink-200 rounded-xl p-3 shadow-xs flex flex-col justify-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-ink-400 flex items-center justify-between">
              Inflows <ArrowUpRight className="w-3 h-3 text-emerald-500" />
            </span>
            <div className="text-lg font-bold text-ink-900 mt-1">
              ${cashflow.bwIn.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[10px] text-ink-400">/ payday</span>
          </div>

          <div className="bg-white border border-ink-200 rounded-xl p-3 shadow-xs flex flex-col justify-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-ink-400 flex items-center justify-between">
              Bills <ArrowDownRight className="w-3 h-3 text-rose-500" />
            </span>
            <div className="text-lg font-bold text-ink-900 mt-1">
              ${cashflow.bwBills.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[10px] text-ink-400">/ payday</span>
          </div>

          <div className="bg-white border border-ink-200 rounded-xl p-3 shadow-xs flex flex-col justify-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-ink-400 flex items-center justify-between">
              Savings & Debt <ArrowDownRight className="w-3 h-3 text-amber-500" />
            </span>
            <div className="text-lg font-bold text-ink-900 mt-1">
              ${cashflow.bwSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
            <span className="text-[10px] text-ink-400">/ payday</span>
          </div>
        </div>
      </div>

      {/* 3. SIDE-BY-SIDE: Chart & Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Chart (Takes up 2 cols on lg) */}
        <div className="lg:col-span-2 space-y-3 flex flex-col h-full">
          <div className="flex items-center gap-2 px-1">
            <PieChart className="w-5 h-5 text-brand-500" />
            <h2 className="text-sm font-bold text-ink-900">Balance Projection</h2>
          </div>
          <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-xs flex-1 flex flex-col">
            <ProjectionChart />
          </div>
        </div>

        {/* Right Column: Checklist (Takes up 1 col on lg) */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Calendar className="w-5 h-5 text-brand-500" />
            <h2 className="text-sm font-bold text-ink-900">Next 14 Days</h2>
          </div>
          <div className="space-y-2">
            {Object.keys(checklist).length === 0 && (
              <div className="text-sm text-ink-400 italic p-4 text-center border border-dashed border-ink-200 rounded-xl">
                No events in the next 14 days.
              </div>
            )}
            {Object.entries(checklist).map(([dateStr, items]) => {
              const dateObj = new Date(dateStr + 'T00:00:00');
              const hasPayday = items.some((i) => i.type === 'inflow');
              return (
                <details
                  key={dateStr}
                  open={hasPayday}
                  className="bg-white border border-ink-200 rounded-xl overflow-hidden group shadow-xs"
                >
                  <summary className="px-4 py-3 font-semibold text-xs text-ink-900 flex items-center justify-between cursor-pointer select-none bg-white hover:bg-ink-100/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span>{format(dateObj, 'EEE, MMM dd')}</span>
                      {hasPayday && <span className="text-sm">💰</span>}
                      <span className="text-[10px] text-ink-400 font-normal">
                        ({items.length})
                      </span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-ink-400 group-open:rotate-180 transition-transform" />
                  </summary>

                  <div className="px-3 pb-3 pt-1 border-t border-ink-200/60 divide-y divide-ink-100">
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
                          className="py-2.5 flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-ink-900 text-[11px] truncate">{row.name}</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] shrink-0 ${badgeColor}`}>
                              {sign} ${row.amount.toLocaleString()}
                            </span>
                          </div>
                          <span className="text-[9px] text-ink-400 uppercase font-semibold">{directionStr}</span>
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
    </div>
  );
};
