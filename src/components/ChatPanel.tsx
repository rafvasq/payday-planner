import React, { useRef, useEffect, useMemo, useState } from 'react';

import { usePlannerStore } from '../store/usePlannerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useChat, useChatOptional, ChatProvider } from '../context/ChatContext';
import {
  Send,
  Bot,
  Loader2,
  Cpu,
  X,
  FileText,
  AlertTriangle,
  Trash2,
  Square,
  ArrowDown,
  Coins,
  Maximize2,
  Minimize2,
  RotateCcw,
  BarChart3,
  Minus,
  Sparkles,
  ExternalLink,
  Database,
} from 'lucide-react';
import { useNavigate, useInRouterContext } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ModelPopover } from './ModelPopover';
import { SimulationCard } from './SimulationCard';
import { RecordActualCard } from './chat/RecordActualCard';
import { ScenarioTray } from './chat/ScenarioTray';
import { MiniBalanceChart } from './MiniBalanceChart';
import { ContextGlanceBar } from './ContextGlanceBar';
import { ContextGlanceRibbon } from './chat/ContextGlanceRibbon';
import { StepTrace } from './chat/StepTrace';
import { ContextInspector } from './chat/ContextInspector';
import { StalenessPill } from './chat/StalenessPill';
import { useScrollAnchor } from '@/hooks/useScrollAnchor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FigureChip } from './chat/FigureChip';
import { GroundingBadge } from './chat/GroundingBadge';
import {
  ActualView,
  describeTransaction,
  transactionsToAdjustments,
} from '../core/ai/toolkit';
import { toCents, snapshotId } from '../core/ai/world';
import {
  classifyMessageFigures,
  classifyFigure,
  harvestBaselineSources,
  isCurrencyToken,
  FigureClassification,
} from '../core/ai/provenance';
import { applyChangesToBlueprint } from '../core/tools';
import { buildCalendar } from '../core/calendar';
import { format, addDays } from 'date-fns';
import { toast } from '@/components/ui/sonner';

const formatCurrency = (val: number) =>
  val.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });

function replaceFigureChips(
  node: React.ReactNode,
  figureMap: Map<string, FigureClassification>,
  allSources: import('../core/ai/toolkit').FigureSource[],
  userMessages: string[]
): React.ReactNode {
  if (typeof node === 'string') {
    const regex = /-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\$\d+(?:\.\d{2})?/g;
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(node)) !== null) {
      const rawToken = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + rawToken.length;

      if (!isCurrencyToken(rawToken)) {
        continue;
      }

      if (startIndex > lastIndex) {
        result.push(node.slice(lastIndex, startIndex));
      }

      const classification =
        figureMap.get(rawToken) ||
        classifyFigure(rawToken, allSources, userMessages);

      result.push(
        <FigureChip
          key={`fig-${startIndex}-${rawToken}`}
          classificationData={classification}
        />
      );

      lastIndex = endIndex;
    }

    if (lastIndex < node.length) {
      result.push(node.slice(lastIndex));
    }

    return result.length > 0 ? result : node;
  }

  if (Array.isArray(node)) {
    return React.Children.map(node, (child) =>
      replaceFigureChips(child, figureMap, allSources, userMessages)
    );
  }

  if (React.isValidElement(node)) {
    if (node.type === 'code' || node.type === 'pre' || node.type === FigureChip) {
      return node;
    }
    const props = node.props as any;
    if (props && props.children) {
      return React.cloneElement(node, {
        ...props,
        children: replaceFigureChips(props.children, figureMap, allSources, userMessages),
      });
    }
  }

  return node;
}

