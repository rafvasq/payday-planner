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
import { useSettingsStore } from '@/store/useSettingsStore';
import { useChatOptional } from '@/context/ChatContext';
import { Bot } from 'lucide-react';

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
  const chat = useChatOptional();
  const setShowContextGlance = useSettingsStore((s) => s.setShowContextGlance);

  const runCopilot = useCallback(
    (prompt?: string, showGlance?: boolean) => {
      if (!chat) return;
      if (prompt) chat.setInput(prompt);
      if (showGlance) setShowContextGlance?.(true);
      // On the full-page chat the panel is already visible; otherwise open the floating window.
      if (!window.location.pathname.startsWith('/intelligence/chat')) chat.setIsOpen(true);
      onOpenChange(false);
    },
    [chat, setShowContextGlance, onOpenChange]
  );

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

        {chat && (
          <CommandGroup heading="AI Copilot">
            <CommandItem onSelect={() => runCopilot()}>
              <Bot className="mr-2 h-4 w-4" />
              <span>Open AI Copilot</span>
              <CommandShortcut>⌘J</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCopilot('Simulate the next 30 days and tell me if I breach my target floor.')
              }
            >
              <Bot className="mr-2 h-4 w-4" />
              <span>Simulate 30-Day Cashflow</span>
            </CommandItem>
            <CommandItem
              onSelect={() =>
                runCopilot(
                  'Inspect my account target floors and tell me which accounts are at risk.',
                  true
                )
              }
            >
              <Bot className="mr-2 h-4 w-4" />
              <span>Inspect Account Floors</span>
              <CommandShortcut>⌥G</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Quick access: Accounts */}
        {accounts.length > 0 && (
          <CommandGroup heading="Accounts">
            {accounts.map((a) => (
              <CommandItem
                key={a.id}
                onSelect={() => runAction('/planner/accounts')}
                className="cursor-pointer"
              >
                <span className="mr-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground uppercase font-semibold">
                  {a.type}
                </span>
                <span className="font-medium text-xs">{a.name}</span>
                <CommandShortcut className="font-mono font-semibold tabular-nums text-foreground/80">
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
                className="cursor-pointer"
              >
                <span className="mr-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground uppercase font-semibold">
                  {e.event_type}
                </span>
                <span className="font-medium text-xs">{e.name}</span>
                {e.amount && (
                  <CommandShortcut className="font-mono font-semibold tabular-nums text-foreground/80">
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
