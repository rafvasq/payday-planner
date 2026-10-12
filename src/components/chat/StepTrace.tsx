import React, { useState, useMemo } from 'react';
import {
  Check,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Code2,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { ToolExecution, FigureSource, prettyDate } from '@/core/ai/toolkit';

export interface StepDetail {
  name?: string;
  summary?: string;
  input?: any;
  args?: any;
  result?: any;
  output?: any;
  rawPayload?: any;
  sources?: FigureSource[];
  status?: 'completed' | 'in_progress' | 'error';
  ok?: boolean;
  error?: string;
  tool_execution?: ToolExecution;
  label?: string;
}

export interface StepTraceProps {
  /** Multiple steps in a sequence */
  steps?: (StepDetail | ToolExecution | any)[];
  /** Single step convenience props */
  step?: StepDetail | ToolExecution | any;
  execution?: ToolExecution;
  toolExecution?: ToolExecution;
  name?: string;
  summary?: string;
  result?: any;
  rawPayload?: any;
  input?: any;
  args?: any;
  status?: 'completed' | 'in_progress' | 'error';
  ok?: boolean;
  error?: string;
  isLoading?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

interface NormalizedStep {
  id: string;
  name: string;
  summary: string;
  status: 'completed' | 'in_progress' | 'error';
  input?: any;
  result?: any;
  rawPayload: any;
  error?: string;
}

function normalizeStepItem(raw: any, index: number, isLoadingProp?: boolean): NormalizedStep {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `step-${index}`,
      name: 'unknown',
      summary: 'Tool activity',
      status: 'completed',
      rawPayload: raw,
    };
  }

  const exec: ToolExecution | undefined = raw.tool_execution || (raw.summary && raw.result ? raw : undefined);
  const name = raw.name || exec?.name || (raw.function?.name ?? 'tool');
  let summary = raw.summary || exec?.summary;

  let input = raw.input ?? raw.args ?? raw.arguments;
  if (!input && raw.function?.arguments) {
    try {
      input = typeof raw.function.arguments === 'string'
        ? JSON.parse(raw.function.arguments)
        : raw.function.arguments;
    } catch {}
  }

  const result = raw.result ?? exec?.result ?? (raw.output ? raw.output : undefined);
  const rawPayload = raw.rawPayload ?? result ?? exec?.result ?? raw;

  if (!summary) {
    if (name === 'get_snapshot') {
      summary = 'Read plan snapshot';
    } else if (name === 'get_schedule') {
      const from = input?.from_date ? prettyDate(input.from_date) : '';
      const to = input?.to_date ? prettyDate(input.to_date) : '';
      summary = from && to ? `Checked schedule ${from} – ${to}` : 'Checked schedule';
    } else if (name === 'simulate') {
      summary = input?.label ? `Simulated "${input.label}"` : 'Simulated scenario';
    } else if (name === 'propose_blueprint_changes') {
      summary = input?.label ? `Proposed "${input.label}"` : 'Proposed plan changes';
    } else if (name === 'record_actual') {
      summary = input?.description ? `Asked how to record "${input.description}"` : 'Recorded transaction';
    } else {
      summary = name ? `Executed ${name}` : 'Tool execution';
    }
  }

  let status: 'completed' | 'in_progress' | 'error' = 'completed';
  if (isLoadingProp || raw.isLoading || raw.status === 'in_progress') {
    status = 'in_progress';
  } else if (raw.ok === false || exec?.ok === false || raw.error || exec?.error || raw.status === 'error') {
    status = 'error';
  }

  return {
    id: raw.tool_call_id || raw.id || `step-${index}-${name}`,
    name,
    summary,
    status,
    input,
    result,
    rawPayload,
    error: raw.error || exec?.error,
  };
}

