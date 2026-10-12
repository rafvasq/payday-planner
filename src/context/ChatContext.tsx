import React, { createContext, useContext, useState, useRef, useEffect, useMemo } from 'react';
import { api, AppConfig, ProviderModels } from '../lib/apiClient';
import { usePlannerStore } from '../store/usePlannerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { aggregateTransactions, categorizeAndCalculateVariance } from '../core/csvParser';
import { generateLedgerContext } from '../core/ledger';
import {
  executeTool,
  TOOL_DEFINITIONS,
  READ_TOOLS,
  AWAIT_USER_TOOLS,
  ToolExecution,
  FigureSource,
  ActualView,
  transactionsToAdjustments,
} from '../core/ai/toolkit';
import { PlannerWorld, ScenarioChange, toCents, snapshotId } from '../core/ai/world';
import { format } from 'date-fns';
import { useFloatingDimensions } from '../hooks/useFloatingDimensions';
import { toast } from '@/components/ui/sonner';

export const CHAT_STORAGE_KEY = 'payday_chat_history';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: any[];
  usage?: any;
  tool_call_id?: string;
  sources?: FigureSource[];
  tool_execution?: ToolExecution;
  snapshotId?: string;
  snapshot_id?: string;
}

export type ChatMode = 'tactical' | 'auditor';

export type ActualChoice = 'update_balances' | 'treat_as_landed' | 'already_in_balances';
export type RecordActualStatus = 'pending' | 'applied' | 'assumed' | 'acknowledged';

export interface ScenarioAssumption {
  id: string;
  label: string;
  changes: ScenarioChange[];
  enabled: boolean;
  createdAt?: number;
}

export interface ChatContextType {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: (v: string) => void;
  isStreaming: boolean;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  availableModels: ProviderModels[];
  appConfig: AppConfig | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  handleSend: (overridePrompt?: string) => Promise<void>;
  handleStop: () => void;
  handleRegenerate: () => Promise<void>;
  clearMessages: () => void;
  proposalStatuses: Record<string, 'pending' | 'applied' | 'rejected'>;
  setProposalStatus: (id: string, status: 'pending' | 'applied' | 'rejected') => void;
  floatingDims: import('../hooks/useFloatingDimensions').FloatingDimensionsState;
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;
  assumptions: ScenarioChange[];
  setAssumptions: React.Dispatch<React.SetStateAction<ScenarioChange[]>>;
  assumptionLabels: string[];
  setAssumptionLabels: React.Dispatch<React.SetStateAction<string[]>>;
  scenarioAssumptions: ScenarioAssumption[];
  setScenarioAssumptions: React.Dispatch<React.SetStateAction<ScenarioAssumption[]>>;
  recordStatuses: Record<string, RecordActualStatus>;
  setRecordStatus: (id: string, status: RecordActualStatus) => void;
  applyRecordActual: (choice: ActualChoice, actualView: ActualView, recordId?: string) => void;
  toggleAssumption: (id: string) => void;
  removeAssumption: (id: string) => void;
  addAssumption: (label: string, changes: ScenarioChange | ScenarioChange[]) => string;
  isInspectorOpen: boolean;
  setIsInspectorOpen: (open: boolean) => void;
  toggleInspector: () => void;
  getPlannerSnapshotId: () => string;
}

export function getPlannerSnapshotId(customWorld?: PlannerWorld, customAssumptions?: ScenarioChange[]): string {
  if (customWorld) {
    return snapshotId(customWorld, customAssumptions || []);
  }
  const storeState = typeof (usePlannerStore as any).getState === 'function' ? (usePlannerStore as any).getState() : {};
  const currentAccounts = storeState.accounts || [];
  const currentEvents = storeState.events || [];
  const currentExecuted = storeState.executedEvents || {};
  const currentReflectToday = !!storeState.startingBalancesReflectToday;
  const world: PlannerWorld = {
    accounts: currentAccounts,
    events: currentEvents,
    executedEvents: currentExecuted,
    balancesReflectToday: currentReflectToday,
    today: format(new Date(), 'yyyy-MM-dd'),
  };
  return snapshotId(world, customAssumptions || []);
}

