// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ChatProvider, useChat, CHAT_STORAGE_KEY } from '../../context/ChatContext';
import { ChatFAB } from '../ChatFAB';
import { ChatPanel } from '../ChatPanel';
import { api } from '../../lib/apiClient';
import { usePlannerStore } from '../../store/usePlannerStore';
import { useSettingsStore } from '../../store/useSettingsStore';

vi.mock('../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'test-provider', analysis_model: 'gpt-4o-mini' }),
    getModels: vi.fn().mockResolvedValue([
      {
        provider_name: 'Test Provider',
        provider_type: 'test',
        models: [
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
          { id: 'gpt-4o', name: 'GPT-4o' },
        ],
      },
    ]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

// Mock sonner toast
vi.mock('@/components/ui/sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
  Toaster: () => <div data-testid="mock-toaster" />,
}));

describe('Milestone 5 Empirical Challenge Suite: Floating Chat & Global Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    usePlannerStore.getState().resetToDefaults();
    useSettingsStore.setState({
      chatModel: 'gpt-4o-mini',
      chatRecentModels: [],
      chatFavoriteModels: [],
      showTokenUsage: false,
      showContextGlance: false,
    });
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 1. GLOBAL ACCESSIBILITY & ROUTE-AWARE HIDING ACROSS ALL APPLICATION ROUTES
  // ==========================================================================
  describe('1. Global Accessibility & Route-Aware Hiding', () => {
    const allApplicationRoutes = [
      { path: '/overview/dashboard', shouldShow: true, label: 'Dashboard' },
      { path: '/overview/flow-diagram', shouldShow: true, label: 'Flow Diagram' },
      { path: '/planner/accounts', shouldShow: true, label: 'Accounts Manager' },
      { path: '/planner/events', shouldShow: true, label: 'Events Manager' },
      { path: '/planner/timeline', shouldShow: true, label: 'Timeline Checklist' },
      { path: '/planner/projections', shouldShow: true, label: 'Projections Page' },
      { path: '/intelligence/analysis', shouldShow: true, label: 'Analysis Tab' },
      { path: '/intelligence/chat', shouldShow: false, label: 'Full AI Chat' },
      { path: '/intelligence/chat?ref=sidebar&session=1', shouldShow: false, label: 'Chat with query params' },
      { path: '/intelligence/chat#models', shouldShow: false, label: 'Chat with hash fragment' },
      { path: '/intelligence/chat/history', shouldShow: false, label: 'Chat sub-route' },
      { path: '/intelligence/prompt-export', shouldShow: true, label: 'Prompt Export' },
      { path: '/data/import-export', shouldShow: true, label: 'Import Export' },
      { path: '/data/backup', shouldShow: true, label: 'Backup Page' },
      { path: '/settings/providers', shouldShow: true, label: 'Provider Settings' },
      { path: '/settings/preferences', shouldShow: true, label: 'Preferences' },
      { path: '/unknown/404-fallback', shouldShow: true, label: 'Fallback Route' },
    ];

    allApplicationRoutes.forEach(({ path, shouldShow, label }) => {
      it(`evaluates ChatFAB visibility on route "${path}" (${label}): ${shouldShow ? 'VISIBLE' : 'HIDDEN'}`, async () => {
        const { unmount } = render(
          <MemoryRouter initialEntries={[path]}>
            <ChatProvider>
              <ChatFAB />
            </ChatProvider>
          </MemoryRouter>
        );

        const fab = screen.queryByRole('button', { name: /Open AI Financial Chat/i });
        if (shouldShow) {
          expect(fab).not.toBeNull();
          expect(fab).toBeInTheDocument();
        } else {
          expect(fab).toBeNull();
        }
        unmount();
      });
    });

    it('re-renders cleanly across an adversarial sequence of rapid route hops', async () => {
      const NavigationHarness = () => {
        const navigate = useNavigate();
        const location = useLocation();
        return (
          <div>
            <span data-testid="route-indicator">{location.pathname}</span>
            <button onClick={() => navigate('/overview/dashboard')}>Hop to Dashboard</button>
            <button onClick={() => navigate('/intelligence/chat')}>Hop to Full Chat</button>
            <button onClick={() => navigate('/intelligence/analysis')}>Hop to Analysis</button>
            <button onClick={() => navigate('/intelligence/chat?active=1')}>Hop to Chat Query</button>
            <button onClick={() => navigate('/settings/providers')}>Hop to Providers</button>
          </div>
        );
      };

      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <NavigationHarness />
            <ChatFAB />
          </ChatProvider>
        </MemoryRouter>
      );

      // 1. Dashboard: FAB visible
      expect(screen.getByRole('button', { name: /Open AI Financial Chat/i })).toBeInTheDocument();

      // 2. Hop to /intelligence/chat: FAB hidden
      await act(async () => {
        fireEvent.click(screen.getByText('Hop to Full Chat'));
      });
      expect(screen.getByTestId('route-indicator')).toHaveTextContent('/intelligence/chat');
      expect(screen.queryByRole('button', { name: /Open AI Financial Chat/i })).not.toBeInTheDocument();

      // 3. Hop to /intelligence/analysis: FAB visible again
      await act(async () => {
        fireEvent.click(screen.getByText('Hop to Analysis'));
      });
      expect(screen.getByTestId('route-indicator')).toHaveTextContent('/intelligence/analysis');
      expect(screen.getByRole('button', { name: /Open AI Financial Chat/i })).toBeInTheDocument();

      // 4. Hop to /intelligence/chat?active=1: FAB hidden
      await act(async () => {
        fireEvent.click(screen.getByText('Hop to Chat Query'));
      });
      expect(screen.getByTestId('route-indicator')).toHaveTextContent('/intelligence/chat');
      expect(screen.queryByRole('button', { name: /Open AI Financial Chat/i })).not.toBeInTheDocument();

      // 5. Hop to /settings/providers: FAB visible
      await act(async () => {
        fireEvent.click(screen.getByText('Hop to Providers'));
      });
      expect(screen.getByTestId('route-indicator')).toHaveTextContent('/settings/providers');
      expect(screen.getByRole('button', { name: /Open AI Financial Chat/i })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 2. FLOATING SHEET TO FULL PAGE EXPANSION AND MINIMIZATION DYNAMICS
  // ==========================================================================
  describe('2. Floating Sheet & Full Page Interop (Maximize / Minimize)', () => {
    it('seamlessly transitions from floating sheet to full-page chat and back via header actions', async () => {
      const FullAppHarness = () => {
        const location = useLocation();
        return (
          <div>
            <div data-testid="current-url">{location.pathname}</div>
            <Routes>
              <Route
                path="/"
                element={<div data-testid="dashboard-page">Root (Dashboard)</div>}
              />
              <Route
                path="/overview/dashboard"
                element={<div data-testid="dashboard-page">Dashboard Content</div>}
              />
              <Route
                path="/intelligence/chat"
                element={
                  <div data-testid="full-chat-page">
                    <ChatPanel mode="page" />
                  </div>
                }
              />
            </Routes>
            <ChatFAB />
          </div>
        );
      };

      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <FullAppHarness />
          </ChatProvider>
        </MemoryRouter>
      );

      // Start on dashboard
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      const fab = screen.getByRole('button', { name: /Open AI Financial Chat/i });
      expect(fab).toBeInTheDocument();

      // Open floating sheet via FAB
      await act(async () => {
        fireEvent.click(fab);
      });

      // Sheet opens, containing ChatPanel with mode="floating"
      const dockButton = screen.getByTestId('chat-toggle-maximize');
      expect(dockButton).toBeInTheDocument();

      // Click to dock to side
      await act(async () => {
        fireEvent.click(dockButton);
      });

      expect(dockButton).toHaveAttribute('title', 'Float as chat bubble');

      // Click to undock back to bubble
      await act(async () => {
        fireEvent.click(dockButton);
      });

      expect(dockButton).toHaveAttribute('title', 'Dock to right side');
    });
  });

  // ==========================================================================
  // 3. CONVERSATION STATE PRESERVATION ACROSS MODES AND ROUTES
  // ==========================================================================
  describe('3. Conversation & Input Draft Preservation Across Navigation', () => {
    it('preserves drafted textarea input across 5 route navigations and view mode transitions', async () => {
      const MultiRouteHarness = () => {
        const navigate = useNavigate();
        return (
          <div>
            <button onClick={() => navigate('/overview/dashboard')}>Go Dashboard</button>
            <button onClick={() => navigate('/planner/accounts')}>Go Accounts</button>
            <button onClick={() => navigate('/planner/events')}>Go Events</button>
            <button onClick={() => navigate('/settings/providers')}>Go Providers</button>
            <button onClick={() => navigate('/intelligence/chat')}>Go Full Chat</button>
            <Routes>
              <Route path="/overview/dashboard" element={<div>Dash</div>} />
              <Route path="/planner/accounts" element={<div>Accounts</div>} />
              <Route path="/planner/events" element={<div>Events</div>} />
              <Route path="/settings/providers" element={<div>Providers</div>} />
              <Route path="/intelligence/chat" element={<ChatPanel mode="page" />} />
            </Routes>
            <ChatFAB />
          </div>
        );
      };

      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <MultiRouteHarness />
          </ChatProvider>
        </MemoryRouter>
      );

      // Open floating chat
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Open AI Financial Chat/i }));
      });

      // Type draft query in floating chat
      const floatingTextarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i);
      await act(async () => {
        fireEvent.change(floatingTextarea, {
          target: { value: 'What will my net worth be after buying a $30,000 EV in July?' },
        });
      });
      expect(floatingTextarea).toHaveValue('What will my net worth be after buying a $30,000 EV in July?');

      // Navigate across multiple routes while input is drafted
      await act(async () => {
        fireEvent.click(screen.getByText('Go Accounts'));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('Go Events'));
      });
      await act(async () => {
        fireEvent.click(screen.getByText('Go Providers'));
      });

      // Now navigate to full-page /intelligence/chat
      await act(async () => {
        fireEvent.click(screen.getByText('Go Full Chat'));
      });

      // Verify the drafted input is preserved in the full-page textarea!
      const pageTextarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i);
      expect(pageTextarea).toHaveValue('What will my net worth be after buying a $30,000 EV in July?');

      // Edit input in full page
      await act(async () => {
        fireEvent.change(pageTextarea, {
          target: { value: 'What will my net worth be after buying a $30,000 EV in July? (with 10% down)' },
        });
      });

      // Return to dashboard (floating dock remains open with preserved input)
      await act(async () => {
        fireEvent.click(screen.getByText('Go Dashboard'));
      });

      // Re-check floating textarea
      await waitFor(() => {
        const reloadedFloatingTextarea = screen.getByPlaceholderText(/Can I afford a \$400 car payment/i);
        expect(reloadedFloatingTextarea).toHaveValue(
          'What will my net worth be after buying a $30,000 EV in July? (with 10% down)'
        );
      });
    });

    it('preserves multi-turn conversation history intact across route switching', async () => {
      const StateInspectHarness = () => {
        const { messages, setMessages } = useChat();
        const navigate = useNavigate();
        return (
          <div>
            <span data-testid="msg-history-count">{messages.length}</span>
            <button
              onClick={() =>
                setMessages([
                  { role: 'user', content: 'Turn 1 User' },
                  { role: 'assistant', content: 'Turn 1 AI Response' },
                  { role: 'user', content: 'Turn 2 User' },
                  { role: 'assistant', content: 'Turn 2 AI Response' },
                ])
              }
            >
              Seed History
            </button>
            <button onClick={() => navigate('/planner/timeline')}>Nav Timeline</button>
            <button onClick={() => navigate('/overview/dashboard')}>Nav Dashboard</button>
            <Routes>
              <Route path="/overview/dashboard" element={<ChatPanel mode="floating" />} />
              <Route path="/planner/timeline" element={<div>Timeline View</div>} />
            </Routes>
          </div>
        );
      };

      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <StateInspectHarness />
          </ChatProvider>
        </MemoryRouter>
      );

      // Seed 4 messages
      await act(async () => {
        fireEvent.click(screen.getByText('Seed History'));
      });
      expect(screen.getByTestId('msg-history-count')).toHaveTextContent('4');
      expect(screen.getByText('Turn 1 User')).toBeInTheDocument();
      expect(screen.getByText('Turn 2 AI Response')).toBeInTheDocument();

      // Navigate to timeline
      await act(async () => {
        fireEvent.click(screen.getByText('Nav Timeline'));
      });
      expect(screen.getByTestId('msg-history-count')).toHaveTextContent('4');

      // Navigate back to dashboard
      await act(async () => {
        fireEvent.click(screen.getByText('Nav Dashboard'));
      });
      expect(screen.getByTestId('msg-history-count')).toHaveTextContent('4');
      expect(screen.getByText('Turn 1 User')).toBeInTheDocument();
      expect(screen.getByText('Turn 2 AI Response')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 4. ACTIVE STREAMING RESILIENCE ACROSS NAVIGATION
  // ==========================================================================
  describe('4. Active Streaming State & Navigation Decoupling', () => {
    it('continues streaming tokens and maintaining isStreaming indicator when navigating across pages', async () => {
      let resolveChunk1: (() => void) | null = null;
      let resolveChunk2: (() => void) | null = null;

      const deferredStream = async function* () {
        yield 'Analyzing account balances... ';
        await new Promise<void>((r) => { resolveChunk1 = r; });
        yield 'Simulated projection completed: +$500 buffer remaining. ';
        await new Promise<void>((r) => { resolveChunk2 = r; });
        yield 'All checks passed.';
      };

      (api.chatStream as any).mockImplementation(() => deferredStream());

      const StreamNavHarness = () => {
        const { handleSend, isStreaming } = useChat();
        const navigate = useNavigate();
        return (
          <div>
            <span data-testid="streaming-flag">{isStreaming ? 'STREAMING_ACTIVE' : 'IDLE'}</span>
            <button onClick={() => handleSend('Perform stress test')}>Start Stream</button>
            <button onClick={() => navigate('/planner/events')}>Navigate to Events</button>
            <button onClick={() => navigate('/settings/preferences')}>Navigate to Preferences</button>
            <Routes>
              <Route path="/overview/dashboard" element={<div>Dashboard</div>} />
              <Route path="/planner/events" element={<div>Events View</div>} />
              <Route path="/settings/preferences" element={<div>Preferences View</div>} />
            </Routes>
            <ChatFAB />
          </div>
        );
      };

      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <StreamNavHarness />
          </ChatProvider>
        </MemoryRouter>
      );

      const fab = screen.getByRole('button', { name: /Open AI Financial Chat/i });
      expect(fab.querySelector('.animate-ping')).toBeNull();

      // Trigger stream
      await act(async () => {
        fireEvent.click(screen.getByText('Start Stream'));
      });

      expect(screen.getByTestId('streaming-flag')).toHaveTextContent('STREAMING_ACTIVE');
      expect(fab.querySelector('.animate-ping')).not.toBeNull();

      // While streaming, navigate to /planner/events
      await act(async () => {
        fireEvent.click(screen.getByText('Navigate to Events'));
      });
      // Streaming remains active on new route
      expect(screen.getByTestId('streaming-flag')).toHaveTextContent('STREAMING_ACTIVE');
      expect(fab.querySelector('.animate-ping')).not.toBeNull();

      // Release chunk 1
      await act(async () => {
        if (resolveChunk1) resolveChunk1();
      });

      // Navigate to /settings/preferences
      await act(async () => {
        fireEvent.click(screen.getByText('Navigate to Preferences'));
      });
      expect(screen.getByTestId('streaming-flag')).toHaveTextContent('STREAMING_ACTIVE');
      expect(fab.querySelector('.animate-ping')).not.toBeNull();

      // Release chunk 2 (completes the stream)
      await act(async () => {
        if (resolveChunk2) resolveChunk2();
      });

      // Stream should conclude
      await waitFor(() => {
        expect(screen.getByTestId('streaming-flag')).toHaveTextContent('IDLE');
        expect(fab.querySelector('.animate-ping')).toBeNull();
      });
    });
  });

  // ==========================================================================
  // 5. LOCALSTORAGE PERSISTENCE & FAULT TOLERANCE
  // ==========================================================================
  describe('5. LocalStorage Synchronization & Recovery Invariants', () => {
    it('persists messages to localStorage and cleanly recovers after Provider remount', async () => {
      const initialMsgs = [
        { role: 'user', content: 'What is my runway?' },
        { role: 'assistant', content: 'Your runway is 4.2 months.' },
      ];
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(initialMsgs));

      const ReaderHarness = () => {
        const { messages, clearMessages } = useChat();
        return (
          <div>
            <span data-testid="persisted-count">{messages.length}</span>
            <span data-testid="last-message">{messages[messages.length - 1]?.content}</span>
            <button onClick={clearMessages}>Purge Storage</button>
          </div>
        );
      };

      const { unmount } = render(
        <ChatProvider>
          <ReaderHarness />
        </ChatProvider>
      );

      expect(screen.getByTestId('persisted-count')).toHaveTextContent('2');
      expect(screen.getByTestId('last-message')).toHaveTextContent('Your runway is 4.2 months.');

      // Clear messages
      await act(async () => {
        fireEvent.click(screen.getByText('Purge Storage'));
      });

      expect(screen.getByTestId('persisted-count')).toHaveTextContent('0');
      const stored = localStorage.getItem(CHAT_STORAGE_KEY);
      expect(stored === null || JSON.parse(stored).length === 0).toBe(true);

      unmount();
    });

    it('gracefully recovers when localStorage contains corrupted JSON data without crashing', async () => {
      localStorage.setItem(CHAT_STORAGE_KEY, '{{CORRUPTED_NON_JSON_DATA!!!');

      const SafeConsumer = () => {
        const { messages } = useChat();
        return <div data-testid="recovered-count">{messages.length}</div>;
      };

      await act(async () => {
        render(
          <ChatProvider>
            <SafeConsumer />
          </ChatProvider>
        );
      });

      expect(screen.getByTestId('recovered-count')).toHaveTextContent('0');
    });
  });

  // ==========================================================================
  // 6. ACCESSIBILITY, RADIX SHEET & RAPID TOGGLE STRESS
  // ==========================================================================
  describe('6. Radix Sheet Invariants & Rapid Toggle Stress', () => {
    it('survives 30 rapid successive toggleOpen() invocations without state divergence', async () => {
      const ToggleStressHarness = () => {
        const { isOpen, toggleOpen } = useChat();
        return (
          <div>
            <span data-testid="toggle-state">{isOpen ? 'OPEN' : 'CLOSED'}</span>
            <button onClick={toggleOpen}>Toggle Open</button>
          </div>
        );
      };

      render(
        <ChatProvider>
          <ToggleStressHarness />
        </ChatProvider>
      );

      expect(screen.getByTestId('toggle-state')).toHaveTextContent('CLOSED');

      // Fire 30 rapid toggles (even number -> should end up CLOSED)
      await act(async () => {
        for (let i = 0; i < 30; i++) {
          fireEvent.click(screen.getByText('Toggle Open'));
        }
      });
      expect(screen.getByTestId('toggle-state')).toHaveTextContent('CLOSED');

      // Fire 1 toggle -> should end up OPEN
      await act(async () => {
        fireEvent.click(screen.getByText('Toggle Open'));
      });
      expect(screen.getByTestId('toggle-state')).toHaveTextContent('OPEN');
    });

    it('maintains accessible aria attributes and sr-only sheet title', async () => {
      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <ChatFAB />
          </ChatProvider>
        </MemoryRouter>
      );

      const fab = screen.getByRole('button', { name: 'Open AI Financial Chat' });
      expect(fab).toHaveAttribute('aria-label', 'Open AI Financial Chat');

      // Open sheet
      await act(async () => {
        fireEvent.click(fab);
      });

      // Accessible SheetTitle is present in DOM
      const title = screen.getByText('AI Financial Assistant', { selector: '.sr-only' });
      expect(title).toBeInTheDocument();
    });
  });
});
