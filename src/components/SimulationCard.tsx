import React, { useState } from 'react';
import {
  Cpu,
  Code2,
  ChevronDown,
  Copy,
  Check,
  CheckCircle2,
  FastForward,
  Pause,
  CalendarDays,
  ArrowRightLeft,
  CreditCard,
  PlusCircle,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { toast } from '@/components/ui/sonner';
import { MiniBalanceChart } from './MiniBalanceChart';
import { usePlannerStore } from '../store/usePlannerStore';
import { applyChangesToBlueprint, BlueprintChange } from '../core/tools';
import { Account, Event } from '../core/models';
import { cn } from '@/lib/utils';

const formatCurrency = (val: number) =>
  val.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });

export interface SimulationCardProps {
  toolName: string; // 'simulate' | 'propose_blueprint_changes'
  toolCallId?: string;
  parsedContent: any;
  changes?: BlueprintChange[];
  accounts?: Account[];
  events?: Event[];
  executedEvents?: Record<string, boolean>;
  proposalId?: string | number;
  status?: 'pending' | 'applied' | 'rejected';
  onStatusChange?: (status: 'pending' | 'applied' | 'rejected') => void;
  onApply?: () => void;
  onReject?: () => void;
  className?: string;
}

export const SimulationCard: React.FC<SimulationCardProps> = ({
  toolName,
  parsedContent,
  changes = [],
  accounts: propAccounts,
  events: propEvents,
  executedEvents: propExecutedEvents,
  proposalId,
  status: propStatus = 'pending',
  onStatusChange,
  onApply,
  onReject,
  className,
}) => {
  const store = usePlannerStore();
  const accountsList = propAccounts || store.accounts;
  const eventsList = propEvents || store.events;
  const effectiveExecuted = propExecutedEvents || store.executedEvents;
  const applyBlueprintChangesWithSnapshot = store.applyBlueprintChangesWithSnapshot;
  const restoreBlueprintSnapshot = store.restoreBlueprintSnapshot;

  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [internalStatus, setInternalStatus] = useState(propStatus);
  const currentStatus = propStatus !== 'pending' ? propStatus : internalStatus;

  // Sync internal state if prop changes from parent
  React.useEffect(() => {
    setInternalStatus(propStatus);
  }, [propStatus]);

  const rawPayload = {
    tool: toolName,
    ...(parsedContent || {}),
    changes,
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(JSON.stringify(rawPayload, null, 2));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const updateStatus = (st: 'pending' | 'applied' | 'rejected') => {
    setInternalStatus(st);
    onStatusChange?.(st);
  };

  const handleApply = () => {
    try {
      const { newAccounts, newEvents, executedEventsOverrides } = applyChangesToBlueprint(
        accountsList,
        eventsList,
        changes
      );
      const snapshot = applyBlueprintChangesWithSnapshot(newAccounts, newEvents, executedEventsOverrides);
      updateStatus('applied');
      onApply?.();

      toast.success(`Applied ${changes.length} change(s) to plan`, {
        duration: 10000,
        action: {
          label: 'Undo',
          onClick: () => {
            restoreBlueprintSnapshot(snapshot);
            updateStatus('pending');
            toast.info('Plan changes undone', { duration: 3000 });
          },
        },
      });
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to apply changes');
    }
  };

  const handleReject = () => {
    updateStatus('rejected');
    onReject?.();
  };

  const affectedAccounts =
    parsedContent?.diff?.affected_accounts ||
    parsedContent?.affected_accounts ||
    {};
  const hasAffectedAccounts = Object.keys(affectedAccounts).length > 0;

  const renderActionIcon = (type: string) => {
    switch (type) {
      case 'skip_event': return <FastForward className="w-4 h-4 text-orange-500" />;
      case 'pause_event': return <Pause className="w-4 h-4 text-blue-500" />;
      case 'move_event': return <ArrowRightLeft className="w-4 h-4 text-purple-500" />;
      case 'set_amount': return <Activity className="w-4 h-4 text-amber-500" />;
      case 'pay_debt': return <CreditCard className="w-4 h-4 text-red-500" />;
      case 'add_one_time': return <PlusCircle className="w-4 h-4 text-emerald-500" />;
      default: return <Cpu className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const renderActionText = (c: any) => {
    const eventName = eventsList.find((e) => e.id === c.event_id)?.name || c.event_id;
    const accName = accountsList.find((a) => a.id === c.from_account_id)?.name || c.from_account_id;
    const cardName = accountsList.find((a) => a.id === c.card_id)?.name || c.card_id;

    switch (c.type) {
      case 'skip_event': return <span>Skip {eventName} on {c.date}</span>;
      case 'pause_event': return <span>Pause {eventName} from {c.from_date} to {c.to_date}</span>;
      case 'move_event': return <span>Move {eventName} from {c.from_date} to {c.to_date}</span>;
      case 'set_amount': return <span>Set {eventName} to {formatCurrency(c.amount_cents / 100)}</span>;
      case 'pay_debt': return <span>Pay {formatCurrency(c.amount_cents / 100)} to {cardName} from {accName}</span>;
      case 'add_one_time': return <span>Add {formatCurrency(c.amount_cents / 100)} from {accName} on {c.date}</span>;
      default: return <span>{c.type}</span>;
    }
  };

  return (
    <div
      id={proposalId !== undefined ? `proposal-${proposalId}` : undefined}
      className={cn('flex w-full justify-start my-4', className)}
      data-testid="simulation-card"
    >
      <Card className="w-full max-w-[92%] shadow-sm overflow-hidden bg-background">
        <CardHeader className="py-2.5 px-4 border-b bg-muted/40 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Cpu className="w-4 h-4 text-primary" />
            <span>{toolName === 'simulate' ? 'Scenario Simulation' : 'Proposed Blueprint'}</span>
          </div>
          {currentStatus === 'applied' && (
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30">
              Applied
            </Badge>
          )}
          {currentStatus === 'rejected' && (
            <Badge variant="outline" className="text-muted-foreground">
              Rejected
            </Badge>
          )}
        </CardHeader>
        
        <CardContent className="p-0">
          {parsedContent?.error ? (
            <div className="m-4 text-sm text-destructive font-medium p-3 bg-destructive/10 rounded-md border border-destructive/20">
              <AlertTriangle className="w-4 h-4 inline mr-2 -mt-0.5" />
              {parsedContent.error}
            </div>
          ) : (
            <>
              {changes.length > 0 && (
                <div className="p-4 border-b border-border/40 bg-card">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Actions</div>
                  <div className="grid gap-2">
                    {changes.map((c: any, idx) => (
                      <div key={`change-${idx}`} className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="p-1.5 bg-muted rounded-md shrink-0">
                          {renderActionIcon(c.type)}
                        </div>
                        <div className="leading-tight">
                          {renderActionText(c)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 bg-muted/10">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">30-Day Outlook</div>
                {!hasAffectedAccounts ? (
                  <div className="text-sm text-muted-foreground italic text-center p-4 border border-dashed rounded-lg">
                    No account balances or floors were impacted by these actions.
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {Object.keys(affectedAccounts).map((accId) => {
                      const acc = affectedAccounts[accId];
                      const balanceBefore = typeof acc.lowest_balance_before === 'number' ? acc.lowest_balance_before : 0;
                      const balanceAfter = typeof acc.lowest_balance_after === 'number' ? acc.lowest_balance_after : 0;
                      
                      const diff = balanceAfter - balanceBefore;
                      const isPositive = diff > 0;
                      const isNegative = diff < 0;
                      
                      const hasBreachBefore = !!acc.first_breach_before && acc.first_breach_before !== 'None';
                      const hasBreachAfter = !!acc.first_breach_after && acc.first_breach_after !== 'None';
                      
                      const newBreach = hasBreachAfter && !hasBreachBefore;
                      const resolvedBreach = !hasBreachAfter && hasBreachBefore;

                      return (
                        <div key={`acc-${accId}`} className="bg-background rounded-lg border border-border shadow-sm overflow-hidden">
                          <div className="px-3 py-2 flex items-center justify-between bg-muted/40 border-b border-border/40">
                            <span className="font-semibold text-sm">{acc.name}</span>
                            <div className="flex gap-2">
                              {newBreach && <Badge variant="destructive" className="h-5 text-[10px] uppercase tracking-wide font-bold">Breach Risk</Badge>}
                              {resolvedBreach && <Badge variant="secondary" className="h-5 text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 uppercase tracking-wide font-bold">Breach Resolved</Badge>}
                            </div>
                          </div>
                          
                          <div className="p-3 grid grid-cols-2 gap-4 items-center border-b border-border/40">
                            <div>
                              <div className="text-[10px] text-muted-foreground mb-1 font-semibold uppercase tracking-wider">Lowest Balance</div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/40">{formatCurrency(balanceBefore)}</span>
                                <span className="text-muted-foreground text-xs">→</span>
                                <span className={cn("text-sm font-bold", isPositive ? "text-emerald-600 dark:text-emerald-400" : isNegative ? "text-destructive" : "text-foreground")}>
                                  {formatCurrency(balanceAfter)}
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-end items-center">
                              {diff !== 0 && (
                                <div className={cn("flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md", isPositive ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-destructive/15 text-destructive")}>
                                  {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                  {isPositive ? '+' : ''}{formatCurrency(diff)}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="bg-muted/5">
                            <MiniBalanceChart
                              accountId={accId}
                              accountName={acc.name}
                              accounts={accountsList}
                              events={eventsList}
                              changes={changes}
                              executedEvents={effectiveExecuted}
                              height={110}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex flex-col p-0">
          {!parsedContent?.error && (
            <div className="w-full bg-muted/20 border-t border-border/40">
              <Collapsible open={rawJsonOpen} onOpenChange={setRawJsonOpen}>
                <div className="flex items-center justify-between p-2">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
                      <Code2 className="w-3.5 h-3.5 mr-1.5" />
                      {rawJsonOpen ? 'Hide raw JSON' : 'View raw JSON'}
                      <ChevronDown className={cn('w-3.5 h-3.5 ml-1 transition-transform', rawJsonOpen && 'rotate-180')} />
                    </Button>
                  </CollapsibleTrigger>
                  
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={handleCopy}>
                    {copied ? <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <CollapsibleContent className="px-3 pb-3">
                  <pre className="p-3 bg-zinc-950 text-zinc-50 rounded-md text-[10px] font-mono overflow-x-auto max-h-48 leading-relaxed shadow-inner">
                    {JSON.stringify(rawPayload, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {toolName === 'propose_blueprint_changes' && currentStatus === 'pending' && !parsedContent?.error && (
            <div className="flex gap-2 w-full p-3 bg-background border-t border-border/60">
              <Button size="sm" variant="signal" className="flex-1 font-semibold shadow-none gap-1.5" onClick={handleApply}>
                <CheckCircle2 className="w-4 h-4" /> Apply to Plan
              </Button>
              <Button size="sm" variant="outline" onClick={handleReject} className="shadow-none text-xs">
                Reject
              </Button>
            </div>
          )}
          
          {toolName === 'propose_blueprint_changes' && currentStatus === 'applied' && (
            <div className="w-full text-center p-2.5 border-t border-border/60 text-xs text-signal font-semibold flex items-center justify-center gap-1.5 bg-signal/10 font-mono">
              <CheckCircle2 className="w-4 h-4 text-signal" /> Changes successfully applied to plan
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};
