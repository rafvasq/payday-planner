import React, { useState, useEffect } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { X, Zap, Check, Copy } from 'lucide-react';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  chequing: 'Chequing',
  savings: 'Savings',
  investment: 'Investments',
  debt: 'Debt',
  liability: 'Liabilities',
};

export const QuickCheckInModal: React.FC = () => {
  const {
    accounts,
    quickCheckInOpen,
    setQuickCheckInOpen,
    quickUpdateBalances,
    getBlueprintJson,
    startingBalancesReflectToday,
    setStartingBalancesReflectToday,
  } = usePlannerStore();

  const [balances, setBalances] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (quickCheckInOpen) {
      const initial: Record<string, number> = {};
      accounts.forEach((a) => {
        initial[a.id] = a.balance;
      });
      setBalances(initial);
      setCopied(false);
    }
  }, [quickCheckInOpen, accounts]);

  if (!quickCheckInOpen) return null;

  const handleChange = (id: string, val: string) => {
    const num = parseFloat(val);
    setBalances((prev) => ({
      ...prev,
      [id]: isNaN(num) ? 0 : num,
    }));
  };

  const handleSaveAndCopy = async () => {
    quickUpdateBalances(balances);
    try {
      const jsonStr = getBlueprintJson();
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => {
        setQuickCheckInOpen(false);
      }, 1200);
    } catch (err) {
      console.error(err);
      setQuickCheckInOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-ink-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-ink-200 flex items-center justify-between bg-ink-100 rounded-t-xl">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-600 fill-amber-500" />
            <div>
              <h2 className="text-base font-bold text-ink-900">
                Payday Quick Check-in
              </h2>
              <p className="text-xs text-ink-400">
                Update today's balances across your accounts and copy JSON in 15 seconds.
              </p>
            </div>
          </div>
          <button
            onClick={() => setQuickCheckInOpen(false)}
            className="p-1 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="divide-y divide-ink-200 border border-ink-200 rounded-lg overflow-hidden bg-white">
            {accounts.map((acct, idx) => (
              <div
                key={acct.id}
                className="px-4 py-3 flex items-center justify-between hover:bg-ink-100/50 transition-colors gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900 truncate">
                      {acct.name}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-ink-100 text-ink-500 border border-ink-200">
                      {acct.owner}
                    </span>
                  </div>
                  <span className="text-xs text-ink-400">
                    {ACCOUNT_TYPE_LABELS[acct.type] || acct.type}
                  </span>
                </div>

                <div className="w-40 flex items-center gap-1.5">
                  <span className="text-sm font-medium text-ink-400">$</span>
                  <input
                    type="number"
                    step="50"
                    autoFocus={idx === 0}
                    value={balances[acct.id] ?? 0}
                    onChange={(e) => handleChange(acct.id, e.target.value)}
                    className="w-full text-right px-3 py-1.5 text-sm font-semibold text-ink-900 bg-ink-100/50 border border-ink-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-ink-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-ink-100/50 rounded-b-xl">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={startingBalancesReflectToday}
              onChange={(e) => setStartingBalancesReflectToday(e.target.checked)}
              className="rounded text-brand-500 focus:ring-brand-500 w-3.5 h-3.5"
            />
            <span>Balances reflect today's cleared transactions</span>
          </label>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setQuickCheckInOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-ink-500 hover:text-ink-900 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveAndCopy}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all shadow-md ${
                copied
                  ? 'bg-emerald-600 text-white shadow-emerald-200'
                  : 'bg-brand-500 hover:bg-brand-600 text-white shadow-brand-200'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 animate-bounce" />
                  <span>Saved & Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Save Balances & Copy JSON</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
