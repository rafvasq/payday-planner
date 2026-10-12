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
                className="bg-card border border-border/80 rounded-lg overflow-hidden group shadow-none"
              >
                <summary className="px-3.5 py-2.5 font-semibold text-xs flex items-center justify-between cursor-pointer select-none bg-card hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-foreground">
                      {format(dateObj, 'EEE, MMM dd, yyyy')}
                    </span>
                    {hasPayday && <span className="text-[11px] font-semibold text-signal bg-signal/15 px-1.5 py-0.2 rounded border border-signal/25">💰 Payday</span>}
                    <span className="text-[10px] font-mono text-muted-foreground font-normal">
                      ({items.length} item{items.length > 1 ? 's' : ''})
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-open:rotate-180 transition-transform" />
                </summary>

                <div className="px-3.5 pb-2.5 pt-1 border-t border-border/70 divide-y divide-border/50">
                  {items.map((row) => {
                    const execKey = `${row.date}_${row.id}`;
                    const isExecuted = !!executedEvents[execKey];

                    const fromStr =
                      accountMap[row.from_account_id || ''] ||
                      row.from_account_id ||
                      '—';
                    const toStr =
                      accountMap[row.to_account_id || ''] || row.to_account_id || '—';

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
                        className={cn(
                          "py-2.5 flex items-center justify-between text-xs gap-3 transition-all",
                          isExecuted && "opacity-50"
                        )}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <button
                            onClick={() => toggleExecutedEvent(row.date, row.id)}
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            title={isExecuted ? 'Mark as Pending' : 'Mark as Executed/Paid'}
                          >
                            {isExecuted ? (
                              <CheckCircle2 className="w-4 h-4 text-signal fill-signal/20" />
                            ) : (
                              <Circle className="w-4 h-4 opacity-50" />
                            )}
                          </button>

                          <span
                            className={cn("font-mono font-semibold px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap shrink-0 tabular-nums", badgeColor, isExecuted && "line-through")}
                          >
                            {sign} ${row.amount.toLocaleString()}
                          </span>

                          <span className={cn("font-medium truncate text-foreground", isExecuted && "line-through")}>
                            {row.name}
                          </span>

                          <span className="text-muted-foreground font-mono text-[10px] truncate hidden sm:inline-block">{directionStr}</span>
                        </div>

                        {row.execution === 'manual' && (
                          <Badge variant="amber" className="text-[9px] h-4.5 px-1.5 uppercase tracking-wider shrink-0 font-mono">
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
