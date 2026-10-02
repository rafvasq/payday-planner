import React, { useState, useEffect } from 'react';
import { usePlannerStore } from '../store/usePlannerStore';
import { Event, EventType, Frequency, ExecutionType, WeekendShift } from '../core/models';
import { nextOccurrence, getBusinessDaysBetween } from '../core/calendar';
import { Plus, Trash2, Calendar, Filter, FileText, ChevronRight, TrendingUp, TrendingDown, ArrowRightLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

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
        className={cn(
          "px-4 py-3 font-bold text-[10px] uppercase tracking-wider cursor-pointer hover:bg-muted transition-colors select-none",
          sortColumn === col ? "text-foreground" : "text-muted-foreground"
        )}
        onClick={() => handleSort(col)}
      >
        <div className={cn("flex items-center gap-1", alignRight && "justify-end")}>
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
    setNewEvent({
      name: '',
      event_type: 'outflow',
      amount: 0,
      from_account_id: accounts[0]?.id || null,
      to_account_id: null,
      frequency: 'monthly',
      anchor_date: format(new Date(), 'yyyy-MM-dd'),
    });
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
    <div className="space-y-6">
      {/* Event Edit Drawer */}
      <Sheet open={!!selectedEventId} onOpenChange={(open) => !open && setSelectedEventId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedEvent && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    selectedEvent.event_type === 'inflow' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" :
                    selectedEvent.event_type === 'outflow' ? "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400" :
                    "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                  )}>
                    {selectedEvent.event_type === 'inflow' ? <TrendingUp className="w-5 h-5" /> :
                     selectedEvent.event_type === 'outflow' ? <TrendingDown className="w-5 h-5" /> :
                     <ArrowRightLeft className="w-5 h-5" />}
                  </div>
                  <div>
                    <SheetTitle>Edit Event</SheetTitle>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{selectedEvent.id}</p>
                  </div>
                </div>
              </SheetHeader>
              
              <EventDrawerForm 
                event={selectedEvent} 
                accounts={accounts} 
                onSave={(fields) => updateEvent(selectedEvent.id, fields)} 
                onDelete={() => {
                  deleteEvent(selectedEvent.id);
                  setSelectedEventId(null);
                }}
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Header & Add Event */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0 border-b border-border">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Financial Events</CardTitle>
          </div>
          <Button
            size="sm"
            onClick={() => setAddOpen(!addOpen)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {addOpen ? 'Cancel' : 'Add Event'}
          </Button>
        </CardHeader>

        {addOpen && (
          <CardContent className="pt-4 pb-0 border-b border-border">
            <form onSubmit={handleAddSubmit} className="space-y-4 mb-4">
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase">Event Name</label>
                  <Input
                    type="text"
                    required
                    value={newEvent.name || ''}
                    onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                    placeholder="e.g. Paycheque"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase">Event Type</label>
                  <select
                    value={newEvent.event_type}
                    onChange={(e) => handleTypeChange(e.target.value as EventType)}
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="inflow">INFLOW (+ Income)</option>
                    <option value="outflow">OUTFLOW (− Bill)</option>
                    <option value="transfer">TRANSFER</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase">Amount ($)</label>
                  <Input
                    type="number"
                    step="any"
                    required
                    value={newEvent.amount ?? ''}
                    onChange={(e) => setNewEvent({ ...newEvent, amount: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              
              <Button type="submit" size="sm">
                Create and Edit Details
              </Button>
            </form>
          </CardContent>
        )}

        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Filter Types:</span>
              {EVENT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTypeFilter(t)}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-semibold uppercase text-[10px] border transition-all",
                    filterType.includes(t) ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Status:</span>
              {(['All', 'Active', 'Inactive'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-semibold text-[10px] border transition-all",
                    filterStatus === st ? 'bg-foreground text-background border-foreground' : 'bg-muted text-muted-foreground border-border'
                  )}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events Grouped by Type */}
      <div className="space-y-8 pb-12">
        {EVENT_TYPES.map((type) => {
          const typeEvents = groupedEvents[type];
          if (!typeEvents || typeEvents.length === 0) return null;

          return (
            <div key={type} className="space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                {type === 'inflow' && <TrendingUp className="w-4 h-4 text-emerald-500" />}
                {type === 'outflow' && <TrendingDown className="w-4 h-4 text-rose-500" />}
                {type === 'transfer' && <ArrowRightLeft className="w-4 h-4 text-blue-500" />}
                {EVENT_TYPE_LABELS[type]}
                <span className="text-xs text-muted-foreground font-normal ml-2">({typeEvents.length})</span>
              </h3>
              
              <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      {renderSortableHeader('name', 'Name')}
                      {renderSortableHeader('amount', 'Amount', true)}
                      {renderSortableHeader('frequency', 'Frequency')}
                      {renderSortableHeader('anchor_date', 'Next Date')}
                      {renderSortableHeader('active', 'Status')}
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {typeEvents.map((evt) => (
                      <tr 
                        key={evt.id} 
                        onClick={() => setSelectedEventId(evt.id)}
                        className="hover:bg-muted/50 cursor-pointer transition-colors group"
                      >
                        <td className="px-4 py-3 font-bold flex items-center gap-2">
                          {evt.name}
                          {evt.notes && <span title={evt.notes}><FileText className="w-3 h-3 text-muted-foreground shrink-0" /></span>}
                        </td>
                        <td className="px-4 py-3 font-bold text-right">
                          <span className={cn(
                            evt.event_type === 'inflow' ? "text-emerald-600 dark:text-emerald-500" :
                            evt.event_type === 'outflow' ? "text-rose-600 dark:text-rose-500" : "text-blue-600 dark:text-blue-500"
                          )}>
                            ${evt.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-semibold">{evt.frequency}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-semibold">{evt._nextDate}</td>
                        <td className="px-4 py-3">
                          <Badge variant={evt.active ? "default" : "secondary"} className={evt.active ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 border-emerald-200 dark:border-emerald-800" : ""}>
                            {evt.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground group-hover:text-primary">
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

  // Calibration state
  const [calibrateOpen, setCalibrateOpen] = useState(false);
  const [calSent, setCalSent] = useState('');
  const [calLanded, setCalLanded] = useState('');

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
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Event Name</label>
          <Input
            type="text"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={commitName}
            className="font-bold"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Type</label>
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
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="inflow">INFLOW (+)</option>
              <option value="outflow">OUTFLOW (−)</option>
              <option value="transfer">TRANSFER (↔)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Amount ($)</label>
            <Input
              type="number"
              step="any"
              value={localAmount}
              onChange={(e) => setLocalAmount(e.target.value)}
              onBlur={commitAmount}
              className="font-bold"
            />
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* Routing Settings */}
      <div className="space-y-4">
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Routing</h4>
        {event.event_type !== 'inflow' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">From Account (Source)</label>
            <select
              value={event.from_account_id || ''}
              onChange={(e) => onSave({ from_account_id: e.target.value || null })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">-- Select Source --</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {event.event_type !== 'outflow' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">To Account (Destination)</label>
            <select
              value={event.to_account_id || ''}
              onChange={(e) => onSave({ to_account_id: e.target.value || null })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">-- Select Destination --</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <hr className="border-border" />

      {/* Schedule Settings */}
      <div className="space-y-4">
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Schedule & Execution</h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Frequency</label>
            <select
              value={event.frequency}
              onChange={(e) => onSave({ frequency: e.target.value as Frequency })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Anchor Date</label>
            <Input
              type="date"
              value={event.anchor_date}
              onChange={(e) => onSave({ anchor_date: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Execution Mode</label>
            <select
              value={event.execution || 'auto'}
              onChange={(e) => onSave({ execution: e.target.value as ExecutionType })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Weekend Shift</label>
            <select
              value={event.weekend_shift || 'none'}
              onChange={(e) => onSave({ weekend_shift: e.target.value as WeekendShift })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="none">None</option>
              <option value="previous_business_day">Prev Bus. Day</option>
              <option value="next_business_day">Next Bus. Day</option>
            </select>
          </div>
        </div>

        {event.event_type === 'transfer' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-primary">Clearing Delay (Business Days)</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="30"
                value={event.clearing_days ?? 0}
                onChange={(e) => onSave({ clearing_days: parseInt(e.target.value) || 0 })}
              />
              <Button variant="outline" size="sm" onClick={() => setCalibrateOpen(!calibrateOpen)}>Calibrate</Button>
            </div>
            {calibrateOpen && (
              <div className="p-3 mt-2 bg-muted rounded-md text-sm space-y-3">
                <p className="text-muted-foreground text-xs leading-tight">When did the transfer leave and land?</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Sent Date</label>
                    <Input type="date" className="h-8 text-xs" value={calSent} onChange={e => setCalSent(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground">Landed Date</label>
                    <Input type="date" className="h-8 text-xs" value={calLanded} onChange={e => setCalLanded(e.target.value)} />
                  </div>
                </div>
                {calSent && calLanded && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                    <span className="text-xs">Suggested: <strong>{getBusinessDaysBetween(calSent, calLanded)} days</strong></span>
                    <Button size="sm" className="h-7 text-xs" onClick={() => { 
                      onSave({ clearing_days: getBusinessDaysBetween(calSent, calLanded) }); 
                      setCalibrateOpen(false); 
                    }}>Apply</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <hr className="border-border" />

      {/* Meta */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Notes</label>
          <textarea
            rows={2}
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={commitNotes}
            placeholder="Add context or notes..."
            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
        </div>

        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border">
          <div>
            <p className="text-sm font-bold">Event Status</p>
            <p className="text-xs text-muted-foreground">Enable or disable this event temporarily.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={event.active} 
              onChange={(e) => onSave({ active: e.target.checked })}
            />
            <div className="w-9 h-5 bg-muted-foreground/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <Button
          variant="destructive"
          onClick={onDelete}
          className="w-full mt-6"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Event
        </Button>
      </div>
    </div>
  );
};
