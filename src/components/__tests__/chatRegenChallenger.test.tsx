// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ChatPanel } from '../ChatPanel';
import { ChatProvider, CHAT_STORAGE_KEY, useChat } from '../../context/ChatContext';
import { api } from '../../lib/apiClient';
import { usePlannerStore } from '../../store/usePlannerStore';
import { useSettingsStore } from '../../store/useSettingsStore';

vi.mock('../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'openai', analysis_model: 'gpt-4o' }),
    getModels: vi.fn().mockResolvedValue([
      {
        provider_type: 'openai',
        provider_name: 'OpenAI',
        models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
      },
    ]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

describe('Milestone 2 Empirical Challenger: Message Regeneration & Tool Excision', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetToDefaults();
    useSettingsStore.setState({
      chatModel: 'gpt-4o',
      chatRecentModels: [],
      chatFavoriteModels: [],
      showTokenUsage: false,
      showContextGlance: false,
    });
    vi.clearAllMocks();
  });

  describe('1. Intermediate Tool Call Excision & DOM Cleansing', () => {
    it('thoroughly excises intermediate "simulate" tool calls, tool results, and simulation cards from conversation array and DOM', async () => {
      const history = [
        { role: 'user', content: 'What happens if I delay my car insurance payment?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_sim_999',
              function: {
                name: 'simulate',
                arguments: JSON.stringify({
                  changes: [
                    {
                      type: 'move_event',
                      event_id: 'evt-car-insurance',
                      from_date: '2026-10-05',
                      to_date: '2026-10-20',
                    },
                  ],
                }),
              },
            },
          ],
        },
        {
          role: 'tool',
          name: 'simulate',
          tool_call_id: 'call_sim_999',
          content: JSON.stringify({
            diff: {
              affected_accounts: {
                'acc-chequing': {
                  name: 'Chequing Account',
                  lowest_balance_before: 200,
                  lowest_balance_after: 450,
                  first_breach_before: '2026-10-06',
                  first_breach_after: 'None',
                },
              },
            },
          }),
        },
        {
          role: 'assistant',
          content: 'Simulated diff shows your balance remains above the floor if delayed.',
        },
      ];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

      (api.chatStream as any).mockImplementation(async function* () {
        yield 'Regenerated fresh assessment without running any simulation.';
      });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      // Confirm initial UI state has the simulation scratchpad card and assistant message
      expect(screen.getByText('Scenario Simulation')).toBeInTheDocument();
      expect(screen.getByText('Chequing Account')).toBeInTheDocument();
      expect(screen.getByText(/Simulated diff shows your balance/i)).toBeInTheDocument();

      const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
      expect(regenBtn).toBeInTheDocument();

      // Trigger message regeneration
      await act(async () => {
        fireEvent.click(regenBtn);
      });

      // 1. Verify api.chatStream payload
      expect(api.chatStream).toHaveBeenCalledTimes(1);
      const messagesSent = (api.chatStream as any).mock.calls[0][0];

      // Exact truncation to only the initial user prompt
      expect(messagesSent).toHaveLength(1);
      expect(messagesSent[0]).toEqual({
        role: 'user',
        content: 'What happens if I delay my car insurance payment?',
      });

      // Confirm complete absence of tool calls and tool results in the sent array
      const hasToolCalls = messagesSent.some((m: any) => m.tool_calls && m.tool_calls.length > 0);
      const hasToolRole = messagesSent.some((m: any) => m.role === 'tool');
      expect(hasToolCalls).toBe(false);
      expect(hasToolRole).toBe(false);

      // 2. Verify DOM state: simulation card must be completely unmounted and purged
      expect(screen.queryByText('Scenario Simulation')).not.toBeInTheDocument();
      expect(screen.queryByText('Chequing Account')).not.toBeInTheDocument();
      expect(screen.queryByText(/Simulated diff shows your balance/i)).not.toBeInTheDocument();

      // 3. Verify new assistant output renders
      await waitFor(() => {
        expect(
          screen.getByText('Regenerated fresh assessment without running any simulation.')
        ).toBeInTheDocument();
      });
    });

    it('thoroughly excises intermediate "propose_blueprint_changes" tool calls and proposal action cards from conversation array and DOM', async () => {
      const history = [
        { role: 'user', content: 'Please create a proposal to pause my gym membership.' },
        {
          role: 'assistant',
          content: 'I will prepare that proposal now.',
          tool_calls: [
            {
              id: 'call_prop_123',
              function: {
                name: 'propose_blueprint_changes',
                arguments: JSON.stringify({
                  changes: [
                    {
                      type: 'pause_event',
                      event_id: 'evt-gym',
                      from_date: '2026-10-01',
                      to_date: '2026-11-01',
                    },
                  ],
                }),
              },
            },
          ],
        },
        {
          role: 'tool',
          name: 'propose_blueprint_changes',
          tool_call_id: 'call_prop_123',
          content: JSON.stringify({
            status: 'success',
            diff: { affected_accounts: {} },
            message: 'Proposal sent to user UI.',
            changes: [
              {
                type: 'pause_event',
                event_id: 'evt-gym',
                from_date: '2026-10-01',
                to_date: '2026-11-01',
              },
            ],
          }),
        },
        {
          role: 'assistant',
          content: 'Here is the proposal to pause your gym membership for review.',
        },
      ];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

      (api.chatStream as any).mockImplementation(async function* () {
        yield 'Regenerated: Gym membership paused recommendation replaced with budget tips.';
      });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      // Verify the proposal card exists with "Proposed Changes", "Apply to Plan", and "Reject"
      expect(screen.getByText('Proposed Blueprint')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Apply to Plan/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument();
      expect(screen.getByText(/Here is the proposal to pause your gym membership/i)).toBeInTheDocument();

      const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
      await act(async () => {
        fireEvent.click(regenBtn);
      });

      // 1. Verify api.chatStream payload
      expect(api.chatStream).toHaveBeenCalledTimes(1);
      const messagesSent = (api.chatStream as any).mock.calls[0][0];

      expect(messagesSent).toHaveLength(1);
      expect(messagesSent[0]).toEqual({
        role: 'user',
        content: 'Please create a proposal to pause my gym membership.',
      });

      // Verify propose_blueprint_changes tool call and result were completely removed
      expect(messagesSent.some((m: any) => m.name === 'propose_blueprint_changes')).toBe(false);
      expect(messagesSent.some((m: any) => m.tool_calls)).toBe(false);

      // 2. Verify proposal action card is completely excised from DOM
      expect(screen.queryByText('Proposed Blueprint')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Apply to Plan/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Reject/i })).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Here is the proposal to pause your gym membership/i)
      ).not.toBeInTheDocument();

      // 3. Verify regenerated output appears
      await waitFor(() => {
        expect(
          screen.getByText('Regenerated: Gym membership paused recommendation replaced with budget tips.')
        ).toBeInTheDocument();
      });
    });

    it('preserves prior conversation turns intact while excising current turn tool calls and outputs', async () => {
      const history = [
        // Turn 1: normal user-assistant conversation
        { role: 'user', content: 'Turn 1: How much money do I have in checking?' },
        { role: 'assistant', content: 'Turn 1: You have $3,000 in your checking account.' },
        // Turn 2: conversation with simulate tool call
        { role: 'user', content: 'Turn 2: Run a simulation on spending $500 today.' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_sim_t2',
              function: {
                name: 'simulate',
                arguments: JSON.stringify({ changes: [] }),
              },
            },
          ],
        },
        {
          role: 'tool',
          name: 'simulate',
          tool_call_id: 'call_sim_t2',
          content: JSON.stringify({ diff: { affected_accounts: {} } }),
        },
        {
          role: 'assistant',
          content: 'Turn 2: Simulation finished, you can safely spend $500.',
        },
      ];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

      (api.chatStream as any).mockImplementation(async function* () {
        yield 'Turn 2 regenerated: You can actually spend up to $700.';
      });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      // Verify Turn 1 and Turn 2 are present
      expect(screen.getByText('Turn 1: How much money do I have in checking?')).toBeInTheDocument();
      expect(screen.getByText('Turn 1: You have $3,000 in your checking account.')).toBeInTheDocument();
      expect(screen.getByText('Scenario Simulation')).toBeInTheDocument();
      expect(screen.getByText('Turn 2: Simulation finished, you can safely spend $500.')).toBeInTheDocument();

      const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
      await act(async () => {
        fireEvent.click(regenBtn);
      });

      // Verify api.chatStream payload: Turn 1 preserved, Turn 2 truncated to its user message
      expect(api.chatStream).toHaveBeenCalledTimes(1);
      const messagesSent = (api.chatStream as any).mock.calls[0][0];

      expect(messagesSent).toHaveLength(3);
      expect(messagesSent[0]).toEqual({
        role: 'user',
        content: 'Turn 1: How much money do I have in checking?',
      });
      expect(messagesSent[1]).toEqual({
        role: 'assistant',
        content: 'Turn 1: You have $3,000 in your checking account.',
      });
      expect(messagesSent[2]).toEqual({
        role: 'user',
        content: 'Turn 2: Run a simulation on spending $500 today.',
      });

      // Turn 2 tool calls and old response must be gone
      expect(screen.queryByText('Scenario Simulation')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Turn 2: Simulation finished, you can safely spend $500.')
      ).not.toBeInTheDocument();

      // Turn 1 content remains in DOM
      expect(screen.getByText('Turn 1: How much money do I have in checking?')).toBeInTheDocument();
      expect(screen.getByText('Turn 1: You have $3,000 in your checking account.')).toBeInTheDocument();

      // New regenerated response appears
      await waitFor(() => {
        expect(
          screen.getByText('Turn 2 regenerated: You can actually spend up to $700.')
        ).toBeInTheDocument();
      });
    });

    it('excises multiple chained tool calls within a single turn', async () => {
      const history = [
        { role: 'user', content: 'Compare simulation A and simulation B.' },
        // Tool Call 1
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_sim_a',
              function: { name: 'simulate', arguments: JSON.stringify({ changes: [] }) },
            },
          ],
        },
        {
          role: 'tool',
          name: 'simulate',
          tool_call_id: 'call_sim_a',
          content: JSON.stringify({ diff: { affected_accounts: {} } }),
        },
        // Tool Call 2
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_sim_b',
              function: { name: 'simulate', arguments: JSON.stringify({ changes: [] }) },
            },
          ],
        },
        {
          role: 'tool',
          name: 'simulate',
          tool_call_id: 'call_sim_b',
          content: JSON.stringify({ diff: { affected_accounts: {} } }),
        },
        // Final response
        {
          role: 'assistant',
          content: 'Comparison between simulation A and B is complete.',
        },
      ];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

      (api.chatStream as any).mockImplementation(async function* () {
        yield 'Single unified response without running multiple simulations.';
      });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      // There were two simulation scratchpad cards
      expect(screen.getAllByText('Scenario Simulation').length).toBe(2);

      const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
      await act(async () => {
        fireEvent.click(regenBtn);
      });

      // Sent array must only have the user message
      const messagesSent = (api.chatStream as any).mock.calls[0][0];
      expect(messagesSent).toHaveLength(1);
      expect(messagesSent[0].content).toBe('Compare simulation A and simulation B.');

      // Both simulation scratchpad cards must be removed
      expect(screen.queryByText('Scenario Simulation')).not.toBeInTheDocument();
    });
  });

  describe('2. Streaming Cancellation & Re-submission Clean Execution', () => {
    it('aborts active streaming via Stop button and allows clean re-submission via Regenerate', async () => {
      let abortedSignal: boolean | undefined;

      (api.chatStream as any).mockImplementation(async function* (
        _msgs: any,
        _bp: any,
        _ledger: any,
        _sum: any,
        _model: any,
        ...rest: any[]
      ) {
        const signal = rest.find((a: any) => a && typeof a === 'object' && 'addEventListener' in a) || rest[0];
        yield 'Chunk 1 received. ';
        yield 'Chunk 2 received. ';

        // Wait until aborted
        await new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => {
            abortedSignal = true;
            resolve();
          });
        });
      });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      // Submit user prompt
      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i);
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'Test streaming abort and resubmit' } });
      });

      const submitBtn = screen.getByRole('button', { name: '' });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      // Wait for partial chunk in UI
      await waitFor(() => {
        expect(screen.getByText(/Chunk 1 received\./i)).toBeInTheDocument();
      });

      // The stop button (destructive Square icon) must be visible
      const stopBtn = screen.getByRole('button', { name: '' });
      await act(async () => {
        fireEvent.click(stopBtn);
      });

      // Verify abort signal was fired
      expect(abortedSignal).toBe(true);

      // Verify assistant message marked with *(stopped)*
      await waitFor(() => {
        expect(screen.getByText(/Chunk 1 received/i)).toBeInTheDocument();
        expect(screen.getByText(/\(stopped\)/i)).toBeInTheDocument();
      });

      // Now Regenerate button should be visible
      const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
      expect(regenBtn).toBeInTheDocument();

      // Configure mock for clean re-submission
      (api.chatStream as any).mockImplementation(async function* () {
        yield 'Clean second attempt completed successfully.';
      });

      await act(async () => {
        fireEvent.click(regenBtn);
      });

      // Second call to chatStream should have received ONLY the initial user message
      expect(api.chatStream).toHaveBeenCalledTimes(2);
      const secondCallMsgs = (api.chatStream as any).mock.calls[1][0];
      expect(secondCallMsgs).toHaveLength(1);
      expect(secondCallMsgs[0].content).toBe('Test streaming abort and resubmit');

      // The previous *(stopped)* content must be excised
      expect(screen.queryByText(/Chunk 1 received/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/\(stopped\)/i)).not.toBeInTheDocument();

      // New response completed
      await waitFor(() => {
        expect(screen.getByText('Clean second attempt completed successfully.')).toBeInTheDocument();
      });
    });

    it('aborts active streaming via Escape key listener and re-submits cleanly', async () => {
      let abortedSignal: boolean | undefined;

      (api.chatStream as any).mockImplementation(async function* (
        _msgs: any,
        _bp: any,
        _ledger: any,
        _sum: any,
        _model: any,
        ...rest: any[]
      ) {
        const signal = rest.find((a: any) => a && typeof a === 'object' && 'addEventListener' in a) || rest[0];
        yield 'Escape stream chunk... ';
        await new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => {
            abortedSignal = true;
            resolve();
          });
        });
      });

      await act(async () => {
        render(
          <ChatProvider>
            <ChatPanel />
          </ChatProvider>
        );
      });

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i);
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'Escape key test prompt' } });
      });

      const submitBtn = screen.getByRole('button', { name: '' });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Escape stream chunk\.\.\./i)).toBeInTheDocument();
      });

      // Press Escape key
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      expect(abortedSignal).toBe(true);

      // Verify stopped indicator
      await waitFor(() => {
        expect(screen.getByText(/Escape stream chunk/i)).toBeInTheDocument();
        expect(screen.getByText(/\(stopped\)/i)).toBeInTheDocument();
      });

      // Regenerate response
      (api.chatStream as any).mockImplementation(async function* () {
        yield 'Full answer delivered after escape key abort.';
      });

      const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
      await act(async () => {
        fireEvent.click(regenBtn);
      });

      await waitFor(() => {
        expect(
          screen.getByText('Full answer delivered after escape key abort.')
        ).toBeInTheDocument();
      });
    });

    it('safely guards handleRegenerate and handleSend during active streaming', async () => {
      let resolveStream: () => void;
      const streamPromise = new Promise<void>((res) => {
        resolveStream = res;
      });

      (api.chatStream as any).mockImplementation(async function* () {
        yield 'Active long-running stream.';
        await streamPromise;
      });

      let capturedChat: any;
      const Probe = () => {
        capturedChat = useChat();
        return null;
      };

      await act(async () => {
        render(
          <ChatProvider>
            <Probe />
            <ChatPanel />
          </ChatProvider>
        );
      });

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i);
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'Initial active stream prompt' } });
      });
      const submitBtn = screen.getByRole('button', { name: '' });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(capturedChat.isStreaming).toBe(true);

      // Attempt to call handleRegenerate while isStreaming === true
      await act(async () => {
        await capturedChat.handleRegenerate();
      });

      // Attempt to call handleSend while isStreaming === true
      await act(async () => {
        await capturedChat.handleSend('Ignored concurrent message');
      });

      // api.chatStream must have ONLY been called ONCE for the initial prompt
      expect(api.chatStream).toHaveBeenCalledTimes(1);

      // Complete stream
      await act(async () => {
        resolveStream!();
      });

      await waitFor(() => {
        expect(capturedChat.isStreaming).toBe(false);
      });
    });

    it('safely handles handleRegenerate when conversation is empty or lacks user prompt', async () => {
      let capturedChat: any;
      const Probe = () => {
        capturedChat = useChat();
        return null;
      };

      await act(async () => {
        render(
          <ChatProvider>
            <Probe />
            <ChatPanel />
          </ChatProvider>
        );
      });

      // Empty messages: calling handleRegenerate should safely no-op
      await act(async () => {
        await capturedChat.handleRegenerate();
      });
      expect(api.chatStream).not.toHaveBeenCalled();

      // Only assistant message (e.g. system greeting without user turn)
      await act(async () => {
        capturedChat.setMessages([{ role: 'assistant', content: 'Standalone greeting' }]);
      });

      await act(async () => {
        await capturedChat.handleRegenerate();
      });
      // Should still be a safe no-op
      expect(api.chatStream).not.toHaveBeenCalled();
    });

    it('preserves idempotence: calling handleStop when !isStreaming does not mutate messages', async () => {
      const history = [
        { role: 'user', content: 'What is my plan?' },
        { role: 'assistant', content: 'Your plan is on track.\n\n*(stopped)*' },
      ];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

      let capturedChat: any;
      const Probe = () => {
        capturedChat = useChat();
        return null;
      };

      await act(async () => {
        render(
          <ChatProvider>
            <Probe />
            <ChatPanel />
          </ChatProvider>
        );
      });

      expect(capturedChat.isStreaming).toBe(false);
      const initialMessages = capturedChat.messages;

      // Call handleStop when not streaming
      await act(async () => {
        capturedChat.handleStop();
      });

      // Message content must NOT be duplicated or mutated
      expect(capturedChat.messages[1].content).toBe('Your plan is on track.\n\n*(stopped)*');
      expect(capturedChat.messages).toEqual(initialMessages);
    });
  });
});
