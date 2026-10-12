// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatProvider, useChat } from '../../context/ChatContext';
import { api } from '../../lib/apiClient';
import { format, addDays } from 'date-fns';

vi.mock('../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'test', analysis_model: 'test-model' }),
    getModels: vi.fn().mockResolvedValue([{ provider: 'test', models: [{ id: 'test-model', name: 'Test Model' }] }]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

const mockStore = {
  accounts: [
    { id: 'acc_hub', name: 'EQ Hub', type: 'checking', balance: 5000, target_floor: 1000 },
    { id: 'acc_vault', name: 'Vault', type: 'savings', balance: 10000, target_floor: 5000 },
  ],
  events: [
    {
      id: 'ev_sweep',
      name: 'Vault Sweep',
      amount: 500,
      from_account_id: 'acc_hub',
      to_account_id: 'acc_vault',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      interval_count: 1,
      interval_unit: 'month',
    },
  ],
  executedEvents: {},
  startingBalancesReflectToday: true,
  parsedTransactions: [],
  analysisStartDate: null,
  analysisEndDate: null,
  getBlueprintJson: vi.fn().mockReturnValue(JSON.stringify({
    accounts: [{ id: 'acc_hub', name: 'EQ Hub', balance: 5000 }],
    events: [],
  })),
  applyBlueprintChanges: vi.fn(),
};

vi.mock('../../store/usePlannerStore', () => ({
  usePlannerStore: Object.assign(
    vi.fn(() => mockStore),
    { getState: vi.fn(() => mockStore) }
  ),
}));

vi.mock('../../store/useSettingsStore', () => ({
  useSettingsStore: vi.fn().mockReturnValue({
    chatModel: 'test-model',
    setChatModel: vi.fn(),
  }),
}));

// Test harness component to expose useChat functions and state
const TestConsumer: React.FC = () => {
  const { messages, handleSend, handleStop, isStreaming } = useChat();

  return (
    <div>
      <div data-testid="stream-status">{isStreaming ? 'streaming' : 'idle'}</div>
      <div data-testid="msg-count">{messages.length}</div>
      <button data-testid="send-btn" onClick={() => handleSend('Test prompt')}>
        Send
      </button>
      <button data-testid="stop-btn" onClick={handleStop}>
        Stop
      </button>
      <div data-testid="messages">
        {messages.map((m, i) => (
          <div key={i} data-testid={`msg-${i}`} data-role={m.role} data-name={m.name || ''}>
            <span className="content">{m.content}</span>
            <span className="sources-count">{m.sources ? m.sources.length : 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

describe('Milestone 1 Adversarial Tool Loop Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.chatStream as any).mockReset();
    localStorage.clear();
  });

  it('1. READ_TOOLS (get_snapshot) triggers continuation and carries sources', async () => {
    const snapshotStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'call_snap',
          function: { name: 'get_snapshot', arguments: '{}' },
        },
      };
    };

    const followUpStream = async function* () {
      yield 'Here is your snapshot: Hub balance is $5,000.00.';
    };

    (api.chatStream as any)
      .mockReturnValueOnce(snapshotStream())
      .mockReturnValueOnce(followUpStream());

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-status').textContent).toBe('idle');
    });

    // Verify continuation: api.chatStream called 2 times
    expect(api.chatStream).toHaveBeenCalledTimes(2);

    // Verify message structure:
    // [0] user
    // [1] assistant (tool_call)
    // [2] tool (result)
    // [3] assistant (final text)
    expect(screen.getByTestId('msg-count').textContent).toBe('4');
    expect(screen.getByTestId('msg-0').getAttribute('data-role')).toBe('user');
    expect(screen.getByTestId('msg-1').getAttribute('data-role')).toBe('assistant');
    expect(screen.getByTestId('msg-2').getAttribute('data-role')).toBe('tool');
    expect(screen.getByTestId('msg-3').getAttribute('data-role')).toBe('assistant');
    expect(screen.getByTestId('msg-3').textContent).toContain('Here is your snapshot');

    // Verify sources exist on assistant and tool messages
    const toolMsgSources = screen.getByTestId('msg-2').querySelector('.sources-count')?.textContent;
    const finalAssistantSources = screen.getByTestId('msg-3').querySelector('.sources-count')?.textContent;
    expect(Number(toolMsgSources)).toBeGreaterThan(0);
    expect(Number(finalAssistantSources)).toBeGreaterThan(0);
  });

  it('2. READ_TOOLS (get_schedule) triggers continuation', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const scheduleStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'call_sched',
          function: {
            name: 'get_schedule',
            arguments: JSON.stringify({ from_date: today, to_date: format(addDays(new Date(), 7), 'yyyy-MM-dd') }),
          },
        },
      };
    };

    const followUpStream = async function* () {
      yield 'Upcoming moves schedule completed.';
    };

    (api.chatStream as any)
      .mockReturnValueOnce(scheduleStream())
      .mockReturnValueOnce(followUpStream());

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-status').textContent).toBe('idle');
    });

    expect(api.chatStream).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('msg-count').textContent).toBe('4');
  });

  it('3. simulate triggers continuation', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const simulateStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'call_sim',
          function: {
            name: 'simulate',
            arguments: JSON.stringify({
              label: 'Skip sweep',
              changes: [{ type: 'skip_event', event_id: 'ev_sweep', date: today }],
            }),
          },
        },
      };
    };

    const followUpStream = async function* () {
      yield 'Simulated skipping the sweep.';
    };

    (api.chatStream as any)
      .mockReturnValueOnce(simulateStream())
      .mockReturnValueOnce(followUpStream());

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-status').textContent).toBe('idle');
    });

    expect(api.chatStream).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('msg-count').textContent).toBe('4');
  });

  it('4. AWAIT_USER_TOOLS (propose_blueprint_changes) halts turn immediately', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const proposeStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'call_prop',
          function: {
            name: 'propose_blueprint_changes',
            arguments: JSON.stringify({
              label: 'Propose skip',
              changes: [{ type: 'skip_event', event_id: 'ev_sweep', date: today }],
            }),
          },
        },
      };
    };

    (api.chatStream as any).mockReturnValueOnce(proposeStream());

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-status').textContent).toBe('idle');
    });

    // CRITICAL: MUST HALT. Should NOT call api.chatStream a 2nd time!
    expect(api.chatStream).toHaveBeenCalledTimes(1);

    // Messages: [0] user, [1] assistant (tool_call), [2] tool (result awaiting user review)
    expect(screen.getByTestId('msg-count').textContent).toBe('3');
    expect(screen.getByTestId('msg-2').getAttribute('data-name')).toBe('propose_blueprint_changes');
  });

  it('5. AWAIT_USER_TOOLS (record_actual) halts turn immediately', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const recordActualStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'call_act',
          function: {
            name: 'record_actual',
            arguments: JSON.stringify({
              description: 'Groceries paid',
              transactions: [
                {
                  from_account_id: 'acc_hub',
                  amount_cents: 12500,
                  date: today,
                },
              ],
            }),
          },
        },
      };
    };

    (api.chatStream as any).mockReturnValueOnce(recordActualStream());

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-status').textContent).toBe('idle');
    });

    // CRITICAL: MUST HALT. Should NOT call api.chatStream a 2nd time!
    expect(api.chatStream).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('msg-count').textContent).toBe('3');
    expect(screen.getByTestId('msg-2').getAttribute('data-name')).toBe('record_actual');
  });

  it('6. Sources accumulation across chained tool turns & duplicate verification', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    // Turn 1: get_snapshot
    const snapStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'c1',
          function: { name: 'get_snapshot', arguments: '{}' },
        },
      };
    };
    // Turn 2: simulate
    const simStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'c2',
          function: {
            name: 'simulate',
            arguments: JSON.stringify({
              label: 'Test sim',
              changes: [{ type: 'skip_event', event_id: 'ev_sweep', date: today }],
            }),
          },
        },
      };
    };
    // Turn 3: assistant prose
    const finalStream = async function* () {
      yield 'Finished running both tools.';
    };

    (api.chatStream as any)
      .mockReturnValueOnce(snapStream())
      .mockReturnValueOnce(simStream())
      .mockReturnValueOnce(finalStream());

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-status').textContent).toBe('idle');
    });

    expect(api.chatStream).toHaveBeenCalledTimes(3);

    // Messages:
    // [0] user
    // [1] assistant (tool 1)
    // [2] tool 1 (get_snapshot)
    // [3] assistant (tool 2)
    // [4] tool 2 (simulate)
    // [5] assistant (final text)
    expect(screen.getByTestId('msg-count').textContent).toBe('6');

    // Check sources on final assistant message
    const finalSourcesCount = Number(screen.getByTestId('msg-5').querySelector('.sources-count')?.textContent);
    expect(finalSourcesCount).toBeGreaterThan(0);

    // Let's inspect the actual sources array from the window context
    const chatCtx = (window as any)._paydayChatContext;
    const finalMsg = chatCtx.messages[5];
    const toolMsg1 = chatCtx.messages[2];
    const toolMsg2 = chatCtx.messages[4];
    console.log(`Tool 1 sources: ${toolMsg1.sources?.length}, Tool 2 sources: ${toolMsg2.sources?.length}`);
    console.log(`Final message sources total: ${finalMsg.sources?.length}`);
    const uniqueLabels = new Set(finalMsg.sources?.map((s: any) => `${s.cents}-${s.label}`));
    console.log(`Unique sources count: ${uniqueLabels.size} vs Total sources count: ${finalMsg.sources?.length}`);
    expect(finalMsg.sources?.length).toBe(uniqueLabels.size);
  });

  it('7. Recursion guard triggers after 5 iterations and shows error message', async () => {
    const loopStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'call_loop',
          function: { name: 'get_snapshot', arguments: '{}' },
        },
      };
    };

    // Return 5 loop streams
    (api.chatStream as any)
      .mockReturnValueOnce(loopStream())
      .mockReturnValueOnce(loopStream())
      .mockReturnValueOnce(loopStream())
      .mockReturnValueOnce(loopStream())
      .mockReturnValueOnce(loopStream());

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-status').textContent).toBe('idle');
    }, { timeout: 4000 });

    // api.chatStream called 5 times (depths 0..4)
    expect(api.chatStream).toHaveBeenCalledTimes(5);

    // The last message should be [Error: Max tool calls exceeded]
    const lastMsgContent = screen.getByTestId('messages').lastElementChild?.querySelector('.content')?.textContent;
    expect(lastMsgContent).toContain('Max tool calls exceeded');
  });

  it('8. AbortController / handleStop cancels continuation immediately', async () => {
    let secondStreamStarted = false;

    const snapStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'c1',
          function: { name: 'get_snapshot', arguments: '{}' },
        },
      };
    };

    const secondStream = async function* () {
      secondStreamStarted = true;
      yield 'Should not run';
    };

    (api.chatStream as any)
      .mockImplementationOnce(() => snapStream())
      .mockImplementationOnce(() => secondStream());

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    // Start stream
    fireEvent.click(screen.getByTestId('send-btn'));

    // Immediately stop
    fireEvent.click(screen.getByTestId('stop-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-status').textContent).toBe('idle');
    });

    // Continuation should NOT have run the 2nd stream because aborted
    expect(secondStreamStarted).toBe(false);
  });

  it('9. Tool execution validation error is fed back to the LLM and continues', async () => {
    // LLM calls simulate with empty changes: {}
    const invalidSimStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'call_inv',
          function: {
            name: 'simulate',
            arguments: JSON.stringify({ label: 'Bad', changes: [] }),
          },
        },
      };
    };

    const recoveryStream = async function* () {
      yield 'Simulate failed because changes was empty. Please specify a change.';
    };

    (api.chatStream as any)
      .mockReturnValueOnce(invalidSimStream())
      .mockReturnValueOnce(recoveryStream());

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-status').textContent).toBe('idle');
    });

    // Should have continued to give the LLM the error message!
    expect(api.chatStream).toHaveBeenCalledTimes(2);

    // The tool result message should contain error info
    const toolMsgContent = screen.getByTestId('msg-2').querySelector('.content')?.textContent;
    expect(toolMsgContent).toContain('No changes provided');
  });

  it('10. Parallel tool calls in a single turn execute and deduplicate sources across tools', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const parallelStream = async function* () {
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'call_p1',
          function: { name: 'get_snapshot', arguments: '{}' },
        },
      };
      yield {
        type: 'tool_call',
        tool_call: {
          id: 'call_p2',
          function: {
            name: 'get_schedule',
            arguments: JSON.stringify({ from_date: today, to_date: format(addDays(new Date(), 14), 'yyyy-MM-dd') }),
          },
        },
      };
    };

    const followUpStream = async function* () {
      yield 'Here is your snapshot and schedule.';
    };

    (api.chatStream as any)
      .mockReturnValueOnce(parallelStream())
      .mockReturnValueOnce(followUpStream());

    render(
      <ChatProvider>
        <TestConsumer />
      </ChatProvider>
    );

    fireEvent.click(screen.getByTestId('send-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('stream-status').textContent).toBe('idle');
    });

    // Should have continued: 2 turns
    expect(api.chatStream).toHaveBeenCalledTimes(2);

    // Messages:
    // [0] user
    // [1] assistant (parallel tool calls: [call_p1, call_p2])
    // [2] tool 1 (get_snapshot)
    // [3] tool 2 (get_schedule)
    // [4] assistant (final text)
    expect(screen.getByTestId('msg-count').textContent).toBe('5');

    const chatCtx = (window as any)._paydayChatContext;
    const assistantTurn1 = chatCtx.messages[1];
    expect(assistantTurn1.tool_calls).toHaveLength(2);
    expect(assistantTurn1.tool_calls[0].id).toBe('call_p1');
    expect(assistantTurn1.tool_calls[1].id).toBe('call_p2');

    const finalMsg = chatCtx.messages[4];
    const uniqueKeys = new Set(finalMsg.sources?.map((s: any) => `${s.cents}:${s.label}`));
    expect(finalMsg.sources?.length).toBe(uniqueKeys.size);
    expect(finalMsg.sources?.length).toBeGreaterThan(0);
  });
});

