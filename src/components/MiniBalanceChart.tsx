import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import { Account, Event } from '../core/models';
import { BlueprintChange } from '../core/tools';
import { PlannerWorld, projectWorld } from '../core/ai/world';
import { usePlannerStore } from '../store/usePlannerStore';
import { cn } from '@/lib/utils';

const formatCurrency = (val: number) =>
  val.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

export interface MiniBalancePoint {
  date: string;
  baseline: number;
  simulated: number;
  rawDate?: string;
}

export interface MiniBalanceChartProps {
  accountId: string;
  accountName?: string;
  data?: MiniBalancePoint[];
  accounts?: Account[];
  events?: Event[];
  changes?: BlueprintChange[];
  executedEvents?: Record<string, boolean>;
  balancesReflectToday?: boolean;
  daysWindow?: number;
  height?: number;
  className?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const baseItem = payload.find((p: any) => p.dataKey === 'baseline');
    const simItem = payload.find((p: any) => p.dataKey === 'simulated');
    const baselineVal = typeof baseItem?.value === 'number' ? baseItem.value : 0;
    const simulatedVal = typeof simItem?.value === 'number' ? simItem.value : 0;
    const delta = simulatedVal - baselineVal;

    return (
      <div className="bg-popover text-popover-foreground border border-border shadow-md rounded-md p-2 text-xs">
        <p className="font-semibold text-[11px] mb-1">{label}</p>
        <div className="flex justify-between gap-3 text-[11px]">
          <span className="text-muted-foreground">Baseline:</span>
          <span className="font-mono">{formatCurrency(baselineVal)}</span>
        </div>
        <div className="flex justify-between gap-3 text-[11px]">
          <span className="text-blue-500 font-medium">Simulated:</span>
          <span className="font-mono font-medium">{formatCurrency(simulatedVal)}</span>
        </div>
        <div className="flex justify-between gap-3 text-[11px] pt-1 mt-1 border-t border-border/50">
          <span className="text-muted-foreground">Delta:</span>
          <span
            className={cn(
              'font-mono font-semibold',
              delta > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : delta < 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-muted-foreground'
            )}
          >
            {delta > 0 ? `+${formatCurrency(delta)}` : formatCurrency(delta)}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export const MiniBalanceChart: React.FC<MiniBalanceChartProps> = ({
  accountId,
  accountName,
  data,
  accounts,
  events,
  changes,
  executedEvents,
  balancesReflectToday,
  daysWindow = 30,
  height = 120,
  className,
}) => {
  const storeAccounts = usePlannerStore((s) => s.accounts);
  const storeEvents = usePlannerStore((s) => s.events);
  const storeExecuted = usePlannerStore((s) => s.executedEvents);
  const storeReflectToday = usePlannerStore((s) => s.startingBalancesReflectToday);

  const effectiveAccounts = accounts || storeAccounts;
  const effectiveEvents = events || storeEvents;
  const effectiveExecuted = executedEvents || storeExecuted;
  const effectiveReflectToday = balancesReflectToday !== undefined ? balancesReflectToday : storeReflectToday;

  const targetAccount = useMemo(() => {
    return effectiveAccounts.find((a) => a.id === accountId);
  }, [effectiveAccounts, accountId]);

  const resolvedName = accountName || targetAccount?.name || accountId;

  const chartData = useMemo(() => {
    // 1. If explicit data is passed, use it directly
    if (data && data.length > 0) {
      return data;
    }

    // 2. If account doesn't exist in effectiveAccounts, return empty array to trigger fallback
    if (!targetAccount) {
      return [];
    }

    try {
      const today = new Date();
      const startDateStr = format(today, 'yyyy-MM-dd');

      const world: PlannerWorld = {
        accounts: effectiveAccounts,
        events: effectiveEvents,
        executedEvents: effectiveExecuted,
        balancesReflectToday: effectiveReflectToday,
        today: startDateStr,
      };

      const baselineProj = projectWorld(world, [], daysWindow ?? 30);
      const simulatedProj = projectWorld(world, changes || [], daysWindow ?? 30);

      return baselineProj.points.map((bPt, idx) => {
        const sPt = simulatedProj.points[idx];
        const formattedDate = format(new Date(bPt.date + 'T00:00:00'), 'MMM dd');
        return {
          date: formattedDate,
          rawDate: bPt.date,
          baseline: bPt.balances[accountId] ?? 0,
          simulated: sPt?.balances[accountId] ?? (bPt.balances[accountId] ?? 0),
        };
      });
    } catch (e) {
      console.error('Error generating MiniBalanceChart projection data:', e);
      return [];
    }
  }, [
    data,
    targetAccount,
    effectiveAccounts,
    effectiveEvents,
    effectiveExecuted,
    effectiveReflectToday,
    accountId,
    changes,
    daysWindow,
  ]);

  if (!chartData || chartData.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center text-xs text-muted-foreground italic border border-dashed border-border/60 rounded-md bg-muted/10 p-3',
          className
        )}
        style={{ height }}
        data-testid={`mini-balance-chart-empty-${accountId}`}
      >
        <span>No projection data available for {resolvedName}</span>
      </div>
    );
  }

  return (
    <div
      className={cn('w-full flex flex-col', className)}
      style={{ height }}
      data-testid={`mini-balance-chart-${accountId}`}
    >
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1 px-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 border-b-2 border-dashed border-muted-foreground/60" />
            <span className="text-muted-foreground font-mono">Baseline</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 border-b-2 border-signal" />
            <span className="text-signal font-mono font-medium">Simulated</span>
          </div>
        </div>
        {accountName && (
          <span className="font-semibold text-foreground truncate max-w-[140px] text-[10px] font-mono">
            {accountName}
          </span>
        )}
      </div>

      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={60}>
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 8, left: -22, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={9}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={9}
              tickLine={false}
              tickFormatter={(v) =>
                v >= 1000 || v <= -1000 ? `$${(v / 1000).toFixed(0)}k` : `$${Math.round(v)}`
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="baseline"
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              strokeWidth={1.5}
              dot={false}
              name="Baseline"
            />
            <Line
              type="monotone"
              dataKey="simulated"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name="Simulated"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
