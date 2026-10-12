import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FloatingChatDock } from '../FloatingChatDock';
import {
  clampDimensions,
  computeBounds,
  useFloatingDimensions,
} from '@/hooks/useFloatingDimensions';
import { renderHook } from '@testing-library/react';

vi.mock('@/components/ChatPanel', () => ({
  ChatPanel: (props: any) => (
    <div data-testid="mock-chat-panel">
      <input data-testid="mock-chat-input" />
      <button onClick={props.onClose}>close-chat</button>
    </div>
  ),
}));

function setup(isOpen = true, isStreaming = false) {
  const onOpenChange = vi.fn();
  const stopStreaming = vi.fn();
  render(
    <MemoryRouter>
      <button data-testid="page-button">page</button>
      <input data-testid="page-input" />
      <FloatingChatDock
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isStreaming={isStreaming}
        stopStreaming={stopStreaming}
      />
    </MemoryRouter>
  );
  return { onOpenChange, stopStreaming };
}

describe('FloatingChatDock (non-modal)', () => {
  beforeEach(() => localStorage.clear());

  it('renders no backdrop and does not close on outside click', () => {
    const { onOpenChange } = setup();
    expect(screen.getByTestId('floating-chat-window')).toHaveAttribute('aria-modal', 'false');
    expect(screen.getByTestId('floating-chat-ring').className).toContain('pointer-events-none');
    fireEvent.pointerDown(screen.getByTestId('page-button'));
    fireEvent.click(screen.getByTestId('page-button'));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('mock-chat-panel')).toBeInTheDocument();
  });

  it('Escape inside chat while idle closes it', () => {
    const { onOpenChange } = setup();
    screen.getByTestId('mock-chat-input').focus();
    fireEvent.keyDown(screen.getByTestId('mock-chat-input'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Escape inside chat while streaming stops generation and keeps window open', () => {
    const { onOpenChange, stopStreaming } = setup(true, true);
    screen.getByTestId('mock-chat-input').focus();
    fireEvent.keyDown(screen.getByTestId('mock-chat-input'), { key: 'Escape' });
    expect(stopStreaming).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('Escape outside the chat does not affect it', () => {
    const { onOpenChange, stopStreaming } = setup(true, true);
    screen.getByTestId('page-input').focus();
    fireEvent.keyDown(screen.getByTestId('page-input'), { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(stopStreaming).not.toHaveBeenCalled();
  });

  it('shows the FAB (and no window) when closed', () => {
    const { onOpenChange } = setup(false);
    expect(screen.queryByTestId('floating-chat-window')).toBeNull();
    fireEvent.click(screen.getByLabelText('Open AI Financial Chat'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('renders resize handles on desktop', () => {
    setup();
    expect(screen.getByTestId('resize-handle-left')).toBeInTheDocument();
    expect(screen.getByTestId('resize-handle-top')).toBeInTheDocument();
    expect(screen.getByTestId('resize-handle-top-left')).toBeInTheDocument();
  });
});

describe('useFloatingDimensions', () => {
  beforeEach(() => localStorage.clear());

  it('clamps to viewport bounds', () => {
    expect(clampDimensions(5000, 5000, 1440, 900)).toEqual({ width: 840, height: 800 });
    expect(clampDimensions(10, 10, 1440, 900)).toEqual({ width: 360, height: 420 });
    expect(computeBounds(320, 700).maxWidth).toBeLessThanOrEqual(304);
  });

  it('resizes from the top-left by pointer delta and persists on release', () => {
    const { result } = renderHook(() => useFloatingDimensions(480, 600));
    const w0 = result.current.width;
    const h0 = result.current.height;
    act(() => result.current.startResize('top-left', 500, 500));
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 450, clientY: 470 }));
    });
    // jsdom lacks PointerEvent; MouseEvent type 'pointermove' still carries clientX/Y
    expect(result.current.width).toBe(w0 + 50);
    expect(result.current.height).toBe(h0 + 30);
    act(() => {
      window.dispatchEvent(new Event('pointerup'));
    });
    expect(result.current.isDraggingOrResizing).toBe(false);
    expect(JSON.parse(localStorage.getItem('payday_chat_floating_dimensions')!)).toEqual({
      width: w0 + 50,
      height: h0 + 30,
    });
  });
});
