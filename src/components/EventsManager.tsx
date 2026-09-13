import React, { useState, useEffect } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { Event, EventType, Frequency, ExecutionType, WeekendShift } from '../core/models';
import { nextOccurrence } from '../core/calendar';
import { Plus, Trash2, Calendar, Filter, FileText, X, ChevronRight, TrendingUp, TrendingDown, ArrowRightLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';

const EVENT_TYPES: EventType[] = ['inflow', 'outflow', 'transfer'];
const EVENT_TYPE_LABELS: Record<EventType, string> = {
  inflow: 'Incomes & Inflows',
  outflow: 'Bills & Outflows',
  transfer: 'Transfers',
};

const FREQUENCIES: Frequency[] = [
  'one-time', 'weekly', 'biweekly', 'biweekly-offset', 'semi-monthly', 'monthly', 'quarterly', 'annual'
];

type SortColumn = 'name' | 'amount' | 'frequency' | 'anchor_date' | 'active';
type SortDirection = 'asc' | 'desc';

export const EventsManager: React.FC = () => {
  const { events, accounts, addEvent, updateEvent, deleteEvent } = usePlannerStore();

  const [addOpen, setAddOpen] = useState(false);
  const [filterType, setFilterType] = useState<EventType[]>(['inflow', 'outflow', 'transfer']);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive'>('All');
  
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [newEvent, setNewEvent] = useState<Partial<Event>>({
    name: '',
    event_type: 'outflow',
    amount: 0,
    from_account_id: accounts[0]?.id || null,
    to_account_id: null,
    frequency: 'monthly',
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

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const eventsWithNextDate = filteredEvents.map(e => ({
    ...e,
    _nextDate: nextOccurrence(e, todayStr) || 'N/A'
  }));

  const groupedEvents = EVENT_TYPES.reduce((acc, type) => {
    const sorted = [...eventsWithNextDate.filter((e) => e.event_type === type)];
    
    sorted.sort((a, b) => {
      let valA: any = a[sortColumn];
      let valB: any = b[sortColumn];
      
      if (sortColumn === 'name') {
        valA = (valA as string).toLowerCase();
        valB = (valB as string).toLowerCase();
      } else if (sortColumn === 'anchor_date') {
        valA = a._nextDate;
        valB = b._nextDate;
      }
      
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    acc[type] = sorted;
    return acc;
  }, {} as Record<EventType, typeof eventsWithNextDate[0][]>);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const renderSortableHeader = (col: SortColumn, label: string, alignRight = false) => {
    return (
      <th 
        className={clsx(
          "px-4 py-3 font-bold text-[10px] uppercase tracking-wider cursor-pointer hover:bg-ink-100 transition-colors select-none",
          sortColumn === col ? "text-ink-900" : "text-ink-500"
        )}
        onClick={() => handleSort(col)}
      >
        <div className={clsx("flex items-center gap-1", alignRight && "justify-end")}>
          {label}
          {sortColumn === col && (
            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
          )}
        </div>
      </th>
    );
  };

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
      event_type: (newEvent.event_type as EventType) || 'outflow',
      amount: Number(newEvent.amount) || 0,
      from_account_id: newEvent.event_type === 'inflow' ? null : newEvent.from_account_id || null,
      to_account_id: newEvent.event_type === 'outflow' ? null : newEvent.to_account_id || null,
      frequency: (newEvent.frequency as Frequency) || 'monthly',
      anchor_date: newEvent.anchor_date || format(new Date(), 'yyyy-MM-dd'),
      end_date: newEvent.end_date || null,
      notes: newEvent.notes || '',
      active: newEvent.active ?? true,
      execution: (newEvent.execution as ExecutionType) || 'auto',
      weekend_shift: (newEvent.weekend_shift as WeekendShift) || 'none',
      clearing_days: Number(newEvent.clearing_days) || 0,
    };

    addEvent(fullEvent);
    setAddOpen(false);
    setSelectedEventId(fullEvent.id); // Open drawer immediately
  };

  const toggleTypeFilter = (t: EventType) => {
    if (filterType.includes(t)) {
      if (filterType.length > 1) setFilterType(filterType.filter((x) => x !== t));
    } else {
      setFilterType([...filterType, t]);
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  return (
    <div className="space-y-6 relative">
      {/* Drawer Overlay */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink-900/40 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-ink-200 flex items-center justify-between bg-ink-50">
              <div className="flex items-center gap-2">
                <div className={clsx(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  selectedEvent.event_type === 'inflow' ? "bg-emerald-100 text-emerald-600" :
                  selectedEvent.event_type === 'outflow' ? "bg-rose-100 text-rose-600" :
                  "bg-blue-100 text-blue-600"
                )}>
                  {selectedEvent.event_type === 'inflow' ? <TrendingUp className="w-5 h-5" /> :
                   selectedEvent.event_type === 'outflow' ? <TrendingDown className="w-5 h-5" /> :
                   <ArrowRightLeft className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-ink-900 leading-tight">Edit Event</h3>
                  <p className="text-[10px] font-bold text-ink-400 uppercase tracking-wide">{selectedEvent.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedEventId(null)} 
                className="p-2 bg-white rounded-full border border-ink-200 shadow-xs hover:bg-ink-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <EventDrawerForm 
                event={selectedEvent} 
                accounts={accounts} 
                onSave={(fields) => updateEvent(selectedEvent.id, fields)} 
                onDelete={() => {
                  deleteEvent(selectedEvent.id);
                  setSelectedEventId(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

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
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">Event Name</label>
                <input
                  type="text"
                  required
                  value={newEvent.name || ''}
                  onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                  placeholder="e.g. Paycheque"
                  className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">Event Type</label>
                <select
                  value={newEvent.event_type}
                  onChange={(e) => handleTypeChange(e.target.value as EventType)}
                  className="w-full px-3 py-1.5 text-xs font-bold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                >
                  <option value="inflow">INFLOW (+ Income)</option>
                  <option value="outflow">OUTFLOW (− Bill)</option>
                  <option value="transfer">TRANSFER</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-ink-400 uppercase mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={newEvent.amount ?? ''}
                  onChange={(e) => setNewEvent({ ...newEvent, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-1.5 text-xs font-semibold text-ink-900 bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            
            <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-all shadow-xs">
              Create and Edit Details
            </button>
          </form>
        )}

        {/* Filters */}
        <div className="mt-4 pt-4 border-t border-ink-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-ink-400" />
            <span className="font-bold text-ink-400 uppercase tracking-wider text-[10px]">Filter Types:</span>
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => toggleTypeFilter(t)}
                className={clsx(
                  "px-2.5 py-1 rounded-md font-semibold uppercase text-[10px] border transition-all",
                  filterType.includes(t) ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-ink-100 text-ink-400 border-ink-200'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-bold text-ink-400 uppercase tracking-wider text-[10px]">Status:</span>
            {(['All', 'Active', 'Inactive'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={clsx(
                  "px-2.5 py-1 rounded-md font-semibold text-[10px] border transition-all",
                  filterStatus === st ? 'bg-ink-900 text-white border-ink-900' : 'bg-ink-100 text-ink-500 border-ink-200'
                )}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events Grouped by Type */}
      <div className="space-y-8 pb-12">
        {EVENT_TYPES.map((type) => {
          const typeEvents = groupedEvents[type];
          if (!typeEvents || typeEvents.length === 0) return null;

          return (
            <div key={type} className="space-y-3">
              <h3 className="text-sm font-bold text-ink-900 flex items-center gap-2">
                {type === 'inflow' && <TrendingUp className="w-4 h-4 text-emerald-500" />}
                {type === 'outflow' && <TrendingDown className="w-4 h-4 text-rose-500" />}
                {type === 'transfer' && <ArrowRightLeft className="w-4 h-4 text-blue-500" />}
                {EVENT_TYPE_LABELS[type]}
                <span className="text-xs text-ink-400 font-normal ml-2">({typeEvents.length})</span>
              </h3>
              
              <div className="bg-white border border-ink-200 rounded-xl shadow-xs overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-ink-50 border-b border-ink-200">
                    <tr>
                      {renderSortableHeader('name', 'Name')}
                      {renderSortableHeader('amount', 'Amount', true)}
                      {renderSortableHeader('frequency', 'Frequency')}
                      {renderSortableHeader('anchor_date', 'Next Date')}
                      {renderSortableHeader('active', 'Status')}
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {typeEvents.map((evt) => (
                      <tr 
                        key={evt.id} 
                        onClick={() => setSelectedEventId(evt.id)}
                        className="hover:bg-brand-50/50 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-3 font-bold text-ink-900 flex items-center gap-2">
                          {evt.name}
                          {evt.notes && <span title={evt.notes}><FileText className="w-3 h-3 text-brand-400 shrink-0" /></span>}
                        </td>
                        <td className="px-4 py-3 font-bold text-right">
                          <span className={clsx(
                            evt.event_type === 'inflow' ? "text-emerald-600" :
                            evt.event_type === 'outflow' ? "text-rose-600" : "text-blue-600"
                          )}>
                            ${evt.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-500 font-semibold">{evt.frequency}</td>
                        <td className="px-4 py-3 text-xs text-ink-500 font-semibold">{evt._nextDate}</td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            evt.active ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                          )}>
                            {evt.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-ink-300 group-hover:text-brand-500">
                          <ChevronRight className="w-4 h-4 ml-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- DRAWER FORM COMPONENT ---

interface EventDrawerFormProps {
  event: Event;
  accounts: { id: string; name: string }[];
  onSave: (fields: Partial<Event>) => void;
  onDelete: () => void;
}

const EventDrawerForm: React.FC<EventDrawerFormProps> = ({ event, accounts, onSave, onDelete }) => {
  // Local state for auto-save text inputs
  const [localName, setLocalName] = useState(event.name);
  const [localAmount, setLocalAmount] = useState(event.amount.toString());
  const [localNotes, setLocalNotes] = useState(event.notes || '');

  useEffect(() => {
    setLocalName(event.name);
    setLocalAmount(event.amount.toString());
    setLocalNotes(event.notes || '');
  }, [event]);

  const commitName = () => { if (localName !== event.name) onSave({ name: localName }); };
  const commitAmount = () => {
    const val = parseFloat(localAmount);
    if (!isNaN(val) && val !== event.amount) onSave({ amount: val });
  };
  const commitNotes = () => { if (localNotes !== event.notes) onSave({ notes: localNotes }); };

  return (
    <div className="space-y-6">
      {/* Basic Settings */}
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">Event Name</label>
          <input
            type="text"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={commitName}
            className="w-full px-3 py-2 text-sm font-bold text-ink-900 bg-ink-50 border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>

        <div className="flex gap-4">
          <div className="w-1/2">
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">Type</label>
            <select
              value={event.event_type}
              onChange={(e) => {
                const type = e.target.value as EventType;
                onSave({ 
                  event_type: type,
                  from_account_id: type === 'inflow' ? null : event.from_account_id,
                  to_account_id: type === 'outflow' ? null : event.to_account_id,
                });
              }}
              className="w-full px-3 py-2 text-sm font-bold bg-ink-50 border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="inflow">INFLOW (+)</option>
              <option value="outflow">OUTFLOW (−)</option>
              <option value="transfer">TRANSFER (↔)</option>
            </select>
          </div>
          <div className="w-1/2">
            <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">Amount ($)</label>
            <input
              type="number"
              step="any"
              value={localAmount}
              onChange={(e) => setLocalAmount(e.target.value)}
              onBlur={commitAmount}
              className="w-full px-3 py-2 text-sm font-bold text-ink-900 bg-ink-50 border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        </div>
      </div>

      <hr className="border-ink-200" />

      {/* Routing Settings */}
      <div className="space-y-4">
        <h4 className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">Routing</h4>
        {event.event_type !== 'inflow' && (
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1">From Account (Source)</label>
            <select
              value={event.from_account_id || ''}
              onChange={(e) => onSave({ from_account_id: e.target.value || null })}
              className="w-full px-3 py-2 text-sm bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="">-- Select Source --</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {event.event_type !== 'outflow' && (
          <div>
            <label className="block text-xs font-semibold text-ink-600 mb-1">To Account (Destination)</label>
            <select
              value={event.to_account_id || ''}
              onChange={(e) => onSave({ to_account_id: e.target.value || null })}
              className="w-full px-3 py-2 text-sm bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="">-- Select Destination --</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <hr className="border-ink-200" />

      {/* Schedule Settings */}
      <div className="space-y-4">
        <h4 className="text-[11px] font-bold text-ink-400 uppercase tracking-wider">Schedule & Execution</h4>
        
        <div className="flex gap-4">
          <div className="w-1/2">
            <label className="block text-xs font-semibold text-ink-600 mb-1">Frequency</label>
            <select
              value={event.frequency}
              onChange={(e) => onSave({ frequency: e.target.value as Frequency })}
              className="w-full px-3 py-2 text-sm bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            >
              {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="w-1/2">
            <label className="block text-xs font-semibold text-ink-600 mb-1">Anchor Date</label>
            <input
              type="date"
              value={event.anchor_date}
              onChange={(e) => onSave({ anchor_date: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-1/2">
            <label className="block text-xs font-semibold text-ink-600 mb-1">Execution Mode</label>
            <select
              value={event.execution || 'auto'}
              onChange={(e) => onSave({ execution: e.target.value as ExecutionType })}
              className="w-full px-3 py-2 text-sm bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div className="w-1/2">
            <label className="block text-xs font-semibold text-ink-600 mb-1">Weekend Shift</label>
            <select
              value={event.weekend_shift || 'none'}
              onChange={(e) => onSave({ weekend_shift: e.target.value as WeekendShift })}
              className="w-full px-3 py-2 text-sm bg-white border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="none">None</option>
              <option value="previous_business_day">Prev Bus. Day</option>
              <option value="next_business_day">Next Bus. Day</option>
            </select>
          </div>
        </div>

        {event.event_type === 'transfer' && (
          <div>
            <label className="block text-xs font-semibold text-brand-600 mb-1">Clearing Delay (Business Days)</label>
            <input
              type="number"
              min="0"
              max="30"
              value={event.clearing_days ?? 0}
              onChange={(e) => onSave({ clearing_days: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm bg-white border border-brand-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        )}
      </div>

      <hr className="border-ink-200" />

      {/* Meta */}
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-ink-400 uppercase mb-1">Notes</label>
          <textarea
            rows={2}
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={commitNotes}
            placeholder="Add context or notes..."
            className="w-full px-3 py-2 text-sm bg-ink-50 border border-ink-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none resize-none"
          />
        </div>

        <div className="flex items-center justify-between p-4 bg-ink-50 rounded-lg border border-ink-200">
          <div>
            <p className="text-sm font-bold text-ink-900">Event Status</p>
            <p className="text-xs text-ink-500">Enable or disable this event temporarily.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={event.active} 
              onChange={(e) => onSave({ active: e.target.checked })}
            />
            <div className="w-9 h-5 bg-ink-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors mt-6"
        >
          <Trash2 className="w-4 h-4" />
          Delete Event
        </button>
      </div>
    </div>
  );
};
