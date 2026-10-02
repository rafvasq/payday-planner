import React, { useState, useEffect } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { Account, AccountType } from '../core/models';
import { Plus, Trash2, Users, Building2, Wallet, CreditCard, PieChart } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg shrink-0">
              <Wallet className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Liquid Assets</p>
              <p className="text-xl font-bold">${totalLiquid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-destructive/10 rounded-lg shrink-0">
              <CreditCard className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Total Debt</p>
              <p className="text-xl font-bold">${totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg shrink-0">
              <PieChart className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Net Worth</p>
              <p className="text-xl font-bold">${totalNetWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Members</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {members.map((m) => (
              <div
                key={m.id}
                className="p-3 border border-border rounded-md flex items-center justify-between gap-3 bg-muted/50"
              >
                <span className="text-xs font-bold text-muted-foreground">ID: {m.id}</span>
                <Input
                  type="text"
                  value={m.name}
                  onChange={(e) => updateMemberName(m.id, e.target.value)}
                  className="w-full sm:w-[200px] h-8 text-xs font-semibold"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Account Panel */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Accounts</CardTitle>
          </div>
          <Button
            size="sm"
            onClick={() => setAddOpen(!addOpen)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {addOpen ? 'Cancel' : 'Add Account'}
          </Button>
        </CardHeader>

        {addOpen && (
          <CardContent>
            <form onSubmit={handleAddSubmit} className="pt-4 border-t border-border space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase">
                    Account Name
                  </label>
                  <Input
                    type="text"
                    required
                    value={newAcct.name || ''}
                    onChange={(e) => setNewAcct({ ...newAcct, name: e.target.value })}
                    placeholder="e.g. Chequing A"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase">
                    Type
                  </label>
                  <select
                    value={newAcct.type}
                    onChange={(e) => setNewAcct({ ...newAcct, type: e.target.value as AccountType })}
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACCOUNT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase">
                    Owner
                  </label>
                  <select
                    value={newAcct.owner}
                    onChange={(e) => setNewAcct({ ...newAcct, owner: e.target.value })}
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ownerOptions.map((o) => (
                      <option key={o} value={o}>
                        {o === 'Joint' ? 'Joint' : members.find((m) => m.id === o)?.name || o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase">
                    Current Balance ($)
                  </label>
                  <Input
                    type="number"
                    step="any"
                    value={newAcct.balance ?? ''}
                    onChange={(e) => setNewAcct({ ...newAcct, balance: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-xs"
                  />
                </div>

                {['savings', 'investment', 'liability'].includes(newAcct.type || '') && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase">
                      Interest Rate (%)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      value={newAcct.interest_rate ?? ''}
                      onChange={(e) =>
                        setNewAcct({ ...newAcct, interest_rate: parseFloat(e.target.value) || 0 })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                )}

                {newAcct.type === 'liability' && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase">
                      Market Value ($)
                    </label>
                    <Input
                      type="number"
                      step="1000"
                      value={newAcct.market_value ?? ''}
                      onChange={(e) =>
                        setNewAcct({ ...newAcct, market_value: parseFloat(e.target.value) || 0 })
                      }
                      placeholder="e.g. House Estimated Value"
                      className="h-8 text-xs"
                    />
                  </div>
                )}
              </div>

              <Button type="submit" size="sm" className="mt-2">
                Save New Account
              </Button>
            </form>
          </CardContent>
        )}
      </Card>

      {/* Accounts Grouped by Type */}
      <div className="space-y-8">
        {ACCOUNT_TYPES.map((type) => {
          const typeAccounts = groupedAccounts[type];
          if (!typeAccounts || typeAccounts.length === 0) return null;

          return (
            <div key={type} className="space-y-4">
              <h3 className="text-sm font-bold border-b border-border pb-2">
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
    <Card className="relative group overflow-hidden transition-colors hover:border-primary/50">
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        title="Delete Account"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
      
      <CardHeader className="p-4 pb-2">
        <input
          type="text"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={commitName}
          className="text-sm font-bold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none w-[90%] pb-0.5 transition-colors"
        />
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">
          {account.id}
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-2 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-1/3 space-y-1">
            <label className="block text-[10px] font-bold text-muted-foreground uppercase">Owner</label>
            <select
              value={account.owner}
              onChange={(e) => onSave({ owner: e.target.value })}
              className="w-full px-2 py-1 h-7 text-xs font-semibold bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {ownerOptions.map((o) => (
                <option key={o} value={o}>
                  {o === 'Joint' ? 'Joint' : members.find((m) => m.id === o)?.name || o}
                </option>
              ))}
            </select>
          </div>
          <div className="w-2/3 space-y-1">
            <label className="block text-[10px] font-bold text-muted-foreground uppercase">Balance ($)</label>
            <input
              type="number"
              step="any"
              value={localBalance}
              onChange={(e) => setLocalBalance(e.target.value)}
              onBlur={commitBalance}
              className="w-full px-2 py-1 h-7 text-xs font-bold bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {['chequing', 'savings', 'investment'].includes(account.type) && (
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-muted-foreground uppercase">Target Floor ($)</label>
            <input
              type="number"
              step="any"
              value={localTargetFloor}
              onChange={(e) => setLocalTargetFloor(e.target.value)}
              onBlur={commitTargetFloor}
              placeholder="Min balance guard"
              className="w-full px-2 py-1 h-7 text-xs font-semibold bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}

        {account.type === 'liability' && (
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-muted-foreground uppercase">Market Value ($)</label>
            <input
              type="number"
              step="1000"
              value={localMarketValue}
              onChange={(e) => setLocalMarketValue(e.target.value)}
              onBlur={commitMarketValue}
              className="w-full px-2 py-1 h-7 text-xs font-semibold bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
