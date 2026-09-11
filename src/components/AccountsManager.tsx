import React, { useState } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { Account, AccountType } from '../core/models';
import { Plus, Trash2, Save, Users, Building2 } from 'lucide-react';

const ACCOUNT_TYPES: AccountType[] = [
  'chequing',
  'savings',
  'debt',
  'investment',
  'liability',
];

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  chequing: 'Chequing',
  savings: 'Savings',
  debt: 'Debt',
  investment: 'Investments',
  liability: 'Liabilities',
};

export const AccountsManager: React.FC = () => {
  const { members, accounts, updateMemberName, addAccount, updateAccount, deleteAccount } =
    usePlannerStore();

  const [addOpen, setAddOpen] = useState(false);
  const [newAcct, setNewAcct] = useState<Partial<Account>>({
    name: '',
    type: 'chequing',
    owner: members[0]?.id || 'A',
    balance: 0,
  });

  const ownerOptions = [...members.map((m) => m.id), 'Joint'];

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAcct.name) return;

    const id =
      newAcct.name.toLowerCase().replace(/[^a-z0-9]/g, '_') +
      '_' +
      Math.random().toString(36).substring(2, 6);

    const fullAcct: Account = {
      id,
      name: newAcct.name,
      type: (newAcct.type as AccountType) || 'chequing',
      owner: newAcct.owner || 'A',
      balance: Number(newAcct.balance) || 0,
      interest_rate: Number(newAcct.interest_rate) || 0,
      market_value: Number(newAcct.market_value) || 0,
      target_floor: newAcct.target_floor ?? null,
    };

    addAccount(fullAcct);
    setNewAcct({ name: '', type: 'chequing', owner: members[0]?.id || 'A', balance: 0 });
    setAddOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Members Section */}
      <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-brand-500" />
          <h2 className="text-base font-bold text-ink-900">Members</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {members.map((m) => (
            <div
              key={m.id}
              className="p-3 border border-ink-200 rounded-lg flex items-center justify-between gap-3 bg-ink-100/50"
            >
              <span className="text-xs font-bold text-ink-400">ID: {m.id}</span>
              <input
                type="text"
                value={m.name}
                onChange={(e) => updateMemberName(m.id, e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Add Account Modal/Accordion */}
      <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand-500" />
            <h2 className="text-base font-bold text-ink-900">Accounts</h2>
          </div>
          <button
            onClick={() => setAddOpen(!addOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{addOpen ? 'Cancel' : 'Add Account'}</span>
          </button>
        </div>

        {addOpen && (
          <form onSubmit={handleAddSubmit} className="mt-4 pt-4 border-t border-ink-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={newAcct.name || ''}
                  onChange={(e) => setNewAcct({ ...newAcct, name: e.target.value })}
                  placeholder="e.g. Chequing A"
                  className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                  Type
                </label>
                <select
                  value={newAcct.type}
                  onChange={(e) => setNewAcct({ ...newAcct, type: e.target.value as AccountType })}
                  className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                  Owner
                </label>
                <select
                  value={newAcct.owner}
                  onChange={(e) => setNewAcct({ ...newAcct, owner: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  {ownerOptions.map((o) => (
                    <option key={o} value={o}>
                      {o === 'Joint' ? 'Joint' : members.find((m) => m.id === o)?.name || o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                  Current Balance ($)
                </label>
                <input
                  type="number"
                  step="50"
                  value={newAcct.balance ?? 0}
                  onChange={(e) => setNewAcct({ ...newAcct, balance: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {['savings', 'investment', 'liability'].includes(newAcct.type || '') && (
                <div>
                  <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                    Interest Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newAcct.interest_rate ?? 0}
                    onChange={(e) =>
                      setNewAcct({ ...newAcct, interest_rate: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              )}

              {newAcct.type === 'liability' && (
                <div>
                  <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                    Market Value ($)
                  </label>
                  <input
                    type="number"
                    step="1000"
                    value={newAcct.market_value ?? 0}
                    onChange={(e) =>
                      setNewAcct({ ...newAcct, market_value: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="e.g. House Estimated Value"
                    className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-all"
            >
              Save New Account
            </button>
          </form>
        )}

        {/* Existing Accounts List */}
        <div className="mt-4 space-y-3">
          {accounts.map((acct) => (
            <AccountEditCard
              key={acct.id}
              account={acct}
              ownerOptions={ownerOptions}
              members={members}
              onSave={(updated) => updateAccount(acct.id, updated)}
              onDelete={() => deleteAccount(acct.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface AccountEditCardProps {
  account: Account;
  ownerOptions: string[];
  members: { id: string; name: string }[];
  onSave: (updated: Partial<Account>) => void;
  onDelete: () => void;
}

const AccountEditCard: React.FC<AccountEditCardProps> = ({
  account,
  ownerOptions,
  members,
  onSave,
  onDelete,
}) => {
  const [data, setData] = useState<Account>(account);
  const [dirty, setDirty] = useState(false);

  const update = (fields: Partial<Account>) => {
    setData((prev) => ({ ...prev, ...fields }));
    setDirty(true);
  };

  const handleSave = () => {
    onSave(data);
    setDirty(false);
  };

  return (
    <details className="border border-ink-200 rounded-lg bg-white overflow-hidden group">
      <summary className="px-4 py-3 font-semibold text-xs text-ink-900 flex items-center justify-between cursor-pointer select-none bg-white hover:bg-ink-100/50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="font-bold">{data.name}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-ink-100 text-ink-500 border border-ink-200">
            {data.owner}
          </span>
          <span className="text-ink-400">({ACCOUNT_TYPE_LABELS[data.type]})</span>
        </div>
        <span className="font-bold text-sm text-ink-900">
          ${data.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </span>
      </summary>

      <div className="p-4 border-t border-ink-200/60 bg-ink-100/30 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              Name
            </label>
            <input
              type="text"
              value={data.name}
              onChange={(e) => update({ name: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-ink-200 rounded-md"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              Type
            </label>
            <select
              value={data.type}
              onChange={(e) => update({ type: e.target.value as AccountType })}
              className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-ink-200 rounded-md"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              Owner
            </label>
            <select
              value={data.owner}
              onChange={(e) => update({ owner: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-ink-200 rounded-md"
            >
              {ownerOptions.map((o) => (
                <option key={o} value={o}>
                  {o === 'Joint' ? 'Joint' : members.find((m) => m.id === o)?.name || o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              Balance ($)
            </label>
            <input
              type="number"
              step="50"
              value={data.balance}
              onChange={(e) => update({ balance: parseFloat(e.target.value) || 0 })}
              className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-ink-200 rounded-md"
            />
          </div>
        </div>

        {/* Type Specific Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-ink-200/50">
          {['chequing', 'savings', 'investment'].includes(data.type) && (
            <>
              <div>
                <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
                  Target Floor ($)
                </label>
                <input
                  type="number"
                  step="50"
                  value={data.target_floor ?? ''}
                  onChange={(e) =>
                    update({
                      target_floor: e.target.value === '' ? null : parseFloat(e.target.value),
                    })
                  }
                  placeholder="Minimum balance"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-md"
                />
              </div>
            </>
          )}

          {data.type === 'liability' && (
            <div>
              <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
                Market Value ($)
              </label>
              <input
                type="number"
                step="1000"
                value={data.market_value ?? 0}
                onChange={(e) => update({ market_value: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-md"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>

          {dirty && (
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-md transition-colors shadow-2xs animate-pulse"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          )}
        </div>
      </div>
    </details>
  );
};
