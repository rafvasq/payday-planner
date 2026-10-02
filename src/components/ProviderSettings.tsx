import React, { useState, useEffect } from 'react';
import { api, AppConfig, ProviderConfig, ProviderModels } from '../lib/apiClient';
import { Settings2, Save, Loader2, KeyRound, CheckCircle2, AlertTriangle, Link2, MonitorPlay, Cloud } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const OpenAIIcon = (props: any) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2057 5.9847 5.9847 0 0 0 3.998-2.9001 6.0557 6.0557 0 0 0-.7478-7.0731zM13.26 22.4302a4.4756 4.4756 0 0 1-2.876-1.0408l.1444-.09 5.3959-3.1198.2887-.1666v-6.0792l1.644 1.002v5.656a4.4708 4.4708 0 0 1-4.597 3.8384zm-9.97-5.0298a4.4756 4.4756 0 0 1-.7847-2.9528l.0926.1415 2.723 4.6622.1443.25v6.0792l1.644-1.002v-5.656a4.4708 4.4708 0 0 1-3.8192-1.5221zm-1.04-10.12a4.4756 4.4756 0 0 1 2.0913-2.2223l-.09.1444 2.723-4.6622-.1666-.2887h-6.0792l-1.002 1.644h5.656a4.4708 4.4708 0 0 1 3.8384 4.597zm11.75 3.32a3.0034 3.0034 0 0 1-1.5 1.5l-1.5 1.5-1.5-1.5v-3l1.5-1.5 1.5 1.5v3zm3.22-3.32a4.4756 4.4756 0 0 1 .7847 2.9528l-.0926-.1415-2.723-4.6622-.1443-.25V3.7198l-1.644 1.002v5.656a4.4708 4.4708 0 0 1 3.8192 1.5221zm1.04 10.12a4.4756 4.4756 0 0 1-2.0913 2.2223l.09-.1444-2.723 4.6622.1666.2887h6.0792l1.002-1.644h-5.656a4.4708 4.4708 0 0 1-3.8384-4.597zm-11.75-3.32a4.4756 4.4756 0 0 1 2.876 1.0408l-.1444.09-5.3959 3.1198-.2887.1666v6.0792l-1.644-1.002v-5.656a4.4708 4.4708 0 0 1 4.597-3.8384z"/>
  </svg>
);

const AnthropicIcon = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/>
    <path d="M7 15L12 6L17 15"/>
    <path d="M9 12H15"/>
  </svg>
);

const GeminiIcon = (props: any) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z"/>
  </svg>
);

const OllamaIcon = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
    <path d="M8 14h8"/>
    <path d="M9 9h.01"/>
    <path d="M15 9h.01"/>
  </svg>
);

const OpenRouterIcon = (props: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
    <path d="M2 12h20"/>
  </svg>
);

const PROVIDERS = [
  { id: 'ollama', name: 'Ollama', type: 'local', icon: OllamaIcon },
  { id: 'openai', name: 'OpenAI', type: 'cloud', icon: OpenAIIcon },
  { id: 'anthropic', name: 'Anthropic', type: 'cloud', icon: AnthropicIcon },
  { id: 'gemini', name: 'Google Gemini', type: 'cloud', icon: GeminiIcon },
  { id: 'openrouter', name: 'OpenRouter', type: 'cloud', icon: OpenRouterIcon },
];

