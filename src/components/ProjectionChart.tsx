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
    netWorth: '#4078f2',
    liquidAssets: '#50a14f',
    totalDebt: '#e45649',
    realEstateEquity: '#986801',
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
    <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-brand-500" />
          <div>
            <h3 className="text-base font-bold text-ink-900">
              Cashflow & Balance Projections
            </h3>
            <p className="text-xs text-ink-400">
              Simulated daily balances forward over the next {daysWindow} days
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-700 bg-ink-100 hover:bg-ink-200/60 border border-ink-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={startingBalancesReflectToday}
              onChange={(e) => setStartingBalancesReflectToday(e.target.checked)}
              className="rounded text-brand-500 focus:ring-brand-500 w-3.5 h-3.5"
            />
            <span>Balances reflect today's cleared transactions</span>
          </label>

          <div className="flex bg-ink-100 p-1 rounded-lg border border-ink-200 text-xs font-semibold">
            {[30, 60, 90, 180].map((d) => (
              <button
                key={d}
                onClick={() => setDaysWindow(d)}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  daysWindow === d
                    ? 'bg-white text-brand-600 shadow-2xs font-bold'
                    : 'text-ink-500 hover:text-ink-900'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>

          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
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
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">
              Today ({format(new Date(), 'MMM dd')}) has {todayEvents.length} scheduled transaction{todayEvents.length > 1 ? 's' : ''}:
            </span>{' '}
            <span className="text-blue-800">
              {todayEvents.map((e) => `${e.name} ($${e.amount.toLocaleString()})`).join(', ')}.
            </span>{' '}
            {startingBalancesReflectToday ? (
              <span className="text-blue-700 italic">
                (Skipping duplicate same-day deduction because "Balances reflect today's cleared transactions" is enabled).
              </span>
            ) : (
              <span className="text-amber-800 font-semibold">
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
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-900">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
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
                    className="bg-white border border-rose-200 rounded-lg p-2.5 flex flex-col justify-between shadow-2xs"
                  >
                    <div className="flex items-center justify-between font-semibold text-ink-900">
                      <span>{ep.accountName}</span>
                      <span className="text-rose-600 font-bold">
                        Lowest: ${ep.minBalance.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="text-[11px] text-ink-500 mt-1 flex items-center justify-between">
                      <span>
                        {formatDateRange(ep.startDate, ep.endDate, ep.durationDays)}
                      </span>
                      <span className="text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-sm font-medium">
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
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Target Floor Dip Warnings ({floorDipEpisodes.length} Episode
                    {floorDipEpisodes.length > 1 ? 's' : ''}):
                  </span>
                </div>
                <button
                  onClick={() => setShowEpisodes(!showEpisodes)}
                  className="text-xs text-amber-800 hover:text-amber-950 font-medium flex items-center gap-1 underline"
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
                      className="bg-white border border-amber-200 rounded-lg p-2.5 flex flex-col justify-between shadow-2xs"
                    >
                      <div className="flex items-center justify-between font-semibold text-ink-900">
                        <span>{ep.accountName}</span>
                        <span className="text-amber-700 font-bold">
                          Lowest: ${ep.minBalance.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="text-[11px] text-ink-500 mt-1 flex items-center justify-between">
                        <span>
                          {formatDateRange(ep.startDate, ep.endDate, ep.durationDays)}
                        </span>
                        <span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-sm font-medium">
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
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-900 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e8f0" />
            <XAxis dataKey="date" stroke="#8b90a0" fontSize={11} tickLine={false} />
            <YAxis
              stroke="#8b90a0"
              fontSize={11}
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
                backgroundColor: '#ffffff',
                borderColor: '#e5e8f0',
                borderRadius: '8px',
                fontSize: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}
            />
            <Line
              type="monotone"
              dataKey={selectedMetric}
              stroke={lineColors[selectedMetric] || '#4078f2'}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