function createFigureComponents(
  figureMap: Map<string, FigureClassification>,
  allSources: import('../core/ai/toolkit').FigureSource[],
  userMessages: string[]
) {
  const wrapTag = (tag: string) => {
    const Component = ({ children, node, ...props }: any) => {
      const Tag = tag as any;
      return <Tag {...props}>{replaceFigureChips(children, figureMap, allSources, userMessages)}</Tag>;
    };
    Component.displayName = `FigureWrapped(${tag})`;
    return Component;
  };

  return {
    p: wrapTag('p'),
    li: wrapTag('li'),
    td: wrapTag('td'),
    th: wrapTag('th'),
    strong: wrapTag('strong'),
    em: wrapTag('em'),
    h1: wrapTag('h1'),
    h2: wrapTag('h2'),
    h3: wrapTag('h3'),
    h4: wrapTag('h4'),
    h5: wrapTag('h5'),
    h6: wrapTag('h6'),
    blockquote: wrapTag('blockquote'),
    span: wrapTag('span'),
  };
}

const AssistantMessageProse: React.FC<{
  content: string;
  sources?: import('../core/ai/toolkit').FigureSource[];
  userMessages: string[];
  accounts: import('../core/models').Account[];
  events: import('../core/models').Event[];
}> = ({ content, sources, userMessages, accounts, events }) => {
  const allSources = useMemo(() => {
    return [...harvestBaselineSources(accounts, events), ...(sources || [])];
  }, [accounts, events, sources]);

  const classificationResult = useMemo(() => {
    return classifyMessageFigures(content, allSources, userMessages);
  }, [content, allSources, userMessages]);

  const figureMap = useMemo(() => {
    const map = new Map<string, FigureClassification>();
    for (const f of classificationResult.figures) {
      map.set(f.rawText, f);
    }
    return map;
  }, [classificationResult]);

  const markdownComponents = useMemo(() => {
    return createFigureComponents(figureMap, allSources, userMessages);
  }, [figureMap, allSources, userMessages]);

  return (
    <>
      {classificationResult.totalFigures > 0 && (
        <span className="sr-only">{content}</span>
      )}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </>
  );
};

const AssistantMessageFooter: React.FC<{
  content: string;
  sources?: import('../core/ai/toolkit').FigureSource[];
  userMessages: string[];
  accounts: import('../core/models').Account[];
  events: import('../core/models').Event[];
  isLastAssistant: boolean;
  isStreaming: boolean;
  onRegenerate: () => void;
}> = ({
  content,
  sources,
  userMessages,
  accounts,
  events,
  isLastAssistant,
  isStreaming,
  onRegenerate,
}) => {
  const allSources = useMemo(() => {
    return [...harvestBaselineSources(accounts, events), ...(sources || [])];
  }, [accounts, events, sources]);

  const classificationResult = useMemo(() => {
    return classifyMessageFigures(content, allSources, userMessages);
  }, [content, allSources, userMessages]);

  const hasFigures = classificationResult.totalFigures > 0;
  const showRegen = isLastAssistant && !isStreaming;

  if (!hasFigures && !showRegen) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/40 mt-1">
      {hasFigures ? (
        <GroundingBadge
          totalFigures={classificationResult.totalFigures}
          unverifiedCount={classificationResult.unverifiedCount}
          figures={classificationResult.figures}
        />
      ) : (
        <div />
      )}
      {showRegen && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          disabled={isStreaming}
          className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground flex items-center gap-1.5 ml-auto"
          title="Regenerate response"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Regenerate</span>
        </Button>
      )}
    </div>
  );
};

export interface ChatPanelProps {
  mode?: 'page' | 'floating';
  onClose?: () => void;
  onMinimize?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}


