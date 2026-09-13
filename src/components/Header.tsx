import React, { useState } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { Copy, Check, Zap } from 'lucide-react';
import { generateLlmPrompt } from '../core/prompt';

export const Header: React.FC = () => {
  const { getBlueprintJson, setQuickCheckInOpen } = usePlannerStore();
  const [copied, setCopied] = useState(false);

  const handleCopyJson = async () => {
    try {
      const jsonStr = getBlueprintJson();
      const prompt = generateLlmPrompt(jsonStr);
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <header className="bg-white border-b border-ink-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sticky top-0 z-30 shadow-xs">
      <div className="flex items-center gap-3">
        <span className="text-3xl">💸</span>
        <div>
          <h1 className="text-xl font-extrabold text-ink-900 tracking-tight leading-none">
            Payday
          </h1>
          <p className="text-xs font-medium text-ink-400 mt-0.5">
            Local-First Cashflow & AI Financial Blueprint Planner
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={() => setQuickCheckInOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all shadow-2xs"
          title="Update all account balances in under 15 seconds"
        >
          <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
          <span>Quick Check-in</span>
        </button>

        <button
          onClick={handleCopyJson}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all shadow-xs ${
            copied
              ? 'bg-emerald-600 text-white shadow-emerald-200'
              : 'bg-brand-500 hover:bg-brand-600 text-white shadow-brand-200'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 animate-bounce" />
              <span>Copied Prompt & JSON!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy for LLM</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
