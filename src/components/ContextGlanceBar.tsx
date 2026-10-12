import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Wallet,
  Calendar,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';
import { usePlannerStore } from '../store/usePlannerStore';
import { Account, Event, CalendarRow, AccountType } from '../core/models';
import { buildCalendar } from '../core/calendar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const formatCurrency = (val: number) =>
  val.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });

export interface ContextGlanceBarProps {
  accounts?: Account[];
  events?: Event[];
  onSelectPrompt?: (prompt: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}

export const ContextGlanceBar: React.FC<ContextGlanceBarProps> = ({
  accounts,
  events,
  onSelectPrompt,
  isExpanded: controlledExpanded,
  onToggleExpand,
  className,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleToggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  };

  const storeAccounts = usePlannerStore((s) => s.accounts);
  const storeEvents = usePlannerStore((s) => s.events);

  const effectiveAccounts = accounts ?? storeAccounts ?? [];
  const effectiveEvents = events ?? storeEvents ?? [];

  const liquidTypes: AccountType[] = ['chequing', 'savings', 'investment'];

  // Active accounts: filter out where active === false
  const activeAccounts = useMemo(() => {
    return effectiveAccounts.filter((a) => (a as any).active !== false);
  }, [effectiveAccounts]);

  const liquidAccounts = useMemo(() => {
    return activeAccounts.filter((a) => liquidTypes.includes(a.type));
  }, [activeAccounts]);

  const totalLiquidBalance = useMemo(() => {
    return liquidAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  }, [liquidAccounts]);

  // Top accounts for compact view: up to 3 liquid accounts, sorted by balance descending
  const topAccounts = useMemo(() => {
    return [...liquidAccounts]
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, 3);
  }, [liquidAccounts]);

  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const fourteenDaysLaterStr = useMemo(
    () => format(addDays(new Date(), 14), 'yyyy-MM-dd'),
    []
  );

  const normalizedEvents = useMemo(() => {
    return effectiveEvents.map((e) =>
      e.active === undefined ? { ...e, active: true } : e
    );
  }, [effectiveEvents]);

  const upcomingRows = useMemo(() => {
    try {
      return buildCalendar(normalizedEvents, todayStr, fourteenDaysLaterStr);
    } catch (err) {
      console.error('Failed to build calendar for ContextGlanceBar:', err);
      return [];
    }
  }, [normalizedEvents, todayStr, fourteenDaysLaterStr]);

  // Compact view: up to 2 upcoming occurrences
  const compactUpcoming = useMemo(() => {
    return upcomingRows.slice(0, 2);
  }, [upcomingRows]);

  // Expanded view: up to 6 upcoming occurrences
  const expandedUpcoming = useMemo(() => {
    return upcomingRows.slice(0, 6);
  }, [upcomingRows]);

  // Suggestion chips
  const suggestionChips = useMemo(() => {
    const chips: string[] = [];
    chips.push('Can I afford $200 this weekend?');

    const firstBill = upcomingRows.find((r) => r.type === 'outflow');
    if (firstBill) {
      chips.push(`What if I pay ${firstBill.name} early?`);
    } else {
      chips.push('Simulate 30-day balance outlook');
    }

    const lowAccount = activeAccounts.find(
      (a) => a.target_floor != null && a.balance < a.target_floor
    );
    if (lowAccount) {
      chips.push(`How can I bring ${lowAccount.name} back above target floor?`);
    } else {
      chips.push('What are my upcoming moves this week?');
    }

    return chips;
  }, [upcomingRows, activeAccounts]);

  const handleAccountClick = (acc: Account) => {
    onSelectPrompt?.(`What is my balance outlook for ${acc.name}?`);
  };

  const handleEventClick = (row: CalendarRow) => {
    if (row.type === 'inflow') {
      onSelectPrompt?.(
        `How will ${row.name} (${formatCurrency(row.amount)}) on ${row.date} affect my budget?`
      );
    } else {
      onSelectPrompt?.(
        `Can I afford ${row.name} (${formatCurrency(row.amount)}) on ${row.date}?`
      );
    }
  };

