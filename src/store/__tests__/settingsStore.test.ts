import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../useSettingsStore';

describe('useSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset store state
    useSettingsStore.setState({
      chatModel: '',
      chatRecentModels: [],
      showTokenUsage: false,
    });
  });

  it('setChatModel writes to state and localStorage', () => {
    const store = useSettingsStore.getState();
    store.setChatModel('test-model-1');
    
    expect(useSettingsStore.getState().chatModel).toBe('test-model-1');
    
    const saved = JSON.parse(localStorage.getItem('payday_settings') || '{}');
    expect(saved.chatModel).toBe('test-model-1');
  });

  it('addRecentChatModel maintains a capped list (max 5 unique)', () => {
    const store = useSettingsStore.getState();
    store.addRecentChatModel('model1');
    store.addRecentChatModel('model2');
    store.addRecentChatModel('model3');
    store.addRecentChatModel('model4');
    store.addRecentChatModel('model5');
    store.addRecentChatModel('model6');
    
    expect(useSettingsStore.getState().chatRecentModels).toEqual([
      'model6', 'model5', 'model4', 'model3', 'model2'
    ]);

    // Test unique
    store.addRecentChatModel('model4');
    expect(useSettingsStore.getState().chatRecentModels).toEqual([
      'model4', 'model6', 'model5', 'model3', 'model2'
    ]);
  });

  it('setShowTokenUsage toggles the boolean', () => {
    const store = useSettingsStore.getState();
    expect(store.showTokenUsage).toBe(false);
    
    store.setShowTokenUsage(true);
    expect(useSettingsStore.getState().showTokenUsage).toBe(true);
    
    store.setShowTokenUsage(false);
    expect(useSettingsStore.getState().showTokenUsage).toBe(false);
  });
});
