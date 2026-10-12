import React, { useState, useMemo } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { projectBalances, groupAlertEpisodes } from '../core/projection';
import { buildCalendar } from '../core/calendar';
import { format, addDays } from 'date-fns';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  AlertTriangle,
  TrendingUp,
  ShieldAlert,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';

export const ProjectionChart: React.FC = () => {
  const {
    accounts,
    events,
    executedEvents,
    startingBalancesReflectToday,
    setStartingBalancesReflectToday,
  } = usePlannerStore();
  const [daysWindow, setDaysWindow] = useState<number>(60);
  const [selectedMetric, setSelectedMetric] = useState<string>('netWorth');
  const [showEpisodes, setShowEpisodes] = useState<boolean>(true);

  const startDateStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const endDateStr = useMemo(
    () => format(addDays(new Date(), daysWindow), 'yyyy-MM-dd'),
    [daysWindow]
  );

  const todayEvents = useMemo(() => {
    return buildCalendar(events, startDateStr, startDateStr);
  }, [events, startDateStr]);

  const projectionData = useMemo(() => {
    return projectBalances(accounts, events, startDateStr, endDateStr, {
      skipTodayEvents: startingBalancesReflectToday,
      executedEvents,
    });
  }, [
    accounts,
    events,
    startDateStr,
    endDateStr,
    startingBalancesReflectToday,
    executedEvents,
  ]);

  const alertEpisodes = useMemo(() => {
    return groupAlertEpisodes(projectionData);
  }, [projectionData]);

  const overdraftEpisodes = useMemo(
    () => alertEpisodes.filter((e) => e.type === 'negative'),
    [alertEpisodes]
  );

  const floorDipEpisodes = useMemo(
    () => alertEpisodes.filter((e) => e.type === 'below_floor'),
    [alertEpisodes]
  );

  const chartData = useMemo(() => {
    return projectionData.map((pt) => {
      const formattedDate = format(new Date(pt.date + 'T00:00:00'), 'MMM dd');
      return {
        date: formattedDate,
        rawDate: pt.date,
        netWorth: pt.netWorth,
        liquidAssets: pt.liquidAssets,
        totalDebt: pt.totalDebt,
        realEstateEquity: pt.realEstateEquity,
        ...pt.balances,
      };
    });
  }, [projectionData]);

  const lineColors: Record<string, string> = {
    netWorth: '#10b981',
    liquidAssets: '#059669',
    totalDebt: '#f43f5e',
    realEstateEquity: '#8b5cf6',
  };

  const formatDateRange = (start: string, end: string, days: number) => {
    const s = format(new Date(start + 'T00:00:00'), 'MMM dd');
    if (start === end) {
      return `${s} (1 day)`;
    }
    const e = format(new Date(end + 'T00:00:00'), 'MMM dd');
    return `${s} – ${e} (${days} days)`;
  };

  return (
    <div className="bg-card border border-border/80 rounded-lg p-4 sm:p-5 shadow-none space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-signal" />
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Cashflow & Balance Projections
            </h3>
            <p className="text-xs text-muted-foreground">
              Simulated daily balances forward over the next {daysWindow} days
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/40 hover:bg-muted/60 border border-border/60 px-2.5 py-1 rounded-md cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={startingBalancesReflectToday}
              onChange={(e) => setStartingBalancesReflectToday(e.target.checked)}
              className="rounded text-signal focus:ring-signal w-3.5 h-3.5 border-border"
            />
            <span>Balances reflect today</span>
          </label>

          <div className="flex bg-muted/40 p-0.5 rounded-md border border-border/60 text-xs font-semibold">
            {[30, 60, 90, 180].map((d) => (
              <button
                key={d}
                onClick={() => setDaysWindow(d)}
                className={`px-2 py-0.5 rounded transition-all text-xs font-mono ${
                  daysWindow === d
                    ? 'bg-card text-foreground shadow-sm font-bold border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>

          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="px-2.5 py-1 text-xs font-medium text-foreground bg-background border border-border/80 rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="netWorth">Net Worth Timeline</option>
            <option value="liquidAssets">Liquid Assets</option>
            <option value="totalDebt">Total Debt</option>
            <optgroup label="Accounts">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      {/* Smart Notification when today has scheduled transactions */}
      {todayEvents.length > 0 && (
        <div className="p-3 bg-primary/5 border border-primary/15 rounded-md flex items-start gap-2.5 text-xs text-foreground">
          <Info className="w-4 h-4 text-signal shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">
              Today ({format(new Date(), 'MMM dd')}) has {todayEvents.length} scheduled transaction{todayEvents.length > 1 ? 's' : ''}:
            </span>{' '}
            <span className="text-muted-foreground">
              {todayEvents.map((e) => `${e.name} ($${e.amount.toLocaleString()})`).join(', ')}.
            </span>{' '}
            {startingBalancesReflectToday ? (
              <span className="text-muted-foreground/80 italic text-[11px]">
                (Skipping duplicate same-day deduction because "Balances reflect today" is enabled).
              </span>
            ) : (
              <span className="text-warning font-medium text-[11px]">
                (Simulating today's transaction deduction on starting balances).
              </span>
            )}
          </div>
        </div>
      )}

      {/* Grouped Alert Episodes Banner */}
      {alertEpisodes.length > 0 ? (
        <div className="space-y-2">
          {/* Critical Overdraft Alerts */}
          {overdraftEpisodes.length > 0 && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-destructive">
                  <ShieldAlert className="w-4 h-4 text-destructive shrink-0" />
                  <span>
                    Critical Overdraft Risk ({overdraftEpisodes.length} Episode
                    {overdraftEpisodes.length > 1 ? 's' : ''}):
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {overdraftEpisodes.map((ep, idx) => (
                  <div
                    key={idx}
                    className="bg-card border border-destructive/20 rounded p-2.5 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <span>{ep.accountName}</span>
                      <span className="text-destructive font-mono font-bold tabular-nums">
                        Lowest: ${ep.minBalance.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground mt-1 flex items-center justify-between">
                      <span>
                        {formatDateRange(ep.startDate, ep.endDate, ep.durationDays)}
                      </span>
                      <span className="text-destructive bg-destructive/15 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                        Overdraft
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Target Floor Dips */}
          {floorDipEpisodes.length > 0 && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-warning">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                  <span>
                    Target Floor Dip Warnings ({floorDipEpisodes.length} Episode
                    {floorDipEpisodes.length > 1 ? 's' : ''}):
                  </span>
                </div>
                <button
                  onClick={() => setShowEpisodes(!showEpisodes)}
                  className="text-xs text-warning hover:underline font-medium flex items-center gap-1"
                >
                  {showEpisodes ? (
                    <>
                      Hide Details <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      Show Details ({floorDipEpisodes.length}){' '}
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>

              {showEpisodes && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {floorDipEpisodes.map((ep, idx) => (
                    <div
                      key={idx}
                      className="bg-card border border-warning/20 rounded p-2.5 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between font-semibold text-foreground">
                        <span>{ep.accountName}</span>
                        <span className="text-warning font-mono font-bold tabular-nums">
                          Lowest: ${ep.minBalance.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground mt-1 flex items-center justify-between">
                        <span>
                          {formatDateRange(ep.startDate, ep.endDate, ep.durationDays)}
                        </span>
                        <span className="text-warning bg-warning/15 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                          Target Floor: ${ep.threshold.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-2.5 bg-signal/10 border border-signal/20 rounded-md flex items-center gap-2 text-xs text-signal font-medium">
          <CheckCircle2 className="w-4 h-4 text-signal shrink-0" />
          <span>
            No overdraft or target floor alerts projected over the next {daysWindow} days.
          </span>
        </div>
      )}

      <div className="h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: any) => [
                `$${Number(value).toLocaleString()}`,
                selectedMetric === 'netWorth'
                  ? 'Net Worth'
                  : selectedMetric === 'liquidAssets'
                  ? 'Liquid Assets'
                  : accounts.find((a) => a.id === selectedMetric)?.name ||
                    selectedMetric,
              ]}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                borderColor: 'hsl(var(--border))',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'hsl(var(--foreground))',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            />
            <Line
              type="monotone"
              dataKey={selectedMetric}
              stroke={lineColors[selectedMetric] || '#10b981'}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
