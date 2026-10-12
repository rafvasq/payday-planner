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
    <div className="space-y-6 pb-12">
      {/* Title & Status strip */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/70">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Financial Console</h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-signal/15 text-signal font-semibold border border-signal/25">
              ● Live Blueprint
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deterministic cashflow forecast & safe-to-spend buffer allocation.
          </p>
        </div>
      </div>

      {/* 1. HERO: Guilt-Free Personal Allowance */}
      {Object.keys(buffers).length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-foreground/80" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Guilt-Free Personal Allowance</h2>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">Buffer Engine Active</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(buffers).map(([ownerId, { avgMonthly, safeBiweekly }]) => {
              const name = memberMap[ownerId] || ownerId;
              const safePayday = safeBiweekly;
              const avgPayday = (avgMonthly * 12) / 26;

              return (
                <Card
                  key={ownerId}
                  className="relative overflow-hidden border border-border/80 bg-card hover:border-signal/40 transition-colors"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                          {name}
                        </span>
                        <Badge variant="signal" className="text-[9px] h-4.5 px-1.5 uppercase tracking-wider">
                          Safe to spend
                        </Badge>
                      </div>
                      <ShieldCheck className="w-4 h-4 text-signal" />
                    </div>

                    <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums mt-3 text-foreground">
                      ${safePayday.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      <span className="text-xs font-sans font-semibold text-muted-foreground ml-1.5 tracking-normal">/ payday</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-muted-foreground mt-2.5 pt-2.5 border-t border-border/60">
                      <span>${avgPayday.toLocaleString('en-US', { maximumFractionDigits: 0 })} avg payday</span>
                      <span className="opacity-40">·</span>
                      <span>${avgMonthly.toLocaleString('en-US', { maximumFractionDigits: 0 })} / mo</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. CONSOLIDATED: Net Worth & Cashflow (Analytics Console Style) */}
      <Card className="border border-border/80 overflow-hidden shadow-none">
        <CardHeader className="border-b border-border/70 py-3 px-5 bg-muted/20">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-2 text-foreground/90">
              <Activity className="w-3.5 h-3.5 text-signal" /> Financial Snapshot
            </span>
            <span className="font-mono text-[10px] text-muted-foreground font-normal">Real-time balances</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border/80">
            {/* Net Worth */}
            <div className="p-5 flex flex-col justify-center bg-muted/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                Total Net Worth
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight tabular-nums text-foreground">
                ${metrics.netWorth.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <div className="flex items-center gap-3 mt-2 font-mono text-[11px] tabular-nums">
                <span className="text-signal font-medium">Assets: ${(metrics.liquid + metrics.reEquity).toLocaleString()}</span>
                <span className="text-destructive font-medium">Debt: ${metrics.debt.toLocaleString()}</span>
              </div>
            </div>

            {/* Inflows */}
            <div className="p-5 flex flex-col justify-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-signal" /> Inflows
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight tabular-nums text-foreground">
                ${cashflow.bwIn.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] font-mono text-muted-foreground mt-1.5 uppercase tracking-wider">Avg / Payday</span>
            </div>
            
            {/* Bills */}
            <div className="p-5 flex flex-col justify-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <ArrowDownRight className="w-3.5 h-3.5 text-destructive" /> Bills & Expenses
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight tabular-nums text-foreground">
                ${cashflow.bwBills.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] font-mono text-muted-foreground mt-1.5 uppercase tracking-wider">Avg / Payday</span>
            </div>

            {/* Savings */}
            <div className="p-5 flex flex-col justify-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <ArrowDownRight className="w-3.5 h-3.5 text-warning" /> Savings & Transfers
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight tabular-nums text-foreground">
                ${cashflow.bwSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <span className="text-[10px] font-mono text-muted-foreground mt-1.5 uppercase tracking-wider">Avg / Payday</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. SIDE-BY-SIDE: Chart & Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Chart */}
        <div className="lg:col-span-2 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-foreground/80" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Balance Projection</h2>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">90-day simulation</span>
          </div>
          <Card className="flex-1 min-h-[320px] border border-border/80">
            <CardContent className="p-4 h-full flex flex-col">
              <ProjectionChart />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Checklist */}
        <div className="lg:col-span-1 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-foreground/80" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Next 14 Days</h2>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">Timeline</span>
          </div>
          <div className="space-y-2">
            {Object.keys(checklist).length === 0 && (
              <Card className="bg-transparent border-dashed border-border/80">
                <CardContent className="text-xs text-muted-foreground italic p-4 text-center">
                  No events scheduled in the next 14 days.
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
                  className="bg-card border border-border/80 rounded-lg overflow-hidden group shadow-none"
                >
                  <summary className="px-3.5 py-2.5 font-semibold text-xs flex items-center justify-between cursor-pointer select-none hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{format(dateObj, 'EEE, MMM dd')}</span>
                      {hasPayday && <span className="text-xs">💰</span>}
                      <span className="text-[10px] font-mono text-muted-foreground font-normal">
                        ({items.length})
                      </span>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-open:rotate-180 transition-transform" />
                  </summary>

                  <div className="px-3 pb-3 pt-1 border-t border-border/70 divide-y divide-border/50 bg-muted/15">
                    {items.map((row) => {
                      const fromStr = accountMap[row.from_account_id || ''] || row.from_account_id || '—';
                      const toStr = accountMap[row.to_account_id || ''] || row.to_account_id || '—';

                      let badgeColor = 'text-primary bg-primary/10 border border-primary/20';
                      let directionStr = `${fromStr} → ${toStr}`;
                      let sign = '→';

                      if (row.type === 'inflow') {
                        badgeColor = 'text-signal bg-signal/15 border border-signal/25';
                        directionStr = `→ ${toStr}`;
                        sign = '+';
                      } else if (row.type === 'outflow') {
                        badgeColor = 'text-destructive bg-destructive/15 border border-destructive/25';
                        directionStr = `from ${fromStr}`;
                        sign = '−';
                      }

                      return (
                        <div
                          key={row.id + row.date}
                          className="py-2 flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-xs truncate">{row.name}</span>
                            <span className={cn("font-mono font-semibold px-1.5 py-0.5 rounded text-[10px] shrink-0 tabular-nums", badgeColor)}>
                              {sign} ${row.amount.toLocaleString()}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono text-muted-foreground uppercase">{directionStr}</span>
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
