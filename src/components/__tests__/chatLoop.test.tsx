// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatPanel } from '../ChatPanel';
import { api } from '../../lib/apiClient';

vi.mock('../../lib/apiClient', () => ({
  api: {
    getProvider: vi.fn().mockResolvedValue({ provider: 'test' }),
    getModels: vi.fn().mockResolvedValue([{ provider: 'test', models: ['test-model'] }]),
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
    getBlueprintJson: vi.fn().mockReturnValue('{}')
  })
}));

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = function() {};

// Mock IntersectionObserver
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(element: Element) {
    this.callback([{ isIntersecting: true, target: element } as any], this as any);
  }
  unobserve() {}
  disconnect() {}
}
(window as any).IntersectionObserver = MockIntersectionObserver;

describe('ChatPanel Tool Loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('simulate -> simulate -> propose ends the loop', async () => {
    // Setup the mock stream to yield simulate, then simulate, then propose.
    // The stream is called multiple times because ChatPanel calls api.chatStream recursively.

    const simulateResponse = async function* () {
      yield { type: 'tool_call', tool_call: { function: { name: 'simulate', arguments: '{"changes":[]}' } } };
    };

    const proposeResponse = async function* () {
      yield { type: 'tool_call', tool_call: { function: { name: 'propose_blueprint_changes', arguments: '{"changes":[]}' } } };
    };

    const finalResponse = async function* () {
      yield 'All done.';
    };

    (api.chatStream as any)
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(proposeResponse())
      .mockReturnValueOnce(finalResponse());

    render(<ChatPanel />);

    const input = screen.getByPlaceholderText(/E\.g\./i);
    fireEvent.change(input, { target: { value: 'Do something' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });

    // Wait for "All done." text to appear
    await waitFor(() => {
      expect(screen.getByText('All done.')).toBeInTheDocument();
    }, { timeout: 3000 });

    // api.chatStream should have been called 3 times (since the propose ends the immediate scratchpad loop, wait, does propose end the loop?)
    // Let's check how many times it was called. 
    // simulate -> triggers turn 2
    // simulate -> triggers turn 3
    // propose -> DOES NOT trigger turn automatically, it just displays it.
    expect(api.chatStream).toHaveBeenCalledTimes(3);
  });

  it('6th simulate is refused', async () => {
    const simulateResponse = async function* () {
      yield { type: 'tool_call', tool_call: { function: { name: 'simulate', arguments: '{"changes":[]}' } } };
    };

    (api.chatStream as any)
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse())
      .mockReturnValueOnce(simulateResponse());

    render(<ChatPanel />);

    const input = screen.getByPlaceholderText(/E\.g\./i);
    fireEvent.change(input, { target: { value: 'Go crazy' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });

    // Should render "[Error: Max tool calls exceeded]"
    await waitFor(() => {
      expect(screen.getByText(/Max tool calls exceeded/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    // Should only be called 6 times because depth 0 to 5 = 6 calls, but at depth > 5 it refuses before calling API.
    // Wait, let's look at `depth > 5`:
    // Initial call: depth = 0
    // 1st simulate -> depth = 1
    // 2nd simulate -> depth = 2
    // 3rd simulate -> depth = 3
    // 4th simulate -> depth = 4
    // 5th simulate -> depth = 5
    // 6th simulate -> depth = 6 -> returns Error before API call
    expect(api.chatStream).toHaveBeenCalledTimes(6);
  });
});
