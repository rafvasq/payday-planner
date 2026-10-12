import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ContextGlanceRibbon } from '../ContextGlanceRibbon';
import { ChatProvider } from '@/context/ChatContext';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useSettingsStore } from '@/store/useSettingsStore';

const renderRibbon = () =>
  render(
    <ChatProvider>
      <ContextGlanceRibbon />
    </ChatProvider>
  );

describe('ContextGlanceRibbon', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.getState().setShowContextGlance(false);
    usePlannerStore.setState({
      accounts: [
        { id: 'a1', name: 'Main Chequing', type: 'chequing', balance: 2000, target_floor: 500 } as any,
      ],
      events: [],
    });
  });

  it('always renders the peek rail; flyout (context-glance-bar) only when expanded', () => {
    renderRibbon();
    expect(screen.getByTestId('context-glance-ribbon')).toBeInTheDocument();
    expect(screen.queryByTestId('context-glance-bar')).toBeNull();
    fireEvent.click(screen.getByTestId('context-glance-rail-toggle'));
    expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('context-glance-rail-toggle'));
    expect(screen.queryByTestId('context-glance-bar')).toBeNull();
  });

  it('Alt+G toggles the flyout', () => {
    renderRibbon();
    fireEvent.keyDown(window, { key: 'g', altKey: true });
    expect(screen.getByTestId('context-glance-bar')).toBeInTheDocument();
  });

  it('reacts to store updates and shows floor breach on the rail', () => {
    renderRibbon();
    expect(screen.queryByTestId('glance-rail-breach')).toBeNull();
    act(() => {
      usePlannerStore.setState({
        accounts: [
          { id: 'a1', name: 'Main Chequing', type: 'chequing', balance: 100, target_floor: 500 } as any,
        ],
      });
    });
    expect(screen.getByTestId('glance-rail-breach')).toBeInTheDocument();
  });

  it('suggestion chips in the flyout inject prompts into chat input', () => {
    renderRibbon();
    fireEvent.click(screen.getByTestId('context-glance-rail-toggle'));
    const chip = screen.getAllByTestId('glance-account-chip')[0];
    expect(chip).toBeInTheDocument();
    fireEvent.click(chip);
  });
});