const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export const useChatOptional = (): ChatContextType | null => {
  return useContext(ChatContext);
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    getBlueprintJson,
    accounts,
    events,
    executedEvents,
    startingBalancesReflectToday,
    parsedTransactions,
    analysisStartDate,
    analysisEndDate,
    applyBlueprintChangesWithSnapshot,
    restoreBlueprintSnapshot,
  } = usePlannerStore();

  const { chatModel, setChatModel } = useSettingsStore();

  const floatingDims = useFloatingDimensions(480, 640);
  const [chatMode, setChatMode] = useState<ChatMode>('tactical');

  const getStorageKey = (mode: ChatMode) => 
    mode === 'tactical' ? 'payday_chat_history' : 'payday_analysis_history';
  const getMetaStorageKey = (mode: ChatMode) => 
    mode === 'tactical' ? 'payday_chat_meta' : 'payday_analysis_meta';

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(getStorageKey('tactical'));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
        if (parsed?.messages && Array.isArray(parsed.messages)) return parsed.messages;
      }
    } catch (e) {}
    return [];
  });

  const [proposalStatuses, setProposalStatuses] = useState<Record<string, 'pending' | 'applied' | 'rejected'>>(() => {
    try {
      const meta = localStorage.getItem(getMetaStorageKey('tactical'));
      if (meta) {
        const parsed = JSON.parse(meta);
        if (parsed.proposalStatuses) return parsed.proposalStatuses;
      }
    } catch (e) {}
    return {};
  });

  const [recordStatuses, setRecordStatuses] = useState<Record<string, RecordActualStatus>>(() => {
    try {
      const meta = localStorage.getItem(getMetaStorageKey('tactical'));
      if (meta) {
        const parsed = JSON.parse(meta);
        if (parsed.recordStatuses) return parsed.recordStatuses;
      }
    } catch (e) {}
    return {};
  });

  const [scenarioAssumptions, setScenarioAssumptions] = useState<ScenarioAssumption[]>(() => {
    try {
      const meta = localStorage.getItem(getMetaStorageKey('tactical'));
      if (meta) {
        const parsed = JSON.parse(meta);
        if (parsed.scenarioAssumptions && Array.isArray(parsed.scenarioAssumptions)) {
          return parsed.scenarioAssumptions;
        }
      }
    } catch (e) {}
    return [];
  });

  const setProposalStatus = (id: string, status: 'pending' | 'applied' | 'rejected') => {
    setProposalStatuses((prev) => ({ ...prev, [id]: status }));
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.role === 'tool' && msg.tool_call_id === id) {
          try {
            const parsed = JSON.parse(msg.content || '{}');
            parsed.user_decision = status === 'applied' ? 'APPLIED_TO_PLAN' : status === 'rejected' ? 'REJECTED' : 'PENDING';
            return {
              ...msg,
              content: JSON.stringify(parsed),
            };
          } catch (e) {
            return msg;
          }
        }
        return msg;
      })
    );
  };

  const setRecordStatus = (id: string, status: RecordActualStatus) => {
    setRecordStatuses((prev) => ({ ...prev, [id]: status }));
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.role === 'tool' && msg.tool_call_id === id) {
          try {
            const parsed = JSON.parse(msg.content || '{}');
            parsed.user_decision = status;
            return {
              ...msg,
              content: JSON.stringify(parsed),
            };
          } catch (e) {
            return msg;
          }
        }
        return msg;
      })
    );
  };

  const assumptions = useMemo<ScenarioChange[]>(() => {
    return scenarioAssumptions
      .filter((a) => a.enabled)
      .flatMap((a) => a.changes);
  }, [scenarioAssumptions]);

  const assumptionLabels = useMemo<string[]>(() => {
    return scenarioAssumptions
      .filter((a) => a.enabled)
      .map((a) => a.label);
  }, [scenarioAssumptions]);

  const setAssumptions: React.Dispatch<React.SetStateAction<ScenarioChange[]>> = (action) => {
    setScenarioAssumptions((prev) => {
      const currentFlat = prev.flatMap((a) => a.changes);
      const nextChanges = typeof action === 'function' ? action(currentFlat) : action;
      return nextChanges.map((change, idx) => ({
        id: (change as any).id || `assumption-${idx}-${Date.now()}`,
        label: (change as any).label || (change as any).note || `Assumption ${idx + 1}`,
        changes: [change],
        enabled: true,
      }));
    });
  };

  const setAssumptionLabels: React.Dispatch<React.SetStateAction<string[]>> = (action) => {
    setScenarioAssumptions((prev) => {
      const currentLabels = prev.map((a) => a.label);
      const nextLabels = typeof action === 'function' ? action(currentLabels) : action;
      return prev.map((a, idx) => ({
        ...a,
        label: nextLabels[idx] || a.label,
      }));
    });
  };

  const toggleAssumption = (id: string) => {
    setScenarioAssumptions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  };

  const removeAssumption = (id: string) => {
    setScenarioAssumptions((prev) => prev.filter((a) => a.id !== id));
  };

  const addAssumption = (label: string, changes: ScenarioChange | ScenarioChange[]) => {
    const id = `assumption-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const changeList = Array.isArray(changes) ? changes : [changes];
    setScenarioAssumptions((prev) => [
      ...prev,
      { id, label, changes: changeList, enabled: true, createdAt: Date.now() },
    ]);
    return id;
  };

  const applyRecordActual = (choice: ActualChoice, actualView: ActualView, recordId?: string) => {
    const recId = recordId || `rec-${Date.now()}`;
    if (choice === 'update_balances') {
      try {
        const storeState =
          typeof (usePlannerStore as any).getState === 'function'
            ? (usePlannerStore as any).getState()
            : {};
        const currentAccounts = storeState.accounts || accounts || [];
        const currentEvents = storeState.events || events || [];
        const applyWithSnapshot =
          storeState.applyBlueprintChangesWithSnapshot || applyBlueprintChangesWithSnapshot;
        const restoreSnapshot =
          storeState.restoreBlueprintSnapshot || restoreBlueprintSnapshot;

        const newAccounts = currentAccounts.map((a: any) => {
          const preview = actualView.accounts?.find((acc) => acc.id === a.id);
          if (preview) {
            return { ...a, balance: preview.after_cents / 100 };
          }
          const delta =
            actualView.adjustments
              ?.filter((adj) => adj.account_id === a.id)
              .reduce((sum, adj) => sum + adj.delta_cents, 0) || 0;
          if (delta !== 0) {
            return { ...a, balance: (toCents(a.balance) + delta) / 100 };
          }
          return a;
        });

        const snapshot = applyWithSnapshot(
          newAccounts,
          currentEvents,
          {},
          `Record actual: ${actualView.description}`
        );

        setRecordStatus(recId, 'applied');

        toast.success(`Updated balances for "${actualView.description}"`, {
          duration: 10000,
          action: {
            label: 'Undo',
            onClick: () => {
              restoreSnapshot(snapshot);
              setRecordStatus(recId, 'pending');
              toast.info('Balance update undone', { duration: 3000 });
            },
          },
        });
      } catch (err: any) {
        console.error('Failed to update balances from record_actual:', err);
        toast.error('Failed to update balances');
      }
    } else if (choice === 'treat_as_landed') {
      const storeState =
        typeof (usePlannerStore as any).getState === 'function'
          ? (usePlannerStore as any).getState()
          : {};
      const currentAccounts = storeState.accounts || accounts || [];
      const adjustments =
        actualView.adjustments && actualView.adjustments.length > 0
          ? actualView.adjustments
          : transactionsToAdjustments(actualView.transactions || [], currentAccounts, 'Assumed landed');

      const label = `Assumed landed: ${actualView.transaction_descriptions?.[0] || actualView.description}`;
      const assumptionId = `assumption-${recId}`;

      setScenarioAssumptions((prev) => [
        ...prev.filter((a) => a.id !== assumptionId),
        {
          id: assumptionId,
          label,
          changes: adjustments,
          enabled: true,
          createdAt: Date.now(),
        },
      ]);
      setRecordStatus(recId, 'assumed');
    } else if (choice === 'already_in_balances') {
      setRecordStatus(recId, 'acknowledged');
    }
  };

  // Switch history when mode changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(getStorageKey(chatMode));
      if (saved) {
        const parsed = JSON.parse(saved);
        setMessages(Array.isArray(parsed) ? parsed : parsed?.messages || []);
      } else {
        setMessages([]);
      }
      const meta = localStorage.getItem(getMetaStorageKey(chatMode));
      if (meta) {
        const parsed = JSON.parse(meta);
        setProposalStatuses(parsed.proposalStatuses || {});
        setRecordStatuses(parsed.recordStatuses || {});
        setScenarioAssumptions(parsed.scenarioAssumptions || []);
      } else {
        setProposalStatuses({});
        setRecordStatuses({});
        setScenarioAssumptions([]);
      }
    } catch (e) {
      setMessages([]);
      setProposalStatuses({});
      setRecordStatuses({});
      setScenarioAssumptions([]);
    }
  }, [chatMode]);

  useEffect(() => {
    try {
      localStorage.setItem(getStorageKey(chatMode), JSON.stringify(messages));
      localStorage.setItem(
        getMetaStorageKey(chatMode),
        JSON.stringify({
          proposalStatuses,
          recordStatuses,
          scenarioAssumptions,
        })
      );
    } catch (e) {}
  }, [messages, proposalStatuses, recordStatuses, scenarioAssumptions, chatMode]);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const toggleOpen = () => setIsOpen((prev) => !prev);

  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const toggleInspector = () => setIsInspectorOpen((prev) => !prev);

  const getSnapshotId = () => {
    const storeState = typeof (usePlannerStore as any).getState === 'function' ? (usePlannerStore as any).getState() : {};
    const currentAccounts = storeState.accounts || accounts || [];
    const currentEvents = storeState.events || events || [];
    const currentExecuted = storeState.executedEvents || executedEvents || {};
    const currentReflectToday =
      storeState.startingBalancesReflectToday !== undefined
        ? storeState.startingBalancesReflectToday
        : !!startingBalancesReflectToday;
    const world: PlannerWorld = {
      accounts: currentAccounts,
      events: currentEvents,
      executedEvents: currentExecuted,
      balancesReflectToday: currentReflectToday,
      today: format(new Date(), 'yyyy-MM-dd'),
    };
    return snapshotId(world, assumptions);
  };

  const abortControllerRef = useRef<AbortController | null>(null);

  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [availableModels, setAvailableModels] = useState<ProviderModels[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(chatModel || '');

  // Keep local selectedModel in sync with settings
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
  }, []);

  const handleStop = () => {
    if (!isStreaming) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages((prev) => {
      const newMsgs = [...prev];
      const last = newMsgs[newMsgs.length - 1];
      if (last && last.role === 'assistant' && last.content) {
        newMsgs[newMsgs.length - 1] = { ...last, content: last.content + '\n\n*(stopped)*' };
      }
      return newMsgs;
    });
    setIsStreaming(false);
  };

  // Cleanup active stream on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Escape key to stop streaming
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isStreaming) {
        handleStop();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming]);

  const clearMessages = () => {
    setMessages([]);
    setScenarioAssumptions([]);
    setProposalStatuses({});
    setRecordStatuses({});
    try {
      localStorage.removeItem(getStorageKey(chatMode));
      localStorage.removeItem(getMetaStorageKey(chatMode));
    } catch (e) {}
  };

  const executeChatTurn = async (chatHistory: ChatMessage[]) => {
    setMessages(chatHistory);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const blueprintStr = getBlueprintJson({ minified: true, compactIds: true });
      const blueprint = JSON.parse(blueprintStr);

      const start = analysisStartDate ? new Date(analysisStartDate + 'T00:00:00') : undefined;
      const end = analysisEndDate ? new Date(analysisEndDate + 'T23:59:59') : undefined;
      
      let summary = undefined;
      if (parsedTransactions.length > 0) {
        if (chatMode === 'auditor') {
          summary = JSON.stringify(categorizeAndCalculateVariance(parsedTransactions, events, start, end), null, 2);
        } else {
          summary = aggregateTransactions(parsedTransactions, start, end).markdown;
        }
      }

      const runTurn = async (currentMessages: ChatMessage[], depth = 0) => {
        if (depth >= 5) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `[Error: Max tool calls exceeded]` },
          ]);
          return;
        }

        const storeState = typeof (usePlannerStore as any).getState === 'function' ? (usePlannerStore as any).getState() : {};
        const currentAccounts = storeState.accounts || accounts || [];
        const currentEvents = storeState.events || events || [];
        const currentExecuted = storeState.executedEvents || executedEvents || {};
        const currentReflectToday =
          storeState.startingBalancesReflectToday !== undefined
            ? storeState.startingBalancesReflectToday
            : !!startingBalancesReflectToday;

        const world: PlannerWorld = {
          accounts: currentAccounts,
          events: currentEvents,
          executedEvents: currentExecuted,
          balancesReflectToday: currentReflectToday,
          today: format(new Date(), 'yyyy-MM-dd'),
        };
        const currentSnapshotId = snapshotId(world, assumptions);

        const ledgerContext = generateLedgerContext(currentAccounts, currentEvents, 30, {
          executedEvents: currentExecuted,
          skipTodayEvents: currentReflectToday,
        });
        const liveBlueprint = {
          ...blueprint,
          executed_events: currentExecuted,
        };
        const stream = api.chatStream(
          currentMessages,
          liveBlueprint,
          ledgerContext,
          summary,
          selectedModel || undefined,
          chatMode,
          abortController.signal,
          TOOL_DEFINITIONS
        );

        const rawPrior = currentMessages.flatMap((m) => m.sources || []);
        const priorSources: FigureSource[] = Array.from(
          new Map(rawPrior.map((s) => [`${s.cents}:${s.label}`, s])).values()
        );
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '',
            sources: priorSources,
            snapshotId: currentSnapshotId,
            snapshot_id: currentSnapshotId,
          },
        ]);

        const toolCalls: any[] = [];
        let assistantContent = '';

        for await (const chunk of stream) {
          if (chunk && typeof chunk === 'object' && chunk.type === 'usage') {
            setMessages((prev) => {
              const newMsgs = [...prev];
              const last = { ...newMsgs[newMsgs.length - 1] };
              last.usage = chunk;
              newMsgs[newMsgs.length - 1] = last;
              return newMsgs;
            });
            continue;
          }

          if (typeof chunk === 'string') {
            assistantContent += chunk;
            setMessages((prev) => {
              const newMsgs = [...prev];
              const last = { ...newMsgs[newMsgs.length - 1] };
              last.content = assistantContent;
              last.sources = priorSources;
              last.snapshotId = currentSnapshotId;
              last.snapshot_id = currentSnapshotId;
              newMsgs[newMsgs.length - 1] = last;
              return newMsgs;
            });
          } else if (chunk && typeof chunk === 'object' && chunk.type === 'tool_call') {
            if (chunk.tool_call) {
              toolCalls.push(chunk.tool_call);
            }
          }
        }

        if (toolCalls.length > 0) {
          const toolMessages: ChatMessage[] = [];
          let allExecutionSources: FigureSource[] = [];
          let hasAwaitUserTool = false;
          let allCanContinue = true;

          for (const tc of toolCalls) {
            if (!tc?.function?.name) continue;

            const execution: ToolExecution = executeTool(
              tc.function.name,
              tc.function.arguments || '{}',
              {
                world,
                assumptions,
                assumptionLabels,
              }
            );

            allExecutionSources = [...allExecutionSources, ...execution.sources];

            const toolResultStr = JSON.stringify(execution.result);
            const toolMsg: ChatMessage = {
              role: 'tool',
              name: tc.function.name,
              content: toolResultStr,
              tool_call_id: tc.id,
              sources: execution.sources,
              tool_execution: execution,
            };
            toolMessages.push(toolMsg);

            if (AWAIT_USER_TOOLS.has(tc.function.name)) {
              hasAwaitUserTool = true;
            }
            const canContinueThis =
              (READ_TOOLS.has(tc.function.name) || tc.function.name === 'simulate') &&
              !AWAIT_USER_TOOLS.has(tc.function.name);
            if (!canContinueThis) {
              allCanContinue = false;
            }
          }

          const combinedSources = [...priorSources, ...allExecutionSources];
          const deduplicatedSources = Array.from(
            new Map(combinedSources.map((s) => [`${s.cents}:${s.label}`, s])).values()
          );

          const nextMessages: ChatMessage[] = [
            ...currentMessages,
            {
              role: 'assistant',
              content: assistantContent || '',
              tool_calls: toolCalls,
              usage: currentMessages.length < messages.length ? messages[messages.length - 1].usage : undefined,
              sources: deduplicatedSources,
              snapshotId: currentSnapshotId,
              snapshot_id: currentSnapshotId,
            },
            ...toolMessages,
          ];

          setMessages(nextMessages);

          const shouldContinue = !hasAwaitUserTool && allCanContinue && toolMessages.length > 0;

          if (shouldContinue && !abortController.signal.aborted) {
            await runTurn(nextMessages, depth + 1);
          }
        }
      };

      await runTurn(chatHistory);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleSend = async (overridePrompt?: string) => {
    const textToSubmit = overridePrompt || input;
    if (!textToSubmit.trim() || isStreaming) return;

    const userMsg = textToSubmit.trim();
    if (!overridePrompt) setInput('');
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }];
    await executeChatTurn(nextMessages);
  };

  const handleRegenerate = async () => {
    if (isStreaming) return;
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) return;
    const truncated = messages.slice(0, lastUserIndex + 1);
    await executeChatTurn(truncated);
  };

  const value: ChatContextType = {
    messages,
    setMessages,
    input,
    setInput,
    isStreaming,
    selectedModel,
    setSelectedModel,
    availableModels,
    appConfig,
    isOpen,
    setIsOpen,
    toggleOpen,
    handleSend,
    handleStop,
    handleRegenerate,
    clearMessages,
    proposalStatuses,
    setProposalStatus,
    floatingDims,
    chatMode,
    setChatMode,
    assumptions,
    setAssumptions,
    assumptionLabels,
    setAssumptionLabels,
    scenarioAssumptions,
    setScenarioAssumptions,
    recordStatuses,
    setRecordStatus,
    applyRecordActual,
    toggleAssumption,
    removeAssumption,
    addAssumption,
    isInspectorOpen,
    setIsInspectorOpen,
    toggleInspector,
    getPlannerSnapshotId: getSnapshotId,
  };

  useEffect(() => {
    (window as any)._paydayChatContext = value;
    return () => {
      (window as any)._paydayChatContext = undefined;
    };
  }, [value]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