export const StepTrace: React.FC<StepTraceProps> = ({
  steps: stepsProp,
  step: singleStepProp,
  execution,
  toolExecution,
  name,
  summary,
  result,
  rawPayload,
  input,
  args,
  status: statusProp,
  ok,
  error,
  isLoading,
  defaultExpanded = true,
  className,
}) => {
  const [railOpen, setRailOpen] = useState(defaultExpanded);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [devViewOpen, setDevViewOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const normalizedSteps: NormalizedStep[] = useMemo(() => {
    if (Array.isArray(stepsProp) && stepsProp.length > 0) {
      return stepsProp.map((item, idx) => normalizeStepItem(item, idx, isLoading));
    }
    const single = singleStepProp || execution || toolExecution || {
      name,
      summary,
      result,
      rawPayload,
      input: input || args,
      status: statusProp,
      ok,
      error,
      isLoading,
    };
    return [normalizeStepItem(single, 0, isLoading)];
  }, [
    stepsProp,
    singleStepProp,
    execution,
    toolExecution,
    name,
    summary,
    result,
    rawPayload,
    input,
    args,
    statusProp,
    ok,
    error,
    isLoading,
  ]);

  const toggleStepDetails = (id: string) => {
    setExpandedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopy = async () => {
    try {
      const payloadToCopy =
        normalizedSteps.length === 1
          ? normalizedSteps[0].rawPayload
          : normalizedSteps.map((s) => ({
              step: s.name,
              summary: s.summary,
              status: s.status,
              payload: s.rawPayload,
            }));
      await navigator.clipboard.writeText(JSON.stringify(payloadToCopy, null, 2));
      setCopied(true);
      toast.success('Raw JSON copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const totalSteps = normalizedSteps.length;
  const isAnyInProgress = normalizedSteps.some((s) => s.status === 'in_progress');
  const isAnyError = normalizedSteps.some((s) => s.status === 'error');

  return (
    <div
      data-testid="step-trace"
      className={cn(
        'rounded-xl border border-border/60 bg-muted/30 text-card-foreground text-xs overflow-hidden shadow-sm transition-all my-2',
        className
      )}
    >
      {/* Activity Rail Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/40 select-none">
        <button
          type="button"
          onClick={() => setRailOpen(!railOpen)}
          className="flex items-center gap-2 text-left hover:text-foreground text-muted-foreground transition-colors font-medium flex-1 min-w-0"
        >
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-background border border-border/60 shrink-0">
            {isAnyInProgress ? (
              <Loader2 className="w-3 h-3 animate-spin text-primary" data-testid="status-in-progress" />
            ) : isAnyError ? (
              <AlertTriangle className="w-3 h-3 text-destructive" data-testid="status-error" />
            ) : (
              <Check className="w-3 h-3 text-emerald-500" data-testid="status-completed" />
            )}
          </div>
          <span className="font-semibold text-foreground truncate">
            {totalSteps === 1 ? normalizedSteps[0].summary : `Agent Activity (${totalSteps} steps)`}
          </span>
          <ChevronDown
            className={cn('w-3.5 h-3.5 ml-1 transition-transform text-muted-foreground shrink-0', railOpen && 'rotate-180')}
          />
        </button>

        {/* Tertiary Developer View Toggle */}
        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="developer-view-toggle"
            onClick={() => setDevViewOpen(!devViewOpen)}
            className={cn(
              'h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground font-mono',
              devViewOpen && 'bg-secondary text-secondary-foreground font-semibold'
            )}
            title="Inspect raw JSON payload"
          >
            <Code2 className="w-3 h-3" />
            <span>Developer view</span>
          </Button>
        </div>
      </div>

      {/* Activity Rail Content */}
      <Collapsible open={railOpen} onOpenChange={setRailOpen}>
        <CollapsibleContent>
          <div className="p-3 space-y-3">
            {/* Activity Rail Timeline */}
            <div className="relative border-l-2 border-border/60 ml-3 pl-3.5 space-y-3 py-1">
              {normalizedSteps.map((step) => {
                const isExpanded = !!expandedSteps[step.id];

                return (
                  <div key={step.id} className="relative group">
                    {/* Visual Status Indicator on Rail */}
                    <div
                      className={cn(
                        'absolute -left-[21px] top-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-background border shadow-xs',
                        step.status === 'completed' && 'border-emerald-500/40 text-emerald-500',
                        step.status === 'in_progress' && 'border-primary/50 text-primary',
                        step.status === 'error' && 'border-destructive text-destructive'
                      )}
                    >
                      {step.status === 'completed' && <Check className="w-2.5 h-2.5 stroke-[2.5]" />}
                      {step.status === 'in_progress' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                      {step.status === 'error' && <AlertTriangle className="w-2.5 h-2.5" />}
                    </div>

                    {/* Step Summary Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-foreground text-xs leading-tight">
                            {step.summary}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono text-muted-foreground">
                            {step.name}
                          </Badge>
                        </div>
                      </div>

                      {/* Expandable step details toggle button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStepDetails(step.id)}
                        className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <span>{isExpanded ? 'Hide details' : 'Details'}</span>
                        <ChevronDown className={cn('w-3 h-3 ml-0.5 transition-transform', isExpanded && 'rotate-180')} />
                      </Button>
                    </div>

                    {/* Expandable Step Details: Formatted Inputs & Outputs */}
                    {isExpanded && (
                      <div className="mt-2 p-2.5 rounded-lg bg-background/80 border border-border/50 text-xs space-y-2">
                        {/* Formatted Inputs */}
                        {step.input && Object.keys(step.input).length > 0 && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                              Inputs
                            </div>
                            <div className="bg-muted/40 rounded p-2 font-mono text-[11px] space-y-1">
                              {Object.entries(step.input).map(([k, v]) => (
                                <div key={k} className="flex flex-wrap items-baseline gap-1">
                                  <span className="text-muted-foreground font-medium">{k}:</span>
                                  <span className="text-foreground">
                                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Formatted Outputs / Results */}
                        {step.result && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                              Formatted Result
                            </div>
                            <div className="bg-muted/40 rounded p-2 text-[11px] space-y-1.5">
                              {step.result.as_of && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <span className="font-semibold">As of:</span>
                                  <span>{step.result.as_of}</span>
                                </div>
                              )}

                              {step.result.overall_status && (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-muted-foreground">Status:</span>
                                  <Badge
                                    variant={step.result.overall_status === 'safe' ? 'secondary' : 'destructive'}
                                    className="text-[10px]"
                                  >
                                    {step.result.overall_status}
                                  </Badge>
                                </div>
                              )}

                              {Array.isArray(step.result.accounts) && step.result.accounts.length > 0 && (
                                <div>
                                  <div className="font-semibold text-muted-foreground mb-1">Accounts inspected:</div>
                                  <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
                                    {step.result.accounts.slice(0, 6).map((acc: any, i: number) => (
                                      <div key={i} className="flex justify-between bg-background/50 px-1.5 py-0.5 rounded border border-border/30">
                                        <span className="truncate">{acc.name || acc.account || acc.account_id}</span>
                                        <span className="font-semibold ml-1">{acc.balance || acc.end_balance || ''}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {Array.isArray(step.result.events) && (
                                <div className="text-muted-foreground">
                                  <span className="font-semibold">{step.result.events.length}</span> upcoming event{step.result.events.length === 1 ? '' : 's'} scheduled in period
                                </div>
                              )}

                              {step.result.verdict_before && step.result.verdict_after && (
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-muted-foreground">Verdict:</span>
                                  <span>{step.result.verdict_before} → {step.result.verdict_after}</span>
                                </div>
                              )}

                              {step.result.error && (
                                <div className="text-destructive font-medium">
                                  Error: {step.result.error}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {step.error && (
                          <div className="p-2 rounded bg-destructive/10 text-destructive text-[11px] font-medium">
                            {step.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Developer View (Raw JSON Inspection + Copy Button) */}
            {devViewOpen && (
              <div className="pt-2 border-t border-border/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground font-semibold">
                    <Code2 className="w-3.5 h-3.5" />
                    <span>Raw JSON Payload</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span className="text-emerald-500 font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>
                <pre className="p-2.5 bg-zinc-950 text-zinc-50 rounded-md text-[10px] font-mono overflow-x-auto max-h-52 leading-relaxed shadow-inner">
                  {JSON.stringify(
                    normalizedSteps.length === 1
                      ? normalizedSteps[0].rawPayload
                      : normalizedSteps.map((s) => s.rawPayload),
                    null,
                    2
                  )}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
