import { create } from 'zustand';

/* ── Provider types ─────────────────────────────────────────── */

export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'openrouter';

export interface ProviderConfig {
  type: ProviderType;
  label: string;
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    type: 'ollama',
    label: 'Ollama (Local)',
    enabled: false,
    endpoint: 'http://localhost:11434',
    apiKey: '',
    model: 'llama3.1:8b',
  },
  {
    type: 'openai',
    label: 'OpenAI',
    enabled: false,
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o',
  },
  {
    type: 'anthropic',
    label: 'Anthropic',
    enabled: false,
    endpoint: 'https://api.anthropic.com',
    apiKey: '',
    model: 'claude-sonnet-4-20250514',
  },
  {
    type: 'gemini',
    label: 'Google Gemini',
    enabled: false,
    endpoint: 'https://generativelanguage.googleapis.com',
    apiKey: '',
    model: 'gemini-2.5-pro',
  },
  {
    type: 'openrouter',
    label: 'OpenRouter',
    enabled: false,
    endpoint: 'https://openrouter.ai/api/v1',
    apiKey: '',
    model: 'openai/gpt-4o',
  },
];

/* ── Settings types ─────────────────────────────────────────── */

export type Theme = 'light' | 'dark' | 'system';
export type PayFrequency = 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly';

export interface SettingsState {
  /* AI Providers */
  providers: ProviderConfig[];
  defaultProvider: ProviderType | 'clipboard';

  /* Preferences */
  locale: string;
  currency: string;
  dateFormat: string;
  payFrequency: PayFrequency;
  theme: Theme;

  /* Actions */
  updateProvider: (type: ProviderType, patch: Partial<ProviderConfig>) => void;
  setDefaultProvider: (type: ProviderType | 'clipboard') => void;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: string) => void;
  setCurrency: (currency: string) => void;
  setDateFormat: (fmt: string) => void;
  setPayFrequency: (freq: PayFrequency) => void;

  /* Derived */
  activeProvider: () => ProviderConfig | null;

  /* Chat Settings */
  chatModel?: string;
  chatRecentModels?: string[];
  showTokenUsage?: boolean;
  setChatModel: (model: string) => void;
  addRecentChatModel: (model: string) => void;
  setShowTokenUsage: (show: boolean) => void;
}

/* ── Persistence ────────────────────────────────────────────── */

const STORAGE_KEY = 'payday_settings';

function loadPersistedSettings(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persistSettings(state: SettingsState) {
  const serializable = {
    providers: state.providers,
    defaultProvider: state.defaultProvider,
    locale: state.locale,
    currency: state.currency,
    dateFormat: state.dateFormat,
    payFrequency: state.payFrequency,
    theme: state.theme,
    chatModel: state.chatModel,
    chatRecentModels: state.chatRecentModels,
    showTokenUsage: state.showTokenUsage,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

/* ── Store ──────────────────────────────────────────────────── */

const persisted = loadPersistedSettings();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providers: (persisted.providers as ProviderConfig[]) ?? DEFAULT_PROVIDERS,
  defaultProvider:
    (persisted.defaultProvider as ProviderType | 'clipboard') ?? 'clipboard',
  locale: (persisted.locale as string) ?? 'en-CA',
  currency: (persisted.currency as string) ?? 'CAD',
  dateFormat: (persisted.dateFormat as string) ?? 'yyyy-MM-dd',
  payFrequency: (persisted.payFrequency as PayFrequency) ?? 'biweekly',
  theme: (persisted.theme as Theme) ?? 'light',


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

  updateProvider: (type, patch) => {
    set((s) => {
      const providers = s.providers.map((p) =>
        p.type === type ? { ...p, ...patch } : p
      );
      const next = { ...s, providers };
      persistSettings(next as SettingsState);
      return { providers };
    });
  },

  setDefaultProvider: (type) => {
    set((s) => {
      const next = { ...s, defaultProvider: type };
      persistSettings(next as SettingsState);
      return { defaultProvider: type };
    });
  },

  setTheme: (theme) => {
    set((s) => {
      const next = { ...s, theme };
      persistSettings(next as SettingsState);
      return { theme };
    });
    // Apply to document
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    if (theme === 'system') {
      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;
      root.classList.add(prefersDark ? 'dark' : 'light');
    } else {
      root.classList.add(theme);
    }
  },

  setLocale: (locale) => {
    set((s) => {
      const next = { ...s, locale };
      persistSettings(next as SettingsState);
      return { locale };
    });
  },

  setCurrency: (currency) => {
    set((s) => {
      const next = { ...s, currency };
      persistSettings(next as SettingsState);
      return { currency };
    });
  },

  setDateFormat: (dateFormat) => {
    set((s) => {
      const next = { ...s, dateFormat };
      persistSettings(next as SettingsState);
      return { dateFormat };
    });
  },

  setPayFrequency: (payFrequency) => {
    set((s) => {
      const next = { ...s, payFrequency };
      persistSettings(next as SettingsState);
      return { payFrequency };
    });
  },

  activeProvider: () => {
    const { providers, defaultProvider } = get();
    if (defaultProvider === 'clipboard') return null;
    return providers.find((p) => p.type === defaultProvider && p.enabled) ?? null;
  },
}));
