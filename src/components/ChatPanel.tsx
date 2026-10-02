import React, { useState, useRef, useEffect, useMemo } from 'react';
import { api, AppConfig, ProviderModels, logToServer } from '../lib/apiClient';
import { usePlannerStore } from '../store/usePlannerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { Send, Bot, Loader2, Cpu, X, FileText, AlertTriangle, Trash2, Square, ArrowDown, Coins } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { aggregateTransactions } from '../core/csvParser';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { generateLedgerContext } from '../core/ledger';
import { getKnownCents, findUnmatchedFigures } from '../core/verification';
import { SimulateToolSchema, ProposeToolSchema, getValidatedToolSchema, generateSimulationDiff, applyChangesToBlueprint } from '../core/tools';
import { format } from 'date-fns';

const CHAT_STORAGE_KEY = 'payday_chat_history';

const formatCurrency = (val: number) => 
  val.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });

export const ChatPanel: React.FC = () => {
  const { 
    getBlueprintJson,
    applyBlueprintChanges,
    accounts,
    events,
    uploadedFiles, 
    removeUploadedFile, 
    parsedTransactions,
    analysisStartDate,
    analysisEndDate 
  } = usePlannerStore();
  
  const { chatModel, setChatModel, showTokenUsage, setShowTokenUsage } = useSettingsStore();

  const [messages, setMessages] = useState<{ role: 'user' | 'assistant' | 'tool', content: string, name?: string, tool_calls?: any[], usage?: any }[]>(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });
  
  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [availableModels, setAvailableModels] = useState<ProviderModels[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(chatModel || '');

  // Keep local selectedModel in sync with settings, or update settings when it changes
  useEffect(() => {
    if (selectedModel && selectedModel !== chatModel) {
      if (setChatModel) setChatModel(selectedModel);
    }
  }, [selectedModel, chatModel, setChatModel]);

  useEffect(() => {
    Promise.all([api.getProvider(), api.getModels()])
      .then(([config, models]) => {
        setAppConfig(config);
        setAvailableModels(models);
        if (!chatModel && config.analysis_model) {
          setSelectedModel(config.analysis_model);
        }
      })
      .catch(console.error);
  }, [chatModel]);

  // Smart scroll intersection observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting);
      },
      { root: scrollRef.current, threshold: 0.1 }
    );
    if (messagesEndRef.current) {
      observer.observe(messagesEndRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Auto-scroll only if at bottom
  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, isStreaming, isAtBottom]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };


  const handleSend = async (overridePrompt?: string) => {
    const textToSubmit = overridePrompt || input;
    if (!textToSubmit.trim() || isStreaming) return;
    
    const userMsg = textToSubmit.trim();
    if (!overridePrompt) setInput('');
    const initialMessages = [...messages, { role: 'user', content: userMsg }] as {role: 'user' | 'assistant' | 'tool', content: string, name?: string}[];
    setMessages(initialMessages as any);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const blueprintStr = getBlueprintJson({ minified: true, compactIds: true });
      const blueprint = JSON.parse(blueprintStr);
      
      const start = analysisStartDate ? new Date(analysisStartDate + 'T00:00:00') : undefined;
      const end = analysisEndDate ? new Date(analysisEndDate + 'T23:59:59') : undefined;
      const summary = parsedTransactions.length > 0 ? aggregateTransactions(parsedTransactions, start, end).markdown : undefined;

      const runTurn = async (currentMessages: any[], depth = 0) => {
        if (depth >= 5) {
          setMessages(prev => [...prev, { role: 'assistant', content: `[Error: Max tool calls exceeded]` }] as any);
          return;
        }
        
        const ledgerContext = generateLedgerContext(accounts, events, 30);
        // Expecting api.chatStream to accept signal as 6th parameter (or in options)
        const stream = api.chatStream(currentMessages, blueprint, ledgerContext, summary, selectedModel || undefined, abortController.signal);
        
        // We append an empty assistant message to stream into.
        setMessages(prev => [...prev, { role: 'assistant', content: '' }] as any);
        
        let toolCall: any = null;
        let assistantContent = '';
        let contentGenerated = false;

        for await (const chunk of stream) {
          // If we receive a usage chunk (Phase 3 feature), attach it to the current message
          if (chunk && typeof chunk === 'object' && chunk.type === 'usage') {
             setMessages(prev => {
                const newMsgs = [...prev];
                const last = { ...newMsgs[newMsgs.length - 1] };
                last.usage = chunk; // Attach usage data
                newMsgs[newMsgs.length - 1] = last;
                return newMsgs;
             });
             continue;
          }

          if (typeof chunk === 'string') {
            contentGenerated = true;
            assistantContent += chunk;
            setMessages(prev => {
              const newMsgs = [...prev];
              const last = { ...newMsgs[newMsgs.length - 1] };
              last.content = assistantContent;
              newMsgs[newMsgs.length - 1] = last;
              return newMsgs;
            });
          } else if (chunk && typeof chunk === 'object' && chunk.type === 'tool_call') {
            toolCall = chunk.tool_call;
          }
        }

        if (assistantContent) {
          const currentExempt = currentMessages.filter(m => m.role === 'user' || m.role === 'tool').map(m => m.content);
          const currentKnown = getKnownCents(accounts, events, currentExempt, 30);
          const unmatched = findUnmatchedFigures(assistantContent, currentKnown);
          if (unmatched.length > 0) {
            logToServer('warn', `not found in engine output: ${unmatched.join(', ')}`);
          }
        }

        if (toolCall) {
            // handle tool call execution
            const argsStr = toolCall.function.arguments || '{}';
            let parsedArgs: any = {};
            let toolResultStr = '';
            
            try {
              parsedArgs = JSON.parse(argsStr);
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              const schema = getValidatedToolSchema(accounts, events, todayStr);
              
              if (toolCall.function.name === 'simulate') {
                 const valid = schema.parse(parsedArgs);
                 const diff = generateSimulationDiff(accounts, events, valid.changes, 30);
                 toolResultStr = JSON.stringify(diff);
              } else if (toolCall.function.name === 'propose_blueprint_changes') {
                 const valid = schema.parse(parsedArgs);
                 const diff = generateSimulationDiff(accounts, events, valid.changes, 30);
                 toolResultStr = JSON.stringify({ status: "success", diff, message: "Proposal sent to user UI.", changes: valid.changes });
              } else {
                 toolResultStr = JSON.stringify({ error: `Unknown tool ${toolCall.function.name}` });
              }
            } catch (err: any) {
              toolResultStr = JSON.stringify({ error: `Validation error: ${err.message}` });
            }

            // Record the assistant's action containing the tool_call
            const nextMessages = [...currentMessages, {
                role: 'assistant',
                content: assistantContent || null,
                tool_calls: [toolCall]
            }];

            // Append the tool response
            const toolMsg = { 
                role: 'tool', 
                name: toolCall.function.name, 
                content: toolResultStr,
                tool_call_id: toolCall.id
            };
            nextMessages.push(toolMsg);
            
            setMessages(nextMessages as any);

            // If it's a scratchpad simulation, run next turn immediately!
            if (toolCall.function.name === 'simulate' && !abortController.signal.aborted) {
                await runTurn(nextMessages, depth + 1);
            }
        }
      };

      await runTurn(initialMessages);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User aborted, do nothing special, maybe append (stopped) text?
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `[Error: ${err.message}]` }] as any);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const exemptMessagesText = useMemo(() => messages.filter(m => m.role === 'user' || m.role === 'tool').map(m => m.content), [messages]);
  const knownCents = useMemo(() => getKnownCents(accounts, events, exemptMessagesText, 30), [accounts, events, exemptMessagesText]);

  return (
    <Card className="flex flex-col h-full w-full mx-auto shadow-md border-0 sm:border rounded-none sm:rounded-xl">
      <CardHeader className="border-b border-border py-4 bg-muted/20 flex flex-row items-center justify-between shrink-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" /> AI Financial Assistant
            {uploadedFiles.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200">
                CSV Data Loaded
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Ask questions about your budget. The AI has real-time read access to your entire blueprint and any recently parsed spending data.
          </CardDescription>
        </div>
        
        <div className="flex items-center gap-2">
          {setShowTokenUsage && (
            <Button variant={showTokenUsage ? "secondary" : "ghost"} size="sm" onClick={() => setShowTokenUsage(!showTokenUsage)} className={cn("h-8 px-2", showTokenUsage && "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200")} title="Toggle Token Usage">
              <Coins className="w-4 h-4" />
            </Button>
          )}
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setMessages([])} className="h-8 text-xs px-2" title="Clear Chat">
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          )}
          {availableModels.length > 0 && (
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-muted-foreground" />
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="flex h-8 w-40 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {availableModels.map(provider => (
                <optgroup key={provider.provider_type} label={provider.provider_name}>
                  {provider.models.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0 flex flex-col relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-70 space-y-4">
              <Bot className="w-12 h-12 mb-2 opacity-50" />
              <div className="text-center">
                <p className="text-sm font-medium">Hello! I'm your local AI planner.</p>
                <p className="text-xs mt-1">Ask me how much you can spend, or how a new bill affects you.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-lg">
                <Button variant="outline" size="sm" className="text-xs bg-background/50 hover:bg-muted" onClick={() => handleSend("What are my upcoming moves this week?")}>
                  Moves this week?
                </Button>
                <Button variant="outline" size="sm" className="text-xs bg-background/50 hover:bg-muted" onClick={() => handleSend("Simulate the next 30 days and tell me if I breach my target floor.")}>
                  Simulate next 30 days
                </Button>
                <Button variant="outline" size="sm" className="text-xs bg-background/50 hover:bg-muted" onClick={() => handleSend("Can I afford a $200 unexpected expense today?")}>
                  Can I afford $200 today?
                </Button>
                <Button variant="outline" size="sm" className="text-xs bg-background/50 hover:bg-muted" onClick={() => handleSend("Propose changes to push my bills back so I have more cash now.")}>
                  Delay bills
                </Button>
              </div>
            </div>
          )}
          
          {messages.map((msg, i) => {
            let unmatched: string[] = [];
            if (msg.role === 'assistant' && msg.content && !isStreaming) {
              unmatched = findUnmatchedFigures(msg.content, knownCents);
            }
            if (msg.role === 'tool') {
              let parsed: any;
              try { parsed = JSON.parse(msg.content); } catch (e) { parsed = { error: msg.content }; }
              
              const toolCallMsg = messages.find(m => m.tool_calls && m.tool_calls.some((tc: any) => tc.id === (msg as any).tool_call_id));
              const toolCall = toolCallMsg?.tool_calls?.find((tc: any) => tc.id === (msg as any).tool_call_id);
              let changes: any[] = [];
              if (toolCall) {
                try { changes = JSON.parse(toolCall.function.arguments).changes || []; } catch(e) {}
              }

              return (
                <div key={i} className="flex w-full justify-start my-2">
                  <div className="bg-muted/50 border border-border/50 rounded-lg px-4 py-3 text-xs w-full max-w-[80%]">
                    <div className="flex items-center gap-2 text-muted-foreground font-semibold mb-2">
                      <Cpu className="w-3.5 h-3.5" /> 
                      {msg.name === 'simulate' ? 'Simulation (Scratchpad)' : 'Proposed Changes'}
                    </div>
                    {parsed.error ? (
                      <div className="text-red-500">{parsed.error}</div>
                    ) : (
                      <div className="space-y-3">
                        {changes.length > 0 && (
                          <div className="space-y-1 border-b border-border/50 pb-2 mb-2">
                            <div className="font-semibold text-muted-foreground mb-1">Actions:</div>
                            {changes.map((c, idx) => (
                              <div key={idx} className="flex gap-2">
                                <span>⚙️</span>
                                <span>
                                  {c.type === 'skip_event' && `Skip event ${c.event_id} on ${c.date}`}
                                  {c.type === 'pause_event' && `Pause event ${c.event_id} from ${c.from_date} to ${c.to_date}`}
                                  {c.type === 'move_event' && `Move event ${c.event_id} from ${c.from_date} to ${c.to_date}`}
                                  {c.type === 'set_amount' && `Set amount for ${c.event_id} to ${formatCurrency(c.amount_cents / 100)}`}
                                  {c.type === 'pay_debt' && `Pay ${formatCurrency(c.amount_cents / 100)} from ${c.from_account_id} to ${c.card_id}`}
                                  {c.type === 'add_one_time' && `Add one-time ${formatCurrency(c.amount_cents / 100)} from ${c.from_account_id} on ${c.date}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="space-y-2">
                          {parsed.diff && Object.keys(parsed.diff.affected_accounts).length > 0 && <div className="font-semibold text-muted-foreground">Impact:</div>}
                          {parsed.diff && Object.keys(parsed.diff.affected_accounts).map(accId => {
                             const acc = parsed.diff.affected_accounts[accId];
                             return (
                               <div key={accId} className="bg-background rounded px-3 py-2 border border-border">
                                 <div className="font-semibold">{acc.name}</div>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                                   <div>Lowest: {typeof acc.lowest_balance_before === 'number' ? formatCurrency(acc.lowest_balance_before) : acc.lowest_balance_before} ➔ {typeof acc.lowest_balance_after === 'number' ? formatCurrency(acc.lowest_balance_after) : acc.lowest_balance_after}</div>
                                   <div>Breach: {acc.first_breach_before} ➔ {acc.first_breach_after}</div>
                                 </div>
                               </div>
                             );
                          })}
                        </div>
                        {msg.name === 'propose_blueprint_changes' && (
                          <Button size="sm" className="w-full mt-2" onClick={() => {
                            try {
                              const { newAccounts, newEvents, executedEventsOverrides } = applyChangesToBlueprint(accounts, events, changes);
                              applyBlueprintChanges(newAccounts, newEvents, executedEventsOverrides);
                            } catch (e) {
                              console.error(e);
                              alert("Failed to apply changes");
                            }
                          }}>Apply to Plan</Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            if (!msg.content && msg.role === 'assistant') return null;
            return (
            <div key={i} className={cn("flex w-full", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm flex gap-3 flex-col",
                msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-muted border border-border text-foreground"
              )}>
                <div className="flex gap-3">
                  {msg.role === 'assistant' && <Bot className="w-4 h-4 mt-0.5 shrink-0" />}
                  <div className={cn("text-sm max-w-none break-words", msg.role === 'assistant' && "prose dark:prose-invert")}>
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap m-0">{msg.content}</p>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    )}
                  </div>
                </div>
                {msg.role === 'assistant' && unmatched.length > 0 && (
                  <div className="mt-2 text-xs text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-2 py-1.5 rounded-md flex items-center gap-2 border border-orange-200">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>not found in engine output: {unmatched.join(', ')}</span>
                  </div>
                )}
                {/* Render token usage if present */}
                {showTokenUsage && (msg as any).usage && (
                  <div className="mt-1 text-[10px] text-muted-foreground/70 flex items-center gap-1 border-t border-border/50 pt-2">
                    ⓘ {(msg as any).usage.prompt_tokens} → {(msg as any).usage.completion_tokens} tokens
                    {((msg as any).usage.estimated_cost_usd) && ` │ ~$${(msg as any).usage.estimated_cost_usd}`}
                  </div>
                )}
              </div>
            </div>
            );
          })}
          {isStreaming && (
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
              onClick={scrollToBottom}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="p-4 border-t border-border bg-background flex flex-col gap-3 shrink-0">
          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Context:</span>
              {uploadedFiles.map(f => (
                <Badge key={f.id} variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border-primary/20">
                  <FileText className="w-3 h-3" />
                  <span className="max-w-[120px] truncate" title={f.name}>{f.name}</span>
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
          <form 
            className="flex gap-2 items-end relative"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            <Textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="E.g. Can I afford a $400 car payment next month?"
              className="flex-1 min-h-[60px] max-h-[200px] resize-none bg-muted/50 focus-visible:ring-primary py-3 scrollbar-thin"
              rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 5) : 1}
            />
            
            {isStreaming ? (
              <Button type="button" variant="destructive" size="icon" onClick={handleStop} className="shrink-0 h-10 w-10 rounded-full mb-1">
                <Square className="w-4 h-4 fill-current" />
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim()} size="icon" className="shrink-0 h-10 w-10 rounded-full mb-1">
                <Send className="w-4 h-4 ml-0.5" />
              </Button>
            )}
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
