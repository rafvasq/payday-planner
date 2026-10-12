// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatPanel } from '../ChatPanel';
import { api } from '../../lib/apiClient';

vi.mock('../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'test' }),
    getModels: vi.fn().mockResolvedValue([{ provider: 'test', models: [{ id: 'test-model', name: 'Test Model' }] }]),
    chatStream: vi.fn()
  }
}));

vi.mock('../../store/usePlannerStore', () => ({
  usePlannerStore: vi.fn().mockReturnValue({
    accounts: [],
    events: [],
    transactions: [],
    parsedTransactions: [],
    uploadedFiles: [],
    analysisStartDate: null,
    analysisEndDate: null,
    getBlueprintJson: vi.fn().mockReturnValue('{}'),
    applyBlueprintChanges: vi.fn()
  })
}));

vi.mock('../../store/useSettingsStore', () => ({
  useSettingsStore: vi.fn().mockReturnValue({
    chatModel: '',
    setChatModel: vi.fn(),
    showTokenUsage: false,
    setShowTokenUsage: vi.fn()
  })
}));

vi.mock('../../core/tools', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    applyChangesToBlueprint: vi.fn()
  };
});

describe('ChatPanel Tool Loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.chatStream as any).mockReset();
    localStorage.clear();
  });

  it('simulate -> simulate -> propose ends the loop', async () => {
    // Setup the mock stream to yield simulate, then simulate, then propose.
    // The stream is called multiple times because ChatPanel calls api.chatStream recursively.

    const simulateResponse = async function* () {
      yield { type: 'tool_call', tool_call: { id: 'call_123', function: { name: 'simulate', arguments: '{"changes":[]}' } } };
    };

    const proposeResponse = async function* () {
      yield { type: 'tool_call', tool_call: { id: 'call_456', function: { name: 'propose_blueprint_changes', arguments: '{"changes":[]}' } } };
    };

    (api.chatStream as any)
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(proposeResponse());

    render(<ChatPanel />);

    const starterButton = screen.getByText(/Moves this week\?/i);
    fireEvent.click(starterButton);

    // Wait for "Proposed Changes" text to appear
    await waitFor(() => {
      expect(screen.getByText('Proposed Blueprint')).toBeInTheDocument();
    }, { timeout: 3000 });

    // api.chatStream should have been called 3 times 
    expect(api.chatStream).toHaveBeenCalledTimes(3);
  });

  it('6th simulate is refused', async () => {
    const simulateResponse = async function* () {
      yield { type: 'tool_call', tool_call: { id: 'call_789', function: { name: 'simulate', arguments: '{"changes":[]}' } } };
    };

    // Depth progression:
    // depth 0: API call 1 -> simulate -> recurses to depth 1
    // depth 1: API call 2 -> simulate -> recurses to depth 2
    // depth 2: API call 3 -> simulate -> recurses to depth 3
    // depth 3: API call 4 -> simulate -> recurses to depth 4
    // depth 4: API call 5 -> simulate -> recurses to depth 5
    // depth 5: depth >= 5 guard triggers -> returns error without calling api.chatStream
    (api.chatStream as any)
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse());

    render(<ChatPanel />);

    const starterButton = screen.getByText(/Moves this week\?/i);
    fireEvent.click(starterButton);

    // Should render "Error: Max tool calls exceeded"
    await waitFor(() => {
      expect(screen.getByText(/Error: Max tool calls exceeded/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    // api.chatStream was called 5 times (depths 0..4); at depth 5 the guard returned before calling the API
    expect(api.chatStream).toHaveBeenCalledTimes(5);
  });
});
