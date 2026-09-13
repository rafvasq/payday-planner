import React, { useState, useEffect } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { Account, AccountType } from '../core/models';
import { Plus, Trash2, Users, Building2, Wallet, CreditCard, PieChart } from 'lucide-react';

const ACCOUNT_TYPES: AccountType[] = [
  'chequing',
  'savings',
  'investment',
  'debt',
  'liability',
];

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  chequing: 'Chequing',
  savings: 'Savings',
  debt: 'Debt (Credit Cards/LOC)',
  investment: 'Investments',
  liability: 'Liabilities (Mortgages/Loans)',
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

  // Metrics
  const totalLiquid = accounts
    .filter((a) => ['chequing', 'savings'].includes(a.type))
    .reduce((acc, a) => acc + a.balance, 0);
  
  const totalDebt = accounts
    .filter((a) => a.type === 'debt')
    .reduce((acc, a) => acc + a.balance, 0);
  
  const totalNetWorth = accounts.reduce((acc, a) => {
    if (['chequing', 'savings', 'investment'].includes(a.type)) return acc + a.balance;
    if (a.type === 'debt') return acc - a.balance;
    if (a.type === 'liability') return acc + (a.market_value || 0) - a.balance;
    return acc;
  }, 0);

  // Grouped Accounts
  const groupedAccounts = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = accounts.filter((a) => a.type === type);
    return acc;
  }, {} as Record<AccountType, Account[]>);

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
      {/* Metric Summaries */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-lg shrink-0">
            <Wallet className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Liquid Assets</p>
            <p className="text-xl font-bold text-ink-900">${totalLiquid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        
        <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-rose-50 rounded-lg shrink-0">
            <CreditCard className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Total Debt</p>
            <p className="text-xl font-bold text-ink-900">${totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        
        <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-brand-50 rounded-lg shrink-0">
            <PieChart className="w-6 h-6 text-brand-600" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Net Worth</p>
            <p className="text-xl font-bold text-ink-900">${totalNetWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

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

      {/* Add Account Panel */}
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
            {/* Same Add Form fields as before */}
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
                  step="any"
                  value={newAcct.balance ?? ''}
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
                    value={newAcct.interest_rate ?? ''}
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
                    value={newAcct.market_value ?? ''}
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
      </div>

      {/* Accounts Grouped by Type */}
      <div className="space-y-8">
        {ACCOUNT_TYPES.map((type) => {
          const typeAccounts = groupedAccounts[type];
          if (!typeAccounts || typeAccounts.length === 0) return null;

          return (
            <div key={type} className="space-y-3">
              <h3 className="text-sm font-bold text-ink-900 border-b border-ink-200 pb-2">
                {ACCOUNT_TYPE_LABELS[type]}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {typeAccounts.map((acct) => (
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
          );
        })}
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
  // Local state for auto-save text inputs to prevent focus jumping
  const [localName, setLocalName] = useState(account.name);
  const [localBalance, setLocalBalance] = useState(account.balance.toString());
  const [localTargetFloor, setLocalTargetFloor] = useState(account.target_floor?.toString() || '');
  const [localMarketValue, setLocalMarketValue] = useState(account.market_value?.toString() || '');

  // Sync external changes
  useEffect(() => {
    setLocalName(account.name);
    setLocalBalance(account.balance.toString());
    setLocalTargetFloor(account.target_floor?.toString() || '');
    setLocalMarketValue(account.market_value?.toString() || '');
  }, [account]);

  const commitName = () => { if (localName !== account.name) onSave({ name: localName }); };
  const commitBalance = () => { 
    const val = parseFloat(localBalance);
    if (!isNaN(val) && val !== account.balance) onSave({ balance: val });
  };
  const commitTargetFloor = () => {
    const val = localTargetFloor === '' ? null : parseFloat(localTargetFloor);
    if (val !== account.target_floor) onSave({ target_floor: val });
  };
  const commitMarketValue = () => {
    const val = parseFloat(localMarketValue);
    if (!isNaN(val) && val !== account.market_value) onSave({ market_value: val });
  };

  return (
    <div className="bg-white border border-ink-200 rounded-xl p-4 shadow-xs space-y-4 relative group hover:border-brand-300 transition-colors">
      <button
        onClick={onDelete}
        className="absolute top-3 right-3 text-ink-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
        title="Delete Account"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div>
        <input
          type="text"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={commitName}
          className="text-sm font-bold text-ink-900 bg-transparent border-b border-transparent hover:border-ink-200 focus:border-brand-500 focus:outline-none w-[90%] pb-0.5 transition-colors"
        />
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400 mt-1">
          {account.id}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1/3">
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">Owner</label>
            <select
              value={account.owner}
              onChange={(e) => onSave({ owner: e.target.value })}
              className="w-full px-2 py-1 text-xs font-semibold bg-ink-50 border border-ink-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {ownerOptions.map((o) => (
                <option key={o} value={o}>
                  {o === 'Joint' ? 'Joint' : members.find((m) => m.id === o)?.name || o}
                </option>
              ))}
            </select>
          </div>
          <div className="w-2/3">
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">Balance ($)</label>
            <input
              type="number"
              step="any"
              value={localBalance}
              onChange={(e) => setLocalBalance(e.target.value)}
              onBlur={commitBalance}
              className="w-full px-2 py-1 text-xs font-bold text-ink-900 bg-ink-50 border border-ink-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {['chequing', 'savings', 'investment'].includes(account.type) && (
          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">Target Floor ($)</label>
            <input
              type="number"
              step="any"
              value={localTargetFloor}
              onChange={(e) => setLocalTargetFloor(e.target.value)}
              onBlur={commitTargetFloor}
              placeholder="Min balance guard"
              className="w-full px-2 py-1 text-xs font-semibold bg-ink-50 border border-ink-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        )}

        {account.type === 'liability' && (
          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">Market Value ($)</label>
            <input
              type="number"
              step="1000"
              value={localMarketValue}
              onChange={(e) => setLocalMarketValue(e.target.value)}
              onBlur={commitMarketValue}
              className="w-full px-2 py-1 text-xs font-semibold bg-ink-50 border border-ink-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        )}
      </div>
    </div>
  );
};
