import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

import { NAV_SECTIONS } from '@/app/navigation';
import { usePlannerStore } from '@/store/usePlannerStore';

/* ── Context for external triggers ──────────────────────────── */

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  open: false,
  setOpen: () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  /* ⌘K / Ctrl+K listener */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      <CommandPaletteDialog open={open} onOpenChange={setOpen} />
    </CommandPaletteContext.Provider>
  );
}

/* ── Dialog ─────────────────────────────────────────────────── */

function CommandPaletteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { accounts, events } = usePlannerStore();

  const runAction = useCallback(
    (path: string) => {
      navigate(path);
      onOpenChange(false);
    },
    [navigate, onOpenChange]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Navigation */}
        {NAV_SECTIONS.map((section) => (
          <CommandGroup key={section.id} heading={section.label}>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.id}
                  onSelect={() => runAction(item.path)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        <CommandSeparator />

        {/* Quick access: Accounts */}
        {accounts.length > 0 && (
          <CommandGroup heading="Accounts">
            {accounts.map((a) => (
              <CommandItem
                key={a.id}
                onSelect={() => runAction('/planner/accounts')}
              >
                <span className="mr-2 text-xs text-muted-foreground uppercase">
                  {a.type}
                </span>
                <span>{a.name}</span>
                <CommandShortcut>
                  ${a.balance.toLocaleString()}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Quick access: Events (first 10) */}
        {events.length > 0 && (
          <CommandGroup heading="Events">
            {events.slice(0, 10).map((e) => (
              <CommandItem
                key={e.id}
                onSelect={() => runAction('/planner/events')}
              >
                <span className="mr-2 text-xs text-muted-foreground uppercase">
                  {e.event_type}
                </span>
                <span>{e.name}</span>
                {e.amount && (
                  <CommandShortcut>
                    ${e.amount.toLocaleString()}
                  </CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
