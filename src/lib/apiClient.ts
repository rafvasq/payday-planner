/**
 * Retrieves the local authentication token. 
 * In production, this is injected securely into the global window object.
 * In development, we use the fallback static token.
 */
export const getLocalAuthToken = () => {
  return (window as any).__PAYDAY_TOKEN__ || "test-token-123";
};

const API_BASE = "http://localhost:8000/api";

export interface ParsedTransaction {
  date: string;
  merchant: string;
  amount: number;
  card?: string | null;
}

export interface ParseResponse {
  transactions: ParsedTransaction[];
  warning: string | null;
}

export interface ProviderConfig {
  provider_type: string;
  api_key?: string;
  endpoint?: string;
  status?: 'connected' | 'disconnected' | 'error';
}

export interface AppConfig {
  extraction_model: string;
  analysis_model: string;
  providers: Record<string, ProviderConfig>;
}

export interface AvailableModel {
  id: string;
  name: string;
}

export interface ProviderModels {
  provider_type: string;
  provider_name: string;
  models: AvailableModel[];
}

export const api = {
  getModels: async (): Promise<ProviderModels[]> => {
    const res = await fetch(`${API_BASE}/models`, {
      headers: { "X-Local-Auth-Token": getLocalAuthToken() }
    });
    if (!res.ok) throw new Error("Failed to load models");
    return res.json();
  },
  parseCsv: async (file: File, provider?: string): Promise<ParseResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    if (provider) {
      formData.append("provider", provider);
    }

    const res = await fetch(`${API_BASE}/parse`, {
      method: "POST",
      headers: {
        "X-Local-Auth-Token": getLocalAuthToken(),
      },
      body: formData,
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const errorData = await res.json();
        if (errorData.detail) detail = errorData.detail;
      } catch (e) {}
      throw new Error(`Parse failed: ${detail}`);
    }

    return res.json();
  },
  
  getProvider: async (): Promise<AppConfig> => {
    const res = await fetch(`${API_BASE}/providers`, {
      headers: { "X-Local-Auth-Token": getLocalAuthToken() }
    });
    if (!res.ok) throw new Error("Failed to load provider config");
    return res.json();
  },
  
  setProvider: async (config: AppConfig) => {
    const res = await fetch(`${API_BASE}/providers`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Local-Auth-Token": getLocalAuthToken() 
      },
      body: JSON.stringify(config)
    });
    if (!res.ok) throw new Error("Failed to save provider config");
    return res.json();
  },
  
  testProvider: async (config: ProviderConfig) => {
    const res = await fetch(`${API_BASE}/providers/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Local-Auth-Token": getLocalAuthToken()
      },
      body: JSON.stringify(config)
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const err = await res.json();
        if (err.detail) detail = err.detail;
      } catch (e) {}
      throw new Error(detail);
    }
    return res.json();
  },
  
  chatStream: async function* (messages: {role: string, content: string}[], blueprint: any, ledger_context: string, spending_summary?: string, provider?: string, signal?: AbortSignal) {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Local-Auth-Token": getLocalAuthToken() 
      },
      body: JSON.stringify({ messages, blueprint, ledger_context, spending_summary, provider }),
      signal
    });
    
    if (!res.ok) throw new Error("Chat request failed");
    
    const reader = res.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    if (!reader) return;
    
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const chunkStr = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        
        const lines = chunkStr.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            if (dataStr.trim() === "[DONE]") return;
            try {
              const data = JSON.parse(dataStr);
              yield data;
            } catch (e) {
              if (dataStr.startsWith("[ERROR:")) {
                yield dataStr;
              }
            }
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  }
};

export const logToServer = async (level: string, message: string, data?: any) => {
  try {
    await fetch(`${API_BASE}/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Local-Auth-Token': getLocalAuthToken(),
      },
      body: JSON.stringify({ level, message, data }),
    });
  } catch (e) {
    // silently fail
  }
};

