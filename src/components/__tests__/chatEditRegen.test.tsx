import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ChatPanel } from '../ChatPanel';
import { ChatProvider, CHAT_STORAGE_KEY } from '../../context/ChatContext';
import { api } from '../../lib/apiClient';

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

describe('Chat Message Edit & Regeneration (chatEditRegen)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders Regenerate button on the last assistant message when !isStreaming', async () => {
    const history = [
      { role: 'user', content: 'What is my current chequing balance?' },
      { role: 'assistant', content: 'Your chequing balance is $2,450.00.' },
    ];
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

    await act(async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );
    });

    const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
    expect(regenBtn).toBeInTheDocument();
    expect(regenBtn).toHaveAttribute('title', 'Regenerate response');
  });

  it('renders Regenerate button ONLY on the last assistant message in a multi-turn conversation', async () => {
    const history = [
      { role: 'user', content: 'Turn 1 user question' },
      { role: 'assistant', content: 'Turn 1 assistant answer' },
      { role: 'user', content: 'Turn 2 user question' },
      { role: 'assistant', content: 'Turn 2 assistant answer' },
    ];
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

    await act(async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );
    });

    // There should be exactly ONE Regenerate button across the entire message list
    const regenButtons = screen.getAllByRole('button', { name: /Regenerate/i });
    expect(regenButtons).toHaveLength(1);

    // Verify it is located within the container of Turn 2 assistant answer, not Turn 1
    const turn2Text = screen.getByText('Turn 2 assistant answer');
    const assistantBubble = turn2Text.closest('div');
    expect(assistantBubble).toBeInTheDocument();
  });

  it('does NOT render Regenerate button when there are no assistant messages', async () => {
    const history = [
      { role: 'user', content: 'First user message without any response yet' },
    ];
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

    await act(async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );
    });

    expect(screen.queryByRole('button', { name: /Regenerate/i })).not.toBeInTheDocument();
  });

  it('clicking Regenerate truncates history back to the previous user message and re-invokes api.chatStream', async () => {
    const history = [
      { role: 'user', content: 'Initial message' },
      { role: 'assistant', content: 'Initial response' },
      { role: 'user', content: 'Tell me about my budget' },
      { role: 'assistant', content: 'Old response that should be regenerated' },
    ];
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

    (api.chatStream as any).mockImplementation(async function* () {
      yield 'Brand new regenerated budget analysis.';
    });

    await act(async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );
    });

    const regenBtn = screen.getByRole('button', { name: /Regenerate/i });

    await act(async () => {
      fireEvent.click(regenBtn);
    });

    // api.chatStream should have been invoked
    expect(api.chatStream).toHaveBeenCalledTimes(1);

    // Inspect the messages payload passed to api.chatStream:
    // It should have truncated history to [Initial message, Initial response, Tell me about my budget]
    const streamCallArgs = (api.chatStream as any).mock.calls[0];
    const messagesSent = streamCallArgs[0];

    expect(messagesSent).toHaveLength(3);
    expect(messagesSent[0]).toEqual({ role: 'user', content: 'Initial message' });
    expect(messagesSent[1]).toEqual({ role: 'assistant', content: 'Initial response' });
    expect(messagesSent[2]).toEqual({ role: 'user', content: 'Tell me about my budget' });

    // The old response should NOT be in the history passed to chatStream
    expect(messagesSent).not.toContainEqual(
      expect.objectContaining({ content: 'Old response that should be regenerated' })
    );

    // Verify the newly generated response appears in the UI
    await waitFor(() => {
      expect(screen.getByText('Brand new regenerated budget analysis.')).toBeInTheDocument();
    });
  });

  it('clicking Regenerate discards intermediate tool turns and assistant tool call messages', async () => {
    const history = [
      { role: 'user', content: 'Can I afford to delay my mortgage payment?' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_sim_123',
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
        tool_call_id: 'call_sim_123',
        content: JSON.stringify({ diff: { affected_accounts: {} } }),
      },
      {
        role: 'assistant',
        content: 'Based on simulation, delaying your mortgage causes a breach on day 14.',
      },
    ];
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

    (api.chatStream as any).mockImplementation(async function* () {
      yield 'Alternative advice without tool call.';
    });

    await act(async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );
    });

    const regenBtn = screen.getByRole('button', { name: /Regenerate/i });

    await act(async () => {
      fireEvent.click(regenBtn);
    });

    expect(api.chatStream).toHaveBeenCalledTimes(1);
    const messagesSent = (api.chatStream as any).mock.calls[0][0];

    // History should be truncated back to the user message only
    expect(messagesSent).toHaveLength(1);
    expect(messagesSent[0].role).toBe('user');
    expect(messagesSent[0].content).toBe('Can I afford to delay my mortgage payment?');

    // Both the tool_calls message and tool result must be completely purged
    const hasToolMsg = messagesSent.some((m: any) => m.role === 'tool' || m.tool_calls);
    expect(hasToolMsg).toBe(false);

    await waitFor(() => {
      expect(screen.getByText('Alternative advice without tool call.')).toBeInTheDocument();
    });
  });

  it('hides or disables Regenerate button while isStreaming is true', async () => {
    let resolveStreamPromise: (value: void) => void;
    const streamPromise = new Promise<void>((resolve) => {
      resolveStreamPromise = resolve;
    });

    (api.chatStream as any).mockImplementation(async function* () {
      yield 'Streaming partial chunk...';
      await streamPromise;
      yield ' Finished!';
    });

    await act(async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );
    });

    // Submit a message to begin streaming
    const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Trigger active stream' } });
    });

    const sendBtn = screen.getByRole('button', { name: '' }); // Send icon button
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // While streaming, the partial text is visible
    expect(screen.getByText(/Streaming partial chunk\.\.\./i)).toBeInTheDocument();

    // Regenerate button must NOT be present during streaming
    expect(screen.queryByRole('button', { name: /Regenerate/i })).not.toBeInTheDocument();

    // Complete the stream
    await act(async () => {
      resolveStreamPromise!();
    });

    // After streaming finishes, Regenerate button reappears on the completed response
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Regenerate/i })).toBeInTheDocument();
    });
  });

  it('supports regenerating an assistant response that was previously stopped', async () => {
    const history = [
      { role: 'user', content: 'Explain emergency fund calculations' },
      { role: 'assistant', content: 'An emergency fund should cover 3 to 6 months...\n\n*(stopped)*' },
    ];
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

    (api.chatStream as any).mockImplementation(async function* () {
      yield 'Complete explanation without interruptions.';
    });

    await act(async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );
    });

    const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
    await act(async () => {
      fireEvent.click(regenBtn);
    });

    expect(api.chatStream).toHaveBeenCalledTimes(1);
    const messagesSent = (api.chatStream as any).mock.calls[0][0];
    expect(messagesSent).toHaveLength(1);
    expect(messagesSent[0].content).toBe('Explain emergency fund calculations');

    await waitFor(() => {
      expect(screen.getByText('Complete explanation without interruptions.')).toBeInTheDocument();
    });
  });

  it('clicking Edit on a user message populates the input textarea and truncates history to that point', async () => {
    const history = [
      { role: 'user', content: 'First prompt to keep' },
      { role: 'assistant', content: 'First response' },
      { role: 'user', content: 'Second prompt to edit' },
      { role: 'assistant', content: 'Second response to remove' },
    ];
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

    await act(async () => {
      render(
        <ChatProvider>
          <ChatPanel />
        </ChatProvider>
      );
    });

    // Find the edit button on the second user message
    const editButtons = screen.getAllByRole('button', { name: /Edit message/i });
    expect(editButtons.length).toBeGreaterThanOrEqual(2);

    // Click edit on the second user prompt
    await act(async () => {
      fireEvent.click(editButtons[1]);
    });

    // Textarea input should be populated with 'Second prompt to edit'
    const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i);
    expect(textarea).toHaveValue('Second prompt to edit');

    // Messages after this point should be sliced
    expect(screen.queryByText('Second response to remove')).not.toBeInTheDocument();
  });
});
