with open('c:/Users/Rafael/workspace/repos/payday-planner/src/store/useSettingsStore.ts', 'r') as f:
    content = f.read()

# Update interface
content = content.replace(
    '  activeProvider: () => ProviderConfig | null;\n}',
    '  activeProvider: () => ProviderConfig | null;\n\n  /* Chat Settings */\n  chatModel?: string;\n  chatRecentModels?: string[];\n  showTokenUsage?: boolean;\n  setChatModel: (model: string) => void;\n  addRecentChatModel: (model: string) => void;\n  setShowTokenUsage: (show: boolean) => void;\n}'
)

# Update persistSettings
content = content.replace(
    '    theme: state.theme,\n  };\n  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));',
    '    theme: state.theme,\n    chatModel: state.chatModel,\n    chatRecentModels: state.chatRecentModels,\n    showTokenUsage: state.showTokenUsage,\n  };\n  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));'
)

# Update initial state and setters
setter_content = '''
  chatModel: (persisted.chatModel as string) ?? '',
  chatRecentModels: (persisted.chatRecentModels as string[]) ?? [],
  showTokenUsage: (persisted.showTokenUsage as boolean) ?? false,

  setChatModel: (model: string) => {
    set((s) => {
      const next = { ...s, chatModel: model };
      persistSettings(next as SettingsState);
      return { chatModel: model };
    });
  },

  addRecentChatModel: (model: string) => {
    set((s) => {
      const current = s.chatRecentModels || [];
      const filtered = current.filter(m => m !== model);
      const updated = [model, ...filtered].slice(0, 5);
      const next = { ...s, chatRecentModels: updated };
      persistSettings(next as SettingsState);
      return { chatRecentModels: updated };
    });
  },

  setShowTokenUsage: (show: boolean) => {
    set((s) => {
      const next = { ...s, showTokenUsage: show };
      persistSettings(next as SettingsState);
      return { showTokenUsage: show };
    });
  },

  updateProvider: (type, patch) => {'''

content = content.replace('  updateProvider: (type, patch) => {', setter_content)

with open('c:/Users/Rafael/workspace/repos/payday-planner/src/store/useSettingsStore.ts', 'w') as f:
    f.write(content)

print("Updated useSettingsStore.ts")
