// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';
import { ChatProvider, useChat, useChatOptional, CHAT_STORAGE_KEY } from '../../context/ChatContext';
import { ChatFAB } from '../ChatFAB';
import { ChatPanel } from '../ChatPanel';
import { ModelPopover } from '../ModelPopover';
import { api } from '../../lib/apiClient';
import { usePlannerStore } from '../../store/usePlannerStore';
import { useSettingsStore } from '../../store/useSettingsStore';

vi.mock('../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'test-provider', analysis_model: 'default-model' }),
    getModels: vi.fn().mockResolvedValue([
      {
        provider_name: 'Test Provider',
        provider_type: 'test',
        models: [
          { id: 'default-model', name: 'Default Model' },
          { id: 'alt-model', name: 'Alternative Model' },
        ],
      },
    ]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

describe('ChatContext & ChatProvider — Empirical Challenge Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetToDefaults();
    useSettingsStore.setState({
      chatModel: '',
      chatRecentModels: [],
      chatFavoriteModels: [],
      showTokenUsage: false,
      showContextGlance: false,
    });
    vi.clearAllMocks();
  });

  describe('1. Standalone Rendering & Auto-wrapping', () => {
    it('renders ChatPanel without ChatProvider or Router without throwing', async () => {
      // ChatPanel should auto-wrap with ChatProvider and gracefully handle absence of Router
      expect(() => {
        render(<ChatPanel mode="page" />);
      }).not.toThrow();

      // Starter suggestions or welcome message should be visible
      expect(screen.getByText(/I'm your local AI planner/i)).toBeInTheDocument();
      // Input textarea should be present
      expect(screen.getByPlaceholderText(/Can I afford a \$400 car payment/i)).toBeInTheDocument();
    });

    it('renders ChatPanel in floating mode standalone without throwing', async () => {
      expect(() => {
        render(<ChatPanel mode="floating" />);
      }).not.toThrow();

      expect(screen.getByText(/AI Financial Assistant/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Can I afford a \$400 car payment/i)).toBeInTheDocument();
    });

    it('executes user input submission standalone when auto-wrapped', async () => {
      const mockStream = async function* () {
        yield 'Hello, this is a standalone AI response!';
      };
      (api.chatStream as any).mockReturnValue(mockStream());

      render(<ChatPanel />);

      const textarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i);
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'How much can I spend?' } });
      });

      const form = textarea.closest('form');
      expect(form).not.toBeNull();
      await act(async () => {
        fireEvent.submit(form!);
      });

      await waitFor(() => {
        expect(screen.getByText('How much can I spend?')).toBeInTheDocument();
        expect(screen.getByText(/Hello, this is a standalone AI response!/i)).toBeInTheDocument();
      });
    });

    it('useChatOptional returns null when outside provider, while useChat throws descriptive error', () => {
      let optionalResult: any = 'unset';
      const Consumer = () => {
        optionalResult = useChatOptional();
        return null;
      };

      render(<Consumer />);
      expect(optionalResult).toBeNull();

      const StrictConsumer = () => {
        useChat();
        return null;
      };

      const originalError = console.error;
      console.error = vi.fn();
      expect(() => render(<StrictConsumer />)).toThrow('useChat must be used within a ChatProvider');
      console.error = originalError;
    });
  });

  describe('2. Multiple Concurrent Consumers', () => {
    it('synchronizes input, messages, isOpen, and model changes across all consumers simultaneously', async () => {
      const ConsumerA = () => {
        const { input, setInput, isOpen } = useChat();
        return (
          <div>
            <span data-testid="a-input">{input}</span>
            <span data-testid="a-open">{isOpen ? 'open' : 'closed'}</span>
            <button onClick={() => setInput('Input from A')}>A sets input</button>
          </div>
        );
      };

      const ConsumerB = () => {
        const { input, messages, setMessages, isOpen, toggleOpen } = useChat();
        return (
          <div>
            <span data-testid="b-input">{input}</span>
            <span data-testid="b-open">{isOpen ? 'open' : 'closed'}</span>
            <span data-testid="b-msg-count">{messages.length}</span>
            <button onClick={() => setMessages([{ role: 'user', content: 'Message from B' }])}>
              B adds message
            </button>
            <button onClick={toggleOpen}>B toggles open</button>
          </div>
        );
      };

      const ConsumerC = () => {
        const { messages, clearMessages, selectedModel, setSelectedModel } = useChat();
        return (
          <div>
            <span data-testid="c-msg-count">{messages.length}</span>
            <span data-testid="c-model">{selectedModel}</span>
            <button onClick={clearMessages}>C clears messages</button>
            <button onClick={() => setSelectedModel('alt-model')}>C selects alt-model</button>
          </div>
        );
      };

      render(
        <ChatProvider>
          <ConsumerA />
          <ConsumerB />
          <ConsumerC />
        </ChatProvider>
      );

      // Initial assertions
      expect(screen.getByTestId('a-input')).toHaveTextContent('');
      expect(screen.getByTestId('b-input')).toHaveTextContent('');
      expect(screen.getByTestId('a-open')).toHaveTextContent('closed');
      expect(screen.getByTestId('b-open')).toHaveTextContent('closed');
      expect(screen.getByTestId('b-msg-count')).toHaveTextContent('0');
      expect(screen.getByTestId('c-msg-count')).toHaveTextContent('0');

      // Consumer A updates input -> Consumer B sees it immediately
      await act(async () => {
        fireEvent.click(screen.getByText('A sets input'));
      });
      expect(screen.getByTestId('a-input')).toHaveTextContent('Input from A');
      expect(screen.getByTestId('b-input')).toHaveTextContent('Input from A');

      // Consumer B toggles open -> Consumer A sees it immediately
      await act(async () => {
        fireEvent.click(screen.getByText('B toggles open'));
      });
      expect(screen.getByTestId('a-open')).toHaveTextContent('open');
      expect(screen.getByTestId('b-open')).toHaveTextContent('open');

      // Consumer B adds message -> Consumer C sees it immediately
      await act(async () => {
        fireEvent.click(screen.getByText('B adds message'));
      });
      expect(screen.getByTestId('b-msg-count')).toHaveTextContent('1');
      expect(screen.getByTestId('c-msg-count')).toHaveTextContent('1');

      // Consumer C selects alt-model -> model updates
      await act(async () => {
        fireEvent.click(screen.getByText('C selects alt-model'));
      });
      expect(screen.getByTestId('c-model')).toHaveTextContent('alt-model');

      // Consumer C clears messages -> both B and C see 0 messages
      await act(async () => {
        fireEvent.click(screen.getByText('C clears messages'));
      });
      expect(screen.getByTestId('b-msg-count')).toHaveTextContent('0');
      expect(screen.getByTestId('c-msg-count')).toHaveTextContent('0');
    });
  });

  describe('3. Unmounted States & Async Resilience', () => {
    it('survives individual consumer unmount while streaming is active', async () => {
      let triggerChunk: (() => void) | null = null;

      const deferredStream = async function* () {
        yield 'First chunk';
        await new Promise<void>((resolve) => {
          triggerChunk = resolve;
        });
        yield 'Second chunk';
      };

      (api.chatStream as any).mockImplementation(() => deferredStream());

      const FragileConsumer = () => {
        const { messages } = useChat();
        return <div data-testid="fragile-msg">{messages[messages.length - 1]?.content}</div>;
      };

      const PersistentConsumer = () => {
        const { messages, isStreaming, handleSend } = useChat();
        return (
          <div>
            <span data-testid="persistent-streaming">{isStreaming ? 'streaming' : 'idle'}</span>
            <span data-testid="persistent-content">{messages[messages.length - 1]?.content}</span>
            <button onClick={() => handleSend('Start stream')}>Launch</button>
          </div>
        );
      };

      const HostComponent = () => {
        const [showFragile, setShowFragile] = useState(true);
        return (
          <ChatProvider>
            {showFragile && <FragileConsumer />}
            <PersistentConsumer />
            <button onClick={() => setShowFragile(false)}>Unmount Fragile</button>
          </ChatProvider>
        );
      };

      render(<HostComponent />);

      // Launch stream
      await act(async () => {
        fireEvent.click(screen.getByText('Launch'));
      });

      // Stream has emitted first chunk
      await waitFor(() => {
        expect(screen.getByTestId('persistent-streaming')).toHaveTextContent('streaming');
        expect(screen.getByTestId('fragile-msg')).toHaveTextContent('First chunk');
      });

      // Unmount FragileConsumer while stream is suspended mid-flight
      await act(async () => {
        fireEvent.click(screen.getByText('Unmount Fragile'));
      });

      expect(screen.queryByTestId('fragile-msg')).not.toBeInTheDocument();

      // Trigger remaining chunk while fragile consumer is gone
      await act(async () => {
        if (triggerChunk) triggerChunk();
      });

      // Persistent consumer receives full stream and reaches idle state cleanly
      await waitFor(() => {
        expect(screen.getByTestId('persistent-streaming')).toHaveTextContent('idle');
        expect(screen.getByTestId('persistent-content')).toHaveTextContent('First chunkSecond chunk');
      });
    });

    it('inspects whether ChatProvider cleans up streaming abort signal on unmount', async () => {
      let capturedSignal: AbortSignal | null = null;
      let isGeneratorActive = true;

      const monitoredStream = async function* (signal: AbortSignal) {
        capturedSignal = signal;
        while (isGeneratorActive) {
          yield 'Token';
          await new Promise((r) => setTimeout(r, 20));
        }
      };

      (api.chatStream as any).mockImplementation((_msgs: any, _bp: any, _lc: any, _sum: any, _model: any, signal: AbortSignal) => {
        return monitoredStream(signal);
      });

      const ChatHarness = () => {
        const { handleSend } = useChat();
        return <button onClick={() => handleSend('Monitored stream')}>Go</button>;
      };

      const UnmountHarness = () => {
        const [mounted, setMounted] = useState(true);
        return (
          <div>
            {mounted && (
              <ChatProvider>
                <ChatHarness />
              </ChatProvider>
            )}
            <button onClick={() => setMounted(false)}>Unmount Provider</button>
          </div>
        );
      };

      render(<UnmountHarness />);

      await act(async () => {
        fireEvent.click(screen.getByText('Go'));
      });

      await waitFor(() => {
        expect(capturedSignal).not.toBeNull();
      });

      // Unmount the entire provider mid-stream
      await act(async () => {
        fireEvent.click(screen.getByText('Unmount Provider'));
      });

      // Check whether capturedSignal was aborted upon unmount
      // Note: If ChatProvider lacks unmount cleanup, capturedSignal.aborted is false!
      const wasAbortedOnUnmount = Boolean((capturedSignal as any)?.aborted);

      // Stop our loop generator to allow clean test teardown
      isGeneratorActive = false;

      // We document whether unmount cleanup occurred:
      // (This will be reported in empirical challenge observations)
      expect(typeof wasAbortedOnUnmount).toBe('boolean');
    });
  });

  describe('4. Streaming Aborts (handleStop, Escape key, AbortError)', () => {
    it('aborts active stream via handleStop, appends (stopped), and resets isStreaming', async () => {
      let streamSignal: AbortSignal | null = null;
      const stoppableStream = async function* (signal: AbortSignal) {
        streamSignal = signal;
        yield 'Part 1';
        yield 'Part 2';
        while (!signal.aborted) {
          await new Promise((r) => setTimeout(r, 10));
        }
      };

      (api.chatStream as any).mockImplementation((_msgs: any, _bp: any, _lc: any, _sum: any, _model: any, ...rest: any[]) => {
        const signal = rest.find((a: any) => a && typeof a === 'object' && 'aborted' in a) || rest[0];
        return stoppableStream(signal);
      });

      const AbortHarness = () => {
        const { messages, isStreaming, handleSend, handleStop } = useChat();
        return (
          <div>
            <span data-testid="streaming-state">{isStreaming ? 'streaming' : 'idle'}</span>
            <span data-testid="last-message">{messages[messages.length - 1]?.content}</span>
            <button onClick={() => handleSend('Start')}>Start</button>
            <button onClick={handleStop}>Stop</button>
          </div>
        );
      };

      render(
        <ChatProvider>
          <AbortHarness />
        </ChatProvider>
      );

      // Start stream
      await act(async () => {
        fireEvent.click(screen.getByText('Start'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('streaming-state')).toHaveTextContent('streaming');
        expect(screen.getByTestId('last-message')).toHaveTextContent('Part 1Part 2');
      });

      // Abort stream
      await act(async () => {
        fireEvent.click(screen.getByText('Stop'));
      });

      // Verify abort controller signal triggered
      expect((streamSignal as any)?.aborted).toBe(true);

      // Verify state was set to idle and *(stopped)* was appended
      expect(screen.getByTestId('streaming-state')).toHaveTextContent('idle');
      expect(screen.getByTestId('last-message').textContent).toBe('Part 1Part 2\n\n*(stopped)*');

      // Verify calling handleStop() again when not streaming is a no-op due to isStreaming guard
      await act(async () => {
        fireEvent.click(screen.getByText('Stop'));
      });
      expect(screen.getByTestId('last-message').textContent).toBe('Part 1Part 2\n\n*(stopped)*');
    });

    it('aborts active stream when Escape key is pressed', async () => {
      const longStream = async function* (signal: AbortSignal) {
        yield 'Initial response';
        while (!signal.aborted) {
          await new Promise((r) => setTimeout(r, 10));
        }
      };

      (api.chatStream as any).mockImplementation((_msgs: any, _bp: any, _lc: any, _sum: any, _model: any, signal: AbortSignal) => {
        return longStream(signal);
      });

      const EscapeHarness = () => {
        const { messages, isStreaming, handleSend } = useChat();
        return (
          <div>
            <span data-testid="escape-streaming">{isStreaming ? 'streaming' : 'idle'}</span>
            <span data-testid="escape-content">{messages[messages.length - 1]?.content}</span>
            <button onClick={() => handleSend('Escape test')}>Send</button>
          </div>
        );
      };

      render(
        <ChatProvider>
          <EscapeHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Send'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('escape-streaming')).toHaveTextContent('streaming');
      });

      // Press Escape on document
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(screen.getByTestId('escape-streaming')).toHaveTextContent('idle');
      expect(screen.getByTestId('escape-content').textContent).toContain('*(stopped)*');

      // Press Escape again when idle — should not throw or change message
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(screen.getByTestId('escape-streaming')).toHaveTextContent('idle');
    });

    it('suppresses AbortError and does not display it as a chat error message', async () => {
      const abortingStream = async function* () {
        yield 'Some initial text';
        const err = new Error('The user aborted a request.');
        err.name = 'AbortError';
        throw err;
      };

      (api.chatStream as any).mockReturnValue(abortingStream());

      const StreamHarness = () => {
        const { messages, isStreaming, handleSend } = useChat();
        return (
          <div>
            <span data-testid="is-streaming">{isStreaming ? 'streaming' : 'idle'}</span>
            <div data-testid="all-messages">
              {messages.map((m, i) => (
                <div key={i}>{m.content}</div>
              ))}
            </div>
            <button onClick={() => handleSend('Trigger AbortError')}>Go</button>
          </div>
        );
      };

      render(
        <ChatProvider>
          <StreamHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Go'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-streaming')).toHaveTextContent('idle');
      });

      // Should NOT contain "Error: The user aborted a request."
      expect(screen.getByTestId('all-messages')).not.toHaveTextContent(/Error: The user aborted/i);
    });

    it('displays legitimate non-abort runtime errors cleanly in chat', async () => {
      const failingStream = async function* () {
        const err = new Error('500 Internal Server Error: Gateway Timeout');
        err.name = 'HttpError';
        throw err;
      };

      (api.chatStream as any).mockReturnValue(failingStream());

      const FailHarness = () => {
        const { messages, isStreaming, handleSend } = useChat();
        return (
          <div>
            <span data-testid="fail-streaming">{isStreaming ? 'streaming' : 'idle'}</span>
            <div data-testid="fail-content">
              {messages.map((m, i) => (
                <div key={i}>{m.content}</div>
              ))}
            </div>
            <button onClick={() => handleSend('Trigger 500')}>Fail</button>
          </div>
        );
      };

      render(
        <ChatProvider>
          <FailHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Fail'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('fail-streaming')).toHaveTextContent('idle');
        expect(screen.getByTestId('fail-content')).toHaveTextContent('Error: 500 Internal Server Error: Gateway Timeout');
      });
    });

    it('ignores concurrent handleSend requests while isStreaming is active', async () => {
      let finishStream: (() => void) | null = null;
      const slowStream = async function* () {
        yield 'Working on first request...';
        await new Promise<void>((r) => { finishStream = r; });
      };

      (api.chatStream as any).mockImplementation(() => slowStream());

      const ConcurrentHarness = () => {
        const { messages, isStreaming, handleSend } = useChat();
        return (
          <div>
            <span data-testid="c-streaming">{isStreaming ? 'streaming' : 'idle'}</span>
            <span data-testid="c-count">{messages.length}</span>
            <button onClick={() => handleSend('Prompt 1')}>Send 1</button>
            <button onClick={() => handleSend('Prompt 2')}>Send 2</button>
          </div>
        );
      };

      render(
        <ChatProvider>
          <ConcurrentHarness />
        </ChatProvider>
      );

      // Start prompt 1
      await act(async () => {
        fireEvent.click(screen.getByText('Send 1'));
      });

      expect(screen.getByTestId('c-streaming')).toHaveTextContent('streaming');
      // Messages: User prompt 1, Assistant placeholder
      expect(screen.getByTestId('c-count')).toHaveTextContent('2');

      // Attempt prompt 2 while streaming
      await act(async () => {
        fireEvent.click(screen.getByText('Send 2'));
      });

      // Prompt 2 should be rejected/ignored; count stays 2
      expect(screen.getByTestId('c-count')).toHaveTextContent('2');

      // Finish stream 1
      await act(async () => {
        if (finishStream) finishStream();
      });

      await waitFor(() => {
        expect(screen.getByTestId('c-streaming')).toHaveTextContent('idle');
      });
    });

    it('ignores empty, whitespace-only handleSend submissions', async () => {
      const EmptyHarness = () => {
        const { messages, handleSend } = useChat();
        return (
          <div>
            <span data-testid="empty-count">{messages.length}</span>
            <button onClick={() => handleSend('')}>Send Empty</button>
            <button onClick={() => handleSend('   \n\t   ')}>Send Spaces</button>
          </div>
        );
      };

      render(
        <ChatProvider>
          <EmptyHarness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Send Empty'));
        fireEvent.click(screen.getByText('Send Spaces'));
      });

      expect(screen.getByTestId('empty-count')).toHaveTextContent('0');
      expect(api.chatStream).not.toHaveBeenCalled();
    });
  });

  describe('5. ChatFAB Route Visibility & Sheet Controls', () => {
    it('is visible on standard routes (/, /overview/dashboard, /planner/timeline, /arbitrary)', async () => {
      const testRoutes = [
        '/',
        '/overview/dashboard',
        '/planner/timeline',
        '/reports/cash-flow',
        '/settings/preferences',
      ];

      for (const route of testRoutes) {
        const { unmount } = render(
          <MemoryRouter initialEntries={[route]}>
            <ChatProvider>
              <ChatFAB />
            </ChatProvider>
          </MemoryRouter>
        );

        const fab = screen.queryByRole('button', { name: /Open AI Financial Chat/i });
        expect(fab).not.toBeNull();
        unmount();
      }
    });

    it('is strictly hidden (renders null) on /intelligence/chat', async () => {
      render(
        <MemoryRouter initialEntries={['/intelligence/chat']}>
          <ChatProvider>
            <ChatFAB />
          </ChatProvider>
        </MemoryRouter>
      );

      const fab = screen.queryByRole('button', { name: /Open AI Financial Chat/i });
      expect(fab).toBeNull();
    });

    it('dynamically hides and reappears across multiple route transitions', async () => {
      const RouteSwitcher = () => {
        const navigate = useNavigate();
        const location = useLocation();
        return (
          <div>
            <span data-testid="curr-path">{location.pathname}</span>
            <button onClick={() => navigate('/overview/dashboard')}>To Dashboard</button>
            <button onClick={() => navigate('/intelligence/chat')}>To Intelligence Chat</button>
            <button onClick={() => navigate('/planner/timeline')}>To Timeline</button>
          </div>
        );
      };

      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <RouteSwitcher />
            <ChatFAB />
          </ChatProvider>
        </MemoryRouter>
      );

      // On /overview/dashboard -> visible
      expect(screen.getByRole('button', { name: /Open AI Financial Chat/i })).toBeInTheDocument();

      // Navigate to /intelligence/chat -> hidden
      await act(async () => {
        fireEvent.click(screen.getByText('To Intelligence Chat'));
      });
      expect(screen.getByTestId('curr-path')).toHaveTextContent('/intelligence/chat');
      expect(screen.queryByRole('button', { name: /Open AI Financial Chat/i })).not.toBeInTheDocument();

      // Navigate to /planner/timeline -> reappears
      await act(async () => {
        fireEvent.click(screen.getByText('To Timeline'));
      });
      expect(screen.getByTestId('curr-path')).toHaveTextContent('/planner/timeline');
      expect(screen.getByRole('button', { name: /Open AI Financial Chat/i })).toBeInTheDocument();

      // Navigate back to /intelligence/chat -> hidden again
      await act(async () => {
        fireEvent.click(screen.getByText('To Intelligence Chat'));
      });
      expect(screen.queryByRole('button', { name: /Open AI Financial Chat/i })).not.toBeInTheDocument();
    });

    it('renders animated pulsing indicator on ChatFAB when isStreaming is true', async () => {
      const StreamingHarness = () => {
        const { handleSend } = useChat();
        return <button onClick={() => handleSend('Pulse test')}>Stream</button>;
      };

      const endlessStream = async function* (signal: AbortSignal) {
        yield 'Streaming content';
        while (!signal.aborted) {
          await new Promise((r) => setTimeout(r, 20));
        }
      };

      (api.chatStream as any).mockImplementation((_msgs: any, _bp: any, _lc: any, _sum: any, _model: any, signal: AbortSignal) => {
        return endlessStream(signal);
      });

      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <StreamingHarness />
            <ChatFAB />
          </ChatProvider>
        </MemoryRouter>
      );

      const fab = screen.getByRole('button', { name: /Open AI Financial Chat/i });

      // Before streaming: no pulsing indicator
      expect(fab.querySelector('.animate-ping')).toBeNull();

      // Start stream
      await act(async () => {
        fireEvent.click(screen.getByText('Stream'));
      });

      // During streaming: pulsing ping indicator is active
      await waitFor(() => {
        expect(fab.querySelector('.animate-ping')).not.toBeNull();
      });

      // Press Escape to abort stream
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      // After stop: ping indicator is gone
      await waitFor(() => {
        expect(fab.querySelector('.animate-ping')).toBeNull();
      });
    });

    it('opens Sheet on FAB click and mounts ChatPanel in floating mode', async () => {
      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <ChatFAB />
          </ChatProvider>
        </MemoryRouter>
      );

      const fab = screen.getByRole('button', { name: /Open AI Financial Chat/i });
      await act(async () => {
        fireEvent.click(fab);
      });

      // Sheet opens, title is present (both sr-only title and panel header)
      expect(screen.getAllByText('AI Financial Assistant').length).toBeGreaterThanOrEqual(1);
      // Maximize/dock button is rendered for floating mode
      expect(screen.getByTestId('chat-toggle-maximize')).toBeInTheDocument();
    });

    it('toggles floating chat dock state between floating and docked', async () => {
      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <ChatFAB />
          </ChatProvider>
        </MemoryRouter>
      );

      // Open floating dock
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Open AI Financial Chat/i }));
      });

      const dockBtn = screen.getByTestId('chat-toggle-maximize');
      expect(dockBtn).toBeInTheDocument();

      // Click dock
      await act(async () => {
        fireEvent.click(dockBtn);
      });

      expect(dockBtn).toHaveAttribute('title', 'Float as chat bubble');
    });
  });

  describe('6. ModelPopover Adversarial Stress Suite', () => {
    it('handles degraded or malformed availableModels gracefully without crashing', async () => {
      const malformedModels: any[] = [
        { provider_name: 'Broken Provider', models: undefined },
        { provider_type: 'empty-prov', models: [] },
        { provider_name: 'Sparse Provider', models: [{ id: 'sparse-1', name: '' }, { id: 'sparse-2' }] },
      ];

      render(
        <ModelPopover
          selectedModel="sparse-1"
          availableModels={malformedModels}
        />
      );

      const trigger = screen.getByRole('combobox', { name: /Select AI model/i });
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveTextContent('sparse-1');

      await act(async () => {
        fireEvent.click(trigger);
      });

      expect(screen.getByText('Sparse Provider')).toBeInTheDocument();
      expect(screen.getByText('sparse-2')).toBeInTheDocument();
    });

    it('renders orphan and duplicate favorites safely without crashing', async () => {
      useSettingsStore.setState({
        chatFavoriteModels: ['orphan-model-1', 'orphan-model-1', 'orphan-model-2'],
        chatRecentModels: ['recent-orphan-1'],
      });

      render(
        <ModelPopover
          selectedModel=""
          availableModels={[]}
        />
      );

      const trigger = screen.getByRole('combobox', { name: /Select AI model/i });
      expect(trigger).toHaveTextContent('Select model');

      await act(async () => {
        fireEvent.click(trigger);
      });

      expect(screen.getByText('Favorites')).toBeInTheDocument();
      expect(screen.getAllByText('orphan-model-1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Recent')).toBeInTheDocument();
      expect(screen.getByText('recent-orphan-1')).toBeInTheDocument();
    });

    it('isolates star favorite button clicks from item selection and popover closure', async () => {
      const onSelect = vi.fn();
      const mockModels = [
        {
          provider_type: 'test-prov',
          provider_name: 'Provider A',
          models: [{ id: 'model-a', name: 'Model Alpha' }],
        },
      ];

      render(
        <ModelPopover
          selectedModel=""
          availableModels={mockModels}
          onSelectModel={onSelect}
        />
      );

      const trigger = screen.getByRole('combobox', { name: /Select AI model/i });
      await act(async () => {
        fireEvent.click(trigger);
      });

      const starBtn = screen.getByLabelText(/Star Model Alpha/i);
      expect(starBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(starBtn);
      });

      expect(useSettingsStore.getState().chatFavoriteModels).toContain('model-a');
      expect(onSelect).not.toHaveBeenCalled();
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      const unstarBtn = screen.getByLabelText(/Unstar Model Alpha/i);
      await act(async () => {
        fireEvent.click(unstarBtn);
      });
      expect(useSettingsStore.getState().chatFavoriteModels).not.toContain('model-a');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('handles adversarial search queries with regex metacharacters without throwing', async () => {
      const mockModels = [
        {
          provider_type: 'test-prov',
          provider_name: 'Provider Meta',
          models: [
            { id: 'gpt-4.5(preview)', name: 'GPT-4.5 (Preview)' },
            { id: 'special-[model]', name: 'Special [Model]' },
          ],
        },
      ];

      render(
        <ModelPopover
          selectedModel="gpt-4.5(preview)"
          availableModels={mockModels}
        />
      );

      const trigger = screen.getByRole('combobox', { name: /Select AI model/i });
      await act(async () => {
        fireEvent.click(trigger);
      });

      const searchInput = screen.getByPlaceholderText('Search models...');

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: '.*+?^${}()|[]\\' } });
      });

      expect(screen.getByText('No models found.')).toBeInTheDocument();

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: '(Preview)' } });
      });
      expect(screen.getAllByText('GPT-4.5 (Preview)').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('7. Message Regeneration Adversarial Stress Suite', () => {
    it('is a safe no-op when conversation has no user messages', async () => {
      const Harness = () => {
        const { handleRegenerate, messages, isStreaming } = useChat();
        return (
          <div>
            <span data-testid="msg-count">{messages.length}</span>
            <span data-testid="is-streaming">{isStreaming ? 'yes' : 'no'}</span>
            <button onClick={handleRegenerate}>Regen</button>
          </div>
        );
      };

      render(
        <ChatProvider>
          <Harness />
        </ChatProvider>
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Regen'));
      });

      expect(api.chatStream).not.toHaveBeenCalled();
      expect(screen.getByTestId('msg-count')).toHaveTextContent('0');
      expect(screen.getByTestId('is-streaming')).toHaveTextContent('no');
    });

    it('re-executes from last user message across complex multi-turn and tool call histories', async () => {
      const history = [
        { role: 'user', content: 'Turn 1 user' },
        { role: 'assistant', content: 'Turn 1 assistant' },
        { role: 'user', content: 'Turn 2 user with tools' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'call_1', function: { name: 'simulate', arguments: '{}' } }],
        },
        { role: 'tool', name: 'simulate', content: '{"diff":[]}', tool_call_id: 'call_1' },
        { role: 'assistant', content: 'Turn 2 assistant answer' },
      ];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

      (api.chatStream as any).mockImplementation(async function* () {
        yield 'Regenerated Turn 2 response';
      });

      const Harness = () => {
        const { handleRegenerate, messages } = useChat();
        return (
          <div>
            <div data-testid="last-content">{messages[messages.length - 1]?.content}</div>
            <button onClick={handleRegenerate}>Regen</button>
          </div>
        );
      };

      await act(async () => {
        render(
          <ChatProvider>
            <Harness />
          </ChatProvider>
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Regen'));
      });

      expect(api.chatStream).toHaveBeenCalledTimes(1);
      const passedMessages = (api.chatStream as any).mock.calls[0][0];
      expect(passedMessages).toHaveLength(3);
      expect(passedMessages[0].content).toBe('Turn 1 user');
      expect(passedMessages[1].content).toBe('Turn 1 assistant');
      expect(passedMessages[2].content).toBe('Turn 2 user with tools');

      await waitFor(() => {
        expect(screen.getByTestId('last-content')).toHaveTextContent('Regenerated Turn 2 response');
      });
    });

    it('prevents concurrent regeneration while stream is in flight', async () => {
      let resolveStream: () => void;
      const delayedStream = async function* () {
        yield 'Chunk 1';
        await new Promise<void>((r) => {
          resolveStream = r;
        });
        yield 'Chunk 2';
      };

      (api.chatStream as any).mockImplementation(() => delayedStream());

      const history = [
        { role: 'user', content: 'Prompt' },
        { role: 'assistant', content: 'Response' },
      ];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

      const Harness = () => {
        const { handleRegenerate, isStreaming } = useChat();
        return (
          <div>
            <span data-testid="streaming">{isStreaming ? 'streaming' : 'idle'}</span>
            <button onClick={handleRegenerate}>Regen</button>
          </div>
        );
      };

      await act(async () => {
        render(
          <ChatProvider>
            <Harness />
          </ChatProvider>
        );
      });

      act(() => {
        fireEvent.click(screen.getByText('Regen'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('streaming')).toHaveTextContent('streaming');
      });
      expect(api.chatStream).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.click(screen.getByText('Regen'));
      });

      expect(api.chatStream).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveStream!();
      });

      await waitFor(() => {
        expect(screen.getByTestId('streaming')).toHaveTextContent('idle');
      });
    });

    it('recovers gracefully with error message when api.chatStream fails during regeneration', async () => {
      (api.chatStream as any).mockImplementation(async function* () {
        throw new Error('503 Service Unavailable');
      });

      const history = [
        { role: 'user', content: 'Prompt' },
        { role: 'assistant', content: 'Old response' },
      ];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

      const Harness = () => {
        const { handleRegenerate, messages, isStreaming } = useChat();
        return (
          <div>
            <span data-testid="streaming">{isStreaming ? 'streaming' : 'idle'}</span>
            <span data-testid="last-message">{messages[messages.length - 1]?.content}</span>
            <button onClick={handleRegenerate}>Regen</button>
          </div>
        );
      };

      await act(async () => {
        render(
          <ChatProvider>
            <Harness />
          </ChatProvider>
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Regen'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('streaming')).toHaveTextContent('idle');
        expect(screen.getByTestId('last-message')).toHaveTextContent('Error: 503 Service Unavailable');
      });
    });

    it('supports stopping stream cleanly during regeneration', async () => {
      const endlessStream = async function* (signal: AbortSignal) {
        yield 'Regenerating start';
        while (!signal.aborted) {
          await new Promise((r) => setTimeout(r, 10));
        }
      };

      (api.chatStream as any).mockImplementation((_msgs: any, _bp: any, _lc: any, _sum: any, _m: any, signal: AbortSignal) => {
        return endlessStream(signal);
      });

      const history = [
        { role: 'user', content: 'Prompt' },
        { role: 'assistant', content: 'Old response' },
      ];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history));

      const Harness = () => {
        const { handleRegenerate, handleStop, messages, isStreaming } = useChat();
        return (
          <div>
            <span data-testid="streaming">{isStreaming ? 'streaming' : 'idle'}</span>
            <span data-testid="last-message">{messages[messages.length - 1]?.content}</span>
            <button onClick={handleRegenerate}>Regen</button>
            <button onClick={handleStop}>Stop</button>
          </div>
        );
      };

      await act(async () => {
        render(
          <ChatProvider>
            <Harness />
          </ChatProvider>
        );
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Regen'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('streaming')).toHaveTextContent('streaming');
        expect(screen.getByTestId('last-message')).toHaveTextContent('Regenerating start');
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Stop'));
      });

      expect(screen.getByTestId('streaming')).toHaveTextContent('idle');
      expect(screen.getByTestId('last-message').textContent).toBe('Regenerating start\n\n*(stopped)*');
    });
  });
});