export const ProviderSettings: React.FC = () => {
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [availableModels, setAvailableModels] = useState<ProviderModels[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState<ProviderConfig | null>(null);
  
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState('');

  const loadData = async () => {
    try {
      const data = await api.getProvider();
      const providers = { ...data.providers };
      PROVIDERS.forEach(p => {
        if (!providers[p.id]) {
          providers[p.id] = { provider_type: p.id, status: 'disconnected' };
        }
      });
      setAppConfig({ ...data, providers });
      
      const modelsData = await api.getModels();
      setAvailableModels(modelsData);
    } catch (err) {
      console.error("Failed to load providers:", err);
      const fallbackProviders: any = {};
      PROVIDERS.forEach(p => {
        fallbackProviders[p.id] = { provider_type: p.id, status: 'disconnected' };
      });
      setAppConfig({
        extraction_model: 'ollama/llama3',
        analysis_model: 'openai/gpt-4o',
        providers: fallbackProviders
      });
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadData();
  }, []);

  const handleGlobalSave = async (configToSave: AppConfig) => {
    try {
      await api.setProvider(configToSave);
      setAppConfig(configToSave);
      // Reload models in case a new provider connected
      const modelsData = await api.getModels();
      setAvailableModels(modelsData);
    } catch (err: any) {
      console.error(err);
    }
  };

  const openProviderModal = (id: string) => {
    if (!appConfig) return;
    const existing = appConfig.providers[id];
    setEditConfig({
      ...existing,
      endpoint: existing.endpoint || (id === 'ollama' ? 'http://localhost:11434' : '')
    });
    setSelectedProvider(id);
    setTestMessage('');
  };

  const handleTestConnection = async () => {
    if (!editConfig || !appConfig) return;
    setTesting(true);
    setTestMessage('');
    try {
      await api.testProvider(editConfig);
      
      const newConfig = {
        ...appConfig,
        providers: {
          ...appConfig.providers,
          [editConfig.provider_type]: {
            ...editConfig,
            status: 'connected' as const
          }
        }
      };
      
      await handleGlobalSave(newConfig);
      setTestMessage('Connection successful! Settings saved.');
      
      setTimeout(() => {
        setSelectedProvider(null);
      }, 1500);
      
    } catch (err: any) {
      const newConfig = {
        ...appConfig,
        providers: {
          ...appConfig.providers,
          [editConfig.provider_type]: {
            ...editConfig,
            status: 'error' as const
          }
        }
      };
      setAppConfig(newConfig);
      setTestMessage(`Failed: ${err.message}`);
    }
    setTesting(false);
  };

  if (loading || !appConfig) return <div className="p-4 text-muted-foreground text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Loading AI Settings...</div>;

  return (
    <div className="w-full max-w-4xl mx-auto my-6 space-y-6">
      
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 bg-muted/30 p-4 rounded-xl border border-border">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            AI Provider Hub
          </h2>
          <p className="text-sm text-muted-foreground">Manage your AI connections.</p>
        </div>
      </div>

      <div className="bg-muted/10 border border-border p-4 rounded-xl space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-muted-foreground" /> Task Routing
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Data Extraction Engine</label>
            <p className="text-xs text-muted-foreground pb-1">Used for background tasks like formatting CSVs. Fast, cheap models recommended.</p>
            <select
              value={appConfig.extraction_model}
              onChange={(e) => handleGlobalSave({ ...appConfig, extraction_model: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              {availableModels.length === 0 && <option disabled>No models connected</option>}
              {availableModels.map(provider => (
                <optgroup key={provider.provider_type} label={provider.provider_name}>
                  {provider.models.map(model => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Analysis & Chat Engine</label>
            <p className="text-xs text-muted-foreground pb-1">Used for conversational analysis and strategy. High-reasoning models recommended.</p>
            <select
              value={appConfig.analysis_model}
              onChange={(e) => handleGlobalSave({ ...appConfig, analysis_model: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            >
              {availableModels.length === 0 && <option disabled>No models connected</option>}
              {availableModels.map(provider => (
                <optgroup key={provider.provider_type} label={provider.provider_name}>
                  {provider.models.map(model => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDERS.map((provider) => {
          const config = appConfig.providers[provider.id];
          const status = config?.status || 'disconnected';
          
          return (
            <Card 
              key={provider.id} 
              className={`cursor-pointer transition-all hover:border-primary/50 ${status === 'connected' ? 'border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`}
              onClick={() => openProviderModal(provider.id)}
            >
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <provider.icon className="w-4 h-4 text-muted-foreground" />
                  {provider.name}
                </CardTitle>
                <div className="flex items-center">
                  {status === 'connected' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  {status === 'error' && <AlertTriangle className="w-5 h-5 text-rose-500" />}
                  {status === 'disconnected' && <div className="w-5 h-5 rounded-full border-2 border-muted" />}
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!selectedProvider} onOpenChange={(open) => !open && setSelectedProvider(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Configure {PROVIDERS.find(p => p.id === selectedProvider)?.name}</DialogTitle>
            <DialogDescription>
              {PROVIDERS.find(p => p.id === selectedProvider)?.type === 'cloud' 
                ? "Stored securely in your OS credential manager, never uploaded."
                : "Connect to your local instance. Models will be auto-discovered."}
            </DialogDescription>
          </DialogHeader>
          
          {editConfig && (
            <div className="grid gap-4 py-4">
              {PROVIDERS.find(p => p.id === selectedProvider)?.type === 'cloud' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" /> API Key
                  </label>
                  <Input 
                    type="password"
                    placeholder="Masked (leave blank to keep existing)"
                    value={editConfig.api_key || ''}
                    onChange={e => setEditConfig({ ...editConfig, api_key: e.target.value })}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" /> Base URL
                  </label>
                  <Input 
                    value={editConfig.endpoint || ''}
                    onChange={e => setEditConfig({ ...editConfig, endpoint: e.target.value })}
                    placeholder="http://localhost:11434"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <span className={`text-xs font-medium ${testMessage.startsWith('Failed') ? 'text-rose-500' : 'text-emerald-500'}`}>
              {testMessage}
            </span>
            <Button onClick={handleTestConnection} disabled={testing}>
              {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              Test Connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
