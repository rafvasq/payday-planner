import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../useSettingsStore';

describe('useSettingsStore — Chat Favorites & Settings Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      chatModel: '',
      chatRecentModels: [],
      chatFavoriteModels: [],
      showTokenUsage: false,
      showContextGlance: false,
    });
  });

  it('adds a model to favorites when toggled for the first time', () => {
    const store = useSettingsStore.getState();

    store.toggleFavoriteChatModel('gemini-2.5-pro');

    const updated = useSettingsStore.getState();
    expect(updated.chatFavoriteModels).toContain('gemini-2.5-pro');
    expect(updated.chatFavoriteModels).toHaveLength(1);

    // Verify localStorage persistence
    const saved = JSON.parse(localStorage.getItem('payday_settings') || '{}');
    expect(saved.chatFavoriteModels).toEqual(['gemini-2.5-pro']);
  });

  it('removes a model from favorites when toggled a second time', () => {
    const store = useSettingsStore.getState();

    // Toggle on
    store.toggleFavoriteChatModel('claude-sonnet-4-20250514');
    expect(useSettingsStore.getState().chatFavoriteModels).toContain('claude-sonnet-4-20250514');

    // Toggle off
    store.toggleFavoriteChatModel('claude-sonnet-4-20250514');
    const updated = useSettingsStore.getState();
    expect(updated.chatFavoriteModels).not.toContain('claude-sonnet-4-20250514');
    expect(updated.chatFavoriteModels).toHaveLength(0);

    // Verify localStorage reflects removal
    const saved = JSON.parse(localStorage.getItem('payday_settings') || '{}');
    expect(saved.chatFavoriteModels).toEqual([]);
  });

  it('maintains distinct favorite models across multiple toggles', () => {
    const store = useSettingsStore.getState();

    store.toggleFavoriteChatModel('model-a');
    store.toggleFavoriteChatModel('model-b');
    store.toggleFavoriteChatModel('model-c');

    expect(useSettingsStore.getState().chatFavoriteModels).toEqual(['model-a', 'model-b', 'model-c']);

    // Remove middle item
    store.toggleFavoriteChatModel('model-b');
    expect(useSettingsStore.getState().chatFavoriteModels).toEqual(['model-a', 'model-c']);

    // Add back
    store.toggleFavoriteChatModel('model-b');
    expect(useSettingsStore.getState().chatFavoriteModels).toEqual(['model-a', 'model-c', 'model-b']);
  });

  it('persists and toggles showContextGlance setting', () => {
    const store = useSettingsStore.getState();
    expect(store.showContextGlance).toBe(false);

    store.setShowContextGlance(true);
    expect(useSettingsStore.getState().showContextGlance).toBe(true);

    const saved = JSON.parse(localStorage.getItem('payday_settings') || '{}');
    expect(saved.showContextGlance).toBe(true);

    store.setShowContextGlance(false);
    expect(useSettingsStore.getState().showContextGlance).toBe(false);
  });
});
