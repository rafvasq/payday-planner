import React, { useState } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import {
  Event,
  EventType,
  Frequency,
  ExecutionType,
  WeekendShift,
} from '../core/models';
import { Plus, Trash2, Save, Calendar, Filter, FileText } from 'lucide-react';
import { format } from 'date-fns';

const EVENT_TYPES: EventType[] = ['inflow', 'outflow', 'transfer'];
const FREQUENCIES: Frequency[] = [
  'one-time',
  'weekly',
  'biweekly',
  'biweekly-offset',
  'semi-monthly',
  'monthly',
  'quarterly',
  'annual',
];
const EXECUTION_TYPES: ExecutionType[] = ['auto', 'manual'];
const WEEKEND_SHIFTS: WeekendShift[] = [
  'none',
  'previous_business_day',
  'next_business_day',
];

export const EventsManager: React.FC = () => {
  const { events, accounts, addEvent, updateEvent, deleteEvent } = usePlannerStore();

  const [addOpen, setAddOpen] = useState(false);
  const [filterType, setFilterType] = useState<EventType[]>(['inflow', 'outflow', 'transfer']);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive'>('All');

  const [newEvent, setNewEvent] = useState<Partial<Event>>({
    name: '',
    event_type: 'inflow',
    amount: 0,
    from_account_id: null,
    to_account_id: accounts[0]?.id || null,
    frequency: 'biweekly',
    anchor_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
    active: true,
    execution: 'auto',
    weekend_shift: 'none',
    clearing_days: 0,
  });

  const filteredEvents = events.filter((e) => {
    if (!filterType.includes(e.event_type)) return false;
    if (filterStatus === 'Active' && !e.active) return false;
    if (filterStatus === 'Inactive' && e.active) return false;
    return true;
  });

  const handleTypeChange = (type: EventType) => {
    setNewEvent((prev) => ({
      ...prev,
      event_type: type,
      from_account_id: type === 'inflow' ? null : prev.from_account_id || accounts[0]?.id || null,
      to_account_id: type === 'outflow' ? null : prev.to_account_id || accounts[0]?.id || null,
    }));
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.name) return;

    const fullEvent: Event = {
      id: 'e_' + Math.random().toString(36).substring(2, 8),
      name: newEvent.name,
      event_type: (newEvent.event_type as EventType) || 'inflow',
      amount: Number(newEvent.amount) || 0,
      from_account_id: newEvent.event_type === 'inflow' ? null : newEvent.from_account_id || null,
      to_account_id: newEvent.event_type === 'outflow' ? null : newEvent.to_account_id || null,
      frequency: (newEvent.frequency as Frequency) || 'biweekly',
      anchor_date: newEvent.anchor_date || format(new Date(), 'yyyy-MM-dd'),
      end_date: newEvent.end_date || null,
      notes: newEvent.notes || '',
      active: newEvent.active ?? true,
      execution: (newEvent.execution as ExecutionType) || 'auto',
      weekend_shift: (newEvent.weekend_shift as WeekendShift) || 'none',
      clearing_days: Number(newEvent.clearing_days) || 0,
    };

    addEvent(fullEvent);
    setNewEvent({
      name: '',
      event_type: 'inflow',
      amount: 0,
      from_account_id: null,
      to_account_id: accounts[0]?.id || null,
      frequency: 'biweekly',
      anchor_date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
      active: true,
      execution: 'auto',
      weekend_shift: 'none',
      clearing_days: 0,
    });
    setAddOpen(false);
  };

  const toggleTypeFilter = (t: EventType) => {
    if (filterType.includes(t)) {
      if (filterType.length > 1) {
        setFilterType(filterType.filter((x) => x !== t));
      }
    } else {
      setFilterType([...filterType, t]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Add Event */}
      <div className="bg-white border border-ink-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-500" />
            <h2 className="text-base font-bold text-ink-900">Financial Events</h2>
          </div>
          <button
            onClick={() => setAddOpen(!addOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{addOpen ? 'Cancel' : 'Add Event'}</span>
          </button>
        </div>

        {/* Add Form */}
        {addOpen && (
          <form onSubmit={handleAddSubmit} className="mt-4 pt-4 border-t border-ink-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                  Event Name
                </label>
                <input
                  type="text"
                  required
                  value={newEvent.name || ''}
                  onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                  placeholder="e.g. Paycheque or Joint Bills Sweep"
                  className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                  Event Type
                </label>
                <select
                  value={newEvent.event_type}
                  onChange={(e) => handleTypeChange(e.target.value as EventType)}
                  className="w-full px-3 py-1.5 text-xs font-bold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  <option value="inflow">INFLOW (+ Income / Money In)</option>
                  <option value="outflow">OUTFLOW (− Bill / Expense / Money Out)</option>
                  <option value="transfer">TRANSFER (Between Accounts)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                  Amount ($)
                </label>
                <input
                  type="number"
                  step="10"
                  value={newEvent.amount ?? 0}
                  onChange={(e) => setNewEvent({ ...newEvent, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {newEvent.event_type !== 'inflow' && (
                <div>
                  <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                    From Account (Source)
                  </label>
                  <select
                    value={newEvent.from_account_id || ''}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, from_account_id: e.target.value || null })
                    }
                    className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newEvent.event_type !== 'outflow' && (
                <div>
                  <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                    To Account (Destination)
                  </label>
                  <select
                    value={newEvent.to_account_id || ''}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, to_account_id: e.target.value || null })
                    }
                    className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                  Frequency
                </label>
                <select
                  value={newEvent.frequency}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, frequency: e.target.value as Frequency })
                  }
                  className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                  Anchor Date
                </label>
                <input
                  type="date"
                  value={newEvent.anchor_date || ''}
                  onChange={(e) => setNewEvent({ ...newEvent, anchor_date: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {newEvent.event_type === 'transfer' && (
                <div>
                  <label className="block text-[11px] font-bold text-brand-600 uppercase mb-1">
                    Clearing Delay (Bus. Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={newEvent.clearing_days ?? 0}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, clearing_days: parseInt(e.target.value) || 0 })
                    }
                    placeholder="e.g. 3"
                    className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-brand-300 rounded-lg focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">
                Notes / Explanation
              </label>
              <input
                type="text"
                value={newEvent.notes || ''}
                onChange={(e) => setNewEvent({ ...newEvent, notes: e.target.value })}
                placeholder="e.g. Includes groceries, utilities, and annualized insurance"
                className="w-full px-3 py-1.5 text-xs bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-all shadow-xs"
            >
              Save New Event
            </button>
          </form>
        )}

        {/* Filters */}
        <div className="mt-4 pt-4 border-t border-ink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-ink-400" />
            <span className="font-bold text-ink-400 uppercase tracking-wider text-[10px]">
              Filter Types:
            </span>
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => toggleTypeFilter(t)}
                className={`px-2.5 py-1 rounded-md font-semibold uppercase text-[10px] border transition-all ${
                  filterType.includes(t)
                    ? 'bg-brand-50 text-brand-700 border-brand-200'
                    : 'bg-ink-100 text-ink-400 border-ink-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-bold text-ink-400 uppercase tracking-wider text-[10px]">
              Status:
            </span>
            {(['All', 'Active', 'Inactive'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 rounded-md font-semibold text-[10px] border transition-all ${
                  filterStatus === st
                    ? 'bg-ink-900 text-white border-ink-900'
                    : 'bg-ink-100 text-ink-500 border-ink-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Events List */}
        <div className="mt-4 space-y-3">
          {filteredEvents.map((evt) => (
            <EventEditCard
              key={evt.id}
              event={evt}
              accounts={accounts}
              onSave={(updated) => updateEvent(evt.id, updated)}
              onDelete={() => deleteEvent(evt.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface EventEditCardProps {
  event: Event;
  accounts: { id: string; name: string }[];
  onSave: (updated: Partial<Event>) => void;
  onDelete: () => void;
}

const EventEditCard: React.FC<EventEditCardProps> = ({
  event,
  accounts,
  onSave,
  onDelete,
}) => {
  const [data, setData] = useState<Event>(event);
  const [dirty, setDirty] = useState(false);

  const update = (fields: Partial<Event>) => {
    setData((prev) => {
      const next = { ...prev, ...fields };
      if (fields.event_type === 'inflow') next.from_account_id = null;
      if (fields.event_type === 'outflow') next.to_account_id = null;
      return next;
    });
    setDirty(true);
  };

  const handleSave = () => {
    onSave(data);
    setDirty(false);
  };

  let typeBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
  if (data.event_type === 'inflow') typeBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (data.event_type === 'outflow') typeBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200';

  return (
    <details className="border border-ink-200 rounded-lg bg-white overflow-hidden group">
      <summary className="px-4 py-3 font-semibold text-xs text-ink-900 flex items-center justify-between cursor-pointer select-none bg-white hover:bg-ink-100/50 transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${typeBadgeClass}`}>
            {data.event_type}
          </span>
          <span className="font-bold shrink-0">{data.name}</span>
          <span className="text-ink-400 shrink-0">· {data.frequency}</span>
          {data.clearing_days && data.clearing_days > 0 ? (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-brand-100 text-brand-800 shrink-0">
              +{data.clearing_days}b delay
            </span>
          ) : null}
          {data.notes && (
            <span className="text-xs text-ink-500 font-normal italic truncate max-w-xs flex items-center gap-1">
              <FileText className="w-3 h-3 shrink-0 text-ink-400" />
              <span>{data.notes}</span>
            </span>
          )}
          {!data.active && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
              Inactive
            </span>
          )}
        </div>
        <span className="font-bold text-sm text-ink-900 shrink-0 ml-2">
          ${data.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
      </summary>

      <div className="p-4 border-t border-ink-200/60 bg-ink-100/30 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              Event Name
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
              value={data.event_type}
              onChange={(e) => update({ event_type: e.target.value as EventType })}
              className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-ink-200 rounded-md"
            >
              <option value="inflow">INFLOW (+ Income)</option>
              <option value="outflow">OUTFLOW (− Bill)</option>
              <option value="transfer">TRANSFER (Between Accounts)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              Amount ($)
            </label>
            <input
              type="number"
              step="10"
              value={data.amount}
              onChange={(e) => update({ amount: parseFloat(e.target.value) || 0 })}
              className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-ink-200 rounded-md"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              Frequency
            </label>
            <select
              value={data.frequency}
              onChange={(e) => update({ frequency: e.target.value as Frequency })}
              className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-ink-200 rounded-md"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {data.event_type !== 'inflow' && (
            <div>
              <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
                From Account (Source)
              </label>
              <select
                value={data.from_account_id || ''}
                onChange={(e) => update({ from_account_id: e.target.value || null })}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-md"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {data.event_type !== 'outflow' && (
            <div>
              <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
                To Account (Destination)
              </label>
              <select
                value={data.to_account_id || ''}
                onChange={(e) => update({ to_account_id: e.target.value || null })}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-md"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              Anchor Date
            </label>
            <input
              type="date"
              value={data.anchor_date}
              onChange={(e) => update({ anchor_date: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-md"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              End Date
            </label>
            <input
              type="date"
              value={data.end_date || ''}
              onChange={(e) => update({ end_date: e.target.value ? e.target.value : null })}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-md"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
            Notes / Explanation
          </label>
          <input
            type="text"
            value={data.notes || ''}
            onChange={(e) => update({ notes: e.target.value })}
            placeholder="e.g. Includes groceries, utilities, and annualized insurance"
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-md"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              Execution Mode
            </label>
            <select
              value={data.execution || 'auto'}
              onChange={(e) => update({ execution: e.target.value as ExecutionType })}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-md"
            >
              <option value="auto">auto (bank moves it)</option>
              <option value="manual">manual (you transfer it)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">
              Weekend Shift
            </label>
            <select
              value={data.weekend_shift || 'none'}
              onChange={(e) => update({ weekend_shift: e.target.value as WeekendShift })}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-ink-200 rounded-md"
            >
              <option value="none">none</option>
              <option value="previous_business_day">previous business day</option>
              <option value="next_business_day">next business day</option>
            </select>
          </div>

          {data.event_type === 'transfer' && (
            <div>
              <label className="block text-[10px] font-bold text-brand-600 uppercase mb-1">
                Clearing Delay (Bus. Days)
              </label>
              <input
                type="number"
                min="0"
                max="30"
                value={data.clearing_days ?? 0}
                onChange={(e) => update({ clearing_days: parseInt(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-brand-300 rounded-md focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          <div className="flex items-center gap-2 pt-4">
            <input
              type="checkbox"
              id={`active_${data.id}`}
              checked={data.active}
              onChange={(e) => update({ active: e.target.checked })}
              className="rounded text-brand-500 focus:ring-brand-500"
            />
            <label htmlFor={`active_${data.id}`} className="text-xs font-semibold text-ink-900 select-none">
              Active Event
            </label>
          </div>
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