  const handleQuickActionClick = (promptText: string) => {
    onSelectPrompt?.(promptText);
  };

  const formatDisplayDate = (isoStr: string) => {
    try {
      return format(parseISO(isoStr), 'MMM d');
    } catch {
      return isoStr;
    }
  };

  return (
    <div
      className={cn(
        'border-b border-border bg-muted/30 transition-all select-none',
        className
      )}
      data-testid="context-glance-bar"
    >
      {/* Compact strip - always present */}
      <div className="px-3 py-1.5 flex items-center justify-between text-xs gap-2 min-w-0 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto min-w-0 no-scrollbar py-0.5">
          <div className="flex items-center gap-1 font-mono shrink-0">
            <span className="text-muted-foreground font-sans text-xs">Liquid:</span>
            <span className="font-semibold text-foreground tabular-nums">
              {formatCurrency(totalLiquidBalance)}
            </span>
          </div>
          {liquidAccounts.length === 0 && (
            <span className="text-muted-foreground italic text-xs shrink-0">No accounts</span>
          )}
          {topAccounts.map((acc) => (
            <button
              key={`glance-top-${acc.id}`}
              type="button"
              data-testid="glance-account-chip"
              onClick={() => handleAccountClick(acc)}
              title={`Click to ask about ${acc.name}`}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-card hover:bg-accent border border-border/60 transition-colors cursor-pointer text-xs shrink-0 select-none shadow-2xs"
            >
              <span className="truncate max-w-[110px] font-medium">{acc.name}:</span>
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {formatCurrency(acc.balance)}
              </span>
            </button>
          ))}
          {compactUpcoming.length > 0 && (
            <span className="text-muted-foreground/40 shrink-0 select-none">|</span>
          )}
          {compactUpcoming.map((occ, idx) => {
            const isInflow = occ.type === 'inflow';
            return (
              <button
                key={`glance-compact-occ-${occ.id}-${occ.date}-${idx}`}
                type="button"
                data-testid="glance-event-chip"
                onClick={() => handleEventClick(occ)}
                title={`Click to ask about ${occ.name}`}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-card hover:bg-accent border border-border/60 transition-colors cursor-pointer text-xs shrink-0 select-none shadow-2xs"
              >
                <span className="truncate max-w-[100px] font-medium">{occ.name}</span>
                <span
                  className={cn(
                    'font-mono tabular-nums font-semibold',
                    isInflow ? 'text-signal' : 'text-foreground'
                  )}
                >
                  {isInflow ? '+' : '-'}
                  {formatCurrency(occ.amount)}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          data-testid="glance-expand-toggle"
          title={expanded ? 'Collapse context glance' : 'Expand context glance'}
          onClick={handleToggleExpand}
          className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground shrink-0 transition-colors cursor-pointer ml-1"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Mini-dashboard (when expanded) */}
      {expanded && (
        <div className="p-3 bg-background/50 space-y-3">
            <div className="grid grid-cols-1 gap-2.5">
              {/* Card 1: All Accounts */}
              <div className="space-y-1.5 p-2.5 rounded-lg border border-border/70 bg-card/60">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground pb-1.5 border-b border-border/40">
                  <span className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-primary" />
                    <span>Accounts &amp; Target Floors</span>
                  </span>
                  <span className="font-mono text-[11px] text-foreground font-medium">
                    Total: {formatCurrency(totalLiquidBalance)}
                  </span>
                </div>
                <div className="space-y-1">
                  {activeAccounts.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-1">
                      No active accounts found.
                    </p>
                  ) : (
                    activeAccounts.map((acc) => {
                      const isUnderFloor =
                        acc.target_floor != null && acc.balance < acc.target_floor;
                      return (
                        <button
                          key={`glance-exp-acc-${acc.id}`}
                          type="button"
                          data-testid="glance-account-chip"
                          onClick={() => handleAccountClick(acc)}
                          title={`Click to ask about ${acc.name}`}
                          className="w-full text-left flex items-center justify-between gap-3 px-2 py-1.5 rounded-md text-xs hover:bg-accent/70 transition-colors border border-transparent hover:border-border/60 group cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-medium truncate group-hover:text-primary transition-colors text-foreground">
                              {acc.name}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 px-1.5 capitalize shrink-0 font-normal border-border/60 text-muted-foreground"
                            >
                              {acc.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-right shrink-0">
                            {acc.target_floor != null && (
                              <span
                                className={cn(
                                  'text-[10px] font-mono tabular-nums',
                                  isUnderFloor
                                    ? 'text-destructive font-semibold flex items-center justify-end gap-1'
                                    : 'text-muted-foreground'
                                )}
                              >
                                {isUnderFloor && (
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                )}
                                Floor: {formatCurrency(acc.target_floor)}
                              </span>
                            )}
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatCurrency(acc.balance)}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Card 2: Upcoming Bills / Paydays (7-14 Days) */}
              <div className="space-y-1.5 p-2.5 rounded-lg border border-border/70 bg-card/60">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground pb-1.5 border-b border-border/40">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-primary" />
                    <span>Upcoming (Next 14 Days)</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {expandedUpcoming.length} upcoming
                  </span>
                </div>

                <div className="space-y-1">
                  {expandedUpcoming.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-1">
                      No upcoming bills or paydays in the next 14 days.
                    </p>
                  ) : (
                    expandedUpcoming.map((occ, idx) => {
                      const isInflow = occ.type === 'inflow';
                      return (
                        <button
                          key={`glance-exp-occ-${occ.id}-${occ.date}-${idx}`}
                          type="button"
                          data-testid="glance-event-chip"
                          onClick={() => handleEventClick(occ)}
                          title={`Click to ask about ${occ.name}`}
                          className="w-full text-left flex items-center justify-between gap-3 px-2 py-1.5 rounded-md text-xs hover:bg-accent/70 transition-colors border border-transparent hover:border-border/60 group cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-muted-foreground font-mono text-[10px] shrink-0 px-1 py-0.5 rounded bg-muted/60 border border-border/40">
                              {formatDisplayDate(occ.date)}
                            </span>
                            <span className="font-medium truncate group-hover:text-primary transition-colors text-foreground">
                              {occ.name}
                            </span>
                            <Badge
                              variant={isInflow ? 'signal' : 'outline'}
                              className={cn(
                                'text-[9px] py-0 px-1.5 capitalize shrink-0 font-normal',
                                !isInflow && 'border-border/60 text-muted-foreground'
                              )}
                            >
                              {occ.type}
                            </Badge>
                          </div>
                          <div className="text-right shrink-0">
                            <span
                              className={cn(
                                'font-mono font-semibold tabular-nums text-xs',
                                isInflow
                                  ? 'text-signal'
                                  : 'text-foreground'
                              )}
                            >
                              {isInflow ? '+' : '-'}
                              {formatCurrency(occ.amount)}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Quick-action suggestions */}
            <div className="pt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono font-medium text-muted-foreground flex items-center gap-1 mr-1">
                <Sparkles className="w-3 h-3 text-warning" />
                <span>Suggestions:</span>
              </span>
              {suggestionChips.map((promptText, idx) => (
                <Button
                  key={`glance-suggestion-${idx}`}
                  variant="outline"
                  size="sm"
                  data-testid="glance-quick-action-chip"
                  onClick={() => handleQuickActionClick(promptText)}
                  className="h-6 text-[11px] px-2.5 bg-card hover:bg-muted border-border/80 rounded-full font-medium shadow-none text-foreground shrink-0 cursor-pointer"
                >
                  {promptText}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
  );
};
