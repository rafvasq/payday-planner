import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ChatProvider, useChat } from '../../context/ChatContext';
import { ChatFAB } from '../ChatFAB';

vi.mock('../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'test' }),
    getModels: vi.fn().mockResolvedValue([{ provider: 'test', models: [{ id: 'test-model', name: 'Test Model' }] }]),
    chatStream: vi.fn(),
  },
  logToServer: vi.fn(),
}));

vi.mock('../ChatPanel', () => ({
  ChatPanel: ({ mode }: { mode?: string }) => (
    <div data-testid="chat-panel" data-mode={mode}>
      Mocked Chat Panel ({mode})
    </div>
  ),
}));

describe('ChatContext & ChatProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('throws an error if useChat is accessed outside of ChatProvider', () => {
    const TestComponent = () => {
      useChat();
      return <div>Inside</div>;
    };

    // Suppress console.error during expected throw
    const originalError = console.error;
    console.error = vi.fn();

    expect(() => render(<TestComponent />)).toThrow(
      'useChat must be used within a ChatProvider'
    );

    console.error = originalError;
  });

  it('provides initial chat state and supports input and message operations', async () => {
    const Consumer = () => {
      const { messages, input, setInput, setMessages, clearMessages, isOpen, toggleOpen } = useChat();
      return (
        <div>
          <span data-testid="msg-count">{messages.length}</span>
          <span data-testid="input-val">{input}</span>
          <span data-testid="open-state">{isOpen ? 'open' : 'closed'}</span>
          <button onClick={() => setInput('Hello AI')}>Set Input</button>
          <button onClick={() => setMessages([{ role: 'user', content: 'Test prompt' }])}>
            Add Message
          </button>
          <button onClick={clearMessages}>Clear</button>
          <button onClick={toggleOpen}>Toggle</button>
        </div>
      );
    };

    await act(async () => {
      render(
        <ChatProvider>
          <Consumer />
        </ChatProvider>
      );
    });

    expect(screen.getByTestId('msg-count')).toHaveTextContent('0');
    expect(screen.getByTestId('input-val')).toHaveTextContent('');
    expect(screen.getByTestId('open-state')).toHaveTextContent('closed');

    // Update input
    await act(async () => {
      fireEvent.click(screen.getByText('Set Input'));
    });
    expect(screen.getByTestId('input-val')).toHaveTextContent('Hello AI');

    // Add message
    await act(async () => {
      fireEvent.click(screen.getByText('Add Message'));
    });
    expect(screen.getByTestId('msg-count')).toHaveTextContent('1');

    // Toggle open
    await act(async () => {
      fireEvent.click(screen.getByText('Toggle'));
    });
    expect(screen.getByTestId('open-state')).toHaveTextContent('open');

    // Clear messages
    await act(async () => {
      fireEvent.click(screen.getByText('Clear'));
    });
    expect(screen.getByTestId('msg-count')).toHaveTextContent('0');
  });

  it('preserves conversation and input across route transitions', async () => {
    const DashboardPage = () => {
      const { input, setInput, messages, setMessages } = useChat();
      const navigate = useNavigate();
      return (
        <div>
          <h1>Dashboard Page</h1>
          <span data-testid="dash-input">{input}</span>
          <span data-testid="dash-messages">{messages.length}</span>
          <button onClick={() => setInput('Active prompt')}>Type Prompt</button>
          <button onClick={() => setMessages([{ role: 'user', content: 'Saved query' }])}>
            Send
          </button>
          <button onClick={() => navigate('/planner/accounts')}>Go to Accounts</button>
        </div>
      );
    };

    const AccountsPage = () => {
      const { input, messages } = useChat();
      const navigate = useNavigate();
      return (
        <div>
          <h1>Accounts Page</h1>
          <span data-testid="acc-input">{input}</span>
          <span data-testid="acc-messages">{messages.length}</span>
          <button onClick={() => navigate('/')}>Back to Dashboard</button>
        </div>
      );
    };

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <ChatProvider>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/planner/accounts" element={<AccountsPage />} />
            </Routes>
          </ChatProvider>
        </MemoryRouter>
      );
    });

    // Initial state on dashboard
    expect(screen.getByTestId('dash-input')).toHaveTextContent('');
    expect(screen.getByTestId('dash-messages')).toHaveTextContent('0');

    // Mutate state in chat
    await act(async () => {
      fireEvent.click(screen.getByText('Type Prompt'));
      fireEvent.click(screen.getByText('Send'));
    });
    expect(screen.getByTestId('dash-input')).toHaveTextContent('Active prompt');
    expect(screen.getByTestId('dash-messages')).toHaveTextContent('1');

    // Navigate to accounts page
    await act(async () => {
      fireEvent.click(screen.getByText('Go to Accounts'));
    });

    // Check accounts page mounts and preserves chat state
    expect(screen.getByText('Accounts Page')).toBeInTheDocument();
    expect(screen.getByTestId('acc-input')).toHaveTextContent('Active prompt');
    expect(screen.getByTestId('acc-messages')).toHaveTextContent('1');
  });
});

describe('ChatFAB Route Visibility & Sheet Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders ChatFAB on standard routes and toggles floating sheet', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <ChatFAB />
          </ChatProvider>
        </MemoryRouter>
      );
    });

    const fabButton = screen.getByRole('button', { name: /Open AI Financial Chat/i });
    expect(fabButton).toBeInTheDocument();

    // Click FAB to open floating sheet
    await act(async () => {
      fireEvent.click(fabButton);
    });

    // Mocked panel is rendered
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    expect(screen.getByTestId('chat-panel')).toHaveAttribute('data-mode', 'floating');
  });

  it('automatically hides ChatFAB when navigating to /intelligence/chat', async () => {
    const NavigationTester = () => {
      const navigate = useNavigate();
      return (
        <div>
          <button onClick={() => navigate('/intelligence/chat')}>Go to Full Chat</button>
          <button onClick={() => navigate('/overview/dashboard')}>Go to Dashboard</button>
        </div>
      );
    };

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/overview/dashboard']}>
          <ChatProvider>
            <NavigationTester />
            <ChatFAB />
          </ChatProvider>
        </MemoryRouter>
      );
    });

    // FAB is visible on dashboard
    expect(screen.getByRole('button', { name: /Open AI Financial Chat/i })).toBeInTheDocument();

    // Navigate to full-page chat route
    await act(async () => {
      fireEvent.click(screen.getByText('Go to Full Chat'));
    });

    // FAB should now be null/hidden
    expect(screen.queryByRole('button', { name: /Open AI Financial Chat/i })).not.toBeInTheDocument();

    // Navigate back to dashboard
    await act(async () => {
      fireEvent.click(screen.getByText('Go to Dashboard'));
    });

    // FAB reappears
    expect(screen.getByRole('button', { name: /Open AI Financial Chat/i })).toBeInTheDocument();
  });
});
