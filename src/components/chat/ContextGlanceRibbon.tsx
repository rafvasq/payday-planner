import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Wallet, AlertTriangle, Calendar, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useChat } from '@/context/ChatContext';
import { buildCalendar } from '@/core/calendar';
import { ContextGlanceBar } from '@/components/ContextGlanceBar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const formatCurrency = (val: number) =>
  val.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });

export interface ContextGlanceRibbonProps {
  className?: string;
  /** Render the flyout as an overlay on top of the feed (used in the floating window). */
  overlay?: boolean;
}

/**
 * Embedded situational-awareness ribbon. Always present as a 40px peek rail; expands into a
 * flyout (driven by the persisted `showContextGlance` setting, also toggled via Alt+G).
 */
export const ContextGlanceRibbon: React.FC<ContextGlanceRibbonProps> = ({ className, overlay }) => {
  const { setInput } = useChat();
  const { accounts, events } = usePlannerStore();
  const { showContextGlance, setShowContextGlance } = useSettingsStore();
  const expanded = !!showContextGlance;


  const setExpanded = (v: boolean) => setShowContextGlance?.(v);

  const [flyoutHeight, setFlyoutHeight] = useState(250);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizeRef.current) return;
      const deltaY = resizeRef.current.startY - e.clientY;
      const newHeight = Math.min(Math.max(150, resizeRef.current.startH + deltaY), window.innerHeight * 0.7);
      setFlyoutHeight(newHeight);
    };

    const onUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    resizeRef.current = { startY: e.clientY, startH: flyoutHeight };
    e.preventDefault();
    document.body.style.cursor = 'ns-resize';
  };

  // Alt+G toggles the flyout
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setShowContextGlance?.(!expanded);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded, setShowContextGlance]);

  const { totalLiquid, breachedCount, upcomingCount } = useMemo(() => {
    const active = (accounts || []).filter((a) => (a as any).active !== false);
    const liquid = active
      .filter((a) => ['chequing', 'savings', 'investment'].includes(a.type))
      .reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const breached = active.filter(
      (a) => a.target_floor != null && (Number(a.balance) || 0) < a.target_floor
    ).length;
    let upcoming = 0;
    try {
      upcoming = buildCalendar(
        (events || []).map((e) => (e.active === undefined ? { ...e, active: true } : e)),
        format(new Date(), 'yyyy-MM-dd'),
        format(addDays(new Date(), 14), 'yyyy-MM-dd')
      ).length;
    } catch {
      upcoming = 0;
    }
    return { totalLiquid: liquid, breachedCount: breached, upcomingCount: upcoming };
  }, [accounts, events]);

  return (
    <div
      data-testid="context-glance-ribbon"
      className={cn(
        'relative shrink flex flex-col min-h-0 border-t border-border bg-card/60 w-full',
        className
      )}
    >
      {/* Flyout */}
      {expanded && (
        <div
          className={cn(
            'w-full flex flex-col relative bg-background border-b border-border/60 shrink min-h-0',
            overlay && 'absolute bottom-full left-0 right-0 z-20 shadow-xl border-t'
          )}
        >
          {/* Resize Handle (Top Edge) */}
          <div
            onPointerDown={handlePointerDown}
            className="w-full h-2.5 cursor-ns-resize hover:bg-primary/10 active:bg-primary/20 transition-colors shrink-0 z-10 flex items-center justify-center group select-none"
            style={{ touchAction: 'none' }}
            title="Drag to resize Context Glance"
          >
            <div className="w-8 h-1 rounded-full bg-border/80 group-hover:bg-primary/60 transition-colors" />
          </div>
          <div
            className="w-full overflow-y-auto shrink min-h-0"
            style={{ height: flyoutHeight, maxHeight: '55vh' }}
          >
            <ContextGlanceBar
              accounts={accounts}
              events={events}
              onSelectPrompt={(p) => setInput(p)}
              className="border-b-0 bg-transparent"
            />
          </div>
        </div>
      )}

      {/* Horizontal peek rail */}
      <div className="w-full shrink-0 flex flex-row items-center justify-between px-3 py-1.5 select-none bg-muted/30">
        <div className="flex flex-row items-center gap-4">
          <div
            className="flex flex-row items-center gap-1.5 text-signal"
            title={`Liquid balance ${formatCurrency(totalLiquid)}`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono leading-none font-semibold tabular-nums">
              {Math.abs(totalLiquid) >= 1000
                ? `${(totalLiquid / 1000).toFixed(1)}k`
                : Math.round(totalLiquid)}
            </span>
          </div>
          {breachedCount > 0 && (
            <div
              className="relative text-destructive flex flex-row items-center gap-1.5"
              data-testid="glance-rail-breach"
              title={`${breachedCount} account(s) below floor`}
            >
              <div className="relative">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
              </div>
              <span className="text-[10px] font-mono leading-none text-destructive">{breachedCount}</span>
            </div>
          )}
          <div
            className="flex flex-row items-center gap-1.5 text-muted-foreground"
            title={`${upcomingCount} cash moves in the next 14 days`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono leading-none">{upcomingCount}</span>
          </div>
        </div>

        <div className="flex flex-row items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            data-testid="context-glance-rail-toggle"
            aria-expanded={expanded}
            title={expanded ? 'Collapse context glance (Alt+G)' : 'Expand context glance (Alt+G)'}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronRight className="w-3.5 h-3.5 rotate-90" /> : <ChevronLeft className="w-3.5 h-3.5 rotate-90" />}
          </Button>
        </div>
      </div>
    </div>
  );
};
