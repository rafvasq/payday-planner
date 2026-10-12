import React, { useState, useEffect } from 'react';
import { ActualView } from '../../core/ai/toolkit';
import { formatCents } from '../../core/ai/world';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Check, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ActualChoice = 'update_balances' | 'treat_as_landed' | 'already_in_balances';
export type RecordActualStatus = 'pending' | 'applied' | 'assumed' | 'acknowledged';

export interface RecordActualCardProps {
  actualView: ActualView;
  status?: RecordActualStatus;
  onChoice?: (choice: ActualChoice) => void;
  toolCallId?: string;
  className?: string;
}

export const RecordActualCard: React.FC<RecordActualCardProps> = ({
  actualView,
  status: propStatus = 'pending',
  onChoice,
  toolCallId,
  className,
}) => {
  const [internalStatus, setInternalStatus] = useState<RecordActualStatus>(propStatus);
  const currentStatus = propStatus !== 'pending' ? propStatus : internalStatus;

  useEffect(() => {
    setInternalStatus(propStatus);
  }, [propStatus]);

  const handleChoice = (choice: ActualChoice) => {
    const nextStatus: RecordActualStatus =
      choice === 'update_balances'
        ? 'applied'
        : choice === 'treat_as_landed'
        ? 'assumed'
        : 'acknowledged';
    setInternalStatus(nextStatus);
    onChoice?.(choice);
  };

  const accountsList = actualView?.accounts || [];
  const risksList = actualView?.risks || [];
  const description = actualView?.description || 'Recorded Transaction';
  const txDescriptions = actualView?.transaction_descriptions || [];

  return (
    <div
      id={toolCallId ? `record-actual-${toolCallId}` : undefined}
      className={cn('flex w-full justify-start my-4', className)}
      data-testid="record-actual-card"
    >
      <Card className="w-full max-w-[92%] shadow-sm overflow-hidden bg-background border border-border">
        <CardHeader className="py-2.5 px-4 border-b bg-muted/40 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <ArrowRightLeft className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Recorded Transaction</CardTitle>
          </div>
          {currentStatus === 'applied' && (
            <Badge
              variant="secondary"
              className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
            >
              Balances Updated
            </Badge>
          )}
          {currentStatus === 'assumed' && (
            <Badge
              variant="secondary"
              className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
            >
              Assumed Landed
            </Badge>
          )}
          {currentStatus === 'acknowledged' && (
            <Badge variant="outline" className="text-muted-foreground">
              Acknowledged
            </Badge>
          )}
          {currentStatus === 'pending' && (
            <Badge
              variant="outline"
              className="text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 text-[11px]"
            >
              Action Required
            </Badge>
          )}
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium text-foreground">{description}</div>
            {txDescriptions.length > 0 && (
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                {txDescriptions.map((desc, idx) => (
                  <li key={idx}>{desc}</li>
                ))}
              </ul>
            )}
            <div className="text-xs text-muted-foreground/80 mt-1">
              How would you like to reflect this transaction in your plan?
            </div>
          </div>

          {accountsList.length > 0 && (
            <div className="rounded-md border border-border/60 overflow-hidden bg-background">
              <table className="w-full text-xs" data-testid="record-actual-table">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/40 text-muted-foreground">
                    <th className="py-2 px-3 text-left font-semibold">Account</th>
                    <th className="py-2 px-3 text-right font-semibold">Before</th>
                    <th className="py-2 px-3 text-right font-semibold">After</th>
                    <th className="py-2 px-3 text-right font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {accountsList.map((acc) => {
                    const diff = acc.after_cents - acc.before_cents;
                    const isPositive = diff > 0;
                    const isNegative = diff < 0;
                    return (
                      <tr key={acc.id} className="hover:bg-muted/20">
                        <td className="py-2 px-3 font-medium text-foreground">{acc.name}</td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {formatCents(acc.before_cents)}
                        </td>
                        <td
                          className={cn(
                            'py-2 px-3 text-right font-semibold',
                            isNegative && acc.after_cents < 0
                              ? 'text-destructive'
                              : 'text-foreground'
                          )}
                        >
                          {formatCents(acc.after_cents)}
                        </td>
                        <td
                          className={cn(
                            'py-2 px-3 text-right font-mono font-medium',
                            isPositive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isNegative
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                          )}
                        >
                          {isPositive ? '+' : ''}
                          {formatCents(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {risksList.length > 0 && (
            <div
              className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5"
              data-testid="risk-callout"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-amber-900 dark:text-amber-200">
                  New Risk Warning
                </div>
                {risksList.map((risk, idx) => (
                  <p key={idx} className="leading-snug">
                    {risk}
                  </p>
                ))}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="p-3 bg-muted/20 border-t border-border/40 flex flex-col gap-2">
          {currentStatus === 'pending' ? (
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <Button
                size="sm"
                variant="default"
                className="flex-1 font-semibold text-xs"
                onClick={() => handleChoice('update_balances')}
                data-testid="choice-update-balances"
              >
                Update my balances
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => handleChoice('treat_as_landed')}
                data-testid="choice-treat-as-landed"
              >
                Treat as landed (don't save)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => handleChoice('already_in_balances')}
                data-testid="choice-already-in-balances"
              >
                Already in my balances
              </Button>
            </div>
          ) : currentStatus === 'applied' ? (
            <div className="w-full text-center py-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium flex items-center justify-center gap-1.5 bg-emerald-500/10 rounded border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Balances updated in plan</span>
            </div>
          ) : currentStatus === 'assumed' ? (
            <div className="w-full text-center py-1.5 text-xs text-blue-700 dark:text-blue-400 font-medium flex items-center justify-center gap-1.5 bg-blue-500/10 rounded border border-blue-500/20">
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Added to Scenario Tray as active assumption</span>
            </div>
          ) : (
            <div className="w-full text-center py-1.5 text-xs text-muted-foreground font-medium flex items-center justify-center gap-1.5 bg-muted rounded border border-border/40">
              <Check className="w-4 h-4 text-muted-foreground" />
              <span>Acknowledged: already reflected in balances</span>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};
