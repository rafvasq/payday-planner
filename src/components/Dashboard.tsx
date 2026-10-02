import React, { useMemo } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { guiltFreeBuffers, monthlyRate } from '../core/buffer';
import { buildCalendar } from '../core/calendar';
import { ProjectionChart } from './ProjectionChart';
import { format, addDays } from 'date-fns';
import { Wallet, ShieldCheck, ArrowUpRight, ArrowDownRight, ChevronDown, PieChart, Activity, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

    // This specifically looks for transfers to a 'hub' or joint account
    const moToHub = events
      .filter((e) => e.active && e.event_type === 'transfer' && (e.to_account_id === 'hub' || accounts.find(a => a.id === e.to_account_id)?.owner === 'Joint'))
      .reduce((sum, e) => sum + e.amount * monthlyRate(e.frequency), 0);

    const moBills = events
      .filter((e) => e.active && e.event_type === 'outflow')
      .reduce((sum, e) => sum + e.amount * monthlyRate(e.frequency), 0);

    const moSavings = events
      .filter((e) => e.active && e.event_type === 'transfer' && e.to_account_id !== 'hub' && accounts.find(a => a.id === e.to_account_id)?.owner !== 'Joint')
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
  }, [events, accounts]);

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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Dashboard</h1>
      </div>

      {/* 1. HERO: Guilt-Free Personal Allowance */}
      {Object.keys(buffers).length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold">Guilt-Free Personal Allowance</h2>
            <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border-transparent text-[10px] h-5 rounded-full uppercase tracking-wider ml-2">
              Safe to spend
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(buffers).map(([ownerId, { avgMonthly, safeBiweekly }]) => {
              const name = memberMap[ownerId] || ownerId;
              const safePayday = safeBiweekly;
              const avgPayday = (avgMonthly * 12) / 26;

              return (
                <Card
                  key={ownerId}
                  className="bg-gradient-to-br from-primary/5 via-card to-emerald-500/5 relative overflow-hidden"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary uppercase tracking-wide">
                        {name}
                      </span>
                      <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    </div>

                    <div className="text-4xl font-extrabold font-mono mt-2">
                      ${safePayday.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      <span className="text-sm font-semibold text-muted-foreground ml-1">/ payday</span>
                    </div>

                    <div className="text-xs font-semibold font-mono text-muted-foreground mt-2">
                      ${avgPayday.toLocaleString('en-US', { maximumFractionDigits: 0 })} / avg payday · ${avgMonthly.toLocaleString('en-US', { maximumFractionDigits: 0 })} / month
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. CONSOLIDATED: Net Worth & Cashflow (Analytics Style) */}
      <Card>
        <CardHeader className="border-b border-border py-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Financial Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Net Worth */}
            <div className="p-6 flex flex-col justify-center bg-muted/10">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mb-2">
                Total Net Worth
              </span>
              <div className="text-3xl font-extrabold font-mono text-foreground">
                ${metrics.netWorth.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <div className="flex gap-4 mt-3">
                <span className="text-xs font-semibold text-emerald-600">Assets: ${(metrics.liquid + metrics.reEquity).toLocaleString()}</span>
                <span className="text-xs font-semibold text-rose-600">Debt: ${metrics.debt.toLocaleString()}</span>
              </div>
            </div>

            {/* Cashflow Metrics */}
            <div className="p-6 flex flex-col justify-center">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mb-2">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> Inflows
              </span>
              <div className="text-3xl font-extrabold font-mono text-foreground">
                ${cashflow.bwIn.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground mt-2 uppercase tracking-wide">Avg / Payday</span>
            </div>
            
            <div className="p-6 flex flex-col justify-center">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mb-2">
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" /> Bills
              </span>
              <div className="text-3xl font-extrabold font-mono text-foreground">
                ${cashflow.bwBills.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground mt-2 uppercase tracking-wide">Avg / Payday</span>
            </div>

            <div className="p-6 flex flex-col justify-center">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mb-2">
                <ArrowDownRight className="w-3.5 h-3.5 text-amber-500" /> Savings
              </span>
              <div className="text-3xl font-extrabold font-mono text-foreground">
                ${cashflow.bwSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground mt-2 uppercase tracking-wide">Avg / Payday</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. SIDE-BY-SIDE: Chart & Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Chart (Takes up 2 cols on lg) */}
        <div className="lg:col-span-2 flex flex-col space-y-4">
          <div className="flex items-center gap-2">
            <PieChart className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold">Balance Projection</h2>
          </div>
          <Card className="flex-1 min-h-[300px]">
            <CardContent className="p-4 h-full flex flex-col">
              <ProjectionChart />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Checklist (Takes up 1 col on lg) */}
        <div className="lg:col-span-1 flex flex-col space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold">Next 14 Days</h2>
          </div>
          <div className="space-y-2">
            {Object.keys(checklist).length === 0 && (
              <Card className="bg-transparent border-dashed">
                <CardContent className="text-sm text-muted-foreground italic p-4 text-center">
                  No events in the next 14 days.
                </CardContent>
              </Card>
            )}
            {Object.entries(checklist).map(([dateStr, items]) => {
              const dateObj = new Date(dateStr + 'T00:00:00');
              const hasPayday = items.some((i) => i.type === 'inflow');
              return (
                <details
                  key={dateStr}
                  open={hasPayday}
                  className="bg-card border border-border rounded-xl overflow-hidden group shadow-sm"
                >
                  <summary className="px-4 py-3 font-semibold text-xs flex items-center justify-between cursor-pointer select-none hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span>{format(dateObj, 'EEE, MMM dd')}</span>
                      {hasPayday && <span className="text-sm">💰</span>}
                      <span className="text-[10px] text-muted-foreground font-normal">
                        ({items.length})
                      </span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
                  </summary>

                  <div className="px-3 pb-3 pt-1 border-t border-border divide-y divide-border/50 bg-muted/20">
                    {items.map((row) => {
                      const fromStr = accountMap[row.from_account_id || ''] || row.from_account_id || '—';
                      const toStr = accountMap[row.to_account_id || ''] || row.to_account_id || '—';

                      let badgeColor = 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400';
                      let directionStr = `${fromStr} → ${toStr}`;
                      let sign = '→';

                      if (row.type === 'inflow') {
                        badgeColor = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400';
                        directionStr = `→ ${toStr}`;
                        sign = '+';
                      } else if (row.type === 'outflow') {
                        badgeColor = 'text-rose-600 bg-rose-50 dark:bg-rose-950 dark:text-rose-400';
                        directionStr = `from ${fromStr}`;
                        sign = '−';
                      }

                      return (
                        <div
                          key={row.id + row.date}
                          className="py-2.5 flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[11px] truncate">{row.name}</span>
                            <span className={cn("font-bold px-1.5 py-0.5 rounded text-[10px] shrink-0", badgeColor)}>
                              {sign} ${row.amount.toLocaleString()}
                            </span>
                          </div>
                          <span className="text-[9px] text-muted-foreground uppercase font-semibold">{directionStr}</span>
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