const ChatPanelInner: React.FC<ChatPanelProps> = ({
  mode = 'page',
  onClose,
  onMinimize,
  isMaximized,
  onToggleMaximize,
}) => {
  const inRouter = useInRouterContext();
  const navigate = inRouter ? useNavigate() : undefined;

  const {
    messages,
    setMessages,
    input,
    setInput,
    isStreaming,
    selectedModel,
    setSelectedModel,
    availableModels,
    handleSend,
    handleStop,
    handleRegenerate,
    clearMessages,
    proposalStatuses,
    setProposalStatus,
    setIsOpen,
    recordStatuses,
    applyRecordActual,
    isInspectorOpen,
    setIsInspectorOpen,
    toggleInspector,
    assumptions,
  } = useChat();

  const {
    accounts,
    events,
    executedEvents,
    startingBalancesReflectToday,
    uploadedFiles,
    removeUploadedFile,
    applyBlueprintChangesWithSnapshot,
    restoreBlueprintSnapshot,
  } = usePlannerStore();

  const currentSnapshotId = useMemo(() => {
    const world = {
      accounts,
      events,
      executedEvents,
      balancesReflectToday: !!startingBalancesReflectToday,
      today: format(new Date(), 'yyyy-MM-dd'),
    };
    return snapshotId(world, assumptions || []);
  }, [accounts, events, executedEvents, startingBalancesReflectToday, assumptions]);

  const {
    showTokenUsage,
    setShowTokenUsage,
    showContextGlance,
    setShowContextGlance,
  } = useSettingsStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isAtBottom, scrollToBottom } = useScrollAnchor(scrollRef, messagesEndRef, [
    messages,
    isStreaming,
  ]);

  // Reset textarea height on clear
  useEffect(() => {
    if (input === '') {
      const textarea = document.getElementById('chat-input-textarea');
      if (textarea) textarea.style.height = '60px';
    }
  }, [input]);

  // Re-measure textarea height when the container width changes text wrapping
  useEffect(() => {
    const textarea = document.getElementById('chat-input-textarea') as HTMLTextAreaElement | null;
    if (!textarea || typeof ResizeObserver === 'undefined') return;
    let lastWidth = textarea.offsetWidth;
    const ro = new ResizeObserver(() => {
      if (textarea.offsetWidth === lastWidth) return;
      lastWidth = textarea.offsetWidth;
      textarea.style.height = '60px';
      textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 60), 200) + 'px';
    });
    ro.observe(textarea);
    return () => ro.disconnect();
  }, []);


  const lastAssistantIndex = useMemo(() => {
    for (let idx = messages.length - 1; idx >= 0; idx--) {
      if (messages[idx].role === 'assistant') return idx;
    }
    return -1;
  }, [messages]);

  const totalTokens = useMemo(() => {
    return messages.reduce((acc, msg) => {
      const usage = (msg as any).usage;
      if (usage && usage.total_tokens) {
        return acc + usage.total_tokens;
      } else if (usage && usage.prompt_tokens && usage.completion_tokens) {
        return acc + usage.prompt_tokens + usage.completion_tokens;
      }
      return acc;
    }, 0);
  }, [messages]);

  return (
    <Card
      className={cn(
        'flex flex-col h-full w-full mx-auto',
        mode === 'floating'
          ? 'shadow-none border-0 rounded-none bg-background'
          : 'shadow-md border-0 sm:border rounded-none sm:rounded-xl'
      )}
    >
      <CardHeader
        className={cn(
          'border-b border-border bg-muted/20 flex flex-row items-center justify-between shrink-0',
          mode === 'floating' ? 'py-3 px-4' : 'py-4'
        )}
      >
        <div className="min-w-0 pr-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg truncate">
            <Bot className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">AI Financial Assistant</span>
            {uploadedFiles.length > 0 && (
              <Badge
                variant="secondary"
                className="hidden sm:inline-flex text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200"
              >
                CSV Loaded
              </Badge>
            )}
          </CardTitle>
          {mode !== 'floating' && (
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              Ask questions about your budget. The AI has real-time read access to your entire
              blueprint.
            </CardDescription>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-muted-foreground hover:text-foreground",
              showContextGlance && "bg-secondary text-secondary-foreground"
            )}
            title="Toggle Context Glance"
            data-testid="toggle-context-glance"
            onClick={() => setShowContextGlance(!showContextGlance)}
          >
            <Sparkles className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-muted-foreground hover:text-foreground relative",
              isInspectorOpen && "bg-secondary text-secondary-foreground"
            )}
            title="Context Inspector"
            aria-label="Open context inspector"
            data-testid="context-inspector-trigger"
            onClick={toggleInspector}
          >
            <Database className="w-4 h-4" />
            <span
              className="sr-only"
              data-testid="toggle-context-inspector"
              onClick={toggleInspector}
            />
          </Button>

          {messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearMessages}
              className="h-8 text-xs px-2"
              title="Clear Chat"
            >
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          )}

          {mode === 'floating' && onToggleMaximize && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title={isMaximized ? 'Float as chat bubble' : 'Dock to right side'}
              data-testid="chat-toggle-maximize"
              onClick={onToggleMaximize}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          )}
          {mode === 'floating' && onMinimize && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Minimize"
              data-testid="chat-minimize"
              onClick={onMinimize}
            >
              <Minus className="w-4 h-4" />
            </Button>
          )}
          {mode === 'floating' && onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Close"
              aria-label="Close AI chat"
              data-testid="chat-close"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-w-0 overflow-hidden p-0 flex flex-col relative">

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 min-h-[60px]">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-70 space-y-4 py-8">
              <Bot className="w-12 h-12 mb-2 opacity-50" />
              <div className="text-center">
                <p className="text-sm font-medium">Hello! I'm your local AI planner.</p>
                <p className="text-xs mt-1">
                  Ask me how much you can spend, or how a new bill affects you.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-lg">
                {(() => {
                  const prompts = [];
                  prompts.push({
                    label: 'Simulate the next 30 days and tell me if I breach my target floor.',
                    title: 'Simulate next 30 days',
                  });

                  const lowAcc = accounts.find((a) => a.balance < 500 && a.type === 'chequing');
                  if (lowAcc) {
                    prompts.push({
                      label: `I notice ${lowAcc.name} is low. Propose changes to delay bills so I don't breach.`,
                      title: 'Delay bills',
                    });
                  } else {
                    prompts.push({
                      label: 'Propose changes to push my bills back so I have more cash now.',
                      title: 'Delay bills',
                    });
                  }

                  const todayStr = format(new Date(), 'yyyy-MM-dd');
                  const fourteenDaysStr = format(addDays(new Date(), 14), 'yyyy-MM-dd');
                  const cal = buildCalendar(events, todayStr, fourteenDaysStr);
                  
                  const payday = cal.find(e => e.type === 'inflow');
                  const bill = cal.find(e => e.type === 'outflow');

                  if (payday) {
                    prompts.push({
                      label: `What will my balances look like after my next payday on ${payday.date}?`,
                      title: 'Balances after payday',
                    });
                  }
                  
                  if (bill) {
                    prompts.push({
                      label: `Can I afford to pay double on ${bill.name} this week?`,
                      title: `Pay double on ${bill.name}?`,
                    });
                  } else if (!payday) {
                    prompts.push({
                      label: 'Can I afford a $200 unexpected expense today?',
                      title: 'Can I afford $200 today?',
                    });
                  }

                  prompts.push({
                    label: 'What are my upcoming moves this week?',
                    title: 'Moves this week?',
                  });

                  return prompts.map((p, idx) => (
                    <Button
                      key={`starter-prompt-${idx}-${p.title}`}
                      variant="outline"
                      size="sm"
                      className="text-xs bg-background/50 hover:bg-muted"
                      onClick={() => handleSend(p.label)}
                    >
                      {p.title}
                    </Button>
                  ));
                })()}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            if (msg.role === 'tool') {
              let parsed: any;
              try {
                parsed = JSON.parse(msg.content);
              } catch (e) {
                parsed = { error: msg.content };
              }

              const toolCallMsg = messages.find(
                (m) =>
                  m.tool_calls &&
                  m.tool_calls.some((tc: any) => tc.id === (msg as any).tool_call_id)
              );
              const toolCall = toolCallMsg?.tool_calls?.find(
                (tc: any) => tc.id === (msg as any).tool_call_id
              );
              let changes: any[] = [];
              if (toolCall) {
                try {
                  changes = JSON.parse(toolCall.function.arguments).changes || [];
                } catch (e) {}
              }
              if ((!changes || changes.length === 0) && parsed?.changes && Array.isArray(parsed.changes)) {
                changes = parsed.changes;
              }

              const toolCallId = (msg as any).tool_call_id || i.toString();

              if (msg.name === 'record_actual') {
                let actualView: ActualView | undefined = (msg as any).tool_execution?.actual;
                if (!actualView) {
                  let args: any = {};
                  if (toolCall?.function?.arguments) {
                    try {
                      args = JSON.parse(toolCall.function.arguments);
                    } catch {}
                  }
                  const txs = args.transactions || [];
                  const desc = args.description || parsed?.description || 'Recorded Transaction';
                  const adjustments = transactionsToAdjustments(txs, accounts, desc);
                  const touched = Array.from(new Set(adjustments.map((a) => a.account_id)));
                  const touchedAccs = touched.map((id) => {
                    const a = accounts.find((x) => x.id === id);
                    const before = toCents(a?.balance);
                    const delta = adjustments
                      .filter((x) => x.account_id === id)
                      .reduce((s, x) => s + x.delta_cents, 0);
                    return { id, name: a?.name || id, before_cents: before, after_cents: before + delta };
                  });
                  actualView = {
                    description: desc,
                    transactions: txs,
                    transaction_descriptions: txs.map((t: any) => describeTransaction(t, accounts)),
                    adjustments,
                    accounts: touchedAccs,
                    risks: parsed?.new_risks_if_landed || [],
                  };
                }

                return (
                  <RecordActualCard
                    key={`msg-${i}-tool-record-actual`}
                    toolCallId={(msg as any).tool_call_id}
                    actualView={actualView}
                    status={recordStatuses[toolCallId] || 'pending'}
                    onChoice={(choice) => applyRecordActual(choice, actualView!, toolCallId)}
                  />
                );
              }

              if (msg.name === 'simulate' || msg.name === 'propose_blueprint_changes') {
                return (
                  <div key={`msg-${i}-tool`} className="space-y-2">
                    <StepTrace
                      toolExecution={(msg as any).tool_execution}
                      name={msg.name}
                      summary={(msg as any).tool_execution?.summary}
                      result={parsed}
                      rawPayload={parsed}
                    />
                    <SimulationCard
                      proposalId={toolCallId}
                      toolName={msg.name}
                      toolCallId={(msg as any).tool_call_id}
                      parsedContent={parsed}
                      changes={changes}
                      accounts={accounts}
                      events={events}
                      executedEvents={executedEvents}
                      status={proposalStatuses[toolCallId] || 'pending'}
                      onStatusChange={(newStatus) => setProposalStatus(toolCallId, newStatus)}
                    />
                  </div>
                );
              }

              return (
                <StepTrace
                  key={`msg-${i}-tool-${msg.name}`}
                  toolExecution={(msg as any).tool_execution}
                  name={msg.name}
                  summary={(msg as any).tool_execution?.summary}
                  result={parsed}
                  rawPayload={parsed}
                />
              );
            }

            if (!msg.content && msg.role === 'assistant') return null;

            const isLastAssistant = msg.role === 'assistant' && i === lastAssistantIndex;
            const precedingUserMessages =
              msg.role === 'assistant'
                ? messages.slice(0, i).filter((m) => m.role === 'user').map((m) => m.content)
                : [];

            return (
              <div
                key={`msg-${i}-${msg.role}`}
                className={cn(
                  'flex w-full group',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm flex gap-3 flex-col relative',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted border border-border text-foreground'
                  )}
                >
                  {msg.role === 'user' && !isStreaming && (
                    <button
                      onClick={() => {
                        setInput(msg.content);
                        setMessages(messages.slice(0, i));
                      }}
                      className="absolute -left-9 top-2 p-1.5 rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted bg-background/50 backdrop-blur"
                      title="Edit message"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                  )}
                  <div className="flex gap-3">
                    {msg.role === 'assistant' && <Bot className="w-4 h-4 mt-0.5 shrink-0" />}
                    <div
                      className={cn(
                        'text-sm max-w-none break-words',
                        msg.role === 'assistant' && 'prose dark:prose-invert'
                      )}
                    >
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap m-0">{msg.content}</p>
                      ) : (
                        <AssistantMessageProse
                          content={msg.content}
                          sources={msg.sources}
                          userMessages={precedingUserMessages}
                          accounts={accounts}
                          events={events}
                        />
                      )}
                    </div>
                  </div>

                  {msg.role === 'assistant' && (
                    <>
                      <StalenessPill
                        messageSnapshotId={msg.snapshotId || (msg as any).snapshot_id}
                        currentSnapshotId={currentSnapshotId}
                        onRefresh={handleRegenerate}
                        className="self-start mt-1"
                      />
                      <AssistantMessageFooter
                        content={msg.content}
                        sources={msg.sources}
                        userMessages={precedingUserMessages}
                        accounts={accounts}
                        events={events}
                        isLastAssistant={isLastAssistant}
                        isStreaming={isStreaming}
                        onRegenerate={handleRegenerate}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {isStreaming && messages[messages.length - 1]?.role !== 'tool' && (!messages[messages.length - 1]?.content) && (
            <div className="flex justify-start">
              <div className="bg-muted border border-border rounded-2xl px-4 py-3 text-sm flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-1" />
        </div>

        {!isAtBottom && (
          <div className="absolute bottom-[90px] left-0 right-0 flex justify-center pointer-events-none">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full shadow-md h-8 w-8 pointer-events-auto bg-background/80 backdrop-blur"
              onClick={() => scrollToBottom()}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        )}

        <ScenarioTray />
        <ContextGlanceRibbon overlay={false} className="border-x-0 border-b-0" />
        <div className="p-4 bg-background flex flex-col gap-3 shrink-0">
          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Context:</span>
              {uploadedFiles.map((f) => (
                <Badge
                  key={f.id}
                  variant="secondary"
                  className="pl-2 pr-1 py-1 flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                >
                  <FileText className="w-3 h-3" />
                  <span className="max-w-[120px] truncate" title={f.name}>
                    {f.name}
                  </span>
                  <button
                    onClick={() => removeUploadedFile(f.id)}
                    className="hover:bg-primary/20 p-0.5 rounded-full text-primary/70 hover:text-primary transition-colors"
                    title="Remove from context"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5 w-full">
            <form
              className="flex gap-2 items-end relative"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <Textarea
                id="chat-input-textarea"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = '60px';
                  const scrollHeight = e.target.scrollHeight;
                  e.target.style.height = Math.min(scrollHeight, 200) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="E.g. Can I afford a $400 car payment next month?"
                className="flex-1 min-h-[60px] max-h-[200px] resize-none bg-muted/50 focus-visible:ring-primary py-3 scrollbar-thin"
              />

              {isStreaming ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={handleStop}
                  className="shrink-0 h-10 w-10 rounded-full mb-1"
                >
                  <Square className="w-4 h-4 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!input.trim()}
                  size="icon"
                  className="shrink-0 h-10 w-10 rounded-full mb-1"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </Button>
              )}
            </form>
            <div className="flex flex-row items-center justify-between mt-1">
              <div className="flex flex-row items-center gap-3">
                {availableModels?.length > 0 && <ModelPopover />}
                {totalTokens > 0 && (
                  <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    {totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens}
                  </div>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground/60 text-center flex-1">
                Press <kbd className="font-sans border bg-muted/50 rounded px-1">Shift</kbd> +{' '}
                <kbd className="font-sans border bg-muted/50 rounded px-1">Enter</kbd> for new line
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      <ContextInspector open={isInspectorOpen} onOpenChange={setIsInspectorOpen} />
    </Card>
  );
};

export const ChatPanel: React.FC<ChatPanelProps> = (props) => {
  const existingContext = useChatOptional();
  if (!existingContext) {
    return (
      <ChatProvider>
        <ChatPanelInner {...props} />
      </ChatProvider>
    );
  }
  return <ChatPanelInner {...props} />;
};
