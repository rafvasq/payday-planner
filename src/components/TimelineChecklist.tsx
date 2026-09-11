import React, { useState, useMemo } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { buildCalendar } from '../core/calendar';
import { format, addDays } from 'date-fns';
import { Calendar as CalendarIcon, CheckCircle2, Circle, ChevronDown } from 'lucide-react';

export const TimelineChecklist: React.FC = () => {
  const { events, accounts, executedEvents, toggleExecutedEvent } = usePlannerStore();

  const [startStr, setStartStr] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [endStr, setEndStr] = useState<string>(
    format(addDays(new Date(), 56), 'yyyy-MM-dd')
  );

  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((a) => (map[a.id] = a.name));
    return map;
  }, [accounts]);

  const calendarRows = useMemo(() => {
    if (!startStr || !endStr || startStr > endStr) return [];
    return buildCalendar(events, startStr, endStr);
  }, [events, startStr, endStr]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof calendarRows> = {};
    for (const r of calendarRows) {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    }
    return map;
  }, [calendarRows]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-brand-500" />
          <div>
            <h2 className="text-base font-bold text-ink-900">Timeline & Checklist</h2>
            <p className="text-xs text-ink-400">
              Browse upcoming occurrence dates and track manual payments
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <span>From:</span>
            <input
              type="date"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <span>To:</span>
            <input
              type="date"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="p-8 text-center bg-white border border-ink-200 rounded-xl text-ink-400 text-sm">
          No scheduled events found in this date range.
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([dateStr, items]) => {
            const dateObj = new Date(dateStr + 'T00:00:00');
            const hasPayday = items.some((i) => i.type === 'inflow');

            return (
              <details
                key={dateStr}
                open={hasPayday}
                className="bg-white border border-ink-200 rounded-xl overflow-hidden group shadow-2xs"
              >
                <summary className="px-4 py-3 font-semibold text-xs text-ink-900 flex items-center justify-between cursor-pointer select-none bg-white hover:bg-ink-100/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">
                      {format(dateObj, 'EEE, MMM dd, yyyy')}
                    </span>
                    {hasPayday && <span className="text-sm">💰 Payday</span>}
                    <span className="text-xs text-ink-400 font-normal">
                      ({items.length} item{items.length > 1 ? 's' : ''})
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-ink-400 group-open:rotate-180 transition-transform" />
                </summary>

                <div className="px-4 pb-3 pt-1 border-t border-ink-200/60 divide-y divide-ink-100">
                  {items.map((row) => {
                    const execKey = `${row.date}_${row.id}`;
                    const isExecuted = !!executedEvents[execKey];

                    const fromStr =
                      accountMap[row.from_account_id || ''] ||
                      row.from_account_id ||
                      '—';
                    const toStr =
                      accountMap[row.to_account_id || ''] || row.to_account_id || '—';

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
                        className={`py-2.5 flex items-center justify-between text-xs gap-3 transition-opacity ${
                          isExecuted ? 'opacity-50 line-through' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleExecutedEvent(row.date, row.id)}
                            className="text-ink-400 hover:text-brand-500 transition-colors"
                            title={isExecuted ? 'Mark as Pending' : 'Mark as Executed/Paid'}
                          >
                            {isExecuted ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>

                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[11px] ${badgeColor}`}
                          >
                            {sign} ${row.amount.toLocaleString()}
                          </span>

                          <span className="font-semibold text-ink-900">
                            {row.name}
                          </span>

                          <span className="text-ink-400">{directionStr}</span>
                        </div>

                        {row.execution === 'manual' && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            ✋ manual
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
};
