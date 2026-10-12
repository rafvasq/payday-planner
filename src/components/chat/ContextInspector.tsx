import React, { useState, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';
import {
  Database,
  Copy,
  Check,
  Layers,
  Clock,
  Hash,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  Table as TableIcon,
} from 'lucide-react';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useChatOptional } from '@/context/ChatContext';
import { PlannerWorld, snapshotId, formatCents, toCents, worldToday } from '@/core/ai/world';
import { FigureChip } from './FigureChip';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export interface ContextInspectorProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export const ContextInspector: React.FC<ContextInspectorProps> = ({
  open,
  onOpenChange,
  className,
}) => {
  const chat = useChatOptional();
  const isOpen = open !== undefined ? open : (chat?.isInspectorOpen ?? false);
  const handleOpenChange = onOpenChange || chat?.setIsInspectorOpen || (() => {});

  const {
    accounts = [],
    events = [],
    executedEvents = {},
    startingBalancesReflectToday = false,
  } = usePlannerStore();

  const assumptions = chat?.assumptions || [];
  const assumptionLabels = chat?.assumptionLabels || [];

  const [copied, setCopied] = useState(false);

  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const asOfTimestamp = useMemo(() => format(new Date(), 'yyyy-MM-dd HH:mm:ss'), []);

  const world: PlannerWorld = useMemo(
    () => ({
      accounts,
      events,
      executedEvents,
      balancesReflectToday: !!startingBalancesReflectToday,
      today: todayStr,
    }),
    [accounts, events, executedEvents, startingBalancesReflectToday, todayStr]
  );

  const currentSnapshotId = useMemo(
    () => snapshotId(world, assumptions),
    [world, assumptions]
  );

  const executedCount = useMemo(
    () => Object.values(executedEvents || {}).filter(Boolean).length,
    [executedEvents]
  );

  const activeAssumptionsCount = assumptions.length;

  const contextPayload = useMemo(
    () => ({
      as_of: asOfTimestamp,
      snapshot_id: currentSnapshotId,
      engine_flags: {
        balancesReflectToday: !!startingBalancesReflectToday,
        executedEventsCount: executedCount,
      },
      active_assumptions_count: activeAssumptionsCount,
      active_assumptions: assumptionLabels,
      accounts: accounts.map((a) => {
        const startCents = toCents(a.balance);
        const floorCents = a.target_floor != null ? toCents(a.target_floor) : null;
        const headroomCents = floorCents !== null ? startCents - floorCents : null;
        return {
          id: a.id,
          name: a.name,
          type: a.type,
          starting_balance_cad: formatCents(startCents),
          starting_balance_cents: startCents,
          floor_cad: floorCents !== null ? formatCents(floorCents) : null,
          floor_cents: floorCents,
          headroom_cad: headroomCents !== null ? formatCents(headroomCents) : null,
          headroom_cents: headroomCents,
        };
      }),
    }),
    [
      asOfTimestamp,
      currentSnapshotId,
      startingBalancesReflectToday,
      executedCount,
      activeAssumptionsCount,
      assumptionLabels,
      accounts,
    ]
  );

  const handleCopyContext = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(contextPayload, null, 2));
      setCopied(true);
      toast.success('Context copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy context');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        data-testid="context-inspector-drawer"
        className={cn(
          'w-full sm:max-w-md md:max-w-lg overflow-y-auto flex flex-col p-6 gap-6 bg-background',
          className
        )}
      >
        <SheetHeader className="text-left border-b border-border/60 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <SheetTitle className="text-lg font-bold">Context Inspector</SheetTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyContext}
              className="h-8 px-2.5 text-xs gap-1.5 font-medium shrink-0"
              title="Copy formatted context JSON to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    Copied!
                  </span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy context</span>
                </>
              )}
            </Button>
          </div>
          <SheetDescription className="text-xs text-muted-foreground mt-1">
            Real-time projection engine state and snapshot hash transmitted to the AI assistant.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 text-xs">
          {/* As-Of Timestamp & Snapshot ID */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
            <div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                <Clock className="w-3 h-3" />
                <span>As-of Timestamp</span>
              </div>
              <div className="font-mono text-xs text-foreground font-medium">
                {asOfTimestamp}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                <Hash className="w-3 h-3" />
                <span>Snapshot ID</span>
              </div>
              <div className="font-mono text-xs font-bold text-primary bg-background px-2 py-0.5 rounded border border-border/60 inline-block">
                {currentSnapshotId}
              </div>
            </div>
          </div>

          {/* Engine Flags */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" /> Engine Flags
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg border border-border/50 bg-card flex flex-col justify-between">
                <span className="text-muted-foreground text-[11px]">balancesReflectToday</span>
                <span className="font-mono font-semibold text-sm mt-1">
                  <Badge variant={startingBalancesReflectToday ? 'secondary' : 'outline'}>
                    {startingBalancesReflectToday ? 'true' : 'false'}
                  </Badge>
                </span>
              </div>

              <div className="p-2.5 rounded-lg border border-border/50 bg-card flex flex-col justify-between">
                <span className="text-muted-foreground text-[11px]">executedEvents count</span>
                <span className="font-mono font-bold text-sm text-foreground mt-1">
                  {executedCount}
                </span>
              </div>
            </div>
          </div>

          {/* Active Assumptions Count */}
          <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" /> Active Assumptions
              </span>
              <Badge variant="outline" className="font-mono">
                {activeAssumptionsCount}
              </Badge>
            </div>
            {assumptionLabels.length > 0 ? (
              <ul className="space-y-1 pt-1 border-t border-border/40 text-[11px]">
                {assumptionLabels.map((lbl, idx) => (
                  <li key={idx} className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                    <span className="truncate">{lbl}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No active scenario assumptions layered over projections.
              </p>
            )}
          </div>

          {/* Accounts Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TableIcon className="w-3.5 h-3.5" /> Accounts Table ({accounts.length})
              </span>
            </div>
            <div className="rounded-lg border border-border/60 overflow-hidden shadow-xs">
              <div className="overflow-x-auto max-h-56">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-muted/60 sticky top-0 border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-1.5 px-2 font-semibold">Name</th>
                      <th className="py-1.5 px-2 font-semibold">Type</th>
                      <th className="py-1.5 px-2 text-right font-semibold">Starting (CAD)</th>
                      <th className="py-1.5 px-2 text-right font-semibold">Floor</th>
                      <th className="py-1.5 px-2 text-right font-semibold">Headroom</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 bg-card">
                    {accounts.map((a) => {
                      const startCents = toCents(a.balance);
                      const floorCents = a.target_floor != null ? toCents(a.target_floor) : null;
                      const headroomCents = floorCents !== null ? startCents - floorCents : null;
                      return (
                        <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-1.5 px-2 font-medium text-foreground truncate max-w-[100px]" title={a.name}>
                            {a.name}
                          </td>
                          <td className="py-1.5 px-2 capitalize text-muted-foreground font-mono text-[10px]">
                            {a.type}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono font-medium">
                            {formatCents(startCents)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">
                            {floorCents !== null ? formatCents(floorCents) : '—'}
                          </td>
                          <td
                            className={cn(
                              'py-1.5 px-2 text-right font-mono font-semibold',
                              headroomCents !== null && headroomCents < 0
                                ? 'text-destructive'
                                : headroomCents !== null
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-muted-foreground'
                            )}
                          >
                            {headroomCents !== null ? formatCents(headroomCents) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* FigureChip Provenance Legend */}
          <div className="space-y-2.5 pt-2 border-t border-border/60">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span>FigureChip Provenance Legend</span>
            </div>
            <div className="grid grid-cols-1 gap-2 bg-muted/20 p-3 rounded-lg border border-border/40">
              {/* Engine */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FigureChip rawText="$2,486.54" classification="engine" sourceLabel="EQ Hub balance" />
                  <span className="font-semibold text-foreground text-[11px]">Engine</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Exact match from live projection</span>
              </div>

              {/* Derived */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FigureChip rawText="$5,686.54" classification="derived" formula="$2,486.54 + $3,200.00" />
                  <span className="font-semibold text-foreground text-[11px]">Derived</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Arithmetic combination of engine figures</span>
              </div>

              {/* User-Stated */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FigureChip rawText="$500.00" classification="user_stated" sourceLabel="Stated by user" />
                  <span className="font-semibold text-foreground text-[11px]">User-Stated</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Quoted directly from conversation history</span>
              </div>

              {/* Unverified */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FigureChip rawText="$999.00" classification="unverified" />
                  <span className="font-semibold text-foreground text-[11px]">Unverified</span>
                </div>
                <span className="text-[10px] text-amber-700 dark:text-amber-400">Not found in engine output — caution</span>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
