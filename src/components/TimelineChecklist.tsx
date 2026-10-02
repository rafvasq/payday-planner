import React, { useState, useMemo } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { buildCalendar } from '../core/calendar';
import { format, addDays } from 'date-fns';
import { Calendar as CalendarIcon, CheckCircle2, Circle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-primary" />
            <div className="space-y-1">
              <CardTitle className="text-base">Timeline & Checklist</CardTitle>
              <p className="text-xs text-muted-foreground">
                Browse upcoming occurrence dates and track manual payments
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-muted-foreground">From:</span>
              <Input
                type="date"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="h-8 w-auto text-xs"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-muted-foreground">To:</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className="h-8 w-auto text-xs"
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            No scheduled events found in this date range.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([dateStr, items]) => {
            const dateObj = new Date(dateStr + 'T00:00:00');
            const hasPayday = items.some((i) => i.type === 'inflow');

            return (
              <details
                key={dateStr}
                open={hasPayday}
                className="bg-card border border-border rounded-xl overflow-hidden group shadow-sm"
              >
                <summary className="px-4 py-3 font-semibold text-xs flex items-center justify-between cursor-pointer select-none bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">
                      {format(dateObj, 'EEE, MMM dd, yyyy')}
                    </span>
                    {hasPayday && <span className="text-sm">💰 Payday</span>}
                    <span className="text-xs text-muted-foreground font-normal">
                      ({items.length} item{items.length > 1 ? 's' : ''})
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
                </summary>

                <div className="px-4 pb-3 pt-1 border-t border-border divide-y divide-border/50">
                  {items.map((row) => {
                    const execKey = `${row.date}_${row.id}`;
                    const isExecuted = !!executedEvents[execKey];

                    const fromStr =
                      accountMap[row.from_account_id || ''] ||
                      row.from_account_id ||
                      '—';
                    const toStr =
                      accountMap[row.to_account_id || ''] || row.to_account_id || '—';

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
                        className={cn(
                          "py-3 flex items-center justify-between text-xs gap-3 transition-all",
                          isExecuted && "opacity-50"
                        )}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <button
                            onClick={() => toggleExecutedEvent(row.date, row.id)}
                            className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                            title={isExecuted ? 'Mark as Pending' : 'Mark as Executed/Paid'}
                          >
                            {isExecuted ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100 dark:text-emerald-400 dark:fill-emerald-950" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>

                          <span
                            className={cn("font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap shrink-0", badgeColor, isExecuted && "line-through")}
                          >
                            {sign} ${row.amount.toLocaleString()}
                          </span>

                          <span className={cn("font-semibold truncate", isExecuted && "line-through")}>
                            {row.name}
                          </span>

                          <span className="text-muted-foreground truncate hidden sm:inline-block">{directionStr}</span>
                        </div>

                        {row.execution === 'manual' && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                            ✋ manual
                          </Badge>
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
